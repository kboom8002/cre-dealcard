# CREDEAL 자산군 확장 계획 — 온톨로지 SSoT 고도화

> 수익형 외 **사옥형 · 개발형 · 대지 · 물류**로 IM 작성을 확장하기 위한 아키텍처 결정과 개발 순서.
> 잠원동 두원빌딩(개발형·2필지·명도조건) 역설계에서 드러난 구조적 공백을 출발점으로 합니다.

| | |
|---|---|
| **대상 버전** | 온톨로지 v0.2 → **v0.3** |
| **선행 문서** | `ONTOLOGY_V0.2_SPEC.md` · `IM_PRECISION_SPEC.md` · `IM_역설계분석_잠원동두원빌딩.md` |
| **핵심 결정** | Core 스키마를 분기하지 않고 **Asset Class Pack**으로 확장 |
| **작성일** | 2026-08-03 |

> ### ⚠️ v0.4 반영 안내
>
> **Core/Pack 경계라는 핵심 결정은 v0.4에서도 유효하며, 이 문서의 §4 계산식·§9 개발 순서·공수 산정은 계속 정본입니다.**
> 다만 **`AssetClass`라는 분류 축은 v0.4에서 3축으로 대체**되었습니다. 이 문서에 남은 `assetClass` 표기는 다음으로 읽으십시오.
>
> | 이 문서의 표기 | v0.4 |
> |---|---|
> | `assetClass = development` · `owner_occupied` | **`investmentPosture`** |
> | `assetClass = land` · `logistics` | **`assetType`** (`bare_land`·`raw_land` / `logistics`·`factory_building`) |
> | `AssetClass` enum 정의 (§ 코드 블록) | `CATALOG_ASSET_TYPES.md` §2·§3 |
> | L16~L19 조건 | `CATALOG_RULES.md` §5.2 (재정의됨) |
>
> 정본은 `CATALOG_ASSET_TYPES.md`와 `CATALOG_RULES.md`입니다.

---

## 0. 요약 — 무엇이 문제인가

현 온톨로지는 **수익형 자산을 암묵적으로 전제**하고 있습니다. 명시된 적은 없지만 다음이 그 증거입니다.

- `lease_roll`이 등급 가중치 25점으로 최대 — 임차인이 없으면 최대 75점에 갇힘
- `Cap Rate`가 보편 지표처럼 취급됨 — 사옥·대지에서는 무의미
- 아키타입 R01~R09가 전부 임대수익 개선 축으로 정의됨
- 레이아웃 규칙 L01·L05가 렌트롤·공실을 전제

잠원동 케이스에서 이 전제가 처음 깨졌습니다. 앞으로 사옥·대지·물류가 들어오면 **매번 깨집니다.**

> **결론.** 자산군을 태그가 아니라 **스키마 분기점(1급 개념)** 으로 승격하고, 자산군별 확장을 Pack으로 분리해야 합니다. Core를 자산군별로 분기하면 업그레이드 경로가 영구히 막힙니다.

---

## 1. 잠원동이 드러낸 세 가지 공백

| # | 공백 | 증상 |
|---:|---|---|
| 1 | `not_applicable` 가중치 재배분 규칙 부재 | 명도 조건 물건이 부당하게 낮은 등급 |
| 2 | `aboveGroundArea` 슬롯 부재 | 실무의 "실질 용적률"을 표현할 수 없음 |
| 3 | `vacate_plan` 슬롯군 부재 | 개발형의 최대 리스크를 정량화할 수 없음 |

세 가지 모두 **수익형에서는 나타나지 않는 문제**입니다. 자산군이 늘어날 때마다 이런 공백이 3~5개씩 나온다고 보아야 합니다.

---

## 2. 자산군 5종의 요구 차이

### 2.1 무엇이 가치를 결정하는가

| 자산군 | 주 가치 지표 | 매수자의 핵심 질문 | 최대 리스크 |
|---|---|---|---|
| **수익형** | Cap Rate 4기준 · 총수익률 | 얼마나 벌리나 | 공실 · 갱신 실패 |
| **사옥형** | **자가 vs 임차 연간 비교** | 임차보다 나은가 | 사세 변동 · 유동성 |
| **개발형** | **토지 평단가 + 사업수지** | 지어서 남나 | **명도 · 인허가** |
| **대지** | **평단가 + 개발 가능 연면적** | 얼마나 지을 수 있나 | 인허가 · 기반시설 |
| **물류** | Cap Rate + **평당 임대료 벤치마크** | 스펙이 시장 기준에 맞나 | 단일 임차인 · 스펙 진부화 |

**Cap Rate가 보편 지표가 아니라는 점이 핵심입니다.** 사옥형에 Cap Rate를 들이대면 "2%대네요"라는 무의미한 대화가 됩니다.

### 2.2 슬롯군 필요도

| 슬롯군 | 수익형 | 사옥형 | 개발형 | 대지 | 물류 |
|---|:-:|:-:|:-:|:-:|:-:|
| `land_parcel` | ● | ● | ◎ | ◎ | ● |
| `building_basic` | ◎ | ◎ | ● | **✗** | ◎ |
| `building_floors` | ● | ◎ | ● | **✗** | ● |
| `zoning` | ● | ● | ◎ | ◎ | ● |
| `road_access` | ● | ◎ | ● | ◎ | ◎ |
| `lease_roll` | ◎ | △ | △ | **✗** | ◎ |
| `financial_input` | ◎ | ● | ● | ✗ | ◎ |
| `title_encumbrance` | ● | ● | ● | ● | ● |
| `market_comp` | ● | ● | ◎ | ◎ | ● |
| **`physical_spec`** 🆕 | △ | ◎ | — | ✗ | **◎** |
| **`development_plan`** 🆕 | △ | ✗ | ◎ | ◎ | ✗ |
| **`vacate_plan`** 🆕 | △ | △ | ◎ | ✗ | △ |
| **`occupancy_plan`** 🆕 | ✗ | ◎ | ✗ | ✗ | ✗ |
| **`permit_risk`** 🆕 | ✗ | ✗ | ◎ | ◎ | △ |

◎ 필수 · ● 중요 · △ 선택 · ✗ 해당 없음 · 🆕 신설

---

## 3. 아키텍처 결정 — Asset Class Pack

### ADR-008 — 자산군을 1급 개념으로 승격한다

```ts
export const AssetClass = z.enum([
  'income',          // 수익형 — 임대수익 자산
  'owner_occupied',  // 사옥형 — 자가 사용
  'development',     // 개발형 — 신축·재건축 전제
  'land',            // 대지 — 나지·구축 철거 전제
  'logistics',       // 물류 — 창고·물류센터
]);
```

자산군은 태그가 아니라 다음을 **결정하는 분기점**입니다.

1. 필수/해당없음 슬롯군 집합
2. 주 가치 지표 계산 전략
3. 적용 아키타입 규칙 세트
4. 등급 가중치 프로파일
5. 레이아웃 편성 규칙
6. 추가 제약·게이트

### ADR-009 — Core를 분기하지 않는다

```
Core Schema                          Pack (자산군별)
├ 필지 · 건축물 · 용도지역 · 접면      ├ 고유 슬롯 정의 (metadata_schema)
├ 가격 · 취득원가 · 권리 · 비교사례     ├ 가치 지표 계산 전략
├ provenance · 등급 · 게이트           ├ 아키타입 규칙 세트
└ 확장점: assetClass + packSlots       ├ 레이아웃 편성
          (JSONB) + packRules          └ 추가 제약 · 게이트
```

**자산군별 Core DB 테이블 분기는 금지입니다.** 한 번 분기하면 공통 기능(provenance 합성, 등급 산정, 게이트, 발행 이력) 개선이 5배 비용이 되고, 마이그레이션 경로가 사라집니다.

Pack은 `packSlots JSONB` + `pack_rule` 레코드로 표현하며, Core 스키마는 건드리지 않습니다.

```sql
alter table deal
  add column asset_class text not null default 'income',
  add column pack_slots  jsonb not null default '{}',
  add column pack_version text;
```

---

## 4. 다형 가치 지표

가장 중요한 설계 변경입니다. `Cap Rate`를 보편 지표에서 **수익형 Pack의 지표**로 강등합니다.

```ts
export interface ValueMetricStrategy {
  id: string;
  label: string;
  applies: AssetClass[];
  compute(doc: IMDoc): MetricResult;
  disclosure: 'primary' | 'secondary' | 'onRequest';
}
```

### 4.1 수익형 — Cap Rate 4기준 (기존)

`IM_PRECISION_SPEC.md` §2.1 그대로.

### 4.2 사옥형 — 자가 vs 임차 연간 비교 🆕

```
연간 자가 비용 = 대출이자 + 재산세·종부세 + 관리비
               + 자기자본 기회비용 − 지가상승 기대
연간 임차 비용 = 임차료 + 관리비 + 보증금 기회비용
자가 우위액   = 임차 비용 − 자가 비용
회수 기간     = 취득 부대비용 ÷ 자가 우위액
```

두원빌딩을 사옥으로 매입한다고 가정하면 —

| 항목 | 금액 |
|---|---:|
| 대출이자 (LTV 55% · 4.3%) | 5.73억 |
| 재산세·종부세 (0.35% 가정) | 0.85억 |
| 관리비 | 1.11억 |
| 자기자본 기회비용 (요구 5%) | 5.45억 |
| **−** 지가상승 기대 (2.87%) | **−6.95억** |
| **연간 자가 비용** | **6.18억** |
| 연간 임차 비용 (동일 면적) | 15.03억 |
| **자가 우위** | **+8.85억 / 년** |
| 취득 부대비용 회수 | **1.6년** |

> **⚠ 이 지표는 지가 가정에 지배됩니다.** 지가상승을 0%로 두면 자가 우위가 8.85억 → 1.90억으로 급감합니다.
> 따라서 **총수익률과 동일하게 시나리오 4종을 강제**해야 합니다 (하락·보수·기준·낙관). 단일 값 제시는 금지입니다.

### 4.3 개발형 — 사업수지 🆕

```
총사업비 = 총취득원가 + 명도비 + 건축비 + 금융비용 + 예비비
준공 후 가치 = 안정화 NOI ÷ Exit Cap
사업이익 = 준공 후 가치 − 총사업비
사업이익률 = 사업이익 ÷ 총사업비
```

**명도비와 명도 기간이 필수 입력입니다.** 잠원동 케이스에서 명도가 6개월(매도인 주장)이냐 12개월(중개인 판단)이냐에 따라 금융비용이 두 배가 됩니다.

### 4.4 대지 — 평단가 + 개발 가능 규모 🆕

```
개발 가능 연면적 = 유효 대지면적 × 용적률 상한
개발 효율       = 개발 가능 연면적(평) ÷ 대지면적(평)
토지비 부담     = 매입가 ÷ 개발 가능 연면적(평)
```

두원빌딩 대지 기준 —

| 가정 용도지역 | 개발 가능 연면적 | 토지비 부담 |
|---|---:|---:|
| 2종일반 (한시 상향 250%) | 465.9평 | 51,997,374원/평 |
| 준주거 400% | 745.5평 | 32,498,359원/평 |
| 일반상업 600% | 1,118.2평 | 21,665,573원/평 |

**"토지비 부담(원/연면적평)"이 대지형의 진짜 비교 지표입니다.** 평단가만으로는 용도지역이 다른 물건을 비교할 수 없습니다.

### 4.5 물류 — Cap Rate + 스펙 벤치마크 🆕

Cap Rate는 쓰되, **물리 스펙이 가치의 대부분을 설명**하므로 벤치마크 대비를 함께 제시합니다.

| 지표 | 벤치마크 | 의미 |
|---|---|---|
| 유효 층고 | 10m 이상 | 랙 단수 결정 (1.5m/단) |
| 바닥하중 | 1.2 t/㎡ 이상 | 자동화 설비 가능 여부 |
| 도크 수 / 연면적 1,000평 | 2.5 ~ 3.5개 | 회전율 |
| 평당 임대료 | 권역 중앙값 대비 | 스펙 프리미엄/디스카운트 |

---

## 5. 신설 슬롯군 명세

### 5.1 `physical_spec` — 물리 스펙 (사옥·물류)

```ts
export const PhysicalSpec = z.object({
  // 공통
  standardFloorArea: z.number().nullable(),      // 기준층 면적(평)
  exclusiveRatio: z.number().nullable(),         // 전용률
  ceilingHeight: z.number().nullable(),          // 천장고(m)
  parkingCount: z.number(),
  // 물류 전용
  clearHeight: z.number().nullable(),            // 유효 층고(m)
  floorLoad: z.number().nullable(),              // 바닥하중(t/㎡)
  dockCount: z.number().nullable(),
  dockLeveler: z.boolean().nullable(),
  rampType: z.enum(['direct','spiral','none']).nullable(),
  truckTurningRadius: z.number().nullable(),     // 회전반경(m)
  powerCapacity: z.number().nullable(),          // 수전용량(kW)
  temperatureZone: z.enum(['ambient','cool','frozen','mixed']).nullable(),
  // 사옥 전용
  namingRights: z.boolean().nullable(),
  commuteAccessScore: z.number().nullable(),
});
```

### 5.2 `vacate_plan` — 명도 계획 (개발형 필수)

잠원동 데이터셋에서 이미 설계했습니다. `INPUT_정밀_잠원동두원빌딩.md` §2.5 참조.

```ts
export const VacatePlan = z.object({
  responsibility: z.enum(['seller','buyer','shared']),
  costIncludedInPrice: z.boolean(),
  estimatedCost: Money,
  byDifficulty: z.object({ high: z.number(), medium: z.number(), low: z.number() }),
  criticalUnits: z.array(z.object({
    unit: z.string(), use: z.string(),
    renewalRightRemainingYears: z.number(),
    reason: z.string(),
  })),
  sellerClaimedMonths: z.number(),
  brokerJudgmentMonths: z.number(),            // 격차를 감추지 않는다
});
```

**`sellerClaimedMonths`와 `brokerJudgmentMonths`를 분리한 것이 요점입니다.** 매도인 주장과 중개인 판단이 다르면 그 격차 자체를 IM에 싣습니다. 감추면 실사에서 드러납니다.

### 5.3 `occupancy_plan` — 자가 사용 계획 (사옥형)

```ts
export const OccupancyPlan = z.object({
  headcount: z.number(),
  areaPerHead: z.number(),                     // 평/인
  floorAllocation: z.array(z.object({ level: z.string(), use: z.string(), area: z.number() })),
  currentLeaseCost: Money.nullable(),          // 현 임차료 — 비교 기준
  currentLeaseExpiry: z.string().nullable(),
  expansionHeadroom: z.number().nullable(),    // 증원 여력(인)
});
```

### 5.4 `permit_risk` — 인허가 리스크 (개발·대지)

```ts
export const PermitRisk = z.object({
  items: z.array(z.object({
    kind: z.enum([
      'height_limit','daylight','parking_min','contribution',   // 건축
      'development_permit','farmland_conversion','forest_conversion',
      'cultural_heritage_survey','traffic_impact','environmental_impact',
      'road_setback','infrastructure_capacity',
    ]),
    status: z.enum(['clear','check_required','constraint','blocking']),
    note: z.string(),
    estimatedMonths: z.number().nullable(),
  })),
  totalEstimatedMonths: z.number(),
});
```

### 5.5 `aboveGroundArea` — 지상 연면적 (전 자산군)

잠원동 발견 사항. 실무의 "실질 용적률" 산출에 필요합니다.

```ts
building: {
  grossArea: number;          // 연면적
  farCountedArea: number;     // 용적률 산정 연면적 (주차 등 제외)
  aboveGroundArea: number;    // 🆕 지상 연면적 (지하 제외)
}
```

---

## 6. 등급 가중치 프로파일

자산군마다 다른 프로파일을 두고, `not_applicable` 슬롯군은 나머지에 **비례 재배분**합니다.

| 슬롯군 | 수익형 | 사옥형 | 개발형 | 대지 | 물류 |
|---|---:|---:|---:|---:|---:|
| land_parcel | 15 | 15 | 15 | **30** | 15 |
| building_basic | 15 | 15 | 15 | — | 15 |
| zoning | 10 | 10 | 10 | **30** | 10 |
| road_access | 5 | 5 | 5 | 10 | 5 |
| lease_roll | **25** | 5 | 10 | — | 20 |
| financial_input | 15 | 15 | 10 | — | 10 |
| title_encumbrance | 10 | 10 | 10 | 5 | 10 |
| market_comp | 5 | 5 | 5 | 10 | 5 |
| physical_spec | — | **20** | — | — | **20** |
| development_plan | — | — | **20** | 15 | — |
| vacate_plan | — | — | 10 | — | — |
| **원 합계** | 100 | 100 | 110 | 100 | 110 |

원 합계가 100이 아닌 프로파일은 정규화합니다 (`가중치 × 100 ÷ 합계`).

### `not_applicable` 재배분 규칙 (v0.2 누락분)

```ts
export function effectiveWeights(profile: Record<string, number>, na: string[]) {
  const active = Object.fromEntries(
    Object.entries(profile).filter(([k]) => !na.includes(k)));
  const scale = 100 / Object.values(active).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(active).map(([k, v]) => [k, v * scale]));
}
```

**이 규칙이 없으면 명도 조건 물건은 최대 75점(B 상단)에 갇힙니다.** 잠원동 표준 데이터셋이 72.67점을 받은 것도 이 재배분을 적용한 결과입니다.

---

## 7. 아키타입 규칙군 분리

현 R01~R09는 수익형 전제입니다. 자산군별 접두를 붙여 분리합니다.

| 규칙군 | 자산군 | 예시 |
|---|---|---|
| `R-INC-xx` | 수익형 | 초안정 · 밸류애드 · 저평가 코너 |
| `R-OWN-xx` | 사옥형 | 자가 우위형 · 확장 여력형 · 통근 우수형 |
| `R-DEV-xx` | 개발형 | 즉시 착공형 · 명도 선행형 · 인허가 리스크형 |
| `R-LND-xx` | 대지 | 고효율 개발지 · 접도 제약지 · 전용 필요지 |
| `R-LOG-xx` | 물류 | 신축 스펙형 · 스펙 진부형 · 단일 임차 집중형 |

**기존 R01~R09는 `R-INC-01~09`로 개명**하고 원 코드는 폐기합니다. 규칙 코드 재사용 금지 원칙(`ONTOLOGY_V0.2_SPEC.md` §8)에 따릅니다.

---

## 8. 즉시 반영 3건 (v0.2.1 패치)

자산군 확장 전이라도 지금 넣어야 하는 것들입니다. 잠원동에서 이미 필요성이 확인되었습니다.

| # | 항목 | 성격 | 공수 |
|---:|---|---|---:|
| 1 | `not_applicable` 가중치 재배분 | 버그 수정 (minor) | 1일 |
| 2 | `aboveGroundArea` 슬롯 | 슬롯 추가 (minor) | 0.5일 |
| 3 | `vacate_plan` 슬롯군 | 슬롯군 추가 (minor) | 3일 |

세 건 모두 **하위 호환되므로 v0.2.1 minor 패치**로 배포 가능합니다. 자산군 Pack(v0.3)을 기다릴 필요가 없습니다.

---

## 9. 개발 스코프와 순서

### 9.1 공수 산정 (솔로 AI-pair 기준)

| 단계 | 작업 | 솔로일 |
|---|---|---:|
| **v0.2.1** | 즉시 반영 3건 | 4.5 |
| **Pack 기반 구축** | AssetClass 승격 · packSlots · 가중치 프로파일 · 규칙군 분리 | 12 |
| Pack #1 개발형 | 슬롯 · 사업수지 · permit_risk · 레이아웃 · 게이트 | 10 |
| Pack #2 사옥형 | 슬롯 · 자가vs임차 · occupancy_plan · 레이아웃 | 9 |
| Pack #3 대지 | 슬롯 · 개발가능규모 · permit_risk 공유 · 레이아웃 | 7 |
| Pack #4 물류 | physical_spec · 벤치마크 · 레이아웃 | 11 |
| | **합계** | **53.5** |

Pack 기반 구축 12일이 선행 투자이고, 이후 Pack 하나당 7~11일입니다. **네 번째 Pack부터는 한계비용이 떨어집니다.**

### 9.2 순서 권고

| 순위 | Pack | 근거 |
|---:|---|---|
| 1 | **개발형** | 잠원동 실물 데이터셋 완비 · 강남권 노후 건물 다수 |
| 2 | **사옥형** | JS 주력 물건군일 가능성 · 수익형과 슬롯 중복 높음 |
| 3 | 대지 | 개발형과 `permit_risk` 공유 → 한계비용 낮음 |
| 4 | 물류 | **권역이 다름** — JS가 수도권 물류를 다루는지 확인 필요 |

> **물류 Pack 착수 전 확인 사항.** 물류센터는 서울 강남권 브로커의 물건이 아닙니다. 이천·용인·인천 권역이며 매수자층(리츠·운용사)도 다릅니다. JS 조직에 해당 물건 유입이 있는지 확인한 뒤 착수하십시오. 없으면 4순위가 아니라 보류가 맞습니다.

### 9.3 6개월 창과의 관계

`CREDEAL_v3.1_개정기획서` 기준 6개월 스코프가 이미 132일로 여유 0입니다. **자산군 확장 53.5일은 M4 이후 과제**입니다.

다만 **v0.2.1 패치 4.5일과 Pack 기반 구축 12일은 M3에 넣는 것을 권합니다.** 이유는 다음과 같습니다.

- 기반 구축을 미루면 M1~M3에서 만든 코드가 수익형 전제로 굳습니다.
- 나중에 뜯어내는 비용이 지금 넣는 비용보다 큽니다.
- Pack 자체는 나중에 만들어도 되지만, **확장점(extension point)은 지금 뚫어야 합니다.**

이는 `IM_PRECISION_SPEC.md` §8.3에서 "다필지 기능은 미뤄도 슬롯 구조는 M1에서 배열로 설계하라"고 한 것과 같은 논리입니다.

---

## 10. 레이아웃 편성 확장

자산군별로 슬라이드 구성이 달라집니다. 기존 L01~L15에 자산군 분기를 추가합니다.

| 코드 | 조건 | 동작 |
|---|---|---|
| L16 | `assetClass = development` | 토지상세 · 신축규모 · 투입비용 · 스태킹 · **명도계획** 편성 |
| L17 | `assetClass = owner_occupied` | **자가vs임차 비교** · 층별 사용계획 · 통근분석 편성. 렌트롤 억제 |
| L18 | `assetClass = land` | 지적 · 토지이용계획 · **개발가능규모** · 인허가 로드맵. 건축물 슬라이드 전체 억제 |
| L19 | `assetClass = logistics` | **물리스펙** · 도크/램프 도면 · 임차인 신용 · 권역 임대료 벤치마크 |
| L20 | `physical_spec` 존재 | 스펙 비교표를 벤치마크와 병치 |

`PPTX_TEMPLATE_SPEC.md`의 아키타입 10종은 그대로 쓸 수 있습니다. **레이아웃 골격이 아니라 편성(어떤 섹션을 넣을지)이 바뀌는 것**이므로 템플릿 확장은 불필요합니다.

---

## 11. 제약 확장

| 코드 | 자산군 | 제약 |
|---|---|---|
| C23 | 개발·대지 | 신축 산정 용적률 ≤ 인허가 상한 (**유효 대지면적 기준**) |
| C24 | 개발 | 명도 기간이 명시되어야 사업수지 산출 가능 |
| C25 | 대지 | 접도 폭 ≥ 건축 가능 최소치 (미달 시 건축 불가 경고) |
| C26 | 물류 | 유효 층고 · 바닥하중 · 도크 수 중 2개 이상 미입력 시 벤치마크 비교 억제 |
| C27 | 사옥 | 자가vs임차 비교 시 **지가 시나리오 4종 필수** (단일 값 금지) |
| C28 | 전 자산군 | `assetClass`에 해당하지 않는 슬롯군에 값이 입력되면 경고 |

**C27이 중요합니다.** 사옥형 판정은 지가 가정에 지배되므로(§4.2), 단일 값 제시는 사실상 투자 권유가 됩니다.

---

## 12. 리스크

| 리스크 | 대응 |
|---|---|
| **Pack이 늘수록 Core가 오염된다** | Pack 요구가 Core 변경을 부르면 반드시 ADR 검토. "이 Pack만을 위한 Core 필드"는 거부 |
| **자산군 판정 오류** | 복합 물건(1층 상가 + 상층 사옥)은 `mixed`로 두고 주 용도로 Pack 선택. 자동 판정 금지, 중개인 선택 |
| **Pack별 품질 편차** | 각 Pack은 골든 예시 1건 + 검증 시나리오 10건을 반드시 동반. 없으면 출시 불가 |
| **물류 Pack 헛발** | 착수 전 JS 물건 유입 확인 (§9.2) |
| **가중치 프로파일 자의성** | 초기 프로파일은 가설이다. 자산군별 IM 20건 누적 후 실제 등급 분포를 보고 재조정 |

---

## 13. 검증 시나리오

| # | 시나리오 | 기대 |
|---:|---|---|
| 1 | 잠원동(개발형) 등급 산정 | `lease_roll` N/A 재배분 → 72.67 (B) |
| 2 | 수익형 물건에 `physical_spec` 입력 | C28 경고 (차단 아님) |
| 3 | 대지 물건에 건축물 슬라이드 요청 | L18로 전체 억제 |
| 4 | 사옥형 자가vs임차 단일 값 제시 | **C27 위반 — 발행 차단** |
| 5 | 개발형 명도 기간 미입력 | **C24 위반 — 사업수지 억제** |
| 6 | 물류 층고·하중만 입력 (도크 누락) | C26 — 벤치마크 비교 억제, 발행은 허용 |
| 7 | 대지 접도 3m 입력 | C25 — 건축 불가 경고 |
| 8 | 개발형 유효 대지 기준 용적률 254.1% | C23 — 250% 상한 초과 경고 |
| 9 | `R01` 코드 조회 | deprecated → `R-INC-01` 안내 |
| 10 | 복합 물건 자동 판정 시도 | 차단 — 중개인 선택 요구 |

---

## 14. 참고

- 선행 — `ONTOLOGY_V0.2_SPEC.md` · `IM_PRECISION_SPEC.md` · `IM_DATA_PIPELINE.md`
- 실증 — `IM_역설계분석_잠원동두원빌딩.md` · `INPUT_정밀_잠원동두원빌딩.md`
- 조판 — `AGENTS.md` · `PPTX_TEMPLATE_SPEC.md`
