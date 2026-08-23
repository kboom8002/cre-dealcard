# Golden Set 정제 가이드

> **D5** · `IM_SYSTEM_SSOT.md` v1.4 응급 E3·E4 실행 절차
> 164건 중 **154건(93.9%) 오염**. 141건은 자동 정제, 28건은 수동 검토합니다.

| | |
|---|---|
| **문서 ID** | D5 |
| **소유** | 개발팀 + 도메인 |
| **선행 정본** | `IM_SYSTEM_SSOT.md` v1.4 §1.1 · §3 |
| **대상** | 응급 E3 (1.0일) · E4 (0.5일) |
| **부속** | `Golden_페르소나검토.xlsx` |
| **작성일** | 2026-08-23 |

---

> ## ⛔ 범위 축소 (2026-08-23)
>
> **이 문서의 §0 판단이 틀렸습니다.** Golden 164건은 **LLM 합성 데이터**이므로 "사실 오류 0건"은 검증 결과가 아니라 **대조 대상이 없다는 뜻**이었습니다.
>
> | 항목 | 조정 |
> |---|---|
> | **E3 과거 164건 정제** | **선택** — `grade='C'` 격리로 대체 |
> | **E4 저장 전 정제** | **유지** — 신규 오염 차단 |
> | 정규식 `lastIndex` 처리 | 유지 |
> | 공수 | **1.5일 → 0.5일** |
>
> **정본은 `GOLDEN_REBUILD_SPEC.md` (D16)입니다.** 아래 §0 이하는 정제 절차의 기술적 내용으로만 참조하십시오.

---

## 0. 오염의 성격 — 사실 오류가 아닙니다 *(판단 정정됨 · 위 상자 참조)*

**설계 초기에 "401호·갱신요구권 7년 같은 사실 오류가 축적됐을 것"으로 예상했으나 실측 결과 다릅니다.**

| 유형 | 건수 | 비율 | 처리 |
|---|--:|--:|:-:|
| **이모지 잔여** | **128** | 78.0% | **자동** |
| 페르소나 누수 | 28 | 17.1% | 수동 |
| 중복 markdown | 13 | 7.9% | **자동** |
| **가짜 데이터** | **0** | — | — |
| **금지어** | **0** | — | — |

**증식 중인 것은 수치가 아니라 문체와 형식입니다.**

| source_type | 정상 | 오염 | 오염률 |
|---|--:|--:|--:|
| `auto_approve` | 10 | 119 | 92.2% |
| **`system_seed`** | **0** | **35** | **100%** |

> ⚠️ **사람이 시딩한 35건도 전수 오염입니다.** 자동 승격만의 문제가 아닙니다.

---

## 1. 근본 원인 — 저장 경로에 정제가 없습니다

```
생성 → Judge → Golden 저장          ← 정제 없음 · 원본 오염된 채 축적
                    ↓
              buildIMFewShotBlock()
                    ↓
              다음 생성 프롬프트      ← 오염 재생산
```

`sanitizePersona`·`stripMarkdown`은 **`data-binder`(PPTX 렌더 시점)에만** 있습니다.

| 경로 | 정제 |
|---|:-:|
| PPTX 렌더 | ○ |
| **Golden 저장** | **✗** |
| 모바일 렌더 | ✗ |

**PPTX만 깨끗하고 원본과 퓨샷은 오염된 상태**입니다.

---

## 2. E3 · 자동 정제 (141건)

### 2.1 백업 컬럼 추가 — 선행 필수

```sql
ALTER TABLE im_golden_sets
  ADD COLUMN IF NOT EXISTS markdown_raw TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

-- 원본 보존 (롤백 경로)
UPDATE im_golden_sets SET markdown_raw = markdown WHERE markdown_raw IS NULL;
```

**`markdown_raw`를 채우기 전에는 정제를 실행하지 않습니다.**

### 2.2 정제 스크립트

```ts
// scripts/clean-golden-sets.ts
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}]/gu;
const PERSONA = /(\d0대|자산가|법인\s?대표|초보\s?투자자|은퇴자)[^.]{0,20}?(을?\s?위한|맞춤|용)/g;

export interface CleanResult {
  id: string;
  emojiRemoved: number;
  personaHit: boolean;
  changed: boolean;
}

export function cleanMarkdown(md: string): { text: string; emojiRemoved: number } {
  const emojiRemoved = (md.match(EMOJI) ?? []).length;
  const text = md
    .replace(EMOJI, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, emojiRemoved };
}

export async function cleanGoldenSets(db: SupabaseClient): Promise<CleanResult[]> {
  const { data } = await db
    .from('im_golden_sets')
    .select('id, markdown, markdown_raw');
  const out: CleanResult[] = [];

  for (const row of data ?? []) {
    if (!row.markdown_raw) throw new Error(`백업 미완료: ${row.id}`);
    const { text, emojiRemoved } = cleanMarkdown(row.markdown);
    const personaHit = PERSONA.test(text);
    PERSONA.lastIndex = 0;                          // ★ /g 플래그 상태 초기화

    const changed = text !== row.markdown;
    if (changed || personaHit) {
      await db.from('im_golden_sets').update({
        markdown: text,
        is_active: !personaHit,                     // 페르소나는 수동 검토까지 비활성
        review_note: personaHit
          ? '페르소나 수동 검토 필요'
          : `자동 정제 (이모지 ${emojiRemoved})`,
      }).eq('id', row.id);
    }
    out.push({ id: row.id, emojiRemoved, personaHit, changed });
  }
  return out;
}
```

> 🔴 **`PERSONA.lastIndex = 0`을 빠뜨리면 안 됩니다.** `/g` 플래그가 붙은 정규식에 `.test()`를 반복 호출하면 내부 위치가 유지되어 **결과가 번갈아 바뀝니다.** 실무에서 가장 자주 나는 실수입니다.

### 2.3 중복 처리

동일 `markdown`이 2건 이상인 경우입니다.

```sql
-- 중복 식별
SELECT markdown, COUNT(*), array_agg(id) AS ids
FROM im_golden_sets
GROUP BY markdown HAVING COUNT(*) > 1;

-- 최신 1건만 유지
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY markdown ORDER BY created_at DESC) AS rn
  FROM im_golden_sets
)
UPDATE im_golden_sets SET is_active = false, review_note = '중복 — 최신본 유지'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
```

**삭제하지 않고 `is_active = false`로 둡니다.**

### 2.4 검증 쿼리

```sql
-- ① 이모지 잔존 0건이어야 함
SELECT COUNT(*) FROM im_golden_sets
WHERE markdown ~ '[ἰ0-ᾯF☀-➿]';

-- ② 백업 누락 0건
SELECT COUNT(*) FROM im_golden_sets WHERE markdown_raw IS NULL;

-- ③ 처리 현황
SELECT
  CASE WHEN is_active THEN '활성' ELSE '비활성' END AS state,
  COALESCE(review_note, '변경 없음') AS note, COUNT(*)
FROM im_golden_sets GROUP BY 1, 2 ORDER BY 3 DESC;
```

### 2.5 롤백

```sql
UPDATE im_golden_sets
SET markdown = markdown_raw, is_active = true, review_note = NULL;
```

**원본이 보존돼 있으므로 한 줄로 되돌립니다.**

---

## 3. E3 · 수동 검토 (28건)

### 3.1 판정 기준

| 판정 | 조건 | 예 |
|---|---|---|
| **제거** | 연령·계층·경험 수준 **직접 지칭** | "60대 자산가를 위한" · "법인 대표 맞춤" · "초보 투자자용" |
| **유지** | 투자 목적·주체 **유형 서술** | "임대수익형 투자자" · "사옥 수요 법인" |
| 보류 | 판단 애매 | 도메인 담당 확인 |

**구분이 미묘합니다.** "법인 대표 맞춤"은 제거지만 "법인 명의 매입 시"는 유지입니다. **사람을 지칭하면 제거, 거래 구조를 서술하면 유지**로 봅니다.

### 3.2 검토 절차

| # | 단계 |
|:-:|---|
| 1 | 자동 정제 완료 확인 (§2.4 검증 쿼리) |
| 2 | `is_active = false AND review_note LIKE '페르소나%'` 28건 추출 |
| 3 | `Golden_페르소나검토.xlsx`에 기입 |
| 4 | 건당 3분 판정 (승인 / 수정 / 폐기 / 보류) |
| 5 | 판정 결과를 DB에 반영 |

```sql
-- 검토 대상 추출
SELECT id, section_type, source_type, judge_score, LEFT(markdown, 200) AS preview
FROM im_golden_sets
WHERE is_active = false AND review_note LIKE '페르소나%'
ORDER BY section_type;
```

### 3.3 반영

```sql
-- 승인
UPDATE im_golden_sets
SET is_active = true, source_type = 'human_approved',
    reviewed_by = $1, reviewed_at = NOW(), review_note = '검토 승인'
WHERE id = ANY($2);

-- 폐기
UPDATE im_golden_sets
SET is_active = false, reviewed_by = $1, reviewed_at = NOW(), review_note = '페르소나 — 폐기'
WHERE id = ANY($2);
```

---

## 4. 🔴 E4 · 저장 전 정제 — 근본 대책

**E3은 이미 쌓인 것을 치우는 일입니다. E4가 없으면 다시 쌓입니다.**

### 4.1 승격 경로에 정제 삽입

```ts
export async function promoteGolden(
  cand: GoldenCandidate,
  reviewer: string,
): Promise<void> {
  if (!reviewer) throw new Error('Golden 승격에는 사람 승인이 필요합니다');

  const clean = stripMarkdown(sanitizePersona(cand.markdown));
  if (clean !== cand.markdown) {
    logger.warn('[golden] 저장 전 정제 발생', {
      id: cand.id, section: cand.sectionType,
      removed: cand.markdown.length - clean.length,
    });
  }

  const violations = runDeterministicGates(cand.core);
  if (violations.some(v => v.block)) {
    throw new Error(`게이트 미통과 Golden은 승격 불가: ${violations.map(v => v.code).join(',')}`);
  }

  await db.from('im_golden_sets').insert({
    ...cand,
    markdown: clean,
    markdown_raw: cand.markdown,
    source_type: 'human_approved',
    reviewed_by: reviewer,
    is_active: true,
  });
}
```

### 4.2 정제 발생을 로그로 남기는 이유

**정제가 발생했다는 것은 생성 단계에서 이미 오염됐다는 뜻입니다.** 로그가 쌓이면 프롬프트를 고쳐야 할 시점을 알 수 있습니다.

```
[golden] 저장 전 정제 발생  →  누적 추적  →  프롬프트 개선 신호
```

### 4.3 모바일 렌더에도 적용

현재 정제가 PPTX 경로에만 있습니다. **모바일 뷰어도 같은 함수를 통과시킵니다.**

| 경로 | 현행 | 목표 |
|---|:-:|:-:|
| PPTX 렌더 | ○ | ○ |
| Golden 저장 | ✗ | **○** |
| 모바일 렌더 | ✗ | **○** |

---

## 5. 퓨샷 조회 조건

정제 완료 후 퓨샷은 **검증된 것만** 씁니다.

```sql
SELECT markdown FROM im_golden_sets
WHERE section_type = $1 AND asset_type = $2 AND price_band = $3
  AND is_active = true
  AND source_type IN ('human_approved', 'system_seed')
ORDER BY judge_score DESC
LIMIT 3;
```

> ⚠️ **`system_seed` 35건도 전수 오염**이므로, 정제·검토를 거치기 전에는 이 조건에서도 빼야 합니다.
>
> 정제 완료까지는 `source_type = 'human_approved'` 만 허용합니다.

---

## 6. 실행 순서 (1.5일)

| # | 작업 | 공수 | DoD |
|:-:|---|--:|---|
| 1 | 백업 컬럼 추가 · `markdown_raw` 채움 | 0.2 | 누락 0건 |
| 2 | 자동 정제 실행 (141건) | 0.3 | 이모지 잔존 0건 |
| 3 | 중복 비활성화 (13건) | 0.1 | 동일 markdown 활성 1건씩 |
| 4 | 페르소나 28건 수동 검토 | 0.4 | 미검토 0건 |
| 5 | **E4 저장 전 정제 삽입** | 0.5 | 신규 승격 시 정제 로그 확인 |
| | **합계** | **1.5** | |

### 6.1 완료 판정

```sql
SELECT
  COUNT(*) FILTER (WHERE markdown ~ '[ἰ0-ᾯF]')      AS emoji_remain,
  COUNT(*) FILTER (WHERE markdown_raw IS NULL)                AS backup_missing,
  COUNT(*) FILTER (WHERE is_active = false AND reviewed_at IS NULL) AS unreviewed,
  COUNT(*) FILTER (WHERE source_type = 'auto_approve' AND is_active) AS unverified_active
FROM im_golden_sets;
```

**네 값이 모두 0이어야 완료입니다.**

---

## 7. 위험

| 위험 | 대응 |
|---|---|
| 정규식이 정상 문자를 제거 | `markdown_raw` 보존 · 롤백 1줄 |
| `/g` 정규식 `lastIndex` 오류 | `.test()` 후 명시적 초기화 (§2.2) |
| 28건 검토 중 판정 불일치 | 보류 처리 후 도메인 담당 확인 |
| 정제 후 퓨샷 표본 부족 | **표본이 적어도 오염된 것보다 낫습니다** |
| `system_seed` 재오염 | 시딩 경로에도 E4 정제 적용 |

### 7.1 퓨샷 표본 부족은 감수합니다

정제 후 활성 Golden이 크게 줄 수 있습니다. **표본이 적으면 퓨샷 없이 생성**하되, 오염된 예시를 주입하지는 않습니다.

```ts
const examples = await fetchGoldenExamples(...);
if (examples.length === 0) {
  logger.info('[fewshot] 승인된 예시 없음 — 퓨샷 없이 생성');
  return '';                                        // 하드코딩 예시로 대체하지 않음
}
```

---

## 8. 참고

| 영역 | 문서 |
|---|---|
| 사양 정본 | `IM_SYSTEM_SSOT.md` v1.4 §1.1 · §3.0 · §7.1 |
| 계측 | `TELEMETRY_SPEC.md` (D6) |
| 부속 시트 | `Golden_페르소나검토.xlsx` |
