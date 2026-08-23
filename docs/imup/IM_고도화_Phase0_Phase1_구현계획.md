# CREDEAL IM 고도화 - Phase 0 & Phase 1 정밀 구현 계획

이 문서는 Phase 0(응급 조치, 5일)과 Phase 1(계측 기반 구축, 8일)의 정밀 구현 계획입니다.

## Phase 0: 응급 조치 (Day 1-5)

### 0-1. Golden Set 오염 차단 (E4 파이프라인)

#### 현행 코드의 Golden 승격 경로 분석
- **파일 1**: `c:\Users\User\cre-dealcard\src\domain\building\mobile-im\golden-im-manager.ts`
  - 라인: 37~89 (`markAsGoldenIM` 함수)
- **파일 2**: `c:\Users\User\cre-dealcard\src\domain\building\mobile-im\fewshot-tracker.ts`
  - 라인: 149~194 (`promoteToGoldenCandidate` 함수)

#### 수정할 함수명, 현재 동작, 변경 후 동작
- **`markAsGoldenIM` (golden-im-manager.ts:63)** 및 **`promoteToGoldenCandidate` (fewshot-tracker.ts:180)**:
  - **현재 동작**: 생성된 `markdown` 문자열을 정제 없이 `im_golden_sets` 테이블에 그대로 `upsert`/`insert` 합니다.
  - **변경 후 동작**: `stripMarkdown(sanitizePersona(markdown))`을 호출하여 이모지 및 페르소나 관련 문자열(예: '60대 자산가를 위한')을 제거한 후 저장합니다. 정규식 사용 시 `lastIndex = 0`으로 초기화하여 상태 유지 버그를 방지합니다.

#### sanitizePersona/stripMarkdown 현재 구현 분석
- 현재 해당 정제 함수들은 Golden 저장 시점에는 호출되지 않으며, PPTX 렌더링 시점에만 호출됩니다.
- 예: `c:\Users\User\cre-dealcard\src\domain\building\mobile-im\pptx\data-binder.ts:115` (`const cleanMarkdown = sanitizePersona(section.markdown);`)

#### DB 마이그레이션 SQL (im_golden_sets 스키마 변경)
```sql
ALTER TABLE im_golden_sets
  ADD COLUMN IF NOT EXISTS markdown_raw TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS grade VARCHAR(2);

-- 기존 데이터 164건 원본 보존 및 등급 C로 격리
UPDATE im_golden_sets 
SET markdown_raw = markdown 
WHERE markdown_raw IS NULL;

UPDATE im_golden_sets 
SET grade = 'C' 
WHERE source_type = 'auto_approve' OR source_type = 'system_seed';
```

### 0-2. Golden Set 재구축 (E6)

#### 기존 164건 격리 SQL
기존 164건은 합성 데이터이므로 퓨샷 예시로 사용되지 않도록 격리합니다. (위 SQL 참조)

#### G01~G08 적재 절차
`05_data/golden/` 경로의 실데이터 기반 S/A급 8건(G01~G08)을 `im_golden_sets` 테이블에 신규 `insert` 합니다.

#### adjacentBands() 퓨샷 매칭 로직 상세
- `c:\Users\User\cre-dealcard\src\domain\building\mobile-im\golden-im-manager.ts:168-171`의 가격대(price_band) 일치도 계산 로직을 고도화하여, 정확히 일치할 때뿐만 아니라 인접한 밴드(±1단계)일 경우 부분 점수(예: 15점)를 부여하는 `adjacentBands()` 로직을 추가합니다. 

#### 현행 퓨샷 조회 코드 위치와 수정 내용
- **위치**: `c:\Users\User\cre-dealcard\src\domain\building\mobile-im\golden-im-manager.ts:105-112` (`buildIMFewShotBlock` 함수)
- **수정 내용**: 
  기존 `.eq('is_active', true)` 조건에 체인으로 `.in('grade', ['S', 'A'])` 조건을 추가하여 오염된 'C' 등급 데이터가 퓨샷으로 선택되지 않도록 차단합니다.

### 0-3. E0 폼 사전 검증

#### 현행 입력 폼 검증 컴포넌트/로직
- 서버 측 차단은 `c:\Users\User\cre-dealcard\src\app\api\broker\im-lite\generate\handler.ts:143-164`에서 잘 작동 중이나, 프론트엔드에서 버튼을 비활성화하는 로직이 부재합니다.

#### canSubmit 검증 로직 상세 (포스처별 필수 필드 매트릭스)
폼에서 다음 필수 항목이 누락된 경우 제출 버튼을 비활성화(`disabled`)합니다:
- **income**: `askingPriceKrw` (매각 희망가), `monthlyRentTotalKrw` (월 임대료)
- **development**: `address` (주소), `landAreaSqm` (대지 면적)
- **owner_occupied**: `askingPriceKrw`, `leaseAreaSqm`
- **operating**: `askingPriceKrw`, `monthlyRevenueKrw`
- **trading**: `askingPriceKrw`, `manualComps`

#### 서버 게이트 /api/im/validate 구현 상세
- 기존 `handler.ts`의 `hasMinimumBasicData` 함수를 재활용하여 `/api/im/validate` 엔드포인트를 신설하고, 폼 제출 전 예상 생성 가능 여부와 예상 Data Grade를 미리 응답하여 인라인으로 에러 메시지를 표시합니다.

---

## Phase 1: 계측 기반 구축 (Day 6-13)

### 1-1. 텔레메트리 3종 테이블

#### CREATE TABLE SQL 3종
```sql
CREATE TABLE im_generation_metrics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID REFERENCES im_generation_jobs(id) ON DELETE CASCADE,
  section_type      TEXT NOT NULL,
  parallel_group    SMALLINT,
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

CREATE TABLE im_edit_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID REFERENCES im_generation_jobs(id) ON DELETE CASCADE,
  section_type  TEXT NOT NULL,
  before_md     TEXT NOT NULL,
  after_md      TEXT NOT NULL,
  edit_distance INTEGER,
  edited_by     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE im_public_api_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID REFERENCES im_generation_jobs(id) ON DELETE SET NULL,
  provider     TEXT NOT NULL,
  endpoint     TEXT NOT NULL,
  ok           BOOLEAN NOT NULL,
  http_status  INTEGER,
  latency_ms   INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### classifyOutcome() 함수 상세
에러 타입을 `instanceof`로 판별하여 다음 4가지로 분류합니다:
- `completed`: 정상 생성 완료
- `intended_block`: `GateBlockedError` 등 품질 미달로 인한 정상 차단
- `input_missing`: `InputRequiredError` 등 필수값 누락
- `system_error`: 미분류 에러 (외부 API 타임아웃 등)

#### withStage() 래퍼 함수 상세
API 요청, RAG 임베딩, 섹션 LLM 생성, LLM Judge 등 각 파이프라인 스테이지를 감싸 `latency_ms`를 측정하고 DB에 삽입합니다.

#### cost-tracker.ts 현행 분석 및 변경점
- **위치**: `c:\Users\User\cre-dealcard\src\ai\cost-tracker.ts:23-34`
- **현행**: `im_generation_cost_log` 테이블에 `insert`를 시도하나 해당 테이블이 존재하지 않아 조용히 실패 중입니다.
- **변경**: 대상 테이블을 신규 `im_generation_metrics`로 변경하고, 각 섹션 생성 단위 트랜잭션 내에서 올바르게 토큰 및 비용 정보를 기록합니다.

### 1-2. 섹션 병렬화

#### 현행 writer.ts의 for-await 루프 분석
- **위치**: `c:\Users\User\cre-dealcard\src\domain\building\mobile-im\writer.ts:53-70`
- **문제점**: `for (let i = 0; i < ctx.sectionPlan.sections.length; i++) { ... }` 루프를 돌면서 7개 섹션을 순차적으로 LLM에 호출하여 최대 104초 이상 지연을 초래합니다.

#### 의존성 그래프 정의
- **1단계 (병렬 4개)**: `property_overview`, `location_access`, `lease_status`, `next_steps`
- **2단계 (단독)**: `income_analysis` (앞 단계의 면적 및 임대료 수치 의존)
- **3단계 (단독)**: `risk_check`
- **4단계 (단독)**: `investment_thesis`

#### generateSectionsStaged() 함수 설계
기존의 for 루프 대신 `SECTION_STAGES` 배열을 정의하여 단계별로 순회하며, `parallel` 옵션이 `true`일 경우 `Promise.allSettled`로 병렬 호출을 수행합니다.

#### mergeAnchors() 함수 설계
이전 섹션의 `markdown` 전문을 컨텍스트에 넘기는 대신, 각 섹션이 추출한 수치형 앵커(`NumericalAnchors`)만 수집합니다. 충돌 발생 시 최초로 결정된 값을 우선 적용하며 경고 로그를 남깁니다.

#### Promise.allSettled 부분 실패 처리
1단계 병렬 호출 시 일부 섹션 생성이 실패하더라도(`rejected`), 중단하지 않고 실패한 섹션에 한해 Premium Template 렌더링으로 폴백(Fallback) 처리하여 나머지 생성 흐름을 속행합니다.

#### IM_SECTION_CONCURRENCY 환경변수 통합
```typescript
const CONCURRENCY = Number(process.env.IM_SECTION_CONCURRENCY ?? 4);
```
LLM 공급자 Rate Limit을 고려하여 동시성 상한을 제어합니다.

#### 롤백 시나리오
`.env` 파일에 `IM_SECTION_CONCURRENCY=1`로 설정하는 즉시 기존 순차 for 루프와 동일하게 동작하여 문제 발생 시 배포 롤백 없이 설정값 변경만으로 안전하게 되돌립니다.
