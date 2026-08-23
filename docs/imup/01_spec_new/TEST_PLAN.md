# 테스트 계획

> **D9** · `API_TYPE_CONTRACT.md` (D3) 타입 기반 검증 계획
> **불변조건 21개 전부에 대응 테스트가 있어야 합니다.** 없으면 그 조건은 지켜지지 않습니다.

| | |
|---|---|
| **문서 ID** | D9 |
| **소유** | 개발팀 + QA |
| **선행 정본** | **D3 전체** · `IM_SYSTEM_SSOT.md` v1.4 §6·§11 · D6 §2 · D13 §3 |
| **대상 단계** | 3 (5.0일) 상시 · 전 단계 DoD |
| **작성일** | 2026-08-23 |

---

## 0. 원칙 4가지

### 0.1 🔴 잡아야 할 것은 "조용히 틀린 값"입니다

30일 통계에서 **시스템 오류는 0건**입니다. 예외를 던지는 버그는 이미 잘 잡힙니다.

문제는 **예외 없이 완주하면서 틀린 숫자를 내는 경로**입니다. 이번 진단에서 확인된 것만.

| 사례 | 예외 | 결과 |
|---|:-:|---|
| `im_generation_cost_log` INSERT 실패 | 없음 | **3개월간 비용 데이터 0** |
| 개발형 용적률 400% 일괄 적용 | 없음 | 분양수입 **1.6배 과대** |
| NOI = 총임대료 × 0.85 | 없음 | 근거 없는 순수익률 표기 |
| 주택에 상가 갱신권 산식 적용 | 없음 | 명도 시점 **최대 2년 9개월 오차** |

**전부 테스트가 없어서 통과했습니다.** 커버리지 숫자가 아니라 이 네 종류를 잡는 것이 목표입니다.

### 0.2 실매물 실측값을 기대값으로 씁니다

합성 데이터로는 위 네 가지를 못 잡습니다. **5개 실매물의 실측 숫자**를 고정 기대값으로 박습니다.

### 0.3 게이트 테스트는 양방향으로 씁니다

차단되어야 할 입력이 차단되는지(**참양성**)와, **정상 입력이 차단되지 않는지**(거짓양성)를 함께 봅니다. 게이트가 과하면 사용자가 우회로를 찾습니다.

### 0.4 테스트가 없는 불변조건은 불변조건이 아닙니다

§2가 이 문서의 핵심입니다.

---

## 1. 계층

> **작성 방법은 이 문서가 아니라 D14·D15가 정합니다.**
>
> | 문서 | 소유 |
> |---|---|
> | **`UNIT_TEST_GUIDE.md` (D14)** | 픽스처 · 목 정책 · 비결정성 · 명명 · 안티패턴 |
> | **`E2E_TEST_GUIDE.md` (D15)** | 시나리오 스텝 · DB 시딩 · LLM 실호출 단언 · 아티팩트 |
>
> 실매물 5건 픽스처는 실제 파일로 제공됩니다 — `fixtures/*.json` (자기검산 58항).

| # | 계층 | 대상 | 도구 | 실행 |
|:-:|---|---|---|---|
| 1 | **단위** | 산식·판정 함수 | Vitest | 모든 커밋 |
| 2 | **타입 계약** | D3 타입 준수 | `tsc --noEmit` | 모든 커밋 |
| 3 | **스키마 정합** | 코드 ↔ DB 테이블 | 대조 스크립트 | 모든 커밋 |
| 4 | **게이트** | 9종 참/거짓양성 | Vitest | 모든 커밋 |
| 5 | **E2E 실매물** | 5건 전 경로 | Playwright | 머지 · 야간 |
| 6 | **회귀 골든** | 출력 스냅샷 | Vitest snapshot | 머지 |
| 7 | **성능** | 63.1초 · 120초 한계 | 부하 스크립트 | 단계 1.5 · 주간 |

---

## 2. 🔴 불변조건 21 → 테스트 매핑

**빈 칸이 하나도 없어야 합니다.**

| # | 불변조건 | 계층 | 테스트 ID |
|:-:|---|:-:|---|
| 1 | 운영비를 모르면 NOI를 산출하지 않는다 | 1 | `UT-YIELD-01` |
| 2 | 수익률에 `basis`가 없으면 렌더하지 않는다 | 2·4 | `TC-BASIS-01` |
| 3 | gross 계열에 "순수익률" 라벨 금지 | 1 | `UT-YIELD-02` |
| 4 | 용도지역 조회 실패 시 개발 규모 미산출 | 1 | `UT-DEV-01` |
| 5 | comps 없으면 목표 매각가 미산출 | 1 | `UT-TRADE-01` |
| 6 | 업종·상호는 원문 그대로 · 추론 금지 | 4 | `GT-G17-01` |
| 7 | 최초계약일 없이 갱신권 연수 미출력 | 1·4 | `UT-LEASE-01~04` |
| 8 | 자가사용을 공실로 계산하지 않는다 | 1 | `UT-LEDGER-01` |
| 9 | 확인사항은 공개 단계에서도 마스킹 금지 | 1 | `UT-MASK-01` |
| 10 | Golden 승격에 사람 승인 필수 | 1 | `UT-GOLDEN-01` |
| 11 | 결정론 게이트는 FAST_MODE에서도 실행 | 4 | `GT-MODE-01` |
| 12 | 미존재 테이블 참조는 CI에서 차단 | **3** | `SC-TABLE-01` |
| 13 | 결손은 확인사항으로 이동 | 1·2 | `UT-DEF-01` |
| 14 | 물건명·법인명·임차인명 대외 미표기 | 1 | `UT-MASK-02` |
| 15 | 섹션 증설 전 생성 시간 측정 (한계 120초) | **7** | `PF-LIMIT-01` |
| 16 | 자동 comps 불가 구간(300억 초과)은 `manual_comps` 없이 가격 근거 금지 | 1 | `UT-COMPS-01` |
| 17 | Golden 저장 전 `sanitizePersona`·`stripMarkdown` | 1·6 | `UT-CLEAN-01~02` |
| 18 | 렌트롤 전량 표기 (8행 제한 금지) | 6 | `RG-A03-01` |
| 19 | Hero 지표는 검산 가능한 것으로 | 6 | `RG-HERO-01` |
| 20 | 필수값은 폼에서 먼저 · 서버 게이트 유지 | 4·5 | `GT-REQ-01~02` |
| 21 | "실패"를 3종으로 나눠 집계 | 1 | `UT-OUTCOME-01` |

**21/21 대응.** 신규 불변조건을 추가하는 PR은 테스트를 함께 제출합니다.

### 2.1 본문에서 다루지 않는 14종 — 여기서 명세를 끝냅니다

§3~§7은 실매물 근거가 있는 것만 상술합니다. **나머지도 ID만 두면 테스트가 아니므로** 입력·기대를 여기서 확정합니다.

| ID | 입력 | 기대 |
|---|---|---|
| `UT-YIELD-01` | `opexKrw: null` | `noi_*` 키가 **객체에 생성되지 않음** |
| `UT-YIELD-02` | `basis: 'gross_price'` | 라벨 "연 수익률" · **"순수익률" 미포함** |
| `UT-DEV-01` | `targetFarByZoning: null` | 개발 규모 미산출 · `Deficiency` 1건 |
| `UT-TRADE-01` | `manualComps: null` | `exitPrice === null` · **매입가 × 1.2 미사용** |
| `UT-COMPS-01` | `priceKrw: 35_000_000_000` (B4) | `requiresManualComps` **true** · 가격 근거 미렌더 |
| `UT-COMPS-02` | `priceKrw: 15_000_000_000` (B3) | **false** — 자동 조회 구간 |
| `UT-LEDGER-01` | `leaseState: '자가사용'` 2행 | 공실률 계산에서 **분모·분자 모두 제외** |
| `UT-MASK-01` | `applyMask(core, 'public')` | `deficiencies` **길이 불변** |
| `UT-MASK-02` | 상호 "○○상사" 포함 | `public` 출력에 상호 **미포함** |
| `UT-GOLDEN-01` | `promoteGolden(c, '')` | **throw** |
| `UT-DEF-01` | 필수 필드 결손 3종 | `deficiencies.length === 3` · `nextBest` 비어있지 않음 |
| `UT-OUTCOME-01` | 4종 예외 각 1건 | `classifyOutcome`이 4분류를 정확히 반환 |
| `UT-LEASE-01` | §4.2 참조 | 상가 10년 만기일 |
| `GT-REQ-01` | 폼: 매각가 미입력 | **제출 버튼 비활성** · API 미호출 |
| `SC-TABLE-01` | §8.2 스크립트 | 미존재 테이블 참조 **0건** |

> `GT-REQ-02`는 `GT-REQ-01`의 서버 측 짝입니다. **폼을 우회한 직접 API 호출**에서 `InputRequiredError`가 나야 합니다. 둘 다 있어야 이중 방어입니다.

---

## 3. 게이트 테스트 — 실매물 실측값

### 3.1 G19 · 표지 합계 ≠ 원장 합계 → 차단

**양평동 실측.**

| 항목 | 표지 요약 | 원장 합계 | 차이 |
|---|--:|--:|--:|
| 보증금 | 5억 3,500만 | **4억 9,500만** | 4,000만 |
| **월 임대료** | 5,017만 | **4,657만** | **360만** |
| 관리비 | 648만 | **576만** | 72만 |

```ts
it('GT-G19-01 표지 월세가 원장 합계와 다르면 차단한다', () => {
  const v = runDeterministicGates(yangpyeongCore({ statedMonthlyRent: 50_170_000 }));
  const g19 = v.find(x => x.code === 'G19')!;
  expect(g19.block).toBe(true);
  expect(g19.ask).toContain('어느 쪽이 정본');
});

it('GT-G19-02 일치하면 차단하지 않는다', () => {           // 거짓양성 방지
  const v = runDeterministicGates(yangpyeongCore({ statedMonthlyRent: 46_570_000 }));
  expect(v.find(x => x.code === 'G19')).toBeUndefined();
});
```

**월 360만원은 연 4,320만원이고 매매가 250억 기준 수익률 0.17%p 차이입니다.** 매수인이 검산하면 즉시 드러납니다.

### 3.2 C19 · 면적 불일치 → 차단

**당산동 실측 — 표의 계 행이 자기 행 합과 다릅니다.**

| | 값 |
|---|--:|
| 층별 행 합 | **1,441.15㎡** |
| 표의 계 행 | 1,141.15㎡ |
| 차이 | **정확히 300.00㎡** (20.8%) |

```ts
it('GT-C19-01 면적 20.8% 불일치를 차단한다', () => {
  const v = runDeterministicGates(dangsanCore({ statedTotalAreaSqm: 1141.15 }));
  expect(v.find(x => x.code === 'C19')?.block).toBe(true);
});

it('GT-C19-02 ±2% 이내는 통과시킨다', () => {
  const v = runDeterministicGates(dangsanCore({ statedTotalAreaSqm: 1460 }));  // +1.3%
  expect(v.find(x => x.code === 'C19')).toBeUndefined();
});
```

> **어느 쪽이 맞는지 시스템이 정하지 않습니다.** 건축물대장이 첨부되지 않아 확정할 수 없고, 확인 가능한 사실은 "표가 자기모순"이라는 것까지입니다. 게이트는 **질문을 띄우는 것**이 역할입니다.

### 3.3 G21 · 첨부 공부 소재지 불일치 → 차단

**양평동 IM에 다른 물건의 토지이용계획원이 첨부돼 있었습니다.**

| 항목 | 값 |
|---|---|
| 본건 | 영등포구 양평동 |
| **첨부 토지이용계획원** | **강남구 논현동 194-6** |

```ts
it('GT-G21-01 첨부 공부 소재지가 본건과 다르면 차단한다', () => {
  const v = runDeterministicGates(yangpyeongCore({
    attachedDocs: [{ kind: '토지이용계획원', address: '서울 강남구 논현동 194-6' }],
  }));
  expect(v.find(x => x.code === 'G21')?.block).toBe(true);
});
```

**사람이 눈으로 검수해서 못 잡은 사고입니다.** PNU 비교는 기계가 확실히 이깁니다.

### 3.4 나머지 6종

| ID | 게이트 | 입력 | 기대 |
|---|:-:|---|---|
| `TC-BASIS-01` | C-BASIS | `{ value: 2.24 }` (basis 없음) | **렌더 거부** |
| `GT-G18-01` | G18 | `firstContractDate: null` · 상가 | "확인 필요" 치환 · **차단 아님** |
| `GT-G13-01` | G13 | `opposingPower: null` + "대항력 없음" 문구 | **차단** |
| `GT-G17-01` | G17 | `tenantBusiness: null` | "미상" 치환 · **추론 금지** |
| `GT-F12-01` | F12 | 만료 계약 7/12행 (58%) | **차단** |
| `GT-F13-01` | F13 | 30일 내 만료 1건 | 경고 · 발행 허용 |
| `GT-MODE-01` | 전체 | `FAST_MODE=1` | **9종 전부 실행** |

---

## 4. 🔴 갱신요구권 분기 — T-C / T-R

**이 항목만 별도 절을 둡니다. 설계 단계에서 실제로 틀렸던 곳입니다.**

### 4.1 틀렸던 규칙

```ts
// ❌ 원안 — 주택 갱신권을 "4년 상한"으로 오해
if (renewalExercised) return 0;
return Math.max(0, 4 - elapsed);      // 경과 7년이면 0을 반환
```

주택 갱신요구권은 **기간 상한이 아니라 "1회 행사 시 +2년"** 입니다. 최초계약일로는 계산할 수 없습니다.

### 4.2 테스트 4종

```ts
describe('UT-LEASE 갱신요구권', () => {
  it('01 상가 — 최초계약일 기산 10년', () => {
    const r = commercialVacatePoint({ ...row, legalBasis: '상가',
      firstContractDate: '2019-04-01' }, new Date('2026-08-23'));
    expect(r.state).toBe('determined');
    expect(r.at).toBe('2029-04-01');
  });

  it('02 상가 — 최초계약일 없으면 unknown', () => {
    const r = commercialVacatePoint({ ...row, firstContractDate: null }, TODAY);
    expect(r.state).toBe('unknown');
    expect(r.reason).toContain('최초 계약일');
  });

  it('03 주택 — 행사 이력 없으면 만료일 +24개월', () => {
    const r = residentialVacatePoint({ ...row, legalBasis: '주택',
      renewalExercised: '없음', currentExpiryDate: '2027-03-31' });
    expect(r.at).toBe('2029-03-31');
  });

  it('04 주택 — 행사 이력 모르면 unknown (최초계약일이 있어도)', () => {
    const r = residentialVacatePoint({ ...row, legalBasis: '주택',
      renewalExercised: '모름', firstContractDate: '2019-04-01' });
    expect(r.state).toBe('unknown');                    // ★ 숫자를 내면 안 됨
  });
});
```

**04번이 가장 중요합니다.** 최초계약일이 있으면 계산하고 싶어지는데, 주택에서는 그 값으로 아무것도 알 수 없습니다.

### 4.3 오차 규모

| 임차인 | 실제 명도 시점 | 상가 산식 오적용 시 | **오차** |
|---|---|---|--:|
| 301호 (주택) | 2027-06 | 2029-04 | **1년 10개월** |
| 401호 (주택) | 2026-11 | 2029-08 | **2년 9개월** |

**개발형에서 이 오차는 착공 시점을 통째로 바꿉니다.**

---

## 5. E2E 실매물 5건

### 5.1 세트

| # | 물건 | 포스처 | 해상도 | 특징 | 기대 |
|:-:|---|---|:-:|---|---|
| 1 | **양평동** | income | R2 | 12행 · 표지 불일치 · 오첨부 | **G19·G21 차단** |
| 2 | **당산동** | income | R1 | 8행 · 통합계약 · 면적 자기모순 | **C19 차단** |
| 3 | 잠원동 | development | R1 | 매도인 명도 · 2종일반주거 | 용적률 **250%** 적용 |
| 4 | 수택동 | development | R3 | 매수인 명도 | R3 미달 시 수지 숨김 |
| 5 | 호텔 | operating | O2 | GOP | **`gop_price` 보류** |

### 5.2 income 2건 — 수치 기대값

| 항목 | 양평동 | 당산동 |
|---|--:|--:|
| 매매가 | 250억 | 115억 |
| 보증금 합계 | 4억 9,500만 | 2억 9,000만 |
| 월 임대료 합계 | 4,657만 | 1,946만 |
| **`gross_price`** | **2.24%** | **2.03%** |
| **`gross_price_deposit`** | **2.28%** | **2.08%** |
| 취득세 (4.6%) | 11.50억 | 5.29억 |
| 중개보수 (0.9%) | 2.25억 | 1.04억 |
| **총취득원가** | **263.75억** | **121.33억** |
| 실투자금 (무차입) | 258.80억 | 118.43억 |
| `noi_*` 계열 | **미산출** | **미산출** |

```ts
it('E2E-01 양평동 gross_price 2.24%', async () => {
  const core = await buildIMCore(YANGPYEONG);
  expect(core.yields.gross_price!.value).toBeCloseTo(2.24, 2);
  expect(core.yields.noi_price).toBeUndefined();          // opexKrw 없음
  expect(core.equity.totalAcquisitionCost).toBe(26_375_000_000);
});
```

### 5.3 🔴 역레버리지 — 두 물건 모두 LTV 50%에서 월 순현금이 음수입니다

대출금리 4.5% 가정.

| | 양평동 | 당산동 |
|---|--:|--:|
| 월 임대료 | 4,657만 | 1,946만 |
| LTV 50% 대출 | 125.0억 | 57.5억 |
| 월 이자 | **4,688만** | **2,156만** |
| **월 순현금** | **−30.5만** | **−210.3만** |

```ts
it('E2E-03 LTV 50%에서 역레버리지 경고가 반드시 뜬다', async () => {
  const core = await buildIMCore({ ...YANGPYEONG, ltv: 0.5 });
  expect(core.headline).toMatchObject({ posture: 'income', negativeLeverage: true });
  expect(core.headline.monthlyNetCashFlow).toBeLessThan(0);
});
```

> **두 IM 원본 어디에도 이 계산이 없었습니다.** 수익률 2.2%가 대출금리 4.5%보다 낮으면 대출을 늘릴수록 자기자본 수익률이 떨어집니다. 매수인이 가장 먼저 알아야 할 숫자입니다.

### 5.4 잠원동 — 용적률

| | 용적률 | 지상 연면적 |
|---|--:|--:|
| 시스템 기본값 (폐기 대상) | 400% | 2,464㎡ |
| **제2종일반주거 상한** | **250%** | **1,540㎡** |
| 오차 | **+60%** | 분양수입 **1.6배 과대** |

```ts
it('E2E-04 용도지역 조회 실패 시 개발 규모를 산출하지 않는다', async () => {
  mockLandUsePlan(null);
  const core = await buildIMCore(JAMWON);
  expect(core.headline).toMatchObject({ posture: 'development', requiredEquity: null });
  expect(core.deficiencies.map(d => d.field)).toContain('targetFarByZoning');
});
```

**한시 완화(2025-05-19 ~ 2028-05-18)를 근거로 쓸 때는 종료일과 잔여 기간을 병기합니다.**

---

## 6. 회귀

### 6.1 Golden 정제 전후

| 대상 | 건수 | 검사 |
|---|--:|---|
| 자동 정제 | **141** | 이모지 0 · 페르소나 문구 0 |
| 수동 검토 | **28** | 체크 완료 여부 |
| **사실 오류** | **0** | 정제 전후 숫자 동일 |

```ts
it('UT-CLEAN-01 정제가 숫자를 바꾸지 않는다', () => {
  for (const g of GOLDEN_154) {
    expect(extractNumbers(sanitize(g.body))).toEqual(extractNumbers(g.body));
  }
});

it('UT-CLEAN-02 /g 정규식 lastIndex가 초기화된다', () => {
  const s = '40대 자산가를 위한 매물입니다.';
  expect(sanitizePersona(s)).toBe(sanitizePersona(s));     // 2회 호출 결과 동일
});
```

> **02번이 실무 함정입니다.** `/g` 플래그 정규식에 `.test()`를 반복 호출하면 `lastIndex`가 유지되어 결과가 번갈아 바뀝니다.

### 6.2 A03 렌트롤 전량 표기

```ts
it('RG-A03-01 12행 렌트롤이 잘리지 않는다', () => {
  const slides = splitLedgerSlides(YANGPYEONG_12_ROWS);
  expect(slides.flatMap(s => s.rows)).toHaveLength(12);
  expect(JSON.stringify(slides)).not.toContain('별첨 참조');
});
```

| 물건 | 행수 | 현행 누락 | 개선 후 |
|---|--:|--:|---|
| 당산동 | 8 | 0 | 1장 |
| **양평동** | **12** | **4행** | 1장 |
| 연남동 골든 | 11 | 3행 | 1장 |
| 잠원동 | 18 | **10행** | 2장 |

### 6.3 Hero 지표

```ts
it('RG-HERO-01 검산 불가 지표를 Hero에 두지 않는다', () => {
  const hero = buildHero(core);
  expect(hero.map(h => h.key)).toEqual(['price', 'pricePerPyeong', 'monthlyRent', 'deficiencyCount']);
  expect(JSON.stringify(hero)).not.toMatch(/Cap Rate|WALE/);
});
```

---

## 7. 성능

| ID | 검사 | 기준 |
|---|---|--:|
| `PF-BASE-01` | 현행 평균 | 104.3초 |
| `PF-PAR-01` | 병렬화 후 평균 | **≤ 70초** |
| `PF-PAR-02` | 병렬화 후 p95 | ≤ 95초 |
| **`PF-LIMIT-01`** | **p95 한계선** | **< 120초** |
| `PF-STAGE-01` | 구간 5종 합 ≈ 총 소요 | ±5% |

```ts
it('PF-LIMIT-01 섹션 증설 전 p95가 120초 미만이어야 한다', async () => {
  const p95 = await measureP95(20);
  expect(p95).toBeLessThan(120_000);
});
```

**이 테스트가 실패하면 섹션을 늘리는 PR을 머지하지 않습니다.** (불변조건 15)

### 7.1 병렬화 안전성

```ts
it('PF-PAR-03 병렬 섹션 간 앵커만 전달된다', async () => {
  const calls = await captureLLMCalls(buildIMCore(YANGPYEONG));
  const stage1 = calls.filter(c => c.parallelGroup === 1);
  for (const c of stage1) {
    expect(c.prompt).not.toContain('## ');            // 앞 섹션 마크다운 미포함
  }
});
```

**현행은 앞 섹션 마크다운 전체를 넘깁니다.** 병렬에서는 검증된 앵커 5종만 넘기므로 표현 오염이 번지지 않습니다.

---

## 8. CI

### 8.1 단계

| # | 단계 | 실패 시 | 소요 |
|:-:|---|---|--:|
| 1 | `tsc --noEmit` | **머지 차단** | 40초 |
| 2 | **스키마 대조** | **머지 차단** | 5초 |
| 3 | 단위 + 게이트 | **머지 차단** | 90초 |
| 4 | 회귀 스냅샷 | **머지 차단** | 60초 |
| 5 | E2E 5건 | 경고 → 야간 재실행 | 12분 |
| 6 | 성능 | 주간 · 경고 | 25분 |

### 8.2 2번 — 6줄로 3개월을 아낍니다

```bash
psql -Atc "SELECT tablename FROM pg_tables WHERE schemaname='public'" | sort > /tmp/actual.txt
grep -rhoP "from\(['\"]\K[a-z_]+" src/ | sort -u > /tmp/referenced.txt
comm -13 /tmp/actual.txt /tmp/referenced.txt > /tmp/missing.txt
[ -s /tmp/missing.txt ] && { echo "미존재 테이블 참조:"; cat /tmp/missing.txt; exit 1; }
echo "스키마 정합 ✓"
```

**`im_generation_cost_log` 3개월 미작동은 이걸로 첫날 잡혔습니다.** (불변조건 12)

### 8.3 금지 패턴 grep

| # | 패턴 | 사유 |
|:-:|---|---|
| 1 | `posture ?? ` · `posture \|\| ` | 기본값 금지 (D3 §1.2) |
| 2 | `LIKE '%` (jobs 쿼리) | 문자열 분류 금지 (D6 §3.1) |
| 3 | `* 0.85` · `* 0.046` (재무 모듈) | 가정값 하드코딩 (D4) |
| 4 | `slice(0, 8)` (a03) | 8행 제한 (불변조건 18) |

---

## 9. 커버리지 목표

| 모듈 | 라인 | 분기 | 사유 |
|---|--:|--:|---|
| `financials/` | **95%** | **95%** | 숫자가 틀리면 전부 틀림 |
| `gates/` | **100%** | **100%** | 9종 × 참/거짓양성 |
| `lease/` | **95%** | 95% | 갱신권 분기 |
| `render/` | 80% | 70% | 스냅샷으로 보완 |
| 그 외 | 70% | 60% | |

**분기 커버리지를 라인보다 중시합니다.** `if (opexKrw != null)`의 else 경로가 안 밟히면 불변조건 1이 무의미합니다.

---

## 10. DoD

| # | 조건 |
|:-:|---|
| 1 | **불변조건 21개 전부에 통과하는 테스트 존재** |
| 2 | 게이트 9종 각각 참양성·거짓양성 2케이스 |
| 3 | E2E 5건 통과 · 기대 수치 §5.2와 일치 |
| 4 | 스키마 대조 결과 공집합 |
| 5 | 금지 패턴 4종 grep 결과 0건 |
| 6 | `financials/`·`gates/` 커버리지 목표 달성 |
| 7 | `PF-LIMIT-01` p95 < 120초 |

---

## 11. 미확정 2건

| # | 항목 | 확정 |
|:-:|---|---|
| A | 수택동 R3 판정 실측 데이터 | 원본 PPTX 재확인 필요 |
| B | **호텔 GOP 기대값** | **Opex 35% ↔ GOP 마진 35% 확인 후** |

### 11.1 B — 기대값을 쓸 수 없습니다

```
financials.ts:132   Opex Ratio — 호텔 = 35%
financials.ts:421   GOP 마진율 기본값   = 35%
```

Opex 35%면 GOP 마진은 65%가 되고, 업계 통상은 30~40%입니다. **어느 쪽이 맞는지 모르는 상태에서 기대값을 박으면 틀린 값을 고정합니다.** 확인 전까지 호텔 E2E는 `gop_price` 미산출을 기대값으로 둡니다.

---

## 12. 다음 배치 인계

| 인계 | 받는 곳 |
|---|---|
| §2 매핑 ID 21종 | **D14** `it()` 명명 |
| §5 실매물 기대값 | **D14** 픽스처 · **D15** 시나리오 |
| §7 성능 기준 | **D2** 단계 1.5 DoD |
| §6.2 A03 분할 케이스 | **D7** 구현 |
| §6.3 Hero 지표 4종 | **D8** 모바일 |
| §5 실매물 기대값 | **D10** 포스처별 산식 |
