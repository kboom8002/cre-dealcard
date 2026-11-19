-- =============================================================================
-- Migration: 20261117000003_dispatch_queue_and_monthly_stats_rpc.sql
-- Purpose:
--   Wave 3 (WP 3-B / WP 3-C / WP 3-E):
--   1. Extend `public.magazine_dispatch_logs` for async cron queue & 15m stale recovery.
--   2. Create `public.get_monthly_regional_tx_stats` server-side RPC for regional
--      monthly whole-building transaction aggregation (ordered latest-first,
--      suppressing medians when sample count < 3, supporting both building_area
--      and land_area).
-- =============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.magazine_dispatch_logs
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS queued_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.magazine_dispatch_logs') IS NOT NULL THEN
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
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_magazine_dispatch_logs_worker_queue
  ON public.magazine_dispatch_logs (status, created_at);

DO $$
BEGIN
  IF to_regclass('public.magazine_cron_runs') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.uq_magazine_cron_runs_run_id;
    DELETE FROM public.magazine_cron_runs a
      USING public.magazine_cron_runs b
      WHERE a.run_id LIKE 'cron_slot:%'
        AND a.run_id = b.run_id
        AND a.ctid < b.ctid;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_magazine_cron_runs_run_id
      ON public.magazine_cron_runs (run_id)
      WHERE run_id LIKE 'cron_slot:%';
    CREATE INDEX IF NOT EXISTS idx_magazine_cron_runs_run_id
      ON public.magazine_cron_runs (run_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_monthly_regional_tx_stats(
  p_sigungu_codes text[] DEFAULT '{}'::text[],
  p_district_keywords text[] DEFAULT '{}'::text[],
  p_months int DEFAULT 6,
  p_anchor_ym text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_months int := GREATEST(1, LEAST(COALESCE(p_months, 6), 24));
  v_anchor_date date;
  v_result jsonb;
BEGIN
  IF p_anchor_ym IS NOT NULL AND p_anchor_ym ~ '^\d{4}-\d{2}$' THEN
    v_anchor_date := to_date(p_anchor_ym || '-01', 'YYYY-MM-DD');
  ELSE
    SELECT COALESCE(
      date_trunc('month', MAX(transaction_date))::date,
      date_trunc('month', CURRENT_DATE)::date
    )
    INTO v_anchor_date
    FROM public.external_transactions;
  END IF;

  WITH month_series AS (
    SELECT to_char((v_anchor_date - (gs * interval '1 month'))::date, 'YYYY-MM') AS ym
    FROM generate_series(0, v_months - 1) AS gs
  ),
  matched_tx AS (
    SELECT
      to_char(et.transaction_date, 'YYYY-MM') AS ym,
      et.transaction_price,
      NULLIF(et.building_area, 0) AS b_area,
      NULLIF(et.land_area, 0) AS l_area
    FROM public.external_transactions et
    WHERE et.transaction_price > 0
      AND et.transaction_date >= (v_anchor_date - ((v_months - 1) * interval '1 month'))::date
      AND et.transaction_date < (v_anchor_date + interval '1 month')::date
      AND COALESCE(et.usage_type, '') <> '집합'
      AND COALESCE(et.raw_data->>'buildingType', '') <> '집합'
      AND COALESCE(et.raw_data->>'cdeal_type', '') <> 'O'
      AND (
        (
          COALESCE(array_length(p_district_keywords, 1), 0) = 0
          AND COALESCE(array_length(p_sigungu_codes, 1), 0) = 0
        )
        OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(p_district_keywords, '{}'::text[])) AS kw
          WHERE kw <> ''
            AND (
              COALESCE(et.district, '') LIKE '%' || kw || '%'
              OR COALESCE(et.dong, '') LIKE '%' || kw || '%'
              OR COALESCE(et.address, '') LIKE '%' || kw || '%'
            )
        )
        OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(p_sigungu_codes, '{}'::text[])) AS sc
          WHERE sc <> ''
            AND COALESCE(et.district, '') = sc
        )
      )
  ),
  monthly_agg AS (
    SELECT
      m.ym,
      COUNT(t.ym)::int AS tx_count,
      COUNT(t.b_area)::int AS gfa_sample_count,
      COUNT(t.l_area)::int AS land_sample_count,
      CASE
        WHEN COUNT(t.b_area) >= 3 THEN
          ROUND(
            (PERCENTILE_CONT(0.5) WITHIN GROUP (
              ORDER BY (t.transaction_price::numeric / (t.b_area * 0.3025)) / 10000.0
            ))
          )::bigint
        ELSE NULL
      END AS gfa_median_manwon,
      CASE
        WHEN COUNT(t.l_area) >= 3 THEN
          ROUND(
            (PERCENTILE_CONT(0.5) WITHIN GROUP (
              ORDER BY (t.transaction_price::numeric / (t.l_area * 0.3025)) / 10000.0
            ))
          )::bigint
        ELSE NULL
      END AS land_median_manwon
    FROM month_series m
    LEFT JOIN matched_tx t ON t.ym = m.ym
    GROUP BY m.ym
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'ym', ma.ym,
        'tx_count', ma.tx_count,
        'gfa_sample_count', ma.gfa_sample_count,
        'land_sample_count', ma.land_sample_count,
        'gfa_median_manwon', ma.gfa_median_manwon,
        'land_median_manwon', ma.land_median_manwon
      )
      ORDER BY ma.ym DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM monthly_agg ma;

  RETURN v_result;
END;
$$;

-- WP-7.3B P2-5: SECURITY DEFINER RPC — PostgreSQL grants EXECUTE to PUBLIC by default on CREATE FUNCTION,
-- which would let anon invoke it with the definer's privileges. Revoke first, then grant only to the
-- intended roles (mirrors 20261117000001 consume_im_pro_grant_download).
REVOKE ALL ON FUNCTION public.get_monthly_regional_tx_stats(text[], text[], int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_monthly_regional_tx_stats(text[], text[], int, text)
  TO service_role, authenticated;

COMMIT;
