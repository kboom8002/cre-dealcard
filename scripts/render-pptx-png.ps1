param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [int]$Width = 1280,
  [int]$Height = 720
)
# PowerPoint COM 으로 PPTX 슬라이드를 PNG 로 내보낸다 (Windows + PowerPoint 필요).
# 파일명은 로케일에 따라 달라지므로(예: 슬라이드1.PNG) 호출 측에서 끝 숫자로 번호를 해석한다.
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
Get-ChildItem $OutDir -Filter *.png -ErrorAction SilentlyContinue | Remove-Item -Force
$app = New-Object -ComObject PowerPoint.Application
try {
  $pres = $app.Presentations.Open((Resolve-Path $Pptx).Path, $true, $true, $false)
  $pres.Export((Resolve-Path $OutDir).Path, 'PNG', $Width, $Height)
  $pres.Close()
} finally {
  $app.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($app) | Out-Null
}
