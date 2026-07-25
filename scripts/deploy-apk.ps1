[CmdletBinding()]
param(
  [string]$Serial = '',
  [switch]$Fresh,
  [switch]$NoLaunch,
  [switch]$SkipSync
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Avoid mojibake when npm hosts Windows PowerShell 5.1 on Chinese locales.
try {
  $utf8 = [System.Text.UTF8Encoding]::new($false)
  [Console]::OutputEncoding = $utf8
  $OutputEncoding = $utf8
} catch {
  # Host may not expose a console; keep going.
}

$root = Split-Path -Parent $PSScriptRoot
$packageId = 'com.teacherworkbench.app'
$apkRel = 'android\app\build\outputs\apk\debug\app-debug.apk'
$apkPath = Join-Path $root $apkRel
$syncScript = Join-Path $PSScriptRoot 'sync-capacitor-www.ps1'
$gradlew = Join-Path $root 'android\gradlew.bat'

function Write-Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-CommandExists([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing command: $Name"
  }
}

function Resolve-JdkHome {
  if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    return $env:JAVA_HOME
  }

  $candidates = @()
  $msRoot = 'C:\Program Files\Microsoft'
  if (Test-Path $msRoot) {
    $candidates += @(Get-ChildItem $msRoot -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like 'jdk-21*' -or $_.Name -like 'jdk-22*' -or $_.Name -like 'jdk-23*' } |
      Sort-Object Name -Descending)
  }
  $eclipseRoot = 'C:\Program Files\Eclipse Adoptium'
  if (Test-Path $eclipseRoot) {
    $candidates += @(Get-ChildItem $eclipseRoot -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like 'jdk-21*' -or $_.Name -like 'jdk-22*' } |
      Sort-Object Name -Descending)
  }

  foreach ($dir in $candidates) {
    $java = Join-Path $dir.FullName 'bin\java.exe'
    if (Test-Path $java) { return $dir.FullName }
  }

  throw 'JDK 21+ not found. Install OpenJDK 21 or set JAVA_HOME.'
}

function Resolve-AndroidHome {
  if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) {
    return $env:ANDROID_HOME
  }
  if ($env:ANDROID_SDK_ROOT -and (Test-Path $env:ANDROID_SDK_ROOT)) {
    return $env:ANDROID_SDK_ROOT
  }

  $localSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  if (Test-Path $localSdk) { return $localSdk }

  throw 'Android SDK not found. Install Android SDK or set ANDROID_HOME.'
}

function Get-AdbDeviceList {
  $raw = & adb devices
  if (-not $?) {
    throw 'adb devices failed'
  }

  $list = New-Object System.Collections.Generic.List[string]
  foreach ($line in @($raw)) {
    $text = [string]$line
    if ($text -match '^\s*(\S+)\s+device\s*$') {
      [void]$list.Add($Matches[1])
    }
  }
  return [string[]]$list.ToArray()
}

function Resolve-TargetSerial([string]$Preferred) {
  [string[]]$devices = Get-AdbDeviceList
  if ($null -eq $devices) { $devices = @() }

  if ($devices.Length -eq 0) {
    throw 'No adb device available. Connect a phone with USB/wireless debugging authorized.'
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
    throw ("Multiple devices detected. Pass -Serial <id>.{0}{1}{0}Example: npm run deploy:apk -- -Serial {2}" -f [Environment]::NewLine, $list, $devices[0])
  }

  return $devices[0]
}

function Invoke-Native([string]$FilePath, [string[]]$ArgumentList, [string]$FailureMessage) {
  & $FilePath @ArgumentList
  if (-not $?) {
    $code = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 'unknown' }
    throw ("{0} (exit {1})" -f $FailureMessage, $code)
  }
}

Push-Location $root
try {
  Write-Step 'Check environment'
  $jdkHome = Resolve-JdkHome
  $androidHome = Resolve-AndroidHome
  $env:JAVA_HOME = $jdkHome
  $env:ANDROID_HOME = $androidHome
  $env:ANDROID_SDK_ROOT = $androidHome
  $platformTools = Join-Path $androidHome 'platform-tools'
  $env:Path = "$jdkHome\bin;$platformTools;$env:Path"

  Assert-CommandExists 'node'
  Assert-CommandExists 'npm'
  Assert-CommandExists 'adb'
  if (-not (Test-Path $gradlew)) {
    throw ("Gradle wrapper missing: {0}" -f $gradlew)
  }

  Write-Host "JAVA_HOME=$jdkHome"
  Write-Host "ANDROID_HOME=$androidHome"

  $serial = Resolve-TargetSerial $Serial
  Write-Host "Target device: $serial"

  if (-not $SkipSync) {
    Write-Step 'Sync web assets to www'
    & $syncScript
    if (-not $?) {
      throw 'sync-capacitor-www.ps1 failed'
    }

    Write-Step 'Capacitor sync android'
    Invoke-Native 'npx.cmd' @('cap', 'sync', 'android') 'cap sync android failed'
  } else {
    Write-Host 'Skipped sync (-SkipSync)'
  }

  Write-Step 'Gradle assembleDebug'
  Push-Location (Join-Path $root 'android')
  try {
    Invoke-Native '.\gradlew.bat' @('assembleDebug', '--no-daemon') 'assembleDebug failed'
  } finally {
    Pop-Location
  }

  if (-not (Test-Path $apkPath)) {
    throw ("APK missing: {0}" -f $apkPath)
  }
  Write-Host "APK: $apkPath"

  $adbTarget = @('-s', $serial)

  if ($Fresh) {
    Write-Step ("Uninstall {0}" -f $packageId)
    & adb @adbTarget uninstall $packageId 2>&1 | Out-Host
  }

  Write-Step 'Install APK'
  $installArgs = @('-s', $serial, 'install', '-r', '-d', $apkPath)
  Invoke-Native 'adb' $installArgs 'adb install failed'

  if (-not $NoLaunch) {
    Write-Step 'Launch app'
    $launchArgs = @('-s', $serial, 'shell', 'am', 'start', '-n', "$packageId/.MainActivity")
    Invoke-Native 'adb' $launchArgs 'app launch failed'
  }

  Write-Host ''
  Write-Host ("Done: deployed to {0}" -f $serial) -ForegroundColor Green
} finally {
  Pop-Location
}
