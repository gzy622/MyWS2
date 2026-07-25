[CmdletBinding()]
param()

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
$www = Join-Path $root 'www'

if (Test-Path $www) {
  Remove-Item -Recurse -Force $www
}
New-Item -ItemType Directory -Path $www | Out-Null

$copyMap = @(
  @{ Source = 'index.html'; Destination = 'index.html'; IsDirectory = $false }
  @{ Source = 'styles'; Destination = 'styles'; IsDirectory = $true }
  @{ Source = 'scripts'; Destination = 'scripts'; IsDirectory = $true }
)

foreach ($item in $copyMap) {
  $from = Join-Path $root $item.Source
  $to = Join-Path $www $item.Destination
  if (-not (Test-Path $from)) {
    throw ("Sync failed, missing source: {0}" -f $from)
  }
  if ($item.IsDirectory) {
    Copy-Item -Recurse -Force $from $to
  } else {
    Copy-Item -Force $from $to
  }
}

# Dev-only Node helper; must not ship inside the APK web assets.
$devHelper = Join-Path $www 'scripts\content-id.cjs'
if (Test-Path $devHelper) {
  Remove-Item -Force $devHelper
}

$stamp = (& node (Join-Path $PSScriptRoot 'content-id.cjs') $root)
if (-not $?) { throw 'content-id.cjs failed' }
$stamp = ([string]$stamp).Trim()
$at = (Get-Date).ToUniversalTime().ToString('o')
$payload = "{`"id`":`"$stamp`",`"at`":`"$at`",`"source`":`"apk`"}"
$stampPath = Join-Path $www 'build-id.json'
[System.IO.File]::WriteAllText($stampPath, $payload, [System.Text.UTF8Encoding]::new($false))

Write-Host ("Synced web assets to {0}" -f $www)
Write-Host ("Content id: {0}" -f $stamp)
