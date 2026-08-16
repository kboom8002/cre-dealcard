
$ppt = New-Object -ComObject PowerPoint.Application
$ppt.Visible = [Microsoft.Office.Core.MsoTriState]::msoTrue

$files = @(
    "c:\Users\User\cre-dealcard\docs\test\pptx-results\pro_dark_obsidian_jamwon_pro.pptx",
    "c:\Users\User\cre-dealcard\docs\test\pptx-results\golden_institutional_jamwon_pro.pptx"
)

$outDir = "c:\Users\User\cre-dealcard\docs\test\pptx-results\images"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir }

foreach ($file in $files) {
    $presentation = $ppt.Presentations.Open($file, [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($file)
    $presOutDir = Join-Path $outDir $baseName
    if (-not (Test-Path $presOutDir)) { New-Item -ItemType Directory -Force -Path $presOutDir }
    $presentation.SaveAs($presOutDir, [Microsoft.Office.Interop.PowerPoint.PpSaveAsFileType]::ppSaveAsPNG)
    $presentation.Close()
}

$ppt.Quit()
echo "Done"

