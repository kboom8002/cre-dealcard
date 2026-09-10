<!-- BEGIN:deploy-rules -->
# CI/CD Deployment Rules
- 본 프로젝트의 주요 배포 프로세스는 Vercel 자동 배포(`git push origin main`)를 통해 이루어집니다.
- 배포를 진행하기 전에 반드시 `npm run build`를 통해 로컬에서 타입스크립트 오류 및 빌드 성공 여부를 사전에 확인해야 합니다.
- 사용자가 배포를 요청할 경우, 위와 같이 빌드 무결성을 점검한 뒤, `git push`를 통해 원격 저장소에 반영함으로써 Vercel 자동 배포를 트리거합니다. (또는 상황에 따라 `npx vercel --prod` 활용)
<!-- END:deploy-rules -->

<!-- BEGIN:cre-im-rules -->
# CRE Mobile IM & PPTX Quality Rules

### 1. 페르소나 격리 원칙 (Implicit Persona Principle)
- 페르소나(예: 60대 자산가, 법인 대표, 디벨로퍼 등)는 **내부 설명 난이도 및 톤앤매너 조절용**으로만 엄격히 격리합니다.
- 외부 노출 문서(Mobile IM 웹 뷰어, PPTX 슬라이드 제목/본문/헤드라인)에는 '60대 자산가를 위한', '법인 대표 맞춤' 등 **특정 연령/계층/성별을 직접 지칭하는 문구를 절대 표기하지 않습니다**.

### 2. 한국 상업용 부동산 실무 용어집 준수 (CRE Lexicon Standards)
- 어색한 외래어 직역 투를 배제하고 한국 실무 표준 용어를 사용합니다.
  * ❌ `네이밍 라이츠`, `브랜딩 라이츠` ➔ ✅ `사옥 단독 명칭 표기(간판 설치권)`, `기업 단독 브랜딩`
  * ❌ `캡레이트` ➔ ✅ `연 순수익률 (Cap Rate)`
  * ❌ `GOP` ➔ ✅ `실질 영업이익 (GOP)`
  * ❌ `TI / Rent Free` ➔ ✅ `인테리어 지원금(TI) / 렌트프리(무상임대)`

### 3. PPTX 슬라이드 비중복 렌더링 원칙 (No-Duplicate Presentation)
- 좌/우 분할 레이아웃(A04, A05 등)에서 좌측 영역과 우측 카드에 동일한 텍스트/불릿 항목을 중복 나열하지 않습니다.
  * **좌측**: 자산 가치 제안(Value Proposition) 리드문 및 거시적 투자 배경 서사
  * **우측**: 3~4대 핵심 투자 포인트 및 지표 카드

### 4. AI 시각 E2E 테스트 검증 절차
- PPTX 템플릿, 데이터 바인더, LLM 프롬프트 수정 시 `src/tests/e2e/ai-visual-e2e-runner.ts`를 실행하여 150 DPI 고화질 슬라이드 PNG 캡처 및 AI 시각 무결성(레이아웃 오버플로, 라벨 오염, 중복 텍스트 여부)을 반드시 점검합니다.
<!-- END:cre-im-rules -->

<!-- BEGIN:cre-pipeline-rules -->
# CRE IM Pipeline Engineering Rules (D33/D34 교훈)

### 5. 게이트 레지스트리 일관성 (Gate Registry Consistency)
- 새 게이트(G41~G45 등)를 구현할 때 반드시 `quality-gates-v02.ts`의 `PUBLISH_GATES` 배열에 등록합니다.
- 구현 파일(cross-validator, pptx-renderer 등)에서 로직을 작성하고 `PUBLISH_GATES`에 등록하지 않으면 **T2-GATE-01이 실패**합니다.
- `GateContext` 인터페이스에 해당 필드도 함께 추가합니다.

### 6. 산출물 단언 우선 원칙 (Output Assertion Priority)
- 함수 단위 테스트(함수가 올바른 값을 반환하는가)는 **보조**입니다.
- **산출물 단언**(렌더된 PPTX/JSON이 올바른 구조·수치·게이트를 가지는가)이 **최종 권위**입니다.
- 문장을 단언하지 않습니다. 구조·수치·게이트만 단언합니다.

### 7. Negative 짝 의무 (Negative Pair Obligation)
- 모든 테스트 케이스에 반대 단언(negative pair)이 있어야 합니다.
- negative 짝 없는 케이스는 등재를 금지합니다.

### 8. 임계값 하드코딩 금지 (No Hardcoded Thresholds)
- DPI, 크로핑률, 면수 상한 등의 임계값을 테스트 코드에 직접 적지 않습니다.
- `credeal/ssot/*.yaml`에서 읽거나, 최소한 코드 상수에서 import합니다.

### 9. deck-sequencer 조건부 면 추가 (Conditional Slide Addition)
- 데이터 가용성 플래그(`hasRentRoll`, `hasPhotos` 등)가 `false`이면 해당 면을 추가하지 않습니다.
- income 포스처의 rentRoll, gallery 등은 반드시 `dataAvailability` 가드를 확인합니다.

### 10. 면수 상한 (Page Hard Limit)
- IM **본문** 면수 상한은 **16면**입니다 (PAGE_HARD_LIMIT=16, deck-sequencer 본문 절삭).
- **부록**(공부발췌, 권리관계, 지적도, 상권분석)은 16면 한도에서 **제외**됩니다.
- **Grade D는 모든 tier(basic/pro)에서 PPTX 생성이 차단됩니다** (`[G30]` throw). tier와 무관합니다.
- 렌트롤 다단 테이블, 갤러리 다면은 데이터 양에 따라 초과 가능합니다.
- 테스트에서 총 면수(본문+부록)를 16 이하로 단언하지 않습니다.
<!-- END:cre-pipeline-rules -->

<!-- BEGIN:cre-d37-rules -->
# CRE IM D37 고도화 규칙 (2026-08-28)

### 11. MobileIMSectionType 확장 시 연쇄 수정 (Section Extension Cascade)
- `types.ts` 배열에 새 섹션을 추가하면 **반드시 3곳을 동시에 수정**합니다:
  1. `section-alias-resolver.ts` → `SECTION_ALIAS_MAP` (alias 배열)
  2. `section-alias-resolver.ts` → `displayNames` (한국어 대표명)
  3. `premium-template-engine.ts` → `getSectionTitle()` (Record 매핑)
- 이 3곳은 `Record<MobileIMSectionType, ...>` 타입이므로 누락 시 빌드 에러가 발생합니다.

### 12. im-core 도메인 계층 의존 방향 (Domain Layer Direction)
- im-core는 **순수 도메인 로직**이며 React/Next.js/Supabase에 의존하지 않습니다.
- 프론트엔드 → im-core (O), im-core → 프론트엔드 (X)
- 모듈 목록: `claim-registry`, `financial-calc`, `display-label`, `release-tier`, `approval-gate`, `korean-legal`, `action-card`, `lease-calc`, `permit-zone`

### 13. ReleaseTier 5종 전구간 연결 (Full-Chain Tier Binding)
- `resolveTier()` 결과는 **handler → DB body → PPTX renderer → 뷰어 UI** 전구간에서 일관되게 전달합니다.
- 5종: `internal_only`, `fact_om`, `analysis_im`, `decision_im`, `expert_required`
- 레거시 `basic|pro` → D37 5종 변환 시 `analysis_im/decision_im → pro`, 나머지 → `basic`

### 14. displayLabel 8종 DISPLAY_LABEL_MAP 사용 (No Hardcoded Provenance)
- 프로베넌스 뱃지를 렌더링할 때 **반드시 `DISPLAY_LABEL_MAP`에서 참조**합니다.
- 하드코딩된 source 문자열(`public_data`, `broker_input` 등)을 직접 비교하지 않습니다.
- 레거시 source → ProvenanceKind 변환 매핑을 사용합니다.

### 15. ApprovalGate 우회 금지 (No Gate Bypass)
- `approve/route.ts`에서 문서 상태를 `published`로 전환하기 전에 반드시 `runApprovalGate()`를 호출합니다.
- `passed === false`이면 422 응답과 함께 `blockers` 목록을 반환합니다.
- 프로퍼티 이름: `passed` (NOT `approved`)

### 16. 프론트엔드-도메인 정합성 감사 (Frontend-Domain Audit)
- im-core에 새 모듈을 추가하면 프론트엔드(뷰어/편집기/승인API/PPTX) 연동 여부를 확인합니다.
- 연결 매트릭스: writer → handler → DB → viewer → editor → approvalAPI → PPTX
<!-- END:cre-d37-rules -->

<!-- BEGIN:cre-prod-web-rules -->
# CRE Production Web & 5-Layer MECE Rules (2026-09-06 교훈)

### 17. 포스처별 필수 Claim 분기 원칙 (Posture-Aware Claim Validation)
- `runApprovalGate()`의 `REQUIRED_SUBJECTS`는 모든 포스처에 일률적으로 적용하지 않습니다.
- `gross_yield`(임대수익률)는 수익형(`income`, `trading`, `operating`)에서만 필수입니다.
- 사옥형(`owner_occupied`) 및 개발형(`development`)은 자가사용 또는 신축 부지이므로 `gross_yield`를 필수로 단언하지 않으며, 가격/면적 중심 필수 지표를 검증합니다.

### 18. 클라이언트-서버 타임아웃 패리티 및 폴링 상한 (Client-Server Timeout Parity)
- 프론트엔드의 비동기 폴링, `setTimeout`, 백엔드 세그먼트 `maxDuration`, 도메인 하드 타임아웃(`thresholds.ts` `IM_HARD_TIMEOUT_MS: 180s`)은 전구간 일치해야 합니다.
- 클라이언트의 모든 폴링 루프(바텀시트, 관리 패널 등)는 무한 요청 누수를 방지하기 위해 반드시 `MAX_POLL_MS = 300_000`(5분) 상한 가드를 둡니다.

### 19. 시스템 자동 생성 에셋 vs 사용자 업로드 사진 분리 (Generated vs Uploaded Separation)
- 지적도(V-World WMS)와 위치 지도(Kakao Static Map)는 좌표/PNU 기반 시스템 API 자동 생성 에셋입니다.
- `photos_v2` 배열에는 중개인이 직접 촬영/업로드하는 실 매물 사진(외관, 입구, 로비, 내부, 주차장, 옥상 등 G1~G4)만 포함하며, 지도류를 사진 에셋에 강제 업로드하지 않습니다.
- PPTX 갤러리 플래너(`gallery-planner.ts`)는 `category !== 'map'`으로 지도 사진의 갤러리 슬라이드 침투를 원천 차단합니다.

### 20. 승인 프로토콜 해시 무결성 (Strict Hash-Bound Approval)
- 승인 요청(`approve/route.ts`)은 위변조 방지를 위해 `expectedHash: "sha256:..."`를 필수로 검증합니다.
- 클라이언트 UI(`im-approval-client.tsx`)는 섹션 저장/수정 응답으로 반환된 최신 `targetHash`를 반드시 취득하여 승인 요청 바디에 실어 보내야 합니다.

### 21. LLM 재시도 루프 타이머 잠식 방어 (Timer-Budgeted Retry)
- LLM 순차 호출 또는 지수 백오프 재시도 루프(`MAX_RETRIES`)는 루프 진입 전 반드시 `stageTimer.shouldAbortOptional()` 잔여 시간 예산을 점검합니다.
- 단일 섹션 실패로 인한 재시도가 전체 180초 예산을 고갈시켜 후속 필수 섹션이 절삭되는 2차 피해를 방지합니다.

### 22. Writer 산출물 Claim 체인 영속화 (Full-Chain Claim Persistence)
- `writer.ts`의 `FinancialCalculator`가 계산한 `claimRegistry.getAll()`은 반드시 `generateMobileIM` 리턴 객체와 DB(`document_objects.body.claims`)에 영속 저장되어 승인 게이트로 직결되어야 합니다.
- 레거시 요약값(`ssot_summary`)에만 의존한 수화(rehydration)를 지양하고 확정된 Claim 원장을 유지합니다.

### 23. Playwright E2E 서버 컴포넌트 제약 (Server Component Boundary)
- Next.js Server Component는 서버에서 Supabase를 직접 호출하므로, `page.route()`로 모킹이 **불가능**합니다.
- Playwright 테스트 대상은 **클라이언트 렌더링 페이지**로 한정합니다:
  * ✅ `/broker/deal-card/new` (클라이언트 컴포넌트)
  * ✅ `/im-lite/[id]` (Zero-DB fixture `fe5cbadd-...` 사용)
  * ❌ `/broker/deal-card/[id]` (서버 컴포넌트 — `createServiceClient()` 호출)
  * ❌ `/broker/im-approval/[id]` (서버 컴포넌트)
- 서버 컴포넌트 페이지를 테스트해야 할 경우, API 레벨 또는 도메인 함수 직접 호출(vitest)을 사용합니다.

### 24. Goldilocks 16면 절삭 인식 테스트 작성 (Goldilocks-Aware Assertions)
- `deck-sequencer.ts`의 goldilocks 알고리즘은 본문 슬라이드를 `PAGE_HARD_LIMIT=16`으로 절삭합니다.
- 테스트에서 **특정 optional 슬라이드(DCF, sensitivity, loan, rentRoll 등)가 최종 시퀀스에 존재한다고 단언하지 않습니다**.
- Grade A vs B 비교 시 `toBeGreaterThan` 대신 `toBeGreaterThanOrEqual`을 사용합니다 (둘 다 16면으로 잘릴 수 있음).
- Protected 슬라이드(cover, summary, closing, risk, checklist, process, thesis, **location**)만 존재 단언이 안전합니다.
- **지도(location) 슬라이드는 모든 포스처에서 필수**입니다. 카카오 지도 + 랜드마크 + 고해상도 렌더링은 CRE IM의 핵심 자산이므로 goldilocks 절삭 대상에서 절대 제외합니다.

### 25. PPTX 렌더링 테스트 타임아웃 (PPTX Render Timeout)
- PPTX 렌더링 테스트는 CPU 집약적이며 전체 스위트 실행 시 리소스 경합으로 지연됩니다.
- 단일 PPTX 렌더: `30_000ms`, 5개 포스처 동시 렌더: `60_000ms` 이상 명시적 타임아웃을 설정합니다.
- vitest의 기본 타임아웃(5s)에 의존하지 않습니다.
<!-- END:cre-prod-web-rules -->

<!-- BEGIN:cre-d39-rules -->
# CRE IM D39 Multi-Posture & PPTX Robustness Rules (2026-09-07 교훈)

### 26. 포스처별 슬라이드 바인더 완전 동적화 (Dynamic Binder Invariant)
- `data-binder.ts` 및 슬라이드 프롭스 빌더(`buildOwnerOccupied*` 등)에 특정 매물의 수치(120억, 48억 등), 지역명(역삼역, 테헤란로 등), 또는 특정 임대 스펙을 하드코딩하는 것을 엄격히 금지합니다.
- 모든 수치와 텍스트는 `doc.body`, `heroCard`, `assetIdentity`, `occupancySpec`, `building`에서 동적으로 산출하고, 일반화된 도심 비즈니스 권역 fallback을 사용해야 합니다.

### 27. 슬라이드 아키타입 CalloutKind 무결성 (Strict CalloutKind Exhaustiveness)
- PPTX Callout 아키타입(A04, A06, A08 등)에서 허용되는 `kind`는 오직 `info | good | warn | bad | brass` 5종뿐입니다.
- 임의의 문자열(`surface`, `neutral`, `card` 등)을 지정하면 튜플 디스트럭처링 시 `undefined is not iterable` 런타임 예외가 발생하므로 사용을 금지합니다.
- `imlib.ts` 및 기저 렌더러는 `colors[kind] ?? colors.info` 형태의 안전 폴백을 항상 유지해야 합니다.

### 28. Quality Gate 포스처 인식 및 점진적 응답 (Posture-Aware Gate & Graduated Response)
- `runCREQualityGate()`는 반드시 `posture` 컨텍스트를 주입받아 검사해야 합니다.
- 5대 포스처별 표준 실무 용어(사옥형 세무/감가상각, 개발형 PF/공사비/용적률완화, 운영형 GOP/RevPAR, 매매형 시세차익/양도차익)를 화이트리스트로 보장하여 Gate 오탐으로 인한 정상 AI 카피 폐기를 방지합니다.
- Gate 결과가 `medium` 리스크일 경우 AI 텍스트 전체를 버리지 않고, **Graduated Response**(AI 카피 유지 + 법적 면책 조항 자동 삽입)를 적용합니다.

### 29. 포스처별 슬라이드 데이터 분리 및 누출 방지 (Posture Isolation in Slide Binding)
- 포스처 전용 파생 슬라이드(사옥형 `plan`, `vsLease`, `commute`, `value` 등)는 반드시 `if (posture === 'owner_occupied')`와 같은 포스처 가드 내부에서만 바인딩되어야 합니다.
- 공통 섹션(`investment_thesis` 등)에서 타 포스처 전용 props가 무조건 덮어씌워져 슬라이드가 누출되는 버그를 원천 차단합니다.

### 30. 풀 파이프라인 E2E 테스트 타임아웃 (Full-Pipeline Test Timeout)
- `generateMobileIM`을 실행하는 E2E 및 L5 테스트는 10개 이상의 섹션을 다단계로 생성하므로, 전체 스위트 실행 시 CPU 경합으로 지연됩니다.
- 풀 파이프라인 테스트 케이스(`L5-YP-01`, `E2E-YP-PIPELINE` 등)는 vitest의 기본 타임아웃(5s/30s)에 의존하지 않고 명시적으로 `60_000ms` 이상의 타임아웃을 설정합니다.
<!-- END:cre-d39-rules -->

<!-- BEGIN:cre-d40-preflight-rules -->
# CRE IM D40 Pre-flight Audit Rules (2026-09-07 D33~D39 교훈 종합)

### 31. 마크다운 테이블 파싱 분리 원칙 (Adjacent Table Split Invariant)
- `parseMarkdownTable()` 및 `parseFloorsFromMarkdown()`은 인접한 마크다운 테이블(열 수가 다른 연속 테이블)을 반드시 분리해야 합니다.
- 새로운 헤더행(`|---|---|`) 또는 열 수 불일치 감지 시 이전 테이블을 즉시 마감합니다.
- **위반 사례**: 당산동 2열 요약 표와 7열 렌트롤 표 병합 → LibreOffice 블록 렌더링 붕괴.

### 32. 면적 추출 전용 헬퍼 의무 사용 (Dedicated Area Extractor)
- 면적 셀 파싱 시 `replace(/[^\d.]/g, '')` 패턴을 직접 사용하지 않습니다.
- 반드시 `extractAreaPyeong()` 전용 헬퍼를 사용하여: ① `N평` 우선 추출, ② `N㎡` 환산(×0.3025), ③ 순수 숫자만 직접 파싱합니다.
- 단일 층 면적 상한 가드: ≤ 3,000평, 건물 총면적 상한 가드: ≤ 30,000평.
- **위반 사례**: 당산동 `96평(약 317.4㎡)` → `96317.4`평 병합 → 연면적 100,681평 폭증.

### 33. 임대면적 컬럼 오매칭 차단 (Lease Area Column Guard)
- 테이블 헤더에서 임대면적 컬럼을 찾을 때 `h.includes('임대')`만으로 매칭하지 않습니다.
- `임대면적`·`계약면적`·`바닥면적`만 매칭하고, `월 임대료`·`임대 만기`·`보증금`은 명시적으로 제외합니다.
- **위반 사례**: `월 임대료` 183만원이 183평으로 역전환.

### 34. 모의/더미 데이터 하드코딩 전면 금지 (Zero Hardcoded Mock Data)
- 프로덕션 컴포넌트에 특정 매물(NH농협캐피탈, 역삼역, 테헤란로 등)의 데이터를 fallback 배열로 하드코딩하는 것을 금지합니다.
- 실데이터가 없으면 컴포넌트를 렌더링하지 않습니다 (`return null`).
- 페르소나(연령·계층·성별)를 외부 노출 문서에 직접 지칭하는 것을 금지합니다 (Rule 1).
- **위반 사례**: `StackingPlanView`에 17층 NH농협캐피탈 목데이터 fallback 누출.

### 35. 슬라이드 폴백 타이틀 동적화 의무 (Dynamic Fallback Title)
- PPTX 아키타입의 폴백 타이틀에 특정 섹션명(`건축물 물리 스펙 요약` 등)을 하드코딩하지 않습니다.
- `${input.data.title || '세부 정보'} 요약` 형태의 동적 폴백을 사용합니다.
- **위반 사례**: 권리관계(Slide 8)에 "건축물 물리 스펙 요약" 타이틀 노출.

### 36. 체크리스트 카드 텍스트 예산 (Checklist Card Budget)
- 체크리스트 항목(A18 아키타입)은 **70자 상한**을 적용하고, 40자 초과 시 **9.5pt 가변 폰트**로 축소합니다.
- 긴 문단에서 핵심 문장만 격리 추출하고, 60자 이상은 `slice(0, 57) + '...'`로 절삭합니다.
- **위반 사례**: 당산동 Slide 5 체크리스트 카드 텍스트 오버플로.

### 37. 회피성 문구 차단 (Evasive Phrase Ban)
- AI 생성 카피에서 다음 패턴이 0건이어야 합니다: `본문을 참조`, `별도 안내 예정`, `추후 확인`, `상세...별첨`.
- 모든 수치/지표는 계산된 실수치를 직접 바인딩합니다.
- **위반 사례**: "구체적인 수치는 본문을 참조하시기 바랍니다" 회피 문구.

### 38. Pre-flight Pipeline Audit 의무 실행 (Mandatory Pre-flight Audit)
- 파이프라인 코드(data-binder, writer, quality-gate, archetype, deck-sequencer) 수정 시, 커밋 전 반드시 `npx vitest run src/tests/e2e/preflight-pipeline-audit.test.ts`를 실행하여 5대 계층 40개 사전 점검 항목을 통과해야 합니다.
- 모든 점검 항목은 Positive/Negative Pair(Rule 7)를 포함합니다.

### 39. photos_v2 URL 스킴 전구간 투과성 (Full-Chain URL Scheme Permeability)
- `photos_v2` 배열의 URL을 필터링하는 모든 게이트(`generate-async/route.ts`, `generate/route.ts`, `im-data-bottom-sheet.tsx`)는 반드시 4가지 스킴을 허용해야 합니다: `http://`, `https://`, `/`, `data:`.
- URL 필터에 새로운 스킴을 추가하거나 기존 스킴을 제거할 때, 파이프라인의 모든 필터 지점을 동시에 검토합니다.
- **위반 사례**: `generate-async/route.ts`에서 `data:` URI를 필터링하여 E2E 테스트의 base64 인코딩 사진이 전량 탈락.

### 40. 바이너리 에셋 JSONB 직접 저장 금지 (No Binary Blob in JSONB)
- `document_objects.body` JSONB 컬럼에 base64 인코딩 이미지, PDF, 또는 기타 바이너리 데이터를 직접 저장하는 것을 금지합니다.
- 바이너리 에셋은 반드시 Supabase Storage(`building_photos` 버킷 등)에 업로드하고, public URL만 JSONB에 저장합니다.
- `handler.ts`의 `uploadDataUriPhotos()` 패턴을 참조합니다: base64 data URI 감지 → Storage 업로드 → URL 교체.
- **위반 사례**: 8장 사진(~10MB base64)을 JSONB에 직접 저장 → Supabase `HeadersTimeoutError` → 문서 저장 실패.
<!-- END:cre-d40-preflight-rules -->

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
