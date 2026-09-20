# im-core 명세 완전성 감사 (D39)

> **대상** `08_IM_CORE_DOMAIN_SPEC` v1.0 (286행) · `D37_FRONTEND_AUDIT_REPORT` (108행)
> — 둘 다 `03_spec_current_state/v6/` 에 편입
> **함께 판독** V6 `01`·`02`·`03` (커밋 `6607d14` · `450b58b`)
> **선행** D38 `IM_V6_RISK_AUDIT.md`
> **소유** CREDEAL 렌더 팀

---

## 0. 판정

### 0.1 완전한가

**아니오.** 세 층위에서 불완전합니다.

| 층위 | 판정 |
|---|---|
| **모듈 커버리지** | 13파일 중 §2가 문서화한 것은 **10개**. `calculation.ts`·`data-availability.ts` 누락 |
| **타입 완결성** | `Claim`에 `id`·`provenance`·`approvedBy`가 없고, `ClaimStatus`에 `conflicted`·`stale`이 없습니다 |
| **게이트 지지** | 위 결손 때문에 **`G48`·`G49`·`G50`이 판정할 근거를 갖지 못합니다** |

🔴 **가장 위험한 하나** — `ClaimStatus`가 4종(`confirmed`/`needs_check`/`inferred`/`not_available`)인데
`ClaimRegistry`에 `findConflicted()`가 있고 `G48`(미해결 Conflict 0건)이 **block 게이트**입니다.
**상태 집합에 `conflicted`가 없으므로 `findConflicted()`는 언제나 빈 배열을 반환합니다.**
`G48`은 무조건 통과합니다.

### 0.2 두 문서가 서로를 반박합니다

`D37_FRONTEND_AUDIT_REPORT §0`은 im-core 연동을 **「✅ 전구간 — 9모듈 × 7접점 연결」**로
판정했습니다. 같은 커밋(`6607d14`)의 `01 §10.1` 매트릭스를 세면:

```
접점 63칸 · 연결 34칸 = 54%

  writer   █████████ 9/9
  handler  ██████··· 6/9
  DB       ███████·· 7/9
  viewer   ██████··· 6/9
  editor   ██······· 2/9
  approve  ███······ 3/9
  PPTX     █········ 1/9   ← ReleaseTier 하나
```

**「전구간」이 아니라 54%이고, PPTX는 9분의 1입니다.**
D38 R1의 판정은 이 두 문서를 함께 읽은 뒤에도 **유지됩니다.**

감사 보고서의 `C-3`(`pptx-renderer.ts` `releaseTier` 미전달)과 `H-4`(`data-binder.ts`
DATA_KEY 5종 추가)는 실제 수정이지만, 둘 다 **ReleaseTier와 매핑 키**를 고쳤을 뿐
`ClaimRegistry`를 PPTX에 연결한 것이 아닙니다.

---

## 1. 08의 모듈 커버리지 — 2개가 없습니다

`08 §1` 그래프는 12모듈 + `index.ts` = 13파일을 그립니다.
`§2`는 2.1~2.10, **10개만** 상세를 씁니다.

| 누락 모듈 | 왜 중요한가 |
|---|---|
| **`calculation.ts`** (`Calculation`, `YieldBasis`) | `G38`(전 면 동일 basis)·`G51`(계산식 재현)이 **이 타입에 전적으로 의존**합니다. 형태를 모르면 `basis='NOI'`일 때 `deductions ≥ 1`을 강제하는지 확인할 수 없습니다 — D32 BL-3의 핵심이 검증 불가 상태입니다 |
| **`data-availability.ts`** (`deriveDataAvailability`) | 15플래그가 **덱 편성 전체**를 결정합니다(`03 §3.1`). 「실값 기반」이 무엇을 실값으로 보는지 정의가 없습니다. `(확인 필요)`를 값으로 세는지 아닌지가 여기서 갈립니다 |

`§2.3`이 `FinancialCalculator`를 8줄로만 요약한 것도 문제입니다 —
`calculate(inputs): { claims, outputs, violations }`라고 적었는데
**`violations`가 어디로 가는지 `§3.1` 연동 패턴에 없습니다.**

```typescript
// 08 §3.1 — violations 를 받고 버립니다
const { claims, outputs, violations } = calc.calculate();
claims.forEach(c => registry.register(c));   // 🔴 violations 미처리
```

---

## 2. 🔴 게이트를 무력화하는 타입 결함

### 2.1 `ClaimStatus`에 `conflicted`·`stale`이 없습니다

| 출처 | 상태 집합 |
|---|---|
| 07 §5.2 | `unverified` · `broker_checked` · `reconciled` · **`conflicted`** · **`stale`** · `not_available` |
| D37 P0-1 | 위와 동일 |
| **08 §2.1** | `confirmed` · `needs_check` · `inferred` · `not_available` — **4종** |

그런데 `08 §2.2` `ClaimRegistry`는 이 둘을 갖고 있습니다.

```typescript
findConflicted(): Claim[];   // 🔴 conflicted 상태가 타입에 없습니다
findStale(): Claim[];        // 🔴 stale 상태가 타입에 없습니다
```

**결과**

- `G48`(미해결 Conflict 0건 · **block**) → 언제나 0 → **무조건 통과**
- `findStale()`은 `asOf` 누락으로 대체 판정할 수 있으나, `asOf`가 **optional**이라 (§2.3) 이 역시 약합니다

그리고 D37 P0-5가 요구한 **별도 `Conflict` 객체가 08에 없습니다.**

```ts
// D37 P0-5 — 08 에 없음
type Conflict = { kind; left: Claim; right: Claim; resolution?: {...} };
```

`ClaimRegistry`에 충돌을 **등록하는 메서드도 없습니다**(`register(claim)` 하나뿐).
07 §5.3 「충돌은 조용히 우선순위로 덮어쓰지 않는다. 충돌 객체를 만들고 중개인이 처리한다」가
**타입 수준에서 불가능**합니다.

### 2.2 `Claim.id`가 없는데 `id`로 참조합니다

```typescript
// 08 §2.1 — id 없음
interface Claim { subject; value; status; evidence; asOf?; displayLabel?; }

// 08 §2.2 — subject 로 조회
get(subject: string); getBySubject(subject); getLatestBySubject(subject);

// 08 §2.8 — 🔴 id 로 참조
interface ActionCard { relatedClaimIds: string[]; }
```

**`relatedClaimIds`가 가리킬 대상이 없습니다.**
`subject`로 대체하면 `getLatestBySubject`가 있다는 것 자체가 **같은 subject에 복수
Claim이 존재함**을 뜻하므로, subject는 식별자가 될 수 없습니다.

D37 P0-1 수용 기준 「슬라이드의 모든 수치가 `Claim.id`로 역추적」이
**타입 수준에서 불가능**합니다.

### 2.3 `Claim.provenance`가 없습니다

```typescript
// 08 §2.5
const DISPLAY_LABEL_MAP: Record<ProvenanceKind, {label, icon, trustWeight}>;

// 08 §3.4 viewer
const config = DISPLAY_LABEL_MAP[provenanceKind];   // 🔴 어디서 온 provenanceKind 인가
```

`Claim`에 `provenance` 필드가 없습니다. `displayLabel?: string`은 **라벨 문자열**이지
종류가 아니며, **optional**이라 없을 수도 있습니다.

`EvidenceRef.source`가 `string`(예: `'building_register'`)인데
`ProvenanceKind`로 변환하는 규칙이 08에 없습니다. 그리고 `string`이라
오타를 타입이 잡지 못합니다.

→ **AGENTS.md §14「No Hardcoded Provenance」를 지키려 해도 참조할 값이 없습니다.**

### 2.4 `approvedBy`가 없는데 `findUnapproved()`가 있습니다

```typescript
findUnapproved(): Claim[];   // 🔴 무엇을 보고 미승인이라 판정하는가
```

07 §14는 「중개인이 승인하기 전에는 Draft 상태를 벗어나지 않는다」이고,
D37 P1-6은 승인 게이트를 요구했습니다. `Claim`에 `approvedBy`·`approvedAt`이 없으면
`status === 'needs_check'`로 대신할 수밖에 없는데, **확인 상태와 승인 상태는 다릅니다.**
공부로 확인된(`confirmed`) Claim도 중개인 승인은 별도입니다.

### 2.5 `asOf`가 optional입니다

```typescript
asOf?: string;   // 🔴 optional
```

`G50`(기준일 전수 표시)은 **warn**입니다(D38 R3에서 block/warn 이중 등재도 지적).
타입이 optional이고 게이트가 warn이면 **기준일 없는 Claim이 두 겹 다 통과합니다.**

07 §15.1 `B02`는 「가격·면적·**기준일** 누락」을 **차단**으로 둡니다.

---

## 3. 🟠 한국 법제 모듈의 결손

### 3.1 `PermitZoneResult`에 조회 시점이 없습니다

```typescript
// 08 §2.10
interface PermitZoneResult {
  isPermitZone: boolean;
  thresholdSqm: number;
  permitRequired: null;      // 단정 금지 — 좋습니다 ✅
}
```

**「단정 금지」를 타입으로 표현한 것은 훌륭합니다.** 07 §2.3과 D36 §3.1의 원칙 그대로입니다.

그러나 D37 P1-2가 명시적으로 요구한 필드가 빠졌습니다.

| 필드 | 왜 필요한가 |
|---|---|
| `asOf` | 🔴 **고시는 자치구별로 수시 변경됩니다.** 언제 조회한 값인지 없으면 재현·검증 불가 |
| `designatedUntil` | 서울 2025.10 지정은 **2026-12-31까지**. 만료일이 없으면 지난 데이터를 현행으로 씁니다 |
| `source` | 서울부동산정보광장인지 토지이음 고시인지 |
| `landSqm` | 판정에 쓴 대지면적을 결과에 남기지 않으면 재계산 불가 |

그리고 `permitRequired: null` 리터럴 타입은 나중에 `boolean | null`로 넓힐 때
**파괴적 변경**입니다. 처음부터 `boolean | null`로 두고 값은 `null`을 넣으십시오.

**부수** — `01 §4.1` 공공 API는 여전히 **9개**이고 토지거래허가가 없습니다.
`parsePermitZoneResponse(raw, landSqm)`의 `raw`가 어디서 오는지 명세되지 않았습니다(D38 §13-a).

### 3.2 환산보증금 결과의 의미가 좁을 위험

```typescript
const COMMERCIAL_LEASE_ACT_THRESHOLDS = { 서울: 900_000_000, ... };
```

값은 정확합니다. 다만 세 가지가 빠졌습니다.

1. **`asOf`·출처가 없습니다.** 이 값은 시행령 개정 대상입니다.
2. **지역 4분류(`서울`/`과밀`/`광역`/`기타`)의 매핑 규칙이 없습니다.**
   「과밀억제권역」은 수도권정비계획법상 목록이며, 물건 주소에서 자동 판정하려면
   법정동 대조표가 필요합니다.
3. 🔴 **가장 중요** — `calculateConvertedDeposit()`의 반환 형태가 08에 없습니다.
   단순 boolean(`적용/미적용`)이면 **오독 위험**이 큽니다.

   환산보증금을 초과해도 **대항력 · 10년 계약갱신요구권 · 권리금 회수보호 ·
   3기 연체 해지**는 동일하게 적용됩니다. 갈리는 것은
   **임대료 인상률 5% 상한 · 우선변제권 · 확정일자** 등입니다.

   → 결과를 「보호 대상 여부」 한 칸으로 내면 매수자가 **「초과 = 보호 없음」**으로
     읽습니다. 이것은 매수 후 임대료 조정 계획의 전제를 뒤집습니다.

**개선** 반환을 항목별로 나누십시오.

```ts
type LeaseProtection = {
  convertedDeposit: number;
  thresholdApplied: { region: Region; amount: number; asOf: string; source: string };
  withinThreshold: boolean;
  // 🔴 초과해도 유지되는 것과 갈리는 것을 분리합니다
  alwaysApplies: ['대항력', '갱신요구권10년', '권리금회수보호', '3기연체해지'];
  thresholdDependent: { rentIncreaseCap5pct: boolean; priorityRepayment: boolean; fixedDate: boolean };
};
```

### 3.3 `KoreanLegalFields` 12종에 빠진 축

| 항목 | 상태 |
|---|---|
| 권리금 (회수기회 보호 · 예상 분쟁) | 🔴 **없음** — D36 §3.3에서 요구 |
| VAT / 포괄양수도 | 🔴 `transaction_structure`가 「개인/법인 등」으로 주석돼 있어 **과세 구조 축이 아닙니다** (D36 §3.5) |
| 토지거래허가 | ✅ 별도 모듈 (중복 아님) |

`08 §2.8` `ActionCard.involvesTenantRelocation: boolean`은 **권리금 트리거로 훌륭한
설계**인데, 정작 권리금 필드가 어디에도 없어 연결되지 않습니다.

---

## 4. 🟠 ActionCard가 07 규격을 만족하지 않습니다

07 §7.6은 Action Card **10칸**을 요구합니다 —
대상 층·호실 / 현재 상태 / 실행행위 / 선행조건 / 예상기간 / 월 임대료 변화 /
비용 / NOI 변화 / 위험 / 근거.

```typescript
// 08 §2.8
interface ActionCard { cardOrder; currentStateSummary; scenarios[]; involvesTenantRelocation; relatedClaimIds; }
interface Scenario { type; stabilizedMonthlyRent; stabilizedNOI; stabilizedCapRate; estimatedValue; totalReturn; actions: ActionItem[]; }
```

- **`ActionItem` 타입 정의가 없습니다.** 나머지 8칸이 여기 있는지 확인 불가.
- 🔴 **`ideaOnly` 플래그가 없습니다.** 07 §7.5·D37 P1-4·게이트 `B16`은
  「전문가 필요 전략(구조변경·증축·용도변경·대규모 설비)은 `idea_only`로 표시하고
  **금액효과를 확정하지 않는다**」입니다.
  그런데 `Scenario`가 **무조건** `stabilizedNOI`·`estimatedValue`·`totalReturn`을 갖습니다.
  → **아이디어 단계에도 금액이 붙습니다.** V4의 「밸류애드 리스크 없는 완성형 자산」이
    이 구조에서 다시 나올 수 있습니다.
- `08 §1` 의존 그래프에 **`AC --> CL`만 있고 `AC --> CR`이 없습니다.**
  `§3.1` 연동 패턴에도 `registerActionCardClaims`가 없습니다.
  → **ActionCard가 Claim 체계 밖에 있습니다.** `relatedClaimIds`로 참조만 하고
    자신은 등록되지 않으므로 `G49`(증거 없는 Claim)의 대상이 아닙니다.

---

## 5. 🟠 감사 보고서의 검증이 결론을 지지하지 않습니다

`D37_FRONTEND_AUDIT_REPORT §4`:

```
vitest run (l2+l3)     58/58 ✅
npm run build (8회)    전체 통과 ✅
git push origin main   Vercel 배포 ✅
```

**「총 22건 중 22건 해결」을 뒷받침하는 것이 L2+L3 58건뿐입니다.**

| 문제 | 설명 |
|---|---|
| L1·L4·L5 미실행 | `01 §11`은 L1 14 · L4 15+ · L5 25가 있다고 합니다. **`L4`가 산출물 단언**인데 돌리지 않았습니다 |
| 빌드 통과 ≠ 동작 | `npm run build`는 타입 체크입니다. §2의 결함(`conflicted` 부재 등)은 **타입 체크를 통과합니다** |
| 배포 ≠ 검증 | Vercel 배포 성공은 결함 부재의 근거가 아닙니다 |
| **대조군 없음** | D34 §3이 **최우선**으로 지시한 `tests/corpus/`가 없습니다. 검사가 공허한지 알 수 없습니다 |
| **negative 짝 없음** | 08 §4 체크리스트 8번이 요구하는데 실행 근거가 없습니다 |
| `M-2` 종결 사유 불명 | 「SECTION_MISSION 코드에 미존재」→「해당 없음」. 22건 중 1건이 이렇게 닫혔습니다 |

특히 **C-1**(`stage-plans.ts` `development_screening` 1곳만 달라 Stage 2 매칭 실패)은
**L3에서 잡혔어야 할 결함**입니다. 58건이 통과한 L2+L3가 이것을 놓쳤다는 것은
현행 L3가 **포스처별 Stage 매칭을 단언하지 않는다**는 뜻입니다.

---

## 6. 08 §4 확장 체크리스트 — 좋은데 소급되지 않았습니다

```
□ 7. PPTX renderer/data-binder에 매핑
□ 8. 테스트 L2+L4에 positive/negative 짝 추가
```

**이 체크리스트 자체는 이 문서에서 가장 좋은 부분입니다.** D36·D37이 지시한 것을
한 곳에 모았습니다.

문제는 **기존 12모듈이 이 체크리스트를 통과하지 못한다**는 것입니다.

| 단계 | 충족 |
|---|---|
| 1~3 (도메인·re-export·writer) | 9/9 ✅ |
| 4 (handler DB 영속) | 6/9 |
| 5 (viewer/editor UI) | 6/9 · editor 2/9 |
| 6 (approve 검증) | 3/9 |
| **7 (PPTX 매핑)** | **1/9** 🔴 |
| **8 (negative 짝)** | **근거 없음** 🔴 |

→ 체크리스트를 만들었으면 **기존 모듈에 소급 적용하고 미충족을 목록으로 남기십시오.**
   지금은 신규 모듈에만 적용되어, 기존 8모듈의 PPTX 미연결이 영구화됩니다.

---

## 7. D38 재판정

두 문서를 함께 읽은 뒤 D38 12건이 어떻게 바뀌는지.

| D38 | 재판정 | 근거 |
|---|:-:|---|
| R1 im-core ↔ PPTX 미연결 | **유지 🔴** | 매트릭스 실측 1/9. 감사 보고서의 「전구간」은 매트릭스와 모순 |
| R2 타임아웃 도달 불가 | **유지 🔴** | 두 문서 어디에도 Stage 수·타이머 조정 없음 |
| R3 게이트 이중 심각도 | **유지 🔴** | 감사 §0은 「49종」만 세고 심각도 중복은 다루지 않음 |
| R4 허용오차 부활 (CF3) | **유지 🔴** | `calculation.ts` 미문서화로 오히려 검증 근거가 더 없어짐 |
| R5 `expert_required` 도달 불가 | **악화 🔴** | 08 §2.4 `TIER_MIN_GRADE: Record<ReleaseTier, **string**>` — 타입이 `string`이라 「A+」가 통과합니다 |
| R6 Safe 영역 오류 | 유지 🟠 | 08 범위 밖 |
| R7 권리관계 부록 강등 | 유지 🟠 | 08 범위 밖 |
| R8 부록 상한 없음 | 유지 🟠 | 08 §2.4 `maxBodyPages`만 있고 부록 예산 없음 |
| R9 `G41` 임계값 5% | 유지 🟠 | 08 범위 밖 |
| R10 미리보기 6/18 | **완화 🟡** | 감사 `L-2`로 6→12종 확대. 잔여 6종(A12·A15·A18 포함) |
| R11 앵커 ↔ Claim 이중 | **유지 🟡** | 08이 Claim 쪽만 문서화. 앵커 제거 언급 없음 |
| R12 대조군·레지스트리 부재 | **확인 🟡** | 감사 §4가 L2+L3만 실행 — 대조군 부재 확정 |

**신규 위험 5건** (§2·§3·§4)

| # | 위험 | 등급 |
|:-:|---|:-:|
| R13 | `ClaimStatus`에 `conflicted` 없음 → **`G48` block이 무조건 통과** | 🔴 치명 |
| R14 | `Claim.id` 없음 → 역추적 불가 · `relatedClaimIds` 참조 대상 없음 | 🔴 치명 |
| R15 | `Claim.provenance` 없음 → `DISPLAY_LABEL_MAP` 조회 근거 없음 | 🟠 중대 |
| R16 | `ideaOnly` 없음 → 아이디어 단계에 금액효과가 붙습니다 | 🟠 중대 |
| R17 | `PermitZoneResult`에 `asOf`·`designatedUntil` 없음 | 🟠 중대 |

---

## 8. 개선 포인트

### P0 · 타입부터 (하루면 됩니다)

```ts
// 1. ClaimStatus 를 07 §5.2 와 일치시킵니다
type ClaimStatus =
  | 'unverified' | 'broker_checked' | 'reconciled'
  | 'conflicted' | 'stale' | 'not_available';

// 2. Claim 에 필수 4필드
interface Claim {
  id: string;                    // 🔴 신설 — 역추적의 전제
  subject: string;
  value: unknown;
  unit?: string;
  status: ClaimStatus;
  provenance: ProvenanceKind;    // 🔴 신설 — displayLabel 조회 근거
  evidence: EvidenceRef[];       // 최소 1개
  asOf: string;                  // 🔴 optional 해제
  approvedBy?: string;           // 🔴 신설 — 승인과 확인을 분리
  approvedAt?: string;
}

// 3. Conflict 를 1급 객체로 (D37 P0-5 · 07 §5.3)
type Conflict = {
  id: string;
  kind: 'address'|'area'|'use'|'rentroll_sum'|'lease_terms'
      | 'occupancy_narrative'|'unit_price'|'comp_identity'|'yield_basis';
  left: Claim['id']; right: Claim['id'];
  resolution?: { chosen: Claim['id']; reason: string; by: string; at: string };
};
class ClaimRegistry { registerConflict(c: Conflict): void; /* ... */ }

// 4. TIER_MIN_GRADE 의 타입을 좁힙니다
const TIER_MIN_GRADE: Record<ReleaseTier, Grade>;   // string → Grade
```

| # | 무엇 | 해소 |
|:-:|---|---|
| P0-1 | `ClaimStatus` 6종 · `Conflict` 1급 객체 · `registerConflict()` | R13 · `G48` 복원 |
| P0-2 | `Claim.id` 신설 · `getById()` | R14 |
| P0-3 | `Claim.provenance` 필수 · `EvidenceRef.source`를 열거형으로 | R15 |
| P0-4 | `asOf` 필수 · `B02`(기준일 누락 차단)와 연결 · `G50` 심각도 확정 | §2.5 · R3 |
| P0-5 | `TIER_MIN_GRADE: Record<ReleaseTier, Grade>` | R5 |
| P0-6 | **`calculation.ts`·`data-availability.ts`를 08 §2에 문서화** | §1 |
| P0-7 | `calculate()`의 `violations`를 게이트 컨텍스트로 전달 | §1 |

### P1 · 연결

| # | 무엇 | 해소 |
|:-:|---|---|
| P1-1 | **PPTX를 `bindFromIMCore(registry)` 단일 경로로.** 8모듈의 PPTX 열을 채웁니다 | R1 · 체크리스트 7번 |
| P1-2 | `ActionCard`에 `ideaOnly` · `ActionItem` 10칸 정의 · `registerActionCardClaims()` | R16 · §4 |
| P1-3 | `PermitZoneResult`에 `asOf`·`designatedUntil`·`source`·`landSqm` · `permitRequired: boolean \| null` | R17 |
| P1-4 | `LeaseProtection`을 항목별로 분리 — 초과해도 유지되는 것과 갈리는 것 | §3.2 |
| P1-5 | `KoreanLegalFields`에 권리금 · VAT/포괄양수도 축 추가 | §3.3 |
| P1-6 | 토지거래허가를 **10번째 공공 API**로 등재 (`01 §4.1`) | D38 §13-a |

### P2 · 검증

| # | 무엇 | 해소 |
|:-:|---|---|
| P2-1 | **`tests/corpus/` 대조군 6종 동결** — 없으면 검사가 공허한지 알 수 없습니다 | R12 · §5 |
| P2-2 | L1·L4·L5를 CI에 편입. **L4(산출물 단언)를 병합 조건으로** | §5 |
| P2-3 | L3에 **포스처별 Stage 매칭 단언** 추가 — `C-1`이 L3를 통과했습니다 | §5 |
| P2-4 | 08 §4 체크리스트를 **기존 12모듈에 소급** · 미충족 목록을 문서에 명시 | §6 |
| P2-5 | `im.tests.yaml`을 SSOT 목록에 편입 · negative 짝 강제 | R12 |

---

## 9. 하지 말 것

- **「22건 전건 해결」을 L2+L3 58건으로 판정하지 마십시오.**
  `C-1`은 L3를 통과한 결함이었습니다. 통과했다는 것은 **L3가 그것을 보지 않았다**는 뜻입니다.
- **`npm run build` 통과를 검증으로 쓰지 마십시오.** §2의 결함은 전부
  타입 체크를 통과합니다 — 없는 상태를 찾는 함수는 컴파일됩니다.
- **`Claim`에 필드를 나중에 붙이지 마십시오.** `id`·`provenance`·`asOf`는
  뒤에 붙이면 기존 Claim 전량 마이그레이션입니다. **지금이 가장 쌉니다.**
- **PPTX 연결을 「다음 스프린트」로 미루지 마십시오.**
  외부로 나가는 문서에 안전장치가 없는 상태가 세 판째입니다.
- **`permitRequired: null` 리터럴을 유지하지 마십시오.** 넓힐 때 파괴적 변경입니다.

---

## 부록 A — 한 문장

> 08은 **im-core가 무엇인지** 잘 적었습니다.
> 빠진 것은 **그것이 무엇을 막는지** 입니다 —
> `conflicted`가 없는 상태 집합은 `G48`을 통과시키고,
> `id`가 없는 Claim은 역추적을 약속만 합니다.
