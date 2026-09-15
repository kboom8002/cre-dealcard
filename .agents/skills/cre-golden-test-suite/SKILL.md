---
name: cre-golden-test-suite
description: >-
  CRE IM 파이프라인의 상용화 수준 품질 검증 워크플로우.
  Basic/Pro IM 5대 포스처 골든 E2E 테스트 실행, 4-Layer 테스트 피라미드 순차 검증,
  PPTX 바이너리 4대 단언(Poison Token, Mock Data, 회피 문구, 가격 밴드),
  4단계 릴리즈 게이트(preflight → tsc → build → push)를 수행할 때 사용합니다.
---

# CRE 상용화 골든 테스트 실행 워크플로우

## 언제 사용하는가

- IM 파이프라인(writer, data-binder, deck-sequencer, PPTX archetype 등) 코드 변경 후 상용화 수준 품질을 검증할 때
- 5대 포스처(수익형 일반/고공실, 개발형, 사옥형, 매매형) 골든 E2E 테스트를 순차 실행할 때
- Basic IM 또는 Pro IM의 릴리즈 게이트를 통과시키고 배포할 때
- PPTX 바이너리 파싱 및 시각적 슬라이드 품질을 검증할 때

## Step 0: 영향 분석 기반 선택적 E2E (Impact Analysis)

불필요한 E2E(약 3~4분 소요)를 피하기 위해, 수정된 파일이 E2E 범위를 촉발하는지 판단합니다.

- **파이프라인 Core 변경** (`writer.ts`, `deck-sequencer.ts`, `handler.ts` 등) → 5대 포스처 E2E 전체 실행
- **특정 아키타입 변경** (예: `a23-yield-formula.ts`) → 해당 포스처 E2E만 실행 (`basic-im-golden`)
- **단순 텍스트/UI 수정** → E2E 생략, `npm run preflight` 만으로 검증 완료

## 핵심 불변식 (Invariants)

1. **Rule 41 (골든 테스트 ≠ 단위 테스트)**: `npx tsx`로 함수를 직접 호출하는 것은 단위 테스트. 골든 테스트는 반드시 `npm run dev` + Playwright 브라우저 + 실DB + 실UI 전구간을 거쳐야 한다.
2. **Rule 43 (실 API 호출 의무)**: 카카오 지도, V-World WMS를 placeholder 이미지로 대체하고 성공이라 보고하지 않는다.
3. **Rule 52 (가격 밴드 차단)**: `50억~80억` 형태의 밴드 표기 금지. 단일 확정 매각 희망가를 바인딩한다.
4. **Rule 57 (실 PNU 의무)**: 테스트 입력 메모에 가상 지번 사용 금지. 국토부 실제 필지 지번만 사용한다.
5. **Rule 59 (공유 하네스 의무)**: 모든 골든 테스트는 `e2e/helpers/golden-test-utils.ts`를 사용하고 4대 바이너리 단언을 수행한다.

## Basic IM SSOT 표준 9섹션 시퀀스 (Rule 47)

`credeal_basic` 프리셋은 정확히 아래 9섹션만 시퀀싱합니다 (데이터 가용성에 따라 8~10면):

| 순서 | 슬라이드 키 | 아키타입 | 핵심 콘텐츠 |
|:---:|:---|:---:|:---|
| 01 | `cover` | A01 | 표지 — 미니멀 배경, 매물명, 주소, 매각 희망가 |
| 02 | `summary` | A02 | 자산 요약 — 6대 핵심 지표 + 3대 투자 포인트 |
| 03 | `building` | A04 | 물건 개요 — 공부 스펙 + 외관 사진 |
| 04 | `location` | A06 | 입지 분석 — 카카오 지도 + 랜드마크 (절삭 불가) |
| 05 | `land` | A04 | 토지/공법 — V-World 지적도 + 용도지역 |
| 06 | `rentRollStacking` | A24 | 렌트롤 & 스태킹 — 층별 테넌트/면적/임대료 |
| 07 | `yieldFormula` | A23 | 투자수익률 — As-Is + Stabilized Cap Rate |
| 08 | `gallery` | A14 | 현장 사진 — 6컷 그리드 (지도 침투 차단) |
| 09 | `closing` | A10 | 문의 및 유의사항 — 중개사 연락처 + 면책 조항 |

**절대 제외 슬라이드** (Basic IM에 섞이면 안 됨):
`capital`, `totalReturn`, `dcf`, `sensitivity`, `loan`, `tax`, `thesis`, `risk`, `checklist`, `process`, `stability`, `profit`

## 4-Layer 테스트 피라미드

### Layer 1: 순수 도메인 단위 테스트 (Vitest, < 2s)
```powershell
npm run preflight
```
- `preflight-pipeline-audit.test.ts` (40개) + `copy-cross-compare.test.ts` (40개) + `a22-stacking-plan.test.ts` (22개)
- 면적 파싱 헬퍼, 마크다운 테이블 분리, Protected Keys 일관성, Positive/Negative 짝 단언

### Layer 2: API 및 파이프라인 통합 테스트
```powershell
npx vitest run src/tests/e2e/p0-tier-grade-gate.test.ts
```
- 승인 게이트(`runApprovalGate`), 해시 무결성(`expectedHash`), 타임아웃 패리티

### Layer 3: 프로덕션 E2E 골든 테스트 (Playwright)
```powershell
npx playwright test e2e/<spec>.auth.spec.ts --project=authenticated
```
- 사전 요건: `npm run dev` 실행 중, `.env.local` API 키 유효
- 각 테스트는 4대 바이너리 단언 100% 통과 필수

### Layer 4: PPTX 바이너리 파싱 및 시각 QA
- `golden-test-utils.ts`의 `analyzePptxZip` + 150 DPI 슬라이드 PNG 캡처
- OpenXML 결함 토큰 0건, 더미 데이터 0건, 회피성 문구 0건, 가격 밴드 0건

## 5대 포스처 골든 에셋 매트릭스

| 포스처 | 시나리오 | 실지번 / PNU | 매각가 | E2E 스펙 파일 |
|:---:|:---|:---|:---:|:---|
| 수익형 (일반) | 당산동 호산당빌딩 | 당산동1가 72-1 / `1156011700100720001` | 115억 | `basic-im-golden.auth.spec.ts` |
| 수익형 (고공실) | 역삼동 오피스 | 역삼동 832-7 / `1168010100108320007` | 135억 | `gangnam-vacancy-golden.auth.spec.ts` |
| 개발형 (신축부지) | 대흥동 개발부지 | 대흥동 12-41 / `1144010800100120041` | 78억 | `mapo-dev-golden.auth.spec.ts` |
| 사옥형 (자가사용) | 서초동 메디컬사옥 | 서초동 1338-20 / `1165010800113380020` | 210억 | `seocho-basic-golden.auth.spec.ts` |
| 매매형 (시세차익) | 신사동 도산대로변 | 신사동 652-16 / `1168010700106520016` | 165억 | `sinsa-basic-golden.auth.spec.ts` |

## 골든 테스트 공유 하네스 (`e2e/helpers/golden-test-utils.ts`)

필수 사용 export 목록:

| 함수 | 용도 |
|---|---|
| `ensureDir(path)` | 산출물 디렉토리 생성 |
| `shot(page, name)` | 스크린샷 아티팩트 보존 |
| `getVisibleText(page)` | 페이지 텍스트 추출 |
| `computeTargetHash(page)` | 승인용 SHA-256 해시 취득 |
| `handleDuplicateModal(page)` | 중복 딜카드 모달 처리 |
| `pollImCompletion(page, timeout)` | IM 생성 비동기 폴링 |
| `approveDocument(page, hash)` | 문서 승인 처리 |
| `downloadPptx(page)` | PPTX 파일 다운로드 |
| `analyzePptxZip(buffer)` | PPTX ZIP 바이너리 파싱 |
| `assertNoPoisonTokens(xml)` | NaN/undefined/null/[object Object] 0건 단언 |
| `assertNoDummyData(xml)` | NH농협캐피탈/테헤란로 등 목데이터 0건 단언 |
| `assertNoEvasivePhrases(xml)` | '본문을 참조' 등 8종 회피성 문구 0건 단언 |
| `assertPriceBandBlocked(xml)` | `\d+억~\d+억` 가격 밴드 0건 단언 |

## 4단계 릴리즈 게이트

커밋 및 배포 전 반드시 순차 통과:

```powershell
# Step 1: 파이프라인 사전 점검 (102개 테스트)
npm run preflight

# Step 2: TypeScript 컴파일러 전수 검사 (0 errors)
npx tsc --noEmit

# Step 3: Next.js 프로덕션 빌드 (Exit Code 0)
npm run build

# Step 4: git push (Vercel 자동 배포 트리거)
git add -A && git commit -m "..." && git push origin main
```

모든 단계가 `PASS`일 때만 배포합니다.

## 사전 환경 체크리스트

골든 E2E 테스트 실행 전 반드시 확인:

- [ ] `npm run dev` — Next.js dev server 실행 중
- [ ] `.env.local`의 `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` 유효
- [ ] `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 유효
- [ ] `.env.local`의 `KAKAO_REST_API_KEY` / `VWORLD_API_KEY` 유효
- [ ] Playwright 브라우저 설치 완료 (`npx playwright install`)

## 참고 문서

- [COMMERCIAL_GRADE_TEST_PROTOCOL.md](../../../docs/test/COMMERCIAL_GRADE_TEST_PROTOCOL.md) — 상세 테스트 프로토콜
- [NEXT_SESSION_MASTER_PROMPT.md](../../../docs/test/NEXT_SESSION_MASTER_PROMPT.md) — 세션 마스터 프롬프트
- [AGENTS.md](../AGENTS.md) — CRE 엔지니어링 룰북 (Rules 1~59)
- [golden-test-utils.ts](../../../e2e/helpers/golden-test-utils.ts) — 공유 테스트 하네스
