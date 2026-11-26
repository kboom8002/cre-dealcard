-- =============================================================================
-- Migration: 20261126000002_sota_schema_alignment_and_telemetry.sql
-- Purpose:
--   Wave 1 Track 1A — Schema Alignment, Active Telemetry/Identity/Audit Tables,
--   Missing SSoT/Golden Columns, and Locked-Down Idempotent RPCs:
--   (A) Create missing active telemetry, distribution/identity, scheduling,
--       prediction, market-defaults, morning-intelligence, and IM pipeline
--       runtime/ledger tables with explicit RLS + `service_role` policies.
--   (B) Add missing columns referenced by production code on `im_fewshot_usage_log`,
--       `im_golden_sets`, `im_projects`, `building_ssot_lite`, and `evidence_files`.
--   (C) Define 9 locked-down idempotent RPCs (`SET search_path = public` +
--       `REVOKE ALL ... FROM PUBLIC, anon`) required by active application paths.
--
--   100% idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`) and compliant
--   with `scripts/policy-scan.mjs` (`>= 20261126000001` strict RLS gate).
-- =============================================================================

BEGIN;

-- ── 0. Defensive role check (no-op on Supabase; self-healing on bare PGlite) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

-- =============================================================================
-- (A1) Mobile IM Telemetry Tables (20260823 backport)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.im_generation_metrics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID,
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
CREATE INDEX IF NOT EXISTS idx_gen_metrics_job_id ON public.im_generation_metrics (job_id);
CREATE INDEX IF NOT EXISTS idx_gen_metrics_building_id ON public.im_generation_metrics (building_id);
ALTER TABLE public.im_generation_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.im_generation_metrics FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.im_generation_metrics TO service_role;
DROP POLICY IF EXISTS "im_generation_metrics_service_role_all" ON public.im_generation_metrics;
CREATE POLICY "im_generation_metrics_service_role_all" ON public.im_generation_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.im_edit_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID,
  building_id   UUID,
  section_type  TEXT NOT NULL,
  before_md     TEXT NOT NULL,
  after_md      TEXT NOT NULL,
  edit_distance INTEGER,
  edited_by     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_edit_events_job_id ON public.im_edit_events (job_id);
ALTER TABLE public.im_edit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.im_edit_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.im_edit_events TO service_role;
DROP POLICY IF EXISTS "im_edit_events_service_role_all" ON public.im_edit_events;
CREATE POLICY "im_edit_events_service_role_all" ON public.im_edit_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.im_public_api_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID,
  building_id  UUID,
  provider     TEXT NOT NULL,
  endpoint     TEXT NOT NULL,
  ok           BOOLEAN NOT NULL,
  http_status  INTEGER,
  latency_ms   INTEGER,
  error_msg    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_public_api_log_job_id ON public.im_public_api_log (job_id);
ALTER TABLE public.im_public_api_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.im_public_api_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.im_public_api_log TO service_role;
DROP POLICY IF EXISTS "im_public_api_log_service_role_all" ON public.im_public_api_log;
CREATE POLICY "im_public_api_log_service_role_all" ON public.im_public_api_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- (A2) Distribution & 3-Layer Identity Tables (0301 backport)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.viewer (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ua_class      TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.viewer ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.viewer FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.viewer TO service_role;
DROP POLICY IF EXISTS "viewer_service_role_all" ON public.viewer;
CREATE POLICY "viewer_service_role_all" ON public.viewer
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.buyer_condition (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id     UUID NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('gate_form','grant_form','slider','broker_note')),
  confidence   TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
  budget_band  TEXT,
  regions      TEXT[],
  asset_types  TEXT[],
  purpose      TEXT,
  financing    TEXT,
  observed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_buyer_condition_party ON public.buyer_condition (party_id, observed_at DESC);
ALTER TABLE public.buyer_condition ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.buyer_condition FROM PUBLIC, anon;
GRANT ALL ON TABLE public.buyer_condition TO service_role;
DROP POLICY IF EXISTS "buyer_condition_service_role_all" ON public.buyer_condition;
CREATE POLICY "buyer_condition_service_role_all" ON public.buyer_condition
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.grant_pass (
  token          TEXT PRIMARY KEY,
  tenant_id      UUID NOT NULL,
  deal_id        UUID NOT NULL,
  deal_version   INTEGER NOT NULL DEFAULT 1,
  party_id       UUID NOT NULL,
  issued_by      UUID NOT NULL,
  nda_signed_at  TIMESTAMPTZ NOT NULL,
  watermark_ref  TEXT NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  revoked_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_grant_pass_deal ON public.grant_pass (deal_id);
CREATE INDEX IF NOT EXISTS idx_grant_pass_party ON public.grant_pass (party_id);
ALTER TABLE public.grant_pass ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.grant_pass FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.grant_pass TO service_role;
DROP POLICY IF EXISTS "grant_pass_service_role_all" ON public.grant_pass;
CREATE POLICY "grant_pass_service_role_all" ON public.grant_pass
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.track_event (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    UUID NOT NULL,
  deal_id      UUID NOT NULL,
  kind         TEXT NOT NULL,
  viewer_id    UUID,
  share_token  TEXT,
  grant_token  TEXT,
  party_id     UUID,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_track_event_deal ON public.track_event (deal_id, kind);
CREATE INDEX IF NOT EXISTS idx_track_event_viewer ON public.track_event (viewer_id) WHERE viewer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_track_event_occurred_at ON public.track_event (occurred_at DESC);
ALTER TABLE public.track_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.track_event FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.track_event TO service_role;
DROP POLICY IF EXISTS "track_event_service_role_all" ON public.track_event;
CREATE POLICY "track_event_service_role_all" ON public.track_event
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- (A3) Scheduling Waitlist, Market Defaults, Analytics & Predictions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.waitlist_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id           UUID NOT NULL,
  requester_id      UUID NOT NULL,
  priority          INTEGER NOT NULL DEFAULT 0,
  notification_sent BOOLEAN NOT NULL DEFAULT false,
  status            TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'notified', 'converted', 'expired', 'cancelled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_slot ON public.waitlist_entries (slot_id);
ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.waitlist_entries FROM PUBLIC, anon;
GRANT ALL ON TABLE public.waitlist_entries TO service_role;
DROP POLICY IF EXISTS "waitlist_entries_service_role_all" ON public.waitlist_entries;
CREATE POLICY "waitlist_entries_service_role_all" ON public.waitlist_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.market_defaults (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  active                       BOOLEAN NOT NULL DEFAULT true,
  commercial_mortgage_rate_pct NUMERIC,
  pf_interest_rate_pct         NUMERIC,
  max_ltv_pct                  NUMERIC,
  construction_cost_rc         NUMERIC,
  construction_cost_sc         NUMERIC,
  construction_cost_src        NUMERIC,
  acquisition_tax_rate_pct     NUMERIC,
  brokerage_fee_pct            NUMERIC,
  legal_fees_pct               NUMERIC,
  hotel_adr_manwon             NUMERIC,
  hotel_occ_pct                NUMERIC,
  hotel_gop_margin_pct         NUMERIC,
  cap_rate_benchmarks          JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes                        TEXT,
  source                       TEXT,
  created_by                   UUID,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_market_defaults_active ON public.market_defaults (active, updated_at DESC);
ALTER TABLE public.market_defaults ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.market_defaults FROM PUBLIC, anon;
GRANT ALL ON TABLE public.market_defaults TO service_role;
DROP POLICY IF EXISTS "market_defaults_service_role_all" ON public.market_defaults;
CREATE POLICY "market_defaults_service_role_all" ON public.market_defaults
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.page_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path        TEXT NOT NULL,
  visitor_id  TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  referrer    TEXT,
  building_id UUID,
  owner_id    UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_page_views_path_created ON public.page_views (path, created_at DESC);
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.page_views FROM PUBLIC, anon;
GRANT ALL ON TABLE public.page_views TO service_role;
DROP POLICY IF EXISTS "page_views_service_role_all" ON public.page_views;
CREATE POLICY "page_views_service_role_all" ON public.page_views
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON TABLE public.page_views TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "page_views_owner_select" ON public.page_views';
    EXECUTE 'CREATE POLICY "page_views_owner_select" ON public.page_views FOR SELECT TO authenticated USING (owner_id = auth.uid())';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.building_price_predictions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_ssot_lite_id UUID NOT NULL,
  predicted_low         BIGINT,
  predicted_high        BIGINT,
  confidence_level      NUMERIC(5,4),
  reasoning             TEXT,
  model_version         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_building_price_predictions_bld ON public.building_price_predictions (building_ssot_lite_id, created_at DESC);
ALTER TABLE public.building_price_predictions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.building_price_predictions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.building_price_predictions TO service_role;
DROP POLICY IF EXISTS "building_price_predictions_service_role_all" ON public.building_price_predictions;
CREATE POLICY "building_price_predictions_service_role_all" ON public.building_price_predictions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.deal_conversion_predictions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_ssot_lite_id  UUID NOT NULL,
  conversion_probability NUMERIC(5,4) NOT NULL,
  confidence_level       TEXT,
  key_factors            JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_factors           JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_version          TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deal_conversion_predictions_bld ON public.deal_conversion_predictions (building_ssot_lite_id, created_at DESC);
ALTER TABLE public.deal_conversion_predictions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.deal_conversion_predictions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.deal_conversion_predictions TO service_role;
DROP POLICY IF EXISTS "deal_conversion_predictions_service_role_all" ON public.deal_conversion_predictions;
CREATE POLICY "deal_conversion_predictions_service_role_all" ON public.deal_conversion_predictions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.prediction_model_coefficients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name   TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  coefficient  DOUBLE PRECISION NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (model_name, feature_name)
);
CREATE INDEX IF NOT EXISTS idx_prediction_model_coeffs_name ON public.prediction_model_coefficients (model_name);
ALTER TABLE public.prediction_model_coefficients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.prediction_model_coefficients FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.prediction_model_coefficients TO service_role;
DROP POLICY IF EXISTS "prediction_model_coefficients_service_role_all" ON public.prediction_model_coefficients;
CREATE POLICY "prediction_model_coefficients_service_role_all" ON public.prediction_model_coefficients
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- (A4) Morning Intelligence & Construction Permits Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_custom_intel (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  region      TEXT NOT NULL DEFAULT 'gbd',
  raw_inputs  JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_summary  JSONB,
  status      TEXT NOT NULL DEFAULT 'draft',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_custom_intel_user ON public.user_custom_intel (user_id, created_at DESC);
ALTER TABLE public.user_custom_intel ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_custom_intel FROM PUBLIC, anon;
GRANT ALL ON TABLE public.user_custom_intel TO service_role;
DROP POLICY IF EXISTS "user_custom_intel_service_role_all" ON public.user_custom_intel;
CREATE POLICY "user_custom_intel_service_role_all" ON public.user_custom_intel
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_custom_intel TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "user_custom_intel_owner_all" ON public.user_custom_intel';
    EXECUTE 'CREATE POLICY "user_custom_intel_owner_all" ON public.user_custom_intel FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_combined_briefing (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL,
  region               TEXT NOT NULL DEFAULT 'gbd',
  hq_items             JSONB NOT NULL DEFAULT '{}'::jsonb,
  my_items             JSONB NOT NULL DEFAULT '[]'::jsonb,
  combined_briefing    TEXT NOT NULL DEFAULT '',
  combined_action_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  title                TEXT NOT NULL DEFAULT '',
  status               TEXT NOT NULL DEFAULT 'draft',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_combined_briefing_user ON public.user_combined_briefing (user_id, created_at DESC);
ALTER TABLE public.user_combined_briefing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_combined_briefing FROM PUBLIC, anon;
GRANT ALL ON TABLE public.user_combined_briefing TO service_role;
DROP POLICY IF EXISTS "user_combined_briefing_service_role_all" ON public.user_combined_briefing;
CREATE POLICY "user_combined_briefing_service_role_all" ON public.user_combined_briefing
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_combined_briefing TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "user_combined_briefing_owner_all" ON public.user_combined_briefing';
    EXECUTE 'CREATE POLICY "user_combined_briefing_owner_all" ON public.user_combined_briefing FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.construction_permits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text        TEXT NOT NULL UNIQUE,
  detail      TEXT,
  district    TEXT,
  region      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_construction_permits_created ON public.construction_permits (created_at DESC);
ALTER TABLE public.construction_permits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.construction_permits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.construction_permits TO service_role;
DROP POLICY IF EXISTS "construction_permits_service_role_all" ON public.construction_permits;
CREATE POLICY "construction_permits_service_role_all" ON public.construction_permits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- (A5) IM Pipeline Runtime, Harness Reports & Approval/Release Ledger (20260903)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.deal_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         UUID NOT NULL,
  trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('initial', 'correction', 'regeneration')),
  idempotency_key TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'running', 'waiting_input', 'succeeded', 'failed', 'cancelled', 'quarantined')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deal_runs_deal_id ON public.deal_runs (deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_runs_idempotency ON public.deal_runs (idempotency_key);
ALTER TABLE public.deal_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.deal_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.deal_runs TO service_role;
DROP POLICY IF EXISTS "deal_runs_service_role_all" ON public.deal_runs;
CREATE POLICY "deal_runs_service_role_all" ON public.deal_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.artifact_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_run_id   UUID NOT NULL REFERENCES public.deal_runs(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('dealcard', 'mobile', 'pptx')),
  status        TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'running', 'succeeded', 'failed', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_artifact_runs_deal_run ON public.artifact_runs (deal_run_id);
CREATE INDEX IF NOT EXISTS idx_artifact_runs_type ON public.artifact_runs (artifact_type);
ALTER TABLE public.artifact_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.artifact_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.artifact_runs TO service_role;
DROP POLICY IF EXISTS "artifact_runs_service_role_all" ON public.artifact_runs;
CREATE POLICY "artifact_runs_service_role_all" ON public.artifact_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.stage_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_run_id UUID NOT NULL REFERENCES public.artifact_runs(id) ON DELETE CASCADE,
  stage           TEXT NOT NULL,
  attempt         INTEGER NOT NULL DEFAULT 1,
  input_hash      TEXT NOT NULL,
  rule_version    TEXT NOT NULL,
  code_version    TEXT NOT NULL,
  output_hash     TEXT,
  status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed', 'retry_scheduled')),
  error_detail    JSONB,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  CONSTRAINT uq_stage_execution UNIQUE (artifact_run_id, stage, input_hash, rule_version)
);
CREATE INDEX IF NOT EXISTS idx_stage_runs_lookup ON public.stage_runs (artifact_run_id, stage);
ALTER TABLE public.stage_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stage_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.stage_runs TO service_role;
DROP POLICY IF EXISTS "stage_runs_service_role_all" ON public.stage_runs;
CREATE POLICY "stage_runs_service_role_all" ON public.stage_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.artifact_envelopes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_run_id   UUID NOT NULL REFERENCES public.stage_runs(id) ON DELETE CASCADE,
  artifact_type  TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  content_hash   TEXT NOT NULL,
  parent_hash    TEXT,
  payload        JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_envelopes_content_hash ON public.artifact_envelopes (content_hash);
ALTER TABLE public.artifact_envelopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.artifact_envelopes FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.artifact_envelopes TO service_role;
DROP POLICY IF EXISTS "artifact_envelopes_service_role_all" ON public.artifact_envelopes;
CREATE POLICY "artifact_envelopes_service_role_all" ON public.artifact_envelopes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.harness_reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_run_id       UUID NOT NULL REFERENCES public.artifact_runs(id) ON DELETE CASCADE,
  profile               TEXT NOT NULL,
  results               JSONB NOT NULL,
  blocker_count         INTEGER NOT NULL DEFAULT 0,
  all_run               BOOLEAN NOT NULL DEFAULT false,
  report_hash           TEXT NOT NULL,
  rule_registry_version TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_harness_reports_artifact ON public.harness_reports (artifact_run_id);
CREATE INDEX IF NOT EXISTS idx_harness_reports_hash ON public.harness_reports (report_hash);
ALTER TABLE public.harness_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.harness_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.harness_reports TO service_role;
DROP POLICY IF EXISTS "harness_reports_service_role_all" ON public.harness_reports;
CREATE POLICY "harness_reports_service_role_all" ON public.harness_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.approval_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_run_id         UUID NOT NULL REFERENCES public.artifact_runs(id) ON DELETE CASCADE,
  event_type              TEXT NOT NULL CHECK (event_type IN ('machine_check', 'human_approve', 'human_reject', 'invalidate', 'withdraw')),
  actor_id                UUID,
  actor_role              TEXT,
  target_hash             TEXT NOT NULL,
  harness_report_id       UUID REFERENCES public.harness_reports(id),
  predecessor_approval_id UUID REFERENCES public.approval_events(id),
  reason                  TEXT,
  expires_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approval_events_artifact ON public.approval_events (artifact_run_id);
CREATE INDEX IF NOT EXISTS idx_approval_events_target_hash ON public.approval_events (target_hash);
ALTER TABLE public.approval_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.approval_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.approval_events TO service_role;
DROP POLICY IF EXISTS "approval_events_service_role_all" ON public.approval_events;
CREATE POLICY "approval_events_service_role_all" ON public.approval_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.release_records (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_run_id      UUID NOT NULL REFERENCES public.artifact_runs(id) ON DELETE CASCADE,
  channel              TEXT NOT NULL CHECK (channel IN ('dealcard', 'mobile', 'pptx')),
  status               TEXT NOT NULL CHECK (status IN ('DRAFT', 'MACHINE_CHECKED', 'HUMAN_APPROVED', 'PUBLISHED', 'STALE', 'WITHDRAWN', 'SUPERSEDED')),
  public_url           TEXT,
  artifact_file_hash   TEXT,
  approved_approval_id UUID REFERENCES public.approval_events(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_release_records_artifact ON public.release_records (artifact_run_id);
CREATE INDEX IF NOT EXISTS idx_release_records_status ON public.release_records (status);
CREATE INDEX IF NOT EXISTS idx_release_records_channel ON public.release_records (channel);
ALTER TABLE public.release_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.release_records FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.release_records TO service_role;
DROP POLICY IF EXISTS "release_records_service_role_all" ON public.release_records;
CREATE POLICY "release_records_service_role_all" ON public.release_records
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- (B) Missing Columns on Existing Tables (`IF EXISTS` + `ADD COLUMN IF NOT EXISTS`)
-- =============================================================================

ALTER TABLE IF EXISTS public.im_fewshot_usage_log
  ADD COLUMN IF NOT EXISTS result_judge_score NUMERIC(3,1);

ALTER TABLE IF EXISTS public.im_golden_sets
  ADD COLUMN IF NOT EXISTS grade        VARCHAR(2) DEFAULT 'C',
  ADD COLUMN IF NOT EXISTS markdown_raw TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by  TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note  TEXT,
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE IF EXISTS public.im_projects
  ADD COLUMN IF NOT EXISTS outcome       TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS outcome_notes TEXT;

ALTER TABLE IF EXISTS public.building_ssot_lite
  ADD COLUMN IF NOT EXISTS completeness_score  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS layer_scores        JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS lease_summary       JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS floor_plan_url      TEXT,
  ADD COLUMN IF NOT EXISTS repair_history      JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS disclosure_prefs    JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS verification_result JSONB,
  ADD COLUMN IF NOT EXISTS caution_points      TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS deal_points         TEXT[] DEFAULT '{}'::text[];

ALTER TABLE IF EXISTS public.evidence_files
  ADD COLUMN IF NOT EXISTS file_name       TEXT,
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS is_verified     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS layer_category  TEXT,
  ADD COLUMN IF NOT EXISTS mime_type       TEXT,
  ADD COLUMN IF NOT EXISTS verified_at     TIMESTAMPTZ;

-- =============================================================================
-- (C) Locked-Down Idempotent RPC Functions (`SET search_path = public`)
-- =============================================================================

-- 1. increment_preset_use_count
CREATE OR REPLACE FUNCTION public.increment_preset_use_count(preset_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF to_regclass('public.pptx_custom_presets') IS NOT NULL THEN
    UPDATE public.pptx_custom_presets
       SET use_count = COALESCE(use_count, 0) + 1,
           updated_at = NOW()
     WHERE id = preset_id;
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.increment_preset_use_count(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_preset_use_count(UUID) TO authenticated, service_role;

-- 2. increment_term_hit_count
CREATE OR REPLACE FUNCTION public.increment_term_hit_count(rule_id UUID, amount INTEGER DEFAULT 1)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF to_regclass('public.im_terminology_rules') IS NOT NULL THEN
    UPDATE public.im_terminology_rules
       SET hit_count = COALESCE(hit_count, 0) + GREATEST(COALESCE(amount, 1), 0),
           last_hit_at = NOW()
     WHERE id = rule_id;
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.increment_term_hit_count(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_term_hit_count(UUID, INTEGER) TO service_role;

-- 3. increment_ab_views
CREATE OR REPLACE FUNCTION public.increment_ab_views(p_curation_id UUID, p_variant TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF to_regclass('public.content_ab_tests') IS NOT NULL THEN
    UPDATE public.content_ab_tests
       SET views = COALESCE(views, 0) + 1
     WHERE curation_id = p_curation_id
       AND variant = p_variant;
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.increment_ab_views(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_ab_views(UUID, TEXT) TO authenticated, service_role;

-- 4. increment_ab_clicks
CREATE OR REPLACE FUNCTION public.increment_ab_clicks(p_curation_id UUID, p_variant TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF to_regclass('public.content_ab_tests') IS NOT NULL THEN
    UPDATE public.content_ab_tests
       SET clicks = COALESCE(clicks, 0) + 1
     WHERE curation_id = p_curation_id
       AND variant = p_variant;
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.increment_ab_clicks(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_ab_clicks(UUID, TEXT) TO authenticated, service_role;

-- 5. create_golden_version_atomic
CREATE OR REPLACE FUNCTION public.create_golden_version_atomic(
  p_existing_id      UUID,
  p_updated_markdown TEXT,
  p_updated_score    NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_existing RECORD;
  v_new_id   UUID;
BEGIN
  SELECT * INTO v_existing
    FROM public.im_golden_sets
   WHERE id = p_existing_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Golden set record % not found', p_existing_id;
  END IF;

  UPDATE public.im_golden_sets
     SET is_active = false,
         updated_at = NOW()
   WHERE id = p_existing_id;

  INSERT INTO public.im_golden_sets (
    document_id,
    building_id,
    section_type,
    section_alias,
    asset_type,
    price_band,
    posture,
    markdown,
    markdown_raw,
    grade,
    judge_score,
    was_edited,
    source_type,
    version,
    parent_id,
    is_active,
    updated_at
  ) VALUES (
    v_existing.document_id,
    v_existing.building_id,
    v_existing.section_type,
    COALESCE(v_existing.section_alias, ''),
    v_existing.asset_type,
    v_existing.price_band,
    v_existing.posture,
    p_updated_markdown,
    p_updated_markdown,
    COALESCE(v_existing.grade, 'A'),
    COALESCE(p_updated_score, v_existing.judge_score),
    true,
    'version_update',
    COALESCE(v_existing.version, 1) + 1,
    p_existing_id,
    true,
    NOW()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.create_golden_version_atomic(UUID, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_golden_version_atomic(UUID, TEXT, NUMERIC) TO service_role;

-- 6. get_related_buildings
CREATE OR REPLACE FUNCTION public.get_related_buildings(
  p_building_id UUID,
  p_limit       INTEGER DEFAULT 5
)
RETURNS TABLE (
  "buildingId"   UUID,
  "sharedBuyers" INTEGER,
  "topGrade"     TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF to_regclass('public.match_results') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH base_buyers AS (
    SELECT DISTINCT mr.buyer_intent_lite_id
      FROM public.match_results mr
     WHERE mr.building_ssot_lite_id = p_building_id
       AND mr.grade IN ('S', 'A', 'B')
  )
  SELECT
    other.building_ssot_lite_id AS "buildingId",
    COUNT(DISTINCT other.buyer_intent_lite_id)::INTEGER AS "sharedBuyers",
    CASE MIN(
      CASE other.grade
        WHEN 'S' THEN 1
        WHEN 'A' THEN 2
        WHEN 'B' THEN 3
        ELSE 4
      END
    )
      WHEN 1 THEN 'S'
      WHEN 2 THEN 'A'
      WHEN 3 THEN 'B'
      ELSE 'C'
    END AS "topGrade"
  FROM public.match_results other
  JOIN base_buyers bb ON bb.buyer_intent_lite_id = other.buyer_intent_lite_id
  WHERE other.building_ssot_lite_id <> p_building_id
    AND other.grade IN ('S', 'A', 'B')
  GROUP BY other.building_ssot_lite_id
  ORDER BY "sharedBuyers" DESC
  LIMIT GREATEST(COALESCE(p_limit, 5), 1);
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_related_buildings(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_related_buildings(UUID, INTEGER) TO authenticated, service_role;

-- 7. match_org
CREATE OR REPLACE FUNCTION public.match_org(p_deal_id UUID)
RETURNS TABLE (
  broker_id   UUID,
  match_count INTEGER,
  strength    TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_caller_id      UUID := NULL;
  v_caller_parties INTEGER := 0;
BEGIN
  IF to_regprocedure('auth.uid()') IS NOT NULL THEN
    EXECUTE 'SELECT auth.uid()' INTO v_caller_id;
  END IF;

  IF to_regclass('public.party') IS NULL OR to_regclass('public.buyer_condition') IS NULL THEN
    RETURN;
  END IF;

  IF v_caller_id IS NOT NULL THEN
    SELECT COUNT(DISTINCT p.id)::INTEGER
      INTO v_caller_parties
      FROM public.party p
     WHERE p.owner_broker_id = v_caller_id
       AND p.created_at > NOW() - INTERVAL '6 months';

    IF COALESCE(v_caller_parties, 0) < 3 THEN
      RAISE EXCEPTION 'Insufficient contribution: need at least 3 recent parties for org-level matching';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    p.owner_broker_id AS broker_id,
    COUNT(DISTINCT bc.party_id)::INTEGER AS match_count,
    CASE
      WHEN MAX(
        CASE
          WHEN bc.confidence = 'high' AND bc.observed_at > NOW() - INTERVAL '3 months' THEN 0.9
          WHEN bc.confidence = 'high' THEN 0.7
          WHEN bc.confidence = 'medium' AND bc.observed_at > NOW() - INTERVAL '1 month' THEN 0.65
          WHEN bc.confidence = 'medium' THEN 0.5
          ELSE 0.3
        END
      ) >= 0.7 THEN 'high'
      ELSE 'medium'
    END AS strength
  FROM public.buyer_condition bc
  JOIN public.party p ON p.id = bc.party_id
  WHERE bc.confidence <> 'low'
    AND (v_caller_id IS NULL OR p.owner_broker_id <> v_caller_id)
    AND p.retention_until >= CURRENT_DATE
  GROUP BY p.owner_broker_id
  HAVING COUNT(DISTINCT bc.party_id) > 0
  ORDER BY match_count DESC;
END;
$fn$;
REVOKE ALL ON FUNCTION public.match_org(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_org(UUID) TO authenticated, service_role;

-- 8. search_similar_deals (pgvector-guarded so both live pgvector & bare PGlite succeed)
CREATE OR REPLACE FUNCTION public.search_similar_deals(
  query_embedding JSONB,
  match_threshold DOUBLE PRECISION DEFAULT 0.70,
  match_count     INTEGER DEFAULT 5,
  exclude_id      UUID DEFAULT NULL
)
RETURNS TABLE (
  id                UUID,
  task              TEXT,
  knowledge         TEXT,
  warning           TEXT,
  situation         TEXT,
  source_event_type TEXT,
  similarity        DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF to_regclass('public.deal_casepacks') IS NULL OR to_regtype('vector') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE
    'SELECT
       dc.id,
       dc.task,
       dc.knowledge,
       dc.warning,
       dc.situation,
       dc.source_event_type,
       (1 - (dc.embedding <=> ($1::text)::vector))::double precision AS similarity
     FROM public.deal_casepacks dc
     WHERE dc.embedding IS NOT NULL
       AND ($2::uuid IS NULL OR dc.id <> $2::uuid)
       AND 1 - (dc.embedding <=> ($1::text)::vector) > $3
     ORDER BY similarity DESC
     LIMIT GREATEST(COALESCE($4, 5), 1)'
  USING query_embedding, exclude_id, match_threshold, match_count;
END;
$fn$;
REVOKE ALL ON FUNCTION public.search_similar_deals(JSONB, DOUBLE PRECISION, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_similar_deals(JSONB, DOUBLE PRECISION, INTEGER, UUID) TO authenticated, service_role;

-- 9. search_similar_ims (pgvector-guarded so both live pgvector & bare PGlite succeed)
CREATE OR REPLACE FUNCTION public.search_similar_ims(
  query_embedding JSONB,
  match_threshold DOUBLE PRECISION DEFAULT 0.70,
  match_count     INTEGER DEFAULT 3,
  outcome_filter  TEXT DEFAULT NULL
)
RETURNS TABLE (
  id              UUID,
  outcome         TEXT,
  outcome_notes   TEXT,
  readiness_score INTEGER,
  similarity      DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF to_regclass('public.im_projects') IS NULL OR to_regtype('vector') IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY EXECUTE
    'SELECT
       ip.id,
       ip.outcome,
       ip.outcome_notes,
       ip.readiness_score,
       (1 - (ip.embedding <=> ($1::text)::vector))::double precision AS similarity
     FROM public.im_projects ip
     WHERE ip.embedding IS NOT NULL
       AND ($2::text IS NULL OR ip.outcome = $2::text)
       AND 1 - (ip.embedding <=> ($1::text)::vector) > $3
     ORDER BY similarity DESC
     LIMIT GREATEST(COALESCE($4, 3), 1)'
  USING query_embedding, outcome_filter, match_threshold, match_count;
END;
$fn$;
REVOKE ALL ON FUNCTION public.search_similar_ims(JSONB, DOUBLE PRECISION, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_similar_ims(JSONB, DOUBLE PRECISION, INTEGER, TEXT) TO authenticated, service_role;

COMMIT;
