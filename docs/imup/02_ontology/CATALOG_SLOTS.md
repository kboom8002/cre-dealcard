# 슬롯 · enum 카탈로그 (정본)

> 온톨로지 v0.3의 **슬롯 정의 단일 정본**입니다. 다른 문서는 참조만 하며 값을 복제하지 않습니다.
> 구조·원칙은 `ONTOLOGY_V0.3_SPEC.md`, 계산식은 `IM_PRECISION_SPEC.md`가 소유합니다.

| | |
|---|---|
| **온톨로지** | v0.3.0 |
| **Core 슬롯군** | 8 |
| **Pack 슬롯군** | 5 |
| **enum 계열** | 23 |
| **최종 수정** | 2026-08-03 |

---

## 1. 공통 타입

```ts
export const Provenance = z.enum(['public', 'expert', 'seller', 'broker', 'assumed']);

export const Valued = z.object({
  value: z.union([z.number(), z.string()]),
  unit: z.string().optional(),
  provenance: Provenance,
  band: z.string().optional(),        // tier=basic에서 value 대신 노출
  derivation: z.string().optional(),  // 계산 유래를 사람이 읽을 수 있게
  weakestLink: z.string().optional(), // 파생값의 최약 고리
});

export const Money = z.number().int();          // 원 단위
export const SlotState = z.enum([
  'pending', 'fetching', 'fetched', 'manual_required',
  'broker_entered', 'seller_declared', 'verified', 'failed', 'not_applicable',
]);
```

---

## 2. Core 슬롯군 (자산군 무관)

### 2.1 `land_parcel` — 필지

```ts
export const Parcel = z.object({
  pnu: z.string().length(19),
  address: z.string(),
  jimok: Jimok,                       // enum §5.1
  area: z.number(),                   // ㎡ (대장)
  officialPrice: Money,               // 개별공시지가
  officialPriceUnit: z.enum(['per_sqm', 'per_pyeong']),
  ownership: z.enum(['sole', 'shared']),
  shareNumerator: z.number().nullable(),
  shareDenominator: z.number().nullable(),
  exclusions: z.array(ExclusionItem),
});

export const ExclusionItem = z.object({
  kind: ExclusionKind,                // enum §5.5
  area: z.number(),
  affectsFAR: z.boolean(),
  provenance: Provenance,             // 대개 'broker' — API 수집 불가
  note: z.string().nullable(),
});
```

파생 — `P01~P03` (`CATALOG_RULES.md` §2.3)

| 슬롯 | 산식 |
|---|---|
| `ledgerArea` | Σ parcel.area |
| `excludedArea` | Σ exclusion.area where affectsFAR |
| `effectiveArea` | Σ (area × 지분) − excludedArea |

### 2.2 `building_basic` — 건축물

```ts
export const BuildingUnit = z.object({
  name: z.string(),                   // '주건축물 제1동'
  isPrimary: z.boolean(),
  structure: z.string(),
  approvalDate: z.string(),           // YYYY-MM-DD
  violationFlag: z.boolean(),
  floors: z.array(FloorArea),
});

export const FloorArea = z.object({
  level: z.string(),                  // 'B1' | '1F' …
  purpose: z.string(),
  grossArea: z.number(),              // 바닥면적 (평 또는 ㎡ — unit 명시)
  farCountedArea: z.number(),         // 용적률 산정 면적
});
```

**면적 3종을 구분합니다.** 혼동이 가장 잦은 지점입니다.

| 슬롯 | 정의 | 용도 |
|---|---|---|
| `grossArea` | 연면적 — 전체 바닥면적 합 | 건물 규모 표시 |
| `farCountedArea` | 용적률 산정 연면적 (주차 등 제외) | 건축법상 용적률 |
| **`aboveGroundArea`** 🆕 | 지상 연면적 (지하 제외) | **실무의 "실질 용적률"** |

> 잠원동 두원빌딩 사례 — 연면적 2,032.6㎡ / 용적률 산정 2,006.1㎡ / 지상 1,521.6㎡.
> IM 원본의 "실질 용적률 약 247%"는 세 번째 값 기준이었습니다.

### 2.3 `zoning` — 용도지역 · 토지이용계획

```ts
export const ZoningItem = z.object({
  category: z.enum(['use_area', 'use_district', 'use_zone', 'other_law']),
  name: z.string(),
  relevance: z.record(BuyerPurpose, z.enum(['high', 'medium', 'low'])),
  impactNote: z.string().nullable(),
  provenance: Provenance,
});
```

노출 규칙 — `high`는 본문, `medium`은 접기, `low`는 부록. **전체 목록은 항상 부록에 실어 누락 책임을 회피합니다.**

### 2.4 `road_access` — 접면 · 입지

```ts
export const RoadAccess = z.object({
  grade: RoadAccessGrade,             // enum §5.4 — 12분류
  widths: z.array(z.number()),        // ['10M', '9M'] 형태의 접면 도로폭
  shape: LandShape,                   // enum §5.6
  terrain: Terrain,                   // enum §5.7
  stations: z.array(z.object({
    name: z.string(), lines: z.array(z.string()),
    walkMinutes: z.number(), provenance: Provenance,
  })),
  arterialAccess: z.array(z.string()),
});
```

### 2.5 `lease_roll` — 임대차

표준 모드와 정밀 모드 두 형태입니다. 전환 조건은 `IM_PRECISION_SPEC.md` §4.1.

```ts
export const LeaseUnitStandard = z.object({
  level: z.string(), purpose: z.string(),
  exclusiveArea: z.number(),
  deposit: Money, monthlyRent: Money,
  expiryDate: z.string(),
});

export const LeaseUnitPrecise = LeaseUnitStandard.extend({
  unitNo: z.string(),
  contractArea: z.number(),
  managementFee: Money,
  managementFeeType: z.enum(['fixed', 'actual']),
  vatIncluded: z.boolean(),
  firstContractDate: z.string(),      // ★ 갱신요구권 기산점 — OCR 불가
  currentStartDate: z.string(),
  handoverCondition: HandoverCondition,
  rentFreeRemainingMonths: z.number().nullable(),
  arrears: z.enum(['none', 'minor', 'major', 'unknown']),
});
```

> **`firstContractDate`는 계약서 OCR로 나오지 않습니다** (갱신 계약서에 없음). 정밀 모드 진입 시 최우선 입력 필드로 배치합니다. 이 값 없이는 T 규칙군 전체가 판정 불가입니다.

### 2.6 `lease_legal` — 임대차 법적 지위 (파생)

전부 계산 파생입니다. 입력받지 않습니다. 판정 로직은 `CATALOG_RULES.md` §2.2.

| 슬롯 | 산식 |
|---|---|
| `convertedDeposit` | 보증금 + (월 임대료 × 100) |
| `application` | `convertedDeposit ≤ 지역 기준` ? `full` : `partial` |
| `opposingPower` | **기본 true** — 반증 필요 |
| `renewalRightRemainingYears` | `max(0, 10 − 최초계약일 경과년수)` |
| `priorityRepayment` | `application === 'full'` |
| `rentIncreaseCapPct` | `application === 'full'` ? 5 : null |

### 2.7 `financial_input` — 임대료 · 운영경비 · 취득원가

```ts
export const AcquisitionCost = z.object({
  price: Money,
  acquisitionTax: Money,              // 취득세 (표준 4.6%)
  registrationLegal: Money,
  brokerageFee: Money,                // 법정 상한 0.9% 이내
  appraisalDueDiligence: Money,
  vatRefundEstimate: Money,           // 건물분 — 법인·과세사업자
  other: Money,
});

export const ValueGrowth = z.object({
  landRatio: z.number().min(0).max(1).nullable(),
  scenarios: z.object({ downside: z.number(), base: z.number(), upside: z.number() }),
  source: z.enum(['gongsi_dong_3y', 'gongsi_dong_5y', 'transaction_based', 'manual']),
  buildingDepreciation: z.number().nullable(),
});
```

### 2.8 `title_encumbrance` — 권리 · 등기

```ts
export const Title = z.object({
  ownership: z.object({ acquiredYear: z.number(), type: z.string() }),
  seniorMortgageMax: Money,           // 채권최고액 — ✓공부
  actualLoanBalance: Money,           // 실 잔액 — ▲매도인
  seizure: z.boolean(),
  leaseholdRegistration: z.boolean(),
  trust: z.boolean(),
  dischargeCondition: z.string(),
});
```

> **채권최고액(`public`)과 실 잔액(`seller`)은 출처가 다릅니다.** 같은 배지로 묶으면 책임 소재가 흐려집니다.

### 2.9 `market_comp` — 비교사례

```ts
export const Comparable = z.object({
  address: z.string(), useArea: UseArea, date: z.string(),
  price: Money, unitPricePerPyeong: Money,
  note: z.string(), provenance: Provenance,
});
```

---

## 3. Pack 슬롯군 (자산군별) 🆕

`pack_slots JSONB`에 저장됩니다. Core 스키마를 건드리지 않습니다.

### 3.1 `physical_spec` — 물리 스펙 (사옥 · 물류)

```ts
export const PhysicalSpec = z.object({
  // 공통
  standardFloorArea: z.number().nullable(),   // 기준층 면적
  exclusiveRatio: z.number().nullable(),      // 전용률
  ceilingHeight: z.number().nullable(),       // 천장고 (m)
  parkingCount: z.number(),
  // 물류 전용
  clearHeight: z.number().nullable(),         // 유효 층고 (m)
  floorLoad: z.number().nullable(),           // 바닥하중 (t/㎡)
  dockCount: z.number().nullable(),
  dockLeveler: z.boolean().nullable(),
  rampType: RampType.nullable(),              // enum §5.10
  truckTurningRadius: z.number().nullable(),
  powerCapacity: z.number().nullable(),       // kW
  temperatureZone: TemperatureZone.nullable(),// enum §5.11
  // 사옥 전용
  namingRights: z.boolean().nullable(),
  commuteAccessScore: z.number().nullable(),
});
```

물류 벤치마크 (`CATALOG_RULES.md` R-LOG 규칙이 참조)

| 지표 | 기준 | 의미 |
|---|---|---|
| 유효 층고 | 10m 이상 | 랙 단수 (1.5m/단) |
| 바닥하중 | 1.2 t/㎡ 이상 | 자동화 설비 가능 |
| 도크 / 연면적 1,000평 | 2.5 ~ 3.5개 | 회전율 |

### 3.2 `development_plan` — 개발 계획 (개발 · 대지)

```ts
export const DevelopmentPlan = z.object({
  targetUse: z.string(),
  scale: z.string(),
  structure: z.string(),
  farCountedArea: z.number(),
  grossArea: z.number(),
  buildingCoverage: z.number(),
  far: z.number(),
  parking: z.number(),
  constructionCostPerPyeong: Money,
  contingency: Money,
  targetDate: z.string(),
  stackingPlan: z.array(z.object({
    level: z.string(), area: z.number(), use: z.string(),
    rentPerPyeong: Money, monthlyRent: Money, deposit: Money, managementFee: Money,
  })),
});
```

### 3.3 `vacate_plan` — 명도 계획 (개발형 필수) 🆕

```ts
export const VacatePlan = z.object({
  responsibility: z.enum(['seller', 'buyer', 'shared']),
  costIncludedInPrice: z.boolean(),
  estimatedCost: Money,
  byDifficulty: z.object({ high: z.number(), medium: z.number(), low: z.number() }),
  criticalUnits: z.array(z.object({
    unit: z.string(), use: z.string(),
    renewalRightRemainingYears: z.number(),
    keyMoneyRisk: z.enum(['high', 'medium', 'low']),
    reason: z.string(),
  })),
  sellerClaimedMonths: z.number(),
  brokerJudgmentMonths: z.number(),           // ★ 격차를 감추지 않는다
});
```

> **`sellerClaimedMonths`와 `brokerJudgmentMonths`를 분리한 것이 요점입니다.** 매도인 주장과 중개인 판단이 다르면 그 격차 자체를 IM에 싣습니다. 감추면 실사에서 드러나고 딜이 깨집니다.

### 3.4 `occupancy_plan` — 자가 사용 계획 (사옥형) 🆕

```ts
export const OccupancyPlan = z.object({
  headcount: z.number(),
  areaPerHead: z.number(),                    // 평/인
  floorAllocation: z.array(z.object({
    level: z.string(), use: z.string(), area: z.number(),
  })),
  currentLeaseCost: Money.nullable(),         // 현 임차료 — 비교 기준
  currentLeaseExpiry: z.string().nullable(),
  expansionHeadroom: z.number().nullable(),   // 증원 여력 (인)
});
```

### 3.5 `permit_risk` — 인허가 리스크 (개발 · 대지) 🆕

```ts
export const PermitRisk = z.object({
  items: z.array(z.object({
    kind: PermitKind,                         // enum §5.12
    status: z.enum(['clear', 'check_required', 'constraint', 'blocking']),
    note: z.string(),
    estimatedMonths: z.number().nullable(),
  })),
  totalEstimatedMonths: z.number(),
});
```

---

## 4. 자산군별 슬롯군 필요도

| 슬롯군 | income | owner_occupied | development | land | logistics |
|---|:-:|:-:|:-:|:-:|:-:|
| `land_parcel` | ● | ● | ◎ | ◎ | ● |
| `building_basic` | ◎ | ◎ | ● | **✗** | ◎ |
| `zoning` | ● | ● | ◎ | ◎ | ● |
| `road_access` | ● | ◎ | ● | ◎ | ◎ |
| `lease_roll` | ◎ | △ | △ | **✗** | ◎ |
| `lease_legal` | ◎ | △ | ◎ | ✗ | ◎ |
| `financial_input` | ◎ | ● | ● | ✗ | ◎ |
| `title_encumbrance` | ● | ● | ● | ● | ● |
| `market_comp` | ● | ● | ◎ | ◎ | ● |
| `physical_spec` | △ | ◎ | — | ✗ | ◎ |
| `development_plan` | △ | ✗ | ◎ | ◎ | ✗ |
| `vacate_plan` | △ | △ | ◎ | ✗ | △ |
| `occupancy_plan` | ✗ | ◎ | ✗ | ✗ | ✗ |
| `permit_risk` | ✗ | ✗ | ◎ | ◎ | △ |

◎ 필수 · ● 중요 · △ 선택 · ✗ 해당 없음(`not_applicable` 기본값)

`✗` 슬롯군은 `not_applicable`로 자동 설정되며, 등급 가중치가 재배분됩니다 (`ONTOLOGY_V0.3_SPEC.md` §6.3).

---

## 5. enum 계열 (**26종**)

> **전 계열은 `ENUM_REGISTRY`에 등록되어야 합니다.** 미등록 enum은 버전 Pin 대상에서 빠져 과거 IM 재현 검증을 통과해 버립니다. CI가 차단합니다 (`ONTOLOGY_IMPLEMENTATION_GAP.md` §5).

| # | 계열 | 값 수 | 비고 |
|---:|---|---:|---|
| 1 | `Jimok` (지목) | 28 | 전·답·대·잡종지 등 법정 28종 |
| 2 | `UseArea` (용도지역) | 21 | 도시(17) · 관리(3) · 농림(1) · 자연환경보전(1) |
| 3 | `UseDistrict` (용도지구) | 10+ | 경관 · 고도 · 방화 · 미관 등 |
| 4 | `UseZone` (용도구역) | 6 | 개발제한 · 시가화조정 등 |
| 5 | `RoadAccessGrade` (도로접면) | 12 | 광대한면 ~ 맹지 |
| 6 | `LandShape` (형상) | 6 | 정방형 · 세장형 · 사다리 · 부정형 등 |
| 7 | `Terrain` (지세) | 5 | 평지 · 완경사 · 급경사 등 |
| 8 | `ExclusionKind` (제척 사유) | 7 | 계획도로 · 완충녹지 · 공원 · 하천 · 접도구역 · 법면 · 타인지분 |
| 9 | `HandoverCondition` (명도) | 3 | 승계 · 명도 · 협의 |
| 10 | `ManagementFeeType` | 2 | 정액 · 실비 |
| 11 | `CapRateBasis` | **7** | `ONTOLOGY_IMPLEMENTATION_GAP.md` §3 — v0.4에서 3종 추가 |
| 12 | `LeaseActApplication` | 2 | 전면 · 일부 |
| 13 | `BuyerPurpose` (매수 목적) | 5 | 실사용 · 임대수익 · 밸류애드 · 개발 · 자산배분 |
| 14 | ~~`AssetClass`~~ → **`InvestmentPosture`** | **5** | v0.4에서 대체. `CATALOG_ASSET_TYPES.md` §3 |
| 15 | `RampType` 🆕 | 3 | 직램프 · 선회 · 없음 |
| 16 | `TemperatureZone` 🆕 | 4 | 상온 · 저온 · 냉동 · 복합 |
| 17 | `PermitKind` 🆕 | 12 | 고도제한 · 일조 · 주차 · 기부채납 · 개발행위 · 농지전용 · 산지전용 · 문화재지표 · 교통영향 · 환경영향 · 접도구역 · 기반시설 |
| 18 | `SlotState` | 9 | §1 |
| 19 | `Provenance` | 5 | §1 |
| 20 | `Grade` | 4 | A · B · C · D |
| 21 | `Tier` | 2 | basic · pro |
| 22 | `Impact` (diff) | 3 | cosmetic · material · critical |
| 23 | `MetricDisclosure` | 3 | primary · secondary · onRequest |
| **24** | `BuildingUse` (법정 용도) 🆕 | **29** | 건축법 시행령 별표1. `CATALOG_ASSET_TYPES.md` §1 |
| **25** | `AssetType` (시장 유형) 🆕 | **17** | `CATALOG_ASSET_TYPES.md` §2 |
| **26** | `LeaseUnitLegalBasis` 🆕 | **2** | commercial · residential. `CATALOG_RULES.md` §2.1 |

**enum 값 추가는 minor, 의미 변경·삭제는 major입니다.**

`AssetType`·`BuildingUse`는 **추가만 하고 삭제하지 않습니다.** 과거 딜이 참조하며, 값이 사라지면 PublishRecord가 버전을 Pin해도 역직렬화가 깨집니다. 폐기는 `deprecated: true` 플래그로 신규 선택만 막습니다.

---

## 6. 슬롯 수 변화

```
   v0.1  표준 슬롯                       70
   v0.2  배열화 + 정밀 렌트롤 + 신규 6군  +52  → 122
   v0.3  Pack 슬롯군 5종                 +41  → 163
         (physical_spec 16 · development_plan 12
          vacate_plan 7 · occupancy_plan 4 · permit_risk 2)
```

Pack 슬롯은 **해당 자산군에서만 요구**되므로 중개인 입력 부담은 늘지 않습니다. 수익형 물건은 여전히 122슬롯 범위입니다.

---

## 7. 참고

- 구조 · 원칙 — `ONTOLOGY_V0.3_SPEC.md`
- 규칙 · 제약 · 게이트 — `CATALOG_RULES.md`
- 계산식 — `IM_PRECISION_SPEC.md`
- 수집 방법 · 자동화 가능 여부 — `IM_DATA_PIPELINE.md` §2
