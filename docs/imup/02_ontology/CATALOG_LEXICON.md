# 어휘 사전 카탈로그 (정본)

> **하나의 개념을 부르는 모든 말**을 여기서 관리합니다. 중개인이 쓰는 말, 매수자에게 보여줄 말, 개발자가 쓰는 말이 다르기 때문입니다.
> 편집기·수집·승인 절차는 `ONTOLOGY_GOVERNANCE_SPEC.md`가 소유합니다.

| | |
|---|---|
| **온톨로지** | v0.4.0 |
| **사전 버전** | `lex-2026.08.0` (초기 시드) |
| **시드 항목** | **42** (슬롯·enum 36 + 모호 6) |
| **최종 수정** | 2026-08-04 |

---

## 0. 왜 이 문서가 필요한가

### 0.1 실증 — 같은 것을 다르게 부릅니다

역설계한 실전 IM 5건에서 확인된 것입니다.

| 법인 | 표기 | 실제 개념 |
|---|---|---|
| 제이에스 (잠원동) | **"실질 용적률 247%"** | 지상 연면적 ÷ 대지면적 |
| 제이에스 (당산동) | "용적률 221.8%" | 같은 개념 |
| Genesis (양평동) | "용적률 398.8%" | 같은 개념 |

**세 문서가 같은 계산을 하고 다르게 부릅니다.** 이 상태에서 메모 파싱은 성립하지 않습니다.

### 0.2 라벨이 세 문서에 흩어져 있었습니다

| 라벨 | 흩어져 있던 곳 |
|---|---|
| `CapRateBasis` 7종 표기 | `PPTX_TEMPLATE_SPEC.md` §16.2 |
| `b2cLabel` 개념 | `DEAL_CARD_SPEC.md` §1.4 — **카탈로그 등록 없이 사용** |
| Basic/Pro 어휘 구분 | `MOBILE_IM_SPEC.md` §1 |
| "각지(코너)" 매핑 | `DEAL_CARD_SPEC.md` §1.3 |

**정본이 없었습니다.** 이 문서가 그 자리입니다.

---

## 1. 스키마

### 1.1 항목

```ts
// packages/ontology/src/lexicon.ts
export interface LexiconEntry {
  key: SlotKey | EnumValueKey;   // 무엇에 붙는 이름인가
  canonical: string;             // 시스템 정본 — 개발·명세 문서용
  proLabel: string;              // 실무 표기 — Pro IM · PPTX
  b2cLabel: string | null;       // 대고객 표기 — 딜카드 · Basic
  unit?: string;
  basisNote?: string;            // 기준 명시가 필요한 항목의 고정 각주
  aliases: Alias[];
  ambiguous?: boolean;           // 단독으로는 슬롯이 특정되지 않음
  resolvesTo?: SlotKey[];        // ambiguous일 때 후보 슬롯 (질문 선택지)
}

export interface Alias {
  term: string;
  scope: 'global' | 'org';
  orgId?: string;
  status: 'active' | 'pending' | 'rejected' | 'deprecated';
  source: 'seed' | 'field' | 'manual';
  observedCount: number;
  firstSeenAt: string;
  approvedBy?: string;
  approvedAt?: string;
}
```

### 1.2 라벨 3종을 두는 이유

```
canonical   farAboveGround / "지상 연면적 기준 용적률"   ← 개발자·명세
proLabel    "용적률 (지상 연면적 기준)"                  ← Pro IM · PPTX
b2cLabel    "용적률"                                    ← 딜카드 · Basic
```

| 라벨 | 독자 | 원칙 |
|---|---|---|
| `canonical` | 개발자 | 모호하지 않게. 길어도 됨 |
| `proLabel` | 실무 매수자 | **기준을 반드시 포함** |
| `b2cLabel` | 일반 매수자 | 짧게. 기준은 각주로 |

**`b2cLabel`이 `null`이면 딜카드·Basic에 노출할 수 없습니다** (`DEAL_CARD_SPEC.md` §1.4). 내부 지표가 새는 것을 타입 수준에서 막습니다.

### 1.3 `ambiguous` — 문맥 없이는 해석하지 않습니다

"면적"만으로는 대지·연면적·전용·계약 중 무엇인지 알 수 없습니다.

```ts
export const AREA_AMBIGUOUS: LexiconEntry = {
  key: '__ambiguous.area',
  canonical: '면적(미상)',
  proLabel: '면적',
  b2cLabel: null,
  ambiguous: true,
  resolvesTo: ['land.ledgerArea', 'building.grossArea', 'unit.exclusiveArea'],
  aliases: [{ term: '면적', scope: 'global', status: 'active', source: 'seed',
              observedCount: 0, firstSeenAt: '2026-08-04' }],
};
```

파싱 시 자동 채우지 않고 **질문을 띄웁니다** (`IM_AUTHORING_SPEC.md` §3.2의 `ambiguous` 배열).

---

## 2. 시드 사전

실증에서 확인된 것 + 기존 명세에 흩어져 있던 라벨을 모았습니다.

### 2.1 면적 · 규모

| key | canonical | proLabel | b2cLabel | aliases |
|---|---|---|---|---|
| `land.ledgerArea` | 대장 대지면적 | 대지면적 (대장) | 대지 | 대지면적, 토지면적, 땅 |
| `land.effectiveArea` | 유효 대지면적 | 유효 대지면적 | — | 실대지, 유효면적 |
| `land.excludedArea` | 제척 면적 | 제척 면적 | — | 제척, 도로저촉, 저촉면적 |
| `building.grossArea` | 연면적 | 연면적 | 연면적 | 총면적, 건물면적 |
| `building.aboveGroundArea` | 지상 연면적 | 지상 연면적 | — | 지상면적 |
| `unit.exclusiveArea` | 전용면적 | 전용면적 | 전용 | 실면적, 전용평 |
| `unit.contractArea` | 계약면적 | 계약면적 | — | 분양면적, 계약평 |

### 2.2 용적률 — 가장 혼란한 항목

| key | canonical | proLabel | b2cLabel |
|---|---|---|---|
| `derived.farAboveGround` | 지상 연면적 기준 용적률 | **용적률 (지상 연면적 기준)** | 용적률 |
| `derived.farTotal` | 전체 연면적 기준 용적률 | **용적률 (전체 연면적 기준)** | — |
| `derived.farEffective` | 유효 대지 기준 용적률 | 용적률 (유효 대지 기준) | — |

```
farAboveGround.aliases
  ★ "실질 용적률"     ← 잠원동 IM 실측 · 가장 중요
    "실용적률"  "지상 용적률"  "실제 용적률"  "실효 용적률"
farTotal.aliases
    "공부상 용적률"  "건축법상 용적률"  "대장 용적률"
```

**`basisNote`가 강제됩니다** — `PPTX_TEMPLATE_SPEC.md` §16.1의 2기준 병기 규칙과 연결됩니다.

### 2.3 수익률 — `CapRateBasis` 7종

`PPTX_TEMPLATE_SPEC.md` §16.2에서 이관했습니다. **이 표가 정본입니다.**

| key | proLabel | b2cLabel | aliases |
|---|---|---|---|
| `gross_price_deposit` | 임대수익률 (실투자금 기준) | 임대수익률 | 실투자 수익률, 실투자금 수익률 |
| `gross_price` | 임대수익률 (매매가 기준) | — | 매매가 수익률, 표면 수익률 |
| `noi_price` | Cap Rate (표준) | — | 캡레이트, 캡, 순수익률 |
| `noi_price_deposit` | Cap Rate (실투자금 기준) | — | — |
| `noi_equity` | Cap Rate (자기자본 기준) | — | 자기자본 수익률, ROE |
| `noi_total_cost` | Cap Rate (총취득원가 기준) | — | 총원가 수익률 |
| `gop_price` | **Cap Rate (GOP 기준)** | — | GOP 캡 |

> **`b2cLabel`이 하나뿐인 것이 의도입니다.** 딜카드·Basic에는 실투자금 기준 하나만 씁니다. 여러 기준을 나열하면 티저의 목적을 잃습니다 (`DEAL_CARD_SPEC.md` §5.2).

### 2.4 금액

| key | canonical | proLabel | b2cLabel | aliases |
|---|---|---|---|---|
| `deal.price` | 매각 희망가 | 매각 희망가 | 매각가 | 호가, 매도가, 매매가 |
| `derived.equity` | 실투자금 | 실투자금 (매각가 − 승계 보증금) | **실투자금** | 실투자, 실제 투자금, 내 돈 |
| `derived.totalCost` | 총취득원가 | 총취득원가 | — | 총원가, 실제 취득가 |
| `acq.total` | 취득 부대비용 | 취득 부대비용 | 부대비용 | 취등록세 등, 제비용 |
| `lease.deposit` | 보증금 | 보증금 | 보증금 | 임대보증금, 전세금 |
| `derived.convertedDeposit` | 환산보증금 | 환산보증금 | — | 환산, 환산보증 |

### 2.5 임대차 · 법적 지위

| key | canonical | proLabel | b2cLabel | aliases |
|---|---|---|---|---|
| `unit.opposingPower` | 대항력 | 대항력 | — | 대항, 대항요건 |
| `unit.renewalRemaining` | 갱신요구권 잔여 | 갱신요구권 잔여 | — | 갱신권, 갱신 잔여 |
| `unit.legalBasis` | 적용 임대차 법령 | 적용 법령 | — | 상임법, 주임법 |
| `unit.firstContractDate` | 최초 계약일 | 최초 계약일 | — | 최초계약, 입주일, 계약 시작 |
| `plan.vacate` | 명도 | 명도 | — | 퇴거, 비우기, 명도조건 |
| `unit.premium` | 권리금 | 권리금 | — | 권리, 시설권리금 |

> **`b2cLabel`이 전부 `null`입니다.** 임대차 법적 지위는 Pro에서만 다룹니다 (`MOBILE_IM_SPEC.md` §2.1).

### 2.6 입지 · 도로

| key | canonical | proLabel | b2cLabel | aliases |
|---|---|---|---|---|
| `land.roadAccessGrade` | 도로접면 등급 | 도로접면 | 접도 | — |
| ↳ `MED_CORNER` | 중로각지 | 중로각지 | **각지(코너)** | 각지, 코너, 모퉁이, 두면 접 |
| ↳ `MED_ONE` | 중로한면 | 중로한면 | 한 면 접도 | 한면, 일면 |
| `land.useArea` | 용도지역 | 용도지역 | 용도지역 | 지역, 용도 |
| `location.station` | 최근접 역 | 역세권 | 역세권 | 지하철, 역까지 |

### 2.7 권리

| key | canonical | proLabel | b2cLabel | aliases |
|---|---|---|---|---|
| `title.maxClaim` | 채권최고액 | 채권최고액 | — | 근저당, 최고액, 설정액 |
| `title.jointGroup` | 공동담보 그룹 | 공동담보 | — | 공담, 공동근저당 |
| `building.illegal` | 위반건축물 등재 | 위반건축물 | 위반건축물 | 위반, 무허가, 불법증축 |

### 2.8 모호 항목 (`ambiguous`)

| term | 후보 슬롯 | 질문 |
|---|---|---|
| 면적 | 대지 / 연면적 / 전용 / 계약 | "어느 면적인가요?" |
| 평수 | 동일 | 동일 |
| 수익률 | `CapRateBasis` 7종 | "어느 기준인가요?" |
| 용적률 | `farAboveGround` / `farTotal` | "지상 기준인가요, 전체 기준인가요?" |
| 임대료 | 월세 / 연 임대료 / GPI | "월 기준인가요?" |
| 층수 | 지상 층수 / 전체 층수 | — |

**모호 항목은 자동 채우지 않습니다.** 이것이 파싱 정확도의 핵심입니다 — 확신 없이 채우면 틀린 값이 조용히 들어갑니다.

---

## 3. 해석 규칙

### 3.1 우선순위

```
1. 조직 전용 alias (scope=org, 해당 조직)
2. 전사 alias (scope=global)
3. canonical / proLabel / b2cLabel 완전 일치
4. 정규화 후 재시도 (공백·조사 제거)
5. 실패 → unmatched 로그
```

### 3.2 정규화

```ts
export function normalize(term: string): string {
  return term
    .replace(/\s+/g, '')            // 공백 제거
    .replace(/[()（）]/g, '')        // 괄호 제거
    .replace(/(은|는|이|가|을|를|의)$/, '');  // 조사 제거
}
```

`"실질 용적률은"` → `"실질용적률"` → 매칭.

### 3.3 입력은 관대하게, 출력은 정본으로

```
입력   "실질 용적률"  "실용적률"  "지상 용적률"   →  전부 수용
저장   derived.farAboveGround = 198.4
출력   Pro    "용적률 (지상 연면적 기준) 198.4%"
       Basic  "용적률 198.4%"  ※ 지상 연면적 기준
```

**조직 어휘를 그대로 IM에 내보내지 않습니다.** 매수자가 못 알아듣습니다.

### 3.4 조직 alias는 입력에만 작용합니다

```ts
export function resolveOutput(key: SlotKey, tier: Tier): string {
  const e = LEXICON[key];
  // 조직 오버라이드는 출력에 적용하지 않습니다 (기본)
  return tier === 'pro' ? e.proLabel : (e.b2cLabel ?? e.proLabel);
}
```

예외적으로 조직 출력 라벨을 허용할 경우, **대고객 산출물(딜카드·Basic)에는 적용하지 않습니다.**

---

## 4. 등재 규칙

### 4.1 alias 추가 시 검사

| 검사 | 위반 시 |
|---|---|
| 다른 key에 같은 term이 `active`로 존재 | **차단** — 충돌 |
| 정규화 후 기존 term과 동일 | 차단 — 중복 |
| 2글자 미만 | 차단 — 오탐 발생 |
| 숫자만 | 차단 |
| 모호 후보 목록에 이미 존재 | 경고 — `ambiguous` 처리 검토 |

### 4.2 삭제하지 않습니다

```
비활성화   status: 'deprecated'   → 신규 파싱에서 제외
삭제       금지
```

**과거 파싱 로그의 해석이 사후에 바뀌면 안 됩니다.** 어떤 근거로 그 값이 들어갔는지 추적할 수 없게 됩니다.

### 4.3 스코프 승격

조직 alias가 **3개 이상 조직에서 관측**되면 전사 승격 후보가 됩니다. 자동 승격은 하지 않고 제안만 합니다.

---

## 5. 버전

```
lex-YYYY.MM.N       예: lex-2026.08.0
```

| 변경 | 버전 |
|---|---|
| alias 추가 | patch (N+1) |
| 라벨 문구 변경 | minor |
| key 추가·canonical 변경 | **온톨로지 버전과 동반** |

### 5.1 온톨로지 버전과 분리하는 이유

**어휘는 입력 시점에만 작용하므로 재현성에 영향을 주지 않습니다.**

```
"실질 용적률 247%"  →  [alias]  →  slot = 247.0  →  저장
                                        ↓
                        재렌더는 slot을 읽습니다. alias를 다시 보지 않습니다.
```

사전을 아무리 고쳐도 과거 IM의 재현 결과가 바뀌지 않습니다. 상세는 `ONTOLOGY_GOVERNANCE_SPEC.md` §2.

---

## 6. 참고

- 편집기 · 수집 · 승인 — `ONTOLOGY_GOVERNANCE_SPEC.md`
- 슬롯 정의 — `CATALOG_SLOTS.md`
- 3축 값 — `CATALOG_ASSET_TYPES.md`
- 메모 파싱 · `ambiguous` — `IM_AUTHORING_SPEC.md` §3.2
- 대고객 노출 판정 — `DEAL_CARD_SPEC.md` §1.4
- 티어별 어휘 — `MOBILE_IM_SPEC.md` §1
- 기준 표기 강제 — `PPTX_TEMPLATE_SPEC.md` §16
