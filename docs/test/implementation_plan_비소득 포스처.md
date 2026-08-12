# 비소득 포스처 PPTX 데이터 파이프라인 정밀 구현 계획 (고도화 버전)

## 🎯 목표 (Goal)

현재 `types.ts`의 하드코딩된 타입 제약으로 인해 비소득 포스처(사옥·개발·운영·거래)의 IM 섹션이 정상 처리되지 않고, 결과적으로 PPTX 렌더링 시 빈 슬라이드가 출력되는 **3계층 구조적 결함**을 해결합니다. 

타입 시스템부터 AI 제너레이터, 데이터 바인더, PPTX 렌더러에 이르는 전체 파이프라인을 온톨로지 SSoT 체계에 맞춰 정밀하게 확장하고, 데이터 부재 시의 안전망(Graceful Degradation)을 SOTA 수준으로 구축합니다.

---

## 🛠 제안하는 변경 사항 (Proposed Changes)

### 1. 타입 시스템 및 코어 인터페이스 확장
> AI가 생성하는 모든 비소득 섹션이 타입 시스템 내에서 합법적으로 흐르도록 보장합니다.

#### [MODIFY] [`src/domain/building/mobile-im/types.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/types.ts)
- 기존 `MOBILE_IM_SECTIONS_7` 배열은 하위 호환성을 위해 유지하되, `MobileIMSectionType` 유니온을 확장합니다.
- 공통(5) + 수익형(2) + 사옥(2) + 개발(2) + 운영(2) + 거래(2) = 총 15개 섹션 타입 정의.

```typescript
export const MOBILE_IM_SECTIONS_NON_INCOME = [
  // owner_occupied
  "occupancy_fit", "cost_comparison",
  // development
  "site_analysis", "development_feasibility",
  // operating
  "operation_overview", "gop_analysis",
  // trading
  "market_position", "comparable_analysis"
] as const;

export type MobileIMSectionType = 
  | (typeof MOBILE_IM_SECTIONS_7)[number] 
  | (typeof MOBILE_IM_SECTIONS_NON_INCOME)[number];
```

---

### 2. 제너레이터 & 템플릿 엔진 대응
> 새로운 섹션 타입이 AI 생성 루프와 프리미엄 템플릿 폴백 로직에서 에러를 내지 않도록 처리합니다.

#### [MODIFY] [`src/domain/building/mobile-im/im-section-generator.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/im-section-generator.ts)
- `SECTION_MAX_TOKENS` 객체에 8개의 신규 비소득 섹션 타입에 대한 적정 토큰 한도(1000~1500) 추가.

#### [MODIFY] [`src/domain/building/mobile-im/premium-template-engine.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/premium-template-engine.ts)
- `getSectionTitle` 함수의 `titles` 매핑 딕셔너리에 신규 섹션 8종의 국문 타이틀 명시적 추가 (예: `occupancy_fit: '사옥 적합성 분석'`).

---

### 3. 데이터 바인더 정밀 확장
> 마크다운으로 생성된 섹션 본문에서 PPTX 아키타입(A02~A13)이 요구하는 구조화된 Props를 정확히 파싱/추출합니다.

#### [MODIFY] [`src/domain/building/mobile-im/pptx/data-binder.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/data-binder.ts)

**3-1. 매핑 딕셔너리 확장**
- `SECTION_TYPE_TO_DATA_KEY`: 신규 8개 섹션을 primary dataKey로 매핑 (예: `occupancy_fit` -> `plan`).
- `DATA_KEY_ARCHETYPE`: 신규 14개 파생 dataKey를 PPTX 아키타입으로 매핑 (예: `plan` -> `A04`, `vsLease` -> `A08`, `kpi` -> `A13`).

**3-2. 포스처별 전용 빌더(Builder) 함수 구현**
기존 `buildLandFromOverview` 패턴을 차용하여, 마크다운 텍스트와 파싱된 테이블(`ParsedTable[]`)에서 데이터를 추출하는 전용 로직 구현:

- `buildOccupancyFromFit()`: `plan`(A04), `commute`(A06) 파생
- `buildCostFromComparison()`: `vsLease`(A08), `value`(A04) 파생
- `buildLandFromSiteAnalysis()`: `landDetail`(A04), `scale`(A05), `eviction`(A04) 파생
- `buildFeasibilityFromDev()`: `cost`(A08), `stacking`(A05), `feasibility`(A05) 파생
- `buildOperatingFromOverview()`: `kpi`(A13), `operator`(A04) 파생
- `buildRevenueFromGop()`: `revenue`(A05), `seasonality`(A05) 파생
- `buildMarketFromPosition()`: `marketPosition`(A04), `turnover`(A04) 파생
- `buildCompsFromTrading()`: `tradingComps`(A03), `trend`(A05), `price`(A04) 파생

**3-3. `bindSectionData()` 스위치 로직 보강**
각 `section.section_type`에 따라 위 빌더들을 호출하고, 결과를 `dataMap`에 주입.

**3-4. 온톨로지 ValueMetrics 연동**
`bindSectionData` 내 Summary(A02) 슬라이드 구성 시, `getValueMetrics(posture)`를 호출하여 해당 포스처의 SSoT 표준 가치 지표를 헤드라인 메트릭으로 노출하도록 연동.

---

### 4. PPTX 렌더러 안전망 구축 (Empty Slide Suppression)
> 데이터가 불충분할 경우 껍데기 슬라이드가 렌더링되는 것을 원천 차단합니다.

#### [MODIFY] [`src/domain/building/mobile-im/pptx/pptx-renderer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/pptx-renderer.ts)
슬라이드 렌더링 루프 진입 시 검증 로직 추가:
```typescript
const slideData = dataMap[spec.dataKey];
const isStaticSlide = ['cover', 'closing', 'gallery', 'summary'].includes(spec.dataKey);

const hasContent = slideData && (
  (slideData.content && slideData.content.trim().length > 0) || 
  (slideData.tables && slideData.tables.length > 0) ||
  (slideData.left || slideData.right || slideData.blocks || slideData.table1) // 아키타입별 특수 props
);

if (!hasContent && !isStaticSlide) {
  warnings.push(`[Graceful Degradation] ${spec.title} 슬라이드 억제: 바인딩할 데이터(dataKey: ${spec.dataKey})가 충분하지 않습니다.`);
  continue; // 빈 슬라이드 건너뛰기
}
```

---

## 🧐 검토 요청 (Open Questions)

> [!CAUTION]
> **Q1. 아키타입 A13(KPI) 및 데이터 파싱 정밀도**
> `operating` 포스처의 `kpi` dataKey는 A13 아키타입을 사용하도록 `deck-sequencer.ts`에 정의되어 있습니다. A13 아키타입의 정확한 Props 구조(예: `metrics`, `charts` 등)를 확인하여 빌더 함수를 작성할 계획입니다. A13의 현재 스펙을 따르는 것이 맞습니까?

> [!IMPORTANT]
> **Q2. Trading Comps 분리**
> trading 포스처의 비교사례 데이터 키를 기존 income의 `comps`(A04)와 분리하여 `tradingComps`(A03 - 표 위주)로 매핑하는 구조를 설계했습니다. 이는 `deck-sequencer.ts` L138의 `comps`를 `tradingComps`로 수정해야 함을 의미합니다. 동의하십니까?

> [!TIP]
> **Q3. 단계적 배포**
> 타입 시스템과 렌더러 안전망(4번)을 먼저 구축하면, 비소득 포스처 생성 시 에러나 빈 슬라이드 없이 '안전하게 누락(Skipped)' 처리됩니다. 이후 데이터 바인더(3번)를 고도화하는 순서로 작업하는 것을 권장합니다.

## ✅ Verification Plan
1. `tsc --noEmit`으로 타입 확장 유효성 검증.
2. 5개 포스처별로 Mock Data를 구성하여 `npm run test` 환경 또는 UAT 스크립트로 PPTX 추출 테스트 수행.
3. 렌더러 안전망이 작동하여 데이터가 없는 비소득 슬라이드는 깔끔하게 생략되는지(Graceful Degradation) 확인.
4. 데이터 바인더 로직 적용 후, 실제 비소득 슬라이드가 내용과 함께 렌더링되는지 최종 검증.
