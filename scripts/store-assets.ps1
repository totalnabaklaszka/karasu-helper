$ErrorActionPreference = 'Stop'
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$assetDirectory = Join-Path $workspaceRoot 'store/edge/assets'
New-Item -ItemType Directory -Path $assetDirectory -Force | Out-Null
Add-Type -AssemblyName System.Drawing

# Render repository-native geometry and typography, without opening or capturing UI.
[xml]$markSource = Get-Content -LiteralPath (Join-Path $workspaceRoot 'extension/branding/mark.svg') -Raw
$polygons = @($markSource.svg.polygon)
$fontCollection = New-Object Drawing.Text.PrivateFontCollection
$fontCollection.AddFontFile((Join-Path $workspaceRoot 'extension/fonts/SpaceGrotesk.ttf'))
$fontFamily = $fontCollection.Families[0]

function New-Canvas([int]$width, [int]$height) {
    $bitmap = New-Object Drawing.Bitmap($width, $height)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#101114'))
    return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Draw-Mark($graphics, [single]$left, [single]$top, [single]$size) {
    foreach ($polygon in $polygons) {
        [Drawing.PointF[]]$vertices = foreach ($pair in ([string]$polygon.points -split ' ')) {
            $coordinates = $pair -split ','
            $x = [single]::Parse($coordinates[0], [Globalization.CultureInfo]::InvariantCulture)
            $y = [single]::Parse($coordinates[1], [Globalization.CultureInfo]::InvariantCulture)
            New-Object Drawing.PointF(($left + $x * $size / 64), ($top + $y * $size / 64))
        }
        $brush = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml([string]$polygon.fill))
        try { $graphics.FillPolygon($brush, $vertices) } finally { $brush.Dispose() }
    }
}

function Draw-Text($graphics, [string]$text, [single]$size, [single]$left, [single]$top, [string]$colour, [single]$maxWidth) {
    $font = New-Object Drawing.Font($fontFamily, $size, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
    $brush = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml($colour))
    $format = [Drawing.StringFormat]::GenericTypographic.Clone()
    try {
        $measured = $graphics.MeasureString($text, $font, 10000, $format)
        if ($measured.Width -gt $maxWidth) { throw ('Artwork text exceeds its layout: ' + $text) }
        $graphics.DrawString($text, $font, $brush, (New-Object Drawing.PointF($left, $top)), $format)
    } finally { $format.Dispose(); $brush.Dispose(); $font.Dispose() }
}

function Save-Canvas($canvas, [string]$name) {
    try { $canvas.Bitmap.Save((Join-Path $assetDirectory $name), [Drawing.Imaging.ImageFormat]::Png) }
    finally { $canvas.Graphics.Dispose(); $canvas.Bitmap.Dispose() }
}

try {
    $logo = New-Canvas 300 300
    Draw-Mark $logo.Graphics 6 6 288
    Save-Canvas $logo 'logo-300.png'

    $small = New-Canvas 440 280
    Draw-Mark $small.Graphics 26 25 72
    Draw-Text $small.Graphics 'Karasu Helper' 28 114 30 '#f4f4f5' 302
    Draw-Text $small.Graphics 'FREE / UNOFFICIAL' 12 116 71 '#a8abb4' 296
    Draw-Text $small.Graphics 'Your Karasu setup.' 28 28 134 '#f4f4f5' 386
    Draw-Text $small.Graphics 'One compact helper.' 28 28 173 '#f4f4f5' 386
    Draw-Text $small.Graphics 'Auto accept / FACEIT / Loadout Studio' 13 28 239 '#ff5964' 386
    Save-Canvas $small 'promo-440x280.png'

    $large = New-Canvas 1400 560
    Draw-Mark $large.Graphics 76 65 144
    Draw-Text $large.Graphics 'Karasu Helper' 60 248 78 '#f4f4f5' 1072
    Draw-Text $large.Graphics 'FREE COMMUNITY EXTENSION / UNOFFICIAL' 19 252 162 '#a8abb4' 1056
    Draw-Text $large.Graphics 'Queue, ranks and loadouts.' 56 80 285 '#f4f4f5' 1240
    Draw-Text $large.Graphics 'One compact helper for Karasu.' 31 83 366 '#a8abb4' 1236
    Draw-Text $large.Graphics 'Auto accept  /  Map & server bans  /  FACEIT ranks  /  Loadout Studio' 23 84 468 '#ff5964' 1230
    Save-Canvas $large 'promo-1400x560.png'
} finally { $fontFamily.Dispose(); $fontCollection.Dispose() }
Write-Output 'Generated Edge logo and promotional tiles from local vector geometry and bundled font.'
