[CmdletBinding()]
param(
  [string]$Serial = '',
  [int]$Port = 8080,
  [switch]$SkipInitialDeploy,
  [switch]$ForceInitialDeploy
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

try {
  $utf8 = [System.Text.UTF8Encoding]::new($false)
  [Console]::OutputEncoding = $utf8
  $OutputEncoding = $utf8
} catch {
  # Host may not expose a console.
}

$root = Split-Path -Parent $PSScriptRoot
$packageId = 'com.teacherworkbench.app'
$contentIdScript = Join-Path $PSScriptRoot 'content-id.cjs'
$deployScript = Join-Path $PSScriptRoot 'deploy-apk.ps1'
$syncWwwScript = Join-Path $PSScriptRoot 'sync-capacitor-www.ps1'
$previewScript = Join-Path $PSScriptRoot 'preview-native.ps1'

$script:deviceSerial = ''
$script:lanIp = ''
$script:contentId = ''
$script:lastChangeAt = $null
$script:lastDeployId = ''
$script:lastDeployAt = $null
$script:autoDeploy = $false
$script:pendingDeploy = $false
$script:lanUrl = ''
$script:serverReachable = $false
$script:phoneLanId = ''
$script:appInstalled = $false
$script:liveReloadLaunched = $false
$script:liveReloadProcess = $null
$script:startedServerPid = 0
$script:logLines = New-Object System.Collections.Generic.List[string]
$script:watchers = @()
$script:watchState = [hashtable]::Synchronized(@{
  Dirty = $false
  LastChange = $null
})

function Write-Log([string]$Message, [string]$Color = 'Gray') {
  $stamp = Get-Date -Format 'HH:mm:ss'
  $line = "[$stamp] $Message"
  while ($script:logLines.Count -ge 12) {
    $script:logLines.RemoveAt(0)
  }
  [void]$script:logLines.Add($line)
  Write-Host $line -ForegroundColor $Color
}

function Get-ContentIdSafe {
  try {
    $id = (& node $contentIdScript $root 2>$null)
    if (-not $?) { return '' }
    return ([string]$id).Trim()
  } catch {
    return ''
  }
}

function Get-ShortDevice([string]$SerialValue) {
  if (-not $SerialValue) { return '-' }
  if ($SerialValue.Length -le 28) { return $SerialValue }
  return ($SerialValue.Substring(0, 18) + '...' + $SerialValue.Substring($SerialValue.Length - 6))
}

function Get-AdbDevices {
  $list = New-Object System.Collections.Generic.List[string]
  $raw = & adb devices 2>$null
  foreach ($line in @($raw)) {
    if ([string]$line -match '^\s*(\S+)\s+device\s*$') {
      [void]$list.Add($Matches[1])
    }
  }
  return [string[]]$list.ToArray()
}

function Resolve-Device([string]$Preferred) {
  [string[]]$devices = Get-AdbDevices
  if ($devices.Length -eq 0) { throw '未检测到 adb 设备。请开启 USB/无线调试。' }
  if ($Preferred) {
    if ($devices -notcontains $Preferred) {
      throw ("设备不可用: {0}。当前: {1}" -f $Preferred, ($devices -join ', '))
    }
    return $Preferred
  }
  if ($devices.Length -gt 1) {
    Write-Host '多台设备，使用第一台。可用 -Serial 指定。' -ForegroundColor Yellow
    Write-Host ('  ' + ($devices -join "`n  "))
  }
  return $devices[0]
}

function Test-AppInstalled {
  $raw = & adb -s $script:deviceSerial shell pm path $packageId 2>$null
  $text = [string]::Join('', @($raw))
  return ($text -match 'package:')
}

function Test-PortOpen([int]$PortNumber) {
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $async = $client.BeginConnect('127.0.0.1', $PortNumber, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne(350)
    if (-not $ok) { $client.Close(); return $false }
    $client.EndConnect($async)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Get-PreferredLanIp {
  $ips = New-Object System.Collections.Generic.List[string]
  if (Get-Command Get-NetIPAddress -ErrorAction SilentlyContinue) {
    foreach ($addr in @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue)) {
      $ip = [string]$addr.IPAddress
      if (-not $ip -or $ip -eq '127.0.0.1') { continue }
      if ($ip.StartsWith('169.254.')) { continue }
      if ($ip -match '^198\.1[89]\.') { continue }
      [void]$ips.Add($ip)
    }
  }
  $ordered = @(
    $ips.ToArray() | Sort-Object @{
      Expression = {
        if ($_ -match '^192\.168\.') { 0 }
        elseif ($_ -match '^10\.') { 1 }
        elseif ($_ -match '^172\.(1[6-9]|2[0-9]|3[0-1])\.') { 2 }
        else { 9 }
      }
    }, { $_ }
  )
  if ($ordered.Length -gt 0) { return $ordered[0] }
  return '127.0.0.1'
}

function Test-LanServerHasContentId {
  try {
    $health = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri ("http://127.0.0.1:{0}/__health" -f $Port)
    return ($health.StatusCode -eq 200 -and $health.Content -match '"id"\s*:')
  } catch {
    return $false
  }
}

function Stop-ListenersOnPort {
  $conns = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  foreach ($conn in $conns) {
    if ($conn.OwningProcess) {
      Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }
  Start-Sleep -Milliseconds 400
}

function Start-LanServerIfNeeded {
  if (Test-PortOpen $Port) {
    if (Test-LanServerHasContentId) {
      Write-Log ("LAN 服务已在端口 {0}" -f $Port) 'DarkCyan'
      return
    }
    Write-Log ("端口 {0} 上的旧服务无内容指纹，正在重启..." -f $Port) 'Yellow'
    Stop-ListenersOnPort
  }

  $node = (Get-Command node -ErrorAction Stop).Source
  $proc = Start-Process -FilePath $node `
    -ArgumentList @('lan-server.js', "$Port") `
    -WorkingDirectory $root `
    -WindowStyle Minimized `
    -PassThru
  $script:startedServerPid = [int]$proc.Id
  $deadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortOpen $Port -and (Test-LanServerHasContentId)) {
      Write-Log ("已启动 LAN 服务 pid={0} port={1}" -f $script:startedServerPid, $Port) 'Green'
      return
    }
    Start-Sleep -Milliseconds 200
  }
  throw ("LAN 服务未能在端口 {0} 就绪" -f $Port)
}

function Update-ContentStatus {
  $script:contentId = Get-ContentIdSafe
  if (-not $script:lastChangeAt) {
    $script:lastChangeAt = Get-Date
  }
}

function Update-LiveReloadState {
  if (-not $script:liveReloadProcess) { return }
  try {
    if (-not $script:liveReloadProcess.HasExited) { return }
  } catch {
    # Process object may be stale.
  }
  $script:liveReloadProcess = $null
  if ($script:liveReloadLaunched) {
    $script:liveReloadLaunched = $false
    Write-Log '热更新窗口已关闭，模式回到 LAN 已通' 'DarkYellow'
  }
}

function Get-PreviewMode {
  # hot: phone can hit LAN (save -> reload once Live Reload session is active)
  # ready: LAN OK, waiting for [L]
  # apk: phone cannot reach LAN; must use packaged assets
  Update-LiveReloadState
  if (-not $script:serverReachable) { return 'apk' }
  if ($script:liveReloadLaunched) { return 'hot' }
  return 'ready'
}

function Get-NextStep {
  $mode = Get-PreviewMode
  if ($mode -eq 'hot') {
    return @{ Text = '保存代码即可在手机看到，一般不必按 D'; Color = 'Green' }
  }
  if ($mode -eq 'ready') {
    if (-not $script:appInstalled) {
      return @{ Text = '请先按 D 安装 App，再按 L 开启热更新'; Color = 'Yellow' }
    }
    return @{ Text = '推荐按 L 开启热更新（保存即刷新）'; Color = 'Cyan' }
  }
  if (-not $script:appInstalled) {
    return @{ Text = '手机访问不到 LAN；先按 D 安装/推送'; Color = 'Yellow' }
  }
  return @{ Text = '手机访问不到 LAN，改动需按 D 推送；修好网络后可按 L'; Color = 'Yellow' }
}

function Show-Dashboard {
  Clear-Host
  $changeText = if ($script:lastChangeAt) { $script:lastChangeAt.ToString('HH:mm:ss') } else { '-' }
  $deployText = if ($script:lastDeployId) {
    '{0} @ {1}' -f $script:lastDeployId, $script:lastDeployAt.ToString('HH:mm:ss')
  } else { '本会话尚未打包推送' }
  $autoText = if ($script:autoDeploy) { '开' } else { '关' }
  $mode = Get-PreviewMode
  $next = Get-NextStep
  $idMatch = ($script:phoneLanId -and $script:contentId -and $script:phoneLanId -eq $script:contentId)

  Write-Host ''
  Write-Host '  教师工作台 · 手机同步' -ForegroundColor Cyan
  Write-Host ''
  Write-Host ('  下一步  ') -NoNewline -ForegroundColor DarkGray
  Write-Host $next.Text -ForegroundColor $next.Color
  Write-Host ''

  switch ($mode) {
    'hot' {
      Write-Host '  模式    ' -NoNewline -ForegroundColor DarkGray
      Write-Host '热更新已启动' -NoNewline -ForegroundColor Green
      Write-Host '  · 保存 index/styles/scripts 后手机自动刷新' -ForegroundColor DarkGray
    }
    'ready' {
      Write-Host '  模式    ' -NoNewline -ForegroundColor DarkGray
      Write-Host 'LAN 已通' -NoNewline -ForegroundColor Cyan
      Write-Host '  · 按 L 接入后即可热更新，无需每次打包' -ForegroundColor DarkGray
    }
    default {
      Write-Host '  模式    ' -NoNewline -ForegroundColor DarkGray
      Write-Host '包内资源' -NoNewline -ForegroundColor Yellow
      Write-Host '  · 手机连不上电脑局域网，只能打包推送' -ForegroundColor DarkGray
    }
  }

  Write-Host ('  设备    {0}' -f (Get-ShortDevice $script:deviceSerial)) -ForegroundColor DarkGray
  Write-Host ('  本地    {0}  · 更新 {1}' -f $(if ($script:contentId) { $script:contentId } else { '计算失败' }), $changeText) -ForegroundColor Yellow
  $lanDetail = if ($script:serverReachable) {
    if ($idMatch) { '手机可达 · 指纹一致' }
    elseif ($script:phoneLanId) { "手机可达 · 指纹 {0}" -f $script:phoneLanId }
    else { '手机可达' }
  } else { '手机不可达' }
  Write-Host ('  LAN     {0}' -f $script:lanUrl) -NoNewline
  Write-Host ('  ({0})' -f $lanDetail) -ForegroundColor $(if ($script:serverReachable) { 'Green' } else { 'Yellow' })

  if ($script:pendingDeploy) {
    if ($mode -eq 'hot' -or $mode -eq 'ready') {
      Write-Host '  改动    本地已更新（热更新下通常不用推送）' -ForegroundColor DarkGray
    } else {
      Write-Host '  改动    有未推送到手机的改动 → 按 D' -ForegroundColor Yellow
    }
  } else {
    Write-Host '  改动    与监视起点一致' -ForegroundColor DarkGray
  }
  Write-Host ('  上次 APK {0}  · 自动推送 {1}' -f $deployText, $autoText) -ForegroundColor DarkGray

  Write-Host ''
  Write-Host '  ── 日常（推荐）────────────────────────────' -ForegroundColor DarkGray
  Write-Host '  [L] 开启热更新          [H] 检测手机连接'
  Write-Host '  [R] 重启 App            [I] 刷新指纹'
  Write-Host '  [Q] 退出'
  Write-Host ''
  Write-Host '  ── 完整安装（较慢，热更新失败时再用）──' -ForegroundColor DarkGray
  Write-Host '  [D] 打包推送            [A] 开关自动推送'
  Write-Host '  [C] 清缓存并重开        [X] 清除全部数据'
  Write-Host '  [S] 仅同步 www'
  Write-Host ''
  Write-Host '  日志' -ForegroundColor DarkGray
  if ($script:logLines.Count -eq 0) {
    Write-Host '  （暂无）' -ForegroundColor DarkGray
  } else {
    foreach ($line in $script:logLines) {
      Write-Host ('  {0}' -f $line) -ForegroundColor DarkGray
    }
  }
  Write-Host ''
}

function Invoke-Deploy {
  Write-Log '开始打包并推送到手机...' 'Cyan'
  Show-Dashboard
  & powershell -NoProfile -ExecutionPolicy Bypass -File $deployScript -Serial $script:deviceSerial
  if (-not $?) {
    Write-Log '推送失败' 'Red'
    $script:pendingDeploy = $true
    return $false
  }
  $script:lastDeployId = Get-ContentIdSafe
  $script:lastDeployAt = Get-Date
  $script:pendingDeploy = $false
  $script:appInstalled = $true
  Write-Log ("推送完成 id={0}" -f $script:lastDeployId) 'Green'
  return $true
}

function Invoke-RestartApp {
  Write-Log '重启 App...' 'Cyan'
  & adb -s $script:deviceSerial shell am force-stop $packageId | Out-Null
  Start-Sleep -Milliseconds 300
  & adb -s $script:deviceSerial shell am start -n "$packageId/.MainActivity" | Out-Null
  Write-Log '已重新打开 App' 'Green'
}

function Invoke-ClearCacheAndRestart {
  Write-Log '清除应用缓存并重开...' 'Cyan'
  & adb -s $script:deviceSerial shell am force-stop $packageId | Out-Null
  & adb -s $script:deviceSerial shell pm clear --cache-only $packageId 2>$null | Out-Null
  Start-Sleep -Milliseconds 250
  & adb -s $script:deviceSerial shell am start -n "$packageId/.MainActivity" | Out-Null
  Write-Log '缓存清理流程已执行并重新打开' 'Green'
}

function Invoke-WipeAppData {
  Write-Host ''
  Write-Host '将清除应用全部数据（含本地名单等），确认请输入 y 后回车：' -ForegroundColor Yellow
  $answer = Read-Host
  if ($answer -ne 'y' -and $answer -ne 'Y') {
    Write-Log '已取消清除全部数据' 'DarkYellow'
    return
  }
  Write-Log '清除应用全部数据...' 'Cyan'
  & adb -s $script:deviceSerial shell am force-stop $packageId | Out-Null
  & adb -s $script:deviceSerial shell pm clear $packageId | Out-Null
  & adb -s $script:deviceSerial shell am start -n "$packageId/.MainActivity" | Out-Null
  Write-Log '应用数据已清除并重新打开' 'Green'
}

function Invoke-SyncWwwOnly {
  Write-Log '同步 www...' 'Cyan'
  & powershell -NoProfile -ExecutionPolicy Bypass -File $syncWwwScript
  if ($?) { Write-Log 'www 同步完成' 'Green' }
  else { Write-Log 'www 同步失败' 'Red' }
  Update-ContentStatus
}

function Test-PhoneHealth {
  $healthUrl = ($script:lanUrl.TrimEnd('/') + '/__health')
  $raw = & adb -s $script:deviceSerial shell "curl -s --connect-timeout 3 `"$healthUrl`"" 2>$null
  $text = [string]::Join('', @($raw)).Trim()
  $phoneId = $null
  if ($text -match '"id"\s*:\s*"([^"]+)"') { $phoneId = $Matches[1] }
  $ok = $text -match '"ok"\s*:\s*true'
  $script:serverReachable = $ok
  $script:phoneLanId = if ($phoneId) { $phoneId } else { '' }
  $pcId = Get-ContentIdSafe
  $script:appInstalled = Test-AppInstalled

  if ($ok -and $phoneId -and $pcId -and $phoneId -eq $pcId) {
    Write-Log ("连接 OK：手机可达 LAN，指纹一致 {0}" -f $phoneId) 'Green'
  } elseif ($ok -and $phoneId) {
    Write-Log ("LAN 可达；服务指纹 {0}，本地 {1}" -f $phoneId, $pcId) 'Yellow'
  } elseif ($ok) {
    Write-Log 'LAN 可达，但未返回指纹（可重启本控制台）' 'Yellow'
  } else {
    Write-Log '手机访问不到 LAN。请确认同一 Wi-Fi / 防火墙放行 Node。' 'Yellow'
  }

  if ($script:liveReloadLaunched -and $ok) {
    Write-Log '热更新会话已开：保存代码后手机应自动刷新' 'Green'
  } elseif ($ok -and $script:appInstalled) {
    Write-Log '可按 L 开启热更新，之后一般不必再按 D' 'Cyan'
  } elseif (-not $script:appInstalled) {
    Write-Log '未检测到 App，请按 D 安装' 'Yellow'
  }
}

function Start-LiveReloadPreview {
  if (-not $script:appInstalled) {
    Write-Log '尚未安装 App，先按 D 打包安装' 'Yellow'
    return
  }
  if (-not $script:serverReachable) {
    Write-Log '手机还访问不到 LAN，热更新可能失败；仍尝试启动...' 'Yellow'
  }
  Write-Log ("另开窗口启动热更新 → {0}" -f $script:lanUrl) 'Cyan'
  $args = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', $previewScript,
    '-Serial', $script:deviceSerial,
    '-NoServer',
    '-Port', "$Port",
    '-HostAddress', $script:lanIp
  )
  if ($script:liveReloadProcess -and -not $script:liveReloadProcess.HasExited) {
    Write-Log '热更新窗口仍在运行；保存即可刷新' 'Cyan'
    $script:liveReloadLaunched = $true
    return
  }
  $script:liveReloadProcess = Start-Process powershell -ArgumentList $args -PassThru
  $script:liveReloadLaunched = $true
  Write-Log '已启动热更新窗口；保持该窗口打开，保存即可刷新' 'Green'
}

function Start-Watchers {
  $handler = {
    $state = $Event.MessageData
    $state.Dirty = $true
    $state.LastChange = Get-Date
  }

  foreach ($name in @('index.html', 'styles', 'scripts')) {
    $path = Join-Path $root $name
    if (-not (Test-Path $path)) { continue }
    $item = Get-Item $path
    $watcher = New-Object System.IO.FileSystemWatcher
    $watcher.Path = if ($item.PSIsContainer) { $item.FullName } else { $item.DirectoryName }
    $watcher.Filter = if ($item.PSIsContainer) { '*.*' } else { $item.Name }
    $watcher.IncludeSubdirectories = [bool]$item.PSIsContainer
    $watcher.NotifyFilter = [IO.NotifyFilters]::FileName -bor [IO.NotifyFilters]::LastWrite -bor [IO.NotifyFilters]::Size
    $watcher.EnableRaisingEvents = $true
    foreach ($evtName in @('Changed', 'Created', 'Deleted', 'Renamed')) {
      $null = Register-ObjectEvent -InputObject $watcher -EventName $evtName -Action $handler -MessageData $script:watchState
    }
    $script:watchers += $watcher
  }
  Write-Log '已监视 index.html / styles / scripts' 'DarkCyan'
}

function Stop-OwnedServer {
  if ($script:startedServerPid -gt 0) {
    try {
      Stop-Process -Id $script:startedServerPid -Force -ErrorAction SilentlyContinue
      Write-Host ("已停止本脚本启动的 LAN 服务 pid={0}" -f $script:startedServerPid) -ForegroundColor DarkGray
    } catch {
      # ignore
    }
  }
  foreach ($w in $script:watchers) {
    try { $w.EnableRaisingEvents = $false; $w.Dispose() } catch { }
  }
  Get-EventSubscriber -ErrorAction SilentlyContinue | Where-Object { $_.SourceObject -is [IO.FileSystemWatcher] } | Unregister-Event -ErrorAction SilentlyContinue
}

# ---- main ----
Push-Location $root
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '未找到 node' }
  if (-not (Get-Command adb -ErrorAction SilentlyContinue)) { throw '未找到 adb' }

  $script:deviceSerial = Resolve-Device $Serial
  $script:lanIp = Get-PreferredLanIp
  $script:lanUrl = 'http://{0}:{1}' -f $script:lanIp, $Port

  Write-Host '正在准备环境...' -ForegroundColor Cyan
  Start-LanServerIfNeeded
  Update-ContentStatus
  $script:lastChangeAt = Get-Date
  Start-Watchers
  $script:appInstalled = Test-AppInstalled
  Test-PhoneHealth | Out-Null

  $shouldDeploy = $false
  if ($ForceInitialDeploy) {
    $shouldDeploy = $true
    Write-Log '已指定 -ForceInitialDeploy，执行首次打包' 'Cyan'
  } elseif ($SkipInitialDeploy) {
    Write-Log '已跳过首次推送（-SkipInitialDeploy）' 'DarkYellow'
  } elseif (-not $script:appInstalled) {
    $shouldDeploy = $true
    Write-Log '未安装 App，执行首次打包安装' 'Cyan'
  } elseif (-not $script:serverReachable) {
    $shouldDeploy = $true
    Write-Log '手机暂不可达 LAN，先打包推送保证可用' 'Cyan'
  } else {
    Write-Log '已安装且 LAN 可达：跳过打包。日常请按 L 热更新' 'Green'
  }

  if ($shouldDeploy) {
    [void](Invoke-Deploy)
  }

  $debounceUntil = Get-Date
  Show-Dashboard

  while ($true) {
    $hasKey = $false
    try { $hasKey = [Console]::KeyAvailable } catch { $hasKey = $false }
    if ($hasKey) {
      $key = [Console]::ReadKey($true)
      $ch = [string]$key.KeyChar
      if ($key.Key -eq 'Q' -or $ch -eq 'q') { break }
      elseif ($ch -eq 'd' -or $ch -eq 'D') { [void](Invoke-Deploy) }
      elseif ($ch -eq 'r' -or $ch -eq 'R') { Invoke-RestartApp }
      elseif ($ch -eq 'c' -or $ch -eq 'C') { Invoke-ClearCacheAndRestart }
      elseif ($ch -eq 'x' -or $ch -eq 'X') { Invoke-WipeAppData }
      elseif ($ch -eq 's' -or $ch -eq 'S') { Invoke-SyncWwwOnly }
      elseif ($ch -eq 'h' -or $ch -eq 'H') { Test-PhoneHealth }
      elseif ($ch -eq 'a' -or $ch -eq 'A') {
        $script:autoDeploy = -not $script:autoDeploy
        Write-Log ("自动打包推送 → {0}" -f ($(if ($script:autoDeploy) { '开（保存后打 APK，较慢）' } else { '关' }))) 'Cyan'
      }
      elseif ($ch -eq 'l' -or $ch -eq 'L') { Start-LiveReloadPreview }
      elseif ($ch -eq 'i' -or $ch -eq 'I') {
        Update-ContentStatus
        Write-Log ("当前指纹 {0}" -f $script:contentId) 'Yellow'
      }
      Show-Dashboard
    }

    if ($script:watchState.Dirty -and (Get-Date) -ge $debounceUntil) {
      $script:watchState.Dirty = $false
      $debounceUntil = (Get-Date).AddMilliseconds(450)
      if ($script:watchState.LastChange) {
        $script:lastChangeAt = [datetime]$script:watchState.LastChange
      } else {
        $script:lastChangeAt = Get-Date
      }
      $script:pendingDeploy = $true
      Update-ContentStatus
      $mode = Get-PreviewMode
      if ($mode -eq 'hot') {
        Write-Log ("已更新 {0} · 热更新应自动刷新手机" -f $script:contentId) 'Green'
      } elseif ($mode -eq 'ready') {
        Write-Log ("已更新 {0} · 按 L 开热更新后即可免推送" -f $script:contentId) 'Yellow'
      } else {
        Write-Log ("已更新 {0} · 当前需按 D 推送，或先修好 LAN 再按 L" -f $script:contentId) 'Yellow'
      }
      if ($script:autoDeploy) {
        [void](Invoke-Deploy)
      }
      Show-Dashboard
    }

    Start-Sleep -Milliseconds 150
  }
} catch {
  Write-Host ''
  Write-Host ("错误: {0}" -f $_.Exception.Message) -ForegroundColor Red
  exit 1
} finally {
  Stop-OwnedServer
  Pop-Location
  Write-Host '已退出同步控制台。' -ForegroundColor DarkGray
}
