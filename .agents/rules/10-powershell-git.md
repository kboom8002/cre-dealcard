<!-- BEGIN:cre-d40-powershell-git -->
# CRE PowerShell Git 규칙 (2026-09-20 D40 교훈)

### 43. PowerShell Git Push 성공 판정 (Git Push Success Check)
- PowerShell에서 `git push 2>&1`은 exit code 1을 반환할 수 있습니다 (stderr에 진행 메시지가 출력되므로).
- 성공 여부는 exit code가 아니라 출력에서 `main -> main` 또는 `Everything up-to-date` 문자열로 판정합니다.
- exit code 1 + `main -> main` 출력 = **성공**입니다. 재시도하지 않습니다.
- **위반 사례**: `git push origin main 2>&1` → exit code 1 + `b4a93e7..6d5e3d3 main -> main` → 실제로는 성공인데 실패로 오인.

### 44. PowerShell 명령 체인 (Command Chaining)
- PowerShell에서 `&&`는 동작하지 않습니다. `;`을 사용합니다.
- 예: `git add -A; git commit -m "msg"; git push origin main 2>&1`
- `$LASTEXITCODE`로 이전 명령 성공 여부를 확인할 수 있습니다.

### 45. Git 출력 인코딩 (Git Output Encoding)
- PowerShell에서 git 출력의 한글이 깨질 수 있습니다 (EUC-KR vs UTF-8).
- 커밋 메시지에 한글을 사용할 때는 `git commit -m "..."` 형태가 안전합니다.
- `git log`의 한글 깨짐은 정상이며, 커밋 내용에는 영향 없습니다.
<!-- END:cre-d40-powershell-git -->
