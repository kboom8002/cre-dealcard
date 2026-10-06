# 매거진 골든 spec — 예상 실패/스킵 목록

> 골든 spec(`e2e/magazine-tutorial-part{1,2,3}-golden.auth.spec.ts`)은 튜토리얼을 문자 그대로 따라 하며
> 하드 단언을 건다. 아래 표는 **최신 실행(2026-10-06, 보완 구현 후)** 결과와, 마이그레이션 미적용 상태에서만
> 나타나는 "예상된 동작"을 기록한다. 실패가 늘면 회귀로 본다.

## 최신 결과

| spec | 결과 | 비고 |
|:---|:---|:---|
| `magazine-tutorial-part1-golden` | **84 PASS / 0 FAIL** | 1 test, 약 3분. `@needs-migration` 단계(7-5, 7-6)는 계약만 검증 |
| `magazine-tutorial-part2-golden` | 10 / 10 PASS | 구독 POST 503(`SERVICE_UNAVAILABLE`)은 마이그레이션 미적용 시 정상 |
| `magazine-tutorial-part3-golden` | 11 step 전부 PASS | 설문 503/집계 없음은 `magazine_poll_responses` 미적용 시 정상 |
| `magazine-proxy-bot` | 10 pass / 1 skip | |
| `magazine-authz-matrix.auth` | 16 pass / 8 skip | 스킵 8건 = B 계정(`E2E_BROKER_B_STORAGE`) 필요 |

## 마이그레이션 적용 전에만 나타나는 "예상 동작"

| 경로 | 적용 전 동작 | 적용 후 기대 | 필요한 마이그레이션 |
|:---|:---|:---|:---|
| `POST /api/public/magazine/subscribe` | 503 `SERVICE_UNAVAILABLE` (가짜 성공 없음) | 200 `pending` | 동의 컬럼(000003 등) |
| `POST /api/public/magazine/poll` | 503 안내 | 투표·집계 | poll_responses 마이그레이션 |
| 구독자 수동 추가 응답 | `consentRecorded:false` 고지 | `true` | 동의 컬럼 |
| 발송 상태 배지 | "발송 기능이 꺼져 있어요" | `MAGAZINE_SEND_ENABLED` 에 따름 | env |
| `needs_review` 저장 | CHECK 위반 → 정직한 에러 | 저장 | 000002 |

## 스킵(구조적) 목록

- `magazine-authz-matrix` 의 B→A 교차 8건: 2번째 중개인 E2E 계정 필요. `E2E_BROKER_B_STORAGE=<storageState 경로>` 를 주면 실행된다.
- `magazine-editor-walkthrough` / `magazine-part2-walkthrough` / `magazine-part3-walkthrough`: `describe.skip` (if-visible soft 패턴이라 골든으로 대체).

## 실행 방법

```powershell
$env:UNSUBSCRIBE_SECRET="e2e-only-unsub-secret-0001"; $env:MAGAZINE_SID_SECRET="e2e-only-sid-secret-0001"
$env:E2E_PORT="3201"   # 다른 창과 겹치지 않는 포트
npx playwright test e2e/magazine-tutorial-part1-golden.auth.spec.ts --project=authenticated --no-deps --workers=1 --reporter=line
```

- 비밀값은 프로세스 환경변수로만 준다(`.env.local` 에 넣지 않음).
- 테스트 행은 `E2E_TUT*_` / `E2E-AUTHZ-` 접두사로 식별되며 afterAll 에서 service role 로 삭제된다.
- 실제 카카오/이메일/SMS 발송은 일으키지 않는다(`MAGAZINE_SEND_ENABLED` 기본 false).
