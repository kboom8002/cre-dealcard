-- 20260903000004_evidence_core.sql
-- IM CORE v1: Evidence Layer (Source Artifacts, Observations, Conflicts, Corrections)

CREATE TABLE IF NOT EXISTS source_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL,
  source_type TEXT NOT NULL,        -- 'public_registry' | 'broker_input' | 'seller_notice'
  raw_hash TEXT NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL,
  as_of DATE,
  provider TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_artifact_id UUID NOT NULL REFERENCES source_artifacts(id) ON DELETE CASCADE,
  field_path TEXT NOT NULL,          -- e.g., 'physical.landAreaSqm'
  observed_value JSONB NOT NULL,
  confidence TEXT NOT NULL,          -- 'confirmed' | 'inferred' | 'ambiguous'
  as_of DATE,
  locator JSONB NOT NULL,            -- Locator { sourceArtifactId, fieldPath, position? }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL,
  kind TEXT NOT NULL,                -- 'numeric_threshold' | 'categorical_mismatch'
  left_observation_id UUID NOT NULL REFERENCES observations(id),
  right_observation_id UUID NOT NULL REFERENCES observations(id),
  diff_percent NUMERIC(5, 2),
  resolution JSONB,                  -- null = unresolved
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL,
  original_observation_id UUID NOT NULL REFERENCES observations(id),
  corrected_value JSONB NOT NULL,
  reason TEXT NOT NULL,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_artifacts_deal ON source_artifacts(deal_id);
CREATE INDEX IF NOT EXISTS idx_observations_artifact ON observations(source_artifact_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_deal ON conflicts(deal_id);
CREATE INDEX IF NOT EXISTS idx_corrections_deal ON corrections(deal_id);
