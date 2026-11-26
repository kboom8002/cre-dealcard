-- =============================================================================
-- Migration: 20261126000004_sota_dispatch_skip_locked_rpc.sql
-- Purpose:
--   Wave 2 Track 2A — Atomic `FOR UPDATE SKIP LOCKED` Dispatch Queue Claim RPC:
--   1. Ensure `public.magazine_dispatch_logs` carries all async worker columns,
--      status CHECK constraint, partial worker index, and strict `service_role` RLS
--      (100% idempotent on both live PostgreSQL and hermetic PGlite).
--   2. Define `public.claim_magazine_dispatch_batch(p_limit, p_now)` using
--      `FOR UPDATE SKIP LOCKED` to atomically claim up to `p_limit` rows
--      (`pending_worker` ordered by `created_at ASC` first, then due `retryable`
--      rows with `next_attempt_at IS NULL OR next_attempt_at <= p_now` ordered
--      by `created_at ASC`), transition `status = 'queued', updated_at = p_now`,
--      and return the claimed rows as a JSONB array.
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

-- ── 1. Ensure `public.magazine_dispatch_logs` schema + strict RLS ─────────────
CREATE TABLE IF NOT EXISTS public.magazine_dispatch_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key   text NOT NULL UNIQUE,
  edition_id        text,
  broker_id         text NOT NULL,
  broker_user_id    uuid,
  subscriber_id     uuid,
  channel           text NOT NULL CHECK (channel IN ('email', 'kakao')),
  kind              text NOT NULL DEFAULT 'weekly' CHECK (kind IN ('weekly', 'flash')),
  status            text NOT NULL CHECK (status IN ('queued', 'pending_worker', 'retryable', 'sent', 'blocked', 'failed', 'dry_run')),
  blocked_reason    text,
  provider_msg_id   text,
  error             text,
  recipient_hash    text,
  payload           jsonb,
  attempt_count     integer NOT NULL DEFAULT 0,
  queued_at         timestamptz DEFAULT now(),
  next_attempt_at   timestamptz,
  updated_at        timestamptz DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.magazine_dispatch_logs
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS queued_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.magazine_dispatch_logs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.magazine_dispatch_logs DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;

  ALTER TABLE public.magazine_dispatch_logs
    ADD CONSTRAINT magazine_dispatch_logs_status_check
    CHECK (status IN ('queued', 'pending_worker', 'retryable', 'sent', 'blocked', 'failed', 'dry_run'));
END $$;

CREATE INDEX IF NOT EXISTS idx_magazine_dispatch_logs_worker_ready
  ON public.magazine_dispatch_logs (status, next_attempt_at, created_at)
  WHERE status IN ('pending_worker', 'retryable');

ALTER TABLE public.magazine_dispatch_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.magazine_dispatch_logs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.magazine_dispatch_logs TO service_role;

DROP POLICY IF EXISTS "dispatch_logs_service_all" ON public.magazine_dispatch_logs;
CREATE POLICY "dispatch_logs_service_all"
  ON public.magazine_dispatch_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 2. `public.claim_magazine_dispatch_batch` (`FOR UPDATE SKIP LOCKED`) ──────
CREATE OR REPLACE FUNCTION public.claim_magazine_dispatch_batch(
  p_limit integer DEFAULT 80,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 80), 200));
  v_now timestamptz := COALESCE(p_now, now());
  v_result jsonb;
BEGIN
  WITH candidate_ids AS (
    SELECT
      mdl.id,
      CASE WHEN mdl.status = 'pending_worker' THEN 0 ELSE 1 END AS claim_prio,
      mdl.created_at AS claim_created_at
    FROM public.magazine_dispatch_logs AS mdl
    WHERE mdl.status = 'pending_worker'
       OR (
         mdl.status = 'retryable'
         AND (mdl.next_attempt_at IS NULL OR mdl.next_attempt_at <= v_now)
       )
    ORDER BY
      CASE WHEN mdl.status = 'pending_worker' THEN 0 ELSE 1 END ASC,
      mdl.created_at ASC,
      mdl.id ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.magazine_dispatch_logs AS t
    SET
      status = 'queued',
      updated_at = v_now
    FROM candidate_ids AS c
    WHERE t.id = c.id
    RETURNING t.*, c.claim_prio, c.claim_created_at
  )
  SELECT COALESCE(
    jsonb_agg(
      (to_jsonb(claimed.*) - 'claim_prio' - 'claim_created_at')
      ORDER BY claimed.claim_prio ASC, claimed.claim_created_at ASC, claimed.id ASC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM claimed;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_magazine_dispatch_batch(integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_magazine_dispatch_batch(integer, timestamptz) TO service_role;

COMMIT;
