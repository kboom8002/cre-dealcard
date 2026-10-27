-- ============================================================================
-- 20261027000002_p05_foundations.sql
-- 목적  : P0.5 Platform Foundations — building_ssot_lite pnu generated column,
--         unique(owner_id, pnu), jobs_v2 table, im_generation_jobs enhancements,
--         feature_flags table, quick_im input_type check
-- 근거  : docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §5.3, §5.5, §6
-- [롤백] supabase/migrations/_rollback/20261027000002_p05_foundations_rollback.sql
-- ============================================================================

BEGIN;

-- 1. building_ssot_lite: quick_im input_type 허용
ALTER TABLE public.building_ssot_lite
  DROP CONSTRAINT IF EXISTS building_ssot_lite_input_type_check;

ALTER TABLE public.building_ssot_lite
  ADD CONSTRAINT building_ssot_lite_input_type_check
  CHECK (input_type IN ('address', 'broker_memo', 'voice_note', 'manual_form', 'quick_im'));

-- 2. building_ssot_lite: PNU Stored Generated Column & Unique Constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'building_ssot_lite'
      AND column_name = 'pnu'
  ) THEN
    ALTER TABLE public.building_ssot_lite
      ADD COLUMN pnu TEXT GENERATED ALWAYS AS (
        COALESCE(layers->'location'->>'pnu', layers->>'pnu')
      ) STORED;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS building_ssot_lite_owner_pnu_idx
  ON public.building_ssot_lite(owner_id, pnu)
  WHERE status <> 'archived' AND pnu IS NOT NULL;

-- 3. im_generation_jobs: Jobs v2 라이프사이클 컬럼 확장
DO $$
BEGIN
  -- idempotency_key
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='im_generation_jobs' AND column_name='idempotency_key') THEN
    ALTER TABLE public.im_generation_jobs ADD COLUMN idempotency_key TEXT;
  END IF;
  -- attempt & max_attempts
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='im_generation_jobs' AND column_name='attempt') THEN
    ALTER TABLE public.im_generation_jobs ADD COLUMN attempt INT NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='im_generation_jobs' AND column_name='max_attempts') THEN
    ALTER TABLE public.im_generation_jobs ADD COLUMN max_attempts INT NOT NULL DEFAULT 2;
  END IF;
  -- timestamps
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='im_generation_jobs' AND column_name='heartbeat_at') THEN
    ALTER TABLE public.im_generation_jobs ADD COLUMN heartbeat_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='im_generation_jobs' AND column_name='started_at') THEN
    ALTER TABLE public.im_generation_jobs ADD COLUMN started_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='im_generation_jobs' AND column_name='deadline_at') THEN
    ALTER TABLE public.im_generation_jobs ADD COLUMN deadline_at TIMESTAMPTZ;
  END IF;
  -- cancel_requested
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='im_generation_jobs' AND column_name='cancel_requested') THEN
    ALTER TABLE public.im_generation_jobs ADD COLUMN cancel_requested BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  -- stage & progress & error_class
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='im_generation_jobs' AND column_name='stage') THEN
    ALTER TABLE public.im_generation_jobs ADD COLUMN stage TEXT NOT NULL DEFAULT 'queued';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='im_generation_jobs' AND column_name='progress') THEN
    ALTER TABLE public.im_generation_jobs ADD COLUMN progress INT NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='im_generation_jobs' AND column_name='error_class') THEN
    ALTER TABLE public.im_generation_jobs ADD COLUMN error_class TEXT;
  END IF;
  -- telemetry & cost
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='im_generation_jobs' AND column_name='cost_usd') THEN
    ALTER TABLE public.im_generation_jobs ADD COLUMN cost_usd NUMERIC;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='im_generation_jobs' AND column_name='llm_calls') THEN
    ALTER TABLE public.im_generation_jobs ADD COLUMN llm_calls INT NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='im_generation_jobs' AND column_name='tokens') THEN
    ALTER TABLE public.im_generation_jobs ADD COLUMN tokens INT NOT NULL DEFAULT 0;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS im_generation_jobs_idempotency_idx
  ON public.im_generation_jobs(idempotency_key)
  WHERE status IN ('queued', 'running', 'processing') AND idempotency_key IS NOT NULL;

-- 4. jobs_v2 테이블 (신규 작업 플랫폼 표준 테이블)
CREATE TABLE IF NOT EXISTS public.jobs_v2 (
  id TEXT PRIMARY KEY,
  building_id UUID REFERENCES public.building_ssot_lite(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL DEFAULT 'im_generation',
  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'processing', 'succeeded', 'failed', 'cancelled', 'timed_out')),
  stage TEXT NOT NULL DEFAULT 'queued',
  progress INT NOT NULL DEFAULT 0,
  attempt INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 2,
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  heartbeat_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  error_class TEXT,
  input_payload JSONB NOT NULL DEFAULT '{}',
  output_payload JSONB NOT NULL DEFAULT '{}',
  cost_usd NUMERIC,
  llm_calls INT NOT NULL DEFAULT 0,
  tokens INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS jobs_v2_idempotency_idx
  ON public.jobs_v2(idempotency_key)
  WHERE status IN ('queued', 'running', 'processing') AND idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS jobs_v2_building_id_idx ON public.jobs_v2(building_id);
CREATE INDEX IF NOT EXISTS jobs_v2_owner_id_idx ON public.jobs_v2(owner_id);
CREATE INDEX IF NOT EXISTS jobs_v2_status_idx ON public.jobs_v2(status);

ALTER TABLE public.jobs_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs_v2_select_owner"
  ON public.jobs_v2 FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

-- 5. feature_flags 테이블 (서버 기능 플래그 및 코호트)
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_pct INT NOT NULL DEFAULT 0 CHECK (rollout_pct >= 0 AND rollout_pct <= 100),
  allow_user_ids TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_flags_select_authenticated"
  ON public.feature_flags FOR SELECT
  TO authenticated
  USING (true);

COMMIT;
