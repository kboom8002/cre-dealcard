<!-- BEGIN:cre-d42-e2e-rules -->
# CRE IM D42 E2E Golden Test Rules (2026-09-10 교훈)

### 41. 프로덕션 골든 테스트 의무 (Production Golden Test Mandate)
- "골든 테스트", "프로덕션 테스트", "E2E 테스트"를 수행할 때 함수를 직접 호출(`npx tsx`)하는 것은 **단위 테스트**이지 골든 테스트가 아닙니다.
- 프로덕션 골든 테스트는 반드시:
  1. Next.js dev server를 가동하고 (`npm run dev`)
  2. Playwright 브라우저로 실제 UI를 조작하며 (메모 입력 → 바텀시트 → IM 생성)
  3. Supabase 실DB를 거치고 (`building_ssot_lite`, `document_objects`)
  4. `handler.ts` 전구간을 통과하고 (geocoding, enrichment, writer/LLM)
  5. 스크린샷 아티팩트를 산출물 증거로 보존해야 합니다.
- 실행 명령: `npx playwright test e2e/<spec>.auth.spec.ts --project=authenticated`
- **위반 사례**: `npx tsx`로 `pptx-renderer`만 직접 호출하고 "골든 테스트"라고 칭함 → 프로덕션 8단계 중 1단계만 통과.
- **IM 생성 경로가 분기될 때(Basic/Pro, 포스처별 등) 각 경로별 독립 골든 테스트**를 작성합니다.
  * `dangsan-full-pipeline.auth.spec.ts` — 기본 IM 생성 경로
  * `basic-im-golden.auth.spec.ts` — Basic IM (`credeal_basic` 프리셋) 전용 경로
- 하나의 스펙에 모든 경로를 혼재시키지 않습니다 (600줄 이상 스펙 비대화 방지).

### 42. 기존 E2E 인프라 우선 조사 (Existing E2E Infrastructure First)
- E2E/통합 테스트를 새로 작성하기 전에 반드시 기존 인프라를 조사합니다:
  1. `find_by_name *.spec.ts e2e/` — 기존 Playwright 스펙 파일
  2. `playwright.config.ts` — 프로젝트/인증 설정
  3. `e2e/auth.setup.ts` — 인증 셋업
  4. `.env.local`의 `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`
- 기존 스펙이 목적에 부합하면 **새로 작성하지 않고 기존 것을 실행**합니다.
- 기존 스펙을 확장해야 할 경우에만 수정하거나 새 스펙을 추가합니다.
- **위반 사례**: `dangsan-full-pipeline.auth.spec.ts`(579줄, 4 Phase)가 이미 존재하는데 `golden-dangsan-pptx-runner.ts`를 새로 작성.

### 43. 외부 API 실호출 의무 (Real External API Call Mandate)
- 카카오 Static Map, V-World WMS 지적도, data.go.kr 등 외부 API를 사용하는 기능을 테스트할 때 placeholder 이미지나 하드코딩된 URL로 대체하는 것을 금지합니다.
- `.env.local`에서 `dotenv.config()`로 API 키를 로드하고 실 API를 호출합니다.
- 로컬 환경 제약(Referer 불일치 등)으로 실패할 경우:
  1. 실패 원인을 명확히 로그에 기록하고
  2. fallback 사용 시 `source: 'fallback'`으로 명시하며
  3. **"API 호출 성공"이라고 보고하지 않습니다**
- **위반 사례**: 항공사진(`02_aerial.jpg`)을 지적도로 둔갑시키고 "V-World WMS 지적도 임베딩 확인"이라고 보고.

### 44. protectedKeys 단일 원천 동기화 원칙 (Protected Keys Single Source of Truth)
- `deck-sequencer.ts`의 `protectedKeys` Set에 슬라이드를 추가/제거할 때, 이 목록을 하드코딩하고 있는 **모든 테스트 파일을 동시에 업데이트**합니다.
- 현재 하드코딩 위치 (6곳):
  1. `src/domain/building/mobile-im/pptx/deck-sequencer.ts` (소스)
  2. `src/tests/e2e/cross-format-parity.test.ts`
  3. `src/tests/e2e/income-archetype.test.ts`
  4. `src/tests/e2e/data-contract.test.ts`
  5. `src/tests/e2e/pipeline-vulnerability-defense.test.ts`
  6. `src/tests/unit/pptx-studio/pptx-challenger-m34-1.test.ts`
- `grep -r "protectedKeys" src/` 로 전체 위치를 반드시 조회한 뒤 동시 수정합니다.
- **위반 사례**: deck-sequencer에 `location`을 추가하고 테스트 5곳을 누락 → 테스트 실패.
<!-- END:cre-d42-e2e-rules -->

<!-- BEGIN:cre-d42-audit-rules -->
# CRE IM D42 Audit Remediation Rules (2026-09-13 교훈)

### 48. ssot_summary 필드명 정합성 의무 (SSOT Field Name Parity)
- `ssot_summary` 객체의 필드를 참조할 때 추측 필드명(`deposit_total_krw` 등)을 사용하지 않습니다.
- 반드시 `financial-calculator.ts` / `ssot-adapter.ts`의 실제 등록 필드명(`total_deposit_manwon`, `asking_price_manwon`, `monthly_rent_total_krw` 등)과 대조합니다.
- 단위 접미사(`_manwon` = 만원, `_krw` = 원, `_pct` = 백분율)를 확인하고, 단위 변환이 필요하면 명시적으로 수행합니다: `manwon * 10000 = krw`.
- **위반 사례**: `ssot.deposit_total_krw` → `undefined` → 보증금 0원으로 Cap Rate 산식 오류.

### 49. 비캐싱 에셋의 캐시 가드 바이패스 (Cache Bypass for Non-Cacheable Assets)
- Rule 40에 의해 DB에 캐싱되지 않는 바이너리 에셋(V-World WMS 지적도, 카카오 Static Map 이미지 등)에 대해 캐시 staleness 가드(`if (cachedData && !isSourceStale(...)) return;`)를 적용하지 않습니다.
- 좌표가 유효하면 캐시 존재 여부와 무관하게 항상 실시간 fetch합니다.
- `enrich-by-pnu.ts`의 각 에셋별 IIFE에서 캐시 가드를 추가할 때, 해당 에셋이 `external_data_cache` 테이블에 실제로 저장되는지 먼저 확인합니다.
- **위반 사례**: 지적도 캐시 가드 → 캐시 히트 시 fetch 영구 스킵 → `cadastralMapImage: null` → 슬라이드 누락.

### 50. 서버사이드 지도 API Referer 헤더 의무 (Server-Side Map API Referer Header)
- Node.js 환경에서 카카오, 네이버, V-World 등 지도 API를 `fetch()`로 호출할 때 반드시 등록 도메인의 `Referer` 헤더를 포함합니다.
- `Referer: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'`
- 브라우저 환경과 달리 Node.js `fetch()`는 Referer를 자동 전송하지 않으며, 지도 API 서버는 Referer가 없으면 403 Forbidden을 반환합니다.
- **위반 사례**: `fetchKakaoMapImage()` → `spi.maps.daum.net` 403 → 카카오맵 이미지 미생성 → 광역교통 다이어그램으로 강제 대체.

### 51. 파생 데이터 타입 가드 의무 (Derived Data Type Guard)
- 범용 배열(`tableRows`, `metrics`, `callouts` 등)을 도메인 구조체(층별 데이터, 임차인 정보 등)로 변환할 때 반드시 첫 행/첫 열의 타입 패턴을 검증합니다.
- 층별 데이터: `FLOOR_PATTERN = /^(B?\d+F?|지상|지하|옥탑|PH|RF|\d+층)/i` 매칭 필수
- 패턴 불일치 시 변환을 차단하고 빈 배열을 유지합니다 (`floors = []`).
- **위반 사례**: ssot_summary 합성 행("월 임대료 합계", "보증금 합계")이 A24의 층 이름으로 둔갑 → 스태킹 플랜 시각 오염.

### 52. 정확 금액 우선 표시 원칙 (Exact Amount Display Priority)
- 투자자 대면 문서(IM, PPTX)에서 금액을 표시할 때 `price_band`("200억대")보다 정확 금액("230억 원")을 최우선 사용합니다.
- 우선순위: `ssot_summary.asking_price_manwon` → `heroCard.askingPrice` → `heroCard.askingPriceDisplay` → `heroCard.priceBand`
- `price_band`는 deal card 목록/검색용 가격대 필터로만 사용하고, IM 본문에는 정확 금액을 바인딩합니다.
- **위반 사례**: `writer.ts`에서 `price_band ?? exact_price` 우선순위 역전 → IM 표지/요약에 "200억대" 표시 (실제 230억).

### 53. Enrichment 선결 조건 검증 (Enrichment Prerequisite Check)
- IM 생성(`handler.ts`) 시 enrichment 파이프라인을 실행하기 전에 `building_ssot_lite.layers.location`에 다음 3가지가 존재하는지 확인합니다: `pnu` (또는 `resolved_pnu`), `address` (구체적 도로명 주소), `lat/lng` (좌표).
- 3가지 중 하나라도 없으면 `raw_input`(원본 메모)에서 주소를 재추출하여 카카오 주소 검색 API로 geocoding을 시도합니다.
- 주소가 권역명("서초·양재권역")만 있고 정확 주소가 없으면 enrichment를 스킵하되, 로그에 `[enrichment] SKIPPED: 정확 주소/PNU/좌표 미확보`를 명시적으로 기록합니다.
- **위반 사례**: LLM이 메모를 "서초·양재권역"으로만 요약 → PNU/좌표 null → enrichment 전체 스킵 → 카카오맵/지적도/랜드마크 전부 미생성.
<!-- END:cre-d42-audit-rules -->

<!-- BEGIN:cre-d42-rca-rules -->
# CRE IM D42 RCA Rules (2026-09-14 당산동 골든 테스트 교훈)

### 54. 골든 테스트 콘텐츠 품질 단언 의무 (Content Quality Assertion Mandate)
- E2E 골든 테스트의 PPTX 검증에서 **구조적 단언(structural assertion)**만으로는 불충분합니다.
- 반드시 다음 5종의 **콘텐츠 품질 단언(content quality assertion)**을 포함해야 합니다:
  1. **지도 소스 검증**: 임베딩 미디어 중 50KB 초과 이미지 ≥1장 (SVG 플레이스홀더 ~20KB 방지)
  2. **금액 교차 검증**: 입력 메모의 핵심 수치(매매가, 보증금, 월임대료)가 PPTX 텍스트에 반영
  3. **렌트롤 완전성**: 입력한 층수 키워드가 PPTX 텍스트에 최소 2개 이상 매칭
  4. **회피성 문구 확장 검사**: Rule 37의 4종 패턴 + `현장 실사 확인`, `원본 계약서 대조`, `점검하였습니다`, `자문 후 확정` 등 총 10종 이상
  5. **하드코딩 폴백 수치 부재**: 다른 매물의 수치(역명, 면적, Cap Rate)가 PPTX에 혼입되지 않음
- **위반 사례**: 당산동 E2E — 11종 구조적 단언 전부 통과했으나 5대 콘텐츠 결함 미검출.

### 55. 아키타입 폴백 텍스트 Rule 37 감사 (Archetype Fallback Text Audit)
- PPTX 아키타입(`a02-stat-grid.ts`, `a04-asymmetric-7-5.ts` 등)의 **하드코딩 폴백 텍스트**는 LLM 프롬프트 가드레일을 우회합니다.
- 아키타입 코드의 폴백/fallback 문자열을 수정할 때 반드시:
  1. Rule 37 회피성 문구 패턴 10종과 대조 검사
  2. Rule 26 특정 매물 수치(역명, 면적, Cap Rate, 지역명) 하드코딩 금지 대조 검사
  3. Rule 34 모의/더미 데이터 금지 대조 검사
- 폴백이 불가피할 경우 `input.data.heroCard`, `input.data.areaSignal`, `input.data.address` 등 **동적 데이터에서 파생**해야 합니다.
- 데이터가 없으면 해당 요소를 렌더링하지 않습니다 (`return null` 또는 빈 문자열).
- **위반 사례**: A04 L177 `'현장 실사 확인 사항입니다'` 하드코딩, A02 L209 `'양재역(3호선·신분당선) 도보권'` 하드코딩.

### 56. 외부 API 로컬/프로덕션 패리티 (External API Local-Production Parity)
- 카카오 Static Map, V-World WMS 등 외부 API를 사용하는 함수는 **로컬(localhost)과 프로덕션(Vercel) 환경 모두에서 동일한 결과**를 반환해야 합니다.
- URL re-fetch 방식(`fetchKakaoMapImage`)이 Referer 도메인 검증으로 실패할 경우, **API 키를 직접 사용하는 대체 함수**(예: `generateStaticMapPlaceholder`)를 폴백 체인에 반드시 포함합니다.
- 로컬 E2E 테스트에서 외부 API 실패 시 **SVG 플레이스홀더나 벡터 다이어그램으로 조용히 폴백하지 않습니다** — 최소한 `console.warn`으로 실패를 기록하고, 테스트 단언으로 폴백 여부를 검출합니다.
- **위반 사례**: `fetchKakaoMapImage()` 404 → `generateMacroTransitDiagram()` SVG 폴백 → 사용자에게 "카카오맵이 아닌 직접 그린 지도" 표시.
<!-- END:cre-d42-rca-rules -->

<!-- BEGIN:cre-d43-golden-rules -->
# CRE IM D43 E2E Golden Test & Resilience Rules (2026-09-14 교훈)

### 57. 골든 테스트 실지번(PNU) 필수 원칙 (Golden Test Real Parcel Number Mandate)
- E2E 골든 테스트나 프로덕션 시뮬레이션 매물 메모 작성 시 가상 지번(예: 34-82, 72-5) 사용을 엄격히 금지합니다.
- 국토정보(V-World, Juso) 및 카카오 지도 API에 실제 등재된 **실제 필지 지번(Real Parcel Number)**을 사용해야만 PNU가 정상 확정되고 카카오 Static Map, 지적도 WMS, 건축물대장 Enrichment 파이프라인이 정상 작동합니다.
- 검증된 테스트용 실지번 레지스트리:
  * 마포 대흥동: `대흥동 12-41` (PNU: `1144010800100120041`)
  * 강남 역삼동: `역삼동 832-7` (PNU: `1168010100108320007`)
  * 용산 이태원동: `이태원동 127-1` (PNU: `1117013000101270001`)
  * 영등포 당산동: `당산동1가 72-1` (PNU: `1156011700100720001`)
- **위반 사례**: `이태원동 34-82` 입력 시 V-World/카카오 주소 검색 0건 → PNU 미확정 → 바텀시트 IM 생성 버튼 비활성화.

### 58. LLM 쿼터 소진 즉시 탈출 및 마크다운 서사 폴백 (LLM Quota-Resilient Markdown Fallback)
- OpenAI API 쿼터 소진(429 `credit_balance_exhausted` / `insufficient_quota`) 감지 시 30초 이상의 불필요한 지수 백오프 재시도(`MAX_RETRIES`)를 즉시 중단하고 고가용성 Mock Provider로 즉각 폴백해야 합니다.
- Mock Provider는 단순 고정 JSON 반환에 그치지 않고, 마크다운 서사(narrative) 프롬프트 요청 시 정제된 한국어 마크다운 카피를 반환하여 PPTX 본문 슬라이드에 raw JSON 문자열이 유입되는 것을 원천 차단해야 합니다.
- Mock 데이터 내에 Rule 52를 위반하는 가격 밴드 패턴(`display: "50억~80억"`)을 포함하지 않고 단일 확정 수치로 표기합니다.
- **위반 사례**: Mock JSON 문자열이 03 Building 슬라이드 본문에 그대로 유입되고, 그 안의 `"50억~80억"`으로 인해 Rule 52 가격 밴드 차단 테스트 실패.

### 59. 골든 테스트 하네스 공통화 및 4대 바이너리 단언 의무 (Standardized Golden Harness & 4-Fold Assertion)
<!-- BEGIN:cre-d43-golden-rules -->
# CRE IM D43 E2E Golden Test & Resilience Rules (2026-09-14 교훈)

### 57. 골든 테스트 실지번(PNU) 필수 원칙 (Golden Test Real Parcel Number Mandate)
- E2E 골든 테스트나 프로덕션 시뮬레이션 매물 메모 작성 시 가상 지번(예: 34-82, 72-5) 사용을 엄격히 금지합니다.
- 국토정보(V-World, Juso) 및 카카오 지도 API에 실제 등재된 **실제 필지 지번(Real Parcel Number)**을 사용해야만 PNU가 정상 확정되고 카카오 Static Map, 지적도 WMS, 건축물대장 Enrichment 파이프라인이 정상 작동합니다.
- 검증된 테스트용 실지번 레지스트리:
  * 마포 대흥동: `대흥동 12-41` (PNU: `1144010800100120041`)
  * 강남 역삼동: `역삼동 832-7` (PNU: `1168010100108320007`)
  * 용산 이태원동: `이태원동 127-1` (PNU: `1117013000101270001`)
  * 영등포 당산동: `당산동1가 72-1` (PNU: `1156011700100720001`)
- **위반 사례**: `이태원동 34-82` 입력 시 V-World/카카오 주소 검색 0건 → PNU 미확정 → 바텀시트 IM 생성 버튼 비활성화.

### 58. LLM 쿼터 소진 즉시 탈출 및 마크다운 서사 폴백 (LLM Quota-Resilient Markdown Fallback)
- OpenAI API 쿼터 소진(429 `credit_balance_exhausted` / `insufficient_quota`) 감지 시 30초 이상의 불필요한 지수 백오프 재시도(`MAX_RETRIES`)를 즉시 중단하고 고가용성 Mock Provider로 즉각 폴백해야 합니다.
- Mock Provider는 단순 고정 JSON 반환에 그치지 않고, 마크다운 서사(narrative) 프롬프트 요청 시 정제된 한국어 마크다운 카피를 반환하여 PPTX 본문 슬라이드에 raw JSON 문자열이 유입되는 것을 원천 차단해야 합니다.
- Mock 데이터 내에 Rule 52를 위반하는 가격 밴드 패턴(`display: "50억~80억"`)을 포함하지 않고 단일 확정 수치로 표기합니다.
- **위반 사례**: Mock JSON 문자열이 03 Building 슬라이드 본문에 그대로 유입되고, 그 안의 `"50억~80억"`으로 인해 Rule 52 가격 밴드 차단 테스트 실패.

### 59. 골든 테스트 하네스 공통화 및 4대 바이너리 단언 의무 (Standardized Golden Harness & 4-Fold Assertion)
- 모든 신규 E2E 골든 테스트는 독립된 파싱/단언 코드를 중복 작성하지 않고 `e2e/helpers/golden-test-utils.ts` 공통 하네스를 의무적으로 import하여 사용합니다.
- PPTX 다운로드 후 반드시 `analyzePptxZip`을 통해 4대 무결성 단언을 수행해야 합니다:
  1. `assertNoPoisonTokens`: `NaN`, `undefined`, `null`, `[object Object]` 0건
  2. `assertNoDummyData`: `NH농협캐피탈`, `테헤란로 123` 등 목데이터 누출 0건 (Rule 34)
  3. `assertNoEvasivePhrases`: 회피성 문구 8종(`본문을 참조`, `별도 안내 예정` 등) 0건 (Rule 37)
  4. `assertPriceBandBlocked`: `\d+억~\d+억` 등 가격 밴드 패턴 0건 (Rule 52)
- 중복 매물 모달 감지는 `Promise.race` 기반 `handleDuplicateModal`을 사용하여 비동기 타임아웃을 방지합니다.

### 60. 테스트 무단언 방지 (No Zero-Assertion Test Pass)
- `if (!condition) return;` 패턴으로 테스트를 조기 종료하여 `expect()` 0건으로 PASS 처리하는 것을 금지합니다. CI에서 "전체 PASS"라는 거짓 안전감을 줍니다.
- **금지:** `if (!isServerRunning) return;`
- **허용:** `test.skipIf(() => !isServerRunning)('test name', async () => { ... });`
- `try/catch`로 테스트 실패를 삼키지 않습니다. 예외를 기대하는 테스트는 반드시 `await expect(fn()).rejects.toThrow();`를 사용합니다.
- **위반 사례**: `im-concurrency.test.ts`의 10개 테스트가 서버 미기동 시 전부 0-assertion PASS → CI에서 발견 불가.
<!-- END:cre-d43-golden-rules -->