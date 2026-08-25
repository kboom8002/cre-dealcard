# 계측 사양

> **D6** · `IM_SYSTEM_SSOT.md` v1.4 §9 · 단계 1 구현 사양
> 지표 `key`와 구간 이름은 **`API_TYPE_CONTRACT.md` (D3) §7과 동일**해야 합니다.

| | |
|---|---|
| **문서 ID** | D6 |
| **소유** | 개발팀 |
| **선행 정본** | **D3 §7** · `IM_SYSTEM_SSOT.md` v1.4 §9 · `GENERATION_PERF_SPEC.md` (D13) |
| **대상 단계** | 1 (3.0일) |
| **작성일** | 2026-08-23 |

---

## 0. 원칙 3가지

### 0.1 🔴 계측이 "전무"한 것이 아닙니다

SSoT v1.1에서 "계측 전무"라고 쓴 것은 사실과 다릅니다. **뷰어 측은 이미 구현돼 있습니다.**

| 계층 | 상태 | 구현 |
|---|:-:|---|
| **뷰어 — 섹션 노출** | **있음** | Intersection Observer → Progress Dots + View API |
| **뷰어 — 체류 시간** | **있음** | `beforeunload` 총 dwell time |
| LLM 비용 계산 | **코드만 있음** | `cost-tracker.ts` · **대상 테이블 부재로 미작동** |
| **생성 — 그 외 전부** | **없음** | — |

**따라서 D6의 범위는 생성 계층입니다.** 뷰어 계측은 재구축하지 않고 §6에서 결합합니다.

### 0.2 지표는 개선 행동으로 이어져야 합니다

측정만 하고 아무도 안 보는 지표는 만들지 않습니다. 8종 각각에 **"이 값이 나쁘면 무엇을 한다"** 를 명시했습니다.

### 0.3 단일 "성공률"을 쓰지 않습니다

세 종류를 뭉뚱그리면 개선 대상을 잘못 잡습니다. 실제로 v1.3에서 **"실패율 40.9% 최우선"** 이라 판단했다가 v1.4에서 **시스템 오류 0건**임을 확인하고 철회했습니다.

---

## 1. 테이블

### 1.1 `im_generation_metrics` — 섹션 단위

```sql
CREATE TABLE im_generation_metrics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID REFERENCES im_generation_jobs(id) ON DELETE CASCADE,
  section_type      TEXT NOT NULL,
  parallel_group    SMALLINT,                    -- D13 위상 정렬 1~4
  used_fast_mode    BOOLEAN NOT NULL,
  used_fallback     BOOLEAN NOT NULL,
  judge_score       NUMERIC(3,1),
  publish_blocked   BOOLEAN NOT NULL DEFAULT false,
  block_reasons     TEXT[],
  confidence        TEXT,
  latency_ms        INTEGER,
  input_tokens      INTEGER,
  output_tokens     INTEGER,
  cost_usd          NUMERIC(10,6),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_metrics_job     ON im_generation_metrics(job_id);
CREATE INDEX idx_metrics_section ON im_generation_metrics(section_type, created_at DESC);
```

> **🔴 `im_generation_cost_log`가 아니라 이 테이블을 씁니다.** `cost-tracker.ts`의 대상 테이블명을 변경합니다. 코드는 3개월간 정상으로 보였지만 INSERT가 전부 실패하고 있었습니다.

### 1.2 `im_edit_events` — 중개인 수정

```sql
CREATE TABLE im_edit_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID REFERENCES im_generation_jobs(id) ON DELETE CASCADE,
  section_type  TEXT NOT NULL,
  before_md     TEXT NOT NULL,
  after_md      TEXT NOT NULL,
  edit_distance INTEGER,                         -- 저장 시 산출
  edited_by     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**스키마는 이미 있고 INSERT만 없습니다.** 저장 핸들러 한 곳에 삽입하면 됩니다.

### 1.3 `im_public_api_log` — 신규

```sql
CREATE TABLE im_public_api_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID REFERENCES im_generation_jobs(id) ON DELETE SET NULL,
  provider     TEXT NOT NULL,      -- vworld | molit | kakao | juso
  endpoint     TEXT NOT NULL,
  ok           BOOLEAN NOT NULL,
  http_status  INTEGER,
  latency_ms   INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**공공 API 성공률이 결손 기본값 정책을 좌우합니다.** 실패율이 높은 항목은 사용자 입력 칸을 먼저 만들어야 합니다.

### 1.4 `im_generation_jobs` 확장

```sql
ALTER TABLE im_generation_jobs
  ADD COLUMN outcome        TEXT,          -- D3 §7.3 Outcome
  ADD COLUMN error_name     TEXT,          -- InputRequiredError 등
  ADD COLUMN error_field    TEXT,
  ADD COLUMN posture        TEXT,
  ADD COLUMN resolution     TEXT;

CREATE INDEX idx_jobs_outcome ON im_generation_jobs(outcome, created_at DESC);
```

> **🔴 `result->>'error'` 문자열 매칭을 걷어내기 위한 컬럼입니다.** 현행은 `LIKE '%등급 D%'`로 분류하고 있어 **문구를 한 글자만 바꿔도 통계가 전부 어긋납니다.**

---

## 2. 지표 8종

`key`는 **D3 §7.1과 동일**합니다. 이름이 다르면 대시보드가 비어 보입니다.

| # | `key` | 정의 | 나쁘면 무엇을 하는가 |
|:-:|---|---|---|
| 1 | `fast_mode_rate` | FAST_MODE 섹션 / 전체 섹션 | 품질 게이트가 실질 작동하는지 재검토 |
| 2 | `fallback_rate` | 폴백 섹션 / 전체 섹션 | **AI가 실제로 쓰이는지** — 높으면 프롬프트 수정 |
| 3 | **`edit_rate`** | 수정된 섹션 / 생성 섹션 | **해당 섹션 프롬프트 우선 개선** |
| 4 | `judge_score_dist` | Judge 점수 p10/p50/p90 | Golden 승격 기준 재조정 |
| 5 | `publish_blocked_by_reason` | 게이트 코드별 차단 건수 | 게이트 실효성 · 오탐 확인 |
| 6 | `public_api_success_rate` | provider별 성공률 | 결손 기본값·입력 칸 설계 |
| 7 | **`stage_latency_ms`** | 구간별 p50/p95 | **병렬화 효과 측정** |
| 8 | `cost_per_doc` | 문서당 USD | ROI |

### 2.1 🔴 3번이 유일한 품질 대리 지표입니다

Judge 점수는 **AI가 AI를 채점한 값**입니다. 중개인이 실제로 손을 댔는지가 품질에 대한 유일한 외부 신호입니다.

```sql
SELECT
  m.section_type,
  COUNT(DISTINCT m.job_id)                                    AS generated,
  COUNT(DISTINCT e.job_id)                                    AS edited,
  ROUND(100.0 * COUNT(DISTINCT e.job_id)
              / NULLIF(COUNT(DISTINCT m.job_id), 0), 1)       AS edit_rate_pct,
  ROUND(AVG(e.edit_distance))                                 AS avg_distance
FROM im_generation_metrics m
LEFT JOIN im_edit_events e
  ON e.job_id = m.job_id AND e.section_type = m.section_type
WHERE m.created_at > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY edit_rate_pct DESC;
```

**현재 `was_edited`가 Golden 164건 전부 0인 것은 "수정이 없었다"가 아니라 "기록하지 않았다"입니다.** 이 구분을 못 하면 품질이 완벽하다는 잘못된 결론에 도달합니다.

### 2.2 7번 — 병렬화 전후 비교

```sql
SELECT
  DATE_TRUNC('week', created_at)            AS wk,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration_ms) AS p50,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
  COUNT(*)                                  AS n
FROM im_generation_jobs
WHERE outcome = 'completed'
GROUP BY 1 ORDER BY 1;
```

| 시점 | 평균 | p95 | 근거 |
|---|--:|--:|---|
| **현행 (실측 26건)** | **104.3초** | **148.9초** | 30일 통계 |
| 병렬화 후 (D13 목표) | **63.1초** | — | 4단계 위상 정렬 |
| 한계선 | — | **120초** | 불변조건 15 |

**p95가 120초를 넘으면 섹션을 늘리지 않습니다.**

---

## 3. 처리 결과 4분할

### 3.1 분류

```ts
export type Outcome = 'completed' | 'intended_block' | 'input_missing' | 'system_error';

export function classifyOutcome(err: unknown, status: string): Outcome {
  if (status === 'completed') return 'completed';
  if (err instanceof GateBlockedError)  return 'intended_block';
  if (err instanceof InputRequiredError) return 'input_missing';
  return 'system_error';                        // UpstreamError 및 미분류 전부
}
```

**`instanceof`로 분류합니다.** 문자열 매칭은 §1.4 마이그레이션 완료 시점에 제거합니다.

### 3.2 현재값과 목표

| 지표 | 산식 | 현재 (30일 · 44건) | 목표 |
|---|---|--:|--:|
| **시스템 오류율** | `system_error` / 시도 | **0.0%** (0건) | 0% 유지 |
| **입력 누락률** | `input_missing` / 시도 | **36.4%** (16건) | **0%** |
| 의도된 차단율 | `intended_block` / 시도 | 4.5% (2건) | **정상 · 목표 없음** |
| **정상 처리율** | (`completed` + `intended_block`) / 시도 | **63.6%** | 100% |

> **"성공률 59.1%"라는 표현을 쓰지 않습니다.** Grade D 차단 2건은 게이트가 제대로 작동한 결과이지 실패가 아닙니다. (불변조건 21)

### 3.3 과도기 쿼리 — `outcome` 컬럼 채우기 전

```sql
SELECT
  CASE
    WHEN status = 'completed'                     THEN 'completed'
    WHEN result->>'error' LIKE '%등급 D%'          THEN 'intended_block'
    WHEN result->>'error' LIKE '%입력이 필요%'
      OR result->>'error' LIKE '%정보 부족%'        THEN 'input_missing'
    ELSE 'system_error'
  END AS outcome,
  COUNT(*)
FROM im_generation_jobs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY 1;
```

**이 쿼리는 임시입니다.** §1.4 컬럼이 채워지면 폐기합니다.

### 3.4 입력 누락 16건의 내역

| 누락 항목 | 건수 | 대책 |
|---|--:|---|
| **매각 희망가** | 다수 | **응급 E0 — 폼 필수 표시** |
| 월 임대료 (income) | 다수 | 동일 |
| 개발형 정보 부족 | 2 | 포스처 선택 시 필수 칸 동적 노출 |

**LLM 호출 전 0.6초에 막혀 252회 호출을 회피했습니다.** 게이트는 잘 작동했고, 문제는 "왜 필수값 없이 제출 버튼을 누를 수 있었나"입니다.

---

## 4. 구간 계측

### 4.1 구간 이름 — D13 4단계와 일치

```ts
export type Stage =
  | 'external_api' | 'rag' | 'section_llm' | 'judge' | 'postprocess' | 'queue_wait';
```

| 구간 | 현행 실측 | 비중 | 병렬화 후 |
|---|--:|--:|--:|
| `external_api` | 4.0초 | 3.8% | 4.0초 |
| `rag` | 1.5초 | 1.4% | 1.5초 |
| **`section_llm` + `judge`** | **96.2초** | **92.2%** | **54.9초** |
| `postprocess` | 1.5초 | 1.4% | 1.5초 |
| **`queue_wait` (신규)** | **1.1초** | **1.1%** | 1.1초 |
| **계** | **104.3초** | **100.0%** | **63.1초** |

> **🔴 `queue_wait`는 이 문서에서 신설했습니다.** D13 §1.2의 4구간 합은 103.2초로 실측 104.3초와 **1.1초(1.1%) 어긋납니다.** 어느 구간에도 귀속되지 않는 시간이 있다는 뜻이므로, 미분류 구간을 만들어 드러냅니다. 계측 후 실제 귀속처가 밝혀지면 흡수합니다.

**기타 구간 8.1초 · 섹션당 13.7초.** 병렬화 후 = 8.1 + 13.7 × 4단계 = **63.1초 (40% 단축)**.

> `section_llm`과 `judge`를 **분리 기록**합니다. 현행 실측은 합산값만 있어 섹션당 13.7초 중 Judge 비중을 모릅니다. 분리해야 Judge 생략 여부를 판단할 수 있습니다.

### 4.2 기록 방법

```ts
export async function withStage<T>(
  jobId: string, stage: Stage, fn: () => Promise<T>,
  meta?: { sectionType?: SectionType; parallelGroup?: 1|2|3|4 },
): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    void recordStage({ jobId, stage, ms: Date.now() - t0, ...meta });   // 실패해도 삼킴
  }
}
```

**계측 실패가 생성을 막아서는 안 됩니다.** `void` + `finally`로 격리합니다.

---

## 5. 뷰어 계측과 결합

기존 dwell time·섹션 노출 데이터를 **수정률과 교차**하면 판단이 정밀해집니다.

```
수정률 높음  ×  체류 시간 짧음   →   ① 우선 개선 (쓸모없는데 손이 많이 감)
수정률 낮음  ×  체류 시간 김     →   ② 잘 작동 — 유지
수정률 높음  ×  체류 시간 김     →   ③ 중요한데 품질 미달
수정률 낮음  ×  체류 시간 짧음   →   ④ 삭제 후보
```

| 사분면 | 행동 |
|:-:|---|
| ① | **프롬프트 최우선 개선** |
| ② | 변경 금지 |
| ③ | 자료 구조 자체를 재설계 |
| ④ | **섹션 축소 검토** — 생성 시간 회수 |

**④가 발견되면 D13의 시간 예산이 그만큼 늘어납니다.**

---

## 6. 대시보드 5화면

| # | 화면 | 지표 | 주기 |
|:-:|---|---|---|
| 1 | **처리 결과** | 4분할 스택 바 | 일 |
| 2 | **품질** | `edit_rate` 섹션별 · Judge 분포 | 주 |
| 3 | **성능** | `stage_latency_ms` p50/p95 · 120초 한계선 | 일 |
| 4 | 결손 | `publish_blocked_by_reason` · 게이트별 | 주 |
| 5 | 비용 | `cost_per_doc` · 토큰 추이 | 월 |

### 6.1 1번 화면의 표시 규칙

```
█ 완료          ▨ 의도된 차단        ░ 입력 누락        ■ 시스템 오류
   (녹색)          (녹색 — 정상)        (주황 — 개선)      (적색)
```

**의도된 차단을 실패색으로 칠하지 않습니다.** 색이 판단을 만듭니다.

---

## 7. 보존과 개인정보

| 테이블 | 보존 | 마스킹 |
|---|---|---|
| `im_generation_metrics` | 24개월 | 불필요 (수치만) |
| **`im_edit_events`** | **6개월** | **`before_md`·`after_md`에 임차인 상호 포함 가능** |
| `im_public_api_log` | 6개월 | 불필요 |
| `im_generation_jobs` | 24개월 | `error_field`는 필드명만 · **값 저장 금지** |

### 7.1 `im_edit_events` 취급

```ts
// ❌ 금지 — 오류 메시지에 입력값을 담지 않는다
throw new InputRequiredError('tenantBusiness', `임차인 "${name}" 정보 누락`);

// ✅
throw new InputRequiredError('tenantBusiness', '업종/상호 입력이 필요합니다');
```

**임차인명·법인명은 대외 문서뿐 아니라 로그에도 남기지 않습니다.** (불변조건 14 확장)

---

## 8. 롤아웃 순서

| # | 작업 | 공수 | 선행 |
|:-:|---|--:|---|
| 1 | `im_generation_metrics` 생성 + `cost-tracker.ts` 테이블명 수정 | 0.5일 | — |
| 2 | `im_edit_events` INSERT 핸들러 | 0.5일 | — |
| 3 | `im_generation_jobs` 컬럼 5종 추가 + `classifyOutcome` | 0.5일 | D3 §8.3 |
| 4 | `withStage` 삽입 (5구간) | 0.5일 | D13 |
| 5 | `im_public_api_log` | 0.5일 | — |
| 6 | 대시보드 5화면 | 0.5일 | 1~5 |
| | | **3.0일** | |

### 8.1 1번을 먼저 하는 이유

**`cost-tracker.ts`는 이미 짜여 있고 대상만 없습니다.** 테이블 하나 만들고 이름 한 줄 바꾸면 비용 데이터가 즉시 쌓이기 시작합니다. 투입 대비 회수가 가장 빠릅니다.

---

## 9. DoD

| # | 조건 | 확인 |
|:-:|---|---|
| 1 | 지표 8종 `key`가 D3 §7.1과 문자열 일치 | grep 대조 |
| 2 | `outcome` 4분할이 신규 job 100%에 채워짐 | `COUNT(*) WHERE outcome IS NULL = 0` |
| 3 | `im_edit_events`에 실제 INSERT 발생 | 1건 이상 |
| 4 | `cost_per_doc`이 0이 아님 | 비용 데이터 유입 확인 |
| 5 | 구간 5종 합 ≈ `duration_ms` (±5%) | 정합 쿼리 |
| 6 | 계측 실패가 생성을 막지 않음 | 테이블 DROP 상태에서 생성 성공 |
| 7 | 로그에 임차인명·법인명 미포함 | 샘플 100건 검사 |

**6번을 반드시 테스트합니다.** 계측을 넣다가 생성을 망가뜨리는 것이 가장 흔한 사고입니다.

---

## 10. 다음 배치 인계

| 인계 | 받는 곳 |
|---|---|
| `edit_rate` 섹션별 기준선 | **D9** 회귀 기준 |
| 사분면 ④ 섹션 후보 | **D10** 포스처별 구성 |
| `stage_latency_ms` 계측 지점 | **D2** 단계 1.5 DoD |
