$ErrorActionPreference = 'Stop'
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifest = Get-Content -LiteralPath (Join-Path $workspaceRoot 'extension/manifest.json') -Raw | ConvertFrom-Json
$extensionVersion = $manifest.version
if ($extensionVersion -notmatch '^\d+(\.\d+){1,3}$') { throw 'Invalid extension version.' }
Push-Location -LiteralPath $workspaceRoot
try {
    & (Join-Path $PSScriptRoot 'store-assets.ps1')
    & node (Join-Path $PSScriptRoot 'edge-check.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Edge preflight failed.' }
    & (Join-Path $PSScriptRoot 'package.ps1')
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $installerName = 'karasu-helper-' + $extensionVersion + '.zip'
    $installerPath = Join-Path $workspaceRoot ('downloads/' + $installerName)
    $archive = [IO.Compression.ZipFile]::OpenRead($installerPath)
    try {
        $manifestEntry = $archive.Entries | Where-Object { $_.FullName -eq 'manifest.json' }
        if (-not $manifestEntry) { throw 'Installer has no root manifest.json.' }
        foreach ($entry in $archive.Entries) {
            if ($entry.FullName -match '(^[/\\]|(^|[/\\])\.\.([/\\]|$))') { throw 'Unsafe archive entry.' }
        }
        $reader = New-Object IO.StreamReader($manifestEntry.Open())
        try { $packagedManifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
        if ($packagedManifest.version -ne $extensionVersion) { throw 'Installer version mismatch.' }
    } finally { $archive.Dispose() }

    # A fresh dedicated staging directory prevents old/private files entering the kit.
    $stagingDirectory = Join-Path $workspaceRoot ('release/edge-stage-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stagingDirectory | Out-Null
    Copy-Item -LiteralPath $installerPath -Destination (Join-Path $stagingDirectory $installerName)
    Copy-Item -LiteralPath ($installerPath + '.sha256') -Destination (Join-Path $stagingDirectory ($installerName + '.sha256'))
    foreach ($name in @('README.md', 'listing.json', 'description.en-US.txt', 'privacy-fields.md', 'reviewer-notes.txt')) {
        Copy-Item -LiteralPath (Join-Path $workspaceRoot ('store/edge/' + $name)) -Destination (Join-Path $stagingDirectory $name)
    }
    $stagingAssets = Join-Path $stagingDirectory 'assets'
    New-Item -ItemType Directory -Path $stagingAssets | Out-Null
    foreach ($name in @('logo-300.png', 'promo-440x280.png', 'promo-1400x560.png')) {
        Copy-Item -LiteralPath (Join-Path $workspaceRoot ('store/edge/assets/' + $name)) -Destination (Join-Path $stagingAssets $name)
    }
    $kitPath = Join-Path $workspaceRoot ('downloads/karasu-helper-edge-submission-' + $extensionVersion + '.zip')
    $files = Get-ChildItem -LiteralPath $stagingDirectory
    Compress-Archive -LiteralPath $files.FullName -DestinationPath $kitPath -Force
    $kitStream = [IO.File]::OpenRead($kitPath)
    $kitHasher = [Security.Cryptography.SHA256]::Create()
    try { $kitHash = [BitConverter]::ToString($kitHasher.ComputeHash($kitStream)).Replace('-', '').ToLowerInvariant() }
    finally { $kitStream.Dispose(); $kitHasher.Dispose() }
    [IO.File]::WriteAllText(($kitPath + '.sha256'), ($kitHash + '  ' + [IO.Path]::GetFileName($kitPath) + [Environment]::NewLine), (New-Object Text.UTF8Encoding($false)))
    Get-Item -LiteralPath $kitPath | Select-Object FullName, Length
    Write-Output ('SHA256: ' + $kitHash)
    Write-Output 'Prepared locally; not submitted to Microsoft Edge Add-ons.'
} finally { Pop-Location }
