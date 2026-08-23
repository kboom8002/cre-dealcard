# CREDEAL 온톨로지 v0.4 명세

> **v0.3을 대체합니다.** 자산 분류를 **직교하는 3축**으로 분리하고, 임대차 법령을 상가·주택으로 분기합니다.
> 구현 감사(`ONTOLOGY_SSOT_AUDIT.md` v0.2.0)에서 드러난 모델링 충돌을 해소합니다.

| | |
|---|---|
| **버전** | v0.3.0 → **v0.4.0** (major) |
| **파괴적 변경** | 4건 |
| **근거** | 실전 IM 5건 역설계 + 구현 감사 |
| **최종 수정** | 2026-08-03 |

---

## 0. 왜 다시 바꾸는가

### 0.1 감사가 드러낸 충돌

구현(v0.2.0)에는 이미 `AssetType` 8종이 있습니다.

```ts
// src/domain/building/asset-ontology.ts
type AssetType = 'office' | 'retail' | 'logistics' | 'residential'
              | 'mixed_use' | 'land' | 'hotel' | 'industrial';
```

v0.3 명세는 `AssetClass` 6종을 정의했습니다.

```ts
type AssetClass = 'income' | 'owner_occupied' | 'development' | 'land' | 'logistics' | 'hospitality';
```

**두 목록이 같은 이름의 다른 것을 가리킵니다.** `land`·`logistics`는 양쪽에 있고, `office`와 `income`은 층위가 아예 다릅니다.

### 0.2 근본 원인 — 세 가지를 하나로 눌렀다

| 실제로 다른 것 | 예 |
|---|---|
| **법정 용도** | 업무시설 · 제2종근린생활시설 · 숙박시설 |
| **시장 유형** | 사무용빌딩 · 근생빌딩 · 호텔 |
| **투자 관점** | 임대수익 · 자가사용 · 개발 · 운영 |

같은 업무시설 빌딩이라도 **임대수익용으로 사는 사람과 사옥으로 사는 사람과 헐고 새로 지으려는 사람의 평가 방법이 전부 다릅니다.** 하나의 enum으로 누르면 반드시 어긋납니다.

### 0.3 실증

역설계한 5건을 3축으로 분해하면 이렇게 됩니다.

| 물건 | 법정 용도 | 시장 유형 | 투자 관점 |
|---|---|---|---|
| 잠원동 두원빌딩 | 제2종근린생활시설 | 근생빌딩 | **development** |
| 당산동 근생빌딩 | 제2종근린생활시설 | 근생빌딩 | **income** |
| 양평동 더레드빌딩 | 업무시설 | 사무용빌딩 | **income** |
| 수택동 419-19 | (없음) | 나대지 | **development** |
| 에이치에비뉴호텔 | 숙박시설 | 호텔 | **operating** |

**잠원동과 당산동은 법정 용도·시장 유형이 같고 투자 관점만 다릅니다.** 그런데 IM 구성은 완전히 달랐습니다(신축 제언 vs 임대료 현실화). 축을 나누지 않으면 이 차이를 표현할 수 없습니다.

---

## 1. 3축 모델

```
        buildingUse            assetType           investmentPosture
        (법정 용도)             (시장 유형)            (투자 관점)
            │                      │                      │
       ✓공부 자동 수집          중개인 선택            중개인 선택
            │                      │                      │
            ▼                      ▼                      ▼
      적용 법령 결정          Pack 슬롯군 결정        가치 지표 결정
      용도변경 가능성          비교사례 모집단         계산 전략
      주차·소방 기준           IM 섹션 편성           리스크 축
```

```ts
export const AssetIdentity = z.object({
  buildingUse: BuildingUse.nullable(),        // 건축법 시행령 별표1 — 나대지는 null
  assetType: AssetType,                       // 시장 유형 17종
  investmentPosture: InvestmentPosture,       // 투자 관점 5종
});
```

세 축은 **독립적으로 값을 가집니다.** 다만 유효 조합에는 제약이 있습니다 (§4).

### 1.1 축별 소유 결정

| 축 | 결정하는 것 | 정본 |
|---|---|---|
| `buildingUse` | 임대차 법령 · 용도변경 가능성 · 주차·소방 기준 | `CATALOG_ASSET_TYPES.md` §1 |
| `assetType` | 필수 Pack 슬롯군 · 비교사례 모집단 · IM 섹션 편성 | `CATALOG_ASSET_TYPES.md` §2 |
| `investmentPosture` | 주 가치 지표 · 계산 전략 · 리스크 축 | `CATALOG_ASSET_TYPES.md` §3 · 이 문서 §3 |

---

## 2. 임대차 법령 분기 — 가장 중요한 변경

`buildingUse`가 **어느 임대차보호법을 적용할지** 결정합니다. v0.3까지는 상가건물임대차보호법만 가정했습니다.

| buildingUse 군 | 적용 법령 | 규칙군 |
|---|---|---|
| 근린생활시설 · 판매 · 업무 · 숙박 · 공장 · 창고 등 | **상가건물임대차보호법** | `T-C-01~06` |
| 단독주택 · 공동주택 · 준주택(주거용 오피스텔) | **주택임대차보호법** | **`T-R-01~07` 🆕** |
| 혼합 (상가주택 등) | **호실별 분기** | 두 규칙군 병행 |

### 2.1 두 법의 결정적 차이

| 항목 | 상가건물임대차보호법 | **주택임대차보호법** |
|---|---|---|
| 대항력 요건 | 인도 + **사업자등록** | 인도 + **주민등록(전입신고)** |
| 갱신요구권 | **전체 10년 범위 내 수차례** | **1회 한정 · 갱신 후 2년** (총 4년) |
| 환산보증금 | 있음 (지역별 기준) | **개념 없음** |
| 우선변제권 | 환산보증금 이하 + 확정일자 | 확정일자 |
| 최우선변제 | 소액임차인 기준 | 소액임차인 기준 (금액 다름) |
| 차임 인상률 상한 | 5% (환산보증금 이하) | 5% (갱신 시) |
| 권리금 회수기회 보호 | **있음** | **없음** |
| 임대인 직접사용 갱신거절 | **불가** | **가능** |

**갱신요구권 10년 vs 4년의 차이가 명도·임대료 협상 전체를 바꿉니다.** 원룸건물(다가구)을 상가 기준으로 판정하면 명도 가능 시점을 6년 과대평가하게 됩니다.

### 2.2 혼합 물건 처리

상가주택처럼 한 건물에 근생과 주택이 섞이면 **호실별로 법령을 분기**합니다.

```ts
export const LeaseUnitLegalBasis = z.enum(['commercial', 'residential']);

// 판정 우선순위
// 1. 호실의 실제 사용 용도 (중개인 확인)
// 2. 건축물대장 층별 용도
// 3. 건물 주용도
```

**자동 판정은 제안까지만** 하고 중개인이 확정합니다. 오피스텔은 특히 주의가 필요합니다 — 업무시설이지만 **주거용으로 사용하면 주택임대차보호법이 적용**됩니다.

---

## 3. 가치 지표 — `investmentPosture`가 결정

v0.3의 다형 지표를 `investmentPosture` 축으로 옮깁니다.

| posture | 주 지표 | 시나리오 강제 | 계산식 정본 |
|---|---|:-:|---|
| `income` | Cap Rate 4기준 · 총수익률 | 총수익률만 | `IM_PRECISION_SPEC.md` §2 |
| `owner_occupied` | 자가 vs 임차 연간 비교 | **○** | `ASSET_CLASS_EXTENSION_PLAN.md` §4.2 |
| `development` | 토지비 부담 · 사업수지 | ○ | 동 §4.3~4.4 |
| `operating` | **GOP 기준 Cap Rate** | ○ | `IM_역설계분석_3종.md` §3 |
| `trading` | 평단가 · 권역 회전율 | ✗ | 신규 — Pack 구현 시 확정 |

### 3.1 `operating` 신설 배경

호텔뿐 아니라 **요양시설·주차장·골프연습장·물류 자가운영** 등 운영 수익 자산 전반을 덮습니다. 공통점은 **매출이 임대차 계약이 아니라 영업 성과에서 나온다**는 것입니다.

```
income     → NOI ÷ 매각가        (계약이 매출을 보장)
operating  → GOP ÷ 매각가        (영업 성과가 매출을 결정)
```

**두 값을 나란히 비교하면 안 됩니다.** GOP는 운영 인건비·마케팅비를 차감한 뒤의 값입니다. 제약 C31이 GOP 기준임을 표기하도록 강제합니다.

### 3.2 `trading` 신설 배경

단기 매매 차익 목적의 매수자는 임대수익률을 거의 보지 않습니다. **평단가와 권역 회전율**이 판단 근거입니다. 수택동 같은 나대지에서 실제로 나타나는 관점입니다.

---

## 4. 유효 조합 제약

세 축이 독립이지만 아무 조합이나 성립하지는 않습니다.

```ts
export const COMBINATION_RULES: CombinationRule[] = [
  { assetType: 'bare_land',   requiresBuildingUse: null,  allowedPostures: ['development', 'trading'] },
  { assetType: 'hotel',       requiresBuildingUse: '숙박시설', allowedPostures: ['operating', 'development'] },
  { assetType: 'multi_household', legalBasis: 'residential', allowedPostures: ['income', 'development'] },
  { assetType: 'knowledge_center', sectionalOwnership: true, allowedPostures: ['income', 'owner_occupied'] },
  // 전체 매트릭스는 CATALOG_ASSET_TYPES.md §4
];
```

| 위반 | 예 | 동작 |
|---|---|---|
| 불가능 조합 | 나대지 + `income` | **차단** — 임대차가 없음 |
| 비일반 조합 | 호텔 + `income` | 경고 — 임대차 운영이면 가능 |
| 주의 조합 | 오피스텔 + `income` | 경고 — 주거용이면 주임법 적용 확인 |

**자동 판정은 제안까지만** 합니다. 복합 물건(1층 상가 + 상층 사옥)에서 자동 판정은 반드시 틀리고, 틀린 판정은 IM 전체 구성을 바꿉니다.

---

## 5. Pack 결정 — `assetType`이 소유

`assetType`이 필수 Pack 슬롯군을 결정합니다.

| Pack 슬롯군 | 요구하는 assetType |
|---|---|
| `physical_spec` | 물류창고 · 공장 · 사무용빌딩(사옥) |
| `hospitality_spec` | 호텔 · 생활형숙박시설 |
| `residential_spec` 🆕 | 다가구·다중주택 · 다세대·연립 · 오피스텔 |
| `sectional_spec` 🆕 | 지식산업센터 · 집합상가 · 층별구분등기 물건 |
| `development_plan` | 나대지 · 임야·농지 · (posture=development인 전 유형) |
| `vacate_plan` | posture=development ∧ 임대차 존재 |
| `permit_risk` | 나대지 · 임야·농지 · posture=development |
| `occupancy_plan` | posture=owner_occupied |

### 5.1 `residential_spec` 신설 🆕

원룸건물(다가구)은 소형 CRE에서 빈도가 높은데 v0.3에 슬롯이 없었습니다.

```ts
export const ResidentialSpec = z.object({
  unitCount: z.number(),
  unitMix: z.array(z.object({
    type: z.string(),              // '원룸' | '1.5룸' | '투룸' …
    count: z.number(),
    exclusiveArea: z.number(),
  })),
  jeonseCount: z.number(),         // 전세 호실 수
  monthlyCount: z.number(),        // 월세 호실 수
  jeonseDepositTotal: Money,
  parkingPerUnit: z.number(),
  separateMeter: z.boolean(),      // 개별 계량기
  illegalExtension: z.boolean(),   // 옥탑·베란다 확장 등
});
```

`illegalExtension`이 중요합니다 — 다가구에서 흔하고, **위반건축물 등재 시 매수자 대출이 막힙니다.**

### 5.2 `sectional_spec` 신설 🆕

당산동 근생빌딩(층별구분등기·형제 2인)에서 필요성이 확인되었습니다.

```ts
export const SectionalSpec = z.object({
  isSectional: z.boolean(),
  units: z.array(z.object({
    unitNo: z.string(), level: z.string(), exclusiveArea: z.number(),
    landShareRatio: z.string(), owner: z.string(),
    mortgageMax: Money.nullable(),
    jointCollateralGroup: z.string().nullable(),   // 공동담보 그룹
  })),
  ownerCount: z.number(),
  requiresAllOwnersConsent: z.boolean(),
  partialSaleFeasible: z.boolean(),
  landShareSum: z.number(),                        // 1.0 검증
  managementBody: z.boolean(),                     // 관리단 존재 (지식산업센터)
});
```

---

## 6. 등급 가중치 — 2단 결정

v0.3은 자산군 하나로 프로파일을 정했습니다. v0.4는 **`assetType`이 기본 프로파일을, `investmentPosture`가 보정**합니다.

```ts
export function gradeProfile(assetType: AssetType, posture: InvestmentPosture) {
  const base = BASE_PROFILE[assetType];
  const adj  = POSTURE_ADJUSTMENT[posture];
  return normalize(applyAdjustment(base, adj));
}
```

### 6.1 posture 보정

| posture | 보정 |
|---|---|
| `income` | `lease_roll` ×1.0 · `financial_input` ×1.0 |
| `owner_occupied` | `lease_roll` ×0.2 · `physical_spec` ×1.5 · `occupancy_plan` +15 |
| `development` | `lease_roll` ×0.4 · `development_plan` +20 · `vacate_plan` +10 · `permit_risk` +10 |
| `operating` | `lease_roll` ×0.0 · `hospitality_spec` +30 |
| `trading` | `market_comp` ×2.0 · `lease_roll` ×0.3 |

### 6.2 `not_applicable` 재배분 (v0.3 유지)

보정 후 `not_applicable` 슬롯군의 가중치를 나머지에 비례 배분합니다.

```ts
export function effectiveWeights(profile: Record<string, number>, na: string[]) {
  const active = Object.fromEntries(Object.entries(profile).filter(([k]) => !na.includes(k)));
  const scale = 100 / Object.values(active).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(active).map(([k, v]) => [k, v * scale]));
}
```

### 6.3 등급 컷 재검토 — 실증 근거

역설계 5건의 표준 모드 등급입니다.

| 물건 | 표준 등급 |
|---|---|
| 잠원동 | 72.67 B |
| 당산동 | 64.59 C |
| 수택동 | 44.70 C |
| 호텔 | 4.58 D |
| 양평동 | 52.35 C |

**5건 중 4건이 C 이하입니다.** 실무 IM이 부실해서가 아니라 우리 요구 항목이 실무 IM에 없기 때문입니다.

```ts
export const GRADE_CUT_REVIEW = {
  trigger: { minSamplesPerAssetType: 20, condition: 'C 이하 비율 > 50%' },
  action: '등급 컷 하향 또는 슬롯군 가중치 재배분',
  currentStatus: '5건 중 4건 C 이하 — 표본 부족으로 조정 보류',
};
```

**지금 조정하지 않습니다.** 표본 5건은 근거가 되지 못하며, 성급한 완화는 등급 체계의 의미를 없앱니다. 자산유형별 20건이 쌓인 뒤 재검토합니다.

---

## 7. v0.3 → v0.4 파괴적 변경

| # | 변경 | 영향 |
|---:|---|---|
| 1 | **`AssetClass` 폐기 → 3축 분리** | 전 딜 재분류 필요 |
| 2 | **T 규칙군 분기** (`T01~06` → `T-C-01~06` + `T-R-01~07`) | 주거 임대차 판정이 바뀜 |
| 3 | **등급 프로파일 2단 결정** | 등급 점수 재산정 |
| 4 | `investmentPosture`에 `operating`·`trading` 신설 | 신규 계산 전략 |

### 마이그레이션

```
1. v0.3 스냅샷 백업
2. 기존 AssetType(구현 8종)을 assetType 17종으로 매핑
   office → office_building · retail → nbhd_building · hotel → hotel
   residential → multi_household · land → bare_land · industrial → factory
   logistics → logistics · mixed_use → mixed_shop_house
3. investmentPosture 주입 — 기존 딜은 전부 'income' (수익형 전제였음)
4. buildingUse는 건축물대장 재조회로 채움 (nullable 허용)
5. T01~T06 → T-C-01~06 개명 (기존 딜은 전부 상가)
6. 등급 재산정 — income + 기존 유형 조합에서 점수 무변화 확인
7. 변경 영향 보고서 생성
```

**롤백 가능 기간 — `posture ≠ income` 딜 또는 주거 임대차 딜이 생성되기 전까지.**

---

## 8. 유지되는 것 (v0.2·v0.3)

다음은 그대로입니다. 감사에서 구현 적합이 확인되었습니다.

- **provenance 5-tier** (`public` 1.00 / `expert` 0.95 / `seller` 0.65 / `broker` 0.60 / `assumed` 0.30)
- **파생값 합성 3종** (additive · ratio · scenario) — 특히 `SCENARIO_SCORE = 0.30` 고정
- **P 규칙군** (P01 유효 대지면적 · P02 유효 용적률 · P03 제척 영향도)
- **필지·건축물 배열화**
- **제약 C13~C22** (C19 미구현 — §`ONTOLOGY_IMPLEMENTATION_GAP.md`)
- **PublishRecord 버전 Pin**

---

## 9. 검증 시나리오

| # | 시나리오 | 기대 |
|---:|---|---|
| 1 | 잠원동 재분류 | 제2종근생 / 근생빌딩 / **development** |
| 2 | 당산동 재분류 | 제2종근생 / 근생빌딩 / **income** — ①과 posture만 다름 |
| 3 | 호텔 재분류 | 숙박시설 / 호텔 / **operating** |
| 4 | 나대지 + `income` 조합 | **차단** — 임대차 없음 |
| 5 | 다가구 임대차 판정 | **T-R 적용** — 갱신권 1회·2년 |
| 6 | 상가주택 임대차 판정 | 호실별 T-C / T-R 분기 |
| 7 | 주거용 오피스텔 | 경고 — 업무시설이나 주임법 적용 확인 요구 |
| 8 | 근생빌딩을 상가 기준으로 자동 판정 | 제안까지만 · 중개인 확정 요구 |
| 9 | posture 변경 시 등급 재산정 | 프로파일 보정 반영 |
| 10 | 지식산업센터 | `sectional_spec` 필수 · 관리단 확인 |
| 11 | 다가구 위반건축물 | 대출 제약 경고 |
| 12 | v0.3 Pin된 IM 재렌더 | legacy 엔진 동일 산출 |

---

## 10. 참고

- 자산 유형 3축 카탈로그 — `CATALOG_ASSET_TYPES.md`
- 슬롯 · enum — `CATALOG_SLOTS.md`
- 규칙 · 제약 · 게이트 — `CATALOG_RULES.md`
- 구현 갭 — `ONTOLOGY_IMPLEMENTATION_GAP.md`
- 실증 — `IM_역설계분석_잠원동두원빌딩.md` · `_당산동근생빌딩.md` · `_3종.md`
- 보존 — `ONTOLOGY_V0.3_SPEC.md` · `ONTOLOGY_V0.2_SPEC.md` (재현용, 삭제 금지)
