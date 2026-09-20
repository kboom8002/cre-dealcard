# PPTX IM 스펙 — 데이터 바인딩 · 렌더링 · 아키타입 · 테마 명세

> **문서 버전**: v6.0 (D37 Claim/Tier/Gate 고도화)
> **최종 갱신**: 2026-08-28
> **대상 커밋**: `450b58b`
> **선행**: D30~D37 전량 완료

---

## 1. 개요

PPTX IM은 모바일 IM JSON 데이터를 **PowerPoint 2016+ (.pptx)** 형식의 투자설명서로 변환하는 서버사이드 렌더링 엔진입니다.

### 1.1 핵심 설계 원칙

| 원칙 | 설명 |
|---|---|
| **골디락스 단일 시퀀스** | Basic/Pro 이중 분기 폐지 → 12p 필수 + 동적 12→16p |
| **데이터 가용성 기반 편성** | `DataAvailability` 15플래그에 따라 슬라이드 자동 추가/제외 |
| **Grade 기반 재무 확장** | A등급 풀 재무(6종) → B등급 축소(2종) → C등급 없음 |
| **ReleaseTier 기반 면제어** (D37) | `resolveTier()` → 허용 섹션/면수 동적 제한 |
| **테마 격리** | `withThemeIsolation()` — 동시 렌더링 시 전역 상태 오염 방지 |
| **Graceful Degradation** | 데이터 결손 시 슬라이드 생략 + 경고, 에러 없음 |
| **본문/부록 이원화** (D37) | 공부·등기·지적도·상권 → 부록 (16면 한도 제외) |

---

## 2. 렌더러 코어

> 📁 [`pptx-renderer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/pptx-renderer.ts) (700행)

### 2.1 `MobileImPptxInput` 인터페이스

```typescript
interface MobileImPptxInput {
  buildingId: string;
  tier?: PptxTier;
  preset?: string;
  posture?: InvestmentPosture;
  grade?: 'A' | 'B' | 'C' | 'D';
  incomeArchetype?: 'R-INC-01' | 'R-INC-02' | 'R-INC-03' | 'R-INC-04';
  hasViolation?: boolean;
  hasJointCollateral?: boolean;
  doc: {
    title?: string;
    body: Record<string, any>;
    sections?: Array<{ title, markdown, confidence?, boundary_note? }>;
  };
  building?: { area_signal?, asset_type?, price_band?, owner_id? };
  broker?: { display_name?, company_name?, phone?, specialty? };
  watermark?: { requesterName, phoneLast4, timestamp };
  provenance?: Record<string, ProvenanceKind>;
  releaseTier?: ReleaseTier;  // D37 — 5종 발행 등급
}
```

### 2.2 `render()` 메서드 6단계 흐름

| Step | 라인 | 작업 | 설명 |
|:---:|:---:|---|---|
| 0 | L337~346 | 갤러리 플래닝 | `resolvePhotos`, `planGallerySlides` |
| 1 | L349~377 | **덱 시퀀스** | `buildDeckSequence(sequenceInput)` |
| 2 | L380~551 | **데이터 바인딩** | `bindSectionData` + `bindFromExternalData` |
| 3 | L554~637 | **아키타입 빌드** | `SLIDE_ARCHETYPE_REGISTRY[archetype]()` |
| 4 | L644~673 | **물리 검증** | 텍스트 버짓 + 지면 물리(G31~G36) + 수익률(G38) |
| 5 | L676~687 | **바이너리 생성** | PptxGenJS → Buffer |

### 2.3 D등급 차단
```typescript
if (input.grade === 'D') throw new Error('G30: D등급 IM은 PPTX 렌더링 불가');
```

---

## 3. 덱 시퀀서

> 📁 [`deck-sequencer.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/deck-sequencer.ts) (290행)

### 3.1 입력 인터페이스

```typescript
interface DeckSequenceInput {
  posture: InvestmentPosture;
  tier: PptxTier;
  grade: 'A' | 'B' | 'C';
  releaseTier?: ReleaseTier;      // D37
  incomeArchetype?: string;
  hasViolation?: boolean;
  hasJointCollateral?: boolean;
  hasPhotos?: boolean;
  gallerySpecs?: GallerySpec[];
  dataAvailability: DataAvailability;
}

interface DataAvailability {
  hasLandUsePlan: boolean;
  hasLandPrice: boolean;
  hasBuildingRegister: boolean;
  hasRegistryData: boolean;
  hasComparables: boolean;
  hasCommercialDistrict: boolean;
  hasCadastralMap: boolean;
  hasFloorPlan: boolean;
  hasRentRoll: boolean;
  hasOpex: boolean;
  hasAsOf: boolean;
  hasScenario: boolean;
  hasExpertReview: boolean;
  hasPermitZone: boolean;
  hasPhotos: boolean;
}
```

### 3.2 슬라이드 편성 규칙

| 상수 | 값 | 설명 |
|---|:---:|---|
| `PAGE_RECOMMENDED` | 12 | 기본 본문 면수 |
| `PAGE_HARD_LIMIT` | 16 | 본문 절대 상한 |
| `protectedKeys` | 7종 | 절삭 보호 슬라이드 |

**보호 키**: `cover`, `summary`, `closing`, `risk`, `checklist`, `process`, `thesis`

### 3.3 본문/부록 이원화 (D37)

```
본문 (body, ≤16면): 표지 + 요약 + 포스처별 섹션 + 마감
부록 (appendix): 공부발췌, 권리관계, 지적도, 상권분석
```

- `placement === 'appendix'` → 16면 한도에서 제외
- 본문 > 16면 시 protectedKeys 보존, 선택 슬라이드 절삭

### 3.4 SlideSpec

```typescript
interface SlideSpec {
  archetype: string;        // A01~A18
  kicker: string;           // 킥커 텍스트
  title: string;            // 슬라이드 제목
  dataKey: string;          // 데이터 바인딩 키
  suppress?: boolean;       // 렌더 억제
  requiredKeys?: string[];  // 필수 데이터 키
  placement?: 'body' | 'appendix' | 'closing';
}
```

---

## 4. 데이터 바인더

> 📁 [`data-binder.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/data-binder.ts) (1,979행)

### 4.1 SECTION_TYPE → DATA_KEY 매핑 (21종)

| SectionType | DataKey | 아키타입 |
|---|---|:---:|
| property_overview | building | A04 |
| location_access | location | A06 |
| lease_status | rentRoll | A03 |
| income_analysis | profit | A05 |
| risk_check | risk | A07 |
| investment_thesis | thesis | A15 |
| next_steps | process | A09 |
| occupancy_fit | plan | A04 |
| cost_comparison | vsLease | A08 |
| site_analysis | landDetail | A04 |
| development_feasibility | feasibility | A05 |
| operation_overview | kpi | A13 |
| gop_analysis | revenue | A05 |
| market_position | marketPosition | A04 |
| comparable_analysis | comps | A03 |
| **decision_snapshot** | **summary** | **A02** |
| **market_rent_gap** | **rentGap** | **A05** |
| **value_add_plan** | **valueAdd** | **A05** |
| **stabilized_scenario** | **stability** | **A04** |
| **evidence_status** | **checklist** | **A12** |

### 4.2 `bindFromExternalData()` 6종 바인딩

| # | 데이터 | 소스 | dataKey | _source |
|:---:|---|---|---|---|
| 1 | 토지 현황 | V-World landUsePlan + landPrice | land | vworld_api |
| 2 | 공부 발췌 | 건축물대장 + 토지이용규제 | publicRecords | public_api |
| 3 | 권리관계 | 등기부 | titleRights | registry_api |
| 4 | 비교사례 | 국토부 실거래 | comps | rtms_api |
| 5 | 상권 분석 | SEMAS | commercialDistrict | semas_api |
| 6 | 지적도 | V-World WMS | cadastralMap | vworld_wms |

### 4.3 DATA_KEY → ARCHETYPE 매핑 (50+)

```typescript
const DATA_KEY_ARCHETYPE: Record<string, string> = {
  summary: 'A02',  location: 'A06',  building: 'A04',
  rentRoll: 'A03', profit: 'A05',    risk: 'A07',
  process: 'A09',  thesis: 'A15',    checklist: 'A12',
  // development
  landDetail: 'A04', feasibility: 'A05', cost: 'A08',
  // operating
  kpi: 'A13',  revenue: 'A05',
  // D37 확장
  rentGap: 'A05', valueAdd: 'A05', stability: 'A04',
  // Pro 확장
  dcf: 'A05', sensitivity: 'A05', loan: 'A08', tax: 'A08',
  // ... (총 50+ 매핑)
};
```

---

## 5. 18종 슬라이드 아키타입

> 📁 [`archetypes/index.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/archetypes/index.ts)

### 5.1 아키타입 레지스트리

| ID | 빌더 | 레이아웃 | 주 용도 |
|:---:|---|---|---|
| A01 | `buildA01Cover` | 전면 표지 | 커버 (5종 coverStyle) |
| A02 | `buildA02StatGrid` | 2×2 지표 그리드 | 요약/의사결정 스냅샷 |
| A03 | `buildA03LargeTable` | 전폭 테이블 | 렌트롤/비교사례 |
| A04 | `buildA04Asymmetric75` | 7:5 비대칭 | 물건개요/토지/안정화 |
| A05 | `buildA05Asymmetric74` | 7:4 차트+통계 | 수익분석/GOP/시나리오 |
| A06 | `buildA06Diagram` | 중앙 다이어그램 | 입지/지도/통근 |
| A07 | `buildA07ThreeBlock` | 3열 블록 | 3대 리스크 |
| A08 | `buildA08DualTable` | 2열 테이블 | 비용비교/대출/세금 |
| A09 | `buildA09Process` | 5단계 스텝 | 진행절차 |
| A10 | `buildA10Closing` | 다크 전면 | 면책/마감 |
| A11 | `buildA11RoomSpec` | 2×2 카드 | 객실 스펙 |
| A12 | `buildA12Ownership` | 체크리스트 | 권리관계/실사 |
| A13 | `buildA13Operating` | KPI 대시보드 | 운영 지표 |
| A14 | `buildA14Gallery` | 2×3 그리드 | 사진 갤러리 |
| A15 | `buildA15Thesis` | 4대 카드 | 투자 논거 |
| A16 | `buildA16InvestmentStructure` | 자본 구조도 | 자금조달/PF |
| A17 | `buildA17PreCompletionMarketing` | 스태킹 플랜 | 사전 마케팅 |
| A18 | `buildA18Checklist` | 체크리스트 | 자료 현황 |

### 5.2 SVG 미리보기 (12/18종 지원)

> 📁 [`slide-preview-svg.tsx`](file:///c:/Users/User/cre-dealcard/src/components/broker/pptx-editor/slide-preview-svg.tsx) (511행)

지원: A01~A06, A07~A09, A10, A11, A14

---

## 6. 테마 시스템

> 📁 [`pptx-theme.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/pptx-theme.ts) (413행)

### 6.1 PptxThemeTokens (60개 토큰)

| 범주 | 토큰 | 개수 |
|---|---|:---:|
| 무채색 | ink, ink2, ink3, slate, body, mute, mute2, line, line2, bg, tint | 11 |
| 액센트 | accent, accentD, accentL, accentT | 4 |
| 의미색 | green/L, red/L, amber/L, blue/L, violet/L | 10 |
| 다크 전용 | darkCard, darkBlock, darkBorder, darkBody, darkMute, darkFaint, darkAccent×3 | 9 |
| 타이포 | titleFont, bodyFont | 2 |
| 스타일 | coverStyle (5종), layoutStyle (5종) | 2 |
| 브랜딩 | companyName, companyTagline, logoUrl | 3 |

### 6.2 내장 프리셋 (5종)

| presetId | 이름 | 커버 스타일 | 레이아웃 | 특징 |
|---|---|---|---|---|
| `golden_institutional` | Golden Institutional | institutional_masses | classic | 기본값, 금색 액센트 |
| `credeal_signature` | CREDEAL Signature | split | modern | 딥네이비/슬레이트 |
| `executive_gold` | Executive Gold | hero_dark | executive | 오렌지골드/화이트 |
| `corporate_clean` | Corporate Clean | corporate_card | minimal | 화이트/미니멀 |
| `pro_dark_obsidian` | Pro Dark Obsidian | obsidian_glow | dramatic | 다크/네온 |

### 6.3 워터마크
- 대각선 반복 텍스트: `{요청자명} · {전화뒷4자} · {타임스탬프}`
- 투명도 조절로 가독성 유지

---

## 7. imlib 유틸리티 라이브러리

> 📁 [`imlib.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/imlib.ts) (1,291행)

### 7.1 기하 상수

| 상수 | 값 | 설명 |
|---|---|---|
| `W` | 13.333 in | 슬라이드 너비 (16:9) |
| `H` | 7.5 in | 슬라이드 높이 |
| `M` | 0.62 in | 안전 여백 |
| `CW` | 12.093 in | 콘텐츠 너비 (W - 2M) |

### 7.2 핵심 컴포넌트

| 함수 | 용도 |
|---|---|
| `light(pres)` / `dark(pres)` | 라이트/다크 슬라이드 베이스 |
| `head()` / `headD()` | 라이트/다크 헤더 |
| `stat(opts)` | 단일 지표 카드 |
| `rows(entries)` | 라벨-값 행 목록 |
| `table(data, opts)` | 정형 테이블 |
| `callout(kind, text)` | 강조 콜아웃 |
| `waterfall(steps)` | 워터폴 차트 |
| `stack(floors)` | 스태킹 플랜 |
| `locmap()` | 위치 지도 |
| `fitBox(text, box)` | 텍스트 자동 맞춤 |

---

## 8. 텍스트 버짓

> 📁 [`text-budget.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/pptx/text-budget.ts) (205행)

### 8.1 글자 수 한도

| 요소 | 한도 | 비고 |
|---|:---:|---|
| slideTitle | 32 | |
| kicker | 32 | |
| subTitle | 50 | |
| leadSentence | 100 | |
| subHeading | 35 | |
| statLabel | 18 | 지표 라벨 |
| statValue | 10 | 지표 값 |
| statSub | 27 | 지표 부제 |
| calloutTitle | 30 | |
| tableHeader | 16 | |
| tableCell | 27 | |
| note | 140 | |

### 8.2 CJK 텍스트 처리
- CJK 문자 너비 계수: 0.19인치 @ 10pt
- `charsPerLine(boxWidth, fontSize)` — 줄당 글자 수 계산
- `enforceTextBudget()` — 한국어 종결어미 보존 트렁케이션
- `repairBracketBalance()` — 괄호 균형 자동 수리 (D33 M-F)

### 8.3 인쇄 안전 영역
```
Safe: 12.713 × 6.75 in (슬라이드 내 콘텐츠 영역)
assertBounds(element, limits) — 경계 초과 검증
```

---

## 9. 지면 물리 검증

### 9.1 G31~G36 게이트

| ID | 검사 | 임계값 |
|---|---|---|
| G31 | 사진 크로핑률 | < 45% |
| G32 | 실효 DPI | ≥ 150 (캡처) / 180 (사진) |
| G33 | 텍스트 상자 넘침 | 0건 |
| G34 | 요소 겹침 | ≤ 0.015in |
| G35 | 지면 이탈 | 0건 |
| G36 | 종횡비 왜곡 | ≤ 5% |

### 9.2 수익률 검증 (G38, G40)

| ID | 검사 |
|---|---|
| G38 | 전 면 동일 yieldBasis (net/gross 혼용 금지) |
| G40 | 역레버리지 ROE 경고 표시 확인 |

---

## 10. 교차 검증

> 📁 [`cross-validator.ts`](file:///c:/Users/User/cre-dealcard/src/domain/building/mobile-im/cross-validator.ts) (687행)

| 검증 항목 | 검사 | 임계값 |
|---|---|---|
| vacancy_pct | 공실률 섹션 간 일치 | 0%p (정확) |
| total_area_sqm | 면적 섹션 간 일치 | 0% (정확) |
| cap_rate | Cap Rate vs 앵커 | 0.5%p |
| monthly_rent_krw | 월세 vs 앵커 | 0% |
| vacancy_narrative | 서술어↔수치 모순 (G41) | 만실+공실>5% |
| cap_rate_narrative | AI Cap Rate vs 계산값 | ±0.5%p (critical) |
| noi_narrative | AI NOI vs 계산값 | ±15% (warning) |
| development: total_cost | 토지비+공사비 vs 총사업비 | — |
| operating: revpar | ADR×OCC = RevPAR | — |
| trading: price_per_pyeong | 매각가/면적 vs 평당가 | — |

---

## 11. ReleaseTier 연동 (D37)

### 11.1 Tier → 면 편성 제어
```typescript
function getTierAllowedSections(tier: ReleaseTier): {
  allowFinancials: boolean;   // 재무 섹션 허용
  allowScenario: boolean;     // 시나리오 허용
  allowValueAdd: boolean;     // Value-Add 허용
  allowRentGap: boolean;      // 임대료 갭 허용
  maxBodyPages: number;       // 최대 본문 면수
};
```

### 11.2 전구간 연결
```
handler.ts resolveTier() → DB body.releaseTier
  → pptx-renderer.ts MobileImPptxInput.releaseTier
  → buildDeckSequence({ releaseTier })
  → 면 편성/억제 결정
```

---

## 12. 코드 맵

| 파일 | 행 | 역할 |
|---|:---:|---|
| `pptx-renderer.ts` | 700 | 렌더러 코어 (6단계) |
| `deck-sequencer.ts` | 290 | 면 편성 + 절삭 |
| `data-binder.ts` | 1,979 | 데이터 바인딩 (21→50+ 매핑) |
| `pptx-theme.ts` | 413 | 테마 토큰 + 5종 프리셋 |
| `imlib.ts` | 1,291 | 슬라이드 컴포넌트 라이브러리 |
| `text-budget.ts` | 205 | 텍스트 버짓 + CJK 처리 |
| `cross-validator.ts` | 687 | 교차 검증 엔진 |
| `archetypes/` | 18파일 | 아키타입별 슬라이드 빌더 |
| `slide-preview-svg.tsx` | 511 | SVG 미리보기 (12/18종) |
