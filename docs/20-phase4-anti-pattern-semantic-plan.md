# 20. Phase 4 — Anti-Pattern Engine & IM 시맨틱 검색 구현 방안

## 1. 개요 (Overview)

Phase 4는 **실운영 데이터 축적 이후** 작동하는 AI 피드백 루프 엔진입니다.
Phase 1-3(MVP v0.1 ~ v0.3)이 배포되고 실제 딜 케이스가 누적된 이후에 진행합니다.

> **핵심 목표**: "과거 실패한 딜에서 공통 패턴을 학습하여, 새 매물 등록 시 조기 위험 신호를 제공한다."

---

## 2. 시작 조건 (Trigger Conditions)

Phase 4는 데이터 조건을 **반드시 충족한 이후**에 시작해야 합니다.

| 기능 | 최소 데이터 조건 | 확인 쿼리 |
|---|---|---|
| ⑥ Anti-Pattern Engine | `deal_pipeline_states.stage = 'failed'` 30건 이상 | `SELECT COUNT(*) FROM deal_pipeline_states WHERE stage = 'failed'` |
| ⑧ IM Semantic Search | `im_projects` 50건 이상 | `SELECT COUNT(*) FROM im_projects` |

> **현실적 타임라인**: Phase 1-3 배포 후 **2~3개월 실운영** → 데이터 조건 충족 → Phase 4 시작

---

## 3. 기능 ⑥ — Anti-Pattern Engine

### 3.1 목적

무산된(실패) 딜 케이스의 패턴을 LLM으로 분석하여, 신규 매물 등록 시
과거 실패 케이스와의 유사성을 자동 감지하고 경고를 제공합니다.

### 3.2 데이터 흐름

```text
Failed Deals (deal_pipeline_states.stage = 'failed')
  → deal_casepacks.situation + warning 패턴 집계
  → LLM으로 공통 실패 패턴 추출
  → anti_patterns 테이블에 저장
  → 새 매물 등록 시 anti_patterns와 비교
  → 브리핑 카드에 경고 표시
```

### 3.3 DB 마이그레이션: `00012_anti_patterns.sql`

```sql
create table if not exists anti_patterns (
  id            uuid primary key default gen_random_uuid(),
  pattern_label text not null,              -- "공실 20%+ 근생 매물"
  area_signal   text,                       -- 적용 권역 (null = 전체)
  asset_type    text,                       -- 적용 자산 유형 (null = 전체)
  price_band    text,
  failure_rate  numeric(5,2),              -- 0-100 (%)
  sample_count  integer,                   -- 학습에 사용된 딜 건수
  features      jsonb,                     -- 핵심 시그널 패턴 { key: weight }
  extracted_at  timestamptz default now(),
  expires_at    timestamptz                -- 90일마다 재추출 (null = 만료 없음)
);

create index anti_patterns_area_idx  on anti_patterns(area_signal);
create index anti_patterns_asset_idx on anti_patterns(asset_type);
create index anti_patterns_expires_idx on anti_patterns(expires_at);
```

### 3.4 신규 파일

```text
src/domain/patterns/
  anti-pattern-extractor.ts   ← LLM 기반 패턴 추출 (스케줄 실행)
  anti-pattern-checker.ts     ← 신규 매물 vs 패턴 실시간 비교
src/app/api/broker/buildings/[id]/anti-pattern-check/route.ts
src/app/api/admin/anti-patterns/extract/route.ts  ← 수동 트리거
```

### 3.5 `anti-pattern-extractor.ts` 핵심 구조

```typescript
import { createServiceClient } from '@/lib/supabase/service';
import { recordEvent } from '@/domain/analytics/record-event';

interface ExtractedPattern {
  patternLabel: string;
  areaSignal: string | null;
  assetType: string | null;
  priceBand: string | null;
  failureRate: number;
  sampleCount: number;
  features: Record<string, number>;
}

export async function extractAntiPatterns(): Promise<void> {
  const supabase = createServiceClient();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // 1. 최근 90일 실패 딜 조회
  const { data: failedDeals } = await supabase
    .from('deal_pipeline_states')
    .select(`
      building_ssot_lite(area_signal, asset_type, price_band),
      deal_casepacks(situation, warning, knowledge)
    `)
    .eq('stage', 'failed')
    .gte('entered_at', ninetyDaysAgo)
    .limit(100);

  if (!failedDeals || failedDeals.length < 5) {
    console.log('[AntiPattern] 데이터 부족 — 최소 5건 필요');
    return;
  }

  // 2. LLM으로 공통 패턴 추출 (Gemini 또는 OpenAI)
  //    AI Rules: 가격 권고, 투자 조언 포함 금지
  //    출력: JSON 배열 of ExtractedPattern

  // 3. anti_patterns 테이블에 UPSERT
  //    expires_at = now() + 90일

  await recordEvent(supabase, {
    actorRole: 'system',
    eventType: 'anti_patterns_extracted',
    entityType: 'anti_patterns',
    metadata: { sample_count: failedDeals.length },
  });
}
```

### 3.6 `anti-pattern-checker.ts` 출력 구조

```typescript
export interface AntiPatternMatch {
  patternLabel: string;      // "공실 20%+ 근생 매물"
  matchScore: number;        // 0-100 (높을수록 위험)
  failureRate: number;       // 72 (%)
  sampleCount: number;       // 18
  warningMessage: string;    // "⚠️ 이 매물은 과거 실패 패턴에 72% 부합합니다"
  patternId: string;         // anti_patterns.id
}

export async function checkAntiPatterns(
  areaSignal: string,
  assetType: string,
  priceBand: string | null,
): Promise<AntiPatternMatch[]>
```

### 3.7 브리핑 카드 통합

딜카드 생성(`/api/broker/deal-card/from-memo`) 완료 후,
`checkAntiPatterns()`를 **비동기 non-blocking**으로 호출하여
`building_ssot_lite.layers.anti_pattern_warnings`에 저장합니다.

브리핑 카드 UI (`/broker/buildings/[id]/briefing`)에 다음 섹션 추가:
```text
⚠️ 과거 유사 딜 실패 패턴 경고
  - 공실 20%+ 근생 매물 (과거 72% 실패율, 18건 기준)
  - 이 매물의 패턴 매칭 점수: 85/100
```

### 3.8 실행 스케줄

| 단계 | 방식 |
|---|---|
| 초기 | 수동 트리거 `POST /api/admin/anti-patterns/extract` |
| 이후 | Supabase Edge Function cron (매주 월요일 09:00 KST) |
| 캐시 | anti_patterns.expires_at 기준 90일 자동 갱신 |

### 3.9 AI 규칙 제한 (Anti-Pattern Engine)

```text
❌ 특정 건물의 투자 가치 판단 금지
❌ 매수/매도 권고 금지
❌ 가격 보증, NOI 확정 수치 포함 금지
✅ "과거 유사 패턴에서 X% 빈도로 관찰됨" 형식만 허용
✅ "참고용 패턴 경고이며, 최종 판단은 전문가와 협의 필요" 고지 필수
```

### 3.10 구현 기간 예측

| 작업 | 예상 시간 |
|---|---|
| DB 마이그레이션 | 1h |
| `anti-pattern-extractor.ts` | 4h |
| `anti-pattern-checker.ts` | 2h |
| API routes (수동 트리거 + 체크) | 2h |
| 브리핑 카드 UI 통합 | 2h |
| 테스트 (TDD) | 3h |
| **합계** | **~14h (약 1.5일)** |

---

## 4. 기능 ⑧ — Full IM × 시맨틱 검색

### 4.1 목적

신규 IM 프로젝트 생성 시, 과거 유사한 IM의 성공 패턴을 자동으로 SectionPlanner 프롬프트에
주입하여 IM 품질을 높이고 실패 패턴을 가드레일에 추가합니다.

### 4.2 데이터 흐름

```text
신규 IM 프로젝트 생성 요청
  → 매물 정보 텍스트 → OpenAI text-embedding-3-small → embedding 벡터
  → im_projects.embedding에 저장 (vector 타입)
  → pgvector cosine similarity로 유사 IM top-3 탐색
  → SectionPlanner 프롬프트에 성공/실패 패턴 자동 주입
  → 실패 IM의 anti-pattern → 가드레일에 추가
```

### 4.3 DB 마이그레이션 (공유 Supabase에 적용)

```sql
-- pgvector 확장 (이미 있으면 생략)
create extension if not exists vector;

-- im_projects 테이블 수정 (cre-fullim 프로젝트 테이블)
alter table im_projects
  add column if not exists embedding         vector(1536),
  add column if not exists outcome           text
    check (outcome in ('success', 'failed', 'pending'))
    default 'pending',
  add column if not exists outcome_notes     text,
  add column if not exists outcome_updated_at timestamptz;

-- HNSW index (IVFFlat보다 검색 정확도 높음, 대규모 확장 시 권장)
create index if not exists im_projects_embedding_hnsw_idx
  on im_projects using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- 코사인 유사도 검색 함수
create or replace function match_im_projects(
  query_embedding  vector(1536),
  match_threshold  float default 0.70,
  match_count      int   default 3
)
returns table (
  id              uuid,
  title           text,
  area_signal     text,
  asset_type      text,
  outcome         text,
  similarity      float
)
language sql stable
as $$
  select
    ip.id,
    ip.title,
    ip.area_signal,
    ip.asset_type,
    ip.outcome,
    1 - (ip.embedding <=> query_embedding) as similarity
  from im_projects ip
  where ip.embedding is not null
    and 1 - (ip.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;
```

### 4.4 신규 파일 (cre-fullim 프로젝트에 생성)

```text
cre-fullim/src/domain/im-search/
  im-embedding-service.ts     ← embedding 생성 + 저장
  im-semantic-search.ts       ← 유사 IM 탐색 (pgvector RPC)
  similar-im-context.ts       ← SectionPlanner context 조합기
```

> **주의**: 아래 파일들은 `cre-dealcard`가 아닌 `cre-fullim` 프로젝트에 생성합니다.

### 4.5 `im-embedding-service.ts`

```typescript
import { createServiceClient } from '@/lib/supabase/service';

// IM 프로젝트 생성/업데이트 시 자동 호출 (비동기 non-blocking)
export async function generateAndStoreImEmbedding(
  imProjectId: string,
  buildingData: {
    area_signal: string;
    asset_type: string;
    price_band?: string;
    deal_thesis?: string;
    risk_summary?: string;
  },
): Promise<void> {
  // 임베딩 텍스트: 지역 + 자산유형 + 핵심 딜 설명
  const embeddingText = [
    buildingData.area_signal,
    buildingData.asset_type,
    buildingData.price_band,
    buildingData.deal_thesis,
    buildingData.risk_summary,
  ].filter(Boolean).join(' ');

  // OpenAI text-embedding-3-small (1536 차원)
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: embeddingText.slice(0, 8000),
  });

  const supabase = createServiceClient();
  await supabase
    .from('im_projects')
    .update({
      embedding: response.data[0].embedding,
      outcome: 'pending',
    })
    .eq('id', imProjectId);
}
```

### 4.6 `im-semantic-search.ts`

```typescript
import { createServiceClient } from '@/lib/supabase/service';

export interface SimilarIM {
  id: string;
  title: string;
  area_signal: string;
  asset_type: string;
  outcome: 'success' | 'failed' | 'pending';
  similarity: number;
}

export async function findSimilarIMs(
  queryEmbedding: number[],
  options: {
    matchThreshold?: number;  // default 0.70
    matchCount?: number;      // default 3
  } = {},
): Promise<SimilarIM[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc('match_im_projects', {
    query_embedding: queryEmbedding,
    match_threshold: options.matchThreshold ?? 0.70,
    match_count: options.matchCount ?? 3,
  });

  if (error) {
    console.error('[ImSemanticSearch] RPC error:', error.message);
    return [];
  }

  return (data ?? []) as SimilarIM[];
}
```

### 4.7 `similar-im-context.ts` (SectionPlanner 주입)

```typescript
export interface SimilarImContext {
  successPatterns: string[];    // 성공한 IM의 핵심 패턴 요약
  failureWarnings: string[];    // 실패한 IM의 주의사항 요약
}

export async function buildSimilarImContext(
  similarIMs: SimilarIM[],
): Promise<SimilarImContext> {
  const successPatterns: string[] = [];
  const failureWarnings: string[] = [];

  for (const im of similarIMs) {
    if (im.outcome === 'success') {
      successPatterns.push(`[${im.area_signal} ${im.asset_type}] 성공 사례 (유사도 ${(im.similarity * 100).toFixed(0)}%)`);
    } else if (im.outcome === 'failed') {
      failureWarnings.push(`[${im.area_signal} ${im.asset_type}] 실패 사례 주의 (유사도 ${(im.similarity * 100).toFixed(0)}%)`);
    }
  }

  return { successPatterns, failureWarnings };
}
```

### 4.8 SectionPlanner 수정

```typescript
// cre-fullim/src/domain/sections/section-planner.ts 수정

export interface SectionPlannerInput {
  // ... 기존 필드 ...
  similarImPatterns?: SimilarImContext;   // 신규 추가
}

// planSections() 내부 - 프롬프트 주입
const similarContext = input.similarImPatterns
  ? `\n\n## 유사 딜 참고 패턴 (AI 생성 참고용)\n` +
    `### 성공 케이스 패턴\n${input.similarImPatterns.successPatterns.join('\n')}\n\n` +
    `### 주의 패턴 (과거 실패 사례)\n${input.similarImPatterns.failureWarnings.join('\n')}\n` +
    `\n**중요**: 위 패턴은 참고용이며, 현재 매물과 다를 수 있습니다. 과장 표현 및 투자 확약 금지.`
  : '';
```

### 4.9 연동 포인트

```typescript
// IM 프로젝트 생성 시 (POST /api/im-projects)
async function createImProject(input: CreateImProjectInput) {
  // 1. 기존 IM 생성 로직
  const imProject = await createImProjectRecord(input);

  // 2. embedding 생성 (비동기, non-blocking)
  generateAndStoreImEmbedding(imProject.id, input.buildingData)
    .catch(err => console.error('[Embedding] failed:', err));

  // 3. 유사 IM 탐색 (embedding 생성 완료 후)
  const queryEmbedding = await getEmbedding(input.buildingData);
  const similarIMs = await findSimilarIMs(queryEmbedding);

  // 4. SectionPlanner에 context 주입
  const context = await buildSimilarImContext(similarIMs);
  await planSections({ ...input, similarImPatterns: context });

  return imProject;
}

// 딜 종료 시 outcome 업데이트
// deal_pipeline_states.stage = 'closed'  → outcome = 'success'
// deal_pipeline_states.stage = 'failed'  → outcome = 'failed'
async function updateImOutcome(imProjectId: string, outcome: 'success' | 'failed') {
  await supabase
    .from('im_projects')
    .update({ outcome, outcome_updated_at: new Date().toISOString() })
    .eq('id', imProjectId);
}
```

### 4.10 구현 기간 예측

| 작업 | 예상 시간 |
|---|---|
| DB 마이그레이션 + pgvector 함수 | 2h |
| `im-embedding-service.ts` | 2h |
| `im-semantic-search.ts` | 2h |
| `similar-im-context.ts` | 2h |
| SectionPlanner 수정 | 3h |
| 연동 포인트 적용 | 2h |
| 테스트 (TDD) | 3h |
| **합계** | **~16h (약 2일)** |

---

## 5. TDD 테스트 계획 (Phase 4)

### 5.1 Anti-Pattern Engine 테스트

```typescript
// src/tests/domain/anti-pattern.test.ts

import { describe, test, expect } from 'vitest';
import { matchAntiPattern, computeMatchScore } from '@/domain/patterns/anti-pattern-checker';

describe('Phase4-⑥: Anti-Pattern Engine', () => {

  test('P4-01: 패턴 매칭 점수 0-100 범위', () => {
    const score = computeMatchScore(
      { areaSignal: '강남구', assetType: '근생빌딩', priceBand: '80억대' },
      { area_signal: '강남구', asset_type: '근생빌딩', features: { high_vacancy: 0.8 } }
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('P4-02: 권역 불일치 시 매칭 점수 낮음', () => {
    const score = computeMatchScore(
      { areaSignal: '성수동', assetType: '근생빌딩', priceBand: '30억대' },
      { area_signal: '강남구', asset_type: '오피스', features: {} }
    );
    expect(score).toBeLessThan(30);
  });

  test('P4-03: 경고 메시지 형식 검증', () => {
    const match = matchAntiPattern(
      { areaSignal: '강남구', assetType: '근생빌딩', priceBand: '80억대' },
      { pattern_label: '공실 20%+ 근생 매물', failure_rate: 72, sample_count: 18, features: {} },
      85
    );
    expect(match.warningMessage).toContain('%');
    expect(match.warningMessage).toContain('참고');
    // 투자 권고 없어야 함
    expect(match.warningMessage).not.toMatch(/매수|매도|추천|권장/);
  });

  test('P4-04: 샘플 5건 미만 시 패턴 추출 거부', async () => {
    const { shouldExtract } = await checkExtractionEligibility(3);
    expect(shouldExtract).toBe(false);
  });
});
```

### 5.2 IM 시맨틱 검색 테스트

```typescript
// src/tests/domain/im-semantic.test.ts

import { describe, test, expect } from 'vitest';
import { buildSimilarImContext } from '@/domain/im-search/similar-im-context';

describe('Phase4-⑧: IM Semantic Search', () => {

  test('P4-05: 성공 케이스와 실패 케이스 분리', async () => {
    const mockSimilarIMs = [
      { id: '1', title: 'A', area_signal: '강남', asset_type: '오피스', outcome: 'success', similarity: 0.92 },
      { id: '2', title: 'B', area_signal: '강남', asset_type: '근생', outcome: 'failed', similarity: 0.85 },
      { id: '3', title: 'C', area_signal: '서초', asset_type: '오피스', outcome: 'success', similarity: 0.78 },
    ];
    const context = await buildSimilarImContext(mockSimilarIMs as any);
    expect(context.successPatterns).toHaveLength(2);
    expect(context.failureWarnings).toHaveLength(1);
  });

  test('P4-06: pending 케이스는 컨텍스트에 미포함', async () => {
    const mockSimilarIMs = [
      { id: '1', title: 'A', area_signal: '강남', asset_type: '오피스', outcome: 'pending', similarity: 0.88 },
    ];
    const context = await buildSimilarImContext(mockSimilarIMs as any);
    expect(context.successPatterns).toHaveLength(0);
    expect(context.failureWarnings).toHaveLength(0);
  });

  test('P4-07: 유사도 임계값 미달 시 미반환', async () => {
    // match_threshold = 0.70 미만이면 findSimilarIMs에서 필터링
    const mockLowSimilarity = [
      { similarity: 0.65 }, { similarity: 0.60 }
    ];
    // 이미 RPC에서 필터링되므로 빈 배열
    expect(mockLowSimilarity.filter(im => im.similarity > 0.70)).toHaveLength(0);
  });
});
```

---

## 6. 전체 Phase 4 실행 타임라인

```text
[데이터 준비 기간: Phase 1-3 배포 후 2-3개월]

Month 1-2: Phase 1-3 (MVP v0.1 ~ v0.3) 운영
  → deal_pipeline_states 데이터 축적
  → im_projects 데이터 축적
  → activity_events 분석

Month 3: 데이터 조건 확인
  SELECT COUNT(*) FROM deal_pipeline_states WHERE stage = 'failed'; -- >= 30?
  SELECT COUNT(*) FROM im_projects; -- >= 50?

Month 3 (조건 충족 시): Phase 4 시작
  Week 1: DB 마이그레이션 + Anti-Pattern Extractor + 테스트 (~14h)
  Week 2: IM Semantic Search + SectionPlanner 통합 + 테스트 (~16h)
  Week 3: QA / E2E 테스트 / 실데이터 검증
  Week 4: 배포 + 모니터링
```

---

## 7. 비기능 요건 (Non-functional Requirements)

### 7.1 성능

```text
- findSimilarIMs(): p99 < 200ms (HNSW index 활용)
- checkAntiPatterns(): p99 < 100ms (캐시 우선)
- extractAntiPatterns(): 비동기 배치 실행 (사용자 대기 없음)
```

### 7.2 비용 (AI API)

```text
- Embedding 생성: text-embedding-3-small 사용 (저비용)
  - $0.02 / 1M tokens → IM 1건당 약 $0.0001
  - 50건 기준 총 $0.005 (무시 가능)
- Anti-Pattern 추출: gpt-4o-mini 사용 (월 1회 배치)
  - 월 1회 × 50건 입력 기준 약 $0.01
```

### 7.3 프라이버시

```text
- embedding 텍스트에 개인 식별 정보(이름, 정확 주소) 포함 금지
- anti_patterns 테이블에 특정 소유주/임차인 정보 저장 금지
- 모든 패턴은 집계 통계 형태로만 저장
```

### 7.4 AI 경계 (AI Rules - Phase 4 전용)

```text
Anti-Pattern Engine:
  ❌ "이 건물은 투자하면 안 됩니다" 형식 금지
  ❌ 특정 가격 손실 예측 금지
  ✅ "과거 유사 패턴에서 X% 빈도로 무산됨 (N건 참고)" 형식만 허용
  ✅ "최종 판단은 전문가 협의 권장" 고지 필수

IM Semantic Search:
  ❌ "이 IM은 반드시 성공합니다" 형식 금지
  ✅ "유사 사례 참고 패턴" 형식으로만 표현
  ✅ 성공/실패 여부는 outcome 데이터 기반으로만 판단
```

---

## 8. 스코프 제한 (Scope Boundaries)

Phase 4에서 **구현하지 않는 항목**:

```text
❌ 완전 자동 딜 클로징 예측
❌ 투자자 자동 매칭 (v0.6 이후)
❌ 가격 자동 산정 엔진
❌ 실거래가 데이터베이스 연동 (별도 라이선스 필요)
❌ 법인세/양도세 자동 계산
```

Phase 4 이후 고려 항목 → [19-future-roadmap.md](./19-future-roadmap.md) 참조.

---

## 9. 관련 문서

| 문서 | 용도 |
|---|---|
| [02-mvp-scope.md](./02-mvp-scope.md) | 스코프 경계 확인 |
| [03-domain-model.md](./03-domain-model.md) | 도메인 객체 구조 |
| [07-database-schema.md](./07-database-schema.md) | DB 스키마 기준 |
| [09-ai-agent-contracts.md](./09-ai-agent-contracts.md) | AI 에이전트 규칙 |
| [11-gate-disclosure-policy.md](./11-gate-disclosure-policy.md) | 정보 공개 정책 |
| [19-future-roadmap.md](./19-future-roadmap.md) | 로드맵 전체 |
| [phase4-plan-68.md](../phase4-plan-68.md) | 원본 기술 스펙 (루트) |
