# 격리 워크트리 프로덕션 빌드 (릴리즈 게이트용)
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release/worktree-build.ps1 [-Ref HEAD]
#
# 안전 규칙 (2026-10-10 사고 재발 방지):
#   워크트리의 node_modules 는 메인 repo node_modules 를 가리키는 "정션"이다.
#   정션이 남아 있는 상태에서 `git worktree remove --force` / `Remove-Item -Recurse` 를 실행하면
#   정션을 따라 들어가 메인 node_modules 의 실제 파일(pino/sharp/jsdom 등)이 삭제된다.
#   → 정션은 반드시 링크만 제거(cmd rmdir)하고, 제거됐음을 검증한 뒤에만 워크트리를 지운다. 검증 실패 시 중단.
#   (2차 사고 원인) next build(Turbopack)가 .next/node_modules/<pkg>-<hash> 형태로 외부 패키지
#   (serverExternalPackages + 기본 목록: sharp, pino, jsdom …) 링크를 만든다. 최상위 정션만 지우면
#   이 링크들이 남아 git worktree remove 가 따라 들어가 메인 패키지를 삭제한다.
#   → 삭제 전에 워크트리 전체의 재분석 지점(정션/심볼릭 링크)을 "들어가지 않고" 링크만 제거하고,
#     정리 후 메인 node_modules 의 외부 패키지 무결성을 검증한다.
param([string]$Ref = 'HEAD')
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$wt = Join-Path $repo '.deploy-check'
$sentinels = @('pino', 'sharp', 'jsdom') | ForEach-Object { Join-Path $repo "node_modules\$_\package.json" }

function Remove-JunctionSafely([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return }
  $item = Get-Item -LiteralPath $path -Force
  if (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw "SAFETY: $path 가 정션이 아닙니다 (실제 디렉터리). 수동 확인 필요 — 자동 삭제 중단."
  }
  if ($item.PSIsContainer) { cmd /c "rmdir `"$path`"" | Out-Null }   # 링크만 제거 (/s 금지)
  else { [IO.File]::Delete($path) }                                   # 파일 심볼릭 링크는 링크만 삭제됨
  if (Test-Path -LiteralPath $path) { throw "SAFETY: 링크 제거 실패 ($path). 워크트리 삭제를 중단합니다." }
}

# 재분석 지점 안으로는 절대 내려가지 않는 수동 재귀 (Get-ChildItem -Recurse 는 정션을 따라갈 수 있어 사용 금지)
function Remove-AllLinks([string]$dir) {
  foreach ($c in [IO.Directory]::EnumerateFileSystemEntries($dir)) {
    $attr = [IO.File]::GetAttributes($c)
    if ($attr -band [IO.FileAttributes]::ReparsePoint) { Remove-JunctionSafely $c }
    elseif ($attr -band [IO.FileAttributes]::Directory) { Remove-AllLinks $c }
  }
}

function Remove-Worktree {
  if (-not (Test-Path -LiteralPath $wt)) { return }
  Remove-AllLinks $wt
  Set-Location $repo
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'   # git stderr 가 PS 5.1 에서 예외로 바뀌는 것 방지
  git worktree remove --force $wt 2>&1 | Out-Null
  if (Test-Path -LiteralPath $wt) { cmd /c "rmdir /s /q `"$wt`"" }
  git worktree prune 2>&1 | Out-Null
  $ErrorActionPreference = $prev
  $missing = $sentinels | Where-Object { -not (Test-Path -LiteralPath $_) }
  if ($missing) { throw "SAFETY: 메인 node_modules 손상 감지 ($($missing -join ', ')) — npm install 로 복구 필요." }
}

Set-Location $repo
Remove-Worktree
git worktree add --detach $wt $Ref | Out-Null
try {
  Set-Location $wt
  cmd /c "mklink /J node_modules `"$repo\node_modules`"" | Out-Null
  Get-ChildItem $repo -Filter '.env*' -File | ForEach-Object { Copy-Item $_.FullName $wt }
  Write-Output "--- build ($Ref) ---"
  npm run build
  $code = $LASTEXITCODE
  Write-Output "BUILD_EXIT=$code"
} finally {
  Set-Location $repo
  Remove-Worktree
}
exit $code
