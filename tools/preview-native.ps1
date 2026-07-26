[CmdletBinding()]
param(
  [string]$Serial = '',
  [string]$HostAddress = '',
  [int]$Port = 8080,
  [switch]$Lan,
  [switch]$Usb,
  [switch]$NoServer
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

try {
  $utf8 = [System.Text.UTF8Encoding]::new($false)
  [Console]::OutputEncoding = $utf8
  $OutputEncoding = $utf8
} catch {
  # Host may not expose a console; keep going.
}

$root = Split-Path -Parent $PSScriptRoot

function Write-Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-CommandExists([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing command: $Name"
  }
}

function Test-PortOpen([int]$PortNumber) {
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $async = $client.BeginConnect('127.0.0.1', $PortNumber, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne(400)
    if (-not $ok) {
      $client.Close()
      return $false
    }
    $client.EndConnect($async)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Test-IsLikelyVpnOrVirtualIPv4([string]$Ip) {
  # Clash/fake-ip and similar tunnels often use 198.18.0.0/15; skip for Live Reload.
  return [bool]($Ip -match '^198\.1[89]\.')
}

function Get-LanAddressRank([string]$Ip) {
  # Prefer common home/office Wi-Fi ranges over other adapters.
  if ($Ip -match '^192\.168\.') { return 0 }
  if ($Ip -match '^10\.') { return 1 }
  if ($Ip -match '^172\.(1[6-9]|2[0-9]|3[0-1])\.') { return 2 }
  return 9
}

function Get-LanIPv4Addresses {
  $list = New-Object System.Collections.Generic.List[string]
  if (Get-Command Get-NetIPAddress -ErrorAction SilentlyContinue) {
    foreach ($addr in @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue)) {
      $ip = [string]$addr.IPAddress
      if (-not $ip -or $ip -eq '127.0.0.1') { continue }
      if ($ip.StartsWith('169.254.')) { continue }
      if (Test-IsLikelyVpnOrVirtualIPv4 $ip) { continue }
      [void]$list.Add($ip)
    }
  } else {
    $raw = & node -e "const os=require('os');console.log(Object.values(os.networkInterfaces()).flat().filter(i=>i&&i.family==='IPv4'&&!i.internal).map(i=>i.address).join('\n'))"
    foreach ($ip in @($raw)) {
      $text = [string]$ip
      if (-not $text) { continue }
      $text = $text.Trim()
      if (Test-IsLikelyVpnOrVirtualIPv4 $text) { continue }
      [void]$list.Add($text)
    }
  }

  return [string[]]@(
    $list.ToArray() | Sort-Object @{ Expression = { Get-LanAddressRank $_ } }, { $_ }
  )
}

function Test-PhoneCanReachUrl([string]$Device, [string]$Url) {
  $healthUrl = ($Url.TrimEnd('/') + '/__health')
  $raw = & adb -s $Device shell "curl -s --connect-timeout 3 `"$healthUrl`"" 2>$null
  $text = [string]::Join('', @($raw)).Trim()
  if ($text -match '"ok"\s*:\s*true') {
    $id = $null
    if ($text -match '"id"\s*:\s*"([^"]+)"') { $id = $Matches[1] }
    return @{ Ok = $true; Id = $id; Raw = $text }
  }
  return @{ Ok = $false; Id = $null; Raw = $text }
}

function Get-AdbDeviceList {
  # Windows PowerShell 5.1 + Stop treats adb stderr (daemon startup) as terminating.
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $raw = & adb devices 2>&1
  } finally {
    $ErrorActionPreference = $prev
  }
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw 'adb devices failed'
  }

  $list = New-Object System.Collections.Generic.List[string]
  foreach ($line in @($raw)) {
    if ($line -is [System.Management.Automation.ErrorRecord]) { continue }
    $text = ([string]$line).Trim()
    if (-not $text -or $text -match 'List of devices') { continue }
    # Wireless mdns serials may contain spaces, e.g. "adb-XXXX (2)._adb-tls-connect._tcp"
    if ($text -match '^(.*?)\s+device$') {
      [void]$list.Add($Matches[1].Trim())
    }
  }
  return [string[]]$list.ToArray()
}

function Test-IsWirelessAdb([string]$Id) {
  return $Id -match 'adb-tls|_tcp|wireless|\d+\.\d+\.\d+\.\d+:\d+$'
}

function Invoke-AdbRaw([string[]]$AdbArgs) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    return @(& adb @AdbArgs 2>&1)
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Get-MdnsTlsEndpoints {
  # adb mdns services lines look like:
  # adb-XXXX (2)	_adb-tls-connect._tcp	192.168.1.123:42701
  $map = @{}
  foreach ($line in @(Invoke-AdbRaw @('mdns', 'services'))) {
    if ($line -is [System.Management.Automation.ErrorRecord]) { continue }
    $text = ([string]$line).Trim()
    if (-not $text -or $text -match '^List of') { continue }
    if ($text -match '^(.*?)\s+_adb-tls-connect\._tcp\s+(\d+\.\d+\.\d+\.\d+:\d+)\s*$') {
      $map[$Matches[1].Trim()] = $Matches[2]
    }
  }
  return $map
}

function Resolve-NativeRunSerial([string]$Serial) {
  # native-run / `cap run` cannot see wireless mdns ids that contain spaces.
  # Map "adb-XXXX (2)._adb-tls-connect._tcp" → "192.168.x.x:port" via mdns + adb connect.
  if (-not $Serial) { return $Serial }
  if ($Serial -match '^\d+\.\d+\.\d+\.\d+:\d+$') { return $Serial }
  if ($Serial -notmatch '_adb-tls-connect\._tcp$') {
    return $Serial
  }

  $serviceName = $Serial
  if ($Serial -match '^(.*)\._adb-tls-connect\._tcp$') {
    $serviceName = $Matches[1].Trim()
  }

  $endpoints = Get-MdnsTlsEndpoints
  $endpoint = $null
  if ($endpoints.ContainsKey($serviceName)) {
    $endpoint = [string]$endpoints[$serviceName]
  } elseif ($endpoints.Count -eq 1) {
    $endpoint = [string]@($endpoints.Values)[0]
    Write-Host ("mdns exact name miss; using sole endpoint {0}" -f $endpoint) -ForegroundColor Yellow
  } else {
    $names = [string]::Join(', ', @($endpoints.Keys))
    throw ("Cannot map wireless serial to IP:port via adb mdns services. Serial={0}; services={1}" -f $Serial, $names)
  }

  Write-Host ("Wireless mdns serial → native-run target {0}" -f $endpoint) -ForegroundColor Cyan
  $connectOut = [string]::Join(' ', @(Invoke-AdbRaw @('connect', $endpoint)))
  Write-Host ("adb connect: {0}" -f $connectOut.Trim())

  $devices = @(Get-AdbDeviceList)
  if ($devices -notcontains $endpoint) {
    throw ("adb connect {0} did not appear in adb devices. Output: {1}" -f $endpoint, $connectOut)
  }
  return $endpoint
}

function Resolve-TargetSerial([string]$Preferred) {
  [string[]]$devices = Get-AdbDeviceList
  if ($null -eq $devices) { $devices = @() }

  if ($devices.Length -eq 0) {
    throw 'No adb device available. Connect a phone with USB debugging authorized.'
  }

  $deviceText = [string]::Join(', ', $devices)
  if ($Preferred) {
    if ($devices -notcontains $Preferred) {
      throw ("Serial not available: {0}. Devices: {1}" -f $Preferred, $deviceText)
    }
    return $Preferred
  }

  if ($devices.Length -gt 1) {
    $list = [string]::Join([Environment]::NewLine, ($devices | ForEach-Object { "  $_" }))
    throw ("Multiple devices detected. Pass -Serial <id>.{0}{1}{0}Example: npm run preview:native -- -Serial {2}" -f [Environment]::NewLine, $list, $devices[0])
  }

  return $devices[0]
}

function Stop-StaleLanServerOnPort {
  # Old servers without /__livereload must be restarted for auto refresh.
  try {
    $health = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri ("http://127.0.0.1:{0}/__health" -f $Port)
    if ($health.StatusCode -eq 200 -and $health.Content -match '"liveReload"\s*:\s*true') {
      return $false
    }
  } catch {
    # Port may be free or serving an old binary without __health.
  }

  if (-not (Test-PortOpen $Port)) { return $false }

  Write-Host ("Restarting LAN server on port {0} (enable live reload endpoints)" -f $Port)
  $conns = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  foreach ($conn in $conns) {
    if ($conn.OwningProcess) {
      Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }
  Start-Sleep -Milliseconds 400
  return $true
}

function Start-LanServerIfNeeded {
  if (-not $NoServer) {
    [void](Stop-StaleLanServerOnPort)
  }

  if (Test-PortOpen $Port) {
    Write-Host ("LAN server already on port {0}" -f $Port)
    return
  }

  if ($NoServer) {
    throw ("Port {0} is closed. Start the server or omit -NoServer." -f $Port)
  }

  Write-Step ("Starting LAN server on port {0}" -f $Port)
  $node = Get-Command node -ErrorAction Stop
  $env:PORT = "$Port"
  Start-Process -FilePath $node.Source `
    -ArgumentList @('lan-server.js', "$Port") `
    -WorkingDirectory $root `
    -WindowStyle Minimized | Out-Null

  $deadline = (Get-Date).AddSeconds(12)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortOpen $Port) {
      Write-Host ("LAN server ready: http://127.0.0.1:{0}" -f $Port)
      return
    }
    Start-Sleep -Milliseconds 250
  }
  throw ("LAN server did not open port {0}. Start it manually with: node lan-server.js" -f $Port)
}

function Enable-AdbReverse([string]$Device, [int]$PortNumber) {
  & adb -s $Device reverse --remove ("tcp:{0}" -f $PortNumber) 2>$null | Out-Null
  & adb -s $Device reverse ("tcp:{0}" -f $PortNumber) ("tcp:{0}" -f $PortNumber)
  if (-not $?) {
    throw 'adb reverse failed. Try: npm run preview:native -- -Lan'
  }
  $list = & adb -s $Device reverse --list
  Write-Host ("adb reverse: {0}" -f ([string]::Join(' | ', @($list))))
}

Assert-CommandExists 'node'
Assert-CommandExists 'npm'
Assert-CommandExists 'adb'
Assert-CommandExists 'npx'

if (-not (Test-Path (Join-Path $root 'node_modules\@capacitor\cli'))) {
  throw 'Capacitor CLI missing. Run npm install in the project root first.'
}

# Keep embedded www in sync so a cleartext/LAN failure cannot silently serve ancient JS.
Write-Step 'Syncing www web assets'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'sync-web-assets.ps1')
if (-not $?) { throw 'sync-web-assets.ps1 failed' }

$serial = Resolve-TargetSerial $Serial
$serial = Resolve-NativeRunSerial $serial
Write-Step ("Target device: {0}" -f $serial)

if ($NoServer) {
  if (-not (Test-PortOpen $Port)) {
    throw ("Port {0} is closed. Start the server or omit -NoServer." -f $Port)
  }
} else {
  Start-LanServerIfNeeded
}

$wireless = Test-IsWirelessAdb $serial
if ($Usb -and $Lan) {
  throw 'Use only one of -Usb or -Lan.'
}

# Wireless adb + localhost often fails silently; prefer LAN IP unless -Usb is forced.
$preferLan = $Lan -or $HostAddress -or (-not $Usb -and $wireless)
if ($preferLan -and -not $HostAddress -and -not $Lan -and $wireless) {
  Write-Host 'Wireless adb detected → using LAN IP (pass -Usb to force localhost + adb reverse).'
}

if ($HostAddress) {
  $reloadHost = $HostAddress
  $useForwardPorts = $false
} elseif ($preferLan) {
  [string[]]$ips = Get-LanIPv4Addresses
  if ($null -eq $ips -or $ips.Length -eq 0) {
    throw 'No LAN IPv4 address found. Connect Wi-Fi or pass -HostAddress <ip>.'
  }
  $reloadHost = $ips[0]
  $useForwardPorts = $false
  if ($ips.Length -gt 1) {
    Write-Host ("Multiple LAN IPs; using {0}. Others: {1}" -f $reloadHost, ([string]::Join(', ', $ips)))
  }
} else {
  $reloadHost = 'localhost'
  $useForwardPorts = $true
}

$reloadUrl = 'http://{0}:{1}' -f $reloadHost, $Port
Write-Step ("Native live preview -> {0}" -f $reloadUrl)

if ($useForwardPorts) {
  Write-Step 'Configuring adb reverse'
  Enable-AdbReverse -Device $serial -PortNumber $Port
  Write-Host 'Mode: localhost + adb reverse'
} else {
  Write-Host 'Mode: LAN IP. Phone and PC must share the same Wi-Fi.'
  Write-Host 'If the app stays blank, allow Node.js through Windows Firewall.'
}

$pcId = (& node (Join-Path $PSScriptRoot 'content-id.cjs') $root)
if ($?) { Write-Host ("PC content id: {0}" -f ([string]$pcId).Trim()) }

Write-Step 'Checking phone can reach Live Reload URL'
$reach = Test-PhoneCanReachUrl -Device $serial -Url $reloadUrl
if ($reach.Ok) {
  Write-Host ("OK: device reached {0}/__health" -f $reloadUrl)
  if ($reach.Id) {
    Write-Host ("Phone sees server id: {0}" -f $reach.Id)
    $pcTrim = ([string]$pcId).Trim()
    if ($pcTrim -and $reach.Id -eq $pcTrim) {
      Write-Host 'Content id match: phone Live Reload server == current PC source'
    } elseif ($pcTrim) {
      Write-Host 'Content id mismatch vs PC (restart lan-server if it is stale).' -ForegroundColor Yellow
    }
  }
} else {
  Write-Host ("WARN: device cannot fetch {0}/__health" -f $reloadUrl) -ForegroundColor Yellow
  Write-Host 'App may fall back to bundled APK assets (looks like Live Reload is broken).' -ForegroundColor Yellow
  Write-Host 'Try: same Wi-Fi, firewall allow Node, or npm run preview:native -- -HostAddress <正确IP>' -ForegroundColor Yellow
  Write-Host 'Reliable fallback: npm run deploy:apk' -ForegroundColor Yellow
}

Write-Host 'Save files under src/ → WebView reloads automatically.'
Write-Host 'Keep this terminal open. Stop with Ctrl+C when finished.'
Write-Host 'Version check: npm run code:id  →  long-press menu → compare build.'

Push-Location $root
try {
  $env:ANDROID_SERIAL = $serial

  $capArgs = @(
    'cap', 'run', 'android',
    '--live-reload',
    '--host', $reloadHost,
    '--port', "$Port",
    '--target', $serial
  )
  if ($useForwardPorts) {
    $capArgs += @('--forwardPorts', ('{0}:{0}' -f $Port))
  }

  Write-Step 'cap run android --live-reload'
  & npx @capArgs
  if (-not $?) {
    $code = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 'unknown' }
    throw ("cap run android failed (exit {0})" -f $code)
  }
} finally {
  Pop-Location
  Remove-Item Env:ANDROID_SERIAL -ErrorAction SilentlyContinue
}
