# IM 파이프라인 하드닝 — 세션 인수인계 (2026-10-07)

> 대상: 다른 IM 수정 세션. 기준 커밋 `b93c3d34` (main, 푸시 완료). 상세 로드맵: 아티팩트 `pipeline-hardening-roadmap.md` §1~§12.
> 레포: `c:\Users\User\cre-dealcard` (Windows PowerShell, Next.js — `AGENTS.md`: 이 Next 버전은 breaking change 있음, 코드 전에 `node_modules/next/dist/docs/` 확인).

## 1. 지금 상태 (검증 완료)
| 항목 | 결과 |
|:--|:--|
| 골든 E2E replay (`LLM_MODE=replay`) | **76/76 × 2회, miss 0** |
| 팩트 오라클 (`npm run test:oracle`) | PASS 194 / FAIL 0 / PENDING 4 |
| `tsc --noEmit` / `npm run build` | 통과 |
| 단위 테스트 | 4,541 통과, 2 실패(환경: LibreOffice 변환 `p3` Step 10, `p2` 전체 실행 시 1회성) |

## 2. 이번 세션에서 고친 것 (건드릴 때 주의)
1. **Mock LLM 폴백 차단** — `callLLM`이 OpenAI 실패 시 `MockOpenAIProvider`로 조용히 폴백해 가짜 렌트롤이 실문서에 유입됐음. `im-section-generator / im-judge / cre-quality-gate / cre-gate-repair / rent-roll/parse-text` 에 `allowMock: process.env.NODE_ENV === 'test'`. **새 LLM 호출부를 만들면 같은 옵션을 넣을 것.**
2. **`fit_summary` 누적 버그** — 승인 시 투자포인트 첫 줄이 `building_ssot_lite.fit_summary`로 역동기화 → 재생성 때 템플릿이 라벨을 또 붙임. `mobile-im/fit-summary-sanitize.ts`(멱등)를 approve 저장 / handler 읽기 / premium-template-engine 3곳에 적용. **fit_summary를 읽거나 쓰는 새 코드는 반드시 sanitize 경유.**
3. **메모 슬롯 오매핑** — `memo-slot-mapper.ts` 연면적 정규식이 `대지면적`의 `면적`에 걸려 대지면적이 연면적으로 저장 → 2배 괴리 가드가 건축물대장(층수·건폐율·용적률)을 무효화. lookbehind로 수정 + `memo-slot-mapper-area.test.ts`. (미수정 별건: 메모 `총 651.2㎡` 표기 정규식)
4. **㎡ 표기/메모 폴백** — `formatSqm`(환산값 1자리, 원천 ≤2자리 유지), `area-precision.ts`, 중개인 메모 폴백(층수/준공연도는 대장이 비었거나 무효화됐을 때만, "● 중개인입력").
5. **골든 결정성** — `e2e/helpers/golden-test-utils.ts: resetBackSyncedBuildingState` (Phase 2 시작 시 `fit_summary=null`), 7골든 모두 신규 딜카드로 재생성. `building-id.txt`는 gitignore(`e2e/screenshots/`)라 로컬 전용.
6. **juso 주소 API 키 교체** — `.env.local` + Vercel Production 교체 완료(다음 배포부터 적용, 푸시로 반영됨). 채팅에 노출됐으므로 **재발급 권고**.
7. 그 외 이번 세션 누적(상세 §1~§11): 팩트 오라클 + 오프라인 재렌더 루프, 건축물대장 정규화/주지번 해소, 랜드마크 풀(Kakao+V-World) + 선별 로직, 승인 게이트(posture별 필수값), 임차인 실명 정책(IM=실명, 공개 티저=마스킹 유지), 개발형 수익률 날조 기본값 제거, 스태킹/렌트롤 개선, 지적도 줌/본건 마커.

## 3. 작업 규칙 (재현 방법)
- **오라클/오프라인 루프** (서버·LLM·외부 API 불필요, 약 15초): `npx tsx scripts/golden-snapshot/rerender.ts <name|core>` → `npm run test:oracle`. 기대값: `docs/golden-test-data/*/expected_facts.json` (`pending` 태그 = 알려진 미해결, `ORACLE_STRICT=1`이면 실패 처리). 스냅샷 갱신: `npx tsx --env-file=.env.local scripts/golden-snapshot/capture.ts core --live-enrich`. 설명: `docs/golden-test-data/README-oracle.md`.
- **LLM 프롬프트를 바꾸는 수정**(섹션 프롬프트, 입력 필드, SSoT→프롬프트 경로)을 하면 녹화가 무효화됨 → 재녹화 필수:
  ```
  node scripts/with-env.mjs LLM_MODE=record-missing "LLM_MISS_LOG=<path>.jsonl" E2E_PORT=3110 -- npx playwright test e2e/golden --workers=1 --timeout=600000 --reporter=line --output=.next/pw-golden-out
  ```
  끝나면 같은 명령을 `LLM_MODE=replay`로 **2회** 돌려 76/76 + miss 0 확인(miss 로그 파일이 생기지 않아야 함). 프롬프트 차이 진단: `LLM_PROMPT_DUMP_DIR=<dir>` 로 두 실행 덤프 후 diff.
- **렌더 전용 수정**(PPTX 바인더/아키타입/뷰어 렌더러, 프롬프트 바이트 불변)은 재녹화 불필요 — 오라클만 돌리면 됨. 프롬프트로 새는 `externalData` 필드는 `prompt-external-slice.ts`의 strip 목록에 추가.
- 릴리스 게이트: `npx tsc --noEmit -p .` → `NEXT_DIST_DIR=.next/build-check`로 `npm run build` → **선별 `git add`** → `git push origin main`(Vercel 자동 배포). **`git add .` 금지.**
- 환경 주의: PowerShell `*>` 로그는 UTF-16(`Get-Content -Encoding Unicode`). Playwright 실행 후 `git checkout -- tsconfig.json docs/test`. 매거진 세션이 3000 포트 사용 → 우리는 3110 + 별도 `--output`, **3000 종료 금지**. 서버 `Compaction failed`/`goto` 타임아웃 시 `cmd /c rmdir /s /q .next\e2e-3110`. PC 절전(sleep) 시 실행이 죽음. junction 디렉터리는 `Remove-Item -Recurse` 대신 `cmd /c rmdir`. CRLF 파일 다행 수정은 node 패치 스크립트(파일로 저장) 사용.
- 규칙 요약: Rule 34 데이터 날조 금지, Rule 37 결측은 `-`, Rule 4 중복 렌더 금지, Rule 66 Sharp SVG 안 한글 금지(네이티브 텍스트). 오너 결정: IM은 실제 임차인명(공개 티저/매거진은 마스킹), 호텔/개발 골든은 DB 패치 없이 승인, 공공데이터 조회 실패는 결함, 주요 랜드마크 누락 불가.

## 4. 향후 처리할 작업 (우선순위)
**A. 오너 결정이 필요한 것**
1. 대장 vs 픽스처 충돌: dangsan 연면적 1441.15 vs 1141.15 · seocho 6F/1991 vs 7F/2005 · jamwon 용적률 325.63% vs 247%. (오라클은 현재 두 값 모두 허용)
2. seocho 주차: 대장 16대 vs 중개인 20대.
3. `guaranteeMajorInstitutions` 부작용 — dangsan 영등포경찰서가 한림대 한강성심병원으로 대체됨. 의도 확인.
4. 상호 미기재 행 표기: 현재 `임차인 A/B…`(D6). 오라클 규칙(익명 라벨 금지)과 충돌 → 규칙 확정 후 코드 또는 expected 정리.

**B. 코드/테스트**
5. 오라클 pending 4건: dangsan 상호(고은약국·국제와인 — xlsx에만 있고 골든 바텀시트 입력엔 없음 → 골든이 xlsx 업로드 경로를 타게 하거나 expected 조정) / `임차인 A` 라벨 / sinsa 비교사례(`manual_comps`) 슬라이드 부재.
6. 중개인 값 ≈ 대장 값(<1%)이면 대장 정밀값 사용(예: 2,104.9 → 2,104.88). 프롬프트 입력이 바뀌므로 재녹화 동반. 현재 오라클은 반올림 허용으로 우회.
7. `memo-slot-mapper` `총 651.2㎡` 정규식 별건.
8. `income-golden-*` 8개 변형 스펙은 이번에 재녹화/신규 딜카드 처리 안 됨 — 같은 `fit_summary` 리셋·신규 딜카드 적용 필요.
9. seocho·sinsa 스펙의 DB 패치 폴백 제거(`GOLDEN_APPROVE_DB_PATCH` 기본 OFF는 적용됨, 스펙 내부 잔여 확인).
10. `p3/p5` Step 10 슬라이드 캡처(LibreOffice) 환경 실패 — CI/로컬 환경 정비 또는 스킵 조건화.

**C. 운영/인프라**
11. juso 키 재발급(노출됨) → `.env.local` + Vercel 갱신.
12. GitHub PAT에 `workflow` 스코프 부여 후 `.gitignore`의 `/.github/workflows/magazine-gates.yml` 라인 제거 + 푸시.
13. 매거진 세션에 알림: 커밋 `9286de20` `git add .`에 매거진 파일 약 600개가 포함됨(현재 main에 있음).
14. 리스크 관찰: 타 권역 Kakao 타일 스크럽, HQ 게이트 오탐, 프롬프트 변경 시 재녹화 비용(1회 약 60~140 LLM 호출 + 서버 안정성 필요).

## 5. 이 세션의 비용/교훈 (재작업 방지)
- 재녹화가 7번 필요했던 이유: (a) 서버 캐시 장애, (b) `fit_summary` 누적, (c) 골든의 상태 이월(딜카드 재사용 → 직전 출력이 다음 입력), (d) 대지면적 오매핑으로 기존 딜카드 레이어가 오염. **프롬프트를 바꾸기 전에 오라클로 먼저 확인하고, 한 번에 묶어서 재녹화할 것.**
- 새 재녹화 전 체크: 신규 딜카드(`building-id.txt` 삭제), `fit_summary` 리셋 존재, 서버 캐시 정리, PC 절전 해제.
