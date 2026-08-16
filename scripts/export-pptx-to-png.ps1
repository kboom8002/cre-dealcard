param (
    [string]$pptxPath = "C:\Users\User\cre-dealcard\docs\test\stress\Seocho_Medical_160_V3_HERO_PERFECT.pptx",
    [string]$outputDir = "C:\Users\User\cre-dealcard\docs\test\stress\actual_slides_v3"
)

if (!(Test-Path $outputDir)) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}

try {
    $pptApp = New-Object -ComObject PowerPoint.Application
    # Open presentation in hidden/read-only mode
    $pres = $pptApp.Presentations.Open($pptxPath, [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
    
    $slideIndex = 1
    foreach ($slide in $pres.Slides) {
        $outFile = Join-Path $outputDir ("slide_{0:D2}.png" -f $slideIndex)
        $slide.Export($outFile, "PNG", 1920, 1080)
        Write-Output "Exported: $outFile"
        $slideIndex++
    }
    
    $pres.Close()
    $pptApp.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($pptApp) | Out-Null
    Write-Output "SUCCESS: All slides exported to $outputDir"
} catch {
    Write-Error $_.Exception.Message
}
