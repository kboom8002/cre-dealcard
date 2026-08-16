param(
    [string]$PptxDir,
    [string]$PngDir
)

# Convert to absolute paths
$PptxDir = (Resolve-Path $PptxDir).Path
$PngDir  = [System.IO.Path]::GetFullPath($PngDir)
New-Item -ItemType Directory -Force -Path $PngDir | Out-Null

$ppt = New-Object -ComObject PowerPoint.Application

$pptxFiles = Get-ChildItem -Path $PptxDir -Filter "*.pptx"

foreach ($file in $pptxFiles) {
    $baseName = $file.BaseName
    $slideDir = Join-Path $PngDir $baseName
    New-Item -ItemType Directory -Force -Path $slideDir | Out-Null

    Write-Host "Converting: $($file.Name) ..."
    try {
        $pres = $ppt.Presentations.Open($file.FullName, [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)

        $count = $pres.Slides.Count
        foreach ($slide in $pres.Slides) {
            $idx = $slide.SlideIndex
            $outPath = Join-Path $slideDir "s${idx}.png"
            try {
                $slide.Export($outPath, "PNG", 1920, 1080)
            } catch {
                Write-Host "  WARNING: Slide $idx export error (file may still be created)"
            }
            Write-Host "  Slide $idx -> $outPath"
        }

        $pres.Close()
        Write-Host "  Done: $count slides"
    } catch {
        Write-Host "  ERROR opening file: $_"
    }
}

$ppt.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null
Write-Host "`nAll conversions complete."
