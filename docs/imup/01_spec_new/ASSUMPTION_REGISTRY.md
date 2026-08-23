# 가정값 레지스트리

> **D4** · `IM_SYSTEM_SSOT.md` v1.4 단계 2 구현 사양
> 하드코딩 상수 22개를 **폐기 6종 + 레지스트리 21종**으로 재구성합니다.

| | |
|---|---|
| **문서 ID** | D4 |
| **소유** | 개발팀 + 도메인 |
| **선행 정본** | `IM_SYSTEM_SSOT.md` v1.4 §5 |
| **대상 단계** | 2 (8.0일) |
| **갱신 주기** | **연 1회 + 시장 급변 시** |
| **부속** | `가정값_레지스트리.xlsx` |
| **작성일** | 2026-08-23 |

---

## 0. 원칙 4가지

### 0.1 값보다 출처가 중요합니다

현행 22개 상수 중 **출처가 기록된 것은 0개**입니다. `0.85`가 어디서 왔는지 아무도 모릅니다.

**값이 틀린 것보다 근거를 모르는 것이 위험합니다.** 틀린 값은 고칠 수 있지만 근거 없는 값은 언제 고쳐야 할지 알 수 없습니다.

### 0.2 `legal` 계층은 기본값을 두지 않습니다

법정 수치는 물건마다 다릅니다. **조회 실패 시 기본값으로 채우면 틀린 결과가 확신 있게 나옵니다.**

```
용도지역 조회 실패  →  기본값 400% 적용  →  분양수입 1.6배 과대  →  IM 발행
```

**조회 실패 시 산출을 거부하고 "확인 필요"로 표시합니다.**

### 0.3 모르는 것은 만들지 않습니다

`user_input` 계층은 **기본값 없이 `null`을 반환**합니다.

| 폐기 대상 | 왜 |
|---|---|
| `Trading 목표 매각가 = 매입가 × 1.2` | **comps 없이 차익 23억을 창작** |
| `NOI 추정 = 총임대료 × 0.85` | 운영비를 모르는데 NOI를 냄 |

### 0.4 화면에 출처를 노출합니다

매수인이 "이 숫자 어디서 나왔나"를 물을 수 있어야 합니다.

```
평당 공사비 1,200만원  ◇ 서울 소형 근생 신축 2026년 통상 단가
```

---

## 1. 타입 정의

```ts
export type AssumptionSource =
  | 'measured'        // 실측 — 공부·계약서
  | 'legal'           // 법정 — 기본값 없음
  | 'market_default'  // 시장 통상 — 연 1회 갱신
  | 'user_input';     // 사용자 입력 — null 허용

export interface Assumption<T> {
  key: string;
  value: T | null;
  unit: string;
  source: AssumptionSource;
  basis: string;                       // 화면 노출 문장
  confidence: 'high' | 'medium' | 'low';
  editable: boolean;                   // 중개인이 물건별로 바꿀 수 있는가
  reviewedAt: string;                  // YYYY-MM-DD
  impactIfWrong: string;               // 이 값이 틀리면 무엇이 어긋나는가
}
```

**`impactIfWrong`이 핵심입니다.** 갱신 동기를 남기지 않으면 아무도 고치지 않습니다.

---

## 1A. 구성 요약

| 계층 | 종수 | 성격 |
|---|:-:|---|
| `legal` | **7** | 법정 · 5종 + 규제 시한 2종 |
| `market_default` | **8** | 시장 통상 · 연 1회 갱신 |
| `user_input` | **6** | 사용자 입력 · null 허용 |
| **레지스트리 계** | **21** | |
| **폐기** | **6** | §5 |

> **현행 하드코딩 22개 → 폐기 6 + 유지·재정의 16 + 신규 5 = 21종.**
> 개수가 줄지 않은 이유는 `targetFarByZoning`·`regulationExpiry` 같은 **없던 값을 추가**했기 때문입니다.

---

## 2. legal 계층 (7종) — 기본값 없음

| key | 값 | basis | 조회 실패 시 |
|---|--:|---|---|
| `acquisitionTaxRate` | **0.046** | 취득세 4.0 + 지방교육세 0.4 + 농특세 0.2 (상가·업무시설 표준세율) | 상수 · 실패 없음 |
| `brokerFeeRateMax` | 0.009 | 법정 상한 · 협의 가능 | 상수 |
| **`targetFarByZoning`** | **null** | 용도지역별 법정 상한 · 토지이용계획 API | **산출 거부** |
| **`bcrByZoning`** | **null** | 동일 | **산출 거부** |
| `transferTaxRate` | 보유기간 분기 | 1년 미만 50% / 그 외 6~45% · 주택 중과 미적용 | 매수 주체 확인 필요 |

### 2.1 🔴 `targetFarByZoning` — 가장 위험했던 상수

현행 코드는 **400%를 일괄 적용**합니다.

| 용도지역 | 법정 상한 |
|---|--:|
| 준공업 | 400% |
| **제2종일반주거** | **250%** (2025.5.19~2028.5.18 완화) |
| 제3종일반주거 | 300% (동일 완화) |

잠원동(제2종일반주거) 적용 시.

| | 용적률 | 지상 연면적 |
|---|--:|--:|
| 시스템 기본값 | 400% | 2,464㎡ (745평) |
| **실제 가능** | **250%** | **1,540㎡ (466평)** |
| 오차 | **+60%** | 분양수입·이익률 **1.6배 과대** |

```ts
export async function resolveTargetFar(pnu: string): Promise<Assumption<number>> {
  const plan = await fetchLandUsePlan(pnu);
  if (!plan?.floorAreaRatioMax) {
    return { key: 'targetFarByZoning', value: null, unit: '%', source: 'legal',
      basis: '토지이용계획 조회 실패 — 관할 관청 확인 필요',
      confidence: 'low', editable: true, reviewedAt: TODAY,
      impactIfWrong: '신축 규모·분양수입·사업이익률이 전부 어긋납니다' };
  }
  return { /* ... value: plan.floorAreaRatioMax */ };
}
```

**`value === null`이면 개발 규모 산출을 시도하지 않습니다.**

### 2.2 한시 제도 2종 — 종료일을 함께 저장합니다

| key | 값 | 성격 |
|---|---|---|
| `regulationBasis` | 서울시 소규모 건축물 한시적 용적률 완화 | 제도명 |
| **`regulationExpiry`** | **2028-05-18** | **3년 한시 (2025-05-19 시행)** |
| *(파생)* `regulationDaysLeft` | 자동 산출 | — |

**한시 제도를 근거로 사업성을 제시할 때는 종료일과 잔여 기간을 반드시 병기합니다.**

> 잠원동 IM(2026-04 작성) 기준 잔여 **749일**이었으나 IM에 기한 표기가 없었습니다. 매수인이 인허가 시점을 오판할 수 있습니다.

---

## 3. market_default 계층 (8종) — 연 1회 갱신

| key | 값 | 단위 | 신뢰도 | basis |
|---|--:|---|:-:|---|
| `constructionCostPerPyeong` | **12,000,000** | 원/평 | medium | 서울 소형 근생 신축 2026 통상 단가 |
| `devContingencyRate` | 0.05 | 비율 | medium | 총사업비 대비 예비비 · 통상 3~7% |
| `loanRateDefault` | 0.045 | 연 | medium | 2026 상업용 담보대출 통상 |
| `ltvScenarios` | [0, 0.4, 0.5] | 비율 | high | 표준 제시 3안 |
| `pfEquityRatioByYear` | {2026: 0.10, 2027: 0.15, 2028: 0.20} | 비율 | high | PF 자기자본비율 규제 로드맵 |
| `depreciationYears` | 40 | 년 | low | 철근콘크리트 건물 정액 · **세무 확인 필요** |
| `buildingValueRatio` | 0.35 | 비율 | **low** | 매매가 중 건물분 · **20~50% 편차 큼** |
| `seoulHotelRevPar` | 207,345 | 원 | medium | 서울 호텔 2025 평균 · 4~5성급 포함 |

### 3.1 실물 대조 근거

| key | 시스템 현행 | 실물 | 출처 |
|---|--:|--:|---|
| `constructionCostPerPyeong` | 8,000,000 | **12,000,000** | 잠원동 IM p16 (614.03평 × 1,200만 = 73.68억) |
| `devContingencyRate` | 0.15 (매입+공사의) | **5억 정액** | 잠원동 IM p16 |

**현행 800만원은 실물 대비 33% 과소**입니다. 614평 기준 24.56억 차이입니다.

### 3.2 `impactIfWrong` 기재

| key | 틀리면 |
|---|---|
| `constructionCostPerPyeong` | 총사업비·개발이익률이 직접 어긋남 · 614평에서 1만원 오차 = 614만원 |
| `loanRateDefault` | 역레버리지 판정이 뒤집힘 (수익률 2.24% 물건은 4.5% 경계에 민감) |
| `buildingValueRatio` | 사옥형 절세 효과가 배로 달라짐 · **세후 판단 반전 가능** |
| `seoulHotelRevPar` | 운영형 GOP 역산이 등급별로 크게 다름 |

---

## 4. user_input 계층 (6종) — null 반환

**값을 모르면 `null`을 반환하고 해당 지표를 산출하지 않습니다.**

| key | 없으면 | 산출 불가 지표 |
|---|---|---|
| `opexKrw` | null | **NOI 계열 4종** (`noi_price` 등) |
| `gopMarginPct` | null | **GOP · GOP Cap Rate** |
| `manualComps` | null | **목표 매각가 · 시세갭** |
| `marketRentPerPyeong` | null | **사옥형 절감 임차료** |
| `appraisedValueKrw` | null | 실제 대출 가능액 |
| `firstContractDate` | null | **갱신요구권 잔여** |

### 4.1 🔴 comps 커버리지 제약

```typescript
// price-prediction.ts:77
if (isNaN(price) || price < 2_000_000_000) continue;   // 20억 미만 제외
```

| 구간 | 자동 조회 | 주력(30~500억) 대비 |
|---|:-:|---|
| 20억 미만 | ✗ 하드코딩 제외 | **주력 밖 — 영향 없음** |
| 30억 ~ 300억 | ○ | B1·B2·B3 정상 |
| **300억 초과** | **✗** | **B4 (300~500억) 공백** |

> ### 🔴 정정 — 공백은 하단이 아니라 상단입니다
>
> 이전 판에 **"주력인 20억 미만 꼬마빌딩은 비교사례가 0건"** 이라고 썼습니다. **주력 대역을 잘못 알았습니다.**
>
> **주력은 30억~500억 상업용 부동산입니다.** 따라서 20억 미만 제외는 주력에 영향이 없고, **300억 초과 제외가 주력 상단(B4)을 잘라냅니다.**
>
> | | 이전 판단 | **정정** |
> |---|---|---|
> | 문제 구간 | 20억 미만 | **300~500억 (B4)** |
> | 주력 대비 | (오인) | **금액폭 기준 42.6%** |
> | 대책 | 하단 `manualComps` | **상단 `manualComps`** |

```ts
/** 자동 comps 조회가 불가능한 구간 — 주력에서 실질 유효한 것은 상단 조건입니다. */
export function requiresManualComps(priceKrw: number): boolean {
  return priceKrw < 2_000_000_000        // 주력 밖 (참고)
      || priceKrw > 30_000_000_000;      // ★ B4 300~500억 — 주력 상단
}
```

**해당 구간에서 `manualComps`가 없으면 가격 근거 섹션을 렌더하지 않습니다.** (불변조건 16)

> **300억 초과 하드코딩의 근거가 확인되지 않았습니다.** 하단 20억은 "소액 거래 노이즈 제거"로 설명이 되지만, 상단 300억을 자르는 이유는 코드에 주석이 없습니다. **단계 2에서 상한 제거 또는 500억으로 상향**을 검토합니다 — 주력 상단이 통째로 막혀 있습니다.

---

## 5. 🔴 폐기 상수 6종

| 폐기 | 현행 값 | 폐기 사유 | 대체 |
|---|--:|---|---|
| **NOI 추정 계수** | 0.85 | 근거 없음 · 문서·주석 전무 | `gross` 계열만 산출 |
| **Opex Ratio 6종** | 12~35% | 출처 없음 · **호텔 35%는 GOP 마진과 혼동 의심** | `opexKrw` 실입력 |
| **개발형 용적률** | 400% | **용도지역 무시 · +60% 과대** | `targetFarByZoning` |
| **개발형 공사비** | 800만원/평 | 실물 1,200만원 · **33% 과소** | `constructionCostPerPyeong` |
| **Trading 목표 매각가** | 매입가 × 1.2 | **comps 없이 차익 23억 창작** | `manualComps` 필수 |
| **Trading 비교사례** | 매입 평당가 × 1.15 | 동일 | 동일 |

### 5.1 Opex와 GOP 마진 혼동 확인 필요

```
financials.ts:132  Opex Ratio — 호텔 = 35%
financials.ts:421  GOP 마진율 기본값    = 35%
```

**Opex 35%면 GOP 마진이 65%가 됩니다.** 업계 통상 GOP 마진은 30~40%입니다. 두 값이 같은 것은 우연으로 보기 어렵습니다.

> **호텔 포스처에서 GOP가 약 2배로 산출되고 있을 가능성**을 단계 2 착수 시 확인합니다.

### 5.2 폐기 방식

```ts
// ❌ 폐기
const capRate = (monthlyRent * 12 * 0.85) / price * 100;

// ✅ 대체
const yields = computeYields({ monthlyRentKrw, priceKrw, depositKrw, opexKrw });
// opexKrw == null 이면 noi_* 키가 아예 생성되지 않음
```

**상수를 0으로 바꾸는 것이 아니라 계산 경로 자체를 제거합니다.**

---

## 6. 화면 노출 규칙

### 6.1 표기 위치

| 계층 | 표기 | 위치 |
|---|---|---|
| `legal` | 근거 법령·제도명 | 값 옆 각주 |
| `market_default` | **◇ + basis 문장** | 값 옆 |
| `user_input` (입력됨) | 출처 배지 (▲매도인 · ●중개인) | 값 옆 |
| `user_input` (null) | **"확인 필요"** | 값 자리 |

### 6.2 예시

```
평당 공사비   1,200만원  ◇ 서울 소형 근생 신축 2026년 통상 단가
법정 용적률     250%     서울시 소규모 건축물 완화 (2028-05-18까지)
연 순수익률    확인 필요   운영비 미확보
목표 매각가    확인 필요   비교사례 미입력
```

### 6.3 PPTX 캡션 크기

현행 캡션 7.5pt로는 A4 흑백 출력 시 읽히지 않습니다. **9pt 하한**을 적용합니다(SSoT §8.6).

**basis가 안 읽히면 출처 표기가 무의미합니다.**

---

## 7. 갱신 절차

| 항목 | 내용 |
|---|---|
| 주기 | **연 1회** (매년 1월) + 시장 급변 시 |
| 대상 | `market_default` 8종 |
| 승인 | 도메인 담당 + 개발 리드 |
| 기록 | `reviewedAt` 갱신 · 변경 이력 xlsx |
| 미갱신 경보 | `reviewedAt`이 400일 경과 시 로그 |

```ts
export function staleAssumptions(): Assumption<unknown>[] {
  const limit = Date.now() - 400 * 86400_000;
  return Object.values(ASSUMPTIONS)
    .filter(a => a.source === 'market_default' && Date.parse(a.reviewedAt) < limit);
}
```

### 7.1 물건별 편집

`editable: true`인 값은 중개인이 물건별로 바꿀 수 있습니다. **편집 사실을 기록합니다.**

| 편집 가능 | 편집 불가 |
|---|---|
| 공사비 · 금리 · LTV · 예비비 | 취득세율 · 중개보수 상한 |

---

## 8. 구현 순서 (8.0일)

| # | 작업 | 공수 | DoD |
|:-:|---|--:|---|
| 1 | `Assumption<T>` 타입 · 레지스트리 골격 | 1.0 | **21개 키 전부 등록** |
| 2 | `legal` 5종 — API 연동 · null 반환 | 2.0 | 조회 실패 시 산출 거부 확인 |
| 3 | `market_default` 8종 이관 | 1.0 | basis·reviewedAt 전부 보유 |
| 4 | `user_input` 6종 — null 경로 | 1.5 | NOI·GOP·목표가 미산출 확인 |
| 5 | **폐기 6종 제거** | 1.5 | 코드 검색 시 잔존 0건 |
| 6 | 화면 노출 (basis 표기) | 0.5 | 모바일·PPTX 양쪽 |
| 7 | 실매물 5건 재생성 · 대조 | 0.5 | **가정값 미표기 0건** |

### 8.1 폐기 검증

```bash
# 단계 2 완료 후 잔존 검사
rg -n "0\.85|opexRatio|400.*용적률|\* 1\.2\b|\* 1\.15\b" src/domain/building/mobile-im/
```

**하나라도 걸리면 DoD 미충족입니다.**

---

## 9. 참고

| 영역 | 문서 |
|---|---|
| 사양 정본 | `IM_SYSTEM_SSOT.md` v1.4 §5 |
| 타입 계약 | `API_TYPE_CONTRACT.md` (D3) |
| 포스처 구현 | `POSTURE_IMPL_GUIDE.md` (D10) |
| 부속 시트 | `가정값_레지스트리.xlsx` |

### 출처

- 취득세 4.6% — 취득세 4.0% + 지방교육세 0.4% + 농어촌특별세 0.2%
- 서울시 소규모 건축물 용적률 완화 — 2025.5.19 ~ 2028.5.18
- PF 자기자본비율 — 2026년 10% → 2027년 15% → 2028년 20%
- 공사비·예비비 — 잠원동 실매물 IM p16 실측
- 호텔 RevPAR — 서울 2025 평균 207,345원

> ⚠️ **2차 자료 기반입니다.** 법령·제도의 정확한 적용 조건은 관할 관청·세무 전문가 확인이 필요합니다.
