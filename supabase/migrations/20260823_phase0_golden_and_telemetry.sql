-- Phase 0 & Phase 1: Golden Set 스키마 확장 + 텔레메트리 테이블 3종
-- 2026-08-23

-- ═══════════════════════════════════════════════════════════════════
-- 1. im_golden_sets 스키마 확장
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE im_golden_sets
  ADD COLUMN IF NOT EXISTS markdown_raw  TEXT,
  ADD COLUMN IF NOT EXISTS grade         VARCHAR(2) DEFAULT 'C',
  ADD COLUMN IF NOT EXISTS reviewed_by   TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note   TEXT;

-- 기존 164건: 원본 보존 + 등급 C 격리 (퓨샷 주입 차단)
UPDATE im_golden_sets
SET markdown_raw = markdown
WHERE markdown_raw IS NULL;

UPDATE im_golden_sets
SET grade = 'C'
WHERE grade IS NULL
   OR grade NOT IN ('S', 'A');

-- grade 인덱스 (퓨샷 조회 성능)
CREATE INDEX IF NOT EXISTS idx_golden_sets_grade
  ON im_golden_sets (grade)
  WHERE is_active = true;

-- ═══════════════════════════════════════════════════════════════════
-- 2. im_generation_metrics (섹션별 생성 계측)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS im_generation_metrics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID REFERENCES im_generation_jobs(id) ON DELETE CASCADE,
  building_id       UUID,
  section_type      TEXT NOT NULL,
  stage_name        TEXT,
  parallel_group    SMALLINT,
  used_fast_mode    BOOLEAN NOT NULL DEFAULT false,
  used_fallback     BOOLEAN NOT NULL DEFAULT false,
  judge_score       NUMERIC(3,1),
  publish_blocked   BOOLEAN NOT NULL DEFAULT false,
  block_reasons     TEXT[],
  confidence        TEXT,
  latency_ms        INTEGER,
  input_tokens      INTEGER,
  output_tokens     INTEGER,
  model_name        TEXT,
  cost_usd          NUMERIC(10,6),
  outcome           TEXT CHECK (outcome IN ('completed', 'intended_block', 'input_missing', 'system_error')),
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gen_metrics_job_id
  ON im_generation_metrics (job_id);
CREATE INDEX IF NOT EXISTS idx_gen_metrics_building_id
  ON im_generation_metrics (building_id);

-- ═══════════════════════════════════════════════════════════════════
-- 3. im_edit_events (브로커 편집 추적)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS im_edit_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID REFERENCES im_generation_jobs(id) ON DELETE CASCADE,
  building_id   UUID,
  section_type  TEXT NOT NULL,
  before_md     TEXT NOT NULL,
  after_md      TEXT NOT NULL,
  edit_distance INTEGER,
  edited_by     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edit_events_job_id
  ON im_edit_events (job_id);

-- ═══════════════════════════════════════════════════════════════════
-- 4. im_public_api_log (외부 공공 API 호출 추적)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS im_public_api_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID REFERENCES im_generation_jobs(id) ON DELETE SET NULL,
  building_id  UUID,
  provider     TEXT NOT NULL,
  endpoint     TEXT NOT NULL,
  ok           BOOLEAN NOT NULL,
  http_status  INTEGER,
  latency_ms   INTEGER,
  error_msg    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_api_log_job_id
  ON im_public_api_log (job_id);
