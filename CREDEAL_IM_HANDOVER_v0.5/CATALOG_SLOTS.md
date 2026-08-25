# 슬롯 · enum 카탈로그 (정본)

> 온톨로지 v0.5의 **슬롯 정의 단일 정본**입니다. 다른 문서는 참조만 하며 값을 복제하지 않습니다.
> 구조·원칙은 `ONTOLOGY_V0.5_SPEC.md`가 소유합니다.
> **필지·제척 계산식(P 코드군)은 `CATALOG_RULES.md` §2.2가 소유합니다** — v0.5에서 폐기 문서로부터 회수했습니다.

| | |
|---|---|
| **온톨로지** | **v0.5.0** |
| **Core 슬롯군** | **9** |
| **Pack 슬롯군** | **10** |
| **enum 계열** | **31** |
| **최종 수정** | 2026-08-25 |

### v0.5 변경 요약

| 변경 | 내용 |
|---|---|
| **소유 참조 회수** | [HIST] 폐기 문서(`IM_PRECISION_SPEC` · `ONTOLOGY_V0.3_SPEC`)를 소유자로 지목하던 3건을 살아 있는 정본으로 되돌림 |
| **`Provenance` 5종 → 9종** | 저장값과 표시 티어를 분리 (§1.1~1.2) |
| **`SourceTier` 6단 신설** | S1 · S2a · S2b · S3 · S4 · S5 (§1.2) |
| **§4 매트릭스 축 교체** | 폐기된 `AssetClass` → `investmentPosture` 5종. `operating` · `trading` 열 신설 |
| **Pack 3종 정의 추가** | `residential_spec` · `sectional_spec` · `hospitality_spec` — 선언만 있고 정의가 없었음 |
| **Pack 2종 신설** | `holding_history`(trading L축) · `operating_performance`(운영형 일반) — **축은 있는데 담을 그릇이 없었음** |
| **Core 개수 정정** | 헤더 선언 8 → 실측 **9** |
| **라벨 교정** | `BuyerPurpose` "밸류애드" → **"가치 상승 여력"** (금지어) |

---

## 1. 공통 타입

### 1.1 `Provenance` — 저장값 (9종)

v0.4까지 5종이었고 **저장값과 표시값을 겸했습니다.** 그래서 "공공 API 원시"와
"공공 API를 중개인이 보강한 값"이 똑같이 `public` 이었습니다. 정확도가 다른데
배지가 같으면 책임 소재가 흐려집니다.

```ts
export const Provenance = z.enum([
  'registry',    // 공부 — 건축물대장 · 등기부 · 토지대장
  'public_api',  // 공공 API 원시 — V-World · 실거래가
  'broker_aug',  // 공공 API + 중개인 보강              🆕
  'expert',      // 전문가 — 감정평가 · 구조진단
  'ledger',      // 원장 — 임대차 원장 · 관리비 내역     🆕
  'seller',      // 매도인 진술
  'broker',      // 중개인 진술
  'derived',     // 파생 — 계산 결과                   🆕
  'assumed',     // 가정
]);

export const Valued = z.object({
  value: z.union([z.number(), z.string()]),
  unit: z.string().optional(),
  provenance: Provenance,
  inputs: z.array(z.string()).optional(),  // 🆕 derived 일 때 필수 — 최약 고리 계산용
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

### 1.2 `SourceTier` — 표시 티어 (6단) 🆕

`D19` §1이 소유하던 6단 등급을 온톨로지로 올렸습니다. **출처 등급은 포스처와 무관합니다.**

| 티어 | 지면 표기 | Provenance | 신뢰도 |
|---|---|---|---:|
| **S1** | 공부 | `registry` | 1.00 |
| **S2a** | 공공 | `public_api` | 0.95 |
| **S2b** | 공공+보강 | `broker_aug` | 0.80 |
| **S3** | 자료·진술 | `expert` / `ledger` / `seller` / `broker` | 0.95 / 0.70 / 0.65 / 0.60 |
| **S4** | 파생 | `derived` | **최약 고리 승계** |
| **S5** ◇ | 가정 | `assumed` | 0.30 |

```ts
export function confidenceOf(v: Valued): number {
  if (v.provenance !== 'derived') return BASE_CONFIDENCE[v.provenance];
  if (!v.inputs?.length) throw new OntologyViolation('C21', '파생값에 inputs 가 없습니다');
  return Math.min(...v.inputs.map(k => confidenceOf(SLOT[k])));
}
```

> **S4가 자기 신뢰도를 갖지 않는 것이 요점입니다.** 계산 결과에 입력보다 높은 등급을
> 붙이는 것을 타입 수준에서 막습니다. 제약 C21과 같은 취지입니다.

### 1.3 수집 경로 → `Provenance` 🆕

> [HIST] 이 표는 폐기된 `IM_DATA_PIPELINE.md` §2에 있었습니다. `public` → `registry` /
> `public_api` 분할의 **유일한 근거**가 무덤에 있는 상태였으므로 v0.5에서 회수했습니다.

| 수집 경로 | Provenance | 티어 | 대표 슬롯 |
|---|---|---|---|
| 건축물대장 (세움터) | `registry` | S1 | 연면적 · 용적률 산정 연면적 · 층별 개요 · 사용승인일 · 위반건축물 |
| 등기부등본 | `registry` | S1 | 채권최고액 · 소유권 · 압류 · 신탁 · 호실별 대지권 |
| 토지대장 · 지적도 | `registry` | S1 | 필지 면적 · 지목 · 공유 지분 |
| V-World 토지이용계획 | `public_api` | S2a | 용도지역 · 용도지구 · 용도구역 · 타법 지정 |
| 개별공시지가 API | `public_api` | S2a | ㎡당 공시지가 |
| 국토부 실거래가 API | `public_api` | S2a | 비교사례 (지번 마스킹 — §2.9 주의) |
| 공공 API + 중개인 보정 | `broker_aug` | S2b | 집합건물 대지면적 · 마스킹된 지번 · 누락 층수 |
| 감정평가서 · 구조진단 | `expert` | S3 | 감정가 · 잔존 수명 |
| 임대차 원장 · 관리비 내역 | `ledger` | S3 | 호실별 보증금·월세·관리비 |
| 매도인 제공 자료 | `seller` | S3 | 실 대출 잔액 · 명도 협의 상황 |
| 중개인 입력 | `broker` | S3 | 제척 면적 · 매도 사유 · 명도 판단 |
| 계산 | `derived` | S4 | 유효 대지 · 유효 용적률 · 환산보증금 · 수익률 |
| 가정 | `assumed` | S5 ◇ | 공사비 단가 · 지가 변동률 · 시장 공실률 |

> 🔴 **실거래가 API는 지번이 마스킹되어 옵니다** (`서울 영등포구 당산동3가 5**`).
> 중개인이 지번을 채우면 `broker_aug`(S2b)로 승격되며, 채우기 전에는 비교사례를
> "인근 실거래"로만 표기하고 개별 물건으로 특정하지 않습니다.

마이그레이션 절차는 `ONTOLOGY_V0.5_SPEC.md` §5.3. **자동 변환하지 않습니다** —
판단이 안 서는 슬롯은 `public_api`(낮은 쪽)로 둡니다.

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

파생 — **`P01~P04`** (`CATALOG_RULES.md` §2.2가 소유)

| 슬롯 | 산식 |
|---|---|
| `ledgerArea` | Σ parcel.area |
| `excludedArea` | Σ exclusion.area where affectsFAR |
| `effectiveArea` | Σ (area × 지분) − excludedArea |

> 🔴 **v0.5에서 주인을 되돌렸습니다.** 이 산식은 폐기된 `IM_PRECISION_SPEC.md`에
> 묶여 있었고, 승계 문서에 옮겨지지 않아 다필지·제척 처리가 통째로 유실됐습니다
> (`IM_PARCEL_GAP.md`). 슬롯 정의만 살아 있고 계산식이 무덤에 있으면 이런 일이 납니다.

`shared` 인데 지분이 없으면 **계산하지 않고 예외를 던집니다.** 지분 미상을 100%로
가정하면 대지면적이 과대 계상되고 용적률 여유가 실제보다 크게 나옵니다.

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

표준 모드와 정밀 모드 두 형태입니다.

**전환 조건** — 셋 중 하나라도 참이면 정밀 모드를 요구합니다.

| 조건 | 왜 |
|---|---|
| 호실 수 ≥ 6 | 호실이 많을수록 공용부 안분·관리비 편차가 커집니다 |
| 갱신요구권 판정이 필요 | `firstContractDate` 없이는 T 규칙군 전체가 판정 불가입니다 |
| 등급 목표가 A | L축 R2 이상에 정밀 렌트롤이 필요합니다 (`ONTOLOGY_V0.5_SPEC.md` §6.2) |

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

### 3.6 `residential_spec` — 주거 스펙 (다가구 · 다세대 · 오피스텔) 🆕

> **v0.4에서 선언만 하고 정의하지 않았습니다.** `CATALOG_ASSET_TYPES.md` §7이
> "상세 슬롯 정의는 `CATALOG_SLOTS.md`" 라고 가리켰는데 여기에 없었습니다.
> 포인터는 있고 가리키는 곳이 비어 있는 것은 폐기 문서 참조와 같은 실패입니다.

```ts
export const ResidentialSpec = z.object({
  unitCount: z.number(),
  unitMix: z.array(z.object({
    type: z.string(),                 // '원룸' | '1.5룸' | '투룸' …
    count: z.number(),
    exclusiveArea: z.number(),
  })),
  jeonseCount: z.number(),            // 전세 호실 수
  monthlyCount: z.number(),           // 월세 호실 수
  jeonseDepositTotal: Money,
  parkingPerUnit: z.number(),
  separateMeter: z.boolean(),         // 개별 계량기
  illegalExtension: z.boolean(),      // 옥탑·베란다 확장 등
  illegalRegistered: z.boolean().nullable(),  // 위반건축물 대장 등재 — ✓공부
});
```

**`illegalRegistered` 가 결정적입니다.** 위반건축물로 등재되면 **매수자 대출이 막힙니다.**
`illegalExtension`(현황)과 `illegalRegistered`(대장 등재)는 다릅니다 — 증축이 있어도
등재 전이면 대출은 나옵니다. 미확인 시 제약 C29가 대출 시나리오를 억제합니다.

전세 비중이 높으면 **승계 보증금이 실투자금을 크게 줄이는 대신 만기 반환 부담이
집중**됩니다. `jeonseCount`와 `jeonseDepositTotal`을 나누어 받는 이유입니다.

### 3.7 `sectional_spec` — 구분소유 (지식산업센터 · 집합상가 · 다세대) 🆕

```ts
export const SectionalSpec = z.object({
  isSectional: z.boolean(),
  units: z.array(z.object({
    unitNo: z.string(),
    level: z.string(),
    exclusiveArea: z.number(),
    landShareRatio: z.string(),       // '512.3분의 24.7'
    owner: z.string(),                // 🔴 대외 문서 미표기 (불변조건 14)
    mortgageMax: Money.nullable(),    // 채권최고액
    jointCollateralGroup: z.string().nullable(),
  })),
  ownerCount: z.number(),
  requiresAllOwnersConsent: z.boolean(),
  partialSaleFeasible: z.boolean(),
  landShareSum: z.number(),           // 1.0 검증 — 제약 C30
  managementBody: z.boolean(),        // 관리단 존재
  managementFeeArrears: Money.nullable(),
});
```

> **`jointCollateralGroup` 은 당산동 실증에서 나왔습니다.** 층별 구분등기에 공동담보가
> 걸리면 호실마다 같은 채권최고액이 등기되어, 단순 합산하면 실제의 두 배가 됩니다.
> 초안에서 32억으로 계산했다가 16억으로 정정한 사례입니다 (제약 C32).

`retail_strip`(근린상가)·`knowledge_center`(지식산업센터)는 **30억~500억 밴드의 주력**입니다.
이 Pack이 없으면 해당 자산의 IM은 소유 구조를 서술할 수 없습니다.

### 3.8 `hospitality_spec` — 숙박 운영 (호텔 · 생활형숙박시설) 🆕

```ts
export const HospitalitySpec = z.object({
  roomCount: z.number(),
  roomMix: z.array(z.object({
    type: z.string(), count: z.number(), area: z.number(),
  })),
  operationModel: z.enum(['direct', 'lease', 'management_contract', 'franchise']),
  operatorName: z.string().nullable(),        // 🔴 대외 문서 미표기
  operatorContractExpiry: z.string().nullable(),
  performance: z.array(z.object({             // 연도별 — 3개년 권장
    year: z.number(),
    occupancy: z.number(),                    // OCC %
    adr: Money,                               // 평균 객실 단가
    revpar: Money,                            // = OCC × ADR (파생)
    grossRevenue: Money,
    gop: Money,                               // 영업총이익
    gopMargin: z.number(),
  })),
  seasonalityNote: z.string().nullable(),
  fnbIncluded: z.boolean(),
  landUseLegality: z.enum(['clear', 'check_required', 'violation']).nullable(),
});
```

> **`landUseLegality` 는 생활형숙박시설 전용 확인 항목입니다.** 주거용 사용은 원칙적으로
> 불가하고(2021년 이후 단속 강화), 오피스텔 용도변경 요건 미충족 사례가 많아
> **이행강제금 리스크**가 있습니다. `serviced_residence`를 `hotel`과 분리한 이유입니다.

**1개년 실적으로는 계절성을 볼 수 없습니다.** `performance` 3개년 미만이면 등급 L축이
R2에 도달하지 못합니다 (`ONTOLOGY_V0.5_SPEC.md` §6.2).

GOP 기준 수익률은 **NOI 기준과 나란히 놓지 않습니다** — 제약 C31. GOP는 운영 인건비·
마케팅비를 차감한 뒤의 값이라 같은 지표로 읽으면 오독합니다.

### 3.9 `holding_history` — 보유 이력 (단기매매형) 🆕 v0.5

> 🔴 **`trading` 포스처의 L축 슬롯입니다.** 이것이 없어서 `trading` 은 중개인이
> 무엇을 채워도 L=R0, 즉 **구조적으로 D등급**이었습니다. 축은 정의했는데 담을 그릇이
> 없었던 것입니다 (`ONTOLOGY_V0.5_SPEC.md` §6.2).

```ts
export const HoldingHistory = z.object({
  acquiredDate: z.string(),                   // ✓등기부
  acquiredPrice: Money.nullable(),            // ▲등기부 거래가액 (2006년 이후만)
  holdingMonths: z.number(),                  // 파생
  priorTransfers: z.number(),                 // 최근 10년 소유권 이전 횟수 — ✓등기부
  sellerMotive: SellerMotive,                 // enum §5.13 — ▲중개인
  motiveNote: z.string().nullable(),
  priorListingMonths: z.number().nullable(),  // 이전 매물 노출 기간
  priceRevisions: z.array(z.object({          // 호가 조정 이력
    date: z.string(), price: Money,
  })),
  exitConstraints: z.array(z.string()),       // 전 소유자 동의 · 인허가 승계 등
});
```

**`sellerMotive` 는 대외 문서에 그대로 싣지 않습니다.** 상속·채무 정리 같은 사유는
매도인의 사생활이고, 협상력에 직접 영향을 줍니다. IM에는 **매도 시급성**만
`high`/`medium`/`low` 로 환산해 표기하고, 원문은 pro 단계에서만 노출합니다.

> **`priorTransfers` 와 `priceRevisions` 가 실질입니다.** 단기매매 매수자가 묻는 것은
> "이 물건이 왜 아직 안 팔렸는가"입니다. 호가를 세 번 내렸는데 안 팔렸다면
> 가격이 문제가 아니라 **출구에 제약이 있다**는 신호입니다 (`R-TRD-04`).

`acquiredPrice` 는 2006년 실거래가 신고제 이전 취득분에는 **없습니다.**
없는 것을 0으로 쓰지 않고 "확인 필요"로 둡니다.

### 3.10 `operating_performance` — 운영 실적 (운영형 일반) 🆕 v0.5

> `hospitality_spec` 에서 분리했습니다. **요양시설·주차장·골프연습장은 객실이
> 없습니다.** 운영형의 L축을 숙박 스펙에 묶어 두면 그 자산들이 등급을 못 받습니다.

```ts
export const OperatingPerformance = z.object({
  unitKind: OperatingUnitKind,                // enum §5.14 — 객실 · 병상 · 면 · 타석 · 좌석
  unitCount: z.number(),
  years: z.array(z.object({                   // 3개년 권장
    year: z.number(),
    utilization: z.number(),                  // 가동률 % — 업종 불문 공통
    unitRevenue: Money,                       // 단위당 평균 매출 (ADR 등가)
    grossRevenue: Money,
    operatingCost: Money,
    gop: Money,
    gopMargin: z.number(),
    provenance: Provenance,                   // 🔴 연도마다 다릅니다 — 세무자료 vs 진술
  })),
  seasonalityNote: z.string().nullable(),
  operationModel: OperationModel,             // §3.8 과 공유
  operatorName: z.string().nullable(),        // 🔴 대외 문서 미표기 (불변조건 14)
  operatorContractExpiry: z.string().nullable(),
  licenceKind: z.string().nullable(),         // 요양기관 지정 · 체육시설 등록 등
  licenceTransferable: z.boolean().nullable(),
});
```

**`provenance` 를 연도마다 받는 것이 요점입니다.** 최근 1개년은 세무 자료(S3 `ledger`),
직전 2개년은 매도인 진술(S3 `seller`)인 경우가 흔합니다. 세 해를 한 배지로 묶으면
가장 약한 해의 신뢰도가 감춰집니다.

> **`licenceTransferable` 이 거래를 좌우합니다.** 요양시설·체육시설은 인허가가
> 승계되지 않으면 매수자가 영업을 이어받을 수 없습니다. 미확인이면 운영 수익률을
> 제시할 근거가 없습니다.

`hospitality_spec` 과 **함께 쓸 수 있습니다** — 호텔은 객실 구성(전자)과 실적(후자)을
둘 다 받습니다. 중복이 아니라 층이 다릅니다.

---

## 4. 포스처별 슬롯군 필요도

> 🔴 **v0.5에서 축을 교체했습니다.** v0.4까지 열이 `income · owner_occupied ·
> development · land · logistics` 였는데, `land`·`logistics` 는 **폐기된 `AssetClass`의
> 잔재**로 v0.4에서 `assetType`으로 이동한 값입니다. 그 결과 v0.4에서 신설한
> `operating` · `trading` 은 **필수 슬롯이 정의된 적이 없었습니다.**

`investmentPosture` 5종이 열입니다. `assetType` 의존은 §4.2가 따로 다룹니다.

| 슬롯군 | income | owner_occupied | development | operating | trading |
|---|:-:|:-:|:-:|:-:|:-:|
| `land_parcel` | ● | ● | ◎ | ● | ◎ |
| `building_basic` | ◎ | ◎ | ● | ◎ | ● |
| `zoning` | ● | ● | ◎ | ● | ◎ |
| `road_access` | ● | ◎ | ● | ● | ● |
| `lease_roll` | ◎ | △ | △ | ✗ | △ |
| `lease_legal` | ◎ | △ | ◎ | ✗ | △ |
| `financial_input` | ◎ | ● | ● | ◎ | ● |
| `title_encumbrance` | ● | ● | ● | ● | ◎ |
| `market_comp` | ● | ● | ◎ | ● | ◎ |
| `physical_spec` | △ | ◎ | — | ● | ✗ |
| `development_plan` | △ | ✗ | ◎ | ✗ | △ |
| `vacate_plan` | △ | △ | ◎ | △ | ✗ |
| `occupancy_plan` | ✗ | ◎ | ✗ | ✗ | ✗ |
| `permit_risk` | ✗ | ✗ | ◎ | △ | △ |
| **`residential_spec`** | △ | ✗ | △ | ✗ | △ |
| **`sectional_spec`** | △ | △ | ✗ | △ | ● |
| **`hospitality_spec`** | ✗ | ✗ | ✗ | ● | ✗ |
| **`operating_performance`** | ✗ | ✗ | ✗ | ◎ | △ |
| **`holding_history`** | △ | ✗ | △ | △ | ◎ |

◎ 필수 · ● 중요 · △ 선택 · ✗ 해당 없음(`not_applicable` 기본값) · — 무관

`✗` 슬롯군은 `not_applicable`로 자동 설정되며, 등급 가중치가 재배분됩니다
(`ONTOLOGY_V0.5_SPEC.md` §6.5).

### 4.1 `operating` · `trading` 열 해설

**`operating` 에서 `lease_roll` 이 `✗` 인 것이 핵심입니다.** 매출이 임대차 계약이 아니라
영업 성과에서 나오므로 렌트롤 자체가 존재하지 않습니다. 대신 `hospitality_spec`(또는
동급 운영 실적)이 필수입니다. `lease_roll` 을 채우라고 요구하면 중개인은 시스템을
쓰지 않게 됩니다.

**`trading` 에서 `market_comp` 와 `title_encumbrance` 가 필수인 것도 같은 이유입니다.**
단기 매매 매수자는 임대수익률을 거의 보지 않습니다. 권역 시세와 **되팔 수 있는가**
(권리 제약·구분소유 구조)가 판단 근거입니다.

### 4.2 `assetType` 이 추가로 강제하는 Pack

포스처 매트릭스와 **별개로** `assetType` 이 Pack을 강제합니다. 둘 중 하나라도
필수면 필수입니다.

| assetType | 강제 Pack |
|---|---|
| `mixed_shop_house` · `multi_household` | `residential_spec` |
| `multi_family` · `officetel` | `residential_spec` · `sectional_spec` |
| `knowledge_center` | `sectional_spec` · `physical_spec` |
| `retail_strip` | `sectional_spec` |
| `hotel` | `hospitality_spec` |
| `serviced_residence` | `hospitality_spec` · `sectional_spec` |
| `logistics` · `factory_building` · `medical_facility` · `special_use` | `physical_spec` |
| `bare_land` · `raw_land` | `development_plan` · `permit_risk` |

정본은 `CATALOG_ASSET_TYPES.md` §2. 이 표는 참조 사본이며 값이 어긋나면 §2가 이깁니다.

---

## 5. enum 계열 (**31종**)

> **전 계열은 `ENUM_REGISTRY`에 등록되어야 합니다.** 미등록 enum은 버전 Pin 대상에서
> 빠져 **과거 IM 재현 검증을 통과해 버립니다** — 값이 바뀌었는데 "동일하다"고 나옵니다.
> CI가 차단합니다. 등재 절차는 §7.1.

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
| 11 | `CapRateBasis` | **7** | 라벨·별칭은 `CATALOG_LEXICON.md` §2.3이 소유 |
| 12 | `LeaseActApplication` | 2 | 전면 · 일부 |
| 13 | `BuyerPurpose` (매수 목적) | 5 | 실사용 · 임대수익 · **가치 상승 여력** · 개발 · 자산배분 |
| 14 | ~~`AssetClass`~~ → **`InvestmentPosture`** | **5** | v0.4에서 대체. `CATALOG_ASSET_TYPES.md` §3 |
| 15 | `RampType` 🆕 | 3 | 직램프 · 선회 · 없음 |
| 16 | `TemperatureZone` 🆕 | 4 | 상온 · 저온 · 냉동 · 복합 |
| 17 | `PermitKind` 🆕 | 12 | 고도제한 · 일조 · 주차 · 기부채납 · 개발행위 · 농지전용 · 산지전용 · 문화재지표 · 교통영향 · 환경영향 · 접도구역 · 기반시설 |
| 18 | `SlotState` | 9 | §1.1 |
| 19 | `Provenance` | **9** | §1.1 — v0.5에서 5→9 |
| 20 | `Grade` | 4 | A · B · C · D |
| 21 | `Tier` | 2 | basic · pro |
| 22 | `Impact` (diff) | 3 | cosmetic · material · critical |
| 23 | `MetricDisclosure` | 3 | primary · secondary · onRequest |
| **24** | `BuildingUse` (법정 용도) 🆕 | **29** | 건축법 시행령 별표1. `CATALOG_ASSET_TYPES.md` §1 |
| **25** | `AssetType` (시장 유형) 🆕 | **17** | `CATALOG_ASSET_TYPES.md` §2 |
| **26** | `LeaseUnitLegalBasis` | **2** | commercial · residential. `CATALOG_RULES.md` §2.1 |
| **27** | `SourceTier` 🆕 | **6** | S1 · S2a · S2b · S3 · S4 · S5. §1.2 |
| **28** | `OperationModel` 🆕 | **4** | direct · lease · management_contract · franchise. §3.8 |
| **29** | `LexiconScope` 🆕 | **3** | reader_facing · internal_label · engineering. `CATALOG_LEXICON.md` §7.1 |
| **30** | `SellerMotive` 🆕 | **7** | 상속 · 채무정리 · 자산재배분 · 사업정리 · 차익실현 · 이전 · 기타. §3.9 |
| **31** | `OperatingUnitKind` 🆕 | **6** | 객실 · 병상 · 주차면 · 타석 · 좌석 · 기타. §3.10 |

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
   v0.5  Pack 슬롯군 3종 정의            +26  → 189
         (residential_spec 9 · sectional_spec 8 · hospitality_spec 9
          — 중첩 배열 내부 필드는 세지 않습니다)
         Valued.inputs 1                 +1   → 190
         Pack 2종 신설                    +21  → 211
         (holding_history 10 · operating_performance 11)
```

Pack 슬롯은 **해당 자산유형·포스처에서만 요구**되므로 중개인 입력 부담은 늘지 않습니다.
수익형 물건은 여전히 122슬롯 범위입니다.

> v0.5의 +33은 **새 요구가 아니라 이미 요구하던 것의 정의**입니다.
> `CATALOG_ASSET_TYPES.md` §7이 세 Pack을 선언하고 있었는데 슬롯이 정의되지 않아
> 중개인이 무엇을 입력해야 하는지 알 수 없었습니다.

---

## 7. 참고

| 주제 | 정본 |
|---|---|
| 구조 · 원칙 · 층위 · 등급 | `ONTOLOGY_V0.5_SPEC.md` |
| 규칙 · 제약 · 게이트 · **필지 계산식(P)** · **교차검증(X)** | `CATALOG_RULES.md` |
| 3축 값 · 조합 매트릭스 · 강제 Pack | `CATALOG_ASSET_TYPES.md` |
| 어휘 · 금지어 · 표기 | `CATALOG_LEXICON.md` |
| 수집 방법 · 자동화 가능 여부 | `IM_DATA_PIPELINE.md` §2 |
| 변경 절차 | `ONTOLOGY_GOVERNANCE_SPEC.md` |

> **[HIST] 폐기 문서는 참고로도 소유자로 적지 않습니다.** `IM_PRECISION_SPEC.md` ·
> `ONTOLOGY_V0.3_SPEC.md` 는 재현용 보존본이며, 여기서 규칙을 읽지 마십시오.
