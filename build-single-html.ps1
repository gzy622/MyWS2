[CmdletBinding()]
param(
  [string]$InputPath = 'index.html',
  [string]$OutputPath = 'dist\teacher-workbench.single.html'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$utf8Strict = [Text.UTF8Encoding]::new($false, $true)
$utf8NoBom = [Text.UTF8Encoding]::new($false)

function Resolve-ProjectPath {
  param(
    [Parameter(Mandatory)] [string]$Path,
    [string]$BaseDirectory = $projectRoot
  )

  $candidate = if ([IO.Path]::IsPathRooted($Path)) {
    [IO.Path]::GetFullPath($Path)
  } else {
    [IO.Path]::GetFullPath((Join-Path $BaseDirectory $Path))
  }
  $relative = [IO.Path]::GetRelativePath($projectRoot, $candidate)
  if ($relative -eq '..' -or $relative.StartsWith("..$([IO.Path]::DirectorySeparatorChar)")) {
    throw "不允许打包项目目录外的文件：$candidate"
  }
  return $candidate
}

function Read-Utf8File {
  param([Parameter(Mandatory)] [string]$Path)

  if (-not [IO.File]::Exists($Path)) {
    throw "找不到文件：$Path"
  }
  return [IO.File]::ReadAllText($Path, $utf8Strict)
}

function Get-ProjectRelativePath {
  param([Parameter(Mandatory)] [string]$Path)

  return [IO.Path]::GetRelativePath($projectRoot, $Path).Replace('\', '/')
}

function Get-DataUri {
  param([Parameter(Mandatory)] [string]$Path)

  $mimeTypes = @{
    '.avif' = 'image/avif'; '.gif' = 'image/gif'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'
    '.png' = 'image/png'; '.svg' = 'image/svg+xml'; '.webp' = 'image/webp'
    '.woff' = 'font/woff'; '.woff2' = 'font/woff2'; '.ttf' = 'font/ttf'; '.otf' = 'font/otf'
  }
  $extension = [IO.Path]::GetExtension($Path).ToLowerInvariant()
  $mimeType = $mimeTypes[$extension]
  if (-not $mimeType) {
    throw "无法确定资源的 MIME 类型：$Path"
  }
  $base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($Path))
  return "data:$mimeType;base64,$base64"
}

$cssImportPattern = [regex]::new(
  '(?im)^\s*@import\s+(?:url\(\s*)?["''](?<href>[^"'']+)["'']\s*\)?\s*;\s*$',
  [Text.RegularExpressions.RegexOptions]::CultureInvariant
)
$cssUrlPattern = [regex]::new(
  'url\(\s*(?<quote>["'']?)(?<href>[^)"'']+)\k<quote>\s*\)',
  [Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [Text.RegularExpressions.RegexOptions]::CultureInvariant
)
$cssStack = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)

function Expand-CssFile {
  param([Parameter(Mandatory)] [string]$Path)

  $fullPath = Resolve-ProjectPath -Path $Path
  if (-not $cssStack.Add($fullPath)) {
    throw "检测到循环 CSS @import：$fullPath"
  }

  try {
    $css = Read-Utf8File -Path $fullPath
    $baseDirectory = [IO.Path]::GetDirectoryName($fullPath)

    $urlMatches = $cssUrlPattern.Matches($css)
    for ($index = $urlMatches.Count - 1; $index -ge 0; $index--) {
      $match = $urlMatches[$index]
      $href = $match.Groups['href'].Value.Trim()
      if ($href -match '^(?:data:|https?:|#|//)' -or $href -match '^\s*$') {
        continue
      }
      $assetPath = Resolve-ProjectPath -Path $href -BaseDirectory $baseDirectory
      $replacement = "url('$(Get-DataUri -Path $assetPath)')"
      $css = $css.Remove($match.Index, $match.Length).Insert($match.Index, $replacement)
    }

    $importMatches = $cssImportPattern.Matches($css)
    for ($index = $importMatches.Count - 1; $index -ge 0; $index--) {
      $match = $importMatches[$index]
      $importPath = Resolve-ProjectPath -Path $match.Groups['href'].Value -BaseDirectory $baseDirectory
      $relativeImport = Get-ProjectRelativePath -Path $importPath
      $replacement = "/* inlined: $relativeImport */`n$(Expand-CssFile -Path $importPath)"
      $css = $css.Remove($match.Index, $match.Length).Insert($match.Index, $replacement)
    }
    return $css
  } finally {
    [void]$cssStack.Remove($fullPath)
  }
}

$moduleImportPattern = [regex]::new(
  '(?ms)\b(?:import|export)\s+(?:[^;"'']+?\s+from\s+)?(?<quote>["''])(?<specifier>\.[^"'']+)\k<quote>',
  [Text.RegularExpressions.RegexOptions]::CultureInvariant
)
$moduleStates = @{}
$moduleRecords = @{}
$moduleOrder = [Collections.Generic.List[string]]::new()

function Visit-JavaScriptModule {
  param([Parameter(Mandatory)] [string]$Path)

  $fullPath = Resolve-ProjectPath -Path $Path
  $relativePath = Get-ProjectRelativePath -Path $fullPath
  if ($moduleStates[$relativePath] -eq 'done') {
    return
  }
  if ($moduleStates[$relativePath] -eq 'visiting') {
    throw "检测到循环 JavaScript 模块依赖：$relativePath"
  }

  $moduleStates[$relativePath] = 'visiting'
  $source = Read-Utf8File -Path $fullPath
  $baseDirectory = [IO.Path]::GetDirectoryName($fullPath)
  $dependencies = [ordered]@{}

  foreach ($match in $moduleImportPattern.Matches($source)) {
    $specifier = $match.Groups['specifier'].Value
    if ($dependencies.Contains($specifier)) {
      continue
    }
    $dependencyPath = Resolve-ProjectPath -Path $specifier -BaseDirectory $baseDirectory
    $dependencies[$specifier] = Get-ProjectRelativePath -Path $dependencyPath
    Visit-JavaScriptModule -Path $dependencyPath
  }

  $dependencyRecords = [Collections.Generic.List[object]]::new()
  $dependencyIndex = 0
  foreach ($dependency in $dependencies.GetEnumerator()) {
    $token = "__SINGLE_FILE_DEPENDENCY_$($dependencyIndex)__"
    $source = $source.Replace($dependency.Key, $token)
    $dependencyRecords.Add([ordered]@{ token = $token; path = $dependency.Value })
    $dependencyIndex++
  }

  $moduleRecords[$relativePath] = [ordered]@{
    path = $relativePath
    source = [Convert]::ToBase64String($utf8NoBom.GetBytes($source))
    dependencies = $dependencyRecords
  }
  $moduleOrder.Add($relativePath)
  $moduleStates[$relativePath] = 'done'
}

$inputFullPath = Resolve-ProjectPath -Path $InputPath
$outputFullPath = if ([IO.Path]::IsPathRooted($OutputPath)) {
  [IO.Path]::GetFullPath($OutputPath)
} else {
  [IO.Path]::GetFullPath((Join-Path $projectRoot $OutputPath))
}
$html = Read-Utf8File -Path $inputFullPath
$htmlDirectory = [IO.Path]::GetDirectoryName($inputFullPath)

$stylesheetPattern = [regex]::new(
  '<link\b(?=[^>]*\brel=["'']stylesheet["''])(?=[^>]*\bhref=["''](?<href>[^"'']+)["''])[^>]*>',
  [Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [Text.RegularExpressions.RegexOptions]::CultureInvariant
)
$stylesheetMatches = $stylesheetPattern.Matches($html)
if ($stylesheetMatches.Count -eq 0) {
  throw '入口 HTML 中没有找到本地 stylesheet。'
}
for ($index = $stylesheetMatches.Count - 1; $index -ge 0; $index--) {
  $match = $stylesheetMatches[$index]
  $stylesheetPath = Resolve-ProjectPath -Path $match.Groups['href'].Value -BaseDirectory $htmlDirectory
  $stylesheet = Expand-CssFile -Path $stylesheetPath
  if ($stylesheet -match '(?i)</style') {
    throw "样式内容包含无法安全内联的 </style：$stylesheetPath"
  }
  $replacement = "<style>`n$stylesheet`n</style>"
  $html = $html.Remove($match.Index, $match.Length).Insert($match.Index, $replacement)
}

$moduleScriptPattern = [regex]::new(
  '<script\b(?=[^>]*\btype=["'']module["''])(?=[^>]*\bsrc=["''](?<src>[^"'']+)["''])[^>]*>\s*</script>',
  [Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [Text.RegularExpressions.RegexOptions]::CultureInvariant
)
$moduleScriptMatches = $moduleScriptPattern.Matches($html)
if ($moduleScriptMatches.Count -ne 1) {
  throw "入口 HTML 必须恰好包含一个外部 module script，当前找到 $($moduleScriptMatches.Count) 个。"
}

$entryMatch = $moduleScriptMatches[0]
$entryPath = Resolve-ProjectPath -Path $entryMatch.Groups['src'].Value -BaseDirectory $htmlDirectory
$entryRelativePath = Get-ProjectRelativePath -Path $entryPath
Visit-JavaScriptModule -Path $entryPath

$orderedModules = foreach ($modulePath in $moduleOrder) {
  $moduleRecords[$modulePath]
}
$manifest = [ordered]@{ entry = $entryRelativePath; modules = @($orderedModules) }
$manifestJson = $manifest | ConvertTo-Json -Depth 8 -Compress
$manifestBase64 = [Convert]::ToBase64String($utf8NoBom.GetBytes($manifestJson))
$moduleLoader = @'
<script type="module">
const decodeUtf8Base64 = (value) => new TextDecoder('utf-8', { fatal: true }).decode(
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
);
const manifest = JSON.parse(decodeUtf8Base64('__MANIFEST_BASE64__'));
const moduleUrls = new Map();
for (const moduleRecord of manifest.modules) {
  let source = decodeUtf8Base64(moduleRecord.source);
  for (const dependency of moduleRecord.dependencies) {
    const dependencyUrl = moduleUrls.get(dependency.path);
    if (!dependencyUrl) throw new Error(`未找到模块依赖：${dependency.path}`);
    source = source.split(dependency.token).join(dependencyUrl);
  }
  moduleUrls.set(moduleRecord.path, URL.createObjectURL(new Blob([source], { type: 'text/javascript;charset=utf-8' })));
}
import(moduleUrls.get(manifest.entry)).catch((error) => {
  document.documentElement.dataset.singleFileError = 'true';
  console.error('单文件应用启动失败', error);
});
</script>
'@
$moduleLoader = $moduleLoader.Replace('__MANIFEST_BASE64__', $manifestBase64)
$html = $html.Remove($entryMatch.Index, $entryMatch.Length).Insert($entryMatch.Index, $moduleLoader.Trim())
$html = $html.Replace('<head>', "<head>`n    <!-- Generated by build-single-html.ps1; edit source files instead. -->")

$outputDirectory = [IO.Path]::GetDirectoryName($outputFullPath)
[IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
[IO.File]::WriteAllText($outputFullPath, $html, $utf8NoBom)

$outputInfo = Get-Item -LiteralPath $outputFullPath
Write-Host "单文件已生成：$($outputInfo.FullName)"
Write-Host ("大小：{0:N1} KB；内联模块：{1}" -f ($outputInfo.Length / 1KB), $moduleOrder.Count)
