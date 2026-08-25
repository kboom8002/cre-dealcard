# 포스처 구현 가이드

> **D10** · `API_TYPE_CONTRACT.md` (D3) `Headline` 유니온의 구현 사양
> **산식이 렌더 내용을 정합니다.** A16(투자 구조)에 들어갈 숫자가 이 문서에서 확정됩니다.

| | |
|---|---|
| **문서 ID** | D10 |
| **소유** | 개발팀 + 도메인 |
| **온톨로지** | **v0.5.0** |
| **선행 정본** | **D3 §2·§3** · D4 가정값 · **포스처 표준 5종** (아래) |
| **조사 근거** | `IM_STANDARD_포스처확장.md` v3.0 (조사 문서) |
| **의존 문서** | **D7 (A16 표 구성)** · **D8 (Hero 지표)** |
| **대상 단계** | 3.5 (4.0일) · 10 (11.0일) |
| **작성일** | 2026-08-23 |

---

## 0Z. v0.5 — 이 문서의 위치가 바뀌었습니다 🔴

**포스처별 IM 표준 5종이 신설되었습니다.** 이 문서는 그 표준들이 요구하는
**A16 투자구조 숫자의 산식**만 소유하고, 섹션 편성·강조·계약 13칸은
표준이 소유합니다.

| posture | 표준 | 이 문서의 절 |
|---|---|:-:|
| `income` | `IM_STANDARD_수익형.md` | §2 |
| `owner_occupied` | `IM_STANDARD_사옥형.md` | §3 |
| `development` | `IM_STANDARD_개발형.md` | §4 |
| `operating` | `IM_STANDARD_운영형.md` | §5 |
| `trading` | `IM_STANDARD_단기매매형.md` | §6 |

🔴 **§4의 `developmentMinResolution` 산식은 더 이상 여기가 소유하지 않습니다.**
등급 체계이므로 `ONTOLOGY_V0.5_SPEC.md` §6.4로 이관했습니다. 세 곳에 사본이
있었고 그중 하나가 이미 어긋나 있었습니다.

---

## 0. 원칙 4가지

### 0.1 🔴 실사용 62건이 전부 income인 것은 선호가 아닙니다

`posture`에 기본값이 있으면 사용자는 고르지 않습니다. **분포가 아니라 기본값을 관측하고 있었던 것입니다.**

| | 건수 |
|---|--:|
| income | **62** |
| 그 외 4종 | **0** |

기본값을 제거하면(D3 §1.2) 실제 분포가 처음으로 관측됩니다. **그 전까지 "개발형 수요 없음"이라고 판단하지 않습니다.**

### 0.2 포스처는 물건이 아니라 매수인이 정합니다

같은 당산동 건물이 매수인에 따라 5가지로 읽힙니다.

| 매수인 | 포스처 | 같은 렌트롤을 읽는 법 |
|---|---|---|
| 자산관리 법인 | income | **월세 합계** = 수입 |
| 법인 대표 | owner_occupied | 3F를 비워 **본인이 입주** |
| 디벨로퍼 | development | 월세 합계 = **명도 비용의 크기** |
| 단기 차익 | trading | 월세 = **보유기간 캐리** |

**렌트롤은 하나인데 해석이 정반대입니다.** 그래서 포스처를 묻지 않고는 IM을 쓸 수 없습니다.

### 0.3 최종 숫자는 포스처마다 하나뿐입니다

여러 숫자를 나열하면 매수인은 아무것도 기억하지 못합니다.

### 0.4 모르면 산출하지 않습니다

D4 `user_input` 계층이 `null`이면 해당 지표를 렌더에서 제거합니다. **"미상"으로 채우지 않고 칸 자체를 없앱니다.** 다만 `Deficiency`로 이동시켜 확인사항에 남깁니다.

---

## 1. 자산유형 판별 — D3 미확정 B 해소

### 1.1 `unknown` 30건의 원인

**건축물대장 주용도가 없으면 판별이 불가능합니다.** 현행은 이 경우도 `unknown`을 조용히 반환하고 진행합니다.

### 1.2 판별표 — 주용도 우선, 규모 보조

```ts
export function classifyAssetType(
  use: BuildingUse | null,
  totalFloorAreaSqm: number | null,
  floors: number | null,
): AssetTypeVerdict {
  if (!use) return { assetType: 'unknown', confidence: 'low',
    basis: '건축물대장 주용도 미확보', needsConfirmation: true };
  const rule = RULES.find(r => r.uses.includes(use) && r.test(totalFloorAreaSqm, floors));
  if (!rule) return { assetType: 'unknown', confidence: 'low',
    basis: `주용도 "${use}"에 대응하는 유형 규칙 없음`, needsConfirmation: true };
  return { assetType: rule.assetType, confidence: rule.confidence,
    basis: rule.basis, needsConfirmation: rule.confidence === 'low' };
}
```

| 주용도 | 조건 | `assetType` | 신뢰도 |
|---|---|---|:-:|
| 제1·2종근린생활시설 | 연면적 < 3,000㎡ | `small_building` | high |
| 제1·2종근린생활시설 | ≥ 3,000㎡ | `retail_strip` | medium |
| 업무시설 | — | `office` | high |
| 근생 + 공동주택 혼재 | — | `mixed_use` | high |
| 공동주택 · 단독주택 | — | `residential_rental` | high |
| 업무시설 (오피스텔 표기) | — | `officetel` | medium |
| 창고시설 | — | `logistics` | high |
| 공장 | — | `factory` | high |
| **(건물 없음)** | 연면적 `null` | **`land`** | high |
| 숙박시설 | 객실 수 확인됨 | `hotel` | high |
| 숙박시설 | 객실 수 미확인 | `accommodation` | **low** |
| 의료시설 | — | `medical` | high |
| 교육연구시설 · 노유자 | — | `education` | medium |
| 문화및집회 · 종교 · 운동 | — | `culture` | medium |
| 자동차관련시설 | — | `parking` | medium |
| 방송통신시설 | — | `data_center` | **low** |
| 그 외 13종 | — | **`unknown`** | low |

### 1.3 `needsConfirmation`은 차단이 아닙니다

```
low 신뢰도  →  화면에 "자산유형 확인 필요 — ○○로 추정" 표시  →  사용자가 확정
```

**추정값을 조용히 쓰지 않고, 그렇다고 막지도 않습니다.**

---

## 2. income — A16 숫자 확정

### 2.1 산출 순서

```
① 총취득원가   → ② 실투자금   → ③ 수익률(basis별)
                              → ④ LTV 시나리오 → ⑤ 월 순현금 → ⑥ 역레버리지 판정
```

### 2.2 ①② 취득원가

```ts
export function computeEquity(i: FinancialInput): EquityBreakdown {
  const acquisitionTax = i.priceKrw * ASSUMPTIONS.acquisitionTaxRate.value!;   // 0.046
  const brokerFee = i.brokerFeeKrw ?? i.priceKrw * ASSUMPTIONS.brokerFeeRateMax.value!;
  const otherCost = i.otherCostKrw ?? 0;
  const totalAcquisitionCost = i.priceKrw + acquisitionTax + brokerFee + otherCost;
  return { price: i.priceKrw, acquisitionTax, brokerFee, otherCost, totalAcquisitionCost,
           deposit: i.depositKrw, loan: i.loanKrw ?? 0,
           equity: totalAcquisitionCost - i.depositKrw - (i.loanKrw ?? 0) };
}
```

**실측 검산 — 양평동·당산동.**

| 항목 | 양평동 | 당산동 |
|---|--:|--:|
| 매매가 | 250.00억 | 115.00억 |
| 취득세 (4.6%) | 11.50억 | 5.29억 |
| 중개보수 (0.9%) | 2.25억 | 1.04억 |
| **총취득원가** | **263.75억** | **121.33억** |
| 보증금 | 4.95억 | 2.90억 |
| **실투자금 (무차입)** | **258.80억** | **118.43억** |

> **매매가와 총취득원가는 5.5% 차이납니다.** 250억 물건에 13.75억이 더 듭니다. 두 IM 원본 모두 매매가만 표기했습니다.

### 2.3 ③ 수익률

```ts
const annual = i.monthlyRentKrw * 12;
out.gross_price         = { value: annual / i.priceKrw * 100,                  basis: 'gross_price' };
out.gross_price_deposit = { value: annual / (i.priceKrw - i.depositKrw) * 100, basis: 'gross_price_deposit' };
if (i.opexKrw != null) {
  const noi = annual - i.opexKrw;
  out.noi_price      = { value: noi / i.priceKrw * 100,                        basis: 'noi_price' };
  out.noi_total_cost = { value: noi / eq.totalAcquisitionCost * 100,           basis: 'noi_total_cost' };
  out.noi_equity     = { value: noi / eq.equity * 100,                         basis: 'noi_equity' };
}
```

| basis | 양평동 | 당산동 |
|---|--:|--:|
| `gross_price` | **2.24%** | **2.03%** |
| `gross_price_deposit` | 2.28% | 2.08% |
| `noi_*` 계열 | **미산출** | **미산출** |

**두 물건 모두 운영비 자료가 없어 NOI 계열이 나오지 않습니다.** 이것이 정상 동작입니다. (불변조건 1)

### 2.4 ④⑤⑥ LTV 시나리오 — A16의 본체

```ts
export function buildLtvScenarios(i: FinancialInput, eq: EquityBreakdown): LtvRow[] {
  const rate = i.loanRate ?? ASSUMPTIONS.loanRateDefault.value!;      // 0.045
  return ASSUMPTIONS.ltvScenarios.value!.map(ltv => {
    const loan = i.priceKrw * ltv;
    const equity = eq.totalAcquisitionCost - i.depositKrw - loan;
    const monthlyNet = i.monthlyRentKrw - (loan * rate / 12);
    return { ltv, loan, equity, monthlyNet,
             roe: equity > 0 ? monthlyNet * 12 / equity * 100 : null };
  });
}
```

**양평동 (금리 4.5% 가정).**

| LTV | 대출 | 실투자금 | 월 이자 | **월 순현금** | 자기자본 수익률 |
|--:|--:|--:|--:|--:|--:|
| 0% | 0 | 258.80억 | 0 | **+4,657만** | 2.16% |
| 40% | 100.00억 | 158.80억 | 3,750만 | **+907만** | 0.69% |
| **50%** | **125.00억** | **133.80억** | **4,688만** | **−30.5만** | **−0.03%** |

**당산동.**

| LTV | 대출 | 실투자금 | 월 이자 | **월 순현금** | 자기자본 수익률 |
|--:|--:|--:|--:|--:|--:|
| 0% | 0 | 118.43억 | 0 | **+1,946만** | 1.97% |
| 40% | 46.00억 | 72.43억 | 1,725만 | **+221만** | 0.37% |
| **50%** | **57.50억** | **60.93억** | **2,156만** | **−210.3만** | **−0.41%** |

### 2.5 🔴 역레버리지 — 경고를 강제합니다

```ts
if (yields.gross_price!.value > loanRate * 100) {
  pts.push({ title: '레버리지 효과', body: `자기자본 수익률 ${roe.toFixed(2)}%` });
} else {
  pts.push({ title: '무차입 구조 권장', severity: 'caution',
    body: `총임대료 기준 수익률 ${g.toFixed(2)}%가 대출금리 ${(loanRate*100).toFixed(1)}%보다 낮아, `
        + `대출을 늘릴수록 자기자본 수익률이 낮아집니다.` });
}
```

| | 수익률 | 금리 | 판정 |
|---|--:|--:|:-:|
| 양평동 | 2.24% | 4.5% | **역레버리지** |
| 당산동 | 2.03% | 4.5% | **역레버리지** |

**두 IM 원본 어디에도 이 판정이 없습니다.** 대신 "레버리지 활용 시 수익 극대화" 류의 문구가 있었습니다. 사실과 반대입니다.

### 2.6 `Headline`

```ts
const headline: Headline = {
  posture: 'income',
  monthlyNetCashFlow: rows.find(r => r.ltv === appliedLtv)!.monthlyNet,
  negativeLeverage: yields.gross_price!.value <= loanRate * 100,
};
```

---

## 3. owner_occupied — 사옥형

### 3.1 최종 숫자 = 실질 부담

```
실질 부담 = 월 대출이자 + 관리비 − (임대 수입 + 절감 임차료)
```

**지금 내는 임차료가 기준선입니다.** 매수 후 부담이 그보다 낮으면 사는 것이 유리합니다.

### 3.2 절감 임차료

```ts
export function computeSavedRent(useAreaPyeong: number, marketRentPerPyeong: number | null): number | null {
  if (marketRentPerPyeong == null) return null;      // ★ 추정 금지
  return useAreaPyeong * marketRentPerPyeong;
}
```

**당산동 3F를 법인이 쓴다면 (76.3평).**

| 항목 | 값 | 출처 |
|---|--:|---|
| 자가사용 면적 | 76.3평 | 렌트롤 |
| 시장 임차료 | **입력 필요** | `marketRentPerPyeong` |
| 절감 임차료 | **산출 불가** | — |

**`marketRentPerPyeong`이 없으면 절감액을 내지 않습니다.** 3F를 비웠다는 사실만 표기합니다.

### 3.3 🔴 세후 효과는 세전으로 제시합니다

법인세율·감가상각·이자비용 손금 구조가 법인마다 달라 **일반화하면 틀립니다.**

| | 표기 |
|---|---|
| 표준 | **세전 실질 부담** |
| 세후 | "법인 세무 검토 시 추가 절감 여지 있음" **문장만** |

**숫자로 절세액을 제시하지 않습니다.** `buildingValueRatio`가 20~50% 편차를 가져 세후 판단이 반전될 수 있습니다. (D4 §3.2)

### 3.4 자가사용은 공실이 아닙니다

```ts
const vacancyPct = rows.filter(r => r.leaseState === '공실').length
                 / rows.filter(r => r.leaseState !== '자가사용').length * 100;
```

**분모·분자 양쪽에서 제외합니다.** (불변조건 8)

---

## 4. development — 개발형

### 4.1 🔴 원장이 3개입니다

| # | 원장 | 산출 |
|:-:|---|---|
| 1 | **명도 원장** | 착공 가능 시점 |
| 2 | **규모 검토표** | 총 투입비 |
| 3 | **stacking plan** | 개발 후 수익 |

```
명도 원장 → 착공 시점 → 규모 검토 → 총 투입비 → stacking → 개발 후 수익
```

**하나라도 없으면 사업 판단이 성립하지 않습니다.**

### 4.2 최종 숫자는 둘 — `mode`로 분기

```ts
type DevMode = 'sale' | 'hold';
```

| `mode` | 최종 숫자 | 비고 |
|---|---|---|
| `sale` (분양형) | 분양수입 − 총사업비 = **개발이익** | |
| **`hold` (보유·임대형)** | **개발 후 수익률** | **소형 상업용에서 더 흔함** |

**둘 다 `startDate`(착공 가능 시점)를 함께 냅니다.**

### 4.3 총 투입비 — 잠원동 실측

| 항목 | 금액 | 산출 |
|---|--:|---|
| ① 매입비 | 242.27억 | |
| ② 건축비 | **73.68억** | 614.03평 × **1,200만원/평** |
| ③ 예비비 | 5.00억 | |
| 소계 | **320.95억** | IM 표기 |
| **④ 취득세 (4.6%)** | **11.14억** | **IM 누락** |
| **총 투입비** | **332.09억** | **표준** |

> **원본 IM은 "세금·금융비용 제외"를 명시했습니다.** 정직하지만 매수인이 준비할 금액은 332억입니다. **표준에서는 취득세를 포함**시킵니다.

**현행 시스템 상수 800만원/평은 실물 대비 33% 과소입니다.** 614평 기준 24.56억 차이입니다.

### 4.4 개발 후 수익률 — 원본에 없던 숫자

stacking plan 월세 합계 **9,717.5만원** → 연 **11.66억**.

| basis | 값 |
|---|--:|
| `gross_price` (소계 320.95억) | **3.63%** |
| `gross_price_deposit` | 3.77% |
| **취득세 포함 (332.09억)** | **3.51%** |

**매수인이 직접 계산해야 했습니다.** 표준에서는 A16의 최종 값으로 강제합니다.

### 4.5 🔴 용적률 — 가장 위험한 상수

```ts
export async function resolveTargetFar(pnu: string): Promise<Assumption<number>> {
  const plan = await fetchLandUsePlan(pnu);
  if (!plan?.floorAreaRatioMax) {
    return { key: 'targetFarByZoning', value: null, /* ... */ };   // ★ 산출 거부
  }
  return { /* value: plan.floorAreaRatioMax */ };
}
```

| | 용적률 | 지상 연면적 |
|---|--:|--:|
| 시스템 기본값 (폐기) | 400% | 2,464㎡ |
| **제2종일반주거 상한** | **250%** | **1,540㎡** |
| 오차 | **+60%** | 분양수입 **1.6배 과대** |

**`value === null`이면 개발 규모 산출을 시도하지 않습니다.** (불변조건 4)

### 4.6 한시 완화 — 종료일 병기

| 항목 | 값 |
|---|---|
| 제도 | 서울시 소규모 건축물 용적률 완화 |
| 2종일반주거 | 200% → **250%** |
| 3종일반주거 | 250% → **300%** |
| 시행 | 2025-05-19 |
| **종료** | **2028-05-18** |

```ts
if (headline.regulationExpiry) {
  note(`용적률 완화는 ${fmt(regulationExpiry)}까지 한시 적용되며, 잔여 ${daysLeft}일입니다.`);
}
```

**한시 제도를 근거로 사업성을 제시할 때 종료일과 잔여 기간을 반드시 병기합니다.** 잠원동 IM 작성 시점 기준 잔여 749일이었으나 표기가 없었습니다.

### 4.7 필요 자기자본 — PF 규제

| 연도 | 자기자본비율 |
|:-:|--:|
| 2026 | **10%** |
| 2027 | 15% |
| 2028 | **20%** |

```ts
export function requiredEquity(totalCostKrw: number, startYear: number): number | null {
  const ratio = ASSUMPTIONS.pfEquityRatioByYear.value![startYear];
  return ratio == null ? null : totalCostKrw * ratio;
}
```

**착공 연도가 1년 밀리면 필요 자기자본이 5%p 늘어납니다.** 332억 기준 16.6억입니다.

### 4.8 🔴 최소 해상도는 R1입니다

**매도인 명도가 한국 관행입니다.**

| 명도 책임 | 최소 해상도 | 미달 시 |
|---|:-:|---|
| **매도인** | **R1** | 명도 특약 4항 명기 |
| 매수인 | **R3** | **사업수지 섹션 숨김** |
| 나대지 | — | 명도 개념 자체가 없음 |

**명도 책임이 해상도를 결정합니다.** 매수인 부담일 때만 임차인별 상세가 필요합니다.

---

## 5. operating — 운영형

### 5.1 최종 숫자 = GOP + 실적 검증 수준

**GOP만으로는 부족합니다.** 같은 GOP라도 실사 자료가 있느냐에 따라 신뢰도가 다릅니다.

```ts
export type VerificationLevel = 'verified' | 'partial' | 'unverified';
```

| 수준 | 근거 | 표기 |
|---|---|---|
| `verified` | 세무신고 실적 2년 이상 | **실적 검증** |
| `partial` | 운영사 제공 자료 | 운영사 자료 |
| **`unverified`** | 시장 평균 역산 | **◇ 가정** |

### 5.2 ◇ 가정 프레임

시장 지표로 역산할 때는 **모든 숫자에 ◇를 붙입니다.**

| 항목 | 값 | 출처 |
|---|--:|---|
| 서울 호텔 RevPAR | 207,345원 | 2025 평균 · 4~5성급 포함 |

**소형 숙박시설에 4~5성급 포함 평균을 그대로 쓰면 과대평가됩니다.** 등급 보정 없이는 `unverified`를 벗어날 수 없습니다.

### 5.3 🔴 GOP 산출을 보류합니다

```
financials.ts:132   Opex Ratio — 호텔 = 35%
financials.ts:421   GOP 마진율 기본값   = 35%
```

**Opex 35%면 GOP 마진은 65%가 됩니다.** 업계 통상은 30~40%입니다.

| 가정 | GOP 마진 | 판정 |
|---|--:|---|
| Opex 35% 적용 | 65% | **비현실적** |
| GOP 마진 35% 직접 사용 | 35% | 통상 범위 |

**두 값이 같은 것은 우연으로 보기 어렵습니다.** 어느 쪽 의도인지 확인될 때까지 `gop_price`를 렌더하지 않습니다.

```ts
if (ASSUMPTIONS.gopMarginPct.value == null) {
  deficiencies.push({ field: 'gopMarginPct', label: 'GOP 마진율',
    affects: ['yield_noi'], severity: 'block',
    nextBest: '최근 2개년 손익계산서' });
  return { posture: 'operating', gop: null, verificationLevel: 'unverified' };
}
```

---

## 6. trading — 매매형

### 6.1 최종 숫자 = 보유기간 총비용 + 출구가

**차익만 제시하면 보유비용이 숨습니다.**

```
보유기간 총비용 = 취득세 + 중개보수 + 연간 보유세 × 년수 + 대출이자 × 년수 − 임대수입 × 년수
```

### 6.2 🔴 목표 매각가를 창작하지 않습니다

| 폐기 | 현행 | 사유 |
|---|---|---|
| Trading 목표 매각가 | 매입가 × **1.2** | **comps 없이 차익 23억 창작** |
| Trading 비교사례 | 매입 평당가 × **1.15** | 동일 |

```ts
export function exitPrice(comps: Comp[] | null): number | null {
  if (!comps?.length) return null;      // ★ 추정 금지
  return median(comps.map(c => c.pricePerPyeong)) * subjectPyeong;
}
```

**`manualComps`가 없으면 `exitPrice: null`이고 출구 섹션을 렌더하지 않습니다.** (불변조건 5)

### 6.3 comps 커버리지 제약

```typescript
// price-prediction.ts:77
if (isNaN(price) || price < 2_000_000_000) continue;   // 20억 미만 제외
```

| 구간 | 자동 조회 | 주력(30~500억) 대비 |
|---|:-:|---|
| 20억 미만 | ✗ | 주력 밖 — 영향 없음 |
| 30억 ~ 300억 | ○ | B1·B2·B3 정상 |
| **300억 초과** | **✗** | **B4 (300~500억) 공백** |

**주력 상단인 B4(300~500억)에서 비교사례가 구조적으로 0건입니다.** 해당 구간은 `manualComps` 입력 없이 가격 근거 섹션을 렌더하지 않습니다. (불변조건 16)

> **매매형(trading)에서 특히 치명적입니다.** 출구가는 comps로만 산출하는데(§6.2), B4 물건은 자동 조회가 아예 되지 않습니다. **300억 이상 매매형 딜은 `manualComps` 입력이 사실상 필수 절차**입니다.

### 6.4 세후 차익 — 보유기간이 뒤집습니다

| 보유기간 | 세율 |
|---|---|
| **1년 미만** | **50%** |
| 1년 이상 | 6~45% 누진 |

```ts
export function afterTaxGain(gross: number, years: number): number {
  return gross * (1 - (years < 1 ? 0.50 : progressiveRate(gross)));
}
```

**당산동 세전 8.73억 기준.**

| 보유 | 세율 | 세후 차익 |
|:-:|--:|--:|
| 11개월 | **50%** | **4.37억** |
| 2년 | 누진 | 산출에 과세표준 필요 |

> **1년 경계에서 차익이 반토막 납니다.** 매매형 IM에서 보유기간을 명시하지 않으면 의미가 없습니다.

### 6.5 매매형의 역설

**차익이 큰 물건일수록 보유기간이 길어야 하고, 보유기간이 길수록 캐리 비용이 쌓입니다.** 두 숫자를 같이 보여주지 않으면 판단할 수 없습니다.

---

## 7. 원장 등가물

| 포스처 | 원장 | 최소 필수 |
|---|---|---|
| **income · trading** | **렌트롤** | 호실·업종·보증금·월세·만료일·상태 |
| **owner_occupied** | **공간 배분표** | 렌트롤 + 자가사용 구획 |
| **development** | **명도 원장 · 규모 검토표 · stacking plan** | 3종 (§4.1) |
| **operating** | **운영 실적표** | 객실·가동률·ADR 또는 매출·Opex |

**전부 `lease_ledger` 한 테이블에 담습니다.** 포스처가 바뀌어도 원본 행은 그대로이고 **읽는 방식만 달라집니다.**

---

## 8. 포스처 전이

중개인이 포스처를 바꾸면 **입력을 다시 받지 않습니다.**

| 전이 | 추가로 필요한 것 |
|---|---|
| income → owner_occupied | `marketRentPerPyeong` · 자가사용 구획 |
| income → development | 용도지역 · 명도 책임 · 공사비 |
| income → trading | `manualComps` · 목표 보유기간 |
| development → income | **없음** (이미 상위 집합) |

```ts
export function transitionGaps(from: InvestmentPosture, to: InvestmentPosture, core: IMCore): Deficiency[] {
  return REQUIRED_BY_POSTURE
    .filter(r => r.requiredFor.includes(to) && !r.requiredFor.includes(from))
    .filter(r => core.raw[r.field] == null)
    .map(r => ({ field: r.field, label: r.label, affects: [], nextBest: null, severity: 'block' }));
}
```

**전이 시 부족한 칸만 물어봅니다.** 처음부터 다시 받으면 아무도 포스처를 바꾸지 않습니다.

---

## 9. A16 표 구성 — D7 인계

| 좌표 | 내용 | 원천 |
|---|---|---|
| 좌측 표 | 매매가 · 취득세 · 중개보수 · 기타 · **총취득원가** | §2.2 |
| 우측 표 | LTV 0/40/50% × 대출·실투자금·**월 순현금**·수익률 | §2.4 |
| 경고 띠 | 역레버리지 문장 | §2.5 |
| 전제 주석 | 금리 · 취득세율 · 가정 출처 | D4 |

**포스처별 우측 표 교체.**

| 포스처 | 우측 표 |
|---|---|
| income | LTV 시나리오 |
| owner_occupied | 실질 부담 비교 (현 임차료 vs 매수 후) |
| development | 투입비 3단 + 개발 후 수익률 |
| operating | GOP 산출 내역 (**검증 수준 병기**) |
| trading | 보유비용 누적 + 세후 차익 |

**좌측 총취득원가 표는 5종 공통입니다.**

---

## 10. 미확정 2건

| # | 항목 | 확정 |
|:-:|---|---|
| A | **호텔 Opex 35% ↔ GOP 마진 35%** | **단계 2 착수 시 코드 확인** |
| B | 실제 포스처 분포 | **기본값 제거 후 30일 관측** |

### 10.1 B가 로드맵을 바꿀 수 있습니다

개발형·운영형이 실제로 0건이면 단계 10의 우선순위를 income에 집중해야 합니다. **기본값을 제거하기 전에는 판단 근거가 없습니다.**

---

## 11. 다음 문서 인계

| 인계 | 받는 곳 |
|---|---|
| §9 A16 표 구성 · 포스처별 우측 표 | **D7** |
| §2.4 LTV 시나리오 숫자 | **D8** Hero 지표 |
| §1.2 판별표 | **D11** 현장 입력 |
| §8 전이 갭 | **D11** |
