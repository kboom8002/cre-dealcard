# 발행 후 관리 — 개발 명세

> **F 규칙군(신선도)** · **S 신호군(반응)** · AI 호출 계약 · 재발행 연동의 정본.
> 제품 요구는 `PRD_발행후관리.md`, 규칙 코드 등록은 `CATALOG_RULES.md`가 소유합니다.

| | |
|---|---|
| **온톨로지** | v0.4.0 |
| **신규 코드군** | `F` (10) · `S` (8) |
| **공수** | 40.5 solo-day |
| **최종 수정** | 2026-08-03 |

---

## 0. 설계 원칙

**하나만 기억하면 됩니다 — 판정의 정본은 하나입니다.**

```
발행 시점        C01~C32 · G01~G16 · T-C/T-R  →  결정적 판정 (룰)
발행 이후        F01~F10 · S01~S08            →  결정적 판정 (룰)
                 AI                            →  가설과 제안만 (판정 아님)
```

AI가 룰의 판정을 뒤집을 수 없습니다. AI 출력은 `Hypothesis` 또는 `Suggestion` 타입이며, **`Verdict`가 될 수 없도록 타입 수준에서 막습니다.**

```ts
// packages/postpublish/src/types.ts
export interface Verdict   { source: 'rule'; code: RuleCode; severity: Severity; resolved: boolean }
export interface Hypothesis{ source: 'ai';   signalCode: SignalCode; text: string; evidence: Evidence[] }
export interface Suggestion{ source: 'ai';   target: SlotKey | SectionId; before: string; after: string }

// Verdict는 rule에서만 생성됩니다. AI 응답 파서는 Verdict를 만들 수 없습니다.
export type AIOutput = Hypothesis | Suggestion;   // Verdict 제외
```

---

## 1. 아키텍처

```
┌──────────────┐   일 1회 배치
│  스케줄러     │──────────────┐
└──────────────┘              ▼
                    ┌────────────────────┐
publish_record ────▶│  F 엔진 (신선도)    │──▶ finding (rule)
deal_facts     ────▶│  룰 · 무료 · 결정적 │
                    └────────────────────┘
                              │
track_event    ────▶┌────────────────────┐
                    │  S 엔진 (반응)      │──▶ finding (rule)
                    │  룰 · 무료 · 통계   │
                    └────────────────────┘
                              │
                              ▼
                    ┌────────────────────┐
                    │  알림 · 딜 화면      │
                    └────────────────────┘
                              │  [원인 가설 보기] 클릭 시에만
                              ▼
                    ┌────────────────────┐
                    │  AI 게이트웨이       │──▶ hypothesis / suggestion
                    │  온디맨드 · 유료     │
                    └────────────────────┘
                              │  중개인 채택 시
                              ▼
                    ┌────────────────────┐
                    │  재발행 diff        │──▶ cosmetic / material / critical
                    │  (기존 파이프라인)   │
                    └────────────────────┘
```

**AI는 경로의 곁가지입니다.** 없어도 전체가 동작합니다. P0가 P1에 의존하지 않도록 이렇게 배치했습니다.

---

## 2. F 규칙군 — 신선도

### 2.1 정의

| 코드 | 판정 | 임계 | 심각도 |
|---|---|---|:-:|
| **F01** | 등기부 발급 경과 | > 90일 | 중 |
| **F02** | 임대차 계약 만료 임박 | D-60 이내 | **상** |
| **F03** | 임대차 계약 만료 경과 | 만료일 < 오늘 | **상** |
| **F04** | 공시지가 신규 고시 | 발행 후 새 고시 존재 | 중 |
| **F05** | 건축물대장 변경 | 위반건축물 등재·해제 · 용도변경 | **상** |
| **F06** | 대출 조건 전제 이탈 | 기준금리 ±0.5%p 초과 변동 | 중 |
| **F07** | 비교사례 노후 | 최신 사례 > 180일 | 하 |
| **F08** | 장기 무반응 | 발행 후 30일간 열람 0 | 중 |
| **F09** | 온톨로지 버전 격차 | Pin 버전이 2단계 이상 뒤짐 | 하 |
| **F10** | 갱신요구권 잔여 재계산 | 기산일 기준 잔여 변동 | 중 |

### 2.2 F03·F05가 상인 이유

**계약이 이미 만료된 임차인을 현재 임차인으로 표기한 IM은 사실과 다릅니다.** 매수자가 그 임대료를 전제로 가격을 판단합니다. F02(임박)와 달리 F03(경과)은 이미 틀린 상태입니다.

F05는 위반건축물 등재 시 **매수자 대출이 막힙니다** (C29·G16). 발행 후 등재되면 IM의 대출 시나리오가 통째로 무효입니다.

### 2.3 F10 — 주택은 자동 재계산하지 않습니다

```ts
export const F10: FreshnessRule = {
  code: 'F10',
  requires: ['lease'],
  evaluate(ctx) {
    for (const unit of ctx.current.leaseUnits) {
      // 주택 — 묵시적 갱신은 갱신요구권을 소진하지 않으므로 경과년수로 재계산 불가
      if (unit.legalBasis === 'residential') continue;

      const before = ctx.publish.snapshot.renewalRemaining?.[unit.id];
      const after = Math.max(0, 10 - yearsSince(unit.firstContractDate, ctx.now));
      if (before !== undefined && before !== after) {
        return finding('중', `${unit.label} 갱신요구권 잔여 ${before}년 → ${after}년`);
      }
    }
    return null;
  },
};
```

주택 호실은 **건너뜁니다.** 행사 이력이 확정된 경우에만 `T-R-03`이 판정하며, 신선도 규칙이 대신 추정하지 않습니다.

경과년수로 주택 갱신권을 재계산하면 **매수자에게 유리한 쪽으로 틀립니다.** 알림을 내지 않는 것이 맞습니다.

### 2.4 실행

```ts
export interface FreshnessContext {
  publish: PublishRecord;           // 발행 시점 스냅샷
  current: DealFacts;               // 현재 값 (공부 재조회 포함)
  now: Date;
}

export type FreshnessRule = {
  code: FCode;
  requires: ('registry' | 'ledger' | 'landPrice' | 'lease' | 'market')[];
  evaluate(ctx: FreshnessContext): Finding | null;
};
```

`requires`가 있는 이유는 **공부 재조회 비용 때문**입니다. 등기부 재조회는 유료이므로 F01만 단독으로 매일 돌리지 않고, 경과 90일에 도달한 딜에 한해 재조회합니다.

---

## 3. S 신호군 — 반응

### 3.1 정의

| 코드 | 신호 | 조건 | 최소 표본 |
|---|---|---|:-:|
| **S01** | 특정 섹션 이탈 집중 | 섹션 이탈률 > 조직 평균 + 2σ | 8명 |
| **S02** | 완독률 저조 | `view.completed` 비율 < 30% | 8명 |
| **S03** | 열람 없음 | 발송 대비 열람 < 20% | 5건 발송 |
| **S04** | 의향 이벤트 0 | 열람 10명 이상 · `intent.*` 0건 | 10명 |
| **S05** | 예산 슬라이더 하향 편중 | 조작의 70% 이상이 매각가 미만 | 6명 |
| **S06** | 재열람 집중 | 동일 viewer 3회 이상 열람 | 1명 |
| **S07** | grant 발급 후 미열람 | 발급 7일 경과 · `grant.opened` 없음 | 1건 |
| **S08** | 결과 미기록 | 열람 0 · 30일 경과 | — |

### 3.2 최소 표본이 없으면 신호가 아니라 잡음입니다

열람 3명 중 2명이 3페이지에서 이탈한 것은 **아무 의미가 없습니다.** 그런데 화면에 "이탈률 67%"라고 뜨면 중개인은 의미가 있다고 믿습니다.

```ts
export function emitSignal(s: SignalRule, data: EngagementData): Finding | null {
  if (data.sampleSize < s.minSample) return null;      // 조용히 억제. 표시하지 않음
  return s.evaluate(data);
}
```

**"표본이 부족합니다"라고 표시하지도 않습니다.** 그것도 정보처럼 보이기 때문입니다.

### 3.3 S05가 가장 유용합니다

모바일 IM의 예산 슬라이더는 매수자가 자기 예산을 넣어 보는 도구입니다. 조작의 70% 이상이 매각가 아래라면 — **가격이 시장 기대보다 높다는 신호**입니다.

이것은 열람 수나 이탈률과 달리 **가격에 대한 직접 신호**이고, 다른 어떤 경로로도 얻을 수 없습니다.

### 3.4 S06·S07은 기회 신호입니다

나머지가 문제 신호인 반면, 이 둘은 **행동하라는 신호**입니다.

| 신호 | 제안 행동 |
|---|---|
| S06 재열람 3회 | "관심이 높습니다. 연락해 보시겠어요?" |
| S07 grant 미열람 | "발급 후 열람이 없습니다. 안내 메시지를 보낼까요?" |

문제만 보여주는 화면은 열어 보기 싫어집니다. 기회 신호를 같은 화면에 두는 것이 P0 채택률에 영향을 줍니다.

---

## 4. AI 호출 계약

### 4.1 무엇을 묻고 무엇을 안 묻는가

| 묻는다 | 안 묻는다 |
|---|---|
| S01 이탈 원인 가설 | 수치 재계산 |
| S02 완독 저조 원인 가설 | 법적 판정 |
| 문장 개선안 (사실 불변) | 시세 · 적정가 |
| 섹션 순서 제안 | 매수자 신원 추론 |
| 서사 일관성 지적 | 성사 가능성 예측 |

### 4.2 요청 계약

```ts
export interface HypothesisRequest {
  signal: { code: SignalCode; metric: number; benchmark: number; sampleSize: number };
  section: { id: string; textContent: string; blockTypes: BlockType[]; charCount: number };
  neighbors: { prev?: SectionSummary; next?: SectionSummary };
  // 금지 — 다음은 절대 포함하지 않는다
  //   매수자 식별정보 · 매도인 정보 · 매각가 이외의 금액 · 조직 외 비교 데이터
}

export interface HypothesisResponse {
  hypotheses: Array<{
    text: string;
    evidence: Array<{ kind: 'metric' | 'content'; ref: string }>;   // 최소 1개 필수
    actionable: boolean;
  }>;
}
```

**`evidence`가 비어 있는 가설은 파서가 버립니다.** 근거 없는 그럴듯한 문장이 가장 위험합니다.

### 4.3 시스템 프롬프트 고정 조항

```
너는 IM의 특정 섹션에서 열람 이탈이 높은 원인을 추정한다.

반드시 지킬 것:
1. 제공된 섹션 내용과 지표 안에서만 판단한다.
2. 부동산 시세·가격·수익률에 대해 언급하지 않는다.
3. 법령을 인용하지 않는다.
4. 각 가설에 근거(어느 지표 또는 어느 문장)를 반드시 붙인다.
5. 근거를 댈 수 없으면 그 가설을 내지 않는다.
6. 최대 3개까지만 낸다.
```

3번이 중요합니다. **AI는 상가임대차보호법과 주택임대차보호법을 섞습니다.** 법령 판정은 T-C/T-R 규칙군이 소유하므로 여기서는 원천 차단합니다.

### 4.4 문장 개선 — 사후 검사

```ts
export function validateSuggestion(s: Suggestion, facts: Fact[]): ValidationResult {
  const beforeNums = extractNumbers(s.before);
  const afterNums  = extractNumbers(s.after);
  if (!setEqual(beforeNums, afterNums))
    return { ok: false, reason: '수치 변경 감지' };

  const newProper = extractProperNouns(s.after).filter(n => !facts.some(f => f.contains(n)));
  if (newProper.length > 0)
    return { ok: false, reason: `자료에 없는 고유명사: ${newProper.join(', ')}` };

  const banned = ['예상', '전망', '유망', '기대됩니다'];
  const added = banned.filter(w => s.after.includes(w) && !s.before.includes(w));
  if (added.length > 0)
    return { ok: false, reason: `단정적 표현 추가: ${added.join(', ')}` };

  return { ok: true };
}
```

검사에 걸린 제안은 **중개인에게 보여주지 않고 폐기**합니다. "이 제안은 검증에 실패했습니다"라고 보여주면 중개인이 궁금해서 채택합니다.

### 4.5 호출 상한

```ts
export const AI_QUOTA = {
  perDealPerMonth: 5,          // 딜당 월 5회
  perOrgPerDay: 200,           // 조직당 일 200회
  cooldownAfterCallMs: 60_000, // 같은 딜 연속 호출 방지
};
```

상한 도달 시 **차단이 아니라 대기**입니다. "이번 달 분석 횟수를 다 쓰셨습니다"는 유료 기능처럼 보여 반감을 삽니다. "잠시 후 다시 시도해 주세요"로 처리합니다.

---

## 5. 데이터 모델

```sql
-- 발행 후 발견 사항 (룰 산출)
CREATE TABLE finding (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         uuid NOT NULL REFERENCES deal(id) ON DELETE CASCADE,
  publish_id      uuid NOT NULL REFERENCES publish_record(id) ON DELETE CASCADE,
  code            text NOT NULL,                    -- F01~F10 | S01~S08
  severity        text NOT NULL CHECK (severity IN ('상','중','하')),
  detail          jsonb NOT NULL,
  detected_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolution      text CHECK (resolution IN ('updated','noted','ignored','republished')),
  resolution_note text,
  resolved_by     uuid REFERENCES broker(id),
  UNIQUE (publish_id, code, detected_at)
);

CREATE INDEX ON finding (deal_id) WHERE resolved_at IS NULL;
CREATE INDEX ON finding (detected_at DESC);

-- AI 산출 (가설·제안) — finding과 분리
CREATE TABLE ai_output (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id    uuid NOT NULL REFERENCES finding(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('hypothesis','suggestion')),
  payload       jsonb NOT NULL,
  evidence      jsonb NOT NULL,                     -- 비어 있으면 INSERT 금지
  model         text NOT NULL,
  token_in      int NOT NULL,
  token_out     int NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  adopted       boolean NOT NULL DEFAULT false,
  CONSTRAINT evidence_not_empty CHECK (jsonb_array_length(evidence) > 0)
);

-- 성사 결과
CREATE TABLE deal_outcome (
  deal_id       uuid PRIMARY KEY REFERENCES deal(id) ON DELETE CASCADE,
  result        text NOT NULL CHECK (result IN ('closed','lost','held')),
  closed_price  bigint,
  closed_at     date,
  lost_reason   text,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  recorded_by   uuid NOT NULL REFERENCES broker(id)
);
```

### 5.1 `evidence_not_empty` 제약

**DB 수준에서 막습니다.** 애플리케이션 검증만 두면 언젠가 우회 경로가 생깁니다. 근거 없는 AI 출력이 저장되는 것을 구조적으로 불가능하게 만듭니다.

### 5.2 RLS

```sql
ALTER TABLE finding     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_output   ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_outcome ENABLE ROW LEVEL SECURITY;

CREATE POLICY finding_own ON finding
  USING (deal_id IN (SELECT id FROM deal WHERE broker_id = auth.uid()));

-- 조직 관리자는 미해소 건의 존재와 심각도만 봅니다. detail은 못 봅니다.
CREATE POLICY finding_org_summary ON finding FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM broker b WHERE b.id = auth.uid() AND b.role = 'org_admin'
            AND b.org_id = (SELECT org_id FROM deal WHERE id = finding.deal_id))
  );
```

> 조직 관리자에게 `detail`까지 열면 물건 정보가 조직 내에 퍼집니다. **집계와 상세는 권한이 다릅니다.** 뷰로 컬럼을 제한하십시오 (PRD §10 열린 질문 3번 결정 후 확정).

---

## 6. 스케줄러

```ts
// apps/worker/src/postpublish.ts
export const schedule = {
  freshness: { cron: '0 5 * * *', batch: 500 },     // 매일 05:00 KST
  signal:    { cron: '0 6 * * *', batch: 500 },     // 매일 06:00
  outcome:   { cron: '0 9 * * 1', batch: 200 },     // 매주 월 09:00 — 결과 질문
};
```

### 6.1 왜 새벽인가

중개인이 아침에 앱을 열었을 때 **이미 계산이 끝나 있어야** 합니다. 화면 진입 시 계산하면 로딩이 걸리고, 그러면 안 열어 봅니다.

### 6.2 공부 재조회 최적화

```ts
// F01(등기부)은 경과 90일 도달 딜에만 재조회
export async function selectF01Targets(db: Db) {
  return db.query(`
  SELECT deal_id FROM publish_record
  WHERE status = 'active'
    AND (snapshot->>'registryIssuedAt')::date < now() - interval '90 days'
    AND NOT EXISTS (
      SELECT 1 FROM finding f
      WHERE f.publish_id = publish_record.id AND f.code = 'F01' AND f.resolved_at IS NULL
    )
    LIMIT 500
  `);
}
```

**이미 미해소 F01이 있으면 다시 조회하지 않습니다.** 같은 경고를 매일 새로 만들면 알림 피로가 즉시 발생합니다.

### 6.3 알림 상한

```ts
export function selectNotifiable(findings: Finding[]): Finding[] {
  return findings
    .filter(f => !f.resolvedAt)
    .sort(bySeverityThenRecency)
    .slice(0, 3);                    // PRD §7.1 — 딜당 3건
}
```

---

## 7. 재발행 연동

기존 diff 파이프라인을 그대로 씁니다. **새로 만들지 않습니다.**

```
finding 해소 → 슬롯 값 변경 → 기존 diff 엔진 → impact 판정 → 재발행
```

| finding | 전형적 impact | 비고 |
|---|---|---|
| F01 등기부 (변경 없음) | `cosmetic` | 발급일만 갱신 |
| F01 등기부 (권리 변동) | **`critical`** | grant 자동 무효화 |
| F02·F03 계약 만료 | `material` | 변경 요약 표시 |
| F04 공시지가 | `cosmetic` | |
| F05 위반건축물 등재 | **`critical`** | 대출 시나리오 무효 |
| S01 이탈 → 문장 수정 | `cosmetic` | 수치 불변이 검증됨 (§4.4) |

### 7.1 발행물 불변

**기존 발행물은 절대 수정하지 않습니다.** 재발행은 새 `publish_record`를 만들고, 이전 것은 `superseded`로 표시합니다.

```sql
UPDATE publish_record SET status = 'superseded', superseded_by = $new_id WHERE id = $old_id;
```

이전 링크로 접근하면 **"업데이트된 자료가 있습니다"** 안내 후 새 버전으로 이동시킵니다. 404를 내면 매수자를 잃습니다.

---

## 8. 비용·성능 예산

### 8.1 AI 비용

| 항목 | 값 |
|---|---:|
| 요청당 입력 토큰 | ~2,000 |
| 요청당 출력 토큰 | ~600 |
| 딜당 월 호출 상한 | 5 |
| 신호 발생 딜 비율 (추정) | 40% |
| 가설 조회율 (추정) | 30% |

```
활성 딜 1,000건 기준
  신호 발생        1,000 × 0.40 = 400건
  AI 호출          400 × 0.30 × 평균 1.5회 = 180 호출/월
  토큰             180 × 2,600 = 468,000 토큰/월
```

**호출 상한(딜당 5회)은 실효 상한이 아니라 안전장치입니다.** 예상 호출 180회는 이론적 상한(1,000딜 × 5회 = 5,000회)의 **3.6%** 입니다. 추정이 크게 빗나가도 상한이 비용을 막습니다.

> 위 추정치 3개(신호 발생률 40% · 조회율 30% · 평균 1.5회)는 **선례가 없는 값**입니다. 1차 출시 후 실측하여 재설정하며, 그 전까지 상한을 완화하지 않습니다.

### 8.2 성능

| 작업 | 예산 |
|---|---:|
| F 엔진 1딜 (공부 재조회 없음) | 50 ms |
| F 엔진 1딜 (등기부 재조회 포함) | 3 s |
| S 엔진 1딜 | 200 ms |
| 일 배치 500딜 | 15 분 |
| AI 가설 응답 | 8 s (스트리밍 없음) |
| **딜 화면 진입 → finding 표시** | **300 ms** (사전 계산됨) |

---

## 9. 공수

| # | 항목 | 공수 | 단계 |
|---:|---|---:|:-:|
| 1 | F 규칙군 엔진 + 10종 구현 | 5.0 | 1차 |
| 2 | 공부 재조회 최적화·캐싱 | 2.5 | 1차 |
| 3 | finding 데이터 모델 · RLS | 2.0 | 1차 |
| 4 | 스케줄러 · 배치 | 2.0 | 1차 |
| 5 | 딜 화면 알림 UI · 해소 처리 | 4.0 | 1차 |
| 6 | 재발행 연동 | 2.0 | 1차 |
| 7 | 성사 기록 유도 UI | 1.0 | 1차 |
| 8 | S 신호군 엔진 + 8종 | 4.5 | 2차 |
| 9 | AI 게이트웨이 · 계약 · 상한 | 3.5 | 2차 |
| 10 | 제안 사후 검사 (§4.4) | 2.0 | 2차 |
| 11 | 가설·제안 UI · 채택 흐름 | 4.0 | 2차 |
| 12 | 조직 벤치마크 | 3.0 | 3차 |
| 13 | 신선도 자동 갱신 (P2-1) | 3.0 | 3차 |
| 14 | 검증 · 시나리오 테스트 | 2.0 | 3차 |
| | **합계** | **40.5** | |

| 단계 | 공수 |
|---|---:|
| 1차 (P0) | **18.5** |
| 2차 (P1) | **14.0** |
| 3차 | **8.0** |

---

## 10. 코드군 충돌 검사

| 코드군 | 소유 | 신규 |
|---|---|:-:|
| R · T-C · T-R · P · C · G · L · M | 기존 | |
| **F** Freshness | 발행 후 신선도 | 🆕 |
| **S** Signal | 발행 후 반응 | 🆕 |

`F`·`S`는 기존 8개 군과 충돌하지 않습니다. `CATALOG_RULES.md` §7 등록 절차에 따라 카탈로그에 먼저 등록한 뒤 구현합니다.

> **`S`를 `E`(Engagement)로 하지 않은 이유** — 향후 `E`를 예외(Exception) 계열에 쓸 여지를 남겨 둡니다. 한 글자 코드는 희소 자원입니다.

---

## 11. 검증 시나리오

| # | 시나리오 | 기대 |
|---:|---|---|
| 1 | 등기부 발급 91일 경과 | F01 발생 · 심각도 중 |
| 2 | 동일 딜 익일 재실행 | F01 **중복 생성 안 됨** |
| 3 | 임대차 만료 D-59 | F02 발생 · 심각도 상 |
| 4 | 주택 임차인 · 갱신 이력 미확인 | **F10 발생 안 함** |
| 5 | 상가 임차인 · 경과 1년 | F10 발생 · 잔여 감소 표시 |
| 6 | 위반건축물 신규 등재 | F05 발생 · 재발행 시 `critical` |
| 7 | 열람 5명 · 이탈률 80% | **S01 억제** (최소 표본 8 미달) |
| 8 | 열람 12명 · 이탈률 79% (평균 24%) | S01 발생 |
| 9 | finding 5건 발생 | **알림 3건만** · 심각도순 |
| 10 | AI 가설에 evidence 없음 | 파서 폐기 · DB INSERT 실패 |
| 11 | AI 제안이 수치 변경 | 사후 검사 차단 · 미표시 |
| 12 | AI 제안이 "기대됩니다" 추가 | 사후 검사 차단 |
| 13 | 딜당 월 6번째 AI 호출 | 대기 안내 (차단 문구 아님) |
| 14 | AI 요청에 매수자 식별정보 포함 시도 | 요청 빌더가 차단 |
| 15 | 이전 발행 링크 접근 | 안내 후 새 버전 이동 (404 아님) |
| 16 | 조직 관리자가 소속 딜 조회 | 심각도만 · `detail` 미노출 |
| 17 | 성사 기록 후 | 딜 상태 종료 · finding 생성 중단 |
| 18 | 열람 0 · 30일 | S08 → 결과 질문 표시 |

---

## 12. 참고

- 제품 요구 — `PRD_발행후관리.md`
- 규칙 코드 등록 절차 — `CATALOG_RULES.md` §7
- 추적 이벤트 — `DISTRIBUTION_AND_IDENTITY.md` §4
- RLS 패턴 — 동 §8
- 재발행 diff — `IM_DATA_PIPELINE.md` §6
- AI 경계 근거 — `IM_QUALITY_TRAINING_PLAN.md` §2
- 임대차 판정 — `CATALOG_RULES.md` §2.1
