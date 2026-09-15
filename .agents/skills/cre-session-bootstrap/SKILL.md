---
name: cre-session-bootstrap
description: >-
  새 세션 시작 시 이전 작업 컨텍스트를 5분 이내로 복원합니다.
  git log, task.md, walkthrough.md를 자동 탐색하여 현재 상태를 진단하고
  다음 작업 옵션을 제시합니다. 서브에이전트 발사 없이 직접 수행합니다.
---

# CRE 세션 부트스트랩 워크플로우

## 실행 조건
- 새 세션에서 사용자가 "이전 작업 이어서" 또는 "다음 작업" 요청 시
- 대규모 코드 변경 후 현재 상태 점검이 필요할 때

## 5단계 부트스트랩 (서브에이전트 미사용, 총 5분 이내)

### Step 1: 최근 커밋 맥락 파악 (30초)
```powershell
git log --oneline -10
```
최근 10개 커밋의 제목에서 작업 방향(파이프라인/테스트/UI/배포)을 파악합니다.

### Step 2: 미완료 작업 탐색 (30초)
brain 디렉토리에서 가장 최근 `task.md`를 찾아 `[/]` (진행중) 항목을 확인합니다.
```powershell
# 가장 최근 task.md 탐색
Get-ChildItem -Path "$env:USERPROFILE\.gemini\antigravity\brain" -Recurse -Filter "task.md" |
  Sort-Object LastWriteTime -Descending | Select-Object -First 3
```

### Step 3: 코드 건강도 즉시 확인 (60초)
```powershell
npm run preflight
```
108개 preflight 단언이 전수 통과하는지 확인합니다. 실패가 있으면 즉시 보고합니다.

### Step 4: 관련 Rule 모듈 로드 (30초)
작업 유형에 따라 `.agents/rules/` 에서 관련 모듈만 `view_file`로 읽습니다:
- PPTX 수정 → `02-pipeline-engineering.md`, `05-posture-isolation.md`, `06-preflight-audit.md`
- E2E 테스트 → `08-e2e-golden-test.md`
- 프론트엔드 UI → `04-production-web.md`
- Basic IM 기능 → `07-basic-im-ssot.md`

### Step 5: 상태 요약 및 작업 제안 (60초)
수집된 정보를 종합하여 사용자에게 다음을 보고합니다:
1. **최근 작업 요약** (최신 커밋 3개 기반)
2. **미완료 항목** (task.md `[/]` 항목)
3. **코드 건강도** (preflight 통과/실패)
4. **추천 다음 작업** (우선순위와 근거)

## 작업 복잡도별 프로세스 분기

부트스트랩 완료 후, 사용자 요청의 복잡도를 판별하여 적절한 프로세스를 적용합니다:

| 복잡도 | 판별 기준 | 프로세스 |
|:---:|:---|:---|
| **S** | 단일 파일, 오타/컬럼 순서 등 명확한 수정 | 즉시 수정 → `npm run preflight` → `git push` |
| **M** | 2~5개 파일, 연쇄 수정이 필요한 버그 | 채팅에서 수정 방향 설명 → 실행 → 테스트 → push |
| **L** | 아키텍처 변경, 새 아키타입/모듈 추가 | `implementation_plan.md` 작성 → 사용자 승인 → `task.md` → 실행 |
| **XL** | 전면 감사, 다포스처 검증, 64건+ 실패 수정 | `/goal` 명령 + 병렬 서브에이전트 + `cre-test-remediation-v2` Skill |

**S/M 복잡도에서는 `implementation_plan.md`를 생성하지 않습니다.**
