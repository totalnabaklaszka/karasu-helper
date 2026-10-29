$ErrorActionPreference = 'Stop'
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseDirectory = Join-Path $workspaceRoot 'release'
$extensionVersion = (Get-Content -LiteralPath (Join-Path $workspaceRoot 'extension/manifest.json') -Raw | ConvertFrom-Json).version
if ($extensionVersion -notmatch '^\d+(\.\d+){1,3}$') { throw 'Invalid extension version.' }
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
# Positive allowlist: never include local research, analysis, databases or dependencies.
$sourceNames = @('.github', 'extension', 'tests', 'scripts', 'store', 'downloads', 'README.md', 'PRIVACY.md', 'PUBLISHING.md', 'package.json', 'package-lock.json', '.gitignore')
$sourcePaths = foreach ($sourceName in $sourceNames) {
    $sourcePath = [IO.Path]::GetFullPath((Join-Path $workspaceRoot $sourceName))
    if (-not $sourcePath.StartsWith($workspaceRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Source path outside workspace.' }
    if (-not (Test-Path -LiteralPath $sourcePath)) { throw ('Missing source: ' + $sourceName) }
    $sourcePath
}
$archivePath = Join-Path $releaseDirectory ('karasu-helper-source-' + $extensionVersion + '.zip')
Compress-Archive -LiteralPath $sourcePaths -DestinationPath $archivePath -Force
Get-Item -LiteralPath $archivePath | Select-Object FullName, Length
