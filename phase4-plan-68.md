# Phase 4: ⑥ Anti-Pattern Engine + ⑧ IM 시맨틱 검색 구현 방안

> **선행 조건**: Phase 1-3 완료 후 실제 데이터 축적 필요
> - ⑥: `deal_pipeline_states.stage = 'failed'` 레코드 **30건 이상**
> - ⑧: `im_projects` **50건 이상**

---

## ⑥ Anti-Pattern Engine

### 동작 방식
```
Failed deals (deal_pipeline_states.stage = 'failed')
  → deal_casepacks의 situation + warning 패턴 집계
  → LLM으로 공통 실패 패턴 추출
  → anti_patterns 테이블에 저장
  → 새 매물 등록 시 anti_patterns와 비교 → 경고 표시
```

### DB 마이그레이션 `00009_anti_patterns.sql`
```sql
create table if not exists anti_patterns (
  id            uuid primary key default gen_random_uuid(),
  pattern_label text not null,
  area_signal   text,
  asset_type    text,
  price_band    text,
  failure_rate  numeric(5,2),   -- 0-100
  sample_count  integer,
  features      jsonb,          -- key signal patterns
  extracted_at  timestamptz default now(),
  expires_at    timestamptz     -- 90일마다 재추출
);

create index anti_patterns_area_idx  on anti_patterns(area_signal);
create index anti_patterns_asset_idx on anti_patterns(asset_type);
```

### 신규 파일
```
src/domain/patterns/
  anti-pattern-extractor.ts   ← LLM 기반 패턴 추출
  anti-pattern-checker.ts     ← 새 매물 vs 패턴 비교
src/app/api/broker/buildings/[id]/anti-pattern-check/route.ts
```

### `anti-pattern-extractor.ts` 핵심 구조
```typescript
export async function extractAntiPatterns(): Promise<void> {
  // 1. 최근 90일 실패 딜 조회
  const failedDeals = await supabase
    .from('deal_pipeline_states')
    .select(`
      building_ssot_lite(area_signal, asset_type, price_band),
      deal_casepacks(situation, warning, knowledge)
    `)
    .eq('stage', 'failed')
    .gte('entered_at', ninetyDaysAgo());

  // 2. LLM으로 공통 패턴 추출
  const patterns = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'system',
      content: `실패한 딜 데이터에서 공통 실패 패턴을 추출하세요.
      각 패턴은: label, area_signal, asset_type, 실패율, 특징 필드(features)를 포함.`
    }, {
      role: 'user',
      content: JSON.stringify(failedDeals.data?.slice(0, 50))
    }],
    response_format: { type: 'json_object' }
  });

  // 3. anti_patterns 테이블에 UPSERT
}

export async function checkAntiPatterns(
  areaSignal: string,
  assetType: string,
  priceBand: string | null,
): Promise<AntiPatternMatch[]> {
  // anti_patterns 테이블에서 area + asset 매칭
  // similarity score 계산
  // 위험도 70% 이상이면 경고 반환
}
```

### `anti-pattern-checker.ts` 출력 예시
```typescript
interface AntiPatternMatch {
  patternLabel: string;       // "공실 20%+ 근생 매물"
  matchScore: number;         // 0-100 (높을수록 위험)
  failureRate: number;        // 72 (%)
  sampleCount: number;        // 18
  warningMessage: string;     // "⚠️ 이 매물은 과거 실패 패턴에 72% 부합합니다"
}
```

### 실행 스케줄
- **초기**: 수동 트리거 (API 엔드포인트 호출)
- **이후**: Supabase Edge Function cron (매주 월요일 09:00 KST)
- **연동**: 딜카드 생성 시 `checkAntiPatterns()` 자동 호출 → 브리핑 카드에 표시

### 구현 기간 예측
- DB 마이그레이션: 1시간
- `anti-pattern-extractor.ts`: 4시간
- `anti-pattern-checker.ts`: 2시간
- API route: 1시간
- 브리핑 카드 통합: 2시간
- **합계: 약 1일**

---

## ⑧ Full IM × 시맨틱 검색

### 동작 방식
```
신규 IM 프로젝트 생성 요청
  → cre-fullim: 매물 정보 텍스트 → OpenAI embedding
  → im_projects.embedding 저장 (vector 타입)
  → 유사 IM top-3 탐색 (pgvector cosine similarity)
  → SectionPlanner 프롬프트에 과거 성공 패턴 자동 주입
  → 실패 IM의 anti-pattern은 가드레일에 추가
```

### DB 마이그레이션 (cre-dealcard 공유 Supabase에 적용)
```sql
-- cre-fullim이 사용하는 im_projects 테이블 수정
create extension if not exists vector;

alter table im_projects
  add column if not exists embedding         vector(1536),
  add column if not exists outcome           text    -- 'success'|'failed'|'pending'
    check (outcome in ('success','failed','pending')),
  add column if not exists outcome_notes     text;

-- HNSW index (IVFFlat보다 검색 정확도 높음)
create index if not exists im_projects_embedding_idx
  on im_projects using hnsw (embedding vector_cosine_ops);
```

### 신규 파일 (cre-fullim 프로젝트에 생성)

```
cre-fullim/src/domain/im-search/
  im-embedding-service.ts     ← embedding 생성 + 저장
  im-semantic-search.ts       ← 유사 IM 탐색
  similar-im-context.ts       ← SectionPlanner context 조합
```

### `im-embedding-service.ts`
```typescript
// IM 프로젝트 생성/업데이트 시 자동 호출
export async function generateAndStoreImEmbedding(
  imProjectId: string,
  buildingData: BuildingSSoTFull,
): Promise<void> {
  // 임베딩 텍스트: 지역 + 자산유형 + 주요 재무지표 + 섹션 제목들
  const text = [
    buildingData.area_signal,
    buildingData.asset_type,
    buildingData.price_band,
    buildingData.cap_rate,
    // ... key fields
  ].filter(Boolean).join(' ');

  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  });

  await supabase
    .from('im_projects')
    .update({ embedding: embedding.data[0].embedding })
    .eq('id', imProjectId);
}
```

### `im-semantic-search.ts`
```typescript
export async function findSimilarIMs(
  queryEmbedding: number[],
  limit = 3,
): Promise<SimilarIM[]> {
  // pgvector: 1 - cosine_distance = similarity
  const { data } = await supabase.rpc('match_im_projects', {
    query_embedding: queryEmbedding,
    match_threshold: 0.70,
    match_count: limit,
  });
  return data ?? [];
}

// Supabase function (SQL)
// CREATE OR REPLACE FUNCTION match_im_projects(...)
// RETURNS TABLE AS $$
//   SELECT id, 1 - (embedding <=> query_embedding) as similarity, ...
//   FROM im_projects
//   WHERE 1 - (embedding <=> query_embedding) > match_threshold
//   ORDER BY similarity DESC
//   LIMIT match_count;
// $$
```

### SectionPlanner 수정 (`cre-fullim/src/domain/sections/section-planner.ts`)
```typescript
// planSections() 입력 확장
export interface SectionPlannerInput {
  // ...기존...
  similarImPatterns?: {
    successPatterns: string[];   // 성공한 IM의 핵심 패턴
    failureWarnings: string[];   // 실패한 IM의 주의사항
  };
}

// 프롬프트에 context 주입
const similarContext = input.similarImPatterns
  ? `\n\n## 유사 딜 성공 패턴 (참고)\n${input.similarImPatterns.successPatterns.join('\n')}\n\n## 피해야 할 패턴\n${input.similarImPatterns.failureWarnings.join('\n')}`
  : '';
```

### 연동 포인트
- IM 프로젝트 생성 시 (`POST /api/im-projects`):
  1. 기존 생성 로직 실행
  2. `generateAndStoreImEmbedding()` 비동기 호출 (non-blocking)
  3. `findSimilarIMs()` 로 top-3 탐색
  4. `SectionPlanner`에 context 주입

- IM 프로젝트 완료 시 (`outcome` 업데이트):
  - `deal_pipeline_states.stage = 'closed'` → `outcome = 'success'`
  - `deal_pipeline_states.stage = 'failed'` → `outcome = 'failed'`

### 구현 기간 예측
- DB 마이그레이션 + pgvector function: 2시간
- `im-embedding-service.ts`: 2시간
- `im-semantic-search.ts`: 2시간
- `SectionPlanner` 수정: 3시간
- `similar-im-context.ts` (context 조합): 2시간
- 테스트: 3시간
- **합계: 약 1.5일**

---

## 실행 트리거 (언제 시작할까)

| 아이템 | 시작 조건 | 모니터링 쿼리 |
|---|---|---|
| ⑥ Anti-Pattern | `deal_pipeline_states` WHERE stage='failed' COUNT > 30 | `SELECT COUNT(*) FROM deal_pipeline_states WHERE stage='failed'` |
| ⑧ IM Semantic | `im_projects` COUNT > 50 | `SELECT COUNT(*) FROM im_projects` |

> **현실적 타임라인**: Phase 1-3 배포 후 2-3개월 실운영 → 데이터 조건 충족 → Phase 4 시작
