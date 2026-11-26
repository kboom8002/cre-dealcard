-- =============================================================================
-- Migration: 20261126000005_sota_system_error_logs.sql
-- Purpose:
--   Wave 5 Track 5A — Dedicated `public.system_error_logs` Telemetry Table
--   with Request Correlation (`request_id`), PII-Scrubbed Stack Preservation
--   (`error_stack`), Strict RLS, and `service_role`-only Access Policy.
-- =============================================================================

BEGIN;

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

CREATE TABLE IF NOT EXISTS public.system_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code text NOT NULL,
  request_id text,
  boundary text NOT NULL,
  digest text,
  url text,
  error_name text NOT NULL,
  error_message text,
  error_stack text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_error_logs_created_at
  ON public.system_error_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_error_logs_ref_code
  ON public.system_error_logs (ref_code);

ALTER TABLE public.system_error_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.system_error_logs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.system_error_logs TO service_role;

DROP POLICY IF EXISTS system_error_logs_service_role_all ON public.system_error_logs;
CREATE POLICY system_error_logs_service_role_all
  ON public.system_error_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
