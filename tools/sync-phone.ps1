[CmdletBinding()]
param(
  [string]$Serial = '',
  [int]$Port = 8080,
  [switch]$SkipInitialDeploy,
  [switch]$ForceInitialDeploy,
  # Default UI is for non-experts; -Details shows fingerprints / URL / device / logs.
  [switch]$Details
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

try {
  # $OutputEncoding: how PowerShell encodes pipeline text TO native tools.
  # Do NOT set [Console]::OutputEncoding to UTF-8 here: with legacy conhost that
  # path uses WriteFile+65001, which returns char counts as byte counts and
  # reprints every CJK character (叠词). Write-Host uses WriteConsoleW when the
  # console encoding stays on the system OEM/ANSI page.
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {
  # Host may not expose a console.
}

$root = Split-Path -Parent $PSScriptRoot
$packageId = 'com.teacherworkbench.app'
$contentIdScript = Join-Path $PSScriptRoot 'content-id.cjs'
$deployScript = Join-Path $PSScriptRoot 'deploy-apk.ps1'
$syncWwwScript = Join-Path $PSScriptRoot 'sync-web-assets.ps1'
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
$script:phoneRunId = ''
$script:phonePackagedId = ''
$script:appInstalled = $false
$script:liveReloadLaunched = $false
$script:liveReloadProcess = $null
$script:liveReloadClients = 0
$script:startedServerPid = 0
$script:logLines = New-Object System.Collections.Generic.List[string]
$script:logMax = 3
$script:showDetails = [bool]$Details
$script:dashboardShown = $false
$script:feedbackInput = [pscustomobject]@{ Key = ''; Label = ''; At = $null }
$script:feedbackAction = [pscustomobject]@{ Text = '已就绪'; Phase = 'idle'; At = $null }
$script:watchers = @()
$script:watchState = [hashtable]::Synchronized(@{
  Dirty = $false
  LastChange = $null
})
$script:lanServerState = 'starting'
$script:liveReloadState = 'stopped'
$script:liveReloadPid = 0
$script:liveReloadLogPath = ''
$script:liveReloadTail = New-Object System.Collections.Generic.List[string]
$script:lanServerLogPath = ''
$script:lastErrorTail = New-Object System.Collections.Generic.List[string]
$script:sessionLogFiles = New-Object System.Collections.Generic.List[string]
$script:cleanupLogs = $false
$script:jobAvailable = $false

$script:jobSource = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class ProcessTreeJob {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
  private static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

  [DllImport("kernel32.dll")]
  private static extern bool SetInformationJobObject(IntPtr hJob, int JobObjectInfoClass, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

  [DllImport("kernel32.dll")]
  private static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

  [DllImport("kernel32.dll")]
  private static extern bool CloseHandle(IntPtr hObject);

  [StructLayout(LayoutKind.Sequential)]
  private struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
    public long PerProcessUserTimeLimit;
    public long PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize;
    public UIntPtr MaximumWorkingSetSize;
    public uint ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint PriorityClass;
    public uint SchedulingClass;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct IO_COUNTERS {
    public ulong ReadOperationCount;
    public ulong WriteOperationCount;
    public ulong OtherOperationCount;
    public ulong ReadTransferCount;
    public ulong WriteTransferCount;
    public ulong OtherTransferCount;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
    public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
    public IO_COUNTERS IoInfo;
    public UIntPtr ProcessMemoryLimit;
    public UIntPtr JobMemoryLimit;
    public UIntPtr PeakProcessMemoryUsed;
    public UIntPtr PeakJobMemoryUsed;
  }

  private const int JobObjectExtendedLimitInformation = 9;
  private const uint JobObjectLimitKillOnJobClose = 0x2000;
  private static IntPtr jobHandle = IntPtr.Zero;
  private static readonly List<System.IO.StreamWriter> writers = new List<System.IO.StreamWriter>();

  public static bool Create() {
    jobHandle = CreateJobObject(IntPtr.Zero, null);
    if (jobHandle == IntPtr.Zero) { return false; }
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
    info.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;
    int size = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
    IntPtr ptr = Marshal.AllocHGlobal(size);
    try {
      Marshal.StructureToPtr(info, ptr, false);
      return SetInformationJobObject(jobHandle, JobObjectExtendedLimitInformation, ptr, (uint)size);
    } finally {
      Marshal.FreeHGlobal(ptr);
    }
  }

  // Start a console process with no window; stdout/stderr are read on .NET
  // background threads and appended to logFile. The process is added to the
  // session job so closing the job kills the whole tree.
  public static System.Diagnostics.Process Start(System.Diagnostics.ProcessStartInfo psi, string logFile) {
    psi.UseShellExecute = false;
    psi.CreateNoWindow = true;
    psi.RedirectStandardOutput = true;
    psi.RedirectStandardError = true;
    var fs = new System.IO.FileStream(logFile, System.IO.FileMode.Append, System.IO.FileAccess.Write, System.IO.FileShare.ReadWrite);
    var writer = new System.IO.StreamWriter(fs, new UTF8Encoding(false)) { AutoFlush = true };
    lock (writers) { writers.Add(writer); }
    var proc = new System.Diagnostics.Process();
    proc.StartInfo = psi;
    System.Diagnostics.DataReceivedEventHandler handler = (s, e) => {
      if (e.Data != null) {
        lock (writer) { writer.WriteLine(e.Data); }
      }
    };
    proc.OutputDataReceived += handler;
    proc.ErrorDataReceived += handler;
    if (!proc.Start()) { throw new InvalidOperationException("Process start failed: " + psi.FileName); }
    if (jobHandle != IntPtr.Zero) { AssignProcessToJobObject(jobHandle, proc.Handle); }
    proc.BeginOutputReadLine();
    proc.BeginErrorReadLine();
    return proc;
  }

  public static void Close() {
    lock (writers) {
      foreach (System.IO.StreamWriter w in writers) {
        try { w.Flush(); w.Dispose(); } catch { }
      }
      writers.Clear();
    }
    if (jobHandle != IntPtr.Zero) {
      CloseHandle(jobHandle);
      jobHandle = IntPtr.Zero;
    }
  }
}
'@

try {
  Add-Type -TypeDefinition $script:jobSource -ErrorAction Stop
  $script:jobAvailable = [ProcessTreeJob]::Create()
} catch {
  $script:jobAvailable = $false
}

function Write-Log([string]$Message, [string]$Color = 'Gray') {
  $stamp = Get-Date -Format 'HH:mm:ss'
  $line = "[$stamp] $Message"
  while ($script:logLines.Count -ge $script:logMax) {
    $script:logLines.RemoveAt(0)
  }
  [void]$script:logLines.Add($line)
  # Only echo before the dashboard owns the screen; otherwise logs stay in「近期」.
  if (-not $script:dashboardShown) {
    Write-Host $line -ForegroundColor $Color
  }
}

function Set-FeedbackInput([string]$Key, [string]$Label) {
  $script:feedbackInput.Key = $Key
  $script:feedbackInput.Label = $Label
  $script:feedbackInput.At = Get-Date
}

function Set-FeedbackAction([string]$Text, [string]$Phase = 'ok') {
  $script:feedbackAction.Text = $Text
  $script:feedbackAction.Phase = $Phase
  $script:feedbackAction.At = Get-Date
}

function Get-FeedbackPhaseMeta([string]$Phase) {
  switch ($Phase) {
    'busy' { return @{ Mark = '进行中'; Color = 'Cyan' } }
    'ok' { return @{ Mark = '完成'; Color = 'Green' } }
    'warn' { return @{ Mark = '注意'; Color = 'Yellow' } }
    'fail' { return @{ Mark = '失败'; Color = 'Red' } }
    default { return @{ Mark = '就绪'; Color = 'DarkGray' } }
  }
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

function Get-PhonePackagedBuildId {
  # Read build-id.json stamped into the installed APK (Capacitor assets/public).
  if (-not $script:deviceSerial) { return '' }
  $pathResult = Invoke-Adb -AdbArgs @('-s', $script:deviceSerial, 'shell', 'pm', 'path', $packageId)
  $apkPath = ''
  foreach ($line in @($pathResult.StdOut)) {
    $text = ([string]$line).Trim()
    if ($text -match '^package:(.+\.apk)$') {
      $apkPath = $Matches[1]
      break
    }
  }
  if (-not $apkPath) { return '' }
  foreach ($assetPath in @('assets/public/build-id.json', 'assets/build-id.json')) {
    $result = Invoke-Adb -AdbArgs @(
      '-s', $script:deviceSerial, 'shell', "unzip -p `"$apkPath`" $assetPath"
    )
    if ($result.Text -match '"id"\s*:\s*"([^"]+)"') {
      return $Matches[1]
    }
  }
  return ''
}

function Update-PhoneRunId([switch]$RefreshPackaged) {
  # hot: WebView loads from LAN → running stamp follows local contentId.
  # otherwise: APK-packaged build-id.json (or last deploy in this session).
  $mode = Get-PreviewMode
  if ($mode -eq 'hot') {
    if (-not $script:contentId) { $script:contentId = Get-ContentIdSafe }
    $script:phoneRunId = $script:contentId
    return
  }
  if ($RefreshPackaged -or -not $script:phonePackagedId) {
    $packaged = Get-PhonePackagedBuildId
    if ($packaged) { $script:phonePackagedId = $packaged }
  }
  if ($script:phonePackagedId) {
    $script:phoneRunId = $script:phonePackagedId
    return
  }
  if ($script:lastDeployId) {
    $script:phoneRunId = $script:lastDeployId
  }
}

function Write-FingerprintPair {
  $local = if ($script:contentId) { $script:contentId } else { '未知' }
  $phone = if ($script:phoneRunId) { $script:phoneRunId } else { '未知' }
  $match = ($script:contentId -and $script:phoneRunId -and $script:contentId -eq $script:phoneRunId)

  Write-Host '  本地最新  ' -NoNewline -ForegroundColor DarkGray
  Write-Host $local -ForegroundColor $(if ($script:contentId) { 'White' } else { 'DarkGray' })
  Write-Host '  手机运行  ' -NoNewline -ForegroundColor DarkGray
  if ($match) {
    Write-Host $phone -NoNewline -ForegroundColor Green
    Write-Host '  · 一致' -ForegroundColor Green
  } elseif ($script:phoneRunId) {
    Write-Host $phone -NoNewline -ForegroundColor Yellow
    Write-Host '  · 不一致' -ForegroundColor Yellow
  } else {
    Write-Host '未知（按 3 检测，或先按 2 安装）' -ForegroundColor DarkGray
  }
}

function Get-MenuDigit([System.ConsoleKeyInfo]$KeyInfo) {
  # Instant digit menu: main row or numpad, no Enter required.
  $ch = [string]$KeyInfo.KeyChar
  if ($ch -match '^[0-9]$') { return $ch }
  switch ($KeyInfo.Key) {
    'D0' { return '0' }
    'D1' { return '1' }
    'D2' { return '2' }
    'D3' { return '3' }
    'D4' { return '4' }
    'D5' { return '5' }
    'D6' { return '6' }
    'D7' { return '7' }
    'D8' { return '8' }
    'D9' { return '9' }
    'NumPad0' { return '0' }
    'NumPad1' { return '1' }
    'NumPad2' { return '2' }
    'NumPad3' { return '3' }
    'NumPad4' { return '4' }
    'NumPad5' { return '5' }
    'NumPad6' { return '6' }
    'NumPad7' { return '7' }
    'NumPad8' { return '8' }
    'NumPad9' { return '9' }
    default { return '' }
  }
}

function Get-ShortDevice([string]$SerialValue) {
  if (-not $SerialValue) { return '-' }
  if ($SerialValue.Length -le 28) { return $SerialValue }
  return ($SerialValue.Substring(0, 18) + '...' + $SerialValue.Substring($SerialValue.Length - 6))
}

function Invoke-Adb {
  # Windows PowerShell 5.1 + $ErrorActionPreference=Stop treats native stderr as terminating.
  # Temporarily Continue, then split stdout / stderr so daemon messages never abort the console.
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$AdbArgs
  )
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $merged = & adb @AdbArgs 2>&1
    $exitCode = 0
    if (Test-Path variable:LASTEXITCODE) { $exitCode = [int]$LASTEXITCODE }
    $stdout = New-Object System.Collections.Generic.List[string]
    $stderr = New-Object System.Collections.Generic.List[string]
    foreach ($item in @($merged)) {
      if ($null -eq $item) { continue }
      if ($item -is [System.Management.Automation.ErrorRecord]) {
        [void]$stderr.Add([string]$item)
      } else {
        [void]$stdout.Add([string]$item)
      }
    }
    return @{
      ExitCode = $exitCode
      StdOut   = [string[]]$stdout.ToArray()
      StdErr   = [string[]]$stderr.ToArray()
      Text     = [string]::Join("`n", $stdout.ToArray())
    }
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Get-AdbDeviceRows {
  # Always return @{ Items = List } so a single device is never unwrapped by the pipeline.
  $rows = New-Object System.Collections.Generic.List[object]
  $maxAttempts = 8
  $sawDaemonStart = $false
  for ($i = 1; $i -le $maxAttempts; $i++) {
    if ($i -eq 1) {
      [void](Invoke-Adb -AdbArgs @('start-server'))
    }
    $result = Invoke-Adb -AdbArgs @('devices')
    $stderrText = [string]::Join("`n", @($result.StdErr))
    if ($stderrText -match 'daemon not running|starting now|starting it now|daemon started|cannot connect to daemon') {
      $sawDaemonStart = $true
    }
    $rows.Clear()
    foreach ($line in @($result.StdOut)) {
      $text = ([string]$line).Trim()
      if (-not $text -or $text -match 'List of devices') { continue }
      # Wireless mdns serials may contain spaces, e.g. "adb-XXXX (2)._adb-tls-connect._tcp"
      if ($text -match '^(.*?)\s+(device|unauthorized|offline|no permissions)$') {
        [void]$rows.Add([pscustomobject]@{ Serial = $Matches[1].Trim(); State = $Matches[2] })
      }
    }
    if ($rows.Count -gt 0) { return @{ Items = $rows } }
    if ($i -eq 1) {
      Write-Host 'adb 服务正在启动，请稍候...' -ForegroundColor DarkGray
    } elseif ($sawDaemonStart -and $i -eq 2) {
      Write-Host '等待设备出现在 adb devices（无线调试可能稍慢）...' -ForegroundColor DarkGray
    }
    Start-Sleep -Milliseconds 900
  }
  return @{ Items = $rows }
}

function Get-AdbDevices {
  $rows = (Get-AdbDeviceRows).Items
  $ready = New-Object System.Collections.Generic.List[string]
  foreach ($row in $rows) {
    if ($row.State -eq 'device') { [void]$ready.Add([string]$row.Serial) }
  }
  return [string[]]$ready.ToArray()
}

function Resolve-Device([string]$Preferred) {
  $rows = (Get-AdbDeviceRows).Items
  $ready = New-Object System.Collections.Generic.List[object]
  $unauthorized = New-Object System.Collections.Generic.List[object]
  $offline = New-Object System.Collections.Generic.List[object]
  foreach ($row in $rows) {
    switch ($row.State) {
      'device' { [void]$ready.Add($row) }
      'unauthorized' { [void]$unauthorized.Add($row) }
      'offline' { [void]$offline.Add($row) }
    }
  }

  if ($Preferred) {
    $hit = $null
    foreach ($row in $rows) {
      if ($row.Serial -eq $Preferred) { $hit = $row; break }
    }
    if (-not $hit) {
      $seen = New-Object System.Collections.Generic.List[string]
      foreach ($row in $rows) { [void]$seen.Add(('{0}({1})' -f $row.Serial, $row.State)) }
      if ($seen.Count -eq 0) { [void]$seen.Add('(无)') }
      throw ("设备不可用: {0}。当前: {1}" -f $Preferred, ($seen.ToArray() -join ', '))
    }
    if ($hit.State -ne 'device') {
      throw ("设备状态异常: {0} → {1}" -f $Preferred, $hit.State)
    }
    return $Preferred
  }

  if ($ready.Count -eq 0) {
    if ($unauthorized.Count -gt 0) {
      throw '手机未授权 USB 调试（状态 unauthorized）。'
    }
    if ($offline.Count -gt 0) {
      throw '设备处于 offline。'
    }
    throw '未检测到 adb 设备。请开启 USB/无线调试。'
  }

  if ($ready.Count -gt 1) {
    Write-Host '多台设备，使用第一台。可用 -Serial 指定。' -ForegroundColor Yellow
    $names = foreach ($row in $ready) { $row.Serial }
    Write-Host ('  ' + ($names -join "`n  "))
  }
  return [string]$ready[0].Serial
}

function Show-FailureGuidance([string]$Message) {
  $m = [string]$Message
  Write-Host '处理建议：' -ForegroundColor Yellow

  if ($m -match 'daemon not running|cannot connect to daemon|ADB server|adb server|5037|daemon started') {
    Write-Host '  1. 开新终端执行：adb kill-server'
    Write-Host '     再执行：adb start-server'
    Write-Host '  2. 关掉可能占用 5037 端口的其他 Android/模拟器工具后重试'
    Write-Host '  3. 确认 Android platform-tools 在 PATH，再重新运行 sync-phone.bat'
    return
  }
  if ($m -match 'unauthorized|未授权') {
    Write-Host '  1. 看手机弹窗，勾选「始终允许」后点允许'
    Write-Host '  2. 若无弹窗：开发者选项 → 撤销 USB 调试授权，拔线重插'
    Write-Host '  3. 本机执行 adb kill-server 后重跑本脚本，并确认 adb devices 为 device'
    return
  }
  if ($m -match 'offline|状态异常') {
    Write-Host '  1. 拔掉 USB 重插，或关闭/重开无线调试'
    Write-Host '  2. 执行：adb reconnect'
    Write-Host '  3. 仍失败则 adb kill-server 后重试 sync-phone.bat'
    return
  }
  if ($m -match '未检测到 adb 设备|设备不可用') {
    Write-Host '  1. 手机开启「开发者选项」和「USB 调试」（无线调试亦可）'
    Write-Host '  2. USB 连接时选文件传输/MTP，不要选仅充电'
    Write-Host '  3. 本机执行：adb devices，应看到序列号且状态为 device'
    Write-Host '  4. 多台设备时用：sync-phone.bat -Serial <序列号>'
    return
  }
  if ($m -match '未找到 adb') {
    Write-Host '  1. 安装 Android SDK platform-tools'
    Write-Host '  2. 把 platform-tools 目录加入系统 PATH'
    Write-Host '  3. 新开终端执行 adb version 验证后，再运行 sync-phone.bat'
    return
  }
  if ($m -match '未找到 node') {
    Write-Host '  1. 安装 Node.js（LTS）并勾选加入 PATH'
    Write-Host '  2. 新开终端执行 node -v 验证后，再运行 sync-phone.bat'
    return
  }
  if ($m -match 'LAN 服务') {
    Write-Host '  1. 确认端口未被占用，或换端口：sync-phone.bat -Port 8081'
    Write-Host '  2. 检查防火墙是否拦截 Node.js'
    Write-Host '  3. 先手动运行：node lan-server.js 看是否有报错'
    return
  }

  Write-Host '  1. 本机执行：adb devices，确认至少一台状态为 device'
  Write-Host '  2. 执行：adb kill-server 后重试本脚本'
  Write-Host '  3. 仍失败时把上方完整错误原文发出来便于排查'
}

function Test-AppInstalled {
  $result = Invoke-Adb -AdbArgs @('-s', $script:deviceSerial, 'shell', 'pm', 'path', $packageId)
  return ($result.Text -match 'package:')
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

function New-SessionTempLog([string]$Label) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $fileName = 'sync-phone-{0}-{1}-{2}.log' -f $Label, $stamp, [System.Diagnostics.Process]::GetCurrentProcess().Id
  $path = Join-Path ([System.IO.Path]::GetTempPath()) $fileName
  [void]$script:sessionLogFiles.Add($path)
  return $path
}

function Get-LogTail([string]$Path, [int]$Lines = 10) {
  $result = New-Object System.Collections.Generic.List[string]
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) {
    return [string[]]$result.ToArray()
  }
  $reader = $null
  try {
    $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $reader = [System.IO.StreamReader]::new($fs)
    $linesAll = @([string]$reader.ReadToEnd() -split "`n")
  } finally {
    if ($reader) { $reader.Dispose() }
  }
  $linesAll = @($linesAll | ForEach-Object { ([string]$_).TrimEnd("`r") })
  $skip = [Math]::Max(0, $linesAll.Length - $Lines)
  for ($i = $skip; $i -lt $linesAll.Length; $i++) {
    [void]$result.Add([string]$linesAll[$i])
  }
  return [string[]]$result.ToArray()
}

function Start-WindowlessProcess {
  # Start a process with no console window and redirect its stdout/stderr to a
  # session temp log, so background children never create visible windows.
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory,
    [string]$LogFile
  )
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $FilePath
  foreach ($arg in $Arguments) { [void]$psi.ArgumentList.Add($arg) }
  $psi.WorkingDirectory = $WorkingDirectory
  return [ProcessTreeJob]::Start($psi, $LogFile)
}

function Stop-ProcessTree([int]$RootPid) {
  if ($RootPid -le 0) { return }
  $ids = New-Object System.Collections.Generic.List[int]
  [void]$ids.Add($RootPid)
  for ($i = 0; $i -lt $ids.Count; $i++) {
    $parent = $ids[$i]
    $children = @(Get-CimInstance Win32_Process -Filter ("ParentProcessId = {0}" -f $parent) -ErrorAction SilentlyContinue)
    foreach ($child in $children) {
      [void]$ids.Add([int]$child.ProcessId)
    }
  }
  for ($j = $ids.Count - 1; $j -ge 0; $j--) {
    Stop-Process -Id $ids[$j] -Force -ErrorAction SilentlyContinue
  }
}

function Start-LanServerIfNeeded {
  if (Test-PortOpen $Port) {
    if (Test-LanServerHasContentId) {
      $script:lanServerState = 'ok'
      Write-Log ("LAN 服务已在端口 {0}（复用，本会话未托管）" -f $Port) 'DarkCyan'
      return
    }
    Write-Log ("端口 {0} 上的旧服务无内容指纹，正在重启..." -f $Port) 'Yellow'
    Stop-ListenersOnPort
  }

  $node = (Get-Command node -ErrorAction Stop).Source
  $logPath = New-SessionTempLog 'lan-server'
  $script:lanServerLogPath = $logPath
  $script:lanServerState = 'starting'
  try {
    $proc = Start-WindowlessProcess -FilePath $node `
      -Arguments @('lan-server.js', "$Port") `
      -WorkingDirectory $root `
      -LogFile $logPath
    $script:startedServerPid = [int]$proc.Id
  } catch {
    $script:lanServerState = 'failed'
    throw ("无法启动 LAN 服务：{0}`n完整日志：{1}" -f $_.Exception.Message, $logPath)
  }
  $deadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortOpen $Port -and (Test-LanServerHasContentId)) {
      $script:lanServerState = 'ok'
      Write-Log ("已启动 LAN 服务 pid={0} port={1}" -f $script:startedServerPid, $Port) 'Green'
      return
    }
    Start-Sleep -Milliseconds 200
  }
  $script:lanServerState = 'failed'
  $tailLines = @(Get-LogTail -Path $logPath -Lines 12)
  $tailBlock = ($tailLines | ForEach-Object { "  $_" }) -join "`n"
  throw ("LAN 服务未能在端口 {0} 就绪。`n日志末尾：`n{1}`n完整日志：{2}" -f $Port, $tailBlock, $logPath)
}

function Update-LanServerState {
  if ($script:lanServerState -eq 'starting') { return }
  if (-not (Test-PortOpen $Port) -or -not (Test-LanServerHasContentId)) {
    if ($script:lanServerState -ne 'failed') {
      $script:lanServerState = 'failed'
      Write-Log ("LAN 服务不可达（端口 {0}）" -f $Port) 'Red'
    }
    return
  }
  if ($script:lanServerState -ne 'ok') {
    $script:lanServerState = 'ok'
    if ($script:startedServerPid -gt 0) {
      Write-Log 'LAN 服务已恢复' 'Green'
    }
  }
}

function Update-ContentStatus {
  $script:contentId = Get-ContentIdSafe
  if (-not $script:lastChangeAt) {
    $script:lastChangeAt = Get-Date
  }
}

function Stop-LiveReloadSession([string]$Reason = '') {
  if ($script:liveReloadProcess) {
    try {
      if (-not $script:liveReloadProcess.HasExited) {
        Stop-ProcessTree $script:liveReloadPid
      }
    } catch {
      # ignore
    }
  }
  $script:liveReloadProcess = $null
  $script:liveReloadPid = 0
  $script:liveReloadLaunched = $false
  $script:liveReloadClients = 0
  if ($script:liveReloadState -ne 'stopped') { $script:liveReloadState = 'stopped' }
  if ($Reason) {
    Write-Log $Reason 'DarkYellow'
  }
  Update-PhoneRunId -RefreshPackaged
}

function Get-LocalLiveReloadClients {
  try {
    $health = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri ("http://127.0.0.1:{0}/__health" -f $Port)
    if ($health.Content -match '"clients"\s*:\s*(\d+)') {
      return [int]$Matches[1]
    }
  } catch {
    # ignore
  }
  return 0
}

function Get-LiveReloadBuildPhaseText {
  # 后台 preview-native.ps1 会先构建并推送安装 APK，再等 WebView 订阅。
  # 依据实时日志判断当前阶段，避免把「构建/推送中」误报为「等待连接」。
  $text = [string]::Join("`n", @($script:liveReloadTail))
  if ($text -match 'BUILD FAILED|FAILURE|error:|Error:') {
    return @{ Text = '后台构建/推送失败，日志见上'; Phase = 'fail' }
  }
  if ($text -match '==>|Task :|BUILD SUCCESSFUL|Installing|Installed|installDebug|Gradle|:app:|Syncing|Target device') {
    return @{ Text = '正在后台构建并推送安装到手机…'; Phase = 'busy' }
  }
  return @{ Text = '等待手机连上热更新…'; Phase = 'busy' }
}

function Update-LiveReloadBuildTail([string]$LogPath, [int]$Lines = 6) {
  $script:liveReloadTail.Clear()
  if (-not $LogPath) { return }
  foreach ($line in @(Get-LogTail -Path $LogPath -Lines $Lines)) {
    [void]$script:liveReloadTail.Add([string]$line)
  }
  $phase = Get-LiveReloadBuildPhaseText
  Set-FeedbackAction $phase.Text $phase.Phase
}

function Wait-LiveReloadClients([int]$TimeoutSec = 600, [int]$IdleTimeoutSec = 90, [string]$LogPath = '') {
  # 先等后台进程完成构建与推送安装（日志持续写入期间不超时），
  # 只有日志长时间无变化且 WebView 仍未连上时才判定超时。
  # 提前捕获进程对象：Show-Dashboard 的 Update-LiveReloadState 可能把
  # $script:liveReloadProcess 置空，不能依赖脚本变量判断退出。
  $proc = $script:liveReloadProcess
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $lastLogText = ''
  $lastLogChange = Get-Date
  $lastDraw = Get-Date
  while ((Get-Date) -lt $deadline) {
    if ($proc) {
      try {
        if ($proc.HasExited) { return @{ Ok = $false; Reason = 'exited'; Clients = 0 } }
      } catch {
        return @{ Ok = $false; Reason = 'exited'; Clients = 0 }
      }
    }
    $clients = Get-LocalLiveReloadClients
    $script:liveReloadClients = $clients
    if ($clients -gt 0) {
      return @{ Ok = $true; Reason = 'connected'; Clients = $clients }
    }
    if ($LogPath) {
      $tailLines = @(Get-LogTail -Path $LogPath -Lines 6)
      $text = [string]::Join("`n", $tailLines)
      if ($text -ne $lastLogText) {
        $lastLogText = $text
        $lastLogChange = Get-Date
      }
      if ($lastLogText -ne '' -and (Get-Date) -gt $lastLogChange.AddSeconds($IdleTimeoutSec)) {
        return @{ Ok = $false; Reason = 'timeout'; Clients = 0 }
      }
      # 定期刷新主面板，让用户看到构建/推送的实时进度。
      if ((Get-Date) -gt $lastDraw.AddSeconds(1.5)) {
        $lastDraw = Get-Date
        Update-LiveReloadBuildTail -LogPath $LogPath
        Show-Dashboard
      }
    }
    Start-Sleep -Milliseconds 700
  }
  return @{ Ok = $false; Reason = 'timeout'; Clients = 0 }
}

function Update-LiveReloadState {
  if (-not $script:liveReloadProcess) { return }
  try {
    if (-not $script:liveReloadProcess.HasExited) { return }
  } catch {
    # Process object may be stale.
  }
  $script:liveReloadProcess = $null
  $script:liveReloadPid = 0
  if ($script:liveReloadLaunched) {
    $script:liveReloadLaunched = $false
    $script:liveReloadClients = 0
    $script:liveReloadState = 'exited'
    $script:lastErrorTail.Clear()
    foreach ($line in @(Get-LogTail -Path $script:liveReloadLogPath -Lines $(if ($script:showDetails) { 40 } else { 10 }))) {
      [void]$script:lastErrorTail.Add($line)
    }
    Write-Log '热更新进程已退出，模式回到 LAN 已通' 'DarkYellow'
    Set-FeedbackAction '热更新进程已退出' 'warn'
    Update-PhoneRunId -RefreshPackaged
  }
}

function Get-LanServerStatusText {
  switch ($script:lanServerState) {
    'ok' { return @{ Text = '正常'; Color = 'Green' } }
    'failed' { return @{ Text = '失败'; Color = 'Red' } }
    default { return @{ Text = '启动中'; Color = 'Yellow' } }
  }
}

function Get-LiveReloadStatusText {
  switch ($script:liveReloadState) {
    'connected' { return @{ Text = ('已连接 · clients={0}' -f $script:liveReloadClients); Color = 'Green' } }
    'connecting' { return @{ Text = '构建/推送中'; Color = 'Yellow' } }
    'exited' { return @{ Text = '异常退出'; Color = 'Red' } }
    default { return @{ Text = '未启动'; Color = 'DarkGray' } }
  }
}

function Get-PreviewMode {
  # hot: WebView subscribed to Live Reload (save -> phone refreshes)
  # hot-wait: preview window started but clients=0 (phone still on APK assets)
  # ready: LAN OK, waiting for [L]
  # apk: phone cannot reach LAN; must use packaged assets
  Update-LiveReloadState
  if (-not $script:serverReachable) { return 'apk' }
  if ($script:liveReloadLaunched -and $script:liveReloadClients -gt 0) { return 'hot' }
  if ($script:liveReloadLaunched) { return 'hot-wait' }
  return 'ready'
}

function Get-NextStep {
  $mode = Get-PreviewMode
  if ($mode -eq 'hot') {
    return @{ Text = '可以了：保存文件后，手机一般会自动更新'; Color = 'Green' }
  }
  if ($mode -eq 'hot-wait') {
    return @{ Text = '还没连上预览，请再按 1；不要只按 2'; Color = 'Yellow' }
  }
  if ($mode -eq 'ready') {
    if (-not $script:appInstalled) {
      return @{ Text = '请先按 2，把 App 安装到手机'; Color = 'Yellow' }
    }
    return @{ Text = '请按 1，开启「保存后自动更新」'; Color = 'Cyan' }
  }
  if (-not $script:appInstalled) {
    return @{ Text = '手机连不上电脑网络，请先按 2 安装'; Color = 'Yellow' }
  }
  return @{ Text = '手机连不上电脑网络，改动请按 2 更新到手机'; Color = 'Yellow' }
}

function Get-ModeShortLabel([string]$Mode) {
  if ($script:showDetails) {
    switch ($Mode) {
      'hot' { return @{ Text = ("热更新 · clients={0}" -f $script:liveReloadClients); Color = 'Green' } }
      'hot-wait' { return @{ Text = '等待WebView'; Color = 'Yellow' } }
      'ready' { return @{ Text = 'LAN就绪'; Color = 'Cyan' } }
      default { return @{ Text = '包内资源'; Color = 'Yellow' } }
    }
  }
  switch ($Mode) {
    'hot' { return @{ Text = '已就绪'; Color = 'Green' } }
    'hot-wait' { return @{ Text = '连接中'; Color = 'Yellow' } }
    'ready' { return @{ Text = '待开启'; Color = 'Cyan' } }
    default { return @{ Text = '需更新'; Color = 'Yellow' } }
  }
}

function Get-SimpleStatusLine([string]$Mode) {
  if (-not $script:appInstalled) {
    return @{ Text = '手机上还没有这个 App'; Color = 'Yellow' }
  }
  if ($Mode -eq 'hot') {
    return @{ Text = '手机已连接，保存即可更新'; Color = 'Green' }
  }
  if ($Mode -eq 'hot-wait') {
    return @{ Text = '正在连接手机预览…'; Color = 'Yellow' }
  }
  if ($script:serverReachable) {
    return @{ Text = '手机已连上电脑，还差一步开启预览'; Color = 'Cyan' }
  }
  return @{ Text = '手机与电脑未连上同一网络'; Color = 'Yellow' }
}

function Show-Dashboard {
  # Hallmark · macrostructure: Index-First · tone: utilitarian · genre: modern-minimal
  # medium: console-tui · audience: non-expert default · -Details for diagnostics
  Clear-Host
  $script:dashboardShown = $true
  $changeText = if ($script:lastChangeAt) { $script:lastChangeAt.ToString('HH:mm:ss') } else { '-' }
  $autoText = if ($script:autoDeploy) { '开' } else { '关' }
  $mode = Get-PreviewMode
  $modeLabel = Get-ModeShortLabel $mode
  $next = Get-NextStep
  $simpleStatus = Get-SimpleStatusLine $mode
  $phaseMeta = Get-FeedbackPhaseMeta $script:feedbackAction.Phase
  $phaseIsProblem = ($script:feedbackAction.Phase -eq 'fail' -or $script:feedbackAction.Phase -eq 'warn')

  Write-Host ''
  Write-Host '  手机同步 · ' -NoNewline -ForegroundColor DarkGray
  Write-Host $modeLabel.Text -ForegroundColor $modeLabel.Color
  Write-Host ''

  Write-Host '  →  ' -NoNewline -ForegroundColor White
  Write-Host $next.Text -ForegroundColor $next.Color
  Write-Host ''

  Write-Host ('  {0}' -f $simpleStatus.Text) -ForegroundColor $simpleStatus.Color
  Write-FingerprintPair

  $lanStatus = Get-LanServerStatusText
  $lrStatus = Get-LiveReloadStatusText
  Write-Host '  LAN 服务    ' -NoNewline -ForegroundColor DarkGray
  Write-Host $lanStatus.Text -ForegroundColor $lanStatus.Color
  Write-Host '  Live Reload ' -NoNewline -ForegroundColor DarkGray
  Write-Host $lrStatus.Text -ForegroundColor $lrStatus.Color
  if ($script:showDetails) {
    if ($script:startedServerPid -gt 0) {
      Write-Host ("  LAN 服务 pid={0} · 日志 {1}" -f $script:startedServerPid, $(if ($script:lanServerLogPath) { $script:lanServerLogPath } else { '-' })) -ForegroundColor DarkGray
    } elseif ($script:lanServerState -eq 'ok') {
      Write-Host '  LAN 服务复用外部进程（本会话未托管）' -ForegroundColor DarkGray
    }
    if ($script:liveReloadPid -gt 0) {
      Write-Host ("  Live Reload pid={0} · 日志 {1}" -f $script:liveReloadPid, $(if ($script:liveReloadLogPath) { $script:liveReloadLogPath } else { '-' })) -ForegroundColor DarkGray
    }
  }

  if ($script:showDetails) {
    Write-Host '  ' -NoNewline -ForegroundColor DarkGray
    if ($script:serverReachable) {
      Write-Host 'LAN可达' -NoNewline -ForegroundColor Green
    } else {
      Write-Host 'LAN不可达' -NoNewline -ForegroundColor Yellow
    }
    Write-Host ' · ' -NoNewline -ForegroundColor DarkGray
    Write-Host ($(if ($script:appInstalled) { '已安装' } else { '未安装' })) -NoNewline -ForegroundColor $(if ($script:appInstalled) { 'Green' } else { 'Yellow' })
    Write-Host ' · ' -NoNewline -ForegroundColor DarkGray
    Write-Host (Get-ShortDevice $script:deviceSerial) -NoNewline -ForegroundColor DarkGray
    if ($script:phoneLanId) {
      Write-Host ' · ' -NoNewline -ForegroundColor DarkGray
      Write-Host ("健康检查 {0}" -f $script:phoneLanId) -NoNewline -ForegroundColor DarkGray
    }
    if ($script:pendingDeploy) {
      Write-Host ' · ' -NoNewline -ForegroundColor DarkGray
      Write-Host ($(if ($mode -eq 'apk') { '有未推送改动' } else { '本地已更新' })) -NoNewline -ForegroundColor $(if ($mode -eq 'apk') { 'Yellow' } else { 'DarkGray' })
    }
    if ($script:autoDeploy) {
      Write-Host (" · 自动推送 {0}" -f $autoText) -NoNewline -ForegroundColor DarkGray
    }
    if ($script:lanUrl) {
      Write-Host ''
      Write-Host ("  {0} · 更新 {1}" -f $script:lanUrl, $changeText) -ForegroundColor DarkGray
    } else {
      Write-Host ''
    }
  }

  Write-Host '  ' -NoNewline
  Write-Host $phaseMeta.Mark -NoNewline -ForegroundColor $phaseMeta.Color
  Write-Host ' · ' -NoNewline -ForegroundColor DarkGray
  Write-Host $script:feedbackAction.Text -ForegroundColor $phaseMeta.Color
  Write-Host ''

  if ($script:liveReloadState -eq 'exited' -and $script:lastErrorTail.Count -gt 0) {
    Write-Host ''
    Write-Host '  热更新进程异常退出，日志末尾：' -ForegroundColor Red
    foreach ($line in @($script:lastErrorTail)) {
      Write-Host ('  {0}' -f $line) -ForegroundColor DarkGray
    }
    if ($script:liveReloadLogPath) {
      Write-Host ('  完整日志：{0}' -f $script:liveReloadLogPath) -ForegroundColor DarkGray
    }
  }

  if ($script:liveReloadState -eq 'connecting' -and $script:liveReloadTail.Count -gt 0) {
    Write-Host ''
    Write-Host '  后台构建/推送实时日志：' -ForegroundColor DarkGray
    foreach ($line in @($script:liveReloadTail)) {
      Write-Host ('  {0}' -f $line) -ForegroundColor DarkGray
    }
    if ($script:showDetails -and $script:liveReloadLogPath) {
      Write-Host ('  完整日志：{0}' -f $script:liveReloadLogPath) -ForegroundColor DarkGray
    }
  }

  Write-Host '  1  开启保存即更新' -ForegroundColor Gray
  Write-Host '  2  安装/更新到手机' -ForegroundColor Gray
  Write-Host '  3  刷新连接与版本' -ForegroundColor Gray
  Write-Host '  0  退出' -ForegroundColor Gray
  if ($script:showDetails) {
    Write-Host '  4 重启  5 指纹  6 自动  7 清缓存  8 清数据  9 仅www' -ForegroundColor DarkGray
  } else {
    Write-Host '  （更多诊断：sync-phone.bat -Details）' -ForegroundColor DarkGray
  }

  if ($script:showDetails -or ($phaseIsProblem -and $script:logLines.Count -gt 0)) {
    Write-Host ''
    $lines = @($script:logLines)
    if (-not $script:showDetails -and $lines.Count -gt 1) {
      $lines = @($lines[$lines.Count - 1])
    }
    foreach ($line in $lines) {
      Write-Host ('  {0}' -f $line) -ForegroundColor DarkGray
    }
  }
  Write-Host ''
}

function Invoke-Deploy {
  Set-FeedbackAction '正在打包并推送到手机…' 'busy'
  Write-Log '开始打包并推送到手机...' 'Cyan'
  Show-Dashboard
  # Packaged APK has no server.url; an old Live Reload window would lie about "hot".
  if ($script:liveReloadLaunched -or $script:liveReloadProcess) {
    Stop-LiveReloadSession '打包推送会写入包内资源，已停止后台热更新进程（需要热更新请稍后按 1）'
  }
  $deployArgs = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', $deployScript,
    '-Serial', $script:deviceSerial
  )
  & powershell @deployArgs
  if (-not $?) {
    Write-Log '推送失败' 'Red'
    $script:pendingDeploy = $true
    Set-FeedbackAction '打包推送失败' 'fail'
    return $false
  }
  $script:lastDeployId = Get-ContentIdSafe
  $script:lastDeployAt = Get-Date
  $script:pendingDeploy = $false
  $script:appInstalled = $true
  $script:phonePackagedId = $script:lastDeployId
  $script:phoneRunId = $script:lastDeployId
  $script:contentId = $script:lastDeployId
  Write-Log ("推送完成 id={0}（当前为包内资源；要热更新请按 1）" -f $script:lastDeployId) 'Green'
  Set-FeedbackAction ("打包推送完成 · {0} · 按 1 可开热更新" -f $script:lastDeployId) 'ok'
  return $true
}

function Invoke-RestartApp {
  Set-FeedbackAction '正在重启 App…' 'busy'
  Write-Log '重启 App...' 'Cyan'
  Show-Dashboard
  [void](Invoke-Adb -AdbArgs @('-s', $script:deviceSerial, 'shell', 'am', 'force-stop', $packageId))
  Start-Sleep -Milliseconds 300
  [void](Invoke-Adb -AdbArgs @('-s', $script:deviceSerial, 'shell', 'am', 'start', '-n', "$packageId/.MainActivity"))
  Write-Log '已重新打开 App' 'Green'
  Set-FeedbackAction 'App 已重新打开' 'ok'
}

function Invoke-ClearCacheAndRestart {
  Set-FeedbackAction '正在清缓存并重开…' 'busy'
  Write-Log '清除应用缓存并重开...' 'Cyan'
  Show-Dashboard
  [void](Invoke-Adb -AdbArgs @('-s', $script:deviceSerial, 'shell', 'am', 'force-stop', $packageId))
  [void](Invoke-Adb -AdbArgs @('-s', $script:deviceSerial, 'shell', 'pm', 'clear', '--cache-only', $packageId))
  Start-Sleep -Milliseconds 250
  [void](Invoke-Adb -AdbArgs @('-s', $script:deviceSerial, 'shell', 'am', 'start', '-n', "$packageId/.MainActivity"))
  Write-Log '缓存清理流程已执行并重新打开' 'Green'
  Set-FeedbackAction '缓存已清理并重新打开' 'ok'
}

function Invoke-WipeAppData {
  Write-Host ''
  Write-Host '将清除应用全部数据（含本地名单等），确认请输入 y 后回车：' -ForegroundColor Yellow
  $answer = Read-Host
  if ($answer -ne 'y' -and $answer -ne 'Y') {
    Write-Log '已取消清除全部数据' 'DarkYellow'
    Set-FeedbackAction '已取消清除全部数据' 'warn'
    return
  }
  Set-FeedbackAction '正在清除应用全部数据…' 'busy'
  Write-Log '清除应用全部数据...' 'Cyan'
  Show-Dashboard
  [void](Invoke-Adb -AdbArgs @('-s', $script:deviceSerial, 'shell', 'am', 'force-stop', $packageId))
  [void](Invoke-Adb -AdbArgs @('-s', $script:deviceSerial, 'shell', 'pm', 'clear', $packageId))
  [void](Invoke-Adb -AdbArgs @('-s', $script:deviceSerial, 'shell', 'am', 'start', '-n', "$packageId/.MainActivity"))
  Write-Log '应用数据已清除并重新打开' 'Green'
  Set-FeedbackAction '应用数据已清除并重新打开' 'ok'
}

function Invoke-SyncWwwOnly {
  Set-FeedbackAction '正在同步 www…' 'busy'
  Write-Log '同步 www（仅电脑打包目录）...' 'Cyan'
  Show-Dashboard
  & powershell -NoProfile -ExecutionPolicy Bypass -File $syncWwwScript
  if (-not $?) {
    Write-Log 'www 同步失败' 'Red'
    Set-FeedbackAction 'www 同步失败' 'fail'
    Update-ContentStatus
    return
  }
  Write-Log 'www 同步完成（不会自动改手机画面）' 'Green'
  $mode = Get-PreviewMode
  if ($mode -eq 'hot') {
    Write-Log '当前已在热更新：改 src/ 保存即可，不必靠 S' 'Cyan'
    Set-FeedbackAction 'www 已同步 · 热更新中请直接保存源码' 'ok'
  } elseif ($mode -eq 'hot-wait') {
    Write-Log '热更新窗口在，但 WebView 未连上；可按 3 或 2' 'Yellow'
    Set-FeedbackAction 'www 已同步 · 手机未变（WebView 未连上）' 'warn'
  } elseif ($script:serverReachable -and $script:appInstalled) {
    Write-Log '手机要看到改动：按 1 开热更新，或按 2 重装 APK' 'Yellow'
    Set-FeedbackAction 'www 已同步 · 手机未变，请按 1 或 2' 'warn'
  } else {
    Write-Log '手机要看到改动：请按 2 打包推送' 'Yellow'
    Set-FeedbackAction 'www 已同步 · 手机未变，请按 2' 'warn'
  }
  Update-ContentStatus
}

function Test-PhoneHealth {
  Set-FeedbackAction '正在检测手机连接…' 'busy'
  if ($script:dashboardShown) { Show-Dashboard }
  $healthUrl = ($script:lanUrl.TrimEnd('/') + '/__health')
  $result = Invoke-Adb -AdbArgs @('-s', $script:deviceSerial, 'shell', "curl -s --connect-timeout 3 `"$healthUrl`"")
  $text = $result.Text.Trim()
  $phoneId = $null
  if ($text -match '"id"\s*:\s*"([^"]+)"') { $phoneId = $Matches[1] }
  $ok = $text -match '"ok"\s*:\s*true'
  $clients = 0
  if ($text -match '"clients"\s*:\s*(\d+)') { $clients = [int]$Matches[1] }
  $script:serverReachable = $ok
  $script:phoneLanId = if ($phoneId) { $phoneId } else { '' }
  $script:liveReloadClients = $clients
  $pcId = Get-ContentIdSafe
  $script:contentId = $pcId
  $script:appInstalled = Test-AppInstalled
  Update-PhoneRunId -RefreshPackaged

  if ($ok -and $script:phoneRunId -and $pcId -and $script:phoneRunId -eq $pcId) {
    Write-Log ("连接 OK · 本地与手机运行一致 {0}" -f $pcId) 'Green'
    Set-FeedbackAction ("连接 OK · 版本一致 {0}" -f $pcId) 'ok'
  } elseif ($ok -and $script:phoneRunId) {
    Write-Log ("连接 OK · 本地 {0}，手机运行 {1}" -f $pcId, $script:phoneRunId) 'Yellow'
    Set-FeedbackAction ("已连接 · 版本不一致（手机 {0}）" -f $script:phoneRunId) 'warn'
  } elseif ($ok) {
    Write-Log '手机可访问电脑网络，但尚未读到手机版本指纹' 'Yellow'
    Set-FeedbackAction '已连接，但手机版本未知' 'warn'
  } else {
    Write-Log '手机访问不到电脑网络。请确认同一 Wi-Fi / 防火墙放行。' 'Yellow'
    Set-FeedbackAction '手机连不上电脑网络' 'warn'
  }

  if ($script:liveReloadLaunched -and $clients -gt 0) {
    Write-Log '热更新已接通：保存代码后手机应自动刷新' 'Green'
  } elseif ($script:liveReloadLaunched -and $ok) {
    Write-Log '热更新已在后台启动，但还未连上，手机可能仍是安装包版本' 'Yellow'
  } elseif ($ok -and $script:appInstalled) {
    Write-Log '可按 1 开启保存即更新' 'Cyan'
  } elseif (-not $script:appInstalled) {
    Write-Log '未检测到 App，请按 2 安装' 'Yellow'
  }
}

function Start-LiveReloadPreview {
  if (-not $script:appInstalled) {
    Write-Log '尚未安装 App，先按 2 打包安装' 'Yellow'
    Set-FeedbackAction '尚未安装 App，请先按 2' 'warn'
    return
  }
  if (-not $script:serverReachable) {
    Write-Log '手机还访问不到 LAN，热更新可能失败；仍尝试启动...' 'Yellow'
  }

  $existingClients = Get-LocalLiveReloadClients
  if ($script:liveReloadProcess -and -not $script:liveReloadProcess.HasExited -and $existingClients -gt 0) {
    $script:liveReloadClients = $existingClients
    $script:liveReloadLaunched = $true
    $script:liveReloadState = 'connected'
    Update-PhoneRunId
    Write-Log ("热更新已接通 · clients={0}；保存即可刷新" -f $existingClients) 'Green'
    Set-FeedbackAction ("热更新已接通 · clients={0}" -f $existingClients) 'ok'
    return
  }
  if ($script:liveReloadProcess -and -not $script:liveReloadProcess.HasExited) {
    Write-Log '旧热更新进程未接通 WebView，正在停止并重建…' 'Yellow'
    Stop-LiveReloadSession
  }

  $logPath = New-SessionTempLog 'livereload'
  $script:liveReloadLogPath = $logPath
  $pwsh = (Get-Command pwsh -ErrorAction Stop).Source
  $script:liveReloadState = 'connecting'
  Set-FeedbackAction '正在后台启动热更新…' 'busy'
  Write-Log ("后台启动热更新 → {0}" -f $script:lanUrl) 'Cyan'
  Write-Log ("目标设备：{0}" -f $script:deviceSerial) 'DarkGray'
  Show-Dashboard

  $arguments = @(
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', $previewScript,
    '-Controlled',
    '-Serial', $script:deviceSerial,
    '-NoServer',
    '-Port', "$Port"
  )
  if ($script:lanIp) {
    $arguments += @('-HostAddress', $script:lanIp)
  }
  try {
    $script:liveReloadProcess = Start-WindowlessProcess -FilePath $pwsh `
      -Arguments $arguments `
      -WorkingDirectory $root `
      -LogFile $logPath
    $script:liveReloadPid = [int]$script:liveReloadProcess.Id
  } catch {
    $script:liveReloadState = 'exited'
    $script:lastErrorTail.Clear()
    [void]$script:lastErrorTail.Add(('无法启动热更新进程：{0}' -f $_.Exception.Message))
    Write-Log '热更新后台进程启动失败' 'Red'
    Set-FeedbackAction '热更新启动失败 · 查看日志' 'fail'
    Show-Dashboard
    return
  }
  $script:liveReloadLaunched = $true
  Write-Log ("已后台启动热更新 pid={0}，正在构建并推送安装到手机（首次可能较慢）…" -f $script:liveReloadPid) 'Cyan'
  Set-FeedbackAction '正在后台构建并推送安装到手机…' 'busy'
  Show-Dashboard

  $wait = Wait-LiveReloadClients -LogPath $logPath
  if ($wait.Ok) {
    $script:liveReloadState = 'connected'
    Update-PhoneRunId
    Write-Log ("热更新已接通 · clients={0}；保持脚本运行，保存即可刷新" -f $wait.Clients) 'Green'
    Set-FeedbackAction ("热更新已接通 · clients={0}" -f $wait.Clients) 'ok'
    return
  }
  if ($wait.Reason -eq 'exited') {
    $tailLines = @(Get-LogTail -Path $logPath -Lines $(if ($script:showDetails) { 40 } else { 10 }))
    Stop-LiveReloadSession
    $script:liveReloadState = 'exited'
    $script:lastErrorTail.Clear()
    foreach ($line in $tailLines) {
      [void]$script:lastErrorTail.Add($line)
    }
    Write-Log '热更新进程异常退出，日志末尾见上；请再按 1 重试' 'Red'
    Set-FeedbackAction '热更新后台进程异常退出 · 请再按 1' 'fail'
    Show-Dashboard
    return
  }
  Write-Log '等待超时仍未接通：后台日志长时间无进展且 WebView 未连上。请确认手机与电脑同一 Wi-Fi、App 已安装打开（-Details 可看后台日志）' 'Yellow'
  Set-FeedbackAction '热更新未接通（后台无进展）· 可再按 1' 'warn'
}

function Start-Watchers {
  $handler = {
    $state = $Event.MessageData
    $state.Dirty = $true
    $state.LastChange = Get-Date
  }

  foreach ($name in @('src')) {
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
  Write-Log '已监视 src/' 'DarkCyan'
}

function Stop-OwnedServer {
  if ($script:liveReloadProcess) {
    Stop-LiveReloadSession
  }
  if ($script:startedServerPid -gt 0) {
    Stop-ProcessTree $script:startedServerPid
    Write-Host ("已停止本脚本启动的 LAN 服务 pid={0}" -f $script:startedServerPid) -ForegroundColor DarkGray
    $script:startedServerPid = 0
  }
  foreach ($w in $script:watchers) {
    try { $w.EnableRaisingEvents = $false; $w.Dispose() } catch { }
  }
  Get-EventSubscriber -ErrorAction SilentlyContinue | Where-Object { $_.SourceObject -is [IO.FileSystemWatcher] } | Unregister-Event -ErrorAction SilentlyContinue
  if ($script:jobAvailable) {
    try { [void][ProcessTreeJob]::Close() } catch { }
    $script:jobAvailable = $false
  }
  if ($script:cleanupLogs) {
    foreach ($file in $script:sessionLogFiles) {
      try { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue } catch { }
    }
    $script:sessionLogFiles.Clear()
  }
}

# ---- main ----
Push-Location $root
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '未找到 node' }
  if (-not (Get-Command adb -ErrorAction SilentlyContinue)) { throw '未找到 adb' }

  Write-Host '正在连接 adb 设备...' -ForegroundColor Cyan
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
    Write-Log '已安装且 LAN 可达：跳过打包。日常请按 1 热更新' 'Green'
  }

  if ($shouldDeploy) {
    [void](Invoke-Deploy)
  }

  $debounceUntil = Get-Date
  $lastLanHealthAt = Get-Date
  Set-FeedbackAction '已就绪，请按下方按键' 'idle'
  Show-Dashboard

  while ($true) {
    $hasKey = $false
    try { $hasKey = [Console]::KeyAvailable } catch { $hasKey = $false }
    if ($hasKey) {
      $key = [Console]::ReadKey($true)
      $digit = Get-MenuDigit $key
      switch ($digit) {
        '0' {
          Set-FeedbackInput '0' '退出'
          Set-FeedbackAction '正在退出…' 'busy'
          $script:cleanupLogs = $true
          Show-Dashboard
          break
        }
        '1' {
          Set-FeedbackInput '1' '开启热更新'
          Set-FeedbackAction '已收到指令 · 准备开启热更新' 'busy'
          Show-Dashboard
          Start-LiveReloadPreview
        }
        '2' {
          Set-FeedbackInput '2' '打包推送'
          Set-FeedbackAction '已收到指令 · 准备打包推送' 'busy'
          Show-Dashboard
          [void](Invoke-Deploy)
        }
        '3' {
          Set-FeedbackInput '3' '检测手机连接'
          Set-FeedbackAction '已收到指令 · 准备检测' 'busy'
          Show-Dashboard
          Test-PhoneHealth
        }
        '4' {
          Set-FeedbackInput '4' '重启 App'
          Set-FeedbackAction '已收到指令 · 准备重启' 'busy'
          Show-Dashboard
          Invoke-RestartApp
        }
        '5' {
          Set-FeedbackInput '5' '刷新指纹'
          Set-FeedbackAction '已收到指令 · 正在刷新指纹' 'busy'
          Show-Dashboard
          Update-ContentStatus
          Update-PhoneRunId -RefreshPackaged
          Write-Log ("本地 {0} · 手机运行 {1}" -f $script:contentId, $(if ($script:phoneRunId) { $script:phoneRunId } else { '未知' })) 'Yellow'
          Set-FeedbackAction ("指纹已刷新 · 本地 {0}" -f $script:contentId) 'ok'
        }
        '6' {
          Set-FeedbackInput '6' '开关自动推送'
          $script:autoDeploy = -not $script:autoDeploy
          $autoLabel = if ($script:autoDeploy) { '开（保存后打 APK，较慢）' } else { '关' }
          Write-Log ("自动打包推送 → {0}" -f $autoLabel) 'Cyan'
          Set-FeedbackAction ("自动推送已切换为 {0}" -f $autoLabel) 'ok'
        }
        '7' {
          Set-FeedbackInput '7' '清缓存并重开'
          Set-FeedbackAction '已收到指令 · 准备清缓存' 'busy'
          Show-Dashboard
          Invoke-ClearCacheAndRestart
        }
        '8' {
          Set-FeedbackInput '8' '清除全部数据'
          Set-FeedbackAction '已收到指令 · 等待确认' 'busy'
          Show-Dashboard
          Invoke-WipeAppData
        }
        '9' {
          Set-FeedbackInput '9' '仅同步 www'
          Set-FeedbackAction '已收到指令 · 准备同步 www' 'busy'
          Show-Dashboard
          Invoke-SyncWwwOnly
        }
        default {
          $shown = if ($digit) { $digit } elseif ($key.KeyChar) { [string]$key.KeyChar } else { [string]$key.Key }
          Set-FeedbackInput $shown '未绑定按键'
          Set-FeedbackAction ("未识别按键 [{0}]，请按下方数字（无需回车）" -f $shown) 'warn'
        }
      }
      if ($digit -eq '0') { break }
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
        Update-PhoneRunId
        Write-Log ("已更新 {0} · 热更新应自动刷新手机" -f $script:contentId) 'Green'
        Set-FeedbackAction ("检测到改动 {0} · 热更新应已刷新" -f $script:contentId) 'ok'
      } elseif ($mode -eq 'hot-wait') {
        Write-Log ("已更新 {0} · WebView 未连上，手机可能仍是旧 APK" -f $script:contentId) 'Yellow'
        Set-FeedbackAction ("检测到改动 {0} · 请回 App 前台或按 2" -f $script:contentId) 'warn'
      } elseif ($mode -eq 'ready') {
        Write-Log ("已更新 {0} · 按 1 开热更新后即可免推送（9 不会改手机）" -f $script:contentId) 'Yellow'
        Set-FeedbackAction ("检测到改动 {0} · 建议按 1" -f $script:contentId) 'warn'
      } else {
        Write-Log ("已更新 {0} · 当前需按 2 推送，或先修好网络再按 1" -f $script:contentId) 'Yellow'
        Set-FeedbackAction ("检测到改动 {0} · 需按 2 推送" -f $script:contentId) 'warn'
      }
      if ($script:autoDeploy) {
        [void](Invoke-Deploy)
      }
      Show-Dashboard
    }

    if ((Get-Date) -ge $lastLanHealthAt.AddSeconds(5)) {
      $lastLanHealthAt = Get-Date
      Update-LanServerState
    }

    Start-Sleep -Milliseconds 150
  }
} catch {
  Write-Host ''
  Write-Host ("错误: {0}" -f $_.Exception.Message) -ForegroundColor Red
  Write-Host ''
  Show-FailureGuidance $_.Exception.Message
  Write-Host ''
  exit 1
} finally {
  Stop-OwnedServer
  Pop-Location
  Write-Host '已退出同步控制台。' -ForegroundColor DarkGray
}
