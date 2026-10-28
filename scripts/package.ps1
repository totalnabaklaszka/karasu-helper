$ErrorActionPreference = 'Stop'
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$extensionDirectory = Join-Path $workspaceRoot 'extension'
$releaseDirectory = Join-Path $workspaceRoot 'release'
$manifestPath = Join-Path $extensionDirectory 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'Brak manifest.json.' }
$extensionVersion = (Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json).version
if ($extensionVersion -notmatch '^\d+(\.\d+){1,3}$') { throw 'Invalid extension version.' }
Copy-Item -LiteralPath (Join-Path $workspaceRoot 'PRIVACY.md') -Destination (Join-Path $extensionDirectory 'PRIVACY.md') -Force
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
$archivePath = Join-Path $releaseDirectory 'karasu-helper.zip'
$versionedArchivePath = Join-Path $releaseDirectory ('karasu-helper-' + $extensionVersion + '.zip')
$extensionFiles = Get-ChildItem -LiteralPath $extensionDirectory
Compress-Archive -LiteralPath $extensionFiles.FullName -DestinationPath $versionedArchivePath -Force
Copy-Item -LiteralPath $versionedArchivePath -Destination $archivePath -Force
$publicDownloadDirectory = Join-Path $workspaceRoot 'downloads'
New-Item -ItemType Directory -Path $publicDownloadDirectory -Force | Out-Null
Copy-Item -LiteralPath $versionedArchivePath -Destination (Join-Path $publicDownloadDirectory ([IO.Path]::GetFileName($versionedArchivePath))) -Force
Get-Item -LiteralPath $archivePath | Select-Object FullName, Length
$archiveStream = [IO.File]::OpenRead($archivePath)
$hashAlgorithm = [Security.Cryptography.SHA256]::Create()
try {
    $archiveHash = [BitConverter]::ToString($hashAlgorithm.ComputeHash($archiveStream)).Replace('-', '')
    Write-Output ('SHA256: ' + $archiveHash)
    $checksumPath = Join-Path $publicDownloadDirectory ([IO.Path]::GetFileName($versionedArchivePath) + '.sha256')
    [IO.File]::WriteAllText($checksumPath, ($archiveHash + '  ' + [IO.Path]::GetFileName($versionedArchivePath) + [Environment]::NewLine), (New-Object Text.UTF8Encoding($false)))
} finally {
    $archiveStream.Dispose()
    $hashAlgorithm.Dispose()
}

