# Income 골든 E2E 배치 실행기
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/income-golden/run-golden.ps1 [-Targets ig1-corrected,ig2-as-is] [-Port 3110] [-NoReset] [-Capture]
# 순서: 사전점검 -> (기본) 빌딩 리셋 -> 변형별 순차 실행(--workers=1) -> E2E 부작용 복원 -> (선택) 스냅샷 캡처 -> 요약
# 로그: e2e/screenshots/income-golden-batch/<target>.log, 요약: summary.txt
param(
  [string[]]$Targets = @('ig1-corrected','ig1-as-is','ig2-corrected','ig2-as-is','ig3-corrected','ig3-as-is','ig4-corrected','ig4-as-is'),
  [int]$Port = 3110,
  [switch]$NoReset,
  [switch]$Capture
)
$ErrorActionPreference = 'Continue'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repo
$logDir = 'e2e\screenshots\income-golden-batch'
New-Item -ItemType Directory -Force $logDir | Out-Null

node --env-file=.env.local scripts/income-golden/preflight.mjs --port $Port
if ($LASTEXITCODE -ne 0) { Write-Output 'PREFLIGHT_FAILED'; exit 1 }

if (-not $NoReset) {
  node --env-file=.env.local scripts/income-golden/reset-building.mjs @Targets
  if ($LASTEXITCODE -ne 0) { Write-Output 'RESET_FAILED'; exit 1 }
}

$env:E2E_PORT = "$Port"
$summary = @()
foreach ($t in $Targets) {
  $spec = "e2e/income-golden-$t.auth.spec.ts"
  if (-not (Test-Path $spec)) { $summary += "$t`tSKIP (spec 없음)"; continue }
  $log = Join-Path $logDir "$t.log"
  $sw = [Diagnostics.Stopwatch]::StartNew()
  npx playwright test $spec --workers=1 --timeout=600000 --reporter=list --output=".next/pw-$t-out" *> $log
  $code = $LASTEXITCODE
  $sw.Stop()
  $passed = (Select-String -Path $log -Pattern '^\s+(\d+) passed' | Select-Object -Last 1).Matches.Groups[1].Value
  $failed = (Select-String -Path $log -Pattern '^\s+(\d+) failed' | Select-Object -Last 1).Matches.Groups[1].Value
  $summary += "$t`texit=$code`tpassed=$passed`tfailed=$failed`t$([int]$sw.Elapsed.TotalMinutes)m"
  Write-Output $summary[-1]
  # E2E 부작용 복원 (tsconfig.json / docs/test 수정 잔재)
  git checkout -- tsconfig.json docs/test 2>$null | Out-Null
}

if ($Capture) {
  foreach ($t in $Targets) { npx tsx scripts/golden-snapshot/capture.ts "income-$t" --live-enrich *>> (Join-Path $logDir 'capture.log') }
  Write-Output 'CAPTURE_DONE'
}

$summary | Set-Content -Encoding UTF8 (Join-Path $logDir 'summary.txt')
Write-Output '--- SUMMARY ---'
$summary
