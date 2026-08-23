# E2E 테스트 작성 지침

> **D15** · 입력 폼에서 PPTX 파일까지 전 경로를 실제로 통과시킵니다.
> **LLM을 실제로 호출합니다.** 그래서 무엇을 단언하고 무엇을 단언하지 않을지가 이 문서의 핵심입니다.

| | |
|---|---|
| **문서 ID** | D15 |
| **소유** | 개발팀 + QA |
| **선행 정본** | **D14 (픽스처·목 정책)** · D9 §5 · D7 좌표 · D8 화면 |
| **부속** | `fixtures/*.json` 5건 |
| **작성일** | 2026-08-23 |

---

## 0. 원칙 5가지

### 0.1 E2E는 비쌉니다 — 5건만 씁니다

| | 단위 | E2E |
|---|--:|--:|
| 1건 소요 | 밀리초 | **~104초** |
| LLM 비용 | 0 | 건당 14회 호출 |
| 5건 전체 | — | **~12분** |

**커버리지를 E2E로 올리려 하지 않습니다.** 단위로 잡을 수 있는 것은 단위에서 잡습니다.

### 0.2 E2E로만 잡히는 것

| 오직 E2E | 이유 |
|---|---|
| **계층 간 이름 불일치** | 각 계층은 자기 테스트를 통과함 |
| **미존재 테이블 참조** | `cost-tracker.ts`가 3개월 조용히 실패 |
| **두 매체 숫자 불일치** | 모바일과 PPTX가 따로 렌더 |
| **좌표 실렌더 이탈** | 계산이 맞아도 실물이 다를 수 있음 |
| 폼 → 서버 → 파일 전 경로 | — |

### 0.3 🔴 LLM 문장을 단언하지 않습니다

같은 입력에 다른 문장이 나옵니다. **문장을 비교하면 테스트가 무작위로 깨지고, 개발자는 재실행을 배웁니다.**

| 단언한다 | 단언하지 않는다 |
|---|---|
| **숫자 앵커가 본문에 존재하는가** | 문장 구조 |
| **금지어가 없는가** | 어투 · 길이 |
| **게이트 결과** | 문단 수 |
| **파일이 생성됐는가** | 표현 선택 |

### 0.4 픽스처가 DB 시드입니다

D14의 `fixtures/*.json`을 그대로 DB에 넣습니다. **E2E용 별도 데이터를 만들지 않습니다.** 두 벌이 되면 어긋납니다.

### 0.5 실패하면 산출물을 남깁니다

E2E 실패는 재현이 어렵습니다. **PPTX·스크린샷·job 레코드·LLM 프롬프트를 아티팩트로 보존**합니다. (§8)

---

## 1. 시나리오 5건

| # | 픽스처 | 포스처 | 기대 결과 | 검증 초점 |
|:-:|---|---|---|---|
| **E1** | `yangpyeong` | income | **발행 차단** | G19 · G21 |
| **E2** | `dangsan` | income | **발행 차단** | C19 · 통합계약 |
| **E3** | `yangpyeong` (정정본) | income | **발행 성공** | 전 경로 · 두 매체 일치 |
| **E4** | `jamwon` | development | **부분 산출** | 용적률 null · A17 |
| **E5** | `hotel` | operating | **GOP 미산출** | 보류 동작 |

### 1.1 차단 2건 · 성공 1건 · 부분 2건

**차단만 테스트하면 아무것도 발행되지 않는 시스템도 통과합니다.** E3이 유일한 전 경로 성공 케이스이므로 가장 중요합니다.

### 1.2 E3 정정본

```ts
const fixed = withOverrides(loadFixture('yangpyeong'), {
  'ledger.statedMonthlyRent': 46_570_000,     // 표지 = 원장
  'ledger.statedDepositKrw':   495_000_000,
  'ledger.statedMgmtFeeKrw':     5_760_000,
  'ledger.asOf':              '2026-02-01',   // 기준일 보강
  'attachedDocs':             [],             // 오첨부 제거
});
```

**원본을 고치지 않고 오버라이드로 만듭니다.** E1이 검증하는 결함이 사라지면 안 됩니다.

---

## 2. 시딩과 격리

### 2.1 스키마 단위 격리

```ts
export async function seedFixture(fx: Fixture): Promise<{ assetId: string; cleanup: () => Promise<void> }> {
  const schema = `e2e_${fx.fixtureId}_${Date.now()}`;
  await db.raw(`CREATE SCHEMA ${schema}`);
  await runMigrations(schema);
  const assetId = await insertAsset(schema, fx.asset);
  await insertLedger(schema, assetId, fx.ledger);
  return { assetId, cleanup: () => db.raw(`DROP SCHEMA ${schema} CASCADE`) };
}
```

**병렬 실행 시 서로의 데이터를 보지 않아야 합니다.** 트랜잭션 롤백은 IM 생성이 자체 커밋을 하므로 쓸 수 없습니다.

### 2.2 정리는 `finally`에서

```ts
test('E1 양평동 — G19·G21로 차단된다', async ({ page }) => {
  const { assetId, cleanup } = await seedFixture(loadFixture('yangpyeong'));
  try {
    ...
  } finally {
    await cleanup();          // ★ 실패해도 반드시 정리
  }
});
```

### 2.3 🔴 운영 DB에 붙지 않게 막습니다

```ts
beforeAll(() => {
  if (!process.env.DATABASE_URL?.includes('e2e')) {
    throw new Error('E2E는 전용 DB에서만 실행합니다');
  }
});
```

**스키마를 CASCADE로 지우는 코드가 있습니다.** 이 가드가 없으면 언젠가 사고가 납니다.

---

## 3. 스텝

### 3.1 E1 — 차단 경로

| # | 스텝 | 단언 |
|:-:|---|---|
| 1 | 픽스처 시딩 | 렌트롤 **12행** 저장 |
| 2 | 입력 폼 열기 | 투자 자세 **기본값 없음** |
| 3 | 수익형 선택 | 월 임대료 칸 **노출** |
| 4 | 매각가 미입력 상태 | **제출 버튼 비활성** (`GT-REQ-01`) |
| 5 | 매각가 250억 입력 | 버튼 활성 |
| 6 | 제출 | job 생성 |
| 7 | 완료 대기 | `outcome = 'intended_block'` |
| 8 | 차단 사유 | **`G19` · `G21` 포함** |
| 9 | 화면 | 정본 질의 문구 노출 |
| 10 | LLM 호출 수 | **0회** (게이트가 앞에서 막음) |

**10번이 중요합니다.** 게이트가 LLM 뒤에 있으면 252회 호출을 낭비합니다.

```ts
expect(await countLLMCalls(jobId)).toBe(0);
```

### 3.2 E3 — 성공 경로

| # | 스텝 | 단언 |
|:-:|---|---|
| 1~6 | E1과 동일 (정정본) | — |
| 7 | 완료 대기 | `outcome = 'completed'` |
| 8 | **소요 시간** | **< 120초** (`PF-LIMIT-01`) |
| 9 | 섹션 수 | **7개** |
| 10 | **숫자 앵커** | §4.2 |
| 11 | **금지어** | 0건 |
| 12 | 모바일 Hero | 4종 · 픽스처와 일치 |
| 13 | PPTX 생성 | 파일 존재 · 12페이지 이상 |
| 14 | **A03 슬라이드** | **12행 전량** · '별첨' 0건 |
| 15 | **A16 좌표** | §5.2 |
| 16 | **두 매체 대조** | Hero ≡ A02 |
| 17 | 계측 | `im_generation_metrics` 7행 |
| 18 | 정리 | 스키마 DROP |

### 3.3 E4 — 부분 산출

| # | 단언 |
|:-:|---|
| 1 | `targetFarByZoning` 조회 실패 목 |
| 2 | **개발 규모 미산출** — `requiredEquity: null` |
| 3 | `Deficiency`에 `targetFarByZoning` 존재 |
| 4 | **사업수지 섹션 숨김 아님** (매도인 명도 · R1) |
| 5 | A17 슬라이드 존재 |
| 6 | 규제 시한 문구에 **종료일·잔여일** 포함 |

### 3.4 E5 — 보류 동작

| # | 단언 |
|:-:|---|
| 1 | `gopMarginPct: null` |
| 2 | `headline.gop === null` |
| 3 | **`gop_price`가 출력에 없음** |
| 4 | `verificationLevel === 'unverified'` |
| 5 | 결손 안내에 "최근 2개년 손익계산서" |

---

## 4. 🔴 LLM 실호출 단언

### 4.1 왜 실호출하는가

목으로는 **프롬프트가 실제로 앵커를 전달하는지** 확인할 수 없습니다. 이번 진단의 AI 생성 오류 6건이 전부 프롬프트 문제였습니다.

| AI가 만들어낸 것 | 근거 |
|---|---|
| "급행 정차" | 없음 |
| "여의도 5분" | 없음 |
| "우량 임차인" | 없음 |
| **"권리 제한 없음"** | **없음 — 가장 위험** |
| "3개 업종 분산" | 없음 |
| "도로망 우수" | 없음 |

### 4.2 숫자 앵커 — 존재를 확인합니다

```ts
const anchors = [
  '250억',           // 매매가
  '4,657',           // 월 임대료(만원)
  '263.75',          // 총취득원가(억)
  '2.24',            // gross_price
];
for (const a of anchors) {
  expect(bodyText).toContain(a);
}
```

**본문에 없으면 LLM이 앵커를 무시한 것입니다.**

### 4.3 금지어 — 부재를 확인합니다

```ts
const BANNED = [...BANNED_ABSOLUTE, ...BANNED_AD];
for (const w of BANNED) {
  expect(bodyText).not.toContain(w);
}
// 근거 없는 단정
expect(bodyText).not.toMatch(/권리\s?제한\s?(이)?\s?없/);
expect(bodyText).not.toMatch(/급행|초역세권/);
```

### 4.4 수치 창작 탐지

```ts
// 본문의 모든 숫자가 앵커 집합에서 유래했는가
const nums = extractNumbers(bodyText);
const unknown = nums.filter(n => !ANCHOR_SET.has(n) && !isOrdinal(n));
expect(unknown, `창작 의심 수치: ${unknown.join(', ')}`).toHaveLength(0);
```

> **이 단언 하나가 AI 환각의 대부분을 잡습니다.** "여의도 5분"의 5, "3개 업종"의 3이 여기서 걸립니다.

### 4.5 재시도 정책

| 상황 | 처리 |
|---|---|
| LLM API 5xx | **1회 재시도** |
| 타임아웃 | 1회 재시도 |
| **앵커 누락** | **재시도 안 함 — 실패** |
| **금지어 검출** | **재시도 안 함 — 실패** |

**품질 실패를 재시도로 덮지 않습니다.** 인프라 실패만 재시도합니다.

### 4.6 예산 상한

```ts
expect(await totalCostUsd(jobId)).toBeLessThan(0.50);
```

**비용이 갑자기 늘면 프롬프트가 비대해진 것입니다.**

---

## 5. 산출물 검증

### 5.1 PPTX를 실제로 엽니다

```bash
python3 scripts/verify_pptx.py out.pptx \
  --min-caption-pt 9 \
  --max-right 12.713 \
  --max-body-y 6.75 \
  --forbid "별첨 참조"
```

### 5.2 좌표 실측

| 검사 | 기대 |
|---|--:|
| 모든 도형 `x + w` | ≤ **12.713** |
| 본문 도형 `y + h` | ≤ **6.75** |
| 캡션 폰트 | ≥ **9pt** |
| A16 우측 표 끝 | 12.710 |
| A17 우측 카드 끝 | **12.713** |

```python
for shape in slide.shapes:
    right = shape.left.inches + shape.width.inches
    assert right <= 12.713 + 1e-6, f'{slide_no} {shape.name} 우측 이탈 {right:.3f}'
```

**계산이 맞아도 렌더가 다를 수 있어 실물을 봅니다.**

### 5.3 렌트롤 전량

```python
rows = count_table_rows(pptx, archetype='A03')
assert rows == 12, f'렌트롤 {rows}행 — 12행이어야 함'
assert '별첨' not in all_text(pptx)
```

### 5.4 두 매체 대조

```ts
const mobile = await page.evaluate(() => window.__IM_HERO__);
const pptx   = extractA02Stats(pptxPath);
expect(mobile.map(h => h.value)).toEqual(pptx.map(s => s.value));
```

**같은 물건의 두 매체가 다른 숫자를 보이면 신뢰를 잃습니다.**

### 5.5 골든 PPTX 육안 확인은 자동화하지 않습니다

| 자동 | **수동** |
|---|---|
| 좌표 · 폰트 · 행수 · 문자열 | **시각적 균형 · 겹침 · 잘림** |

**단계 6 배포 전 A16 1장을 사람이 봅니다.** 이 절차를 생략하지 않습니다.

---

## 6. 스냅샷 정책

### 6.1 무엇을 스냅샷으로 두는가

| 대상 | 스냅샷 |
|---|:-:|
| **렌더 구조** (섹션 순서 · 슬라이드 구성) | **○** |
| 숫자 | ✗ — 명시적 단언 |
| **LLM 문장** | **✗** |
| 게이트 결과 | ✗ — 명시적 단언 |

### 6.2 갱신 규칙

```
스냅샷 갱신 PR에는 "무엇이 왜 바뀌었는지"를 본문에 적습니다.
적지 못하면 그것은 회귀입니다.
```

| 허용 | **금지** |
|---|---|
| 의도한 레이아웃 변경 | **빨간불을 없애려는 일괄 갱신** |
| 아키타입 추가 | `-u` 습관적 사용 |

**`npm run test -- -u`를 CI에서 실행할 수 없게 막습니다.**

---

## 7. 성능

### 7.1 측정

```ts
test('PF-LIMIT-01 p95가 120초 미만', async () => {
  const runs = await Promise.all(Array.from({ length: 20 }, () => generateAndTime()));
  const p95 = percentile(runs, 0.95);
  expect(p95).toBeLessThan(120_000);
});
```

| 지표 | 현행 | 목표 |
|---|--:|--:|
| 평균 | 104.3초 | **≤ 70초** |
| p95 | **148.9초** | ≤ 95초 |
| **한계** | — | **< 120초** |

### 7.2 병렬화 안전성

```ts
test('PF-PAR-03 1단 병렬 섹션에 앞 섹션 마크다운이 전달되지 않는다', async () => {
  const calls = await captureLLMCalls(jobId);
  for (const c of calls.filter(x => x.parallelGroup === 1)) {
    expect(c.prompt).not.toContain('## ');
  }
});
```

### 7.3 구간 합 정합

```ts
const stages = await stageTimings(jobId);
expect(sum(stages)).toBeCloseTo(job.durationMs, -3);      // ±5%
```

**`queue_wait`을 포함해야 맞습니다.** 4구간만 더하면 1.1초가 비는 것이 확인돼 있습니다.

---

## 8. 실패 진단

### 8.1 아티팩트

| 파일 | 내용 |
|---|---|
| `artifacts/<test>/out.pptx` | 생성된 PPTX |
| `artifacts/<test>/screenshot.png` | 모바일 화면 |
| `artifacts/<test>/job.json` | job 레코드 전문 |
| **`artifacts/<test>/prompts.jsonl`** | **섹션별 프롬프트·응답** |
| `artifacts/<test>/metrics.json` | 구간 타이밍 |

**프롬프트를 남기지 않으면 LLM 실패를 재현할 수 없습니다.**

### 8.2 판정 순서

```
1. outcome 확인   → system_error 인가?
2. 아니면          → 게이트가 막은 것 (정상)
3. system_error면  → error_name 확인
4. UpstreamError면 → source (llm | public_api | db)
5. 앵커 누락이면    → prompts.jsonl 열기
```

**`outcome`이 `system_error`가 아니면 시스템 문제가 아닙니다.** 입력 누락과 의도된 차단을 장애로 처리하면 대응이 엉뚱해집니다.

### 8.3 아티팩트에서 상호를 지웁니다

```ts
afterEach(async () => {
  await scrubArtifacts(dir, MASK_PATTERNS);      // 상호 · 물건명
});
```

**픽스처는 마스킹돼 있지만 LLM이 생성한 문장에 다시 나타날 수 있습니다.**

---

## 9. CI

### 9.1 배치

| 시점 | 대상 | 실패 시 |
|---|---|---|
| PR | **없음** | — |
| 머지 | **E1 · E3** (2건 · ~4분) | **머지 차단** |
| 야간 | 5건 전량 + 성능 | 알림 |
| 릴리스 전 | 5건 + 육안 확인 | **배포 중단** |

**PR마다 E2E를 돌리지 않습니다.** 12분 + LLM 비용을 매 PR에 쓰면 개발자가 우회로를 만듭니다.

### 9.2 E1·E3만 머지 게이트인 이유

**차단 1건 + 성공 1건이면 전 경로가 한 번씩 밟힙니다.** E4·E5는 포스처별 분기라 야간으로 충분합니다.

### 9.3 간헐 실패 대응

```
같은 테스트가 3회 중 1회 이상 실패  →  즉시 skip 처리 + 이슈 등록
```

**간헐 실패를 방치하면 팀 전체가 빨간불을 무시하게 됩니다.** skip은 부끄러운 것이 아니라 신호를 지키는 것입니다.

---

## 10. 안티패턴 7종

| # | 하지 말 것 | 대신 |
|:-:|---|---|
| 1 | LLM 문장 비교 | **앵커 존재 · 금지어 부재** |
| 2 | `waitForTimeout(5000)` | 조건 대기 |
| 3 | 품질 실패를 재시도 | 인프라 실패만 |
| 4 | E2E로 커버리지 올리기 | 단위로 |
| 5 | 스냅샷 일괄 갱신 | 변경 사유 기재 |
| 6 | 테스트 간 데이터 공유 | 스키마 격리 |
| 7 | 실패 시 아티팩트 미보존 | §8.1 |

### 10.1 2번 — 고정 대기는 반드시 깨집니다

```ts
// ❌ 느린 날 실패, 빠른 날 낭비
await page.waitForTimeout(120_000);

// ✅
await expect.poll(() => jobStatus(jobId), { timeout: 180_000 })
  .toBe('completed');
```

---

## 11. 참고

| 영역 | 문서 |
|---|---|
| **단위 테스트 · 픽스처** | **`UNIT_TEST_GUIDE.md` (D14)** |
| 무엇을 검증할지 | `TEST_PLAN.md` (D9) |
| 게이트 정의 | `API_TYPE_CONTRACT.md` (D3) §4 |
| 좌표 | `PPTX_ARCHETYPE_SPEC.md` (D7) |
| 화면 | `MOBILE_GAP_SPEC.md` (D8) |
| 성능 | `GENERATION_PERF_SPEC.md` (D13) |
| 계측 | `TELEMETRY_SPEC.md` (D6) |
