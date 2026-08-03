# CREDEAL — IM 데이터 수집 · 작성 · 제작 파이프라인

> 딜 하나가 **주소 한 줄에서 발행 가능한 IM**이 되기까지의 전 구간 규약.
> 조판은 `AGENTS.md`, 계산은 `IM_PRECISION_SPEC.md`, 배포는 `DISTRIBUTION_AND_IDENTITY.md`가 소유합니다. 이 문서는 **그 앞단**을 채웁니다.

| | |
|---|---|
| **패키지** | `packages/ingest` · `packages/grading` · `packages/authoring` |
| **선행 문서** | `IM_PRECISION_SPEC.md` (온톨로지 v0.2 전제) |
| **런타임** | Node 22 · Supabase Postgres · 외부 공공 API |
| **최종 수정** | 2026-08-03 |

---

## 0. 이 문서가 해결하는 문제

지금까지의 문서는 **데이터가 이미 있다고 가정**했습니다. 실제로는 여기가 가장 어렵습니다.

- 중개인은 주소 한 줄만 알고 시작합니다.
- 공부 API는 부분 실패하고, 다필지에서는 대표 지번만으로 나머지를 못 찾습니다.
- 제척 면적처럼 **API에 아예 없는 값**이 있습니다.
- 입력이 60% 찼을 때 중개인이 포기하면 IM은 0장입니다.

> **이 파이프라인의 성공 기준은 정확도가 아니라 완주율입니다.**
> 90% 정확한 자료를 100명이 완성하는 것이, 99% 정확한 자료를 20명이 완성하는 것보다 낫습니다. 정확도는 provenance 표기로 정직하게 낮춰 신고할 수 있지만, 미완성 IM은 존재하지 않는 것과 같습니다.

---

## 1. 전체 파이프라인

```
  [주소 입력]
       │
       ▼
  ┌─────────────┐   주소 → PNU 해석. 다필지면 인접 필지 탐색.
  │  RESOLVE    │   실패 시 지도에서 직접 선택.
  └─────────────┘
       │
       ▼
  ┌─────────────┐   토지대장 · 건축물대장 · 토지이용계획 · 공시지가
  │  FETCH      │   4개 병렬. 부분 실패 허용.
  └─────────────┘
       │
       ▼
  ┌─────────────┐   슬롯별 상태 부여 · 자료등급 1차 산정
  │  ASSESS     │   "무엇이 비었고, 채우면 등급이 얼마나 오르는가"
  └─────────────┘
       │
       ▼
  ┌─────────────┐   중개인이 결손만 채운다. 계약서 업로드 → OCR.
  │  AUTHOR     │   표준/정밀 모드 선택.
  └─────────────┘
       │
       ▼
  ┌─────────────┐   중개인 검수 서명. provenance 확정.
  │  VERIFY     │
  └─────────────┘
       │
       ▼
  ┌─────────────┐   게이트 G1~G14 → IM Studio 조판
  │  PRODUCE    │   → AGENTS.md
  └─────────────┘
```

**RESOLVE → ASSESS는 중개인 개입 없이 자동으로 끝나야 합니다.** 주소를 넣고 30초 안에 "지금 상태로 B등급, 3개 채우면 A등급"이 떠야 합니다. 이 첫 화면이 완주율을 결정합니다.

---

## 2. 수집 계층

### 2.1 주소 → PNU — 가장 자주 실패하는 첫 관문

PNU(필지고유번호 19자리)가 없으면 아무 API도 호출할 수 없습니다. 그런데 입력은 도로명주소, 지번주소, 건물명이 뒤섞여 들어옵니다.

```ts
// packages/ingest/src/resolve.ts
export type ResolveResult =
  | { kind: 'exact';     parcels: ParcelRef[] }
  | { kind: 'ambiguous'; candidates: ParcelRef[] }   // 사용자 선택 필요
  | { kind: 'partial';   parcels: ParcelRef[]; hint: string }
  | { kind: 'failed';    reason: string };

export async function resolveAddress(input: string): Promise<ResolveResult> {
  const normalized = normalizeKoreanAddress(input);   // 도로명 ↔ 지번 상호 변환
  // 1) 정확 일치
  // 2) 실패 시 건물명 검색
  // 3) 실패 시 지도 선택으로 폴백
  return lookup(normalized);
}
```

**다필지 탐색이 핵심 난제입니다.** 중개인은 대표 지번 하나만 압니다. 나머지 필지는 이렇게 찾습니다.

| 단서 | 방법 | 신뢰도 |
|---|---|---|
| 건축물대장 대지 지번 목록 | 대장의 `대지위치` 복수 지번 파싱 | 높음 |
| 인접 필지 + 동일 소유자 | 연속지적도 인접 탐색 후 소유자 대조 | 중간 |
| 중개인 직접 추가 | 지도에서 클릭 | 확정 |

자동 탐색 결과는 **항상 중개인 확인을 거칩니다.** 잘못 잡힌 필지가 유효 대지면적에 들어가면 용적률이 통째로 틀립니다.

### 2.2 공부 API 오케스트레이션

```ts
export const FETCHERS = {
  landLedger:   { api: '토지대장',           timeout: 8_000, retries: 2, ttlDays: 90 },
  buildingLedger:{ api: '건축물대장',        timeout: 12_000, retries: 2, ttlDays: 90 },
  landUsePlan:  { api: '토지이용계획확인원',  timeout: 10_000, retries: 2, ttlDays: 30 },
  officialPrice:{ api: '개별공시지가',        timeout: 6_000, retries: 1, ttlDays: 180 },
  transactions: { api: '실거래가',            timeout: 10_000, retries: 1, ttlDays: 7 },
} as const;
```

**전부 병렬 호출하고, 부분 실패를 허용합니다.** 하나가 실패해도 나머지로 진행하고, 실패한 슬롯군은 `failed`로 표시해 재시도 버튼을 노출합니다.

**절대 하지 말 것 — 전체 실패 처리.** 건축물대장 하나 안 나왔다고 딜 생성을 막으면 중개인은 두 번 다시 시도하지 않습니다.

### 2.3 슬롯 수집 상태 모델

```ts
export const SlotState = z.enum([
  'pending',          // 미시도
  'fetching',
  'fetched',          // 공부 획득
  'manual_required',  // API에 존재하지 않는 값 (제척 면적 등)
  'broker_entered',
  'seller_declared',  // 매도인 고지
  'verified',         // 중개인 검수 서명 완료
  'failed',           // 재시도 필요
  'not_applicable',   // 이 물건에 해당 없음
]);
```

`not_applicable`이 중요합니다. 임대차가 없는 개발부지에 렌트롤을 요구하면 영원히 미완성입니다. **"해당 없음"을 명시적으로 선택할 수 있어야 완주할 수 있습니다.**

### 2.4 캐싱 · 신선도 · 무효화

| 슬롯군 | TTL | 무효화 트리거 |
|---|---|---|
| 토지대장 | 90일 | 소유권 변동 감지 |
| 건축물대장 | 90일 | 증축·용도변경 |
| 토지이용계획 | 30일 | 도시계획 고시 |
| 개별공시지가 | 180일 | **매년 5월 공시** (일괄 무효화) |
| 실거래가 | 7일 | — |
| 임대차 | 무기한 | 중개인 수동 갱신 |

TTL 경과 슬롯은 IM 조판에서 **경고 배지**를 달되 발행을 막지는 않습니다. 공부가 오래됐다는 사실 자체가 정보이고, 발행 차단은 완주율을 해칩니다.

> 매년 5월 공시지가 발표 시 전 딜의 `officialPrice` 캐시를 일괄 무효화하고, 지가 상승률 시나리오(`ValueGrowth.scenarios`)를 재계산합니다. 이건 배치 작업으로 예약합니다.

### 2.5 계약서 인식 (OCR)

정밀 모드 렌트롤 18개 필드 중 OCR로 나오는 것과 안 나오는 것을 구분합니다.

| 필드 | OCR 추출 | 비고 |
|---|---|---|
| 보증금 · 월세 · 관리비 | ○ | 숫자 오인식 검증 필수 |
| 계약 시작·종료일 | ○ | |
| 계약면적 · 전용면적 | △ | 계약서에 없는 경우 많음 |
| 호수 · 층 | ○ | |
| **최초 계약일** | ✗ | 갱신 계약서에는 없음 — **중개인 입력 필수** |
| 관리비 실비/정액 구분 | △ | 특약 조항 해석 필요 |
| 렌트프리 | ✗ | 특약 |
| 명도 조건 | ✗ | 매매 협상 사항 |
| 연체 이력 | ✗ | |

**`firstContractDate`가 OCR로 안 나온다는 점이 설계에 결정적입니다.** 계약갱신요구권 10년의 기산점이므로 이것 없이는 T-규칙군 판정이 불가능합니다. 정밀 모드 진입 시 **가장 먼저 묻는 필드**로 배치합니다.

```ts
export interface OcrField<T> {
  value: T | null;
  confidence: number;          // 0~1
  bbox: [number, number, number, number];
  needsReview: boolean;        // confidence < 0.85 이면 true
}
```

`needsReview`인 필드는 원본 이미지 영역을 옆에 띄워 중개인이 3초 안에 확인하게 합니다. 전체 재입력을 요구하지 않습니다.

### 2.6 자동 수집이 불가능한 항목

정직하게 목록화합니다. 이것들은 영원히 중개인 또는 전문가 입력입니다.

| 항목 | 수집 방법 | provenance |
|---|---|---|
| 제척 면적 | 토지이용계획도 판독 → 중개인 입력 | ●중개인 |
| 실 대출잔액 | 매도인 고지 | ▲매도인 |
| 명도 조건 | 매매 협상 | ●중개인 |
| 임차인 연체 이력 | 매도인 고지 | ▲매도인 |
| 설비 노후도 | 현장 실사 | ●중개인 / ★전문가 |
| 재산세·종부세 실액 | 납부확인서 | ★전문가 |
| 시장 임대료 (인상 여력 산정용) | 중개인 판단 | ●중개인 |

---

## 3. 자료등급 엔진

샘플에 "A등급 89%", "B등급 71%"가 있으나 산정 로직이 명세되지 않았습니다. 여기서 확정합니다.

### 3.1 산정식

```
grade_score = Σ (슬롯군 가중치 × 충족률 × 평균 provenance 점수)
```

### 3.2 가중치와 점수표

| 슬롯군 | 가중치 |
|---|---:|
| lease_roll (임대차) | 25 |
| building_basic (건축물 제원) | 15 |
| land_parcel (필지·면적) | 15 |
| financial_input (임대료·경비) | 15 |
| zoning (용도지역·계획) | 10 |
| title_encumbrance (권리·등기) | 10 |
| road_access (접면) | 5 |
| market_comp (비교사례) | 5 |
| **합계** | **100** |

| provenance | 점수 |
|---|---:|
| ✓ 공부확인 | 1.00 |
| ★ 전문가검증 | 0.95 |
| ▲ 매도인고지 | 0.65 |
| ● 중개인입력 | 0.60 |
| ◇ AI추정·가정 | 0.30 |
| (미수집) | 0 |

임대차에 25점을 준 이유는 **이 값이 틀리면 IM 전체가 무의미**하기 때문입니다. 반대로 비교사례는 5점입니다 — 없어도 IM은 성립합니다.

### 3.3 등급 컷과 게이트 연동

| 등급 | 점수 | 게이트되는 것 |
|---|---:|---|
| A | ≥ 85 | 제한 없음 |
| B | ≥ 65 | **DCF · 민감도 억제** (제약 C11) |
| C | ≥ 40 | + 총수익률 시나리오 억제 |
| D | < 40 | **발행 불가** |

**등급은 물건 × 시점의 함수이며 티어의 함수가 아닙니다.** 샘플에서 Basic이 B(71%), Pro가 A(89%)인 것은 티어 차이가 아니라 **상세 열람 단계에서 매도인이 권리관계·계약서 원본을 추가 제출해 등급이 올라간 것**입니다. 결과적으로 C11에 의해 DCF가 Pro에서만 나오는 것이지, Pro라서 DCF를 주는 게 아닙니다.

이 인과를 UI에 명시합니다 — *"자료가 보강되어 B → A로 상승했습니다. 이제 현금흐름 분석을 제공할 수 있습니다."*

### 3.4 샘플 역산 검증

역삼동 물건으로 계산하면 샘플 수치와 정합합니다.

**Basic 시점** — 공부 수집 완료, 임대차는 중개인 입력, 권리관계 미수집

| 슬롯군 | 가중 | 충족 | prov | 소계 |
|---|---:|---:|---:|---:|
| building_basic | 15 | 1.00 | 1.00 | 15.00 |
| land_parcel | 15 | 1.00 | 1.00 | 15.00 |
| zoning | 10 | 1.00 | 1.00 | 10.00 |
| road_access | 5 | 1.00 | 1.00 | 5.00 |
| lease_roll | 25 | 1.00 | 0.60 | 15.00 |
| financial_input | 15 | 1.00 | 0.45 | 6.75 |
| title_encumbrance | 10 | 0.00 | — | 0.00 |
| market_comp | 5 | 1.00 | 1.00 | 5.00 |
| | | | | **71.75 → B** |

**Pro 시점** — 계약서 원본 확인, 세무사 검증, 등기·매도인 고지 확보

| 슬롯군 | 가중 | 충족 | prov | 소계 |
|---|---:|---:|---:|---:|
| (공부 4개 군) | 45 | 1.00 | 1.00 | 45.00 |
| lease_roll | 25 | 1.00 | 0.75 | 18.75 |
| financial_input | 15 | 1.00 | 0.70 | 10.50 |
| title_encumbrance | 10 | 1.00 | 0.92 | 9.20 |
| market_comp | 5 | 1.00 | 1.00 | 5.00 |
| | | | | **88.45 → A** |

### 3.5 유도 UI — 완주율의 핵심

등급 점수의 진짜 용도는 표시가 아니라 **다음 행동 제안**입니다.

```ts
export interface GradeAdvice {
  current: { score: number; grade: Grade };
  nextGrade: Grade;
  actions: Array<{
    slotGroup: string;
    label: string;              // '임대차계약서 6건 업로드'
    scoreGain: number;          // +3.75
    effortMinutes: number;      // 8
    unlocks: string[];          // ['현금흐름 분석']
  }>;
}
```

`scoreGain / effortMinutes`로 정렬해 **가성비 높은 순으로 3개만** 제시합니다. 목록 전체를 보여주면 중개인은 압도되어 포기합니다.

---

## 4. 작성 계층

### 4.1 워크플로우 상태

```
draft ──▶ collecting ──▶ authoring ──▶ verifying ──▶ ready ──▶ published
   ▲                                        │
   └────────────── revise ◀─────────────────┘
```

| 상태 | 진입 조건 | 이탈 조건 |
|---|---|---|
| `draft` | 주소 입력 | RESOLVE 성공 |
| `collecting` | PNU 확정 | FETCH 완료 (부분 실패 허용) |
| `authoring` | 자동 수집 종료 | 필수 슬롯 충족 |
| `verifying` | 중개인 "검수 요청" | 검수 서명 |
| `ready` | 게이트 G1~G14 통과 | — |
| `published` | 발행 실행 | — |

### 4.2 결손 표시 원칙

- **비어 있는 칸을 나열하지 않습니다.** 채우면 무엇이 좋아지는지를 보여줍니다.
- 필수/선택을 구분하되, "필수"는 발행이 막히는 것만입니다. 그 외는 전부 선택입니다.
- 한 화면에 3개 이상의 입력을 요구하지 않습니다.
- 이탈 시 자동 저장하고, 다음 진입 시 **마지막 위치로 복귀**합니다.

### 4.3 검수(verify) — 책임의 이전점

검수 서명은 provenance를 `broker_entered` → `verified`로 올리고, **법적 책임이 발생하는 지점**입니다.

```ts
export interface VerificationRecord {
  dealId: string;
  brokerId: string;
  slotGroups: string[];          // 검수 범위
  signedAt: string;
  ipHash: string;
  statement: string;             // 고정 문구 — 임의 변경 불가
}
```

검수 화면에는 **중개인 입력 및 가정 항목만** 나열합니다. 공부 자동 수집분을 다시 확인시키면 검수가 형식화됩니다.

### 4.4 표준 ↔ 정밀 모드 전환

정밀 모드는 상가 수익형에서 필수지만 입력이 18개 필드로 늘어납니다. **전환 시점을 시스템이 제안**합니다.

```ts
export function suggestPreciseMode(deal: DealFacts): boolean {
  return deal.leaseUnits.length >= 4
      && deal.assetType === 'retail_building'
      && deal.purpose !== 'development';
}
```

제안하되 강제하지 않습니다. 표준 모드로도 IM은 나오고, 등급이 낮을 뿐입니다.

---

## 5. 제작 계층

조판·레이아웃·차트·품질 게이트는 **`AGENTS.md`가 소유**합니다. 이 문서는 다음 인계 계약만 규정합니다.

```ts
export interface ProduceRequest {
  dealId: string;
  dealVersion: number;
  tier: 'basic' | 'pro';
  ontologyVersion: string;        // 'v0.2.0' — Pin 필수
  disclosure: DisclosurePolicy;   // IM_PRECISION_SPEC §2.5
  leaseMode: 'standard' | 'precise';
  grade: { score: number; grade: Grade };
}
```

`ontologyVersion`을 Pin하지 않으면 과거 IM의 재현이 불가능해집니다.

---

## 6. 재발행과 diff

IM은 딜당 3~5회 재발행됩니다(가격 조정, 매수자별). 매 발행마다 스냅샷을 남기고 **무엇이 바뀌었는지** 보여줍니다.

```ts
export interface VersionDiff {
  from: number; to: number;
  changes: Array<{
    slot: string;
    before: unknown; after: unknown;
    impact: 'cosmetic' | 'material' | 'critical';
  }>;
}
```

| impact | 정의 | 동작 |
|---|---|---|
| `cosmetic` | 문구·순서 | 조용히 반영 |
| `material` | 임대료·공실·경비 | 재발행 시 변경 요약 표시 |
| `critical` | 매각가 · 면적 · 권리관계 | **기존 grant 무효화 + 재발급 안내** |

**critical 변경 시 기존 Pro grant를 자동 무효화합니다.** 가격이 바뀌었는데 옛 IM이 살아 있으면 분쟁이 됩니다.

---

## 7. 실패 처리

| 실패 | 처리 | 사용자에게 |
|---|---|---|
| PNU 해석 실패 | 지도 선택 폴백 | "지도에서 직접 선택해 주세요" |
| 공부 API 타임아웃 | 재시도 2회 → `failed` | 해당 섹션에 재시도 버튼 |
| 공부 API 부분 응답 | 획득분만 반영 | 결손 슬롯 표시 |
| OCR 저신뢰 | `needsReview` 플래그 | 원본 영역 병기 확인 |
| 다필지 탐색 과다 (>10) | 자동 중단 | "필지가 많습니다. 직접 선택해 주세요" |
| 등급 D | 발행 차단 | 부족 슬롯군 + 예상 소요시간 |

**모든 실패는 되돌아올 수 있어야 합니다.** 실패로 딜이 삭제되거나 처음부터 다시 시작하게 만들지 않습니다.

---

## 8. 성능 · 비용 예산

| 단계 | 예산 | 비고 |
|---|---:|---|
| RESOLVE | 3 s | 실패 시 즉시 폴백 |
| FETCH (4개 병렬) | 15 s | 최장 API 기준 |
| ASSESS (등급 산정) | 200 ms | 순수 계산 |
| **주소 입력 → 첫 등급 표시** | **30 s** | 이 값이 완주율을 좌우 |
| OCR 1건 | 20 s | 비동기 처리 + 완료 알림 |

공부 API는 대부분 무료이나 쿼터가 있습니다. **캐시 적중률 70% 이상**을 유지하고, 같은 PNU에 대한 중복 호출을 요청 단위로 합칩니다.

---

## 9. 안티패턴 — PR 체크리스트

### 완주율

- [ ] 하나의 API 실패로 전체 플로우를 막지 않는가
- [ ] `not_applicable` 선택지가 있는가 (없으면 개발부지에서 영원히 미완성)
- [ ] 한 화면에 3개 초과 입력을 요구하지 않는가
- [ ] 결손을 나열하는 대신 "채우면 얻는 것"을 보여주는가
- [ ] 이탈 후 재진입 시 마지막 위치로 복귀하는가
- [ ] 등급 조언이 가성비 순 3개로 제한되는가

### 정확성

- [ ] 자동 탐색된 필지에 중개인 확인을 거치는가
- [ ] `firstContractDate`를 정밀 모드 최우선 필드로 배치했는가
- [ ] OCR `needsReview` 필드에 원본 영역을 병기하는가
- [ ] `ontologyVersion`을 발행 이력에 Pin하는가
- [ ] TTL 경과 슬롯에 경고 배지를 다는가 (차단은 하지 않음)

### 무결성

- [ ] critical diff 시 기존 grant를 무효화하는가
- [ ] 검수 화면에 공부 자동 수집분을 포함하지 않는가
- [ ] 등급 D에서 발행이 차단되는가
- [ ] 5월 공시지가 일괄 무효화 배치가 예약되어 있는가

---

## 10. 검증 시나리오

| # | 시나리오 | 기대 |
|---|---|---|
| 1 | 도로명주소 입력 → 단일 필지 | PNU 확정, 30초 내 등급 표시 |
| 2 | 대표 지번만 입력 → 실제 3필지 | 자동 탐색 3건 제시, 중개인 확인 요구 |
| 3 | 건축물대장 API 타임아웃 | 나머지 3개로 진행, 해당 군 `failed` + 재시도 버튼 |
| 4 | 임대차 없는 개발부지 | `not_applicable` 선택 후 발행 가능 |
| 5 | 역삼동 샘플, 공부만 수집 | grade 71.75 → B |
| 6 | + 계약서·등기·세무 검증 | grade 88.45 → A, DCF 잠금 해제 |
| 7 | 등급 39점 상태로 발행 시도 | **차단**, 부족 슬롯군 제시 |
| 8 | 계약서 OCR 신뢰도 0.7 필드 | `needsReview`, 원본 bbox 병기 |
| 9 | 매각가 190억 → 180억 변경 | critical diff, 기존 grant 무효화 |
| 10 | 5월 공시지가 갱신 배치 | 전 딜 `officialPrice` 무효화, 지가 시나리오 재계산 |
| 11 | 호실 5개 상가건물 생성 | 정밀 모드 제안 표시 (강제 아님) |
| 12 | 검수 서명 | provenance `verified` 승격, 서명 기록 생성 |

---

## 11. 참고

- 자매 문서 — `AGENTS.md` · `IM_PRECISION_SPEC.md` · `DISTRIBUTION_AND_IDENTITY.md` · `ONTOLOGY_V0.2_SPEC.md`
- [국토교통부 개별공시지가정보 API](https://www.data.go.kr/data/15124014/openapi.do)
- [전국개별공시지가정보 표준데이터](https://www.data.go.kr/data/15029071/standard.do)
- [국토교통부 실거래가 API](https://www.data.go.kr/dataset/3050988/openapi.do)
- [서울시 개별공시지가 정보](https://data.seoul.go.kr/dataList/OA-1180/F/1/datasetView.do)
