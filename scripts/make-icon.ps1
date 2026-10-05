# Draws the app icon (same shapes as public/icon.svg) at exact pixel sizes:
#   public/favicon.ico      Windows icon sizes, used for the exe
#   public/icons/*.png      sizes listed in public/manifest.webmanifest, used
#                           by Edge when the app is installed
# Uses only built-in .NET; Windows only.
#
#   powershell -File scripts/make-icon.ps1

Add-Type -AssemblyName System.Drawing

$sizes = 16, 24, 32, 48, 64, 256
$pngSizes = 16, 32, 48, 64, 192, 512
$out = Join-Path $PSScriptRoot '..\public\favicon.ico'
$pngDir = Join-Path $PSScriptRoot '..\public\icons'

function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $path
}

function Get-Brush([string]$hex) { [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($hex)) }

function Get-IconPng([int]$size) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = 'AntiAlias'
    $g.PixelOffsetMode = 'Half'
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.ScaleTransform($size / 64, $size / 64)

    # Edges sit on a 4-unit grid so they land on whole pixels at 16/32/48/64.
    # Dark tile
    $g.FillPath((Get-Brush '#2a2723'), (New-RoundedRect 0 0 64 64 12))
    # Paper page with three ruled lines
    $g.FillPath((Get-Brush '#ece6da'), (New-RoundedRect 16 8 32 48 4))
    $line = Get-Brush '#5f5b54'
    $g.FillPath($line, (New-RoundedRect 20 24 12 4 1))
    $g.FillPath($line, (New-RoundedRect 20 32 20 4 1))
    $g.FillPath($line, (New-RoundedRect 20 40 16 4 1))
    # Brass ribbon bookmark
    $ribbon = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new(36, 4), [System.Drawing.PointF]::new(44, 4),
        [System.Drawing.PointF]::new(44, 28), [System.Drawing.PointF]::new(40, 24),
        [System.Drawing.PointF]::new(36, 28))
    $g.FillPolygon((Get-Brush '#d8aa5e'), $ribbon)

    $g.Dispose()
    $stream = [System.IO.MemoryStream]::new()
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
    , $stream.ToArray()
}

# ICO file: 6-byte header, one 16-byte directory entry per image, then the PNG data.
$images = foreach ($size in $sizes) { , (Get-IconPng $size) }
$file = [System.IO.MemoryStream]::new()
$writer = [System.IO.BinaryWriter]::new($file)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $dim = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }  # 0 means 256
    $writer.Write([byte]$dim); $writer.Write([byte]$dim)
    $writer.Write([byte]0); $writer.Write([byte]0)            # palette size, reserved
    $writer.Write([uint16]1); $writer.Write([uint16]32)       # planes, bits per pixel
    $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
    $offset += $images[$i].Length
}
foreach ($png in $images) { $writer.Write($png) }
$writer.Flush()
[System.IO.File]::WriteAllBytes($out, $file.ToArray())
Write-Output "Wrote $out ($($file.Length) bytes, sizes: $($sizes -join ', '))"

New-Item -ItemType Directory -Force $pngDir | Out-Null
foreach ($size in $pngSizes) {
    [System.IO.File]::WriteAllBytes((Join-Path $pngDir "icon-$size.png"), (Get-IconPng $size))
}
Write-Output "Wrote $pngDir (sizes: $($pngSizes -join ', '))"
