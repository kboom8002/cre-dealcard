-- =============================================================================
-- Migration: 20261126000003_sota_atomic_domain_rpcs.sql
-- Purpose:
--   Wave 1 Track 1B — Atomic Transactional Domain RPCs & Advisory Lease Locks:
--   1. Ensure `public.lease_ledger` and `public.lease_ledger_meta` exist with
--      strict RLS + `(asset_id, unit_label)` unique index for idempotent PGlite
--      and live PostgreSQL execution.
--   2. Define `public.rpc_publish_magazine_edition`: atomically updates
--      `magazine_editions` (`status = 'published'`) AND upserts `magazine_issues`
--      inside a single transaction (automatic rollback on failure).
--   3. Define `public.rpc_delete_magazine_edition`: atomically deletes
--      `magazine_editions` AND cleans up / survivor-syncs `magazine_issues`
--      inside a single transaction.
--   4. Define `public.rpc_replace_lease_ledger`: acquires transaction-scoped
--      advisory lock `pg_advisory_xact_lock(hashtext(p_asset_id))` so concurrent
--      rent-roll saves serialize cleanly without `UPSERT` + `DELETE NOT IN` race.
--   5. Define `public.rpc_approve_im_document`: atomically seals `document_objects`
--      with optimistic `updated_at` CAS, records `im_approvals`, updates `im_series`,
--      and publishes `workspace_items` inside one transaction.
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

-- ── 1. Ensure `public.lease_ledger` & `public.lease_ledger_meta` with strict RLS
CREATE TABLE IF NOT EXISTS public.lease_ledger (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id           UUID,
  asset_id              TEXT,
  unit_label            TEXT NOT NULL,
  contract_group        TEXT,
  lease_area_sqm        NUMERIC(10,2),
  exclusive_area_sqm    NUMERIC(10,2) CHECK (exclusive_area_sqm IS NULL OR exclusive_area_sqm > 0),
  tenant_business       TEXT,
  legal_basis           VARCHAR(10) CHECK (legal_basis IN ('상가', '주택', '미확인')),
  deposit_krw           BIGINT,
  monthly_rent_krw      BIGINT,
  mgmt_fee_krw          BIGINT,
  first_contract_date   DATE,
  current_start_date    DATE,
  current_expiry_date   DATE,
  renewal_exercised     VARCHAR(10) CHECK (renewal_exercised IN ('있음', '없음', '모름')),
  opposing_power        VARCHAR(20) CHECK (opposing_power IN ('사업자등록', '주민등록', '미확인')),
  lease_state           VARCHAR(10) NOT NULL DEFAULT '임대중' CHECK (lease_state IN ('임대중', '공실', '자가사용')),
  note                  TEXT,
  evidence_level        VARCHAR(20) CHECK (evidence_level IS NULL OR evidence_level IN ('계약서 원본', '매도인 렌트롤', '구두')),
  rent_free_months      INT CHECK (rent_free_months IS NULL OR rent_free_months >= 0),
  payment_status        VARCHAR(10) CHECK (payment_status IS NULL OR payment_status IN ('정상', '연체', '미확인')),
  source_tier           VARCHAR(20) DEFAULT 'broker_input',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lease_ledger
  ADD COLUMN IF NOT EXISTS exclusive_area_sqm NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS evidence_level VARCHAR(20),
  ADD COLUMN IF NOT EXISTS rent_free_months INT,
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(10);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lease_ledger_asset_unit
  ON public.lease_ledger (asset_id, unit_label);

ALTER TABLE public.lease_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lease_ledger FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.lease_ledger TO service_role;
DROP POLICY IF EXISTS "lease_ledger_service_role_all" ON public.lease_ledger;
CREATE POLICY "lease_ledger_service_role_all"
  ON public.lease_ledger
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.lease_ledger_meta (
  asset_id                    TEXT PRIMARY KEY,
  area_input_unit             VARCHAR(10) NOT NULL DEFAULT 'sqm' CHECK (area_input_unit IN ('sqm', 'pyeong')),
  rentroll_version            VARCHAR(10),
  rentroll_as_of              DATE,
  asking_price_krw            BIGINT,
  gfa_sqm                     NUMERIC(12,2),
  market_rent_1f              BIGINT,
  market_rent_1f_source       TEXT,
  market_rent_upper           BIGINT,
  market_rent_upper_source    TEXT,
  market_rent_basement        BIGINT,
  market_rent_basement_source TEXT,
  other_income_krw            BIGINT,
  other_income_note           TEXT,
  area_unit_override_reason   TEXT,
  area_unit_override_by       TEXT,
  area_unit_override_at       TIMESTAMPTZ,
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.lease_ledger_meta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lease_ledger_meta FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.lease_ledger_meta TO service_role;
DROP POLICY IF EXISTS "lease_ledger_meta_service_role_all" ON public.lease_ledger_meta;
CREATE POLICY "lease_ledger_meta_service_role_all"
  ON public.lease_ledger_meta
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 2. `public.rpc_publish_magazine_edition` ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_publish_magazine_edition(
  p_edition_id uuid,
  p_broker_id text,
  p_broker_user_id uuid,
  p_issue_date date,
  p_title text,
  p_subtitle text,
  p_summary text,
  p_blocks jsonb,
  p_published_at timestamptz,
  p_edition_patch jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ed record;
  v_ed_json jsonb;
  v_ed_owner_uid text;
  v_content jsonb;
  v_now timestamptz := now();
  v_eff_published_at timestamptz;
  v_updated_ed jsonb;
  v_issue_date_txt text := to_char(p_issue_date, 'YYYY-MM-DD');
  v_has_ed_broker_uid boolean;
  v_has_iss_broker_uid boolean;
  v_has_iss_updated_at boolean;
  v_iss_date_type text;
  v_feat_udt text;
BEGIN
  IF p_edition_id IS NULL THEN
    RAISE EXCEPTION 'EDITION_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_broker_id IS NULL OR btrim(p_broker_id) = '' THEN
    RAISE EXCEPTION 'BROKER_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_issue_date IS NULL THEN
    RAISE EXCEPTION 'ISSUE_DATE_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_ed
  FROM public.magazine_editions
  WHERE id = p_edition_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EDITION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_ed_json := to_jsonb(v_ed);
  v_ed_owner_uid := v_ed_json->>'broker_user_id';

  IF v_ed.broker_id IS DISTINCT FROM p_broker_id
     AND (p_broker_user_id IS NULL OR v_ed.broker_id IS DISTINCT FROM p_broker_user_id::text)
     AND (p_broker_user_id IS NULL OR v_ed_owner_uid IS DISTINCT FROM p_broker_user_id::text)
  THEN
    RAISE EXCEPTION 'EDITION_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_blocks IS NOT NULL AND jsonb_typeof(p_blocks) = 'object' THEN
    v_content := p_blocks;
    IF NOT (v_content ? 'schemaVersion') THEN
      IF p_subtitle IS NOT NULL AND NOT (v_content ? 'subtitle') THEN
        v_content := v_content || jsonb_build_object('subtitle', p_subtitle);
      END IF;
      IF p_summary IS NOT NULL AND NOT (v_content ? 'summary') THEN
        v_content := v_content || jsonb_build_object('summary', p_summary);
      END IF;
    END IF;
  ELSIF p_blocks IS NOT NULL AND jsonb_typeof(p_blocks) = 'array' THEN
    v_content := COALESCE(v_ed.content, '{}'::jsonb) || jsonb_build_object(
      'blocks', p_blocks,
      'issueDate', v_issue_date_txt
    );
    IF p_subtitle IS NOT NULL THEN
      v_content := v_content || jsonb_build_object('subtitle', p_subtitle);
    END IF;
    IF p_summary IS NOT NULL THEN
      v_content := v_content || jsonb_build_object('summary', p_summary);
    END IF;
  ELSE
    v_content := COALESCE(v_ed.content, '{}'::jsonb);
  END IF;

  v_eff_published_at := COALESCE(p_published_at, v_ed.published_at, v_now);

  UPDATE public.magazine_editions
  SET status = 'published',
      title = COALESCE(NULLIF(p_title, ''), title),
      content = v_content,
      published_at = v_eff_published_at,
      updated_at = v_now
  WHERE id = p_edition_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'magazine_editions' AND column_name = 'broker_user_id'
  ) INTO v_has_ed_broker_uid;

  IF v_has_ed_broker_uid AND p_broker_user_id IS NOT NULL THEN
    EXECUTE 'UPDATE public.magazine_editions SET broker_user_id = $1 WHERE id = $2'
      USING p_broker_user_id, p_edition_id;
  END IF;

  IF p_edition_patch IS NOT NULL AND jsonb_typeof(p_edition_patch) = 'object' THEN
    IF p_edition_patch ? 'title' AND jsonb_typeof(p_edition_patch->'title') = 'string' THEN
      UPDATE public.magazine_editions SET title = p_edition_patch->>'title' WHERE id = p_edition_id;
    END IF;
    IF p_edition_patch ? 'market_temp' THEN
      UPDATE public.magazine_editions SET market_temp = p_edition_patch->>'market_temp' WHERE id = p_edition_id;
    END IF;
    IF p_edition_patch ? 'cover_image_url' THEN
      UPDATE public.magazine_editions SET cover_image_url = p_edition_patch->>'cover_image_url' WHERE id = p_edition_id;
    END IF;
    IF p_edition_patch ? 'theme_title' THEN
      UPDATE public.magazine_editions SET theme_title = p_edition_patch->>'theme_title' WHERE id = p_edition_id;
    END IF;
    IF p_edition_patch ? 'theme_body_md' THEN
      UPDATE public.magazine_editions SET theme_body_md = p_edition_patch->>'theme_body_md' WHERE id = p_edition_id;
    END IF;
    IF p_edition_patch ? 'theme_color' THEN
      UPDATE public.magazine_editions SET theme_color = p_edition_patch->>'theme_color' WHERE id = p_edition_id;
    END IF;
    IF p_edition_patch ? 'field_note' THEN
      UPDATE public.magazine_editions
      SET field_note = CASE
        WHEN jsonb_typeof(p_edition_patch->'field_note') = 'null' THEN NULL
        ELSE p_edition_patch->'field_note'
      END
      WHERE id = p_edition_id;
    END IF;
    IF p_edition_patch ? 'cover_keywords' AND jsonb_typeof(p_edition_patch->'cover_keywords') = 'array' THEN
      UPDATE public.magazine_editions
      SET cover_keywords = ARRAY(SELECT jsonb_array_elements_text(p_edition_patch->'cover_keywords'))
      WHERE id = p_edition_id;
    END IF;
    IF p_edition_patch ? 'target_segments' AND jsonb_typeof(p_edition_patch->'target_segments') = 'array' THEN
      UPDATE public.magazine_editions
      SET target_segments = ARRAY(SELECT jsonb_array_elements_text(p_edition_patch->'target_segments'))
      WHERE id = p_edition_id;
    END IF;
    IF p_edition_patch ? 'featured_deal_ids' AND jsonb_typeof(p_edition_patch->'featured_deal_ids') = 'array' THEN
      SELECT udt_name INTO v_feat_udt
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'magazine_editions' AND column_name = 'featured_deal_ids';
      IF v_feat_udt = '_uuid' THEN
        EXECUTE 'UPDATE public.magazine_editions SET featured_deal_ids = ARRAY(SELECT (jsonb_array_elements_text($1))::uuid) WHERE id = $2'
          USING p_edition_patch->'featured_deal_ids', p_edition_id;
      ELSIF v_feat_udt IS NOT NULL THEN
        EXECUTE 'UPDATE public.magazine_editions SET featured_deal_ids = ARRAY(SELECT jsonb_array_elements_text($1)) WHERE id = $2'
          USING p_edition_patch->'featured_deal_ids', p_edition_id;
      END IF;
    END IF;
  END IF;

  SELECT to_jsonb(me.*)
  INTO v_updated_ed
  FROM public.magazine_editions me
  WHERE me.id = p_edition_id;

  SELECT data_type INTO v_iss_date_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'magazine_issues' AND column_name = 'issue_date';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'magazine_issues' AND column_name = 'updated_at'
  ) INTO v_has_iss_updated_at;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'magazine_issues' AND column_name = 'broker_user_id'
  ) INTO v_has_iss_broker_uid;

  IF v_iss_date_type = 'date' THEN
    IF v_has_iss_updated_at THEN
      EXECUTE 'INSERT INTO public.magazine_issues (broker_id, issue_date, content, updated_at)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (broker_id, issue_date)
               DO UPDATE SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at'
        USING p_broker_id, p_issue_date, v_content, v_now;
    ELSE
      EXECUTE 'INSERT INTO public.magazine_issues (broker_id, issue_date, content)
               VALUES ($1, $2, $3)
               ON CONFLICT (broker_id, issue_date)
               DO UPDATE SET content = EXCLUDED.content'
        USING p_broker_id, p_issue_date, v_content;
    END IF;
    IF v_has_iss_broker_uid AND p_broker_user_id IS NOT NULL THEN
      EXECUTE 'UPDATE public.magazine_issues SET broker_user_id = $1 WHERE broker_id = $2 AND issue_date = $3'
        USING p_broker_user_id, p_broker_id, p_issue_date;
    END IF;
  ELSE
    IF v_has_iss_updated_at THEN
      EXECUTE 'INSERT INTO public.magazine_issues (broker_id, issue_date, content, updated_at)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (broker_id, issue_date)
               DO UPDATE SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at'
        USING p_broker_id, v_issue_date_txt, v_content, v_now;
    ELSE
      EXECUTE 'INSERT INTO public.magazine_issues (broker_id, issue_date, content)
               VALUES ($1, $2, $3)
               ON CONFLICT (broker_id, issue_date)
               DO UPDATE SET content = EXCLUDED.content'
        USING p_broker_id, v_issue_date_txt, v_content;
    END IF;
    IF v_has_iss_broker_uid AND p_broker_user_id IS NOT NULL THEN
      EXECUTE 'UPDATE public.magazine_issues SET broker_user_id = $1 WHERE broker_id = $2 AND issue_date = $3'
        USING p_broker_user_id, p_broker_id, v_issue_date_txt;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'edition', v_updated_ed,
    'issue_date', v_issue_date_txt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_publish_magazine_edition(uuid, text, uuid, date, text, text, text, jsonb, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_publish_magazine_edition(uuid, text, uuid, date, text, text, text, jsonb, timestamptz, jsonb) TO service_role;

-- ── 3. `public.rpc_delete_magazine_edition` ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_delete_magazine_edition(
  p_edition_id uuid,
  p_broker_user_id uuid,
  p_is_admin boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ed record;
  v_ed_json jsonb;
  v_ed_owner_uid text;
  v_broker_keys text[] := ARRAY[]::text[];
  v_slug text;
  v_owned boolean := false;
  v_issue_date text;
  v_was_published boolean := false;
  v_surv record;
  v_surv_json jsonb;
  v_surv_date text;
  v_found_survivor boolean := false;
  v_survivor_content jsonb;
  v_target_broker_id text;
  v_iss_date_type text;
  v_has_iss_updated_at boolean;
  v_now timestamptz := now();
BEGIN
  IF p_edition_id IS NULL THEN
    RAISE EXCEPTION 'EDITION_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_ed
  FROM public.magazine_editions
  WHERE id = p_edition_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'deleted', false, 'code', 'NOT_FOUND');
  END IF;

  v_ed_json := to_jsonb(v_ed);
  v_ed_owner_uid := v_ed_json->>'broker_user_id';

  IF p_broker_user_id IS NOT NULL THEN
    v_broker_keys := array_append(v_broker_keys, p_broker_user_id::text);
    IF to_regclass('public.broker_profiles') IS NOT NULL THEN
      FOR v_slug IN
        SELECT bp.slug
        FROM public.broker_profiles bp
        WHERE bp.user_id = p_broker_user_id
          AND bp.slug IS NOT NULL
          AND btrim(bp.slug) <> ''
      LOOP
        IF NOT (v_slug = ANY(v_broker_keys)) THEN
          v_broker_keys := array_append(v_broker_keys, v_slug);
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF COALESCE(p_is_admin, false) THEN
    v_owned := true;
  ELSIF p_broker_user_id IS NOT NULL THEN
    IF v_ed.broker_id = ANY(v_broker_keys)
       OR (v_ed_owner_uid IS NOT NULL AND v_ed_owner_uid = p_broker_user_id::text)
    THEN
      v_owned := true;
    END IF;
  END IF;

  IF NOT v_owned THEN
    RETURN jsonb_build_object('ok', false, 'deleted', false, 'code', 'NOT_FOUND');
  END IF;

  IF v_ed.broker_id IS NOT NULL AND NOT (v_ed.broker_id = ANY(v_broker_keys)) THEN
    v_broker_keys := array_append(v_broker_keys, v_ed.broker_id);
  END IF;

  -- Resolve KST issue date matching resolveEditionKstIssueDate()
  v_issue_date := COALESCE(
    NULLIF(btrim(COALESCE(v_ed.content->>'issueDate', '')), ''),
    NULLIF(btrim(COALESCE(v_ed.content->>'issue_date', '')), '')
  );
  IF v_issue_date IS NOT NULL AND v_issue_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    v_issue_date := NULL;
  END IF;
  IF v_issue_date IS NULL THEN
    IF v_ed.published_at IS NOT NULL THEN
      v_issue_date := to_char(v_ed.published_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD');
    ELSIF v_ed.created_at IS NOT NULL THEN
      v_issue_date := to_char(v_ed.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD');
    END IF;
  END IF;
  IF v_issue_date IS NULL
     AND (v_ed_json->>'edition_label') IS NOT NULL
     AND btrim(v_ed_json->>'edition_label') ~ '^\d{4}-\d{2}-\d{2}$'
  THEN
    v_issue_date := btrim(v_ed_json->>'edition_label');
  END IF;

  v_was_published := (
    v_ed.status = 'published'
    OR v_ed.published_at IS NOT NULL
    OR v_ed.status IS NULL
  );

  DELETE FROM public.magazine_editions
  WHERE id = p_edition_id;

  IF v_was_published AND v_issue_date IS NOT NULL AND to_regclass('public.magazine_issues') IS NOT NULL THEN
    FOR v_surv IN
      SELECT *
      FROM public.magazine_editions
      WHERE broker_id = ANY(v_broker_keys)
        AND status = 'published'
        AND id <> p_edition_id
      ORDER BY published_at DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 100
    LOOP
      v_surv_json := to_jsonb(v_surv);
      v_surv_date := COALESCE(
        NULLIF(btrim(COALESCE(v_surv.content->>'issueDate', '')), ''),
        NULLIF(btrim(COALESCE(v_surv.content->>'issue_date', '')), '')
      );
      IF v_surv_date IS NOT NULL AND v_surv_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
        v_surv_date := NULL;
      END IF;
      IF v_surv_date IS NULL THEN
        IF v_surv.published_at IS NOT NULL THEN
          v_surv_date := to_char(v_surv.published_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD');
        ELSIF v_surv.created_at IS NOT NULL THEN
          v_surv_date := to_char(v_surv.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD');
        END IF;
      END IF;
      IF v_surv_date IS NULL
         AND (v_surv_json->>'edition_label') IS NOT NULL
         AND btrim(v_surv_json->>'edition_label') ~ '^\d{4}-\d{2}-\d{2}$'
      THEN
        v_surv_date := btrim(v_surv_json->>'edition_label');
      END IF;

      IF v_surv_date = v_issue_date THEN
        v_found_survivor := true;
        v_survivor_content := COALESCE(v_surv.content, '{}'::jsonb) || jsonb_build_object(
          'id', v_surv.id,
          'issueDate', v_issue_date
        );
        v_target_broker_id := COALESCE(v_surv.broker_id, v_ed.broker_id);
        EXIT;
      END IF;
    END LOOP;

    IF NOT v_found_survivor THEN
      DELETE FROM public.magazine_issues
      WHERE broker_id = ANY(v_broker_keys)
        AND issue_date::text = v_issue_date;
    ELSE
      SELECT data_type INTO v_iss_date_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'magazine_issues' AND column_name = 'issue_date';

      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'magazine_issues' AND column_name = 'updated_at'
      ) INTO v_has_iss_updated_at;

      IF v_iss_date_type = 'date' THEN
        IF v_has_iss_updated_at THEN
          EXECUTE 'INSERT INTO public.magazine_issues (broker_id, issue_date, content, updated_at)
                   VALUES ($1, $2::date, $3, $4)
                   ON CONFLICT (broker_id, issue_date)
                   DO UPDATE SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at'
            USING v_target_broker_id, v_issue_date, v_survivor_content, v_now;
        ELSE
          EXECUTE 'INSERT INTO public.magazine_issues (broker_id, issue_date, content)
                   VALUES ($1, $2::date, $3)
                   ON CONFLICT (broker_id, issue_date)
                   DO UPDATE SET content = EXCLUDED.content'
            USING v_target_broker_id, v_issue_date, v_survivor_content;
        END IF;
      ELSE
        IF v_has_iss_updated_at THEN
          EXECUTE 'INSERT INTO public.magazine_issues (broker_id, issue_date, content, updated_at)
                   VALUES ($1, $2, $3, $4)
                   ON CONFLICT (broker_id, issue_date)
                   DO UPDATE SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at'
            USING v_target_broker_id, v_issue_date, v_survivor_content, v_now;
        ELSE
          EXECUTE 'INSERT INTO public.magazine_issues (broker_id, issue_date, content)
                   VALUES ($1, $2, $3)
                   ON CONFLICT (broker_id, issue_date)
                   DO UPDATE SET content = EXCLUDED.content'
            USING v_target_broker_id, v_issue_date, v_survivor_content;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted', true,
    'id', p_edition_id,
    'issue_date', v_issue_date,
    'survivor_synced', v_found_survivor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_magazine_edition(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delete_magazine_edition(uuid, uuid, boolean) TO service_role;

-- ── 4. `public.rpc_replace_lease_ledger` ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_replace_lease_ledger(
  p_asset_id text,
  p_rows jsonb,
  p_meta jsonb,
  p_prune_source_tier text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_base_label text;
  v_candidate_label text;
  v_dup_idx int;
  v_keep_units text[] := ARRAY[]::text[];
  v_upserted int := 0;
  v_pruned int := 0;
  v_meta_updated boolean := false;
  v_now timestamptz := now();
  v_excl numeric(10,2);
  v_rfm int;
BEGIN
  IF p_asset_id IS NULL OR btrim(p_asset_id) = '' THEN
    RAISE EXCEPTION 'ASSET_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- Transaction-scoped advisory lock prevents concurrent UPSERT + DELETE NOT IN races on the same asset
  PERFORM pg_advisory_xact_lock(hashtext(p_asset_id));

  IF p_rows IS NOT NULL AND jsonb_typeof(p_rows) = 'array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows)
    LOOP
      v_base_label := COALESCE(
        NULLIF(btrim(COALESCE(v_item->>'unit_label', v_item->>'floor', '')), ''),
        '-'
      );
      v_candidate_label := v_base_label;
      v_dup_idx := 1;
      WHILE v_candidate_label = ANY(v_keep_units) LOOP
        v_dup_idx := v_dup_idx + 1;
        v_candidate_label := v_base_label || ' (' || v_dup_idx::text || ')';
      END LOOP;
      v_keep_units := array_append(v_keep_units, v_candidate_label);

      v_excl := CASE
        WHEN NULLIF(btrim(COALESCE(v_item->>'exclusive_area_sqm', '')), '') IS NOT NULL
             AND (v_item->>'exclusive_area_sqm')::numeric > 0
        THEN ROUND((v_item->>'exclusive_area_sqm')::numeric, 2)
        ELSE NULL
      END;

      v_rfm := CASE
        WHEN NULLIF(btrim(COALESCE(v_item->>'rent_free_months', '')), '') IS NOT NULL
             AND (v_item->>'rent_free_months')::int >= 0
        THEN (v_item->>'rent_free_months')::int
        ELSE NULL
      END;

      INSERT INTO public.lease_ledger (
        building_id,
        asset_id,
        unit_label,
        contract_group,
        lease_area_sqm,
        exclusive_area_sqm,
        tenant_business,
        legal_basis,
        deposit_krw,
        monthly_rent_krw,
        mgmt_fee_krw,
        first_contract_date,
        current_start_date,
        current_expiry_date,
        renewal_exercised,
        opposing_power,
        lease_state,
        note,
        evidence_level,
        rent_free_months,
        payment_status,
        source_tier,
        updated_at
      ) VALUES (
        CASE
          WHEN NULLIF(btrim(COALESCE(v_item->>'building_id', '')), '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (v_item->>'building_id')::uuid
          ELSE NULL
        END,
        p_asset_id,
        v_candidate_label,
        NULLIF(btrim(COALESCE(v_item->>'contract_group', '')), ''),
        CASE
          WHEN NULLIF(btrim(COALESCE(v_item->>'lease_area_sqm', '')), '') IS NOT NULL
               AND (v_item->>'lease_area_sqm')::numeric > 0
          THEN ROUND((v_item->>'lease_area_sqm')::numeric, 2)
          ELSE NULL
        END,
        v_excl,
        NULLIF(v_item->>'tenant_business', ''),
        CASE WHEN (v_item->>'legal_basis') IN ('상가', '주택', '미확인') THEN v_item->>'legal_basis' ELSE NULL END,
        NULLIF(btrim(COALESCE(v_item->>'deposit_krw', '')), '')::bigint,
        NULLIF(btrim(COALESCE(v_item->>'monthly_rent_krw', '')), '')::bigint,
        NULLIF(btrim(COALESCE(v_item->>'mgmt_fee_krw', '')), '')::bigint,
        CASE WHEN (v_item->>'first_contract_date') ~ '^\d{4}-\d{2}-\d{2}$' THEN (v_item->>'first_contract_date')::date ELSE NULL END,
        CASE WHEN (v_item->>'current_start_date') ~ '^\d{4}-\d{2}-\d{2}$' THEN (v_item->>'current_start_date')::date ELSE NULL END,
        CASE WHEN (v_item->>'current_expiry_date') ~ '^\d{4}-\d{2}-\d{2}$' THEN (v_item->>'current_expiry_date')::date ELSE NULL END,
        CASE WHEN (v_item->>'renewal_exercised') IN ('있음', '없음', '모름') THEN v_item->>'renewal_exercised' ELSE NULL END,
        CASE WHEN (v_item->>'opposing_power') IN ('사업자등록', '주민등록', '미확인') THEN v_item->>'opposing_power' ELSE NULL END,
        CASE WHEN (v_item->>'lease_state') IN ('임대중', '공실', '자가사용') THEN v_item->>'lease_state' ELSE '임대중' END,
        NULLIF(v_item->>'note', ''),
        CASE WHEN (v_item->>'evidence_level') IN ('계약서 원본', '매도인 렌트롤', '구두') THEN v_item->>'evidence_level' ELSE NULL END,
        v_rfm,
        CASE WHEN (v_item->>'payment_status') IN ('정상', '연체', '미확인') THEN v_item->>'payment_status' ELSE NULL END,
        COALESCE(NULLIF(btrim(COALESCE(v_item->>'source_tier', '')), ''), p_prune_source_tier, 'broker_input'),
        v_now
      )
      ON CONFLICT (asset_id, unit_label)
      DO UPDATE SET
        building_id = EXCLUDED.building_id,
        contract_group = EXCLUDED.contract_group,
        lease_area_sqm = EXCLUDED.lease_area_sqm,
        exclusive_area_sqm = EXCLUDED.exclusive_area_sqm,
        tenant_business = EXCLUDED.tenant_business,
        legal_basis = EXCLUDED.legal_basis,
        deposit_krw = EXCLUDED.deposit_krw,
        monthly_rent_krw = EXCLUDED.monthly_rent_krw,
        mgmt_fee_krw = EXCLUDED.mgmt_fee_krw,
        first_contract_date = EXCLUDED.first_contract_date,
        current_start_date = EXCLUDED.current_start_date,
        current_expiry_date = EXCLUDED.current_expiry_date,
        renewal_exercised = EXCLUDED.renewal_exercised,
        opposing_power = EXCLUDED.opposing_power,
        lease_state = EXCLUDED.lease_state,
        note = EXCLUDED.note,
        evidence_level = EXCLUDED.evidence_level,
        rent_free_months = EXCLUDED.rent_free_months,
        payment_status = EXCLUDED.payment_status,
        source_tier = EXCLUDED.source_tier,
        updated_at = EXCLUDED.updated_at;

      v_upserted := v_upserted + 1;
    END LOOP;

    IF array_length(v_keep_units, 1) IS NOT NULL AND array_length(v_keep_units, 1) > 0 THEN
      IF p_prune_source_tier IS NOT NULL THEN
        DELETE FROM public.lease_ledger
        WHERE asset_id = p_asset_id
          AND source_tier = p_prune_source_tier
          AND NOT (unit_label = ANY(v_keep_units));
      ELSE
        DELETE FROM public.lease_ledger
        WHERE asset_id = p_asset_id
          AND NOT (unit_label = ANY(v_keep_units));
      END IF;
    ELSE
      IF p_prune_source_tier IS NOT NULL THEN
        DELETE FROM public.lease_ledger
        WHERE asset_id = p_asset_id
          AND source_tier = p_prune_source_tier;
      ELSE
        DELETE FROM public.lease_ledger
        WHERE asset_id = p_asset_id;
      END IF;
    END IF;
    GET DIAGNOSTICS v_pruned = ROW_COUNT;
  END IF;

  IF p_meta IS NOT NULL AND jsonb_typeof(p_meta) = 'object' AND to_regclass('public.lease_ledger_meta') IS NOT NULL THEN
    INSERT INTO public.lease_ledger_meta (
      asset_id,
      area_input_unit,
      rentroll_version,
      rentroll_as_of,
      asking_price_krw,
      gfa_sqm,
      market_rent_1f,
      market_rent_1f_source,
      market_rent_upper,
      market_rent_upper_source,
      market_rent_basement,
      market_rent_basement_source,
      other_income_krw,
      other_income_note,
      area_unit_override_reason,
      area_unit_override_by,
      area_unit_override_at,
      updated_at
    ) VALUES (
      p_asset_id,
      CASE WHEN (p_meta->>'area_input_unit') = 'pyeong' THEN 'pyeong' ELSE 'sqm' END,
      NULLIF(btrim(COALESCE(p_meta->>'rentroll_version', '')), ''),
      CASE WHEN (p_meta->>'rentroll_as_of') ~ '^\d{4}-\d{2}-\d{2}$' THEN (p_meta->>'rentroll_as_of')::date ELSE NULL END,
      NULLIF(btrim(COALESCE(p_meta->>'asking_price_krw', '')), '')::bigint,
      NULLIF(btrim(COALESCE(p_meta->>'gfa_sqm', '')), '')::numeric(12,2),
      NULLIF(btrim(COALESCE(p_meta->>'market_rent_1f', '')), '')::bigint,
      NULLIF(btrim(COALESCE(p_meta->>'market_rent_1f_source', '')), ''),
      NULLIF(btrim(COALESCE(p_meta->>'market_rent_upper', '')), '')::bigint,
      NULLIF(btrim(COALESCE(p_meta->>'market_rent_upper_source', '')), ''),
      NULLIF(btrim(COALESCE(p_meta->>'market_rent_basement', '')), '')::bigint,
      NULLIF(btrim(COALESCE(p_meta->>'market_rent_basement_source', '')), ''),
      NULLIF(btrim(COALESCE(p_meta->>'other_income_krw', '')), '')::bigint,
      NULLIF(btrim(COALESCE(p_meta->>'other_income_note', '')), ''),
      NULLIF(btrim(COALESCE(p_meta->>'area_unit_override_reason', '')), ''),
      NULLIF(btrim(COALESCE(p_meta->>'area_unit_override_by', '')), ''),
      NULLIF(btrim(COALESCE(p_meta->>'area_unit_override_at', '')), '')::timestamptz,
      v_now
    )
    ON CONFLICT (asset_id)
    DO UPDATE SET
      area_input_unit = EXCLUDED.area_input_unit,
      rentroll_version = EXCLUDED.rentroll_version,
      rentroll_as_of = EXCLUDED.rentroll_as_of,
      asking_price_krw = EXCLUDED.asking_price_krw,
      gfa_sqm = EXCLUDED.gfa_sqm,
      market_rent_1f = EXCLUDED.market_rent_1f,
      market_rent_1f_source = EXCLUDED.market_rent_1f_source,
      market_rent_upper = EXCLUDED.market_rent_upper,
      market_rent_upper_source = EXCLUDED.market_rent_upper_source,
      market_rent_basement = EXCLUDED.market_rent_basement,
      market_rent_basement_source = EXCLUDED.market_rent_basement_source,
      other_income_krw = EXCLUDED.other_income_krw,
      other_income_note = EXCLUDED.other_income_note,
      area_unit_override_reason = EXCLUDED.area_unit_override_reason,
      area_unit_override_by = EXCLUDED.area_unit_override_by,
      area_unit_override_at = EXCLUDED.area_unit_override_at,
      updated_at = EXCLUDED.updated_at;
    v_meta_updated := true;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'asset_id', p_asset_id,
    'inserted', v_upserted,
    'pruned', v_pruned,
    'meta_updated', v_meta_updated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_replace_lease_ledger(text, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_replace_lease_ledger(text, jsonb, jsonb, text) TO service_role;

-- ── 5. `public.rpc_approve_im_document` ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_approve_im_document(
  p_doc_id uuid,
  p_expected_updated_at timestamptz,
  p_server_hash text,
  p_release_tier text,
  p_policy_version text,
  p_actor_id uuid,
  p_approved_by text,
  p_notes text DEFAULT NULL,
  p_workspace_sync jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc record;
  v_doc_json jsonb;
  v_series_id uuid;
  v_version_no int;
  v_prev_pub_id uuid;
  v_has_seal_cols boolean;
  v_ledger_recorded boolean := false;
  v_ws_synced boolean := false;
  v_ws_id uuid;
  v_now timestamptz := now();
BEGIN
  IF p_doc_id IS NULL THEN
    RAISE EXCEPTION 'DOC_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_doc
  FROM public.document_objects
  WHERE id = p_doc_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  IF p_expected_updated_at IS NOT NULL
     AND v_doc.updated_at IS NOT NULL
     AND v_doc.updated_at <> p_expected_updated_at
  THEN
    RETURN jsonb_build_object('ok', false, 'code', 'IM_APPROVAL_CONFLICT');
  END IF;

  v_doc_json := to_jsonb(v_doc);
  IF NULLIF(v_doc_json->>'series_id', '') IS NOT NULL THEN
    v_series_id := (v_doc_json->>'series_id')::uuid;
  END IF;
  IF NULLIF(v_doc_json->>'version_no', '') IS NOT NULL THEN
    v_version_no := (v_doc_json->>'version_no')::int;
  END IF;

  IF v_series_id IS NOT NULL AND to_regclass('public.im_series') IS NOT NULL THEN
    SELECT published_version_id
    INTO v_prev_pub_id
    FROM public.im_series
    WHERE id = v_series_id
    FOR UPDATE;

    IF v_prev_pub_id IS NOT NULL AND v_prev_pub_id <> p_doc_id THEN
      EXECUTE 'UPDATE public.document_objects
               SET status = ''superseded'', superseded_by = $1, updated_at = $2
               WHERE id = $3'
        USING p_doc_id, v_now, v_prev_pub_id;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'document_objects' AND column_name = 'sealed_at'
  ) INTO v_has_seal_cols;

  IF v_has_seal_cols THEN
    EXECUTE 'UPDATE public.document_objects
             SET status = ''published'',
                 sealed_at = $1,
                 seal_hash = COALESCE($2, seal_hash),
                 content_hash = COALESCE($2, content_hash),
                 updated_at = $1
             WHERE id = $3'
      USING v_now, p_server_hash, p_doc_id;
  ELSE
    UPDATE public.document_objects
    SET status = 'published',
        updated_at = v_now
    WHERE id = p_doc_id;
  END IF;

  IF p_server_hash IS NOT NULL AND to_regclass('public.im_approvals') IS NOT NULL THEN
    INSERT INTO public.im_approvals (
      version_id,
      series_id,
      version_no,
      event,
      actor_id,
      approved_by,
      target_hash,
      content_hash,
      release_tier,
      policy_version,
      notes,
      approved_at
    ) VALUES (
      p_doc_id,
      v_series_id,
      v_version_no,
      'approve',
      p_actor_id,
      p_approved_by,
      p_server_hash,
      p_server_hash,
      COALESCE(p_release_tier, 'fact_om'),
      COALESCE(p_policy_version, '2026-08-31'),
      p_notes,
      v_now
    );
    v_ledger_recorded := true;
  END IF;

  IF v_series_id IS NOT NULL AND to_regclass('public.im_series') IS NOT NULL THEN
    UPDATE public.im_series
    SET latest_approved_version_no = v_version_no,
        latest_approved_version_id = p_doc_id,
        published_version_id = p_doc_id,
        updated_at = v_now
    WHERE id = v_series_id;
  END IF;

  IF p_workspace_sync IS NOT NULL
     AND jsonb_typeof(p_workspace_sync) = 'object'
     AND NULLIF(p_workspace_sync->>'id', '') IS NOT NULL
     AND to_regclass('public.workspace_items') IS NOT NULL
  THEN
    v_ws_id := (p_workspace_sync->>'id')::uuid;
    UPDATE public.workspace_items
    SET status = 'published',
        title = COALESCE(p_workspace_sync->>'title', title),
        address = COALESCE(p_workspace_sync->>'address', address),
        price_band = COALESCE(p_workspace_sync->>'price_band', price_band),
        draft_payload = COALESCE(p_workspace_sync->'draft_payload', draft_payload),
        published_snapshot = COALESCE(p_workspace_sync->'published_snapshot', published_snapshot),
        doc_hash = COALESCE(p_workspace_sync->>'doc_hash', doc_hash),
        published_at = COALESCE(published_at, v_now),
        version = COALESCE(version, 1) + 1,
        updated_at = v_now
    WHERE id = v_ws_id;
    v_ws_synced := FOUND;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_doc_id,
    'status', 'published',
    'ledger_recorded', v_ledger_recorded,
    'workspace_synced', v_ws_synced
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_approve_im_document(uuid, timestamptz, text, text, text, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_approve_im_document(uuid, timestamptz, text, text, text, uuid, text, text, jsonb) TO service_role;

COMMIT;
