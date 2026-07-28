[CmdletBinding()]
param(
  [string]$EdgePath,
  [int]$ServerPort = 0,
  [int]$DebugPort = 0,
  [switch]$KeepArtifacts
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

try {
  $utf8 = [Text.UTF8Encoding]::new($false)
  [Console]::OutputEncoding = $utf8
  $OutputEncoding = $utf8
} catch {
  # Host may not expose a console; keep going.
}

if ($PSVersionTable.PSVersion.Major -lt 7) {
  throw 'Web 验收脚本需要 PowerShell 7 或更高版本。'
}

$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$lanServerPath = Join-Path $projectRoot 'lan-server.js'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  throw '找不到 Node.js。请先安装 Node.js 18 或更高版本。'
}

function Get-FreeTcpPort {
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return ([Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

function Resolve-EdgePath {
  param([string]$RequestedPath)

  if ($RequestedPath) {
    $resolved = [IO.Path]::GetFullPath($RequestedPath)
    if (-not [IO.File]::Exists($resolved)) {
      throw "找不到 Edge：$resolved"
    }
    return $resolved
  }

  $command = Get-Command msedge -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
  ) | Where-Object { $_ -and [IO.File]::Exists($_) }

  if (-not $candidates) {
    throw '找不到 Microsoft Edge。可通过 -EdgePath 指定 msedge.exe。'
  }
  return [IO.Path]::GetFullPath(@($candidates)[0])
}

function Wait-JsonEndpoint {
  param(
    [Parameter(Mandatory)] [string]$Uri,
    [int]$TimeoutSeconds = 10
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    try {
      return Invoke-RestMethod -Uri $Uri -TimeoutSec 1
    } catch {
      Start-Sleep -Milliseconds 100
    }
  } while ([DateTime]::UtcNow -lt $deadline)

  throw "等待端点超时：$Uri"
}

$script:cdpSocket = $null
$script:cdpNextId = 0
$script:cdpEvents = [Collections.Generic.List[object]]::new()
$script:passCount = 0

function Receive-CdpMessage {
  param([int]$TimeoutSeconds = 10)

  $stream = [IO.MemoryStream]::new()
  $buffer = [byte[]]::new(65536)
  try {
    do {
      $segment = [ArraySegment[byte]]::new($buffer)
      $cancellation = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds($TimeoutSeconds))
      try {
        $result = $script:cdpSocket.ReceiveAsync($segment, $cancellation.Token).GetAwaiter().GetResult()
      } finally {
        $cancellation.Dispose()
      }
      if ($result.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close) {
        throw 'Edge 已关闭 CDP 连接。'
      }
      $stream.Write($buffer, 0, $result.Count)
    } while (-not $result.EndOfMessage)

    $json = [Text.Encoding]::UTF8.GetString($stream.ToArray())
    return $json | ConvertFrom-Json -Depth 100
  } finally {
    $stream.Dispose()
  }
}

function Send-CdpMessage {
  param(
    [Parameter(Mandatory)] [string]$Method,
    [hashtable]$Params = @{}
  )

  $script:cdpNextId += 1
  $requestId = $script:cdpNextId
  $payload = @{
    id = $requestId
    method = $Method
    params = $Params
  } | ConvertTo-Json -Compress -Depth 30
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $segment = [ArraySegment[byte]]::new($bytes)
  $null = $script:cdpSocket.SendAsync(
    $segment,
    [Net.WebSockets.WebSocketMessageType]::Text,
    $true,
    [Threading.CancellationToken]::None
  ).GetAwaiter().GetResult()

  while ($true) {
    $message = Receive-CdpMessage
    $messageId = if ($message.PSObject.Properties['id']) { $message.id } else { $null }
    if ($null -ne $messageId -and [int]$messageId -eq $requestId) {
      if ($message.PSObject.Properties['error'] -and $message.error) {
        throw "CDP $Method 失败：$($message.error.message)"
      }
      return $message.result
    }
    $script:cdpEvents.Add($message)
  }
}

function Wait-CdpEvent {
  param(
    [Parameter(Mandatory)] [string]$Method,
    [int]$TimeoutSeconds = 10
  )

  for ($index = 0; $index -lt $script:cdpEvents.Count; $index += 1) {
    if ($script:cdpEvents[$index].method -eq $Method) {
      $event = $script:cdpEvents[$index]
      $script:cdpEvents.RemoveAt($index)
      return $event
    }
  }

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    $remaining = [Math]::Max(1, [Math]::Ceiling(($deadline - [DateTime]::UtcNow).TotalSeconds))
    $message = Receive-CdpMessage -TimeoutSeconds $remaining
    if ($message.method -eq $Method) {
      return $message
    }
    $script:cdpEvents.Add($message)
  }
  throw "等待 CDP 事件超时：$Method"
}

function Invoke-JavaScript {
  param([Parameter(Mandatory)] [string]$Expression)

  $response = Send-CdpMessage -Method 'Runtime.evaluate' -Params @{
    expression = $Expression
    returnByValue = $true
    awaitPromise = $true
  }
  if ($response.PSObject.Properties['exceptionDetails'] -and $response.exceptionDetails) {
    $details = $response.exceptionDetails
    $description = if (
      $details.PSObject.Properties['exception'] -and
      $details.exception.PSObject.Properties['description']
    ) { $details.exception.description } else { $details.text }
    throw "页面脚本执行失败：$description"
  }
  return $response.result.value
}

function Assert-Verification {
  param(
    [Parameter(Mandatory)] [bool]$Condition,
    [Parameter(Mandatory)] [string]$Message
  )

  if (-not $Condition) {
    throw "验收失败：$Message"
  }
  $script:passCount += 1
  Write-Host "  通过 · $Message" -ForegroundColor Green
}

function Set-EmulatedViewport {
  param(
    [Parameter(Mandatory)] [int]$Width,
    [int]$Height = 844
  )

  Send-CdpMessage -Method 'Emulation.setDeviceMetricsOverride' -Params @{
    width = $Width
    height = $Height
    deviceScaleFactor = 1
    mobile = $true
    screenWidth = $Width
    screenHeight = $Height
  } | Out-Null
}

function Open-Page {
  param(
    [Parameter(Mandatory)] [string]$Uri,
    [Parameter(Mandatory)] [int]$Width
  )

  Set-EmulatedViewport -Width $Width
  for ($index = $script:cdpEvents.Count - 1; $index -ge 0; $index -= 1) {
    if ($script:cdpEvents[$index].method -eq 'Page.loadEventFired') {
      $script:cdpEvents.RemoveAt($index)
    }
  }
  Send-CdpMessage -Method 'Page.navigate' -Params @{ url = $Uri } | Out-Null
  Wait-CdpEvent -Method 'Page.loadEventFired' | Out-Null

  $deadline = [DateTime]::UtcNow.AddSeconds(5)
  do {
    $ready = Invoke-JavaScript -Expression 'document.querySelectorAll(".student-card").length === 46'
    if ($ready) { return }
    Start-Sleep -Milliseconds 50
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "页面未在预期时间内完成初始化：$Uri"
}

function Open-CourseGrades {
  $navPoint = Invoke-JavaScript -Expression @'
(() => {
  const rect = document.querySelector('.nav-btn[data-index="2"]').getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
})()
'@
  Invoke-TouchTap -X $navPoint.x -Y $navPoint.y
  # Wait for the 420ms main-page transition before sending coordinate-based input.
  Start-Sleep -Milliseconds 500

  $segmentPoint = Invoke-JavaScript -Expression @'
(() => {
  const rect = document.querySelector('.page[data-page="2"] .segment[data-sub="1"]').getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
})()
'@
  Invoke-TouchTap -X $segmentPoint.x -Y $segmentPoint.y
  Start-Sleep -Milliseconds 100
  $opened = Invoke-JavaScript -Expression @'
(() => document.querySelector('.nav-btn.active')?.dataset.index === '2'
  && document.querySelector('.page[data-page="2"] .segment[data-sub="1"]').classList.contains('active'))()
'@
  return $opened
}

function Invoke-TouchTap {
  param(
    [Parameter(Mandatory)] [double]$X,
    [Parameter(Mandatory)] [double]$Y
  )

  $touchId = 11
  Send-CdpMessage -Method 'Input.dispatchTouchEvent' -Params @{
    type = 'touchStart'
    touchPoints = @(@{ x = $X; y = $Y; id = $touchId; radiusX = 1; radiusY = 1; force = 1 })
  } | Out-Null
  Send-CdpMessage -Method 'Input.dispatchTouchEvent' -Params @{
    type = 'touchEnd'
    touchPoints = @()
  } | Out-Null
  Start-Sleep -Milliseconds 80
}

function Invoke-TouchSwipe {
  param(
    [Parameter(Mandatory)] [double]$StartX,
    [Parameter(Mandatory)] [double]$EndX,
    [Parameter(Mandatory)] [double]$Y
  )

  $touchId = 17
  Send-CdpMessage -Method 'Input.dispatchTouchEvent' -Params @{
    type = 'touchStart'
    touchPoints = @(@{ x = $StartX; y = $Y; id = $touchId; radiusX = 1; radiusY = 1; force = 1 })
  } | Out-Null
  for ($step = 1; $step -le 5; $step += 1) {
    $x = $StartX + (($EndX - $StartX) * $step / 5)
    Send-CdpMessage -Method 'Input.dispatchTouchEvent' -Params @{
      type = 'touchMove'
      touchPoints = @(@{ x = $x; y = $Y; id = $touchId; radiusX = 1; radiusY = 1; force = 1 })
    } | Out-Null
  }
  Send-CdpMessage -Method 'Input.dispatchTouchEvent' -Params @{
    type = 'touchEnd'
    touchPoints = @()
  } | Out-Null
  Start-Sleep -Milliseconds 500
}

function Get-BrowserErrors {
  Send-CdpMessage -Method 'Runtime.evaluate' -Params @{ expression = 'true'; returnByValue = $true } | Out-Null
  $errors = [Collections.Generic.List[string]]::new()
  foreach ($event in $script:cdpEvents) {
    if ($event.method -eq 'Runtime.exceptionThrown') {
      $details = $event.params.exceptionDetails
      $description = if (
        $details.PSObject.Properties['exception'] -and
        $details.exception.PSObject.Properties['description']
      ) { $details.exception.description } else { $details.text }
      $errors.Add("JavaScript：$description")
    }
    if ($event.method -eq 'Runtime.consoleAPICalled' -and $event.params.type -eq 'error') {
      $text = ($event.params.args | ForEach-Object { $_.value ?? $_.description }) -join ' '
      $errors.Add("Console：$text")
    }
    if ($event.method -eq 'Log.entryAdded' -and $event.params.entry.level -eq 'error') {
      $errors.Add("$($event.params.entry.source)：$($event.params.entry.text) $($event.params.entry.url)".Trim())
    }
  }
  return $errors
}

$edgeProcess = $null
$serverProcess = $null
$succeeded = $false
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempRoot = Join-Path $tempBase "teacher-workbench-verify-$([Guid]::NewGuid().ToString('N'))"
[IO.Directory]::CreateDirectory($tempRoot) | Out-Null

try {
  $EdgePath = Resolve-EdgePath -RequestedPath $EdgePath
  if ($ServerPort -le 0) { $ServerPort = Get-FreeTcpPort }
  if ($DebugPort -le 0) { $DebugPort = Get-FreeTcpPort }

  Write-Host '环境' -ForegroundColor Cyan
  Write-Host "  PowerShell $($PSVersionTable.PSVersion)"
  Write-Host "  Node $(& $nodeCommand.Source --version)"
  Write-Host "  Edge $EdgePath"

  $serverStdout = Join-Path $tempRoot 'server.stdout.log'
  $serverStderr = Join-Path $tempRoot 'server.stderr.log'
  $serverStart = @{
    FilePath = $nodeCommand.Source
    ArgumentList = @("`"$lanServerPath`"", [string]$ServerPort)
    WorkingDirectory = $projectRoot
    WindowStyle = 'Hidden'
    RedirectStandardOutput = $serverStdout
    RedirectStandardError = $serverStderr
    PassThru = $true
  }
  $serverProcess = Start-Process @serverStart

  $baseUri = "http://127.0.0.1:$ServerPort"
  $health = Wait-JsonEndpoint -Uri "$baseUri/__health"
  Assert-Verification -Condition ([bool]$health.ok) -Message 'LAN 服务健康检查通过'

  $edgeStdout = Join-Path $tempRoot 'edge.stdout.log'
  $edgeStderr = Join-Path $tempRoot 'edge.stderr.log'
  # Reuse one isolated profile: Edge can keep model-database files locked after exit,
  # so placing the profile outside the per-run log directory keeps cleanup reliable.
  $edgeProfile = Join-Path $tempBase 'teacher-workbench-web-verify-edge-profile'
  $edgeStart = @{
    FilePath = $EdgePath
    ArgumentList = @(
      '--headless=new',
      '--disable-gpu',
      '--disable-background-mode',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--no-service-autorun',
      '--no-first-run',
      '--no-default-browser-check',
      "--remote-debugging-port=$DebugPort",
      "--user-data-dir=$edgeProfile",
      'about:blank'
    )
    WindowStyle = 'Hidden'
    RedirectStandardOutput = $edgeStdout
    RedirectStandardError = $edgeStderr
    PassThru = $true
  }
  $edgeProcess = Start-Process @edgeStart

  $targets = Wait-JsonEndpoint -Uri "http://127.0.0.1:$DebugPort/json/list"
  $pageTarget = $targets | Where-Object type -eq 'page' | Select-Object -First 1
  if (-not $pageTarget) {
    throw 'Edge 未提供可用的页面调试目标。'
  }

  $script:cdpSocket = [Net.WebSockets.ClientWebSocket]::new()
  $connectCancellation = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(10))
  try {
    $null = $script:cdpSocket.ConnectAsync(
      [Uri]$pageTarget.webSocketDebuggerUrl,
      $connectCancellation.Token
    ).GetAwaiter().GetResult()
  } finally {
    $connectCancellation.Dispose()
  }

  Send-CdpMessage -Method 'Page.enable' | Out-Null
  Send-CdpMessage -Method 'Runtime.enable' | Out-Null
  Send-CdpMessage -Method 'Log.enable' | Out-Null

  Write-Host '响应式与 DOM 契约' -ForegroundColor Cyan
  foreach ($width in @(320, 390, 430)) {
    Open-Page -Uri "$baseUri/?verify=$width" -Width $width
    $metrics = Invoke-JavaScript -Expression @'
(() => {
  const rect = (selector) => {
    const value = document.querySelector(selector)?.getBoundingClientRect();
    return value ? { left: value.left, right: value.right, width: value.width } : null;
  };
  const ids = [...document.querySelectorAll('[id]')].map((node) => node.id);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  return {
    innerWidth,
    htmlScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    app: rect('#app'),
    grid: rect('#studentGrid'),
    nav: rect('#nav'),
    studentCards: document.querySelectorAll('.student-card').length,
    seatCells: document.querySelectorAll('.seat-cell').length,
    seatCards: document.querySelectorAll('.seat-card').length,
    duplicateIds,
    activeNav: document.querySelector('.nav-btn.active')?.dataset.index,
    ariaCurrentNav: document.querySelector('.nav-btn[aria-current="page"]')?.dataset.index,
    pageIndexes: [...document.querySelectorAll('.page')].map((node) => node.dataset.page).join(','),
    navIndexes: [...document.querySelectorAll('.nav-btn')].map((node) => node.dataset.index).join(','),
    subviewIndexes: [...document.querySelectorAll('.page')].map((page) =>
      [...page.querySelectorAll('.subview')].map((node) => node.dataset.view).join(',')
    ),
    segmentIndexes: [...document.querySelectorAll('.page')].map((page) =>
      [...page.querySelectorAll('.segment')].map((node) => node.dataset.sub).join(',')
    ),
    activeSubviewCounts: [...document.querySelectorAll('.page')].map((page) => page.querySelectorAll('.subview.active').length),
    registerGridActive: document.querySelector('.page[data-page="1"] .subview[data-view="0"]').classList.contains('active'),
    drawerHidden: document.querySelector('#menuDrawer').getAttribute('aria-hidden') === 'true',
    overlaysVisible: document.querySelectorAll('[aria-modal="true"][aria-hidden="false"]').length
  };
})()
'@
    Assert-Verification -Condition ($metrics.innerWidth -eq $width) -Message "${width}px 视口宽度生效"
    Assert-Verification -Condition (
      $metrics.htmlScrollWidth -le $width -and
      $metrics.bodyScrollWidth -le $width -and
      $metrics.app.right -le ($width + 0.5) -and
      $metrics.grid.right -le ($width + 0.5) -and
      $metrics.nav.right -le ($width + 0.5)
    ) -Message "${width}px 无水平溢出"
    Assert-Verification -Condition (
      $metrics.studentCards -eq 46 -and
      $metrics.seatCells -eq 104 -and
      $metrics.seatCards -eq 46
    ) -Message "${width}px 业务 DOM 数量正确"
    Assert-Verification -Condition ($metrics.duplicateIds.Count -eq 0) -Message "${width}px 页面 ID 唯一"
    Assert-Verification -Condition (
      $metrics.activeNav -eq '1' -and
      $metrics.ariaCurrentNav -eq '1' -and
      $metrics.pageIndexes -eq '0,1,2' -and
      $metrics.navIndexes -eq '0,1,2' -and
      ($metrics.subviewIndexes -join ';') -eq '0,1;0,1;0,1' -and
      ($metrics.segmentIndexes -join ';') -eq '0,1;;0,1' -and
      ($metrics.activeSubviewCounts -join ',') -eq '1,1,1' -and
      $metrics.registerGridActive -and
      $metrics.drawerHidden -and
      $metrics.overlaysVisible -eq 0
    ) -Message "${width}px 页面索引、初始导航、子视图与浮层状态正确"
  }

  Write-Host '成绩表横拖路由' -ForegroundColor Cyan
  Open-Page -Uri "$baseUri/?verify=grade-scroll-overflow" -Width 320
  Assert-Verification -Condition ([bool](Open-CourseGrades)) -Message '320px 可进入课程成绩视图'
  $overflowBefore = Invoke-JavaScript -Expression @'
(() => {
  const scroller = document.querySelector('.grade-scroll');
  const rect = scroller.getBoundingClientRect();
  return {
    overflow: scroller.scrollWidth > scroller.clientWidth + 1,
    scrollLeft: scroller.scrollLeft,
    y: rect.top + Math.min(120, rect.height / 2)
  };
})()
'@
  Assert-Verification -Condition ([bool]$overflowBefore.overflow) -Message '320px 成绩表存在横向溢出'
  Invoke-TouchSwipe -StartX 265 -EndX 65 -Y $overflowBefore.y
  $overflowAfter = Invoke-JavaScript -Expression @'
(() => ({
  scrollLeft: document.querySelector('.grade-scroll').scrollLeft,
  activeNav: document.querySelector('.nav-btn.active')?.dataset.index
}))()
'@
  Assert-Verification -Condition (
    $overflowAfter.scrollLeft -gt ($overflowBefore.scrollLeft + 20) -and
    $overflowAfter.activeNav -eq '2'
  ) -Message '成绩表溢出时横拖优先滚动表格且不切页'

  Open-Page -Uri "$baseUri/?verify=grade-scroll-page" -Width 390
  Assert-Verification -Condition ([bool](Open-CourseGrades)) -Message '390px 可进入课程成绩视图'
  $nonOverflow = Invoke-JavaScript -Expression @'
(() => {
  const scroller = document.querySelector('.grade-scroll');
  const rect = scroller.getBoundingClientRect();
  return {
    overflow: scroller.scrollWidth > scroller.clientWidth + 1,
    y: rect.top + Math.min(120, rect.height / 2)
  };
})()
'@
  Assert-Verification -Condition (-not [bool]$nonOverflow.overflow) -Message '390px 默认成绩表无需横向滚动'
  Invoke-TouchSwipe -StartX 75 -EndX 300 -Y $nonOverflow.y
  $activeAfterSwipe = Invoke-JavaScript -Expression 'document.querySelector(".nav-btn.active")?.dataset.index'
  Assert-Verification -Condition ($activeAfterSwipe -eq '1') -Message '成绩表不溢出时横拖仍可切换主页面'

  Write-Host 'Sheet 合成层与幽灵点击' -ForegroundColor Cyan
  Assert-Verification -Condition ([bool](Open-CourseGrades)) -Message '重新进入课程成绩视图'
  $openedGrade = Invoke-JavaScript -Expression @'
(() => {
  document.querySelector('.grade-score-cell').click();
  return {
    shown: document.querySelector('.course-grade-sheet').classList.contains('show'),
    panelPromoted: document.querySelector('.course-grade-panel').classList.contains('sheet-compositing'),
    scrimPromoted: document.querySelector('.course-grade-sheet').classList.contains('sheet-scrim-compositing')
  };
})()
'@
  Assert-Verification -Condition (
    $openedGrade.shown -and $openedGrade.panelPromoted -and $openedGrade.scrimPromoted
  ) -Message '课程成绩 Sheet 打开时临时提升面板与遮罩'
  Start-Sleep -Milliseconds 500
  $gradeReleased = Invoke-JavaScript -Expression @'
(() => !document.querySelector('.course-grade-panel').classList.contains('sheet-compositing')
  && !document.querySelector('.course-grade-sheet').classList.contains('sheet-scrim-compositing'))()
'@
  Assert-Verification -Condition ([bool]$gradeReleased) -Message '课程成绩 Sheet 落位后释放合成层提示'

  $ghostResult = Invoke-JavaScript -Expression @'
(() => {
  const close = document.querySelector('.course-grade-sheet [data-action="close"]');
  const schedule = document.querySelector('.page[data-page="2"] .segment[data-sub="0"]');
  const grades = document.querySelector('.page[data-page="2"] .segment[data-sub="1"]');
  const pointer = (type, id) => new PointerEvent(type, {
    bubbles: true,
    pointerId: id,
    pointerType: 'touch',
    clientX: 100,
    clientY: 100
  });

  close.dispatchEvent(pointer('pointerdown', 701));
  schedule.click();
  const trailingClickBlocked = grades.classList.contains('active');
  const closePromoted = document.querySelector('.course-grade-panel').classList.contains('sheet-compositing');

  schedule.dispatchEvent(pointer('pointerdown', 702));
  schedule.dispatchEvent(pointer('pointerup', 702));
  schedule.click();
  return {
    trailingClickBlocked,
    deliberateClickAccepted: schedule.classList.contains('active'),
    closePromoted
  };
})()
'@
  Assert-Verification -Condition ([bool]$ghostResult.trailingClickBlocked) -Message '关闭成绩 Sheet 后阻止同一序列的幽灵点击'
  Assert-Verification -Condition ([bool]$ghostResult.deliberateClickAccepted) -Message '下一次真实 pointerdown 立即解除点击保护'
  Assert-Verification -Condition ([bool]$ghostResult.closePromoted) -Message '课程成绩 Sheet 关闭动画期间保留合成层提示'
  Start-Sleep -Milliseconds 500
  $closeReleased = Invoke-JavaScript -Expression @'
(() => !document.querySelector('.course-grade-panel').classList.contains('sheet-compositing')
  && !document.querySelector('.course-grade-sheet').classList.contains('sheet-scrim-compositing'))()
'@
  Assert-Verification -Condition ([bool]$closeReleased) -Message '课程成绩 Sheet 关闭后释放合成层提示'

  Open-Page -Uri "$baseUri/?verify=drawer-compositor" -Width 390
  $drawerOpened = Invoke-JavaScript -Expression @'
(() => {
  document.querySelector('#menuButton').click();
  return {
    open: document.querySelector('#app').classList.contains('drawer-open'),
    panelPromoted: document.querySelector('#menuDrawer').classList.contains('sheet-compositing'),
    scrimPromoted: document.querySelector('#scrim').classList.contains('sheet-scrim-compositing')
  };
})()
'@
  Assert-Verification -Condition (
    $drawerOpened.open -and $drawerOpened.panelPromoted -and $drawerOpened.scrimPromoted
  ) -Message '通用菜单打开时临时提升真实遮罩'
  Start-Sleep -Milliseconds 500
  $drawerReleased = Invoke-JavaScript -Expression @'
(() => !document.querySelector('#menuDrawer').classList.contains('sheet-compositing')
  && !document.querySelector('#scrim').classList.contains('sheet-scrim-compositing'))()
'@
  Assert-Verification -Condition ([bool]$drawerReleased) -Message '通用菜单落位后释放合成层提示'

  $browserErrors = @(Get-BrowserErrors)
  if ($browserErrors.Count -gt 0) {
    Write-Host '浏览器错误：' -ForegroundColor Yellow
    $browserErrors | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  }
  Assert-Verification -Condition ($browserErrors.Count -eq 0) -Message '浏览器控制台与网络日志无 error'

  $succeeded = $true
  Write-Host "Web 验收完成：$script:passCount 项通过。" -ForegroundColor Green
} finally {
  if ($script:cdpSocket) {
    try {
      if ($script:cdpSocket.State -eq [Net.WebSockets.WebSocketState]::Open) {
        # Ask the browser process (including its children) to exit before deleting the profile.
        Send-CdpMessage -Method 'Browser.close' | Out-Null
      }
    } catch {
      # Browser.close intentionally tears down the connection; either outcome is sufficient.
    }
    Start-Sleep -Milliseconds 300
    try {
      if ($script:cdpSocket.State -eq [Net.WebSockets.WebSocketState]::Open) {
        $null = $script:cdpSocket.CloseAsync(
          [Net.WebSockets.WebSocketCloseStatus]::NormalClosure,
          'verification complete',
          [Threading.CancellationToken]::None
        ).GetAwaiter().GetResult()
      }
    } catch {
      # Edge may have exited first; disposal below is sufficient.
    }
    $script:cdpSocket.Dispose()
  }

  foreach ($process in @($edgeProcess, $serverProcess)) {
    if ($process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      $process.WaitForExit(3000) | Out-Null
    }
  }

  $resolvedTempRoot = [IO.Path]::GetFullPath($tempRoot)
  $safeTempPrefix = $tempBase.TrimEnd(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  ) + [IO.Path]::DirectorySeparatorChar
  $safeToRemove = (
    $resolvedTempRoot.StartsWith($safeTempPrefix, [StringComparison]::OrdinalIgnoreCase) -and
    [IO.Path]::GetFileName($resolvedTempRoot).StartsWith('teacher-workbench-verify-', [StringComparison]::Ordinal)
  )

  if ($succeeded -and -not $KeepArtifacts -and $safeToRemove -and [IO.Directory]::Exists($resolvedTempRoot)) {
    for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
      try {
        Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
        break
      } catch {
        # Edge may release its last profile lock just after Remove-Item reports it.
        if (-not [IO.Directory]::Exists($resolvedTempRoot)) { break }
        if ($attempt -eq 19) {
          Write-Host "临时目录稍后可安全删除：$resolvedTempRoot" -ForegroundColor Yellow
          break
        }
        Start-Sleep -Milliseconds 250
      }
    }
  } elseif ([IO.Directory]::Exists($resolvedTempRoot)) {
    Write-Host "验收诊断文件：$resolvedTempRoot" -ForegroundColor Yellow
  }
}
