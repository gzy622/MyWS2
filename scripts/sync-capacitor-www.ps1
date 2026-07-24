[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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
    throw "同步失败，找不到：$from"
  }
  if ($item.IsDirectory) {
    Copy-Item -Recurse -Force $from $to
  } else {
    Copy-Item -Force $from $to
  }
}

Write-Host "已同步 Web 资源到 $www"
