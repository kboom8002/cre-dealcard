# Original User Request

## Initial Request — 2026-09-03T08:47:33Z

Execute the complete functional audit test suite (Unit, E2E, and Playwright 5-journey Web Walkthroughs) across CREDEAL IM Modernization, verifying zero regressions, capturing visual assets, and generating an exhaustive quality audit report.

Working directory: c:\Users\User\cre-dealcard
Integrity mode: development

## Requirements

### R1. Comprehensive Test Automation Execution
Execute all modernized unit test suites (`src/tests/unit/`), integration pipelines (`src/tests/e2e/`), and governance acceptance suites (`src/tests/acceptance/final-acceptance-audit.test.ts`). All test suites must achieve 100% pass rate.

### R2. Playwright Web Walkthrough Browser Verification
Launch and execute the 5 core Playwright user journeys in `e2e/`:
- Journey 1: Broker Studio (`e2e/broker-studio.spec.ts`)
- Journey 2: Mobile IM Responsive & Lexicon/Persona Isolation (`e2e/mobile-im-viewer.spec.ts`)
- Journey 3: PPTX Studio Editor & 2-Stage Approval (`e2e/pptx-studio-editor.spec.ts`)
- Journey 4: Blind Dealcard Viewer (`e2e/dealcard-viewer.spec.ts`)
- Journey 5: Admin Discrepancy Dashboard (`e2e/admin-discrepancy.spec.ts`)

Verify responsive layouts (iPhone 14 Pro 393px, Galaxy S23 360px, Desktop 1920px), zero uncaught exceptions, and zero persona terms in DOM.

### R3. Visual & Behavioral Defect Triage
Verify physical slide/page boundaries (no bleed, no unrendered `{{...}}` tokens, 150 DPI resolution), ensure 100% compliance with Korean CRE Lexicon Standards (Rule 2) and Persona Isolation (Rule 1).

### R4. Formal Audit Sign-Off Report
Synthesize all test execution logs, Playwright trace/screenshots, and golden-case metric comparisons into a comprehensive audit report confirming all 16 Final Acceptance criteria (FA-01 ~ FA-16).

## Verification Resources

- Master Test Plan: `C:\Users\User\.gemini\antigravity\brain\942482b8-df15-4e6c-9524-3bab6f9b7d69\comprehensive_functional_audit_test_plan.md`
- Golden Cases Fixtures: `tests/fixtures/golden-cases/*.json`
- Playwright Configuration: `playwright.config.ts`
- Baseline Metrics & Governance: `docs/impipe/modernization/00_GOVERNANCE_AND_AUTHORITY.md`, `03_BASELINE_METRICS.md`

## Acceptance Criteria

### Automated Test Pass Rates
- [ ] 21 modernized unit/e2e test suites pass 100% (43+ assertions) with zero regressions
- [ ] TypeScript compilation (`npm run typecheck`) passes with 0 errors
- [ ] Next.js production build (`npm run build`) completes with Exit Code 0
- [ ] Playwright web walkthrough 5 journeys execute with zero uncaught runtime errors

### Core Domain & Governance Invariants
- [ ] All 16 Final Acceptance criteria (FA-01 ~ FA-16) pass with verified evidence
- [ ] 5 Key baseline metrics on the discrepancy dashboard maintain 0.00% diff and 100% MATCH
- [ ] Zero persona phrases (Rule 1) and zero banned transliterations (Rule 2) in external viewer DOM
- [ ] PPTX binary inspector confirms 0 bleeds, 0 placeholder residues, and 16-slide body hard limit

## Follow-up — 2026-09-03T14:20:54Z

상업용 부동산(CRE) SSoT 데이터와 실측 렌트롤을 기반으로, 4대 핵심 완성형 프라임 템플릿(기관투자자 프라임, 기업 사옥형, 메디컬/근생형, 개발부지형) 및 브로커 커스텀 템플릿 빌더를 탑재하고, 단 한 번의 클릭으로 16면 한도 및 물리 무결성이 검증된 PPTX 투자설명서(IM)를 무마찰(Zero-Friction)로 원샷 자동 생성한 뒤, 스튜디오 인라인 편집과 2단계 원장 승인까지 완결하는 전문 스튜디오 고도화 프로젝트.

Working directory: c:\Users\User\cre-dealcard
Integrity mode: development

## Requirements

### R1. 4대 핵심 완성형 템플릿 풀세트 & 브로커 커스텀 템플릿 빌더
- **4대 완성형 프라임 템플릿 탑재**:
  1. `기관투자자 프라임 (Institutional Dark/Gold)`: 심층 재무 분석, Cap Rate/NOI, WALE, 렌트롤 다단 배치 중심
  2. `기업 사옥용 모던 (Corporate Clean White)`: 단독 사옥 브랜딩(간판 설치권), 총취득원가, vsLease(임대 대 매입 비용 비교) 중심
  3. `메디컬/근생형 비주얼 (Commercial Visual Grid)`: 층별 업종 MD 구성, 로드뷰 및 앵커 테넌트(약국/병원), 유동인구 입지 중심
  4. `개발부지형 테크니컬 (Development Technical Blueprint)`: 다필지 대지면적, 3단 투입비, 조례 완화 및 신축 계획 부록 분리 중심
- **커스텀 템플릿 빌더**:
  - 브로커가 고유 브랜드 로고, 프라이머리/액센트 컬러, 폰트 세트(맑은 고딕, Noto Sans KR, 나눔스퀘어 등)를 커스터마이징하여 프리셋으로 영구 저장 및 재사용할 수 있는 기능 지원.

### R2. 무마찰(Zero-Friction) 원클릭 원샷 완전 생성 파이프라인
- SSoT 데이터셋(자산 제원, 재무 클레임, 렌트롤, 가치 제안) 주입 시 단 1회의 호출로 16면 본문 슬라이드(Rule 10) 및 부록(지적도/상권)을 자동 절삭·분리 배치.
- 좌측 가치 제안 서사 리드문과 우측 핵심 지표 카드 간의 동일 문장 중복 나열 0건(Rule 3) 보장.
- 모든 수치 및 제원 토큰(`{{claim.xxx}}`, `{{snapshot.xxx}}`)의 100% 결정론적 인라인 치환.

### R3. PPTX Studio 인터랙티브 에디터 & 실시간 시각 프리뷰 고도화
- `/broker/deal-card/[id]/pptx-editor` 내 SVG 캔버스 실시간 렌더링 엔진 고도화: 템플릿/컬러/폰트 변경 시 100ms 이내 실시간 화면 동기화.
- 슬라이드 순서 드래그 앤 드롭 재배치, 특정 슬라이드 숨김/공개 토글, 텍스트/이미지 인라인 미세 편집.
- S60(슬라이드 편집 승인) ➔ S70(PPTX 파일 바이너리 SHA-256 해시 승인) 2단계 승인 체계 무마찰 연동 및 `approval_events` 불변 원장 자동 기록.

### R4. 물리 무결성 검증 하네스 및 자동 품질 게이트 (P-PPTX-RELEASE)
- 16:9 와이드 슬라이드(13.333" × 7.5") 기준 텍스트 상자 및 도형 지면 이탈(Bleed) 0건 검증.
- 150 DPI 고해상도 이미지 자산 바이너리 패킹 무결성(ZIP/XML) 및 깨진 이미지 0건 보장.
- Rule 1(페르소나 노출 0건), Rule 2(한국 CRE 실무 표준 용어 100%), 공인중개사법 P0 법적 금지어 차단 유지.

## Acceptance Criteria

### 1. 템플릿 다양성 및 커스터마이징
- [ ] 4대 완성형 템플릿(기관 다크, 코퍼릿 클린, 메디컬 그리드, 개발 테크니컬)이 스튜디오에서 즉시 선택·전환 가능
- [ ] 사용자 정의 프리셋(로고, 색상, 폰트) 생성·수정·저장 및 새 프로젝트 적용 동작 검증

### 2. 무마찰 생성 및 지면 물리 무결성
- [ ] 원클릭 원샷 생성 시 16면 본문 상한(Rule 10) 준수 및 부록 슬라이드 자동 분리
- [ ] PPTX 바이너리 인스펙터(`inspectPptxBinary`) 기준 지면 이탈(Bleed) 0건, 미치환 토큰(`{{...}}`) 0건
- [ ] 좌/우 분할 레이아웃 내 불릿/문장 단순 복사 중복 0건 (Rule 3)

### 3. 스튜디오 인터랙티브 UX 및 2단계 승인
- [ ] 브로커 스튜디오 내 실시간 SVG 슬라이드 미리보기 렌더링 지연 200ms 이내
- [ ] S60 편집 승인 ➔ S70 파일 바이너리 승인의 순차적 2단계 승인 및 SHA-256 타깃 해시 결속 100% 성공
- [ ] 최종 승인 완료 시 파워포인트 호환 표준 `.pptx` 파일 즉시 다운로드 가능

### 4. 컴플라이언스 및 테스트 자동화
- [ ] Rule 1 페르소나 단어 노출 0건 및 Rule 2 CRE 표준 용어 준수
- [ ] 단위/통합 테스트 스위트 100% PASS
- [ ] Playwright PPTX Studio 여정(`e2e/pptx-studio-editor.spec.ts`) 및 뷰포트 E2E 100% PASS
- [ ] `npm run typecheck` 0 에러 및 `npm run build` 성공 (Exit Code 0)

## Follow-up — 2026-09-04T12:19:37Z

Use a very large team of agents.

전체 CRE IM 파이프라인(공공데이터/중개인 인출, SSoT 정규화, 이상치 감지 및 밸류애드 연산, Web IM 뷰어, PPTX Studio 물리 렌더링, S60/S70 2단계 승인 원장, 옴니채널 실시간 양방향 동기화)에 대한 멀티에이전트 분산 교차 검증을 전면 수행하고, 상용 프로덕션 품질 및 제로 결함(Zero Defect)을 보장하도록 아키텍처, 렌더링 물리, 안정성을 전방위 고도화 리팩토링합니다.

Working directory: c:\Users\User\cre-dealcard

## Scope & Requirements

### R1. im-core 도메인 계층 순수성 및 데이터 무결성 보강 (Domain Architecture)
- im-core 도메인 모듈(claim-registry, financial-calc, display-label, release-tier, approval-gate, korean-legal, action-card, lease-calc, permit-zone, broker-input-validator)의 클린 아키텍처 단방향 의존성 엄수 (UI/Next.js/Supabase 역의존 완전 배제).
- 5종 ReleaseTier(internal_only, fact_om, analysis_im, decision_im, expert_required) 및 8종 displayLabel 매핑의 전구간 무누락 전달 및 정합성 검증.
- SSoT JSON 타깃 해시(sha256) 생성 및 검증 메커니즘의 결정론적(deterministic) 일관성 확보.

### R2. PPTX Studio 물리 렌더링 엔진 및 시각 물리학 고도화 (Physical Layout Physics)
- 16:9 와이드스크린 캔버스 내 16면 본문 상한(PAGE_HARD_LIMIT=16, 부록 제외) 철저 준수 및 지면 이탈(Bleed) 0건 달성.
- 렌트롤 테이블 다단/줄바꿈 최적화, 합계 행 스타일(Slate Tint F1F5F9), 공실 행 하이라이트(Amber Accent D97706), 비표준 미디어(.wdp 등) 자동 여과.
- 전면 와이드 및 분할 갤러리 이미지의 실효 해상도 150+ DPI(권장 165+ DPI) 보장.
- 페르소나 격리 원칙(Rule 1: 연령/계층/성별 명칭 배제), 한국 상업용 부동산 실무 표준 용어 준수(Rule 2: Cap Rate, GOP, TI/Rent Free 등), 비중복 레이아웃(Rule 3), P0 법적 금기어 0건 검증.

### R3. 옴니채널 실시간 양방향 동기화 및 승인 원장 감사 (Omni-Channel Synchronization)
- Web IM 뷰어 ↔ PPTX Studio ↔ Dealcard 뷰어 간 실시간 데이터 동기화 및 타깃 해시 불일치 시 즉각적 무효화(Invalidation) 파이프라인 검증.
- S60(에디토리얼 승인) 및 S70(바이너리 릴리즈) 2단계 승인 원장의 전 채널 상태 전파 및 감사 추적성(Audit Trail) 검증.
- 채널 간 주요 핵심 수치(매매가, 대지면적, 연면적, Cap Rate, 렌트롤 합계 등)의 오차 0건 교차 정합성 단언.

### R4. 프로덕션 빌드 무결성 및 자동화 테스트 스위트 강화 (Production Hardening & Verification)
- 실매물 2건 E2E 테스트(real-broker-im-pipeline.test.ts) 및 옴니채널 무효화 테스트(cross-channel-invalidation.test.ts)의 100% 통과 유지.
- 전사 E2E 회귀 테스트 스위트 확장 및 물리 하네스 스크립트(scripts/benchmark-real-broker-im.ts) 정상 동작 검증.
- npm run build 클린 통과 (타입스크립트 컴파일 에러 0건, 번들링 무결성).

## Verification Mechanisms
1. E2E 파이프라인 테스트: `npx vitest run src/tests/e2e/real-broker-im-pipeline.test.ts` (전체 통과)
2. 옴니채널 무효화 테스트: `npx vitest run src/tests/e2e/cross-channel-invalidation.test.ts` (전체 통과)
3. 물리 바이너리 인스펙션: `npx tsx scripts/benchmark-real-broker-im.ts` (0 Bleed, 0 Placeholder, 0 Persona leaks, 165+ DPI)
4. 프로덕션 빌드 검증: `npm run build` (Exit code 0)

## Acceptance Criteria
- [ ] im-core 전 도메인 모듈이 UI 계층 역참조 없이 순수 도메인 로직으로 완결될 것.
- [ ] PPTX 렌더러가 16면 본문 상한 및 0 Bleed, 150+ DPI 해상도를 완벽히 준수할 것.
- [ ] Rule 1(페르소나 격리), Rule 2(CRE 표준 용어), P0(법적 금기어) 위반 건수가 0건일 것.
- [ ] Web IM, PPTX, Dealcard 간 타깃 해시 기반 옴니채널 정합성 검증에서 수치 불일치가 0건일 것.
- [ ] S60/S70 2단계 승인 원장이 변조 없이 정확하게 기록 및 전파될 것.
- [ ] 모든 자동화 단위/E2E 테스트 스위트가 통과하고 npm run build가 에러 없이 성공할 것.

## Execution Guardrails
- AGENTS.md 및 .agents/AGENTS.md의 모든 규칙을 엄격히 준수할 것.
- 임계값 하드코딩 금지 (SSoT 또는 상수를 활용할 것).
- 산출물 단언 우선 원칙 및 Negative Pair 의무를 충족할 것.
- 모든 수정 및 리팩토링 후 빌드 무결성을 최종 검증할 것.

## Follow-up — 2026-09-04T14:30:25Z

Use a very large team of agents.

딜카드(Dealcard) 및 모바일 IM(Mobile IM)을 코어로 하여 상호 연계된 플랫폼 전 기능(메모 인테이크, 렌트롤/임대차 카드, PPTX Studio, 바이어/임차인 매칭 및 의향 분석, 소유자 리포트, 공유 링크 및 2단계 승인 게이트) 간의 데이터 흐름, 상태 전이, 무마찰(frictionless) 연결 및 엔드투엔드 상호작용 무결성을 전수 감사하고 보완 리팩토링합니다.

Working directory: c:\Users\User\cre-dealcard
Integrity mode: development

## Scope & Requirements

### R1. 인테이크 ➔ 딜카드 / 모바일 IM ➔ PPTX Studio 데이터 파이프라인 무마찰 연결 및 무손실 전파 (Ingestion & Data Flow Continuity)
- 텍스트/음성 메모 인테이크(memo-intake) 및 공공데이터 스냅샷에서 인출된 건물 제원, 렌트롤, 재무 지표가 딜카드 생성, 모바일 IM 뷰어, PPTX Studio 편집기로 전달되는 전 과정에서 누락, 절삭, 왜곡이 없도록 데이터 모델 및 직렬화 파이프라인 전수 감사 및 보완.
- 렌트롤(임대차 카드) 파싱 결과와 Pro-forma 공실 시나리오, 밸류애드 계산 결과가 모든 연계 뷰(딜카드 요약, Web IM 렌트롤 표, PPTX a03 대형 표)에서 동일한 SSoT 타깃 해시를 기반으로 일치되도록 연결.

### R2. 딜카드 / 모바일 IM ➔ 바이어 매칭 & 테넌트 의향(Tenant Intent) 양방향 연동 무결성 (Matching & Intent Interoperability)
- 딜카드/모바일 IM에 등록·업데이트된 물건 스펙(용도지역, 대지/연면적, 매각가, Cap Rate, 공실 현황)이 바이어 매칭 엔진(matching, buyer-intents) 및 테넌트 인텐트 풀과 실시간 정합성을 유지하도록 연동 로직 감사.
- 매칭 결과에서 딜카드/IM 상세로의 진입, 그리고 물건 상세에서 잠재 매수자/임차인 의향 매칭 목록으로의 전환 흐름에서 데이터 불일치 및 라우팅 결함 제거.

### R3. 소유자 리포트 & 마케팅 인사이트 피드백 루프 완성 (Owner Reports & Analytics Feedback Loop)
- 딜카드 및 모바일 IM 배포 이후 유입되는 열람 이력, 공유 링크 반응, NDA 체결, 관심 표명 데이터가 소유자 정기 리포트(reports/owner, monthly-report) 및 브로커 인텔리전스에 오차 없이 정확히 집계·반영되는지 엔드투엔드 파이프라인 검증 및 보완.
- 리포트 내 기재되는 물건 기준 정보와 최신 딜카드/IM SSoT 간의 시점 차이로 인한 수치 불일치 방지 메커니즘 구축.

### R4. 공유 링크 ➔ 티저(Teaser) CTA ➔ NDA ➔ 2단계 승인 게이트(S60/S70) 보안 및 사용자 여정 무마찰화 (Security, CTA Ladder & Gate Journey)
- 미인증 티저 열람(공개 딜카드/IM-Lite)부터 NDA 체결, S60 에디토리얼 승인, S70 바이너리 릴리즈, 권한별 Pro-IM/PPTX 다운로드로 이어지는 전환 여정(CTA Ladder)에서 권한 누락, 세션 단절, 라우트 404/403 에러 등의 마찰 지점 전수 제거.
- S60/S70 승인 원장과 공유 링크 토큰 유효성 검증의 엄격한 상호 연동 및 감사 추적성(Audit Trail) 확보.

## Verification Mechanisms
1. 연계 발행 플로우 E2E 테스트:
   `npx vitest run src/tests/e2e/dealcard-publication-flow.test.ts src/tests/e2e/mobile-im-publication-flow.test.ts src/tests/e2e/pptx-publication-flow.test.ts src/tests/e2e/pptx-studio-approval-flow.test.ts`
2. 매칭 및 인테이크 E2E/API 테스트:
   `npx vitest run src/tests/e2e/ai-matching-e2e.test.ts src/tests/api/parse-memo.test.ts`
3. 크로스 채널 및 실매물 회귀 방지:
   `npx vitest run src/tests/e2e/real-broker-im-pipeline.test.ts src/tests/e2e/cross-channel-invalidation.test.ts`
4. 물리 바이너리 벤치마크:
   `npx tsx scripts/benchmark-real-broker-im.ts`
5. 타입스크립트 및 프로덕션 빌드 무결성:
   `npm run typecheck` 및 `npm run build` (Exit code 0)

## Acceptance Criteria
- [ ] 메모 인테이크부터 딜카드/IM/PPTX 생성까지의 데이터 파이프라인에서 누락·절삭·포맷 오류가 0건일 것.
- [ ] 딜카드/모바일 IM과 바이어/테넌트 매칭 간 물건 스펙 데이터 연동 및 상호 전환이 오류 없이 유기적으로 동작할 것.
- [ ] 딜카드/IM 열람 및 공유 활동 데이터가 소유자 리포트에 왜곡 없이 실시간 반영될 것.
- [ ] 티저 ➔ NDA ➔ 승인 게이트(S60/S70) ➔ Pro IM/PPTX 다운로드에 이르는 사용자 여정에서 세션/권한 단절이나 불일치 4xx/5xx 에러가 0건일 것.
- [ ] 모든 연계 플로우(발행, 매칭, 인테이크, 승인, 무효화) E2E 테스트가 100% 통과할 것.
- [ ] npm run typecheck 및 npm run build가 에러 없이 성공할 것.

## Execution Guardrails
- AGENTS.md 및 .agents/AGENTS.md의 모든 규칙을 엄격히 준수할 것.
- 프론트엔드와 im-core 도메인 계층 간 클린 아키텍처 의존성 방향(UI -> domain)을 유지할 것.
- 산출물 단언 우선 원칙 및 Negative Pair 의무를 충족할 것.
- 모든 리팩토링 및 수정 후 빌드 무결성을 최종 검증할 것.

## Follow-up — 2026-09-05T01:04:24Z

CBRE 모범 IM(NH농협캐피탈빌딩) 분석을 통해 검증된 3대 킬러 기능(건축 입면 셋백 스태킹 플랜, 광역 대중교통 벡터 다이어그램 엔진, 딥 슬레이트/샴페인 골드 인스티튜셔널 테마)을 CRE IM 코어 파이프라인 및 모바일 IM 웹 뷰어에 정식 탑재하고 옴니채널 전구간 무결성을 고도화합니다.

Working directory: c:\Users\User\cre-dealcard
Integrity mode: development

## Requirements

### R1. 건축 입면 셋백(Setback) 반영 스태킹 플랜(Stacking Plan) 전구간 연동
- 상층부 테라스 후퇴(Setback) 및 지하층 깊이감이 반영된 단면 실루엣 기반 층별 배치 시각화 기능 구현.
- 앵커 테넌트, 일반 임차인, 리테일, 공용부/주차장 구분을 위한 의미적 컬러코드 및 만기연도 범례 지원.
- 층별 바닥면적, 전용면적, 임대면적, WALE, 공실률 데이터 매트릭스 표시.
- PPTX 렌더러 아키타입(A22 또는 기존 스태킹 아키타입 고도화) 및 모바일 IM 웹 뷰어 전용 인터랙티브 컴포넌트에 동시 지원.

### R2. 광역 대중교통망(Location Macro Transit) 벡터 다이어그램 엔진 정식화
- 대상 자산 중심의 미니멀 광역 대중교통망 벡터 그래픽 생성 및 렌더링 파이프라인 통합.
- 현재 운행 노선(지하철, 환승센터, 간선도로) 및 미래 개통 예정 노선(신안산선, GTX, 경전철 등)의 연도/점선 뱃지 지원.
- 대상지 중심 0.5km(도보 5분), 1.0km(도보 10분) 반경 동심원 및 3대 핵심 권역(CBD, GBD 등) 연결 벡터 화살표 표시.
- V-World 지적도 생성 파이프라인과 대등한 고화질(실효 180+ DPI) Sharp SVG 렌더러 엔진 정식 모듈화.

### R3. 하이엔드 인스티튜셔널 슬레이트 테마 (`institutional_slate`) 정식 도입
- 딥 차콜 슬레이트(`#2B2F3E`) 배경과 샴페인 골드(`#E8DEC8`) 액센트 및 오픈 프레임 라인 스타일을 정식 프라임 템플릿 프리셋으로 등록.
- `pptx-theme.ts`의 토큰 스키마(무채색, 액센트, 다크 전용 카드/블록, 타이포그래피) 및 모바일 웹 뷰어 테마 스타일에 완벽 일치.

### R4. 옴니채널 양방향 동기화 및 물리/도메인 게이트 100% 무결성
- SSoT, 모바일 IM 웹 뷰어, Studio PPTX 간 7대 핵심 지표(타이틀, 매매가, 연면적, 대지면적, Cap Rate, 보증금, 월세) 0 불일치 보장.
- 물리 바이너리 6대 게이트(Bleed, Residue, Broken Images, Rule 1 Persona Isolation, Rule 2 CRE Lexicon, P0 Legal Safety) 0 결함 통과.
- Rule 10 면수 상한(본문 16면 이하, 부록 제외) 철저 준수.

## Acceptance Criteria

### 1. PPTX 및 웹 뷰어 스태킹 플랜 렌더링
- [ ] PPTX 렌더링 결과 스태킹 플랜 슬라이드가 지면 이탈(Bleed 0건)이나 오버플로 없이 정상 생성된다.
- [ ] 모바일 IM 웹 뷰어에서 층별 단면 실루엣 및 렌트롤 데이터가 반응형으로 깨짐 없이 렌더링된다.

### 2. 광역 대중교통 벡터 다이어그램
- [ ] 여의도, 강남 등 대상 권역에 대해 반경원(0.5km/1km) 및 미래 노선 뱃지가 포함된 벡터 다이어그램이 생성된다.
- [ ] 생성된 이미지의 실효 DPI가 150 DPI 이상(180+ DPI)을 만족하여 G32 게이트를 통과한다.

### 3. 테마 및 CMF 체계
- [ ] `institutional_slate` 테마 프리셋이 `pptx-theme.ts`에 정의되고 토큰 스키마 검증 테스트를 통과한다.
- [ ] 다크 슬레이트 배경에서 텍스트 대비비(Contrast Ratio) 및 폰트 무결성이 유지된다.

### 4. 품질 게이트 및 자동화 검증
- [ ] `inspectPptxBinary` 물리 하네스 검증 결과 0 결함(Bleed 0, Residue 0, Broken 0, Persona 0, Lexicon 0, Legal 0)으로 PASS 판정을 받는다.
- [ ] `verifyCrossChannelConsistency` 검증 결과 웹과 PPTX 간 7대 수치 지표 불일치가 0건이다.
- [ ] 단위/E2E 테스트 스위트가 Negative Pair 짝 의무(Rule 7)를 충족하며 전수 통과한다.
- [ ] `npm run build` 실행 시 TypeScript 컴파일 오류 없이 성공한다.

## 2026-09-05T02:44:17Z

현장 공인중개사의 실물 첨삭 피드백(양평동 더레드빌딩 250억)을 전면 반영하여, 내부 결손 변명과 훈계성 문구를 영구 퇴출하고 4대 필수 건축 제원, 2대 감정평가 밸류에이션(사례비교법·수익환원법), 자본수익률(Capital Gain) 금융 모델, 1km/3km 광역 인프라 맵, 고스트 슬라이드 방지 체계를 탑재하여 투자자향 기관급 세일즈 IM으로 파이프라인을 전면 고도화합니다.

Working directory: c:\Users\User\cre-dealcard
Integrity mode: development

## Requirements

### R1. 내부 데이터 결손 변명 및 훈계성 문구 전면 차단 (No-Defect-Excuses & Sales Tone)
- 슬라이드 상의 '미확보', '산출 불가', '확인되지 않음', '자료 없음', '비워 둡니다' 등의 방어적 변명 문구를 영구 퇴출하고, 검증된 SSoT 확정 수치만 프로페셔널하게 렌더링.
- "표면 수익률만으로 판단하지 마십시오" 등의 AI 훈계조/지도조 문구 원천 차단 필터 적용.
- 원장 불일치(제시액 vs 원장액 차이) 등 내부 데이터 대조 불일치는 파이프라인 내부 검증에서 단일 진실로 정제하여 단일 수치만 슬라이드에 반영.

### R2. 4대 필수 건축 제원 SSoT 복원 및 3단 Key Facts 체계화
- 대지·연면적 외에 공인중개사 및 매수인 필수 확인 4대 제원(`건축면적`, `사용승인일`, `주차대수(자주식/기계식)`, `승강기(EV)`)을 SSoT 및 물건 개요 슬라이드에 필수 바인딩.
- 토지 제원, 건물 제원, 권리/임대 제원으로 구성된 3단 계층화 제원표 구현.

### R3. 상업용 부동산 가격 근거 2대 평가 모델 정식 탑재 (사례비교법 + 수익환원법)
- "비교사례가 없어 시세 고저를 모른다"는 도피형 서술을 배제하고, 중개인이 지명한 2대 평가 축을 자동 산출:
  1. **사례비교법 (Sales Comparison)**: 영등포 준공업지역 실거래 벤치마크 데이터(3~5건) 기반 대지·연면적 평당가 밴드 비교.
  2. **수익환원법 (Income Capitalization)**: 정규화된 순영업소득(NOI)과 시장 요구 Cap Rate(4.0~4.5%) 기반 적정 자산가치 산정.
  3. 원가법 배제 (`원가법 X`).

### R4. 입체적 레버리지 & 자본수익률(Capital Gain) 모델링 및 요약 균형
- 첫 장 요약(Summary)에서 단순 LTV 50% 역레버리지로 인한 `-30만 원 적자` 편향을 지양하고, 무차입 운영수익률(Cap Rate)과 공시지가/토지시세 기반 자본수익률(Capital Gain)을 병기하여 총수익률(Total Return) 관점 제시.
- 대출 시뮬레이션에 단순 이자 외에 원금 분할상환 옵션, 공실률 버퍼(3~5%), 관리비 실비/운영비(OPEX) 상계 구조 반영.

### R5. 1km/3km 광역 인프라 벡터 맵 연동 및 배후수요 도메인 버그 영구 픽스
- Sharp 기반 광역 교통 엔진(`macro-transit-engine.ts`)을 확장하여 대상지 중심 1km(도보 생활권), 3km(광역 업무권역) 동심원 및 주요 지하철·간선도로·편의시설 인프라 벡터 맵 렌더링.
- 이전 시스템이 '배후 수요'란에 건물 내부 임차인을 오기재했던 파이프라인/프롬프트 도메인 버그를 영구 픽스하고 격리 검증.

### R6. 고스트 슬라이드(Ghost Slide) 퇴출 및 세일즈 클로징 강화
- Rule 9(조건부 면 추가)를 엄격히 적용하여 내부 사진 부재 시 빈 슬라이드 생성을 원천 차단하고, A22 스태킹 플랜 단면도로 자연스럽게 대체.
- 내부 시스템 룰(사진 운용 원칙, EXIF, 자료 등급 R2×P3) 노출을 전면 삭제하고, 정식 거래 절차(LOI 접수 -> 실사 -> 본계약) 기반의 세일즈 클로징 슬라이드로 완결.

## Acceptance Criteria

### 1. 텍스트 거버넌스 및 결손 변명 배제
- [ ] 생성된 PPTX 및 모바일 웹 문서 전 영역에서 결손 변명 문구('산출 불가', '미확보', '확인되지 않음', '비워 둡니다') 및 훈계 문구가 0건이다.
- [ ] 임대 현황 하단에 원장 차이(360만 원 등) 중계방송 없이 단일 정제된 합계액만 깔끔하게 표시된다.

### 2. 제원표 및 밸류에이션 무결성
- [ ] 물건 개요 슬라이드에 건축면적, 사용승인일, 주차대수, 승강기가 정상 바인딩된다.
- [ ] 가격 근거 슬라이드에 사례비교법(인근 실거래 평당가 밴드)과 수익환원법(Cap Rate 환원가치)이 수치와 함께 표기되며, 원가법은 배제된다.

### 3. 금융 시뮬레이션 및 요약 균형
- [ ] 한 장 요약에 월 순현금 적자 단독 부각 대신 무차입 수익률과 자본수익 잠재력이 균형 있게 표시된다.
- [ ] 투자 구조 슬라이드에서 원금 상환 및 공실률 버퍼 옵션이 반영된다.

### 4. 입지 인프라 맵 및 도메인 정합성
- [ ] 1km 및 3km 반경 동심원이 포함된 고화질(180+ DPI) 광역 인프라 벡터 다이어그램이 렌더링된다.
- [ ] 배후 수요 분석 영역에 건물 내부 임차인 데이터가 오염되지 않고 주변 인프라/수요 데이터만 독립 렌더링된다.

### 5. 슬라이드 시퀀싱 및 품질 게이트
- [ ] 사진 부재 시 텍스트만 있는 빈 슬라이드(Ghost Slide)가 생성되지 않는다 (0건).
- [ ] 내부 시스템 개발 룰(EXIF, 등급 등)이 슬라이드에 0건 노출된다.
- [ ] `inspectPptxBinary` 물리 하네스 검증 6대 게이트(Bleed 0, Residue 0, Broken 0, Persona 0, Lexicon 0, Legal 0)를 100% 통과한다.
- [ ] 전체 단위/E2E 테스트 스위트가 Negative Pair 짝 의무를 준수하며 통과하고 `npm run build`가 성공한다.

## 2026-09-05T04:16:02Z

신사동 590(도산대로 GBD) 및 서초동 1364-28(서초 GBD) 실제 중개 매물 데이터를 대상으로, 신규 개발된 2대 감정평가(사례비교법·수익환원법, 원가법 배제) 엔진, G54~G56 거버넌스 게이트, GBD 광역 인프라 벡터 다이어그램, A22 스태킹 플랜 및 고공실 Pro-forma 밸류애드 모델을 전면 통합하여 E2E 파이프라인을 확장하고 캘리브레이션합니다.

Working directory: c:\Users\User\cre-dealcard
Integrity mode: development

## Requirements

### R1. 강남/서초 2개 실매물 SSoT 픽스처 완성 및 4대 필수 건축 제원 복원
- 신사동 590 및 서초동 1364-28의 건축물대장 및 임대차 원장을 정합한 단일 SSoT 픽스처 구축.
- 4대 필수 건축 제원(`건축면적`, `사용승인일`, `주차대수(자주식/기계식)`, `승강기`) 및 대상지/토지/건물 3단 그룹 Key Facts 제원표를 양건 모두에 완전 복원.
- 서초동 1364-28의 다층 공실 상태에 대해 만실 정상화(Pro-forma Cap Rate 및 Upside pp) 시나리오 SSoT 연결.

### R2. GBD 권역 실거래 기반 2대 감정평가 엔진 (사례비교법 + 수익환원법) 완전 통합
- 인근 실거래 사례(3~5건) 기반 대지 평당가 밴드 산출(사례비교법) 및 순영업소득(NOI)과 시장 요구 Cap Rate(2.5%~3.5%) 기반 자산가치 환원(수익환원법) 산출.
- 도심 상업용 수익형 자산 특성에 맞춰 원가법(Cost Method) 명시적 배제 사유 기록.
- 중개인 수기 기재 평당가와 계산치 간 오차를 사전 검증하여 이상치(Anomaly) 0건 달성.

### R3. GBD 광역 인프라 벡터 다이어그램 엔진 및 배후수요 도메인 격리
- 신사동 590(신사역·압구정역·위례신사선, 도산대로) 및 서초동 1364-28(양재역·강남역·신분당선·GTX-C)에 대해 1600x1200 px, 266.7 DPI 초고화질 SVG 벡터 맵 연동.
- 대상지 중심 0.5km(도보 5분), 1.0km(도보 10분) 동심원 및 주요 도심권역 통근 화살표 렌더링.
- 내부 입주 임차인과 외부 상권 배후수요(IT/바이오 R&D, 엔터테인먼트, 메디컬 등)를 엄격히 분리하여 슬라이드에 반영.

### R4. G54~G56 텍스트 거버넌스 및 물리 바이너리 9대 게이트 무결성
- 생성된 PPTX 및 웹 문서 전 영역에서 결손 변명('산출불가', '미확보', '비워둠') 0건(G54), AI 훈계조 0건(G55), 내부 시스템 룰 노출 0건(G56) 달성.
- `inspectPptxBinary` 물리 하네스 검증 결과 9대 게이트(Bleed 0, Residue 0, Broken 0, Rule 1 Persona 0, Rule 2 Lexicon 0, P0 Legal 0, G54 0, G55 0, G56 0, DPI >= 150) 0 결함 통과.
- Rule 10 면수 상한(본문 16면 이하, 부록 제외) 철저 준수.

### R5. 스튜디오 승인 원장(S60 -> S70) 체결 및 옴니채널 7대 지표 동기화 회귀 검증
- S50 게이트 검사 -> S60 에디토리얼 승인 -> S70 바이너리 파일 릴리즈(PUBLISHED) 전자 승인 원장 전구간 체결.
- SSoT, 웹 IM, Studio PPTX 간 7대 핵심 지표(title, asking_price, total_area, land_area, cap_rate, total_deposit, monthly_rent) 0 불일치 보장.
- Rule 7(Negative Pair 짝 의무)을 엄격히 준수한 종합 E2E 자동화 테스트 스위트 구축 및 `npm run build` 100% 통과.

## Acceptance Criteria

### 1. SSoT 픽스처 및 4대 필수 제원
- [ ] 신사동 590 및 서초동 1364-28 픽스처에 건축면적, 사용승인일, 주차대수, 승강기가 정상 등재된다.
- [ ] `validateBrokerInput` 검증 결과 이상치(Critical Discrepancy)가 0건이다.

### 2. GBD 2대 감정평가 및 벡터 맵
- [ ] 신사동 590 및 서초동 1364-28에 대해 사례비교법 평당가 밴드와 수익환원법 환원가치가 정상 산출된다.
- [ ] 생성된 GBD 광역 인프라 다이어그램의 실효 DPI가 150 DPI 이상(266.7 DPI)을 만족한다.

### 3. 물리 바이너리 9대 게이트 및 텍스트 거버넌스
- [ ] 렌더링된 PPTX 파일 2건 모두 `inspectPptxBinary`에서 Bleed 0, Residue 0, Broken 0, Persona 0, Lexicon 0, Legal 0, G54 0, G55 0, G56 0으로 ALL PASS 판정을 받는다.
- [ ] 본문 슬라이드 수가 16면 이하(Rule 10)를 만족한다.

### 4. 옴니채널 정합성 및 자동화 테스트
- [ ] Studio 승인 원장에서 S60 에디토리얼 승인 및 S70 배포 릴리즈(PUBLISHED)가 정상 기록된다.
- [ ] `verifyCrossChannelConsistency` 검증 결과 7대 핵심 지표 불일치가 0건이다.
- [ ] E2E 회귀 테스트 스위트의 모든 테스트 케이스가 Negative Pair(Rule 7)를 포함하여 전수 통과한다.
- [ ] `npm run build`가 오류 없이 성공한다.


