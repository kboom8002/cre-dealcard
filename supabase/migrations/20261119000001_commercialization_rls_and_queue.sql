-- =============================================================================
-- Migration: 20261119000001_commercialization_rls_and_queue.sql
-- Purpose:
--   Phase 0 / PR-1A & PR-2B Prerequisites:
--   1. Enforce FORCE RLS & service_role-only access on legacy IM ledger & studio
--      tables when present (`approval_events`, `release_records`, `pptx_projects`, `pptx_slides`).
--   2. Tighten `public.lease_spaces` marketplace SELECT policy to require
--      `is_marketplace_listed = true AND status = 'active'`.
--   3. Add `next_attempt_at` + partial worker index on `public.magazine_dispatch_logs`
--      to eliminate QUIET_HOURS retryable head-of-line starvation.
-- =============================================================================

BEGIN;

-- ── 1. FORCE RLS & service_role-only lock on ledger / studio tables ───────────
DO $$
DECLARE
  t text;
  r record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'approval_events',
    'release_records',
    'pptx_projects',
    'pptx_slides'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);

      FOR r IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
      END LOOP;

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t || '_service_all',
        t
      );

      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;

-- ── 2. Tighten public.lease_spaces public marketplace visibility ──────────────
DO $$
BEGIN
  IF to_regclass('public.lease_spaces') IS NOT NULL THEN
    ALTER TABLE public.lease_spaces ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "lease_spaces_marketplace_select" ON public.lease_spaces;
    CREATE POLICY "lease_spaces_marketplace_select"
      ON public.lease_spaces
      FOR SELECT
      TO public
      USING (is_marketplace_listed = true AND status = 'active');
  END IF;
END $$;

-- ── 3. Newsletter dispatch queue non-starvation scheduling column ─────────────
ALTER TABLE IF EXISTS public.magazine_dispatch_logs
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

DO $$
BEGIN
  IF to_regclass('public.magazine_dispatch_logs') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_magazine_dispatch_logs_worker_ready
      ON public.magazine_dispatch_logs (status, next_attempt_at, created_at)
      WHERE status IN ('pending_worker', 'retryable');
  END IF;
END $$;

COMMIT;
