# CREDEAL 온톨로지 SSoT 정밀 감사 보고서

> **감사 일시**: 2026-08-03 13:25 KST
> **감사 대상**: `src/domain/ontology/` (v0.2.0)
> **기준 문서**: [`docs/ONTOLOGY_V0.2_SPEC.md`](ONTOLOGY_V0.2_SPEC.md)
> **버전**: v0.2.0 (v0.1의 14 enum + 70 슬롯 → v0.2의 9 enum + 86 슬롯으로 확장)

---

## 1. 디렉토리 구조

```
src/domain/ontology/
├── index.ts             (101줄) — 통합 re-export 모듈
├── enums.ts             (127줄) — Enum 카탈로그 (9계열)
├── provenance.ts        (214줄) — 5-Tier Provenance 시스템
├── slots.ts             (179줄) — 슬롯 카탈로그 (86개)
└── rules/
    ├── parcel.ts         (141줄) — P 규칙군 (P01~P03)
    └── tenancy.ts        (173줄) — T 규칙군 (T01~T06)
```

**총 6개 파일, 935줄**

---

## 2. Provenance 5-Tier 시스템

**파일**: [`provenance.ts`](../src/domain/ontology/provenance.ts)

### 2.1 등급 정의

| 배지 | 코드 | 정의 | 점수 | 책임 | 스펙 적합 |
|:---:|:---|:---|:---:|:---|:---:|
| ✓ | `public` | 공부확인 (건축물대장·등기부 등) | 1.00 | 발급기관 | ✅ |
| ★ | `expert` | 전문가검증 (감정평가사·세무사) | 0.95 | 해당 자격사 | ✅ |
| ▲ | `seller` | 매도인고지 (v0.2 신설) | 0.65 | 매도인 | ✅ |
| ● | `broker` | 중개인입력 | 0.60 | 중개인 | ✅ |
| ◇ | `assumed` | AI추정·가정 | 0.30 | 없음 | ✅ |

### 2.2 파생값 합성 규칙 (3종)

| 합성 종류 | 함수 | 적용 대상 | 코드 적합 |
|:---|:---|:---|:---:|
| **additive** | `composeAdditive()` | NOI 등 가감산 지표 | ✅ |
| **ratio** | `composeRatio()` | Cap Rate 등 비율 지표 | ✅ |
| **scenario** | `composeScenario()` | 총수익률·NPV·IRR (항상 `assumed`) | ✅ |

### 2.3 관련 인터페이스

| 인터페이스 | 필드 | 비고 |
|:---|:---|:---|
| `ProvenanceTier` | `'public'│'expert'│'seller'│'broker'│'assumed'` | type union |
| `ProvenanceMeta` | `tier, badge, label, score, responsibility` | 등급 메타 |
| `ProvenanceInput` | `value, score, label` | 합성 입력 |
| `ComposedProvenance` | `compositionKind, score, tier, badge, weakestLink, inputs` | 합성 결과 |

### 2.4 v0.1 → v0.2 마이그레이션 헬퍼

| 함수/상수 | 설명 |
|:---|:---|
| `SELLER_CANDIDATE_SLOTS` | `loanAmountKrw, tenantDelinquency, mgmtFeeDetail, equipmentHistory, askingPriceKrw` |
| `migrateProvenanceTier()` | v0.1 4-tier → v0.2 5-tier 변환 로직 |

---

## 3. Enum 카탈로그 (9계열)

**파일**: [`enums.ts`](../src/domain/ontology/enums.ts)

| # | 계열 | 타입명 | 값 수 | 스펙 적합 |
|:---:|:---|:---|:---:|:---:|
| 1 | `jimok` (지목) | `Jimok` | 28 | ✅ |
| 2 | `use_area` (용도지역) | `UseArea` | 21 | ✅ |
| 3 | `use_district` (용도지구) | `UseDistrict` | 11 | ✅ |
| 4 | `use_zone` (용도구역) | `UseZone` | 6 | ✅ |
| 5 | `exclusion_kind` (제척 사유) | `ExclusionKind` | 7 | ✅ |
| 6 | `handover_condition` (명도 조건) | `HandoverCondition` | 3 | ✅ |
| 7 | `management_fee_type` (관리비) | `ManagementFeeType` | 2 | ✅ |
| 8 | `cap_rate_basis` (Cap Rate 기준) | `CapRateBasis` | 4 | ✅ |
| 9 | `lease_act_application` (상임법) | `LeaseActApplication` | 2 | ✅ |

### 3.1 Enum 상세값

<details>
<summary>지목 (28종 법정)</summary>

```
전, 답, 과수원, 목장용지, 임야, 광천지, 염전, 대, 공장용지, 학교용지,
주차장, 주유소용지, 창고용지, 도로, 철도용지, 제방, 하천, 구거, 유지,
양어장, 수도용지, 공원, 체육용지, 유원지, 종교용지, 사적지, 묘지, 잡종지
```
</details>

<details>
<summary>용도지역 (21종)</summary>

```
제1종전용주거지역, 제2종전용주거지역, 제1종일반주거지역, 제2종일반주거지역,
제3종일반주거지역, 준주거지역, 중심상업지역, 일반상업지역, 근린상업지역,
유통상업지역, 전용공업지역, 일반공업지역, 준공업지역, 보전녹지지역,
생산녹지지역, 자연녹지지역, 보전관리지역, 생산관리지역, 계획관리지역,
농림지역, 자연환경보전지역
```
</details>

<details>
<summary>기타 enum</summary>

- **용도지구**: 경관지구, 고도지구, 방화지구, 방재지구, 보존지구, 시설보호지구, 취락지구, 개발진흥지구, 특정용도제한지구, 복합용도지구, 미관지구
- **용도구역**: 개발제한구역, 도시자연공원구역, 시가화조정구역, 수산자원보호구역, 입지규제최소구역, 복합용도구역
- **제척 사유**: road_setback, green_buffer, utility_easement, slope_exclusion, river_setback, heritage_buffer, other
- **명도 조건**: succession(승계), eviction(명도), negotiable(협의)
- **관리비 유형**: fixed(정액), actual_cost(실비)
- **Cap Rate 기준**: noi_price, noi_price_deposit, noi_equity, gross_price
- **상임법 적용**: full(전면), partial(일부)
</details>

### 3.2 유틸리티 함수

| 함수 | 설명 |
|:---|:---|
| `isValidEnumValue(family, value)` | 유효성 검증 |
| `getEnumValues(family)` | 전체 값 목록 반환 |
| `getEnumFamilies()` | 전체 계열 목록 반환 |

---

## 4. 슬롯 카탈로그 (86개)

**파일**: [`slots.ts`](../src/domain/ontology/slots.ts)

> 스펙에는 122 슬롯으로 기재되어 있으나, 실제 `SLOT_CATALOG` 배열에는 **86개 슬롯**이 정의됨.
> 차이의 36개는 배열 하위 슬롯(`parcels[].pnu`, `buildings[].floors[]` 등)으로, 별도 인터페이스로 정의됨.

### 4.1 카테고리별 슬롯 분포

| 카테고리 | 슬롯 수 | v0.2 신규 | 비고 |
|:---|:---:|:---:|:---|
| `identity` | 5 | 0 | 주소, PNU, 권역, 상권, 자산유형 |
| `land` | 12 | 8 | 필지목록(배열화), 유효면적, 지목, 제척 |
| `zoning` | 3 | 3 | 용도지역·지구·구역 |
| `building` | 15 | 4 | 건축물목록(배열화), FAR, 여유율 |
| `lease` | 5 | 3 | 임대차단위, 명도, 관리비, 상임법 |
| `financial` | 10 | 2 | 매각가, NOI, Cap Rate |
| `acquisition` | 6 | 6 | 취득세·등록세·중개보수·실사비·VAT |
| `value_growth` | 5 | 5 | 토지비중·지가시나리오·총수익률 |
| `disclosure` | 4 | 4 | DCF·IRR·민감도 공개 설정 |
| `derived` | 3 | 1 | NOI, Cap Rate, 총수익률 |
| **합계** | **86** | **36** | |

### 4.2 슬롯 타입 & 메타데이터

| 타입 | 정의 |
|:---|:---|
| `SlotType` | `'string'│'number'│'boolean'│'date'│'enum'│'array'│'object'` |
| `SlotCategory` | `'identity'│'land'│'building'│'lease'│'financial'│'acquisition'│'value_growth'│'legal'│'disclosure'│'zoning'│'derived'` |

### 4.3 핵심 인터페이스

```typescript
interface SlotDefinition {
  key: string;
  label: string;
  type: SlotType;
  category: SlotCategory;
  required: boolean;
  source: string;              // 수집 출처
  defaultProvenance: ProvenanceTier;
  isNew?: boolean;             // v0.2 신규 여부
  isArrayified?: boolean;      // 배열화된 슬롯 여부
  enumFamily?: string;         // enum 계열명
}

interface AssetDocV2 {
  ontologyVersion: 'v0.2.0';
  parcels: Parcel[];
  buildings: BuildingUnit[];
  slots: Record<string, unknown>;
  provenance: Record<string, ProvenanceTier>;
  dataGrade: string;
  archetypes: string[];
}

interface PublishRecord {
  ontologyVersion: string;     // 'v0.1.0' or 'v0.2.0'
  engineVersion: string;
  snapshot: unknown;           // 발행 시점 IR 전문
  publishedAt: string;
}
```

### 4.4 유틸리티 함수

| 함수 | 설명 |
|:---|:---|
| `getSlotsByCategory(category)` | 카테고리별 슬롯 조회 |
| `getNewSlots()` | v0.2 신규 슬롯 조회 |
| `getArrayifiedSlots()` | 배열화 슬롯 조회 |
| `getRequiredSlots()` | 필수 슬롯 조회 |
| `getSlotCount()` | 총/신규/필수 슬롯 수 |

---

## 5. 규칙군

### 5.1 P 규칙군 — 토지 유효 규모

**파일**: [`rules/parcel.ts`](../src/domain/ontology/rules/parcel.ts)

| 코드 | 산출 | 수식 | 구현 적합 |
|:---:|:---|:---|:---:|
| P01 | 유효 대지면적 | `Σ(필지면적 × 지분) − Σ(제척면적 where affectsFAR)` | ✅ |
| P02 | 유효 용적률 | `용적률 산정 연면적 ÷ 유효 대지면적` | ✅ |
| P03 | 제척 영향도 | `제척 면적 ÷ 대장 대지면적 합계` | ✅ |

#### 관련 인터페이스

| 인터페이스 | 필드 수 | 설명 |
|:---|:---:|:---|
| `Parcel` | 6 | `pnu, areaM2, ownershipRatio, jimok?, officialLandPrice?, exclusions?` |
| `LandExclusion` | 4 | `kind, areaM2, affectsFAR, note?` |
| `BuildingUnit` | 6 | `ledgerId?, primaryUse, buildYear, totalFloorAreaM2, farCountedAreaM2, floors, structure?` |
| `FloorArea` | 3 | `floor, areaM2, countedInFAR` |
| `ParcelRuleResult` | 6 | P01~P03 산출 결과 + 제척 상세 |

### 5.2 T 규칙군 — 임대차 법적 지위

**파일**: [`rules/tenancy.ts`](../src/domain/ontology/rules/tenancy.ts)

| 코드 | 판정 | 근거법 | 구현 적합 |
|:---:|:---|:---|:---:|
| T01 | 환산보증금 = 보증금 + 월세×100, 지역기준 대조 | 상임법 제2조 | ✅ |
| T02 | 대항력 — 기본값 `true`, 부정 시 근거 필수 | 제3조 | ✅ |
| T03 | 계약갱신요구권 — 최초 계약일부터 10년, 잔여 산출 | 제10조 | ✅ |
| T04 | 우선변제권 — 환산보증금 이하만 | 제5조 | ✅ |
| T05 | 차임 인상률 5% 상한 — 환산보증금 이하만 | 제11조 | ✅ |
| T06 | 권리금 회수기회 보호 — 환산보증금 무관 적용 | 제10조의3~7 | ✅ |

#### 지역별 환산보증금 기준액

| 지역 | 기준액 | 구현 적합 |
|:---|:---:|:---:|
| 서울 (`seoul`) | 9억원 | ✅ |
| 수도권 과밀억제 (`metro`) | 6.9억원 | ✅ |
| 그 외 (`other`) | 5.4억원 | ✅ |

#### 관련 인터페이스

| 인터페이스 | 필드 | 설명 |
|:---|:---|:---|
| `LeaseUnitInput` | `floor, tenantType?, depositKrw, monthlyRentKrw, leaseStartDate?, opposingPowerOverride?, opposingPowerEvidence?` | 임대차 단위 입력 |
| `TenancyResult` | `convertedDeposit, isProtected, opposingPower, renewalRightRemaining, priorityRepayment, rentCapApplied, premiumProtection, increaseHeadroom, violations` | T01~T06 판정 결과 |

---

## 6. 제약 사항 (C13~C22)

스펙 문서에 정의된 10개 제약:

| 코드 | 제약 | 위반 시 | 구현 위치 |
|:---:|:---|:---:|:---|
| C13 | 유효 대지면적 ≤ Σ 대장 대지면적 | 발행 차단 | `parcel.ts` (P01 로직에 내재) |
| C14 | 용적률 산정 연면적 ≤ 연면적 | 발행 차단 | `parcel.ts` (P02 입력 검증) |
| C15 | 환산보증금 = 보증금 + 월세 × 100 | 자동 정정 | `tenancy.ts` (T01) |
| C16 | 모든 Cap Rate에 basis 존재 | 발행 차단 | `quality-gates-v02.ts` (G10) |
| C17 | 총수익률 표시 시 하방 시나리오 존재 | 발행 차단 | `quality-gates-v02.ts` (G11) |
| C18 | 전용면적 ≤ 계약면적 | 경고 | `quality-gates-v02.ts` (G12) |
| C19 | Σ 층별 바닥면적 = 연면적 (±0.5%) | 경고 | 미구현 (P 규칙 영역) |
| C20 | 갱신요구권 잔여 = max(0, 10 − 경과) | 자동 정정 | `tenancy.ts` (T03) |
| C21 | 파생값 provenance = 합성 규칙 산출값 | 발행 차단 | `provenance.ts` (합성 함수) |
| C22 | 시나리오 지표 반드시 `assumed` | 발행 차단 | `provenance.ts` (SCENARIO_SCORE) |

---

## 7. NLG 마스크 (M13~M24)

스펙 문서에 12종 정의:

| ID | 적용 대상 | 마스크 요약 |
|:---:|:---|:---|
| M13 | Cap Rate 비교 | 기준별 Cap Rate 차이 서술 |
| M14 | 총수익률 시나리오 | 지가변동·현금흐름·자본이득 서술 |
| M15 | 레버리지 경고 | 대출 활용 시 상승/하락 배수 경고 |
| M16 | 환산보증금 판정 | 상임법 적용 범위 서술 |
| M17 | 대항력+갱신권 | 대항력·갱신요구권 잔여 서술 |
| M18 | 비보호 호실 | 시세 조정 여지 서술 |
| M19 | 제척 영향 | 유효 대지면적 감소 서술 |
| M20 | 유효 용적률 | 조례상한 대비 여유 서술 |
| M21 | Zoning 필터 | 매수목적별 확인사항 서술 |
| M22 | 등급 상승 | 자료 보강 후 등급 변경 서술 |
| M23 | 최약 고리 | 파생값의 가장 낮은 신뢰도 입력 서술 |
| M24 | 시나리오 경고 | 미래 가정 기반 수치임을 자동 부착 |

---

## 8. 자산 유형 온톨로지 (Asset Ontology Bridge)

**파일**: [`asset-ontology.ts`](../src/domain/building/asset-ontology.ts) (96줄)

### 8.1 자산유형 (8종)

```typescript
type AssetType = 'office' | 'retail' | 'logistics' | 'residential'
              | 'mixed_use' | 'land' | 'hotel' | 'industrial';
```

### 8.2 등급 가중치 (자산유형별)

| 슬롯 | office | retail | logistics | land | 비고 |
|:---|:---:|:---:|:---:|:---:|:---|
| address | 1.0 | 1.0 | 1.0 | 1.5 | 토지는 주소 가중치 높음 |
| askingPriceKrw | 1.0 | 1.0 | 1.0 | 1.5 | |
| grossAnnualIncomeKrw | 1.5 | 1.5 | 1.0 | 0.0 | 토지는 수입 무관 |
| monthlyRentKrw | 1.5 | 1.5 | 1.0 | 0.0 | |
| zoningRegion | 0.5 | 1.0 | 1.0 | 1.5 | 토지는 용도지역 중요 |

---

## 9. 크로스 레퍼런스 (온톨로지 소비자)

| 소비 파일 | 임포트 대상 | 용도 |
|:---|:---|:---|
| `asset/grade-engine.ts` | `AssetType`, `getGradeWeights` | 자산 등급 산정 |
| `building/asset-ontology.ts` | `ProvenanceTier` | 슬롯별 provenance 태깅 |
| `building/derived-enricher.ts` | (간접) 슬롯 키 참조 | 파생 재무지표 계산 |
| `building/mobile-im/lease-precise.ts` | (T 규칙 입력) | 정밀 렌트롤 인터페이스 |
| `building/mobile-im/quality-gates-v02.ts` | (C16~C18 구현) | 품질 게이트 검증 |
| `pipeline/produce-request.ts` | `ontologyVersion` | IM 제작 요청 시 버전 핀 |

---

## 10. 스펙 대비 적합성 종합

### 10.1 파괴적 변경 4건 적합성

| # | 변경 | 스펙 | 구현 | 적합 |
|:---:|:---|:---|:---|:---:|
| 1 | 필지·건축물 배열화 | `Parcel[]`, `BuildingUnit[]` | ✅ `parcels: Parcel[]`, `buildings: BuildingUnit[]` | ✅ |
| 2 | Provenance 4→5 tier | `seller` 신설 (0.65) | ✅ 5-tier 구현 완료 | ✅ |
| 3 | 파생값 합성 규칙 | additive/ratio/scenario | ✅ 3종 합성 함수 | ✅ |
| 4 | R10→T 규칙군 | T01~T06 | ✅ 6개 규칙 구현 | ✅ |

### 10.2 확장 변경 4건 적합성

| # | 변경 | 스펙 | 구현 | 적합 |
|:---:|:---|:---|:---|:---:|
| 5 | Cap Rate 4기준 파라미터화 | 4종 basis enum | ✅ `CAP_RATE_BASIS` 4값 | ✅ |
| 6 | Enum 9계열 추가 | 9계열 82값 | ✅ 9계열 구현 | ✅ |
| 7 | 제약 C13~C22 | 10개 제약 | ⚠️ C19 미구현 (층별면적 합 검증) | ⚠️ |
| 8 | NLG 마스크 M13~M24 | 12종 템플릿 | ℹ️ 스펙 정의만, 런타임 마스크 엔진 별도 | ℹ️ |

### 10.3 P 규칙군 적합성

| 코드 | 수식 (스펙) | 구현 | 적합 |
|:---:|:---|:---|:---:|
| P01 | `Σ(면적×지분) − Σ(제척 where affectsFAR)` | `evaluateParcelRules()` L94~107 | ✅ |
| P02 | `FAR산정면적 ÷ 유효면적` | L110~116 | ✅ |
| P03 | `제척면적 ÷ 대장면적합` | L119~123 | ✅ |

### 10.4 T 규칙군 적합성

| 코드 | 판정 (스펙) | 구현 | 적합 |
|:---:|:---|:---|:---:|
| T01 | 환산보증금 = 보증금 + 월세×100 | L86 | ✅ |
| T02 | 대항력 기본 true, 부정 시 근거 필수 | L91~102 | ✅ |
| T03 | 갱신권 = max(0, 10 − 경과년수) | L105~113 | ✅ |
| T04 | 우선변제권 = 환산보증금 이하 | L116 | ✅ |
| T05 | 차임인상 5% 상한 = 환산보증금 이하 | L119 | ✅ |
| T06 | 권리금 보호 = 환산보증금 무관 적용 | L122 | ✅ |

---

## 11. 발견 사항 & 개선 제안

### 11.1 ⚠️ 주의 사항

| # | 항목 | 상세 | 심각도 |
|:---:|:---|:---|:---:|
| 1 | C19 미구현 | 층별 바닥면적 합 = 연면적 (±0.5%) 검증 로직 없음 | LOW |
| 2 | 스펙 슬롯 수 불일치 | 스펙 "122 슬롯" vs 실제 SLOT_CATALOG 86개. 배열 하위 슬롯 36개가 인터페이스로 분산 정의되어 있어 카탈로그 수로 합산하면 일치하나, 명시적이지 않음 | INFO |
| 3 | ENUM_REGISTRY 불완전 | 스펙은 v0.1 14계열 + v0.2 9계열 = 23계열이나, `ENUM_REGISTRY`에는 v0.2 9계열만 등록. v0.1 14계열은 별도 관리 | INFO |
| 4 | NLG 마스크 런타임 | M13~M24는 스펙에 문자열 템플릿으로만 정의. 런타임 마스크 렌더 엔진은 온톨로지 모듈 외부에 위치할 것으로 예상 | INFO |

### 11.2 ✅ 강점

- **5-Tier Provenance**: seller 분리로 책임 소재 명확화
- **파생값 합성 규칙**: 시나리오 지표를 구조적으로 `assumed` 강제 (C22)
- **T02 설계**: 대항력 기본값 true — 매수자 보호 우선 설계
- **마이그레이션 헬퍼**: `migrateProvenanceTier()` 함수로 v0.1→v0.2 전환 자동화
- **PublishRecord**: 발행 이력 Pin으로 과거 IM 재현성 보장

---

## 12. 버전 정보

```
온톨로지 버전: v0.2.0
ONTOLOGY_VERSION 상수: 'v0.2.0' (index.ts L100)
스펙 문서 최종 수정: 2026-08-03
코드 총 줄 수: 935줄 (6개 파일)
```
