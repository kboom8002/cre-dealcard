<!-- BEGIN:cre-d40-subagent-hygiene -->
# CRE 서브에이전트 위생 규칙 (2026-09-20 D40 교훈)

### 41. 서브에이전트 출력 파일 금지 (Zero Dump File Policy)
- 서브에이전트는 워크스페이스 루트에 로그/덤프 파일(`.log`, `.txt`, `.json` 등)을 생성해선 안 됩니다.
- vitest 출력은 `| Select-Object -Last N` 파이프로 제한합니다. 절대로 `Out-File`이나 `>`으로 전체 출력을 저장하지 않습니다.
- 디버깅 목적 출력이 필요하면 `<appDataDir>/brain/<conversation-id>/scratch/` 디렉토리를 사용합니다.
- **위반 사례**: test-results.txt 225MB → GitHub 100MB 제한 → git push 거부 2회 연속.

### 42. git commit 전 대형 파일 점검 의무 (Pre-Commit Size Guard)
- `git add -A` 후 반드시 `git diff --cached --stat`으로 staged 파일 크기를 확인합니다.
- 10MB 이상 파일이 staged되면 `.gitignore`에 추가하고 `git reset HEAD <file>`합니다.
- PPTX 골든 출력(`.pptx`)은 예외적으로 허용하되, 50MB 이상이면 Git LFS를 사용합니다.
- **위반 사례**: 서브에이전트가 생성한 final-run.log 76MB가 커밋에 포함 → GitHub 경고.
<!-- END:cre-d40-subagent-hygiene -->
