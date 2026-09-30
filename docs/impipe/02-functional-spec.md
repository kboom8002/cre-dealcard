# CRE IM 파이프라인 — 기능 명세 및 세부 동작 메커니즘

본 문서는 상업용 부동산(CRE) DealCard IM(Investment Memorandum) 파이프라인의 기능 명세와 세부 동작 메커니즘을 상세히 기술합니다. 서버 사이드 데이터 생성부터 PPTX 렌더링, 모바일 뷰어 동작, 그리고 용어 정규화 및 데이터 강화 파이프라인에 이르기까지 전체 데이터 흐름과 아키텍처를 다룹니다.

---

## 1. IM 생성 파이프라인 (Mobile IM Writer)

IM 생성 파이프라인은 원시 부동산 데이터와 브로커의 입력을 바탕으로 검증되고 구조화된 투자 설명서를 생성하는 백엔드 코어 엔진입니다.

### 1.1 진입점 및 트리거
- **API Route**: `/api/broker/buildings/[id]/generate-im`
- **라우트 핸들러 (`handler.ts`)**: HTTP 요청을 수신하여 인증/인가를 수행하고 `generateMobileIM()` 컨트롤러를 호출합니다.
- **오케스트레이션 (`writer.ts`, 782줄)**: 전체 IM 생성 프로세스를 관장합니다. 컨텍스트를 빌드하고, 재무 계산을 수행하며, 각 섹션별 생성 엔진을 병렬/순차적으로 호출하여 최종 `MobileIMDocument`를 조립합니다.

```typescript
// writer.ts 진입점 시그니처 예시
export async function generateMobileIM(
  buildingId: string, 
  brokerId: string, 
  options?: IMGenerationOptions
): Promise<MobileIMDocument> { ... }
```

### 1.2 컨텍스트 빌드 (`im-context-builder.ts`)
IM 생성에 필요한 모든 기초 데이터를 하나의 응집된 객체인 `IMGenerationContext`로 구성합니다.
- **투자 포스처(Posture) 판별**: 건물의 상태와 임대차 현황, 매각 목적에 따라 5가지 포스처 중 하나를 결정합니다.
  1. `income` (수익형)
  2. `development` (개발/밸류애드형)
  3. `operating` (운영형)
  4. `owner-occupied` (사옥/실사용형)
  5. `trading` (단기 매매/트레이딩형)
- **데이터 등급(Grade) 산정**: 입력된 데이터의 완성도에 따라 A, B, C, D 등급을 산정하며, 이는 후속 파이프라인에서 생성할 섹션의 깊이와 프롬프트를 결정하는 기준이 됩니다.

### 1.3 섹션 생성 엔진 (`im-section-generator.ts`, 779줄)
각 마크다운 섹션의 콘텐츠를 생성하는 핵심 엔진입니다.

- **`generateSingleSection()`**: 섹션 식별자와 컨텍스트를 받아 LLM 프롬프트를 구성하고 콘텐츠를 반환합니다.
- **LLM 호출 및 CRE Quality Gate (`cre-quality-gate.ts`)**: `callLLM` 래퍼를 통해 생성된 텍스트가 CRE 도메인 표준을 준수하는지 검사합니다.
- **교차 검증 (`cross-validator.ts`)**: 텍스트 내에 생성된 수치(가격, 면적, 수익률 등)가 SSoT(Single Source of Truth)와 정확히 일치하는지 수치 앵커링(Number Anchoring) 기법으로 검증합니다.
- **Few-shot 학습 (`golden-im-manager.ts`)**: 최상위 품질의 과거 IM 데이터(Golden IM)를 참조하여 LLM의 출력 스타일과 포맷을 일관되게 유지합니다.
- **포스처별 프롬프트 오버레이 (`posture-prompts.ts`)**: `im-context-builder`에서 결정된 포스처에 따라 LLM 시스템 프롬프트에 특정 관점(예: 수익형은 현금흐름 강조, 개발형은 용적률 및 명도 조건 강조)을 주입합니다.

### 1.4 프리미엄 템플릿 엔진 (`premium-template-engine.ts`)
- **섹션별 템플릿 라우팅**: 데이터 등급과 포스처에 맞춰 최적의 마크다운 템플릿을 선택합니다.
- **구조화된 마크다운 생성**: 단순 텍스트가 아닌, 가독성이 높은 테이블, 강조 인용구(Blockquote), 리스트 형태를 포함한 구조화된 문서를 생성합니다.
- **데이터 바인딩**: Handlebars 스타일 또는 고유 치환 로직을 사용하여 SSoT 변수를 템플릿에 주입합니다. (예: `{{building.totalPrice}}` → `150억 원`)

### 1.5 재무 계산 파이프라인
상업용 부동산의 핵심인 재무 지표를 계산하고 시뮬레이션합니다.
- **`financial-calculator.ts` (1,002줄)**: NOI(순영업소득), Cap Rate(자본환원율), IRR(내부수익률), DCF(현금흐름할인), WACC(가중평균자본비용) 등 고도의 재무 지표를 계산합니다.
- **`net-cash-flow-calculator.ts` (125줄)**: 월별/연별 세전·세후 순현금흐름(NCF)을 산출합니다.
- **`financials.ts` (787줄)**: 포스처별로 다른 재무 전략을 적용합니다. (예: 사옥형의 경우 임대수익보다 기회비용 및 금융비용 절감 효과에 집중)
- **`wale-calculator.ts` (56줄)**: 가중평균 잔여 임대기간(WALE)을 계산하여 현금흐름의 안정성을 평가합니다.
- **`loan-simulation.ts` & `tax-scenarios.ts`**: LTV, 금리, 상환 방식에 따른 대출 시나리오와 취등록세, 양도소득세 등 세금 시나리오를 시뮬레이션합니다.

### 1.6 데이터 품질 배지 (`data-quality-badge.ts`)
데이터의 출처와 신뢰도를 4계층으로 분류하여 뷰어 및 PPTX에 시각적으로 표시합니다.
- **4계층**: `verified`(A, 공공데이터/등기부 확인) > `partial`(B, 일부 교차검증) > `reference`(C, 브로커 추정/참고용) > `draft`(D, 미검증 초안)
- **입력 기준 10개 항목**: 주소, 공공데이터, 월임대료, 공실률, 사진, 매매가, 대출금, 임대차 현황, 토지면적, 연면적.

---

## 2. PPTX 문서 생성 파이프라인

생성된 IM 데이터를 기반으로 오프라인 및 보고용 고품질 파워포인트(PPTX) 문서를 동적으로 렌더링하는 파이프라인입니다.

### 2.1 덱 시퀀서 (`deck-sequencer.ts`)
- **페이지 하드 리밋**: 인지 과부하를 방지하기 위해 `PAGE_HARD_LIMIT = 16`을 엄격히 적용합니다.
- **슬라이드 우선순위 엔진 (`SLIDE_PRIORITY`)**:
  - Priority 1: 표지, 핵심 지표, 필수 재무(Cap Rate 등)
  - Priority 2: 위치, 스태킹 플랜, 렌트롤
  - Priority 3: 갤러리, 상세 현금흐름
  - Priority 4: 선택적 부록(거시경제 지표 등)
- **동적 덱 구성**: 데이터 등급, 포스처, 클라이언트의 릴리즈 티어(Release Tier)에 따라 포함될 슬라이드와 순서를 동적으로 결정하여 하드 리밋 내에서 최적의 스토리를 구성합니다.

### 2.2 데이터 바인더 (`data-binder.ts`, 80KB)
도메인 데이터(`MobileIMDocument`)를 PPTX 렌더링에 필요한 아키타입별 DTO(Data Transfer Object)로 변환합니다.
- **25개 아키타입별 빌더 함수**: `buildA01Props`부터 `buildA24Props`까지 각 슬라이드 레이아웃에 맞는 데이터를 추출 및 매핑합니다.
- **마크다운 파싱 유틸리티**: `parseMarkdownTable()`, `extractMetrics()`, `extractBoldKeyValues()` 등을 사용하여 LLM이 생성한 마크다운에서 구조화된 데이터를 추출해 PPTX 도형 및 표에 바인딩합니다.
- **포스처별 바인더**: `buildInstitutionalTemplateData`, `buildCorporateTemplateData`, `buildCommercialTemplateData`, `buildDevelopmentTemplateData`, `buildSpecializedTemplateData` 등 투자자 유형에 맞춘 특화 바인딩을 지원합니다.

### 2.3 아키타입 상세 (핵심 슬라이드 템플릿)
총 25개의 아키타입 중 주요 레이아웃은 다음과 같이 구성됩니다.

- **A01 (커버)**
  - *목적/데이터*: 건물명, 가격대, 티저 이미지, 담당 브로커 정보.
  - *시각적 구성*: C.slate 배경에 대형 화보 배치.
- **A02 (핵심 지표 그리드)**
  - *목적/데이터*: 4~6개의 핵심 KPI (매매가, 평당가, Cap Rate, 대지면적 등).
  - *대체(Fallback)*: 데이터가 4개 미만일 경우 2x2 레이아웃으로 자동 재배치.
- **A03 (대형 테이블)**
  - *목적/데이터*: 상세 렌트롤이나 요약 재무제표.
  - *시각적 구성*: 행의 개수에 따라 9pt~13pt 사이에서 동적 폰트 조절 적용.
- **A06 (위치/지도)**
  - *목적/데이터*: Kakao 정적 지도 API 호출 결과와 주요 랜드마크 핀.
- **A14 (갤러리)**
  - *목적/데이터*: 건물 내외부 사진 그리드 (최대 6장).
- **A22 (스태킹 플랜, 32KB)**
  - *목적/데이터*: 층별 임차인 및 공실 시각화. 가장 복잡한 아키타입.
  - *시각적 구성*: 임대 면적에 비례하여 층별 블록의 높이를 동적으로 조정.
- **A23 (수익률 공식)**
  - *목적/데이터*: 매입가, 부대비용, NOI를 연결하는 Cap Rate 워터폴(Waterfall) 차트.
- **A24 (렌트롤-스태킹 하이브리드)**
  - *목적/데이터*: 좌측 스태킹 플랜, 우측 상세 렌트롤 테이블을 결합한 종합 임대 현황판.

### 2.4 텍스트 물리 엔진 (`layout-physics.ts`)
고정된 PPTX 레이아웃 내에서 텍스트 오버플로우를 방지하고 완벽한 정렬을 보장하는 물리 연산 엔진입니다.
- **`fitTextToBox()`**: 설정된 `minFontSize`와 `maxFontSize` 사이에서 0.5pt 단위로 이진 탐색(Binary Search)을 수행하여 텍스트 상자에 텍스트가 정확히 들어가도록 계산합니다.
- **`fitTableCell()`**: 테이블 셀 내부의 패딩을 고려하여 `colW - 0.11"`의 안전 여유(Safe Margin)를 확보합니다.
- **`simulateTextWrap()`**: CJK(한중일) 문자와 Latin 문자가 혼합된 환경에서 단어 잘림 방지(Word-break) 및 줄바꿈을 시뮬레이션하여 실제 높이를 추정합니다.
- **`TextPhysicsEngine`**: 글꼴별 문자 메트릭(Character Metrics) 데이터를 기반으로 렌더링 전 서버 사이드에서 크기를 확정합니다.

### 2.5 테마 시스템 (`imlib.ts`, 71KB)
PPTX의 시각적 일관성을 통제하는 글로벌 테마 상수 파일입니다.
- **색상 팔레트**: `C.brass` (강조/악센트), `C.slate` (배경/헤더), `C.mute` (비활성/보조), `C.ink` (기본 텍스트).
- **타이포그래피**: 한글(KR)은 '맑은 고딕', 숫자/영문(NUM)은 'Arial'을 적용하여 가독성과 전문성을 극대화합니다.
- **출처 라벨 (PV)**: 데이터 출처에 따라 시각적 태그 적용 (`registry`, `public_api`, `broker_validation` 등).
- **레이아웃 상수**: 마진 `M=0.62"`, 내용 가로 폭 `CW=12.093"`, 하단 안전선 `SAFE_BOTTOM=6.75"`를 엄격히 준수합니다.

---

## 3. 모바일 IM 뷰어 동작 메커니즘

모바일 기기 및 웹에서 투자자가 IM을 열람할 때 구동되는 프론트엔드 아키텍처입니다.

### 3.1 서버 컴포넌트 (`page.tsx`)
- **데이터 패칭**: `fetchIMData()`를 통해 DB에서 빌딩 정보와 IM 데이터를 가져와 `MobileIMDocument`를 조립합니다.
- **좌표 해석**: 주소 기반으로 `geocodeAddress()`를 호출하여 Kakao Maps API로 좌표를 추출하며, 실패 시 Nominatim 기반 폴백(Fallback)을 수행합니다.
- **프로필 병합**: `profiles` 테이블과 `broker_profiles` 테이블을 조인하여 담당 브로커의 상세 연락처 및 이력을 병합합니다.
- **미디어 조립**: 지도, 지적도, 건물 사진을 배열 형태로 조립하여 클라이언트에 갤러리 뷰로 전달합니다.

### 3.2 클라이언트 컴포넌트 (`MobileIMViewer`)
- **아코디언 UI**: `openSections` (useState) 상태 관리를 통해 긴 마크다운 문서를 모바일에 최적화된 아코디언 형태로 렌더링합니다.
- **Progress Dots**: `IntersectionObserver`를 사용하여 현재 뷰포트에 표시된 섹션(`activeSection`)을 추적하고, 화면 우측에 진행 상황을 점(Dot) 형태로 표시합니다.
- **상태 배너**: 문서의 승인 상태(`approvalStage`)에 따라 상단 배너를 표시합니다 (예: `draft` → `S60` → `S70`).
- **실시간 동기화**: `useDealcardRealtimeSync` 훅을 통해 백엔드에서 IM 데이터가 업데이트되면 즉각적으로 클라이언트 화면을 갱신합니다.
- **오프라인 지원**: PWA 서비스워커를 등록하여 제한적인 네트워크 환경에서도 이미 로드된 IM을 열람할 수 있도록 캐싱합니다.

### 3.3 보안 게이팅
투자자의 등급(Tier) 및 권한에 따라 민감 정보의 노출을 제어합니다.
- **서버단 마스킹**: 인가되지 않은(locked) 섹션의 경우, 서버에서 데이터를 전송하기 전 `content` 필드를 빈 문자열(`""`) 또는 안내 문구로 치환하여 데이터 유출을 원천 차단합니다.
- **클라이언트단 렌더링**: `!section.locked` 조건이 참일 때만 차트, 테이블 등의 컴포넌트를 렌더링합니다.
- **Release Tier 연동**: `TIER_CONFIG[tier]` 설정에 따라 `allowFinancials`, `allowScenario`, `allowValueAdd`, `allowRentGap` 등의 플래그를 확인하여 재무 시나리오 및 밸류애드 정보 노출 여부를 결정합니다.

---

## 4. 용어 정규화 시스템

LLM이 생성한 텍스트나 브로커가 입력한 불규칙한 용어를 CRE 업계 표준 전문 용어로 일관되게 치환하는 시스템입니다.

- **`terminology-normalizer.ts`**: 사내 D56 표준 사전을 기반으로 정규식 매핑을 수행합니다.
- **멱등성(Idempotency) 보장**: $f(f(x)) \equiv f(x)$ 원칙을 적용합니다. 이미 정규화된 용어가 중복 처리되지 않도록 Negative lookahead 정규식(예: `/(?<!순)영업이익/g`)을 사용합니다.
- **금지 용어 및 페르소나 필터링**:
  - B2C 은어 차단: '내 돈' → '에쿼티(Equity)', '세입자' → '임차인', '원금 안전판' → 배제.
  - 부적절한 페르소나 차단: '60대 자산가에게 적합한' 등의 주관적 타겟팅 문구를 필터링합니다.
- **자동 적용**: `normalizeGeneratedMarkdown()` 함수가 템플릿 엔진의 출구(Exit Point)에 배치되어 있어, 모든 생성물이 최종 렌더링 전에 무조건 이 정규화 과정을 거칩니다.

---

## 5. 데이터 강화(Enrichment) 파이프라인

내부 데이터베이스에 부족한 컨텍스트를 외부 공공 API를 통해 실시간으로 보강하는 시스템입니다.

- **`resolve-enrichment.ts`**: 파이프라인의 데이터 수집 단계를 담당하며 외부 데이터 소스를 통합합니다.
- **지적도 (`cadastralMapImage`)**: 국토교통부 V-World API를 호출하여 해당 필지의 지적도 이미지를 가져옵니다.
- **정적 지도 (`locationMapImage`)**: Kakao Static Map API를 사용하여 특정 축척과 스타일이 적용된 건물 위치 지도를 생성합니다.
- **토지 이용 계획 (`landUsePlan`)**: 공공데이터포털 연동을 통해 해당 번지의 법정 용적률, 건폐율, 국토계획법에 따른 용도지역(예: 일반상업지역, 제3종일반주거지역)을 추출하여 밸류애드 및 개발 포스처 판단의 근거로 사용합니다.
- **공시지가 이력 (`landPriceHistory`)**: 과거 5~10년간의 개별공시지가 변동 추이를 수집하여 자산 가치 상승의 보조 지표로 활용합니다.

---

```mermaid
flowchart TD
    A[API Trigger: generate-im] --> B(writer.ts)
    B --> C[im-context-builder.ts\nPosture & Grade]
    C --> D[im-section-generator.ts]
    C --> E[financial-calculator.ts]
    
    D --> F[cre-quality-gate.ts]
    F --> G[terminology-normalizer.ts]
    E --> H[net-cash-flow & wale]
    
    G --> I{premium-template-engine.ts}
    H --> I
    
    I --> J[MobileIMDocument 조립]
    
    J --> K[PPTX 생성 파이프라인]
    J --> L[Mobile Viewer (page.tsx)]
    
    K --> M(deck-sequencer.ts)
    M --> N(data-binder.ts)
    N --> O(layout-physics.ts)
    O --> P[최종 PPTX 파일]
```
