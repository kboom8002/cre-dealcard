-- =============================================================================
-- Migration: 20261126000001_sota_rls_rpc_and_fk_hardening.sql
-- Purpose:
--   Wave 0 Track 0C — Emergency DB RLS, RPC Security & Hot FK Indexing:
--   (A) Enable RLS across all 52 previously unprotected base tables in `public`
--       (tiered into credential/internal, public reference/read, and tenant/broker/lead)
--       plus a catch-all sweep over every remaining `public` base table (`relkind = 'r'`)
--       except `spatial_ref_sys` so 0 base tables remain unprotected.
--   (B) Remove dangerous permissive policies on `leasing_inquiries`,
--       `broker_circle_members`, `circle_match_results`, `match_results`,
--       `deal_casepacks`, and `deal_pipeline_states`, replacing them with strict
--       least-privilege policies.
--   (C) Lock down `SECURITY DEFINER` functions (`SET search_path = public`),
--       revoke `PUBLIC, anon` execution on sensitive RPCs, and enforce optimistic
--       CAS conflict detection (`ERRCODE = '40001'`) in `public.approve_im_version`.
--   (D) Add guarded hot foreign-key indexes to eliminate sequential scans.
--
--   100% idempotent and schema-guarded (`to_regclass`, `information_schema.columns`,
--   `pg_proc`, `pg_roles`) for safe execution on both live Supabase and PGlite.
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

-- ── 0b. Ensure `public.recipient` exists with strict RLS (0301 backport) ──────
CREATE TABLE IF NOT EXISTS public.recipient (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  broker_id     UUID NOT NULL,
  label         TEXT NOT NULL,
  contact_hint  TEXT,
  party_id      UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.recipient ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.recipient FROM PUBLIC, anon;
GRANT ALL ON TABLE public.recipient TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recipient TO authenticated;
DROP POLICY IF EXISTS "recipient_service_role_all" ON public.recipient;
CREATE POLICY "recipient_service_role_all" ON public.recipient
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "recipient_owner_all" ON public.recipient';
    EXECUTE 'CREATE POLICY "recipient_owner_all" ON public.recipient FOR ALL TO authenticated USING (broker_id = auth.uid()) WITH CHECK (broker_id = auth.uid())';
  END IF;
END $$;

-- ── (A1) Credential / Internal Tables: service_role only ──────────────────────
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'api_clients',
    'api_usage_events',
    'iot_data_stream',
    'processing_jobs',
    'im_fewshot_usage_log'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND c.relkind IN ('r', 'p')
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);

      FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
      END LOOP;

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t || '_service_role_all',
        t
      );
    END IF;
  END LOOP;
END $$;

-- ── (A2) Public Reference / Market / Read Tables: anon+authenticated SELECT ───
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'location_hierarchy',
    'zoning_ordinance',
    'official_land_prices',
    'land_use_plans',
    'commercial_district',
    'external_transactions',
    'external_news',
    'external_reports',
    'rental_market_data',
    'rental_trend_data',
    'auction_listings',
    'energy_ratings',
    'retrofit_products',
    'im_terminology_rules',
    'market_sentiment_polls',
    'social_sentiment',
    'youtube_trends',
    'poc_surveys',
    'vendor_reviews',
    'share_pages',
    'teaser_configs'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND c.relkind IN ('r', 'p')
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.%I FROM PUBLIC, anon', t);
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon, authenticated', t);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);

      -- Drop any preexisting permissive write policies open to PUBLIC/anon
      FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = t
          AND cmd <> 'SELECT'
          AND (roles && ARRAY['public', 'anon']::name[])
          AND (COALESCE(qual, '') = 'true' OR COALESCE(with_check, '') = 'true')
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
      END LOOP;

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_public_read', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
        t || '_public_read',
        t
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service_role_all', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t || '_service_role_all',
        t
      );
    END IF;
  END LOOP;
END $$;

-- ── (A3) Tenant / Broker / Lead Tables: service_role + dynamic owner policy ───
DO $$
DECLARE
  t text;
  col record;
  v_preds text[];
  v_owner_expr text;
  v_has_auth_uid boolean := (to_regprocedure('auth.uid()') IS NOT NULL);
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'buildings',
    'spaces',
    'space_ssot_snapshots',
    'leasing_pages',
    'leasing_page_sections',
    'inquiry_qualifications',
    'visual_assets',
    'visual_albums',
    'visual_album_items',
    'visual_answer_cards',
    'missing_shot_requests',
    'mvp_handoffs',
    'organizations',
    'lead_scores',
    'co_brokerage_requests',
    'buyer_wishlists',
    'content_curations',
    'curation_items',
    'content_ab_tests',
    'content_share_events',
    'retrofit_inquiries',
    'owner_report_history',
    'teaser_events',
    'deal_conversion_features',
    'price_features',
    'buyer_clusters'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND c.relkind IN ('r', 'p')
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', t);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service_role_all', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t || '_service_role_all',
        t
      );

      IF v_has_auth_uid THEN
        v_preds := ARRAY[]::text[];
        FOR col IN
          SELECT column_name, udt_name, data_type
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = t
            AND column_name IN ('owner_id', 'broker_id', 'created_by', 'user_id')
          ORDER BY CASE column_name
            WHEN 'owner_id' THEN 1
            WHEN 'broker_id' THEN 2
            WHEN 'created_by' THEN 3
            WHEN 'user_id' THEN 4
            ELSE 5
          END
        LOOP
          IF col.udt_name = 'uuid' THEN
            v_preds := array_append(v_preds, format('%I = auth.uid()', col.column_name));
          ELSIF col.data_type IN ('text', 'character varying') THEN
            v_preds := array_append(v_preds, format('%I = auth.uid()::text', col.column_name));
          END IF;
        END LOOP;

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_authenticated_owner_all', t);
        IF array_length(v_preds, 1) IS NOT NULL AND array_length(v_preds, 1) > 0 THEN
          v_owner_expr := array_to_string(v_preds, ' OR ');
          EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
          EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
            t || '_authenticated_owner_all',
            t,
            v_owner_expr,
            v_owner_expr
          );
        END IF;
      END IF;
    END IF;
  END LOOP;
END $$;

-- ── (A4) Catch-All Sweep: guarantee 0 unprotected base tables in `public` ─────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname <> 'spatial_ref_sys'
      AND NOT c.relrowsecurity
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = r.relname
          AND ('service_role' = ANY(roles))
      ) THEN
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.relname || '_service_role_all', r.relname);
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
          r.relname || '_service_role_all',
          r.relname
        );
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'Skipping extension/system-owned table public.% due to insufficient_privilege', r.relname;
    END;
  END LOOP;
END $$;

-- ── (B) Drop Dangerous Permissive Policies & Replace with Least-Privilege ─────
DO $$
DECLARE
  t text;
  pol record;
  v_has_auth_uid boolean := (to_regprocedure('auth.uid()') IS NOT NULL);
BEGIN
  -- B1. public.leasing_inquiries
  IF to_regclass('public.leasing_inquiries') IS NOT NULL THEN
    ALTER TABLE public.leasing_inquiries ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "leasing_inquiries_public_select" ON public.leasing_inquiries;
    DROP POLICY IF EXISTS "leasing_inquiries_public_insert" ON public.leasing_inquiries;

    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'leasing_inquiries'
        AND (roles && ARRAY['public', 'anon']::name[])
        AND (COALESCE(qual, '') = 'true' OR COALESCE(with_check, '') = 'true')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.leasing_inquiries', pol.policyname);
    END LOOP;

    DROP POLICY IF EXISTS "leasing_inquiries_service_role_all" ON public.leasing_inquiries;
    CREATE POLICY "leasing_inquiries_service_role_all"
      ON public.leasing_inquiries
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);

    DROP POLICY IF EXISTS "leasing_inquiries_owner_select" ON public.leasing_inquiries;
    IF v_has_auth_uid
       AND to_regclass('public.spaces') IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'leasing_inquiries' AND column_name = 'space_id'
       )
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'spaces' AND column_name = 'created_by' AND udt_name = 'uuid'
       )
    THEN
      GRANT SELECT ON TABLE public.leasing_inquiries TO authenticated;
      CREATE POLICY "leasing_inquiries_owner_select"
        ON public.leasing_inquiries
        FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.spaces s
            WHERE s.id = leasing_inquiries.space_id
              AND s.created_by = auth.uid()
          )
        );
    END IF;
  END IF;

  -- B2. public.broker_circle_members
  IF to_regclass('public.broker_circle_members') IS NOT NULL THEN
    ALTER TABLE public.broker_circle_members ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "members_insert" ON public.broker_circle_members;

    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'broker_circle_members'
        AND cmd IN ('INSERT', 'ALL')
        AND (roles && ARRAY['public', 'anon', 'authenticated']::name[])
        AND COALESCE(with_check, '') = 'true'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.broker_circle_members', pol.policyname);
    END LOOP;

    DROP POLICY IF EXISTS "broker_circle_members_service_role_all" ON public.broker_circle_members;
    CREATE POLICY "broker_circle_members_service_role_all"
      ON public.broker_circle_members
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);

    DROP POLICY IF EXISTS "members_insert_self_pending" ON public.broker_circle_members;
    IF v_has_auth_uid
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'broker_circle_members' AND column_name = 'broker_id'
       )
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'broker_circle_members' AND column_name = 'role'
       )
    THEN
      GRANT SELECT, INSERT, UPDATE ON TABLE public.broker_circle_members TO authenticated;
      CREATE POLICY "members_insert_self_pending"
        ON public.broker_circle_members
        FOR INSERT
        TO authenticated
        WITH CHECK (broker_id = auth.uid() AND role = 'member');
    END IF;
  END IF;

  -- B3. public.circle_match_results
  IF to_regclass('public.circle_match_results') IS NOT NULL THEN
    ALTER TABLE public.circle_match_results ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "cmatch_insert" ON public.circle_match_results;

    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'circle_match_results'
        AND cmd IN ('INSERT', 'ALL')
        AND (roles && ARRAY['public', 'anon', 'authenticated']::name[])
        AND COALESCE(with_check, '') = 'true'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.circle_match_results', pol.policyname);
    END LOOP;

    DROP POLICY IF EXISTS "circle_match_results_service_role_all" ON public.circle_match_results;
    CREATE POLICY "circle_match_results_service_role_all"
      ON public.circle_match_results
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  -- B4. public.match_results, public.deal_casepacks, public.deal_pipeline_states
  FOREACH t IN ARRAY ARRAY[
    'match_results',
    'deal_casepacks',
    'deal_pipeline_states'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND c.relkind IN ('r', 'p')
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

      -- Drop any policy containing `broker_id IS NULL` (including parenthesized deparsed forms)
      FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = t
          AND (
            COALESCE(qual, '') ~* 'broker_id\s+is\s+null'
            OR COALESCE(with_check, '') ~* 'broker_id\s+is\s+null'
          )
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
      END LOOP;

      -- Drop canonical owner policy names before recreating strict policies
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_broker_own', t);
      IF t = 'deal_casepacks' THEN
        DROP POLICY IF EXISTS "casepacks_broker_own" ON public.deal_casepacks;
      ELSIF t = 'deal_pipeline_states' THEN
        DROP POLICY IF EXISTS "pipeline_broker_own" ON public.deal_pipeline_states;
      END IF;

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service_role_all', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t || '_service_role_all',
        t
      );

      IF v_has_auth_uid
         AND EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = t AND column_name = 'broker_id' AND udt_name = 'uuid'
         )
      THEN
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (broker_id = auth.uid()) WITH CHECK (broker_id = auth.uid())',
          CASE t
            WHEN 'deal_casepacks' THEN 'casepacks_broker_own'
            WHEN 'deal_pipeline_states' THEN 'pipeline_broker_own'
            ELSE 'match_results_broker_own'
          END,
          t
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- ── (C1) Replace approve_im_version with CAS Conflict Enforcement (40001) ─────
DO $do$
BEGIN
  IF to_regclass('public.document_objects') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.approve_im_version(
        p_version_id UUID,
        p_expected_content_hash TEXT,
        p_actor_id UUID DEFAULT NULL,
        p_release_tier TEXT DEFAULT 'fact_om',
        p_notes TEXT DEFAULT NULL
      )
      RETURNS BOOLEAN
      LANGUAGE plpgsql
      SET search_path = public
      AS $$
      DECLARE
        v_doc RECORD;
        v_series_id UUID;
        v_version_no INT;
        v_prev_published_id UUID;
      BEGIN
        SELECT id, series_id, version_no, status, content_hash
        INTO v_doc
        FROM public.document_objects
        WHERE id = p_version_id
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Document % not found', p_version_id;
        END IF;

        IF p_expected_content_hash IS NOT NULL
           AND v_doc.content_hash IS NOT NULL
           AND v_doc.content_hash IS DISTINCT FROM p_expected_content_hash
        THEN
          RAISE EXCEPTION 'CAS_CONFLICT: expected content_hash %, actual %',
            p_expected_content_hash, v_doc.content_hash
            USING ERRCODE = '40001';
        END IF;

        v_series_id := v_doc.series_id;
        v_version_no := v_doc.version_no;

        -- 이전 공개 버전 superseded 처리
        IF v_series_id IS NOT NULL THEN
          SELECT published_version_id INTO v_prev_published_id
          FROM public.im_series
          WHERE id = v_series_id;

          IF v_prev_published_id IS NOT NULL AND v_prev_published_id <> p_version_id THEN
            UPDATE public.document_objects
            SET status = 'superseded',
                superseded_by = p_version_id,
                updated_at = now()
            WHERE id = v_prev_published_id;
          END IF;
        END IF;

        -- 문서 승인 상태로 갱신 및 봉인 (body는 절대 수정하지 않음)
        UPDATE public.document_objects
        SET status = 'published',
            sealed_at = now(),
            seal_hash = p_expected_content_hash,
            content_hash = COALESCE(content_hash, p_expected_content_hash),
            updated_at = now()
        WHERE id = p_version_id;

        -- 불변 승인 원장 기록
        INSERT INTO public.im_approvals (
          version_id,
          series_id,
          version_no,
          event,
          actor_id,
          target_hash,
          content_hash,
          release_tier,
          notes,
          approved_at
        ) VALUES (
          p_version_id,
          v_series_id,
          v_version_no,
          'approve',
          p_actor_id,
          p_expected_content_hash,
          p_expected_content_hash,
          p_release_tier,
          p_notes,
          now()
        );

        -- 시리즈 포인터 갱신
        IF v_series_id IS NOT NULL THEN
          UPDATE public.im_series
          SET latest_approved_version_no = v_version_no,
              latest_approved_version_id = p_version_id,
              published_version_id = p_version_id,
              updated_at = now()
          WHERE id = v_series_id;
        END IF;

        RETURN TRUE;
      END;
      $$;
    $fn$;
  END IF;
END $do$;

-- ── (C2) Lock Down SECURITY DEFINER search_path & Sensitive RPC Grants ────────
DO $$
DECLARE
  fn record;
BEGIN
  -- Pin search_path = public on all SECURITY DEFINER functions/procedures in public lacking search_path
  FOR fn IN
    SELECT
      p.oid,
      p.proname,
      p.prokind,
      pg_get_function_identity_arguments(p.oid) AS ident_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format(
      'ALTER %s public.%I(%s) SET search_path = public',
      CASE WHEN fn.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
      fn.proname,
      fn.ident_args
    );
  END LOOP;

  -- Revoke PUBLIC/anon/authenticated on maintenance-only expire_stale_handoffs -> grant service_role
  FOR fn IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS ident_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'expire_stale_handoffs'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', fn.proname, fn.ident_args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', fn.proname, fn.ident_args);
  END LOOP;

  -- Revoke PUBLIC/anon on IM versioning RPCs -> grant authenticated, service_role
  FOR fn IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS ident_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_im_version', 'approve_im_version', 'seal_im_version')
  LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public', fn.proname, fn.ident_args);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', fn.proname, fn.ident_args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', fn.proname, fn.ident_args);
  END LOOP;
END $$;

-- ── (D) Guarded Hot Foreign-Key Indexes ───────────────────────────────────────
DO $$
DECLARE
  idx_spec text[];
  v_specs text[][] := ARRAY[
    ARRAY['im_share_links',            'workspace_item_id',     'idx_im_share_links_workspace_item_id'],
    ARRAY['im_generation_jobs',        'building_id',           'idx_im_generation_jobs_building_id'],
    ARRAY['im_generation_jobs',        'owner_id',              'idx_im_generation_jobs_owner_id'],
    ARRAY['document_objects',          'broker_id',             'idx_document_objects_broker_id'],
    ARRAY['broker_clients',            'building_id',           'idx_broker_clients_building_id'],
    ARRAY['magazine_editions',         'broker_user_id',        'idx_magazine_editions_broker_user_id'],
    ARRAY['magazine_editions',         'deal_id',               'idx_magazine_editions_deal_id'],
    ARRAY['magazine_dispatch_logs',    'edition_id',            'idx_magazine_dispatch_logs_edition_id'],
    ARRAY['magazine_dispatch_logs',    'broker_user_id',        'idx_magazine_dispatch_logs_broker_user_id'],
    ARRAY['magazine_analytics_events', 'broker_user_id',        'idx_magazine_analytics_events_broker_user_id'],
    ARRAY['spaces',                    'building_id',           'idx_spaces_building_id'],
    ARRAY['spaces',                    'building_ssot_lite_id', 'idx_spaces_building_ssot_lite_id'],
    ARRAY['leasing_inquiries',         'building_id',           'idx_leasing_inquiries_building_id']
  ];
  v_tbl text;
  v_col text;
  v_idx text;
BEGIN
  FOREACH idx_spec SLICE 1 IN ARRAY v_specs
  LOOP
    v_tbl := idx_spec[1];
    v_col := idx_spec[2];
    v_idx := idx_spec[3];

    IF EXISTS (
         SELECT 1
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname = v_tbl
           AND c.relkind IN ('r', 'p')
       )
       AND EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = v_tbl
           AND column_name = v_col
       )
    THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)', v_idx, v_tbl, v_col);
    END IF;
  END LOOP;
END $$;

COMMIT;
