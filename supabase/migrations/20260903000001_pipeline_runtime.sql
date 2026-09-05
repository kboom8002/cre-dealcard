-- 20260903000001_pipeline_runtime.sql
-- CIM-0201 / PR-M2-01: 파이프라인 런타임 자료모형 (deal_runs, artifact_runs, stage_runs, artifact_envelopes)

-- 1. 거래건 단위 마스터 실행
CREATE TABLE IF NOT EXISTS deal_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('initial', 'correction', 'regeneration')),
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'running', 'waiting_input', 'succeeded', 'failed', 'cancelled', 'quarantined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deal_runs_deal_id ON deal_runs(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_runs_idempotency ON deal_runs(idempotency_key);

-- 2. 산출물 단위 실행 (딜카드 / 모바일 / PPTX)
CREATE TABLE IF NOT EXISTS artifact_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_run_id UUID NOT NULL REFERENCES deal_runs(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('dealcard', 'mobile', 'pptx')),
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'running', 'succeeded', 'failed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_artifact_runs_deal_run ON artifact_runs(deal_run_id);
CREATE INDEX IF NOT EXISTS idx_artifact_runs_type ON artifact_runs(artifact_type);

-- 3. 단계별 실행 기록 (복합 멱등키: artifact_run_id + stage + input_hash + rule_version)
CREATE TABLE IF NOT EXISTS stage_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_run_id UUID NOT NULL REFERENCES artifact_runs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  attempt INT NOT NULL DEFAULT 1,
  input_hash TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  code_version TEXT NOT NULL,
  output_hash TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed', 'retry_scheduled')),
  error_detail JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  CONSTRAINT uq_stage_execution UNIQUE (artifact_run_id, stage, input_hash, rule_version)
);
CREATE INDEX IF NOT EXISTS idx_stage_runs_lookup ON stage_runs(artifact_run_id, stage);

-- 4. 불변 산출물 봉투
CREATE TABLE IF NOT EXISTS artifact_envelopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_run_id UUID NOT NULL REFERENCES stage_runs(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  parent_hash TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_envelopes_content_hash ON artifact_envelopes(content_hash);
