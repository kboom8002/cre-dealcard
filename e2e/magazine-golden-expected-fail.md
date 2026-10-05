# 매거진 골든 spec — 예상 실패 목록 (T3-TEST-1, 코디네이터 작성용)

> 골든 spec (`e2e/magazine-tutorial-part{1,2,3}-golden.auth.spec.ts`) 은 현재 결함이 남아 있는 동안
> **실패하는 것이 정상**이다. 결함을 고치면 해당 행을 지우고, 실패가 남으면 회귀로 본다.
> soft spec (`magazine-editor-walkthrough`, `magazine-part2-walkthrough`, `magazine-part3-walkthrough`) 은
> `describe.skip` 으로 무효화되었다 (if-visible soft 패턴 + 실데이터 쓰기).

| spec | 스텝/테스트명 | 예상 실패 사유 | 관련 결함 ID | 해소 Wave/담당 | 상태 |
|:---|:---|:---|:---|:---|:---|
| (코디네이터가 Playwright 실행 후 기입) | | | | | |

## 작성 절차
1. `npx playwright test e2e/magazine-tutorial-part1-golden.auth.spec.ts` 등 3개 실행 (코디네이터 전용).
2. 실패 스텝마다 위 표에 한 줄 추가 — 사유는 에러 메시지 첫 줄.
3. Wave 수정 후 재실행 → 통과한 행 삭제.
