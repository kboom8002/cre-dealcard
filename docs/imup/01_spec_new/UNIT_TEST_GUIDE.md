# 단위 테스트 작성 지침

> **D14** · `TEST_PLAN.md` (D9)가 **무엇을 검증할지**를 정했고, 이 문서가 **어떻게 쓸지**를 정합니다.
> 픽스처 5건은 실제 파일로 제공됩니다 — `fixtures/`.

| | |
|---|---|
| **문서 ID** | D14 |
| **소유** | 개발팀 + QA |
| **선행 정본** | **D9 §2 테스트 매핑** · D3 타입 · D10 산식 · D4 가정값 |
| **부속** | **`build_fixtures.py`** · `fixtures/*.json` 6개 |
| **작성일** | 2026-08-23 |

---

## 0. 원칙 5가지

### 0.1 예외를 던지는 버그는 이미 잘 잡힙니다

30일간 **시스템 오류 0건**입니다. 단위 테스트가 잡아야 할 것은 **예외 없이 완주하면서 틀린 값을 내는 경로**입니다.

| 사례 | 예외 | 결과 |
|---|:-:|---|
| `cost_log` INSERT 실패 | 없음 | 3개월 데이터 0 |
| 용적률 400% 일괄 | 없음 | 분양수입 1.6배 |
| NOI = 임대료 × 0.85 | 없음 | 근거 없는 순수익률 |
| 주택에 상가 갱신권 산식 | 없음 | 명도 시점 2년 9개월 오차 |

**넷 다 `expect(fn).not.toThrow()` 로는 절대 안 잡힙니다.** 값을 확인해야 합니다.

### 0.2 픽스처가 유일한 진실입니다

기대값을 테스트 파일에 직접 쓰지 않습니다. **`fixtures/*.json`의 `expect` 블록**을 읽습니다.

```ts
// ❌ 숫자가 테스트마다 흩어짐
expect(y.gross_price.value).toBeCloseTo(2.24, 2);

// ✅ 픽스처가 정본
const fx = loadFixture('yangpyeong');
expect(y.gross_price!.value).toBeCloseTo(fx.expect.yields.gross_price, 2);
```

**실측값이 바뀌면 픽스처 한 곳만 고칩니다.**

### 0.3 🔴 단위 테스트에서 LLM을 호출하지 않습니다

LLM은 같은 입력에 다른 출력을 냅니다. **단위 테스트에 넣으면 간헐적으로 실패하고, 개발자는 곧 재실행 버튼을 누르는 법을 배웁니다.**

| 계층 | LLM |
|---|:-:|
| **단위** | **호출 안 함 — 전량 목** |
| 계약·게이트 | 호출 안 함 |
| E2E | **실호출** (D15 §4) |

### 0.4 결정론적인 것만 단위 테스트로 씁니다

```
결정론  →  산식 · 판정 · 파싱 · 포맷 · 마스킹 · 정규식
비결정론 →  LLM 문장 · 외부 API 응답 · 현재 시각
```

**비결정론은 경계에서 고정합니다** (§4·§5).

### 0.5 실패 메시지에 물건명·상호를 남기지 않습니다

픽스처 자체가 마스킹돼 있으므로 자연히 지켜집니다. (§2.3)

---

## 1. 구조와 명명

### 1.1 디렉터리

```
tests/
├─ fixtures/                    ← 이 문서의 부속. 손으로 고치지 않는다
│  ├─ index.json
│  ├─ yangpyeong.json           income · R2 · 12행
│  ├─ dangsan.json              income · R1 · 8행 · 통합계약
│  ├─ jamwon.json               development · hold
│  ├─ sutaek.json               development · 매수인 명도
│  ├─ hotel.json                operating · GOP 보류
│  └─ selfcheck.py              ← 58항 자기검산
├─ unit/
│  ├─ financials/               UT-YIELD · UT-DEV · UT-TRADE · UT-COMPS
│  ├─ lease/                    UT-LEASE · UT-LEDGER
│  ├─ render/                   UT-MASK · UT-DEF
│  └─ golden/                   UT-CLEAN
├─ gates/                       GT-* · TC-BASIS
├─ contract/                    타입 · 스키마 대조 (SC-*)
└─ helpers/
   ├─ loadFixture.ts
   ├─ freezeClock.ts
   └─ mocks/
```

### 1.2 테스트 ID를 `it()` 첫 단어로

```ts
it('UT-YIELD-01 운영비를 모르면 NOI 계열을 생성하지 않는다', () => { ... });
```

**D9 §2 매핑표의 ID와 문자열이 같아야 합니다.** CI가 대조합니다.

```bash
# 매핑표에 있는 ID가 코드에 존재하는가
grep -oE '`[A-Z]{2}-[A-Z0-9]+-[0-9]+`' TEST_PLAN.md | tr -d '`' | sort -u > /tmp/planned.txt
grep -rhoE "it\('([A-Z]{2}-[A-Z0-9]+-[0-9]+)" tests/ | sed "s/it('//" | sort -u > /tmp/written.txt
comm -23 /tmp/planned.txt /tmp/written.txt      # 비어 있어야 함
```

### 1.3 한 `it()`에 한 가지만

```ts
// ❌ 실패해도 어디가 틀렸는지 모름
it('수익률이 맞다', () => {
  expect(y.gross_price!.value).toBeCloseTo(2.24, 2);
  expect(y.noi_price).toBeUndefined();
  expect(eq.totalAcquisitionCost).toBe(26_375_000_000);
});
```

**`toBeCloseTo`가 실패하면 뒤 두 줄은 실행되지 않습니다.** 세 개로 나눕니다.

---

## 2. 픽스처

### 2.1 생성

```bash
python3 build_fixtures.py        # tests/fixtures/*.json 6개
```

**손으로 JSON을 고치지 않습니다.** 실측값이 바뀌면 `build_fixtures.py`를 고치고 재생성합니다. 생성 스크립트에 산출 근거가 주석으로 남아 있습니다.

### 2.2 구조

| 키 | 내용 |
|---|---|
| `asset` | 주소(동까지) · 용도 · 면적 |
| `posture` | 5종 중 하나 |
| `financial` | 매매가 · 보증금 · 월세 · **`opexKrw: null`** |
| `ledger` | **`asOf`** · `stated*` (표지 요약) · `rows[]` |
| `attachedDocs` | 첨부 공부 — G21용 |
| **`expect`** | **기대값 전량** |

### 2.3 🔴 마스킹 정책

| 항목 | 픽스처 | 이유 |
|---|---|---|
| 물건명 | **제외** | 불변조건 14 |
| 소재지 | **동까지** | 지번 제외 |
| **상호** | **마스킹** — 고은약국 → `약국` | 개인정보 |
| **업종** | **원문 유지** — 사무실 · 치과 · 미용실 | **G17 테스트에 필요** |
| 금액·면적·날짜 | **실측 그대로** | 한 자리도 바꾸지 않음 |

> **업종과 상호를 구분합니다.** "치과"는 업종이고 "○○치과의원"은 상호입니다. 불변조건 6은 업종을 **추론하지 말라**는 것이므로 원문이 필요하고, 상호는 남길 이유가 없습니다.

### 2.4 픽스처 자기검산

```bash
python3 build_fixtures.py && python3 fixtures/selfcheck.py
```

**58개 항목이 통과해야 합니다.** 합계·수익률·취득원가·LTV·ROE·역레버리지·개발 후 수익률이 서로 모순되지 않는지 픽스처 안에서 먼저 검산합니다.

| 픽스처 | 검산 항목 |
|---|--:|
| 양평동 | 24 |
| 당산동 | 25 |
| 잠원동 | 9 |
| | **58** |

**수택동·호텔은 수치 검산 대상이 아닙니다.** 둘 다 "산출하지 않는다"를 확인하는 픽스처라 계산할 값이 없습니다.

**픽스처가 틀리면 모든 테스트가 틀린 것을 맞다고 합니다.** 이 검산이 가장 먼저 돌아야 합니다.

### 2.5 🔴 양평동 `asOf`가 `null`인 이유

원본 렌트롤에 **기준일이 기재돼 있지 않습니다.** 채워 넣지 않았습니다.

| 결과 | |
|---|---|
| F12 (만료 > 50%) | **판정 불가** |
| F13 (30일 내 만료) | **판정 불가** |
| `Deficiency` | `ledger.asOf` 추가 |

> 평가 기준일을 2026-08-23으로 잡으면 11개 계약이 **전부 만료**로 나와 F12가 차단합니다. 하지만 그것은 **렌트롤이 오래된 것이지 계약이 끝난 것이 아닙니다.** 기준일 없이 신선도를 판정하면 멀쩡한 물건을 막습니다.
>
> **`asOf`가 없으면 F12·F13을 평가하지 않고 결손으로 남깁니다.**

---

## 3. 목(mock) 정책

### 3.1 무엇을 목하는가

| 대상 | 단위 테스트 | 방법 |
|---|:-:|---|
| **LLM 호출** | **전량 목** | 고정 문자열 반환 |
| 외부 공공 API | 목 | `mockLandUsePlan()` 등 |
| DB | **목 안 함** | 순수 함수만 테스트 |
| 현재 시각 | **고정** | §5 |
| 파일 시스템 | 목 안 함 | 픽스처는 실제 파일 |

### 3.2 DB를 목하지 않는 이유

**DB에 의존하는 함수는 단위 테스트 대상이 아닙니다.** 산식·판정 함수는 전부 순수 함수여야 하고, 그렇지 않다면 그것이 설계 문제입니다.

```ts
// ❌ 테스트하려면 DB가 필요
async function computeYields(assetId: string) {
  const rows = await db.from('lease_ledger').select().eq('asset_id', assetId);
  ...
}

// ✅ 순수 — 픽스처만 있으면 됨
function computeYields(input: FinancialInput): Partial<Record<CapRateBasis, YieldValue>>
```

### 3.3 외부 API 목 — 실패 경로를 먼저 씁니다

```ts
it('UT-DEV-01 용도지역 조회 실패 시 개발 규모를 산출하지 않는다', async () => {
  mockLandUsePlan(null);                          // ★ 실패부터
  const a = await resolveTargetFar('1168010600...');
  expect(a.value).toBeNull();
  expect(a.confidence).toBe('low');
});
```

**성공 경로만 테스트하면 조회 실패 시 기본값 400%가 들어가는 것을 못 잡습니다.** 실제로 그렇게 되어 있었습니다.

### 3.4 LLM 목

```ts
export function mockLLM(bySection: Partial<Record<SectionType, string>>) {
  vi.mocked(callLLM).mockImplementation(async ({ sectionType }) =>
    bySection[sectionType] ?? '(고정 응답)');
}
```

**Judge도 함께 목합니다.** 점수를 실제로 매기면 비결정적입니다.

---

## 4. 🔴 비결정성 처리

### 4.1 세 종류를 구분합니다

| 원인 | 처리 |
|---|---|
| **LLM 출력** | 단위 테스트에서 **호출 안 함** |
| **현재 시각** | 시계 고정 (§5) |
| **`/g` 정규식 `lastIndex`** | **명시적 초기화** |

### 4.2 정규식 함정

```ts
const PERSONA = /(\d0대|자산가|법인\s?대표)[^.]{0,20}?(을?\s?위한|맞춤|용)/g;

// ❌ 2회 호출 결과가 번갈아 바뀜
if (PERSONA.test(s)) { ... }

// ✅
PERSONA.lastIndex = 0;
if (PERSONA.test(s)) { ... }
```

```ts
it('UT-CLEAN-02 같은 입력에 같은 결과를 낸다', () => {
  const s = '40대 자산가를 위한 매물입니다.';
  expect(sanitizePersona(s)).toBe(sanitizePersona(s));      // ★ 2회 호출
});
```

**멱등성 테스트를 정제 함수 전량에 답니다.** 한 번 더 부르면 달라지는 함수는 배치 처리에서 반드시 사고를 냅니다.

### 4.3 부동소수

```ts
// ❌
expect(y.gross_price!.value).toBe(2.24);

// ✅ 표시 자릿수까지만
expect(y.gross_price!.value).toBeCloseTo(2.24, 2);
```

**금액은 정수로 비교합니다.** 원 단위로 계산하므로 `toBe`가 맞습니다.

```ts
expect(eq.totalAcquisitionCost).toBe(26_375_000_000);       // 원 단위 · 정확 비교
```

> **금액을 `number`로 유지하는 한 2^53까지 안전합니다.** 국내 부동산 금액(최대 수조 원)은 여유가 있으나, **평당가 × 면적 같은 중간 곱셈에서 소수가 생기면 반올림 시점을 고정**해야 합니다. 산식 함수는 원 단위 정수를 반환하고, 반올림은 포맷 단계에서만 합니다.

---

## 5. 시간 고정

### 5.1 `Date.now()`를 직접 부르지 않습니다

```ts
// ❌ 오늘 통과하고 내일 실패
const remaining = 10 - yearsSince(u.firstContractDate);

// ✅ 기준일을 주입
export function commercialVacatePoint(u: LeaseRow, asOf: Date): VacateVerdict
```

### 5.2 헬퍼

```ts
export function freezeClock(iso: string) {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso)); });
  afterAll(() => { vi.useRealTimers(); });
}

describe('UT-LEASE', () => {
  freezeClock('2026-08-23T00:00:00+09:00');
  ...
});
```

### 5.3 기준일 3종을 혼동하지 않습니다

| 기준일 | 의미 | 출처 |
|---|---|---|
| **`ledger.asOf`** | **렌트롤이 언제 기준인가** | 중개인 입력 |
| `evaluatedAt` | 계산 시점 | 시스템 |
| `generatedAt` | IM 생성 시점 | 시스템 |

**갱신요구권·신선도는 `asOf` 기준입니다.** `evaluatedAt`으로 계산하면 오래된 렌트롤이 전부 만료로 나옵니다. (§2.5)

---

## 6. 게이트 테스트

### 6.1 항상 쌍으로 씁니다

```ts
describe('GT-G19 표지 합계 ↔ 원장 합계', () => {
  const fx = loadFixture('yangpyeong');

  it('GT-G19-01 불일치를 차단한다', () => {
    const v = runDeterministicGates(coreFrom(fx));           // stated 50,170천
    const g = v.find(x => x.code === 'G19')!;
    expect(g.block).toBe(true);
    expect(g.ask).toContain('어느 쪽이 정본');
  });

  it('GT-G19-02 일치하면 차단하지 않는다', () => {            // ★ 거짓양성
    const core = coreFrom(fx, { statedMonthlyRent: fx.expect.sumMonthlyRentKrw });
    expect(runDeterministicGates(core).find(x => x.code === 'G19')).toBeUndefined();
  });
});
```

**거짓양성 테스트가 없으면 게이트가 과해집니다.** 과한 게이트는 사용자가 우회로를 찾게 만들고, 결국 꺼집니다.

### 6.2 차단 6 · 경고 3을 타입으로 확인

```ts
it('GT-CODES-01 게이트 9종의 차단 여부가 D3 §4.1과 일치한다', () => {
  const blocking = ['G19','C19','G21','C-BASIS','G13','F12'];
  const warning  = ['G18','G17','F13'];
  expect(blocking.length + warning.length).toBe(9);
  for (const c of blocking) expect(GATE_SPEC[c].block).toBe(true);
  for (const c of warning)  expect(GATE_SPEC[c].block).toBe(false);
});
```

### 6.3 메시지 문구를 통째로 비교하지 않습니다

```ts
// ❌ 문구를 다듬으면 깨짐
expect(g.ask).toBe('표지 월세 합계(50,170,000)와 원장 합계(46,570,000)가 다릅니다...');

// ✅ 핵심 요소만
expect(g.ask).toContain('어느 쪽이 정본');
expect(g.ask).toContain('46,570,000');
```

---

## 7. 안티패턴 8종

| # | 하지 말 것 | 대신 |
|:-:|---|---|
| 1 | `expect(fn).not.toThrow()` 로 끝내기 | **값을 확인** |
| 2 | 기대값을 테스트 파일에 하드코딩 | 픽스처 `expect` |
| 3 | 단위 테스트에서 LLM 호출 | 목 |
| 4 | `Date.now()` 의존 | 기준일 주입 |
| 5 | 성공 경로만 테스트 | **실패 경로 먼저** |
| 6 | 한 `it()`에 여러 단언 | 분리 |
| 7 | 스냅샷으로 산식 검증 | **명시적 단언** |
| 8 | `toBe`로 부동소수 비교 | `toBeCloseTo(v, 2)` |

### 7.1 7번이 가장 흔합니다

```ts
// ❌ 값이 틀려도 스냅샷을 갱신하면 초록불
expect(computeYields(input)).toMatchSnapshot();
```

**스냅샷은 "바뀌었다"만 알려주고 "맞다"는 말하지 않습니다.** 렌더 결과에는 쓰되 **산식에는 쓰지 않습니다.**

### 7.2 5번 — 이번 진단의 4대 오류가 전부 실패 경로였습니다

| 오류 | 실패 경로 |
|---|---|
| 용적률 400% | 조회 실패 |
| NOI 0.85 | `opexKrw` 없음 |
| 목표 매각가 ×1.2 | comps 없음 |
| 갱신권 오산 | 최초계약일 없음 |

**넷 다 "값이 있을 때"는 정상 동작했습니다.**

---

## 8. 실행

### 8.1 명령

| 명령 | 대상 | 소요 |
|---|---|--:|
| `npm run test:unit` | `tests/unit/` | ~60초 |
| `npm run test:gates` | `tests/gates/` | ~30초 |
| `npm run test:contract` | 타입 · 스키마 대조 | ~45초 |
| `npm run test:fixtures` | **픽스처 자기검산 58항** | ~2초 |
| `npm run test` | 위 전부 | ~2.5분 |

**`test:fixtures`를 가장 먼저 돌립니다.** 픽스처가 틀리면 나머지가 무의미합니다.

### 8.2 커버리지

| 모듈 | 라인 | **분기** |
|---|--:|--:|
| `financials/` | 95% | **95%** |
| `gates/` | 100% | **100%** |
| `lease/` | 95% | 95% |
| `render/` | 80% | 70% |
| 그 외 | 70% | 60% |

**분기 커버리지를 라인보다 중시합니다.** `if (opexKrw != null)`의 else가 안 밟히면 불변조건 1이 무의미합니다.

---

## 9. 새 테스트를 추가할 때

| # | 확인 |
|:-:|---|
| 1 | D9 §2 매핑표에 ID가 있는가 (없으면 먼저 등록) |
| 2 | `it()` 첫 단어가 그 ID인가 |
| 3 | 기대값이 픽스처에서 오는가 |
| 4 | **실패 경로를 함께 썼는가** |
| 5 | 게이트라면 **거짓양성 쌍**이 있는가 |
| 6 | 시간에 의존한다면 시계를 고정했는가 |
| 7 | LLM을 호출하지 않는가 |
| 8 | 실패 메시지에 상호·물건명이 없는가 |

### 9.1 불변조건을 추가하는 PR

**테스트를 함께 제출합니다.** D9 §2가 21/21을 유지해야 하고, 빈 칸이 생기면 CI가 막습니다.

---

## 10. 참고

| 영역 | 문서 |
|---|---|
| 무엇을 검증할지 | **`TEST_PLAN.md` (D9)** |
| **E2E 작성법** | **`E2E_TEST_GUIDE.md` (D15)** |
| 타입 | `API_TYPE_CONTRACT.md` (D3) |
| 산식 | `POSTURE_IMPL_GUIDE.md` (D10) |
| 가정값 | `ASSUMPTION_REGISTRY.md` (D4) |
| 정제 정규식 | `GOLDEN_CLEANUP_GUIDE.md` (D5) |
