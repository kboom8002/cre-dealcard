# CREDEAL — IM 정밀도 명세 (고성과 브로커 요구 반영)

> 제이에스부동산중개 고성과 브로커 현장 요구 7건을 온톨로지·계산 엔진·레이아웃 규칙으로 옮기는 명세.
> `AGENTS.md`(조판) · `DISTRIBUTION_AND_IDENTITY.md`(배포·식별)의 세 번째 자매 문서입니다.

| | |
|---|---|
| **영향 패키지** | `ontology` · `ir` · `layout` · `render-pptx` · `gates` |
| **온톨로지 버전** | v0.1 → **v0.2** (하위 호환 깨짐 — 마이그레이션 필요) |
| **선행 문서** | `CREDEAL_v3.1_개정기획서.md` |
| **최종 수정** | 2026-08-03 |

---

## 0. 요약 — 7건은 3개 축으로 수렴한다

요구를 나열하면 산만하지만, 실제로는 세 가지 구조적 문제입니다.

| 축 | 문제의 본질 | 해당 요구 |
|---|---|---|
| **A. 계산 관점의 이원화** | 같은 물건에 정답이 하나가 아니다. 누가 보느냐에 따라 옳은 계산이 다르다 | ① Cap Rate · ② 총수익률 · ⑦ DCF |
| **B. 공부의 정밀 반영** | 온톨로지가 단일 필지·단순 규제를 가정한다. 현실은 다필지·제척·복합 규제다 | ③ 면적·제척 · ④ 토지이용계획 · ⑤ 입지 3측면 |
| **C. 임대차의 법적 정밀도** | "대항력 유/무"로 뭉뚱그린 것이 실제 리스크를 감춘다 | ⑥ 렌트롤 정밀 모드 |

축 A는 **파라미터화**, 축 B는 **슬롯 구조 변경**, 축 C는 **법률 판정 엔진 추가**입니다. 성격이 다르므로 워크스트림을 나눠 진행합니다.

---

## 1. 먼저 — 검증 중 발견한 정정 사항 2건

### 1.1 [중대] 샘플의 "전 임차인 대항력 없음"은 성립하기 어렵다

현 시연자료 Pro 슬라이드에 **"전 임차인 대항력 없음 (규칙 R10)"** 이 있습니다. 이는 부정확합니다.

상가건물임대차보호법상 **대항력은 건물 인도 + 사업자등록 신청으로 발생**하며(제3조), 환산보증금 초과 여부와 무관하게 적용됩니다. 영업 중인 임차인은 사실상 전부 대항력을 갖습니다.

호실별로 재계산하면 이렇습니다. (서울 기준 환산보증금 9억)

| 층 | 업종 | 보증금 | 월세 | 환산보증금 | 법 적용 |
|---|---|---:|---:|---:|---|
| B1 | 창고 | 0.5억 | 250만 | **3.0억** | **전면 적용** |
| 1F | 카페 | 3.0억 | 1,300만 | 16.0억 | 일부 적용 |
| 2F | 학원 | 2.5억 | 1,100만 | 13.5억 | 일부 적용 |
| 3F | 의원 | 2.5억 | 1,150만 | 14.0억 | 일부 적용 |
| 4F | 사무실 | 2.0억 | 900만 | 11.0억 | 일부 적용 |

환산보증금 = 보증금 + (월세 × 100)

**"일부 적용"이 무엇을 의미하는지가 핵심입니다.** 초과해도 아래는 그대로 적용됩니다.

| 조항 | 환산보증금 이하 | 초과 |
|---|---|---|
| 대항력 (제3조) | ○ | **○** |
| 계약갱신요구권 10년 (제10조) | ○ | **○** |
| 권리금 회수기회 보호 | ○ | **○** |
| 우선변제권 (제5조) | ○ | ✗ |
| 차임 인상률 5% 상한 | ○ | ✗ |

→ **R10 규칙을 재정의해야 합니다.** "대항력 없음"이 아니라 "우선변제권 없음 / 인상률 상한 미적용"이 정확한 표현이며, 이는 매수자에게 오히려 **유리한** 사실입니다(임대료 인상 여지). 반대로 갱신요구권 10년은 그대로 남으므로 명도 계획에는 제약입니다.

> 현 표현은 매수자에게 유리하게 오독될 수 있고, 실사에서 발견되면 신뢰를 잃습니다. 즉시 정정 대상입니다.

### 1.2 Cap Rate는 관점에 따라 0.86%p까지 벌어진다

같은 물건, 같은 임대차 조건인데 계산 관점이 바뀌면 이렇게 됩니다.

| 관점 | 산식 | 분모 | 결과 |
|---|---|---:|---:|
| 중개인형 (실투자금) | 연 임대료 ÷ (매매가 − 보증금) | 179.5억 | **3.14%** |
| 중개인형 (매매가) | 연 임대료 ÷ 매매가 | 190.0억 | 2.97% |
| 표준형 | NOI ÷ 매매가 | 190.0억 | 2.42% ← 현 샘플 |
| 회계사형 | NOI ÷ 총취득원가 | 200.95억 | **2.29%** |

총취득원가 = 190 + 취득세 8.74 + 등록·법무 0.30 + 중개보수 1.71 + 실사·감평 0.20

**격차 0.86%p.** 브로커가 3.14%로 말하고 매수자 회계사가 2.29%를 내면 딜이 깨집니다. 이것이 요구 ①의 실질입니다.

---

## 2. 축 A — 계산 관점의 이원화

### 2.1 Cap Rate 기준을 파라미터로 승격

```ts
// packages/ontology/src/finance.ts
export const CapRateBasis = z.enum([
  'broker_equity',    // 연 임대료 ÷ (매매가 − 보증금)   ← 중개인 실무 최다
  'broker_price',     // 연 임대료 ÷ 매매가
  'noi_price',        // NOI ÷ 매매가                    ← 국제 표준
  'noi_total_cost',   // NOI ÷ 총취득원가                ← 회계사형
]);

export const CapRateResult = z.object({
  basis: CapRateBasis,
  value: z.number(),
  numerator: Money,
  denominator: Money,
  label: z.string(),        // '중개인 관행 (실투자금 기준)'
  caveat: z.string(),       // 이 기준의 한계를 한 문장으로
});
```

**계산 엔진은 항상 네 값을 전부 산출합니다.** 표시 여부만 정책이 결정합니다.

### 2.2 총취득원가 구성

```ts
export const AcquisitionCost = z.object({
  price: Money,
  acquisitionTax: Money,          // 취득세 — 표준 4.6%, 중과 요건 별도 판정
  registrationLegal: Money,       // 등록면허세 · 법무비
  brokerageFee: Money,            // 중개보수 (법정 상한 0.9% 이내 협의)
  appraisalDueDiligence: Money,
  vatRefundEstimate: Money,       // 건물분 부가세 환급 예상 (법인·과세사업자)
  other: Money,
});
```

**함정 3가지 — 계산 엔진에 주석으로 박아둘 것**

1. **감가상각을 NOI에서 빼지 않는다.** 현금 유출이 아닙니다. 많은 중개인이 틀립니다.
2. **부가세는 건물분만 환급 대상**입니다. 토지분은 면세이므로 총취득원가에서 전액 차감하면 안 됩니다.
3. **CapEx 충당금은 NOI 아래**에 둡니다. 운영경비에 섞으면 국제 기준 Cap Rate와 비교 불가능해집니다.

### 2.3 노출 정책

| | Basic | Pro |
|---|---|---|
| 주 표시 | `broker_equity` (매수자가 익숙한 값) | `noi_price` |
| 병기 | `noi_price` | 4개 전부 + 차이 사유 |
| 차이 표기 | 격차 0.3%p 초과 시 강제 | 항상 |

Basic에서 중개인형을 앞세우는 이유는 **매수자가 그 숫자로 사고하기 때문**입니다. 표준형을 먼저 보여주면 "생각보다 낮네"로 읽히고 대화가 시작되지 않습니다. 다만 병기를 강제해 나중에 뒤집히지 않게 합니다.

### 2.4 총수익률 — 요구 ②의 실질

브로커 지적이 정확합니다. Cap 2.42%인 물건을 사는 이유가 임대수익일 리 없습니다. **자본이득이 본체**이고, 현 샘플은 그 절반만 보여줬습니다.

```
연 총수익률 = 현금흐름 수익률(CoC) + 자산가치 변동 기여율
자산가치 변동 기여율 = (매입가 × 지가변동률) ÷ 자기자본
```

역삼동 샘플로 계산하면 서사가 뒤집힙니다.

| 시나리오 | 무차입 (자기자본 179.5억) | LTV 55% (자기자본 75.0억) |
|---|---:|---:|
| 하락 −2.0% | **+0.44%** | −4.93% |
| 보수 0% | +2.56% | +0.13% |
| 기준 +2.5% | +5.21% | **+6.47%** |
| 낙관 +4.0% | +6.79% | **+10.27%** |

**정확한 설명은 "레버리지는 지가 변동의 증폭기"입니다.** 상승하면 유리, 하락하면 불리. 현금흐름만 보고 "역레버리지라 나쁘다"고 하는 것은 절반의 진실입니다.

```ts
export const ValueGrowth = z.object({
  landRatio: z.number().min(0).max(1),     // 토지 가치 비중 — 정밀 모드에서만
  scenarios: z.object({
    downside: z.number(),                  // 기본 −2.0%
    base: z.number(),                      // 동 단위 개별공시지가 3년 평균
    upside: z.number(),                    // 5년 최고
  }),
  source: z.enum(['gongsi_dong_3y', 'gongsi_dong_5y', 'transaction_based', 'manual']),
  buildingDepreciation: z.number().nullable(),   // null이면 미반영 (명시)
});
```

**하방 시나리오는 선택이 아니라 필수입니다.** 상승만 보여주면 투자 권유가 되고, 지가가 떨어졌을 때 레버리지가 손실을 증폭한다는 사실을 감춘 것이 됩니다. 게이트 G11이 이를 강제합니다.

**정밀도 한계를 문서에 명시할 것** — 브로커가 말한 "건물가격 × 지가상승률"은 실무 관행의 단순화입니다. 엄밀히는 토지는 상승하고 건물은 감가합니다. 강남 근생빌딩은 토지 비중이 75~85%라 근사가 성립하지만, **토지 비중이 낮은 물건(신축·고층)에서는 오차가 커집니다.** 정밀 모드에서 토지·건물 안분을 받고, 표준 모드에서는 근사임을 각주로 밝힙니다.

### 2.5 DCF · IRR 공개 정책 — 요구 ⑦

```ts
export const DisclosurePolicy = z.object({
  dcf:          z.enum(['hidden', 'summary', 'full']),
  irr:          z.enum(['hidden', 'summary', 'full']),
  sensitivity:  z.enum(['hidden', 'full']),
  capRateBases: z.array(CapRateBasis),
});

export const DISCLOSURE_DEFAULT: Record<Tier, DisclosurePolicy> = {
  basic: { dcf: 'hidden',  irr: 'hidden',  sensitivity: 'hidden',
           capRateBases: ['broker_equity', 'noi_price'] },
  pro:   { dcf: 'summary', irr: 'summary', sensitivity: 'full',
           capRateBases: ['broker_equity', 'broker_price', 'noi_price', 'noi_total_cost'] },
};
```

브로커가 매수자를 보고 `full`로 올리거나 `hidden`으로 내립니다.

**`summary` · `full` 노출 시 용어 해설이 필수입니다** (게이트 G14). NLG 마스크로 고정합니다.

| 용어 | 해설 마스크 |
|---|---|
| IRR | "10년간 보유하며 얻는 임대수익과 매각차익을 모두 합쳐, 투자금 대비 연평균 몇 %의 수익이 되는지를 나타냅니다." |
| Exit Cap | "10년 뒤 이 건물을 팔 때 시장이 매기는 수익률입니다. 낮을수록 비싸게 팔립니다." |
| NPV | "미래에 받을 돈을 오늘 가치로 환산해 매입가와 비교한 값입니다. 양수면 요구수익률을 넘습니다." |
| 할인율 | "매수자가 이 정도 위험이면 최소 이만큼은 받아야 한다고 보는 수익률입니다." |

그리고 **한국 매수자가 실제로 먼저 보는 지표를 상단에 배치**합니다 — 평당가 → 실투자금 → 연 임대수익률 → 대출 후 월 현금흐름 → 예상 매각가. IRR·NPV는 그 아래입니다.

---

## 3. 축 B — 공부의 정밀 반영

### 3.1 필지를 배열로 — 요구 ③

현 온톨로지는 단일 필지를 가정합니다. **이 구조는 지금 바꿔야 합니다.** 스칼라로 출시하면 나중에 배열로 못 고칩니다.

```ts
export const Parcel = z.object({
  pnu: z.string().length(19),        // 필지고유번호
  address: z.string(),
  jimok: z.string(),                 // 지목
  area: z.number(),                  // ㎡ (대장 면적)
  ownership: z.enum(['sole', 'shared']),
  shareNumerator: z.number().nullable(),
  shareDenominator: z.number().nullable(),
  exclusions: z.array(ExclusionItem),
});

export const ExclusionItem = z.object({
  kind: z.enum([
    'planned_road',    // 도시계획도로 저촉
    'buffer_green',    // 완충녹지
    'park',            // 공원
    'river',           // 하천구역
    'road_setback',    // 접도구역
    'slope',           // 법면 (건축 불가 경사)
    'other_share',     // 타인 공유지분
  ]),
  area: z.number(),
  affectsFAR: z.boolean(),           // 용적률 산정 대지면적에서 제외되는가
  provenance: Provenance,
});
```

### 3.2 유효 대지면적 — 여기가 가장 큰 함정

```ts
export function effectiveLandArea(parcels: Parcel[]): number {
  return parcels.reduce((sum, p) => {
    const owned = p.ownership === 'shared'
      ? p.area * (p.shareNumerator! / p.shareDenominator!)
      : p.area;
    const excluded = p.exclusions
      .filter(e => e.affectsFAR)
      .reduce((s, e) => s + e.area, 0);
    return sum + Math.max(0, owned - excluded);
  }, 0);
}
```

**대장상 대지면적으로 용적률을 계산하면 증축 여유를 과대평가합니다.** 도시계획도로 저촉분은 건축법상 대지면적에서 빠지므로, 유효 대지면적이 작아지면 현재 용적률이 실제로는 더 높습니다. 여유가 줄어듭니다.

역삼동 샘플처럼 제척이 0인 단일 필지에서는 차이가 없지만, 연수원급 다필지 물건에서는 **"용적률 여유 113.9%p"가 절반으로 줄어드는 일이 실제로 발생**합니다.

### 3.3 건축물 — 연면적 ≠ 용적률 산정 연면적

```ts
export const BuildingUnit = z.object({
  name: z.string(),                  // '주건축물 제1동'
  isPrimary: z.boolean(),
  structure: z.string(),
  approvalDate: z.string(),
  violationFlag: z.boolean(),        // 위반건축물 표기
  floors: z.array(FloorArea),
});

export const FloorArea = z.object({
  level: z.string(),                 // 'B1' | '1F' ...
  purpose: z.string(),
  grossArea: z.number(),             // 바닥면적
  farCountedArea: z.number(),        // 용적률 산정 면적 (지하·주차 제외)
});
```

이 구분을 안 하면 용적률이 틀립니다. 지하층과 부속 주차장은 연면적에 포함되지만 용적률 산정에서는 빠집니다.

### 3.4 토지이용계획 — 매수 목적별 필터 (요구 ④)

토지이용계획확인원에는 수십 항목이 찍힙니다. 다 보여주면 노이즈이고, 임의로 고르면 누락 책임이 생깁니다. **매수 목적에 따라 자동 필터링**합니다.

목적은 이미 게이트 G2에서 받고 있습니다 (실사용 / 임대수익 / 밸류애드 / 개발 / 자산배분).

```ts
export const ZoningItem = z.object({
  category: z.enum(['use_area', 'use_district', 'use_zone', 'other_law']),
  name: z.string(),
  relevance: z.record(BuyerPurpose, z.enum(['high', 'medium', 'low'])),
  impactNote: z.string().nullable(),
});
```

관련도 매핑 예시입니다.

| 항목 | 실사용 | 임대수익 | 밸류애드 | 개발 |
|---|---|---|---|---|
| 용도지역 | high | high | high | high |
| 고도지구 | low | low | **high** | **high** |
| 학교 상대보호구역 | medium | **high** (업종 제한) | medium | medium |
| 토지거래허가구역 | **high** | **high** | **high** | **high** |
| 개발제한구역 | high | medium | **high** | **high** |
| 과밀억제권역 | low | low | medium | **high** (취득세 중과) |
| 대공방어협조구역 | low | low | medium | **high** (고도 제한) |

노출 규칙 — `high`는 본문, `medium`은 접기, `low`는 부록. **전체 목록은 항상 부록에 실어 누락 책임을 회피합니다.**

### 3.5 입지 3측면 분리 (요구 ⑤)

현 입지 슬라이드는 세 성격이 섞여 있습니다. 명시적으로 나눕니다.

| 측면 | 포함 항목 |
|---|---|
| **공법적** | 용도지역·지구·구역 / 건폐율·용적률 상한 / 높이·일조 제한 / 주차 기준 / 도시계획시설 저촉 / 개발행위허가 제한 |
| **감정평가적** | 도로접면 12분류 등급 / 형상(정방형·부정형) / 지세(평지·경사) / 획지조건 / 개별공시지가 추이 / 인근 실거래 비교 / 접면 가중률 |
| **접근성** | 역세권 도보시간 / 간선도로 접근 / 버스노선 / 차량 진출입 / 유동인구 / 배후 수요 |

Basic은 각 측면 3항목씩 요약, Pro는 전체 전개. 브로커도 매수자도 "무엇을 빠뜨렸는지" 확인하기 쉬워집니다.

---

## 4. 축 C — 렌트롤 정밀 모드 (요구 ⑥)

### 4.1 두 모드

| | 표준 모드 (현재) | 정밀 모드 |
|---|---|---|
| 대상 | 사옥·단일 임차·소수 호실 | **상가 수익형 · 다호실** |
| 입력 항목 | 7개 | 18개 |
| 법률 판정 | 없음 | 환산보증금 · 상임법 자동 판정 |
| 분석 | 만기 구조 | + 전용률 · 갱신요구권 잔여 · 인상 여력 |

```ts
export const LeaseUnitPrecise = z.object({
  level: z.string(),
  unitNo: z.string(),                        // '301호'
  purpose: z.string(),
  contractArea: z.number(),                  // 계약면적
  exclusiveArea: z.number(),                 // 전용면적
  deposit: Money,
  monthlyRent: Money,
  managementFee: Money,
  managementFeeType: z.enum(['fixed', 'actual']),
  vatIncluded: z.boolean(),
  firstContractDate: z.string(),             // 최초 계약일 ← 갱신요구권 기산점
  currentStartDate: z.string(),
  expiryDate: z.string(),
  handoverCondition: z.enum(['succeed', 'vacate', 'negotiable']),
  rentFreeRemainingMonths: z.number().nullable(),
  arrears: z.enum(['none', 'minor', 'major', 'unknown']),
});
```

**`firstContractDate`가 정밀 모드의 핵심 필드입니다.** 계약갱신요구권 10년은 최초 계약일부터 기산하므로, 이 값 없이는 잔여 갱신권을 계산할 수 없고 명도 계획을 세울 수 없습니다.

### 4.2 법률 판정 엔진

```ts
export const CONVERTED_DEPOSIT_THRESHOLD = {
  seoul: 900_000_000,          // 9억
  // 과밀억제권역·광역시 등은 별도 (시행령 참조)
} as const;

export function evaluateLeaseAct(u: LeaseUnitPrecise, region: Region) {
  const converted = u.deposit + u.monthlyRent * 100;
  const full = converted <= CONVERTED_DEPOSIT_THRESHOLD[region];
  const usedYears = yearsSince(u.firstContractDate);

  return {
    convertedDeposit: converted,
    application: full ? 'full' : 'partial',
    // 환산보증금과 무관하게 적용
    opposingPower: true,               // 인도 + 사업자등록 전제 — 반증 없으면 true
    renewalRight: {
      totalYears: 10,
      usedYears,
      remainingYears: Math.max(0, 10 - usedYears),
    },
    keyMoneyProtection: true,
    // 환산보증금 이하만
    priorityRepayment: full,
    rentIncreaseCapPct: full ? 5 : null,
  };
}
```

**`opposingPower`의 기본값은 `true`입니다.** 영업 중인 임차인은 사실상 대항력을 갖습니다. `false`로 표기하려면 반증(사업자등록 미신청 등)이 있어야 하며, 게이트 G13이 근거를 요구합니다.

### 4.3 파생 지표

```ts
exclusiveRatio  = exclusiveArea / contractArea              // 전용률
rentPerPyeong   = monthlyRent / (exclusiveArea / 3.3058)    // 평당 월세
increaseHeadroom = full ? min(marketRent - currentRent, currentRent * 0.05)
                        : marketRent - currentRent          // 인상 여력
```

인상 여력이 정밀 모드의 실질 가치입니다. 환산보증금 이하 호실은 5% 상한에 묶이고, 초과 호실은 시세까지 올릴 수 있습니다. **매수자가 가장 알고 싶어 하는 숫자**입니다.

---

## 5. 레이아웃 규칙 추가

| 코드 | 조건 | 동작 |
|---|---|---|
| L08 | Cap Rate 관점 간 격차 > 0.3%p | 두 값 병기 + 차이 사유 블록 강제 |
| L09 | 레버리지 슬라이드 존재 | 지가 시나리오 4개(하락 포함) 강제. 상승만 표시 금지 |
| L10 | 필지 수 ≥ 2 | 필지 명세 슬라이드 추가 |
| L11 | 제척 면적 > 0 | 유효 대지면적·유효 용적률 강조, 대장 면적과 병기 |
| L12 | 토지이용계획 항목 존재 | 매수 목적별 relevance 필터 적용, 전체 목록은 부록 |
| L13 | 입지 섹션 | 공법·감정평가·접근성 3블록 분리 |
| L14 | 렌트롤 = 정밀 모드 | 확장 표 + 상임법 판정 열 + 인상 여력 컬럼 |
| L15 | `disclosure.dcf ≠ hidden` | 용어 해설 박스 동반 배치 |

L09는 L06(역레버리지 경고)과 **함께** 작동합니다. 경고를 지우는 것이 아니라 옆에 총수익률을 놓아 균형을 만듭니다.

---

## 6. 품질 게이트 추가

| 코드 | 검사 | 실패 시 |
|---|---|---|
| G10 | 모든 Cap Rate에 기준(`basis`) 표기 존재 | 기준 미표기 값 지목 — 발행 차단 |
| G11 | 총수익률 표시 시 하방 시나리오 포함 | 상승만 있으면 차단 |
| G12 | 제척 합계 ≤ 대지 합계, 유효 용적률 재계산 일치 | 불일치 필지 지목 |
| G13 | 상임법 판정이 환산보증금 계산과 일치 · `opposingPower=false`에 근거 존재 | 근거 없는 부정 표기 차단 |
| G14 | DCF·IRR 노출 시 용어 해설 존재 | 누락 용어 목록 제시 |

---

## 7. 데이터 소스

| 슬롯군 | 출처 | 갱신 | provenance |
|---|---|---|---|
| 필지·지목·면적 | 토지대장 API (공공데이터포털) | 딜 생성 시 | ✓공부 |
| 건축물 동·층별 면적 | 건축물대장 API (건축HUB) | 딜 생성 시 | ✓공부 |
| 토지이용계획 | 토지이용계획확인원 API (LURIS) | 딜 생성 시 | ✓공부 |
| 개별공시지가 · 변동률 | 국토부 개별공시지가 API · 서울시 열린데이터 | 연 1회 | ✓공부 |
| 권역 지가 상승률 (동 단위) | 위 공시지가 3·5년 시계열 집계 | 연 1회 | ✓공부 |
| 실거래 비교사례 | 국토부 실거래가 API | 월 1회 | ✓공부 |
| 제척 면적 | **자동 산출 불가** — 도면 판독 또는 중개인 입력 | — | ●중개인 |
| 임대차 상세 | 계약서 인식 + 중개인 검수 | 딜 생성 시 | ●중개인 |

**제척 면적은 API로 나오지 않습니다.** 토지이용계획도의 도시계획시설 저촉선을 읽어야 하며, 초기에는 중개인 입력으로 받고 provenance를 `●중개인`으로 명시합니다. 자동화는 M4 이후 과제입니다.

---

## 8. 개발 스코프와 마일스톤 영향

### 8.1 추가 공수

| 워크스트림 | 작업 | 솔로일 |
|---|---|---:|
| 축 A | Cap Rate 4기준 엔진 + 총취득원가 + 노출 정책 | 8 |
| 축 A | 총수익률 시나리오 엔진 + 지가 데이터 파이프 | 6 |
| 축 A | DCF 공개 정책 + 용어 해설 마스크 | 4 |
| 축 B | 필지 배열화 + 제척 + 유효 면적 계산 | 12 |
| 축 B | 토지이용계획 relevance 매핑 + 필터 | 6 |
| 축 B | 입지 3측면 분리 | 4 |
| 축 C | 렌트롤 정밀 모드 + 법률 판정 엔진 | 10 |
| 공통 | 레이아웃 규칙 L08~L15 | 6 |
| 공통 | 게이트 G10~G14 | 4 |
| | **합계** | **60** |

### 8.2 6개월 창에 들어가는가 — 들어가지 않습니다

```
   v3.1 기존 스코프              117 솔로일
   + 정밀도 요구 7건             +60
   ────────────────────────────────────
   합계                          177 솔로일
   6개월 가용                    약 126 영업일
   초과                          51일
```

정직하게 말씀드리면 **그대로는 불가능합니다.** 두 가지 선택지가 있습니다.

**(A) 6개월 유지 — 절삭**

| 절삭 항목 | 일수 | 근거 |
|---|---:|---|
| 이미지 파이프라인 (M3) | −12 | 샘플이 증명하듯 사진 없이 성립 |
| 조직 브랜드 마스터 (M3) | −6 | 단일 조직(JS)만 쓰는 초기에는 불필요 |
| 조직 익명 통계 (M3) | −9 | 표본이 6개월 내 안 쌓임 |
| **다필지·제척 (축 B)** | −12 | 강남 근생은 대부분 단일 필지 |
| 잔여 | **138일** | 여전히 12일 초과 |
| 토지이용계획 필터 후순위 | −6 | 전체 목록 부록 게재로 대체 |
| | **132일** | 6일 초과 — 사실상 여유 0 |

**(B) 7개월로 연장** — 147일 가용. 다필지·제척까지 포함 가능하고 여유 약 20일.

### 8.3 권고 — (A)를 택하되 슬롯 구조만은 지금 바꾼다

다필지·제척 **기능**은 M4로 미뤄도 됩니다. JS의 주력인 강남 근생빌딩은 대부분 단일 필지이고, 연수원급 다필지 물건은 빈도가 낮습니다.

**다만 슬롯 구조는 M1에서 배열로 설계해야 합니다.** 단일 필지를 스칼라로 출시하면 나중에 배열로 못 바꿉니다 — 이미 발행된 IM의 재현성이 깨지고 마이그레이션 비용이 개발 비용을 넘습니다.

```ts
// ✅ M1에서 이렇게 설계한다. 필지가 1개여도 배열이다.
interface LandFacts {
  parcels: Parcel[];
}

// ❌ 이렇게 하면 나중에 못 고친다.
interface LandFactsWrong {
  landArea: number;
}
```

우선순위는 이 순서를 권합니다.

| 순위 | 항목 | 근거 |
|---:|---|---|
| 1 | **Cap Rate 이원화** (축 A) | 브로커가 지금 IM을 못 쓰는 직접 이유 |
| 2 | **렌트롤 정밀 모드** (축 C) | 상가 수익형이 JS 주력 물건군 |
| 3 | **총수익률** (축 A) | 매수자 설득의 본체. 서사를 바꿈 |
| 4 | 입지 3측면 · DCF 정책 | 표현 개선, 계산 변경 없음 |
| 5 | 토지이용계획 필터 | 부록 전체 게재로 임시 대체 가능 |
| 6 | 다필지·제척 | M4 — 단, 슬롯 구조는 M1에 반영 |

---

## 9. 검증 시나리오

| # | 시나리오 | 기대 |
|---|---|---|
| 1 | 역삼동 샘플로 Cap 4기준 산출 | 3.14 / 2.97 / 2.42 / 2.29 (%), 격차 0.86%p |
| 2 | 격차 0.3%p 초과 상태로 Basic 발행 시도 | L08 병기 삽입, G10 통과 |
| 3 | Cap Rate에 basis 미표기 | **G10 실패 — 발행 차단** |
| 4 | 총수익률에 상승 시나리오만 포함 | **G11 실패 — 발행 차단** |
| 5 | LTV 55% + 지가 −2% | 총수익률 −4.93%, 무차입(+0.44%) 대비 열위 표시 |
| 6 | B1 창고 (환산보증금 3.0억) | 전면 적용 · 인상률 5% 상한 표기 |
| 7 | 1F 카페 (환산보증금 16.0억) | 일부 적용 · **대항력 true 유지** · 갱신요구권 표기 |
| 8 | `opposingPower=false` 근거 없이 입력 | **G13 실패 — 차단** |
| 9 | 3필지 중 1필지에 도시계획도로 저촉 | 유효 대지면적 감소, 유효 용적률 재계산, L11 강조 |
| 10 | 제척 합계 > 대지 합계 | **G12 실패** |
| 11 | 매수 목적 = 임대수익 | 고도지구 접힘, 학교 상대보호구역 본문 노출 |
| 12 | 매수 목적 = 개발 | 고도지구·과밀억제권역 본문 노출 |
| 13 | Basic에서 DCF 노출 시도 | 기본 정책상 hidden — 브로커 명시 변경 시에만 |
| 14 | Pro에서 IRR summary 노출 | L15로 용어 해설 박스 동반, G14 통과 |
| 15 | 정밀 모드 렌트롤 6호실 | 전용률·인상 여력·상임법 판정 열 전부 표시 |

---

## 10. 온톨로지 v0.2 마이그레이션 주의

기존 발행 IM의 재현성이 걸린 변경이므로, 다음을 지킵니다.

1. **v0.1로 발행된 IM은 v0.1 엔진으로 계속 재현 가능해야 합니다.** 온톨로지 버전을 발행 이력에 Pin합니다.
2. `landArea` 스칼라 → `parcels[]` 배열 전환 시, 기존 값을 단일 원소 배열로 승격하는 마이그레이션을 작성하고 **되돌릴 수 있게** 합니다.
3. Cap Rate는 v0.1에서 `noi_price` 하나만 있었으므로, 마이그레이션 시 `basis: 'noi_price'`를 명시적으로 주입합니다. 기준 미상 값이 남으면 G10에서 걸립니다.
4. R10(대항력) 규칙은 **의미가 바뀌므로 신규 규칙 R10b로 만들고 R10은 deprecated 처리**합니다. 같은 코드로 다른 판정을 내면 과거 IM의 해석이 사후 변경됩니다.

---

## 11. 참고

- [상가건물 임대차보호법 적용범위 — 찾기쉬운 생활법령정보](https://easylaw.go.kr/CSP/CnpClsMain.laf?popMenu=ov&csmSeq=627&ccfNo=1&cciNo=2&cnpClsNo=1)
- [계약갱신 요구권 — 찾기쉬운 생활법령정보](https://easylaw.go.kr/CSP/CnpClsMain.laf?popMenu=ov&csmSeq=627&ccfNo=3&cciNo=4&cnpClsNo=3)
- [국토교통부 개별공시지가정보 API](https://www.data.go.kr/data/15124014/openapi.do)
- [전국개별공시지가정보 표준데이터](https://www.data.go.kr/data/15029071/standard.do)
- [서울시 개별공시지가 정보](https://data.seoul.go.kr/dataList/OA-1180/F/1/datasetView.do)
- [국토교통부 실거래가 API](https://www.data.go.kr/dataset/3050988/openapi.do)
- 자매 문서 — `AGENTS.md` · `DISTRIBUTION_AND_IDENTITY.md`
