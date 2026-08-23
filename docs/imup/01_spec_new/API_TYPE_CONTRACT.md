# API·타입 계약서

> **D3** · `IM_SYSTEM_SSOT.md` v1.4 단계 3 / 3.5 / 4 구현 사양
> **이 문서의 타입은 의사코드가 아닙니다.** 그대로 `src/types/im.ts`에 붙여 넣어 컴파일되어야 합니다.

| | |
|---|---|
| **문서 ID** | D3 |
| **소유** | 개발팀 (타입 정의는 PR로만 변경) |
| **선행 정본** | `IM_SYSTEM_SSOT.md` v1.4 §4·§5·§6·§8 · `ASSUMPTION_REGISTRY.md` (D4) · `GENERATION_PERF_SPEC.md` (D13) |
| **의존 문서** | **D6 · D9 · D7 · D8 · D10 · D2 (6종)** |
| **대상 단계** | 3 (5.0일) · 3.5 (4.0일) · 4 (8.0일) |
| **작성일** | 2026-08-23 |

---

## 0. 이 문서가 존재하는 이유

### 0.1 사고는 전부 계층 간 이름이 어긋나서 났습니다

이번 진단에서 확인된 스키마-코드 불일치 3건은 **성격이 같습니다.**

| 사고 | 실제 원인 |
|---|---|
| `im_generation_cost_log` | 코드가 참조하는 테이블이 **DB에 없음** → `cost-tracker.ts` 전체 미작동 |
| `im_documents` | 동일 |
| `lease_spaces` / `lease_units` | 같은 개념이 **두 테이블로 분열** (3/13 · 5/13 컬럼 사용) |

세 건 모두 "타입은 있는데 저쪽에 없다"입니다. **한 계층에서만 이름을 정하면 다시 발생합니다.**

### 0.2 그래서 3중 매핑을 계약으로 고정합니다

```
엑셀 컬럼      "적용법령"
DB 컬럼        legal_basis      VARCHAR(10)
TypeScript     legalBasis       '상가' | '주택' | '미확인'
```

**셋 중 하나만 바꾸는 PR은 머지하지 않습니다.** §3.2가 21컬럼 전부에 대해 이 대응을 고정합니다.

### 0.3 🔴 섹션과 아키타입은 다른 것입니다

D13에서 확인한 정정을 타입으로 고정합니다.

| 개념 | 정의 | 개수 | 타입 |
|---|---|:-:|---|
| **섹션** | LLM이 생성하는 **텍스트 단위** | **7** | `SectionType` |
| **아키타입** | PPTX **슬라이드 레이아웃** | A01~A17 | `ArchetypeId` |

12페이지 PPTX는 7섹션에서 파생됩니다. **1:1이 아니며, 아키타입을 추가해도 생성 시간은 늘지 않습니다.**

> SSoT v1.2~v1.4에 "A16·A17 신설 = 섹션 +2 = 154초"라고 기술된 부분은 틀렸고, SSoT §2.2에 정정을 반영했습니다.

---

## 1. 온톨로지 3축

### 1.1 타입 정의

```ts
/** 법정 용도 — 건축물대장 주용도 (29종) */
export type BuildingUse =
  | '단독주택' | '공동주택' | '제1종근린생활시설' | '제2종근린생활시설'
  | '문화및집회시설' | '종교시설' | '판매시설' | '운수시설'
  | '의료시설' | '교육연구시설' | '노유자시설' | '수련시설'
  | '운동시설' | '업무시설' | '숙박시설' | '위락시설'
  | '공장' | '창고시설' | '위험물저장및처리시설' | '자동차관련시설'
  | '동물및식물관련시설' | '자원순환관련시설' | '교정시설' | '국방군사시설'
  | '방송통신시설' | '발전시설' | '묘지관련시설' | '관광휴게시설' | '그밖의시설';

/** 시장 통용 자산유형 (17종) */
export type AssetType =
  | 'small_building' | 'retail_strip' | 'office' | 'mixed_use'
  | 'residential_rental' | 'officetel' | 'logistics' | 'factory'
  | 'land' | 'hotel' | 'accommodation' | 'medical'
  | 'education' | 'culture' | 'parking' | 'data_center' | 'unknown';

/** 투자 자세 (5종) — 기본값 없음 */
export type InvestmentPosture =
  | 'income' | 'owner_occupied' | 'development' | 'operating' | 'trading';

export interface Ontology {
  buildingUse: BuildingUse | null;      // 대장 미확보 시 null
  assetType: AssetType;                 // 판별 실패 시 'unknown'
  posture: InvestmentPosture;           // ★ null 불가 — 사용자가 반드시 고른다
}
```

### 1.1A 🔴 `PriceBand` — 주력 대역 정본

**주력 거래 대역은 30억~500억 상업용 부동산입니다.** 퓨샷 조회·골든 커버리지·comps 정책이 전부 이 대역을 기준으로 정의됩니다.

```ts
export type PriceBand = 'B1' | 'B2' | 'B3' | 'B4' | 'below' | 'above';

export const PRICE_BANDS: { band: PriceBand; minKrw: number; maxKrw: number }[] = [
  { band: 'B1', minKrw:  3_000_000_000, maxKrw:  8_000_000_000 },
  { band: 'B2', minKrw:  8_000_000_000, maxKrw: 15_000_000_000 },
  { band: 'B3', minKrw: 15_000_000_000, maxKrw: 30_000_000_000 },
  { band: 'B4', minKrw: 30_000_000_000, maxKrw: 50_000_000_000 },
];

export function resolvePriceBand(priceKrw: number): PriceBand {
  if (priceKrw <  3_000_000_000) return 'below';   // 주력 밖
  if (priceKrw >= 50_000_000_000) return 'above';  // 주력 밖
  return PRICE_BANDS.find(b => priceKrw >= b.minKrw && priceKrw < b.maxKrw)!.band;
}
```

| 밴드 | 구간 | 매수 주체 (통상) |
|:-:|---|---|
| **B1** | 30~80억 | 개인 자산가 · 소형 법인 |
| **B2** | 80~150억 | 개인 자산가 · 법인 사옥 |
| **B3** | 150~300억 | 법인 · 자산관리회사 |
| **B4** | **300~500억** | **법인 · 기관 · 시행사** |

> **밴드가 올라갈수록 매수 주체가 개인에서 법인·기관으로 이동합니다.** 어휘와 근거 수준을 B4에서 그대로 B1에 쓰면 과하고, 반대면 부족합니다. 퓨샷은 **같은 밴드를 우선**합니다.

### 1.2 🔴 `posture`에 기본값을 두지 않습니다

```ts
// ❌ 금지
const posture = input.posture ?? 'income';

// ✅ 계약
export function requirePosture(input: RawInput): InvestmentPosture {
  if (!input.posture) {
    throw new InputRequiredError('posture', '투자 자세를 선택해야 IM을 생성할 수 있습니다');
  }
  return input.posture;
}
```

**실사용 62건이 전부 `income`인 것은 선호가 아니라 기본값의 결과일 가능성이 높습니다.** 기본값을 없애면 실제 분포가 처음으로 관측됩니다.

### 1.3 `assetType` 판별 — 단계 3.5

`unknown` 30건의 원인을 입력 단계에서 잡습니다.

```ts
export interface AssetTypeVerdict {
  assetType: AssetType;
  confidence: 'high' | 'medium' | 'low';
  basis: string;                        // 화면 노출
  needsConfirmation: boolean;           // low → 사용자 확인 요청
}

export function classifyAssetType(
  use: BuildingUse | null,
  totalFloorAreaSqm: number | null,
  floors: number | null,
): AssetTypeVerdict {
  if (!use) {
    return { assetType: 'unknown', confidence: 'low',
      basis: '건축물대장 주용도 미확보', needsConfirmation: true };
  }
  // 구현은 D10 §2 판별표를 따릅니다.
  return { assetType: 'unknown', confidence: 'low', basis: '', needsConfirmation: true };
}
```

**`unknown`은 오류가 아니라 상태입니다.** 화면에 "자산유형 확인 필요"로 노출하고 사용자가 고릅니다.

---

## 2. 재무 계약

### 2.1 입력

```ts
export interface FinancialInput {
  priceKrw: number;                     // 필수
  depositKrw: number;                   // 필수 (0 허용)
  monthlyRentKrw: number;               // 필수
  opexKrw: number | null;               // ★ null이면 NOI 계열 미산출
  mgmtFeeKrw: number | null;
  loanKrw: number | null;
  loanRate: number | null;              // null이면 ASSUMPTIONS.loanRateDefault
  brokerFeeKrw: number | null;
  otherCostKrw: number | null;
}
```

### 2.2 `CapRateBasis` 7종 — 전량 열거

```ts
export type CapRateBasis =
  | 'gross_price'          // 연 임대료 / 매매가
  | 'gross_price_deposit'  // 연 임대료 / (매매가 − 보증금)
  | 'noi_price'            // NOI / 매매가
  | 'noi_price_deposit'    // NOI / (매매가 − 보증금)
  | 'noi_equity'           // NOI / 실투자금
  | 'noi_total_cost'       // NOI / 총취득원가
  | 'gop_price';           // GOP / 매매가 (operating 전용)

export const BASIS_LABEL: Record<CapRateBasis, string> = {
  gross_price:         '총임대료 ÷ 매매가',
  gross_price_deposit: '총임대료 ÷ (매매가 − 보증금)',
  noi_price:           'NOI ÷ 매매가',
  noi_price_deposit:   'NOI ÷ (매매가 − 보증금)',
  noi_equity:          'NOI ÷ 실투자금',
  noi_total_cost:      'NOI ÷ 총취득원가',
  gop_price:           'GOP ÷ 매매가',
};

export const NET_BASES: readonly CapRateBasis[] =
  ['noi_price', 'noi_price_deposit', 'noi_equity', 'noi_total_cost'] as const;

export interface YieldValue {
  value: number;
  basis: CapRateBasis;
}
```

**`YieldValue`를 `number`로 대체하는 PR은 머지하지 않습니다.** 불변조건 2·3이 타입으로 강제되는 지점입니다.

### 2.3 라벨 규칙 — 불변조건 3

```ts
export function renderYield(y: YieldValue): string {
  const label = NET_BASES.includes(y.basis) ? '연 순수익률' : '연 수익률';
  return `${label} ${y.value.toFixed(2)}% (${BASIS_LABEL[y.basis]})`;
}
```

| 계열 | 허용 라벨 | 금지 |
|---|---|---|
| `gross_*` | 연 수익률 · 총임대료 기준 | **순수익률 · NOI · Cap Rate** |
| `noi_*` | 연 순수익률 | — |
| `gop_price` | GOP 기준 수익률 | 순수익률 |

### 2.4 취득원가

```ts
export interface EquityBreakdown {
  price: number;
  acquisitionTax: number;               // 매매가 × 0.046
  brokerFee: number;
  otherCost: number;
  totalAcquisitionCost: number;         // ★ 화면 필수 노출
  deposit: number;
  loan: number;
  equity: number;                       // 실투자금
}
```

**4줄 내역(매매가·취득세·중개보수·기타)을 반드시 노출합니다.** 매수인이 검산할 수 없으면 총취득원가는 신뢰받지 못합니다.

### 2.5 `Headline` — 포스처별 최종 숫자

```ts
/** operating 포스처 — 실적 자료의 신뢰 수준 (D10 §5.1) */
export type VerificationLevel = 'verified' | 'partial' | 'unverified';

export type Headline =
  | { posture: 'income';
      monthlyNetCashFlow: number;
      negativeLeverage: boolean }
  | { posture: 'owner_occupied';
      effectiveBurden: number;
      savedRent: number | null }
  | { posture: 'development';
      mode: 'sale' | 'hold';
      profitRate?: number;
      postDevYield?: YieldValue;
      startDate: Date | null;
      vacateResponsibility: 'seller' | 'buyer' | 'undecided';
      regulationExpiry: Date | null;
      requiredEquity: number | null }
  | { posture: 'operating';
      gop: number | null;
      verificationLevel: VerificationLevel }
  | { posture: 'trading';
      holdingCost: number;
      exitPrice: number | null;
      afterTaxGain: { years: number; gain: number }[] };
```

판별 유니온이므로 `switch (headline.posture)`가 전 분기를 강제합니다. **타입으로 막지 않으면 income의 `monthlyNetCashFlow`가 전 포스처에 복사됩니다.**

### 2.6 가정값 참조 — D4 키 21종

```ts
import { ASSUMPTIONS } from './assumptions';   // D4 레지스트리

// ✅ 계약
const tax = i.priceKrw * ASSUMPTIONS.acquisitionTaxRate.value!;

// ❌ 금지 — 리터럴 직접 사용
const tax = i.priceKrw * 0.046;
```

| 계층 | 키 수 | `value` |
|---|:-:|---|
| `legal` | 7 | 5종 상수 + **2종 `null` 가능** |
| `market_default` | 8 | 항상 존재 |
| `user_input` | 6 | **`null` 기본** |
| **계** | **21** | |

**`legal` 계층 `value === null`이면 해당 산출을 시도하지 않습니다.** (불변조건 4)

---

## 3. 데이터 계층 — 3중 매핑

### 3.1 `LeaseRow`

```ts
export type LeaseState  = '임대중' | '공실' | '자가사용';
export type LegalBasis  = '상가' | '주택' | '미확인';
export type Renewal     = '있음' | '없음' | '모름';
export type Opposing    = '사업자등록' | '주민등록' | '미확인';

export interface LeaseRow {
  // R1 — 발행 최소선
  unitLabel: string;
  tenantBusiness: string | null;        // 원문 그대로 · 추론 금지
  depositKrw: number | null;
  monthlyRentKrw: number | null;
  currentExpiryDate: string | null;     // YYYY-MM-DD
  leaseState: LeaseState;
  // R2
  contractGroup: string | null;
  leaseAreaSqm: number | null;
  legalBasis: LegalBasis | null;
  mgmtFeeKrw: number | null;
  currentStartDate: string | null;
  // R3
  firstContractDate: string | null;
  renewalExercised: Renewal | null;
  opposingPower: Opposing | null;
  // 공통
  note: string | null;
}
```

### 3.2 🔴 3중 매핑표 — 21컬럼

**입력 15 + 자동 6.** 엑셀 열 순서 = DB 컬럼 순서 = 타입 필드 순서입니다.

| # | 엑셀 컬럼 | DB 컬럼 | TypeScript | 해상도 |
|:-:|---|---|---|:-:|
| 1 | 호실/층 | `unit_label` | `unitLabel: string` | **R1** |
| 2 | 계약그룹 | `contract_group` | `contractGroup: string \| null` | R2 |
| 3 | 임대면적(㎡) | `lease_area_sqm` | `leaseAreaSqm: number \| null` | R2 |
| 4 | 업종/상호 (원문) | `tenant_business` | `tenantBusiness: string \| null` | **R1** |
| 5 | 적용법령 | `legal_basis` | `legalBasis: LegalBasis \| null` | R2 |
| 6 | 보증금(원) | `deposit_krw` | `depositKrw: number \| null` | **R1** |
| 7 | 월세(원,VAT별도) | `monthly_rent_krw` | `monthlyRentKrw: number \| null` | **R1** |
| 8 | 관리비(원,VAT별도) | `mgmt_fee_krw` | `mgmtFeeKrw: number \| null` | R2 |
| 9 | 최초 계약일 | `first_contract_date` | `firstContractDate: string \| null` | **R3** |
| 10 | 현 계약 시작일 | `current_start_date` | `currentStartDate: string \| null` | R2 |
| 11 | 현 계약 만료일 | `current_expiry_date` | `currentExpiryDate: string \| null` | **R1** |
| 12 | 갱신요구권 행사 | `renewal_exercised` | `renewalExercised: Renewal \| null` | **R3** |
| 13 | 대항력 요건 | `opposing_power` | `opposingPower: Opposing \| null` | **R3** |
| 14 | 임대상태 | `lease_state` | `leaseState: LeaseState` | **R1** |
| 15 | 비고 | `note` | `note: string \| null` | — |

**자동 산출 6종 — DB에 저장하지 않습니다.**

| # | 엑셀 컬럼 | 산출 함수 | 저장 |
|:-:|---|---|:-:|
| 16 | 임대면적(평) | `sqmToPyeong()` | ✗ |
| 17 | 환산보증금(자동) | `convertedDeposit()` | ✗ |
| 18 | 상임법 전면적용 | `isFullyCovered()` | ✗ |
| 19 | 갱신권 잔여(자동) | `vacatePoint()` | ✗ |
| 20 | 계약 상태(자동) | `contractStatus()` | ✗ |
| 21 | 월 총수입(자동) | `monthlyGross()` | ✗ |

> **파생값을 컬럼으로 저장하면 원본과 어긋납니다.** 산출 시점의 기준일이 달라지기 때문입니다. 전부 조회 시 계산합니다.

### 3.3 🔴 갱신요구권 — 상가와 주택은 산식이 다릅니다

이번 세션에서 **제가 먼저 틀렸던 지점**이라 계약으로 고정합니다.

```ts
export type VacateVerdict =
  | { state: 'determined'; at: string; reason?: string }
  | { state: 'unknown';    reason: string };

/** 상가 — 최초계약일 기산 10년 */
export function commercialVacatePoint(u: LeaseRow, asOf: Date): VacateVerdict {
  if (!u.firstContractDate) {
    return { state: 'unknown', reason: '최초 계약일 확인 필요' };
  }
  const elapsed = yearsBetween(new Date(u.firstContractDate), asOf);
  return { state: 'determined', at: addYears(u.firstContractDate, 10),
           reason: `잔여 ${Math.max(0, 10 - elapsed).toFixed(1)}년` };
}

/** 주택 — 1회·2년 · 행사 이력이 없으면 산출 불가 */
export function residentialVacatePoint(u: LeaseRow): VacateVerdict {
  if (u.renewalExercised == null || u.renewalExercised === '모름') {
    return { state: 'unknown', reason: '갱신요구권 행사 이력 확인 필요' };
  }
  if (!u.currentExpiryDate) {
    return { state: 'unknown', reason: '현 계약 만료일 확인 필요' };
  }
  return u.renewalExercised === '있음'
    ? { state: 'determined', at: u.currentExpiryDate, reason: '갱신요구권 소진 (1회)' }
    : { state: 'determined', at: addMonths(u.currentExpiryDate, 24), reason: '갱신 시 +2년' };
}
```

| 항목 | 상가 | 주택 |
|---|---|---|
| 기산점 | **최초 계약일** | 현 계약 만료일 |
| 총 기간 | 10년 | 1회 · +2년 |
| 필수 입력 | `firstContractDate` | **`renewalExercised`** |
| 최초계약일로 계산 | 가능 | **불가** |

> **주택 계약에 상가 산식을 적용하면 명도 시점을 최대 2년 9개월 늦게 봅니다.** 실측 사례에서 확인된 오차입니다. (불변조건 7)

### 3.4 해상도

```ts
export type Resolution = 'R0' | 'R1' | 'R2' | 'R3';

export function resolveLedger(rows: LeaseRow[]): Resolution {
  const live = rows.filter(r => r.leaseState === '임대중');
  if (!live.length) return 'R0';
  const r1 = live.every(r => r.tenantBusiness && r.currentExpiryDate);
  if (!r1) return 'R0';
  const r2 = rows.every(r => r.leaseAreaSqm != null && r.legalBasis != null)
          && live.every(r => r.mgmtFeeKrw != null);
  if (!r2) return 'R1';
  const r3 = live.every(r => r.firstContractDate && r.opposingPower !== '미확인');
  return r3 ? 'R3' : 'R2';
}
```

### 3.5 렌더는 등급이 아니라 기능으로 판정합니다

```ts
export type Capability =
  | 'yield_gross' | 'yield_noi' | 'vacate_schedule'
  | 'rent_normalization' | 'dev_feasibility' | 'saved_rent';

export interface CapabilitySpec {
  capability: Capability;
  requires: (keyof LeaseRow | string)[];
}

export function resolveCapabilities(rows: LeaseRow[], fin: FinancialInput): Set<Capability> {
  const caps = new Set<Capability>();
  if (rows.some(r => r.monthlyRentKrw != null)) caps.add('yield_gross');
  if (fin.opexKrw != null)                      caps.add('yield_noi');
  if (rows.every(r => r.leaseState !== '임대중'
      || vacatePoint(r).state === 'determined')) caps.add('vacate_schedule');
  return caps;
}
```

**종합 등급으로 막으면 이미 있는 자료로 만들 수 있는 것까지 버립니다.** R1 물건도 `yield_gross`는 냅니다.

---

## 4. 검증 계약

### 4.1 게이트 9종

```ts
export type GateCode =
  | 'G19' | 'C19' | 'G21' | 'C-BASIS'
  | 'G18' | 'G13' | 'G17' | 'F12' | 'F13';

export interface Violation {
  code: GateCode;
  block: boolean;                       // true면 발행 차단
  msg: string;
  ask?: string;                         // 사용자에게 물을 문장
  field?: string;
}
```

| 코드 | 검증 | `block` | 실패 시 |
|:-:|---|:-:|---|
| **G19** | 표지 합계 = 원장 합계 | **true** | 정본 질의 |
| **C19** | 임대면적 합 = 표기 연면적 (±2%) | **true** | 차단 |
| **G21** | 첨부 공부 소재지 = 본건 | **true** | 차단 |
| **C-BASIS** | 수익률에 `basis` 존재 | **true** | 렌더 거부 |
| G18 | 갱신권 산출 입력 존재 | false | "확인 필요" 치환 |
| G13 | 대항력 근거 없이 "없음" 표기 | **true** | 차단 |
| G17 | 업종 미기재 시 추론 | false | "미상" 치환 |
| F12 | 만료 계약 > 50% | **true** | 차단 |
| F13 | 30일 내 만료 | false | 경고 |

**차단 6종 · 경고 3종.** `block: true`가 하나라도 있으면 `publish()`는 예외를 던집니다.

### 4.2 FAST_MODE에서도 실행합니다

```ts
export function runDeterministicGates(ctx: IMCore): Violation[] { /* ... */ }

export async function publish(core: IMCore): Promise<PublishResult> {
  const violations = runDeterministicGates(core);      // ★ 모드 무관
  if (violations.some(v => v.block)) {
    return { published: false, violations };
  }
  return { published: true, violations, doc: render(core) };
}
```

**게이트는 LLM을 쓰지 않으므로 타임아웃과 무관합니다.** FAST_MODE에서 건너뛸 이유가 없습니다. (불변조건 11)

### 4.3 결손은 사라지지 않습니다

```ts
export interface Deficiency {
  field: string;
  label: string;                        // 화면 문구 — "최초 계약일"
  affects: Capability[];                // 이것이 없어서 못 하는 것
  nextBest: string | null;              // 다음에 채우면 가장 이득인 칸
  severity: 'block' | 'degrade' | 'note';
}
```

**`Deficiency[]`는 `IMCore`의 필수 필드입니다.** 빈 배열은 허용되지만 필드 자체를 뺄 수 없습니다. (불변조건 13)

### 4.4 NLG 마스크

```ts
export const BANNED_ABSOLUTE = ['Zero','제로','불패','완벽','무결점','영구적','극대화','초안정','100% 보장'];
export const BANNED_UNSOURCED = ['우량','최적','최고','독보적','유일'];
export const BANNED_AD = ['적극 추천','강력 추천','놓치면 후회','서두르셔야'];
```

`BANNED_UNSOURCED`는 **근거 슬롯이 연결되면 허용**됩니다. 나머지 둘은 무조건 제거합니다.

---

## 5. 렌더 계약

### 5.1 `IMCore` — 단일 자료구조

```ts
export interface IMCore {
  meta: {
    assetId: string;
    ontology: Ontology;
    generatedAt: string;
    resolution: Resolution;
    capabilities: Capability[];
  };
  address: Address;
  physical: PhysicalFacts;
  price: { askingKrw: number; perPyeongLand: number; officialLandPriceRatio: number | null };
  equity: EquityBreakdown;
  yields: Partial<Record<CapRateBasis, YieldValue>>;
  headline: Headline;
  leases: LeaseRow[];
  comps: Comp[];
  deficiencies: Deficiency[];           // ★ 마스킹하지 않음
  anchors: NumericalAnchors;
  provenance: Record<string, Provenance>;
  attachedDocs: AttachedDoc[];
}
```

### 5.2 렌더 경로

```
IMCore ──┬─→ 모바일 렌더
         ├─→ PPTX 렌더   (마크다운 경유 금지)
         └─→ 마크다운     (보관·검색용)
```

현행 `data-binder`의 `split('|')` 재파싱은 **폴백으로만 유지**합니다. 정상 경로에서 마크다운을 다시 파싱하면 오류가 증식합니다.

### 5.3 마스크

```ts
export type MaskLevel = 'public' | 'full';

export function applyMask(core: IMCore, level: MaskLevel): IMRendered {
  if (level === 'full') return render(core);
  return render({
    ...core,
    address: bandAddress(core.address),        // 지번 → 동
    leases: aggregateLeases(core.leases),      // 호실별 → 총액
    price: bandPrice(core.price),
    attachedDocs: [],
    deficiencies: core.deficiencies,           // ★ 그대로
  });
}
```

| 항목 | `public` | `full` |
|---|---|---|
| 주소 | 동까지 | 지번 |
| 렌트롤 | 총액 | 호실별 |
| 임차인 상호 | **제거** | 표기 |
| 첨부 공부 | 제거 | 표기 |
| **확인사항** | **그대로** | 그대로 |

**결손 표시가 신뢰를 만듭니다.** 공개 단계에서 확인사항을 가리면 남는 것은 광고뿐입니다. (불변조건 9·14)

---

## 6. 아키타입 Props — B3 인계

### 6.1 목록

```ts
export type ArchetypeId =
  | 'A01' | 'A02' | 'A03' | 'A04' | 'A05' | 'A06' | 'A07' | 'A08'
  | 'A09' | 'A10' | 'A13' | 'A14' | 'A15' | 'A16' | 'A17';
```

**`A11`·`A12`는 dead code이므로 타입에서 제외했습니다.** 나머지 **A08·A10·A13·A15는 D7 §2에서 전부 존치로 확정**했습니다 — 잠정 유보 상태였던 이 목록은 D7 §2가 정본입니다. **운용 15종.**

| p | 페이지 | 아키타입 | 원천 섹션 |
|:-:|---|:-:|---|
| 1 | 표지 | A01 | — (메타) |
| 2 | 한 장 요약 | A02 | 전 섹션 앵커 |
| 3 | 물건 개요 | A04 | `property_overview` |
| 4 | 입지 | A06 | `location_access` |
| 5 | 현황 (원장) | **A03** | `lease_status` |
| 6 | **투자 구조** | **A16** | `income_analysis` (신설 슬라이드) |
| 7 | 가격 근거 | A03 | `income_analysis` |
| 8 | 개선 여력 | A05 | `investment_thesis` |
| 8b | 준공 전 마케팅 | **A17** | development 전용 |
| 9 | 리스크·확인사항 | A07 | `risk_check` |
| 10·11 | 사진 | A14 | — |
| 12 | 거래 조건 | A09 | `next_steps` |

**7섹션 → 12페이지.** 아키타입 2종이 늘어도 LLM 호출은 늘지 않습니다.

### 6.2 A16 Props

```ts
export interface A16Props {
  equity: EquityBreakdown;
  ltvScenarios: { ltv: number; loan: number; equity: number; monthlyNet: number; roe: number | null }[];
  negativeLeverage: { active: boolean; grossYield: number; loanRate: number };
  assumptions: { key: string; label: string; basis: string }[];   // 전제 주석
}
```

| 요소 | X | Y | W | H |
|---|--:|--:|--:|--:|
| Kicker | 0.62 | 0.55 | 12.09 | 0.25 |
| Title | 0.62 | 0.85 | 12.09 | 0.40 |
| 총취득원가 표 (좌) | 0.62 | 1.55 | 5.60 | 2.20 |
| LTV 시나리오 표 (우) | 6.61 | 1.55 | 6.10 | 2.20 |
| 역레버리지 경고 | 0.62 | 4.00 | 12.09 | 0.70 |
| 전제 주석 | 0.62 | 4.85 | 12.09 | 1.90 |
| Footer | 0.62 | 6.94 | 12.09 | 0.30 |

**검증** — 본문 끝 6.75 vs Footer 6.94 (여유 0.19in) · 우측 끝 0.62 + 12.093 = 12.713 ✓

### 6.3 🔴 A03 — 8행 제한을 없앱니다

```ts
export interface A03Props {
  rows: LeaseRow[];                     // ★ 전량
  page: number;                         // 분할 시 1-base
  totalPages: number;
}

export function splitLedgerSlides(rows: LeaseRow[]): A03Props[] {
  const PER_SLIDE = 12;                 // 9pt 기준 수용량
  const pages = Math.ceil(rows.length / PER_SLIDE) || 1;
  return Array.from({ length: pages }, (_, i) => ({
    rows: rows.slice(i * PER_SLIDE, (i + 1) * PER_SLIDE),
    page: i + 1, totalPages: pages,
  }));
}
```

| 물건 | 행수 | 현행 표시 | **누락** | 개선 후 |
|---|--:|--:|--:|---|
| 당산동 | 8 | 8 | 0 | 1장 |
| **양평동** | **12** | 8 | **4행** | 1장 |
| 연남동 골든 | 11 | 8 | 3행 | 1장 |
| 잠원동 | 18 | 8 | **10행** | 2장 |

**"외 N건은 별첨 참조"는 금지합니다.** 별첨이 실제로 생성되는지 확인되지 않았고, 렌트롤은 매수인 판단의 핵심 원장입니다. (불변조건 18)

---

## 7. 계측 계약 — D6로 확장

### 7.1 지표 8종 · 명명 고정

**D6와 이 표의 `key`가 다르면 대시보드가 비어 보입니다.**

| # | `key` | 소스 |
|:-:|---|---|
| 1 | `fast_mode_rate` | `im_generation_metrics` |
| 2 | `fallback_rate` | 동일 |
| 3 | **`edit_rate`** | **`im_edit_events`** |
| 4 | `judge_score_dist` | `im_generation_metrics` |
| 5 | `publish_blocked_by_reason` | 동일 |
| 6 | `public_api_success_rate` | 신규 로깅 |
| 7 | **`stage_latency_ms`** | 동일 |
| 8 | `cost_per_doc` | 동일 |

### 7.2 구간 이름 — D13 4단계와 일치

```ts
export type Stage =
  | 'external_api' | 'rag' | 'section_llm' | 'judge' | 'postprocess'
  | 'queue_wait';   // D6 §4.1 — 미귀속 1.1초를 드러내기 위한 구간

export interface StageTiming {
  stage: Stage;
  sectionType?: SectionType;            // section_llm일 때만
  parallelGroup?: 1 | 2 | 3 | 4;        // D13 위상 정렬 단계
  ms: number;
}
```

### 7.3 처리 결과 4분할 — 불변조건 21

```ts
export type Outcome = 'completed' | 'intended_block' | 'input_missing' | 'system_error';
```

| `Outcome` | 판정 | 현재 | 목표 |
|---|---|--:|--:|
| `completed` | `status = 'completed'` | 59.1% | — |
| `intended_block` | `result.error` ~ 등급 D | 4.5% | **정상 · 목표 없음** |
| `input_missing` | ~ 입력 필요 / 정보 부족 | **36.4%** | **0%** |
| `system_error` | 그 외 전부 | **0.0%** | 0% 유지 |

**"성공률 59.1%"는 오도입니다.** 정상 처리율은 `completed + intended_block` = **63.6%**이고, 개선 대상은 36.4% 하나입니다.

---

## 8. API 계약

### 8.1 엔드포인트

| 메서드 | 경로 | 요청 | 응답 |
|---|---|---|---|
| POST | `/api/im/validate` | `RawInput` | `Violation[]` · **LLM 호출 없음** |
| POST | `/api/im/generate` | `RawInput` | `JobRef` (비동기) |
| GET | `/api/im/jobs/:id` | — | `JobStatus` |
| GET | `/api/im/:id?mask=public` | — | `IMRendered` |
| POST | `/api/im/:id/export/pptx` | `{ mask }` | 파일 |

### 8.2 🔴 `/validate`를 폼에서 먼저 호출합니다

30일간 **16건이 필수값 없이 서버까지 도달**했습니다. 서버 게이트가 0.6초에 막아 252회 LLM 호출을 아꼈지만, 그 전에 막았어야 합니다.

```ts
export interface InputRequirement {
  field: keyof RawInput;
  label: string;
  requiredFor: InvestmentPosture[];     // 이 포스처에서 필수
}

export const REQUIRED_BY_POSTURE: InputRequirement[] = [
  { field: 'priceKrw',       label: '매각 희망가', requiredFor: ['income','owner_occupied','development','operating','trading'] },
  { field: 'monthlyRentKrw', label: '월 임대료',   requiredFor: ['income'] },
  { field: 'targetFar',      label: '용도지역',     requiredFor: ['development'] },
  { field: 'gopMarginPct',   label: 'GOP 마진',    requiredFor: ['operating'] },
  { field: 'manualComps',    label: '비교사례',     requiredFor: ['trading'] },
];
```

**폼 검증과 서버 게이트를 둘 다 유지합니다.** 폼만 두면 API 직접 호출에 뚫리고, 서버만 두면 사용자가 104초를 기다린 뒤 실패를 봅니다. (불변조건 20)

### 8.3 오류 타입

```ts
export class InputRequiredError extends Error {
  constructor(public field: string, msg: string) { super(msg); this.name = 'InputRequiredError'; }
}
export class GateBlockedError extends Error {
  constructor(public violations: Violation[]) { super('발행 게이트 차단'); this.name = 'GateBlockedError'; }
}
export class UpstreamError extends Error {          // ★ 이것만 system_error
  constructor(public source: 'llm' | 'public_api' | 'db', msg: string) { super(msg); this.name = 'UpstreamError'; }
}
```

**`result.error` 문자열 매칭을 걷어내고 `name`으로 분류합니다.** 현행은 `LIKE '%등급 D%'`로 판별하고 있어 문구를 바꾸면 통계가 깨집니다.

---

## 9. 섹션 타입 — D13 정합

```ts
export type SectionType =
  | 'property_overview' | 'location_access' | 'lease_status'
  | 'income_analysis'   | 'risk_check'      | 'investment_thesis'
  | 'next_steps';
```

**7개입니다.** 포스처에 따라 `income_analysis`의 **내용**이 달라지지만 개수는 늘지 않습니다.

| 포스처 | 4단계 실행 그래프 | 섹션 수 |
|---|---|:-:|
| income | 1단 4 → 2단 1 → 3단 1 → 4단 1 | 7 |
| owner_occupied | 동일 | 7 |
| development | 동일 (내용 교체) | 7 |
| operating | 동일 | 7 |
| trading | 동일 | 7 |

---

## 10. 계약 위반을 CI에서 막습니다

### 10.1 차단 규칙 6종

| # | 검사 | 도구 |
|:-:|---|---|
| 1 | **미존재 테이블 참조** | 스키마 덤프 대조 스크립트 |
| 2 | `YieldValue` → `number` 축약 | `tsc` (타입으로 자동) |
| 3 | 재무 리터럴 하드코딩 | ESLint `no-magic-numbers` (재무 모듈 한정) |
| 4 | `posture` 기본값 대입 | grep `posture ?? ` · `posture \|\| ` |
| 5 | `deficiencies` 누락 | 타입 필수 필드 |
| 6 | `result.error` 문자열 매칭 | grep `LIKE '%` |

### 10.2 1번이 가장 중요합니다

```bash
# 코드가 참조하는 테이블 ↔ 실제 스키마 대조
psql -Atc "SELECT tablename FROM pg_tables WHERE schemaname='public'" > /tmp/actual.txt
grep -rhoP "from\(['\"]\K[a-z_]+" src/ | sort -u > /tmp/referenced.txt
comm -13 /tmp/actual.txt /tmp/referenced.txt   # 비어 있어야 함
```

**`im_generation_cost_log` 3개월 미작동은 이 6줄로 첫날 잡혔을 것입니다.** (불변조건 12)

---

## 11. 미확정 3건 → **2건 해소 · 1건 잔존** (B3 반영)

| # | 항목 | 확정 시점 | 상태 |
|:-:|---|---|---|
| A | A08·A10·A13·A15 존치 여부 | B3 (D7 §2) | ✅ **해소 — 전부 존치 · 운용 15종** |
| B | `classifyAssetType` 판별표 | B3 (D10 §1.2) | ✅ **해소 — 17종 판별표 확정** |
| C | **호텔 Opex 35% ↔ GOP 마진 35%** | **단계 2 착수 시** | ⚪ **잔존** — `gop_price` 산출 보류 |

### 11.1 C가 가장 큽니다

```
financials.ts:132   Opex Ratio — 호텔 = 35%
financials.ts:421   GOP 마진율 기본값   = 35%
```

Opex 35%면 GOP 마진은 65%가 됩니다. 업계 통상은 30~40%입니다. **두 값이 같은 것이 우연이 아니라면 운영형 GOP가 약 2배로 산출되고 있습니다.**

확인 전까지 `gop_price`를 렌더하지 않습니다.

---

## 12. 다음 배치 인계

| 인계 | 받는 곳 |
|---|---|
| §6 아키타입 Props · A03 분할 | **D7** (B3) |
| §2.5 `Headline` 유니온 | **D10** (B3) |
| §5.3 `applyMask` · `IMRendered` | **D8** (B3) |
| §7 지표 8종 `key` | **D6** (B2 다음 문서) |
| §4 게이트 9종 · §3.3 갱신권 | **D9** (B2) |
| §3.2 3중 매핑표 21컬럼 | **D2** (B4 마이그레이션) |
