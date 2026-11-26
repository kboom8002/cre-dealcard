/**
 * @file src/tests/security/wave0c-rls-rpc-lockdown.pglite.test.ts
 * @description Wave 0 Track 0C Hermetic PGlite Verification Suite:
 * Verifies `20261126000001_sota_rls_rpc_and_fk_hardening.sql` (including dual-replay idempotency)
 * and `scripts/policy-scan.mjs` strict gates:
 *   1. 0 base tables (`relkind = 'r'`) in `public` (except `spatial_ref_sys`) have `relrowsecurity = false`.
 *   2. Permissive policies on `leasing_inquiries`, `broker_circle_members`, `circle_match_results`,
 *      `match_results`, `deal_casepacks`, and `deal_pipeline_states` are removed and replaced with strict policies.
 *   3. All `SECURITY DEFINER` functions in `public` have `search_path=public`, and sensitive RPCs
 *      revoke `PUBLIC, anon` execution.
 *   4. `approve_im_version` throws SQLSTATE `40001` (`CAS_CONFLICT`) when `p_expected_content_hash`
 *      mismatches `v_doc.content_hash` without mutating `document_objects`.
 *   5. All 13 hot FK indexes are created idempotently, and `policy-scan.mjs` enforces RLS & allowlist rules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { scanSql, scanFile, NEW_FROM } from '../../../scripts/policy-scan.mjs';

const ROOT = process.cwd();
const readMigration = (name: string) =>
  fs.readFileSync(path.resolve(ROOT, 'supabase/migrations', name), 'utf8');

describe('Wave 0 Track 0C: Emergency DB RLS, RPC Security & Policy Gate (PGlite)', () => {
  let db: PGlite;

  const ACTOR_A = '11111111-1111-4111-8111-111111111111';
  const ACTOR_B = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    db = new PGlite();

    // 1. Minimal Supabase auth + role + helper function prerequisites
    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN;
        END IF;
      END $$;

      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY,
        email TEXT,
        raw_user_meta_data JSONB DEFAULT '{}'::jsonb
      );

      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS UUID
      LANGUAGE sql
      STABLE
      AS $$
        SELECT COALESCE(
          NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid,
          '${ACTOR_A}'::uuid
        )
      $$;

      -- Lightweight shim for gen_random_bytes used by 00067_team_circle_feature.sql
      CREATE OR REPLACE FUNCTION public.gen_random_bytes(len int)
      RETURNS bytea
      LANGUAGE sql
      VOLATILE
      AS $$
        SELECT substring(decode(md5(random()::text || clock_timestamp()::text), 'hex') FROM 1 FOR GREATEST(len, 1))
      $$;

      CREATE OR REPLACE FUNCTION public.set_updated_at()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$;

      -- PostGIS extension table exception check (must remain ignored if present)
      CREATE TABLE IF NOT EXISTS public.spatial_ref_sys (
        srid INTEGER PRIMARY KEY
      );

      -- Core tables referenced by prerequisite migrations
      CREATE TABLE IF NOT EXISTS public.profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT,
        role TEXT NOT NULL DEFAULT 'public_user',
        display_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

      CREATE OR REPLACE FUNCTION public.is_admin()
      RETURNS BOOLEAN
      LANGUAGE plpgsql
      SECURITY DEFINER
      STABLE
      AS $$
      BEGIN
        RETURN EXISTS (
          SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        );
      END;
      $$;

      CREATE TABLE IF NOT EXISTS public.broker_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE
      );
      ALTER TABLE public.broker_profiles ENABLE ROW LEVEL SECURITY;

      CREATE TABLE IF NOT EXISTS public.building_ssot_lite (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID NOT NULL,
        address TEXT,
        status TEXT DEFAULT 'draft',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE public.building_ssot_lite ENABLE ROW LEVEL SECURITY;

      CREATE TABLE IF NOT EXISTS public.buyer_intent_lite (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE public.buyer_intent_lite ENABLE ROW LEVEL SECURITY;

      CREATE TABLE IF NOT EXISTS public.document_objects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        building_id UUID,
        owner_id UUID,
        broker_id UUID,
        document_type TEXT DEFAULT 'mobile_im_lite',
        title TEXT,
        body JSONB DEFAULT '{}'::jsonb,
        status TEXT DEFAULT 'draft',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE public.document_objects ENABLE ROW LEVEL SECURITY;

      CREATE TABLE IF NOT EXISTS public.full_im_handoffs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status TEXT NOT NULL DEFAULT 'created',
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE public.full_im_handoffs ENABLE ROW LEVEL SECURITY;

      CREATE TABLE IF NOT EXISTS public.space_ai_handoffs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid()
      );
      ALTER TABLE public.space_ai_handoffs ENABLE ROW LEVEL SECURITY;

      CREATE TABLE IF NOT EXISTS public.mvp_return_handoffs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid()
      );
      ALTER TABLE public.mvp_return_handoffs ENABLE ROW LEVEL SECURITY;

      CREATE TABLE IF NOT EXISTS public.lease_spaces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        broker_id UUID
      );
      ALTER TABLE public.lease_spaces ENABLE ROW LEVEL SECURITY;

      CREATE TABLE IF NOT EXISTS public.broker_clients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        broker_id UUID,
        building_id TEXT
      );
      ALTER TABLE public.broker_clients ENABLE ROW LEVEL SECURITY;

      CREATE TABLE IF NOT EXISTS public.tenant_intent (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        broker_id UUID
      );
      ALTER TABLE public.tenant_intent ENABLE ROW LEVEL SECURITY;

      -- Hot FK index target tables
      CREATE TABLE IF NOT EXISTS public.im_generation_jobs (
        id TEXT PRIMARY KEY,
        building_id TEXT,
        owner_id UUID,
        user_id UUID
      );
      ALTER TABLE public.im_generation_jobs ENABLE ROW LEVEL SECURITY;

      CREATE TABLE IF NOT EXISTS public.magazine_editions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        broker_user_id UUID,
        deal_id UUID
      );
      ALTER TABLE public.magazine_editions ENABLE ROW LEVEL SECURITY;

      CREATE TABLE IF NOT EXISTS public.magazine_dispatch_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        edition_id TEXT,
        broker_user_id UUID
      );
      ALTER TABLE public.magazine_dispatch_logs ENABLE ROW LEVEL SECURITY;

      CREATE TABLE IF NOT EXISTS public.magazine_analytics_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        broker_user_id UUID
      );
      ALTER TABLE public.magazine_analytics_events ENABLE ROW LEVEL SECURITY;

      -- All 52 previously unprotected live base tables (initially created WITHOUT RLS!)
      -- Group A1: Credential / Internal (5)
      CREATE TABLE public.api_clients (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), api_key TEXT NOT NULL DEFAULT 'secret');
      CREATE TABLE public.api_usage_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), endpoint TEXT);
      CREATE TABLE public.iot_data_stream (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), device_id TEXT);
      CREATE TABLE public.processing_jobs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), job_type TEXT);
      CREATE TABLE public.im_fewshot_usage_log (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), generation_id TEXT);

      -- Group A2: Public Reference / Market / Read (21)
      CREATE TABLE public.location_hierarchy (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), region_code TEXT);
      CREATE TABLE public.zoning_ordinance (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), region_code TEXT);
      CREATE TABLE public.official_land_prices (pnu TEXT, year INT, price_per_sqm BIGINT);
      CREATE TABLE public.land_use_plans (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), pnu TEXT);
      CREATE TABLE public.commercial_district (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), district_code TEXT);
      CREATE TABLE public.external_transactions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), address TEXT);
      CREATE TABLE public.external_news (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT);
      CREATE TABLE public.external_reports (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT);
      CREATE TABLE public.rental_market_data (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), region TEXT);
      CREATE TABLE public.rental_trend_data (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), region TEXT);
      CREATE TABLE public.auction_listings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), case_number TEXT);
      CREATE TABLE public.energy_ratings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), rating TEXT);
      CREATE TABLE public.retrofit_products (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT);
      CREATE TABLE public.im_terminology_rules (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), created_by TEXT, pattern TEXT);
      CREATE TABLE public.market_sentiment_polls (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), broker_id UUID, score INT);
      CREATE TABLE public.social_sentiment (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), keyword TEXT);
      CREATE TABLE public.youtube_trends (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), video_id TEXT);
      CREATE TABLE public.poc_surveys (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID);
      CREATE TABLE public.vendor_reviews (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), vendor_id UUID);
      CREATE TABLE public.share_pages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), custom_subdomain TEXT);
      CREATE TABLE public.teaser_configs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), hook_copy TEXT);

      -- Group A3: Tenant / Broker / Lead (26)
      CREATE TABLE public.buildings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), created_by UUID);
      CREATE TABLE public.spaces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        building_id UUID,
        building_ssot_lite_id UUID,
        created_by UUID
      );
      CREATE TABLE public.space_ssot_snapshots (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), space_id UUID, created_by UUID);
      CREATE TABLE public.leasing_pages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), space_id UUID, created_by UUID);
      CREATE TABLE public.leasing_page_sections (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), page_id UUID);
      CREATE TABLE public.inquiry_qualifications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), space_id UUID);
      CREATE TABLE public.visual_assets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), created_by UUID);
      CREATE TABLE public.visual_albums (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), created_by UUID);
      CREATE TABLE public.visual_album_items (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), album_id UUID);
      CREATE TABLE public.visual_answer_cards (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), created_by UUID);
      CREATE TABLE public.missing_shot_requests (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), space_id UUID);
      CREATE TABLE public.mvp_handoffs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), created_by UUID);
      CREATE TABLE public.organizations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT);
      CREATE TABLE public.lead_scores (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), broker_id UUID, score NUMERIC DEFAULT 0);
      CREATE TABLE public.co_brokerage_requests (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), broker_id UUID);
      CREATE TABLE public.buyer_wishlists (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), buyer_id UUID);
      CREATE TABLE public.content_curations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), broker_id UUID);
      CREATE TABLE public.curation_items (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), curation_id UUID);
      CREATE TABLE public.content_ab_tests (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), curation_id UUID);
      CREATE TABLE public.content_share_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), viewer_id UUID);
      CREATE TABLE public.retrofit_inquiries (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), broker_id UUID);
      CREATE TABLE public.owner_report_history (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), space_id UUID);
      CREATE TABLE public.teaser_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), visitor_fp TEXT);
      CREATE TABLE public.deal_conversion_features (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), broker_id UUID);
      CREATE TABLE public.price_features (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), transaction_price BIGINT DEFAULT 0);
      CREATE TABLE public.buyer_clusters (id SERIAL PRIMARY KEY, label TEXT DEFAULT 'c1');

      -- Unlisted legacy base table to prove the catch-all relkind='r' sweep
      CREATE TABLE public.unlisted_legacy_drift_table (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
    `);

    // 2. Apply real prerequisite migrations
    await db.exec(readMigration('00006_handoff_expiry.sql'));
    await db.exec(readMigration('00008_matching.sql'));
    await db.exec(readMigration('00014_profile_trigger.sql'));
    await db.exec(readMigration('00032_lease_aipage_bridge.sql'));
    await db.exec(readMigration('00067_team_circle_feature.sql'));
    await db.exec(readMigration('20261027000003_p4a_im_versioning.sql'));

    // Add live-snapshot columns & simulate live DB drift (`OR broker_id IS NULL` policies)
    await db.exec(`
      ALTER TABLE public.leasing_inquiries ADD COLUMN IF NOT EXISTS building_id UUID;
      ALTER TABLE public.im_share_links ADD COLUMN IF NOT EXISTS workspace_item_id UUID;

      CREATE POLICY "match_results_null_leak" ON public.match_results
        FOR SELECT TO authenticated USING (broker_id = auth.uid() OR broker_id IS NULL);
      CREATE POLICY "deal_casepacks_null_leak" ON public.deal_casepacks
        FOR ALL TO authenticated USING (broker_id = auth.uid() OR broker_id IS NULL);
      CREATE POLICY "deal_pipeline_null_leak" ON public.deal_pipeline_states
        FOR ALL TO authenticated USING (broker_id = auth.uid() OR broker_id IS NULL);
    `);
  }, 30_000);

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  it('(1) applies 20261126000001 twice idempotently and leaves 0 unprotected base tables in public', async () => {
    // Sanity check before migration: 53 unprotected base tables exist (52 + unlisted_legacy_drift_table)
    const preCheck = await db.query<{ relname: string }>(`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname <> 'spatial_ref_sys'
        AND NOT c.relrowsecurity;
    `);
    expect(preCheck.rows.length).toBeGreaterThanOrEqual(53);

    const hardeningSql = readMigration('20261126000001_sota_rls_rpc_and_fk_hardening.sql');
    // Execute twice in a row to prove 100% idempotency
    await db.exec(hardeningSql);
    await db.exec(hardeningSql);

    const postCheck = await db.query<{ relname: string }>(`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname <> 'spatial_ref_sys'
        AND NOT c.relrowsecurity;
    `);
    expect(postCheck.rows).toEqual([]);

    // Credential/internal table blocks anon & authenticated completely
    await db.exec(`INSERT INTO public.api_clients (api_key) VALUES ('sk_live_top_secret');`);
    await expect(db.exec(`SET LOCAL ROLE anon; SELECT * FROM public.api_clients;`)).rejects.toThrow();
    await expect(db.exec(`SET LOCAL ROLE authenticated; SELECT * FROM public.api_clients;`)).rejects.toThrow();

    // Public reference table allows anon SELECT, blocks anon INSERT
    await db.exec(`INSERT INTO public.official_land_prices (pnu, year, price_per_sqm) VALUES ('1168010100', 2026, 25000000);`);
    const pubRead = await db.exec(`
      SET ROLE anon;
      SELECT pnu FROM public.official_land_prices;
      RESET ROLE;
    `);
    expect((pubRead[1]?.rows as Array<{ pnu: string }>).map((r) => r.pnu)).toEqual(['1168010100']);
    await expect(
      db.exec(`SET LOCAL ROLE anon; INSERT INTO public.official_land_prices (pnu, year, price_per_sqm) VALUES ('999', 2026, 1);`)
    ).rejects.toThrow();

    // Tenant/broker table enforces dynamic authenticated owner isolation
    await db.exec(`
      INSERT INTO public.lead_scores (broker_id, score) VALUES
        ('${ACTOR_A}', 91),
        ('${ACTOR_B}', 42);
    `);
    const ownScores = await db.exec(`
      SET ROLE authenticated;
      SELECT score::int AS score FROM public.lead_scores;
      RESET ROLE;
    `);
    expect((ownScores[1]?.rows as Array<{ score: number }>).map((r) => r.score)).toEqual([91]);
  });

  it('(2) drops permissive policies on leasing_inquiries, broker_circle_members, circle_match_results, and broker_id IS NULL leaks', async () => {
    const hardeningSql = readMigration('20261126000001_sota_rls_rpc_and_fk_hardening.sql');
    await db.exec(hardeningSql);

    // leasing_inquiries: public policies removed, owner select enforced
    const liPols = await db.query<{ policyname: string }>(`
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'leasing_inquiries'
      ORDER BY policyname;
    `);
    const liNames = liPols.rows.map((r) => r.policyname);
    expect(liNames).not.toContain('leasing_inquiries_public_select');
    expect(liNames).not.toContain('leasing_inquiries_public_insert');
    expect(liNames).toContain('leasing_inquiries_owner_select');
    expect(liNames).toContain('leasing_inquiries_service_role_all');

    // broker_circle_members: members_insert removed, members_insert_self_pending blocks role escalation & spoofing
    const bcmPols = await db.query<{ policyname: string }>(`
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'broker_circle_members'
      ORDER BY policyname;
    `);
    const bcmNames = bcmPols.rows.map((r) => r.policyname);
    expect(bcmNames).not.toContain('members_insert');
    expect(bcmNames).toContain('members_insert_self_pending');

    await db.exec(`
      INSERT INTO public.profiles (id, email, role) VALUES
        ('${ACTOR_A}', 'a@broker.kr', 'broker'),
        ('${ACTOR_B}', 'b@broker.kr', 'broker');
      INSERT INTO public.broker_circles (id, name, created_by)
        VALUES ('33333333-3333-4333-8333-333333333333', 'Gangnam Circle', '${ACTOR_B}');
    `);

    // Escalating self to 'owner' as authenticated must be rejected by RLS WITH CHECK
    await expect(
      db.exec(`
        SET LOCAL ROLE authenticated;
        INSERT INTO public.broker_circle_members (circle_id, broker_id, role)
        VALUES ('33333333-3333-4333-8333-333333333333', '${ACTOR_A}', 'owner');
      `)
    ).rejects.toThrow();

    // Inserting another broker_id must be rejected by RLS WITH CHECK
    await expect(
      db.exec(`
        SET LOCAL ROLE authenticated;
        INSERT INTO public.broker_circle_members (circle_id, broker_id, role)
        VALUES ('33333333-3333-4333-8333-333333333333', '${ACTOR_B}', 'member');
      `)
    ).rejects.toThrow();

    // Self-insert as 'member' succeeds
    await db.exec(`
      SET ROLE authenticated;
      INSERT INTO public.broker_circle_members (circle_id, broker_id, role)
      VALUES ('33333333-3333-4333-8333-333333333333', '${ACTOR_A}', 'member');
      RESET ROLE;
    `);

    // circle_match_results: cmatch_insert removed
    const cmrPols = await db.query<{ policyname: string }>(`
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'circle_match_results';
    `);
    expect(cmrPols.rows.map((r) => r.policyname)).not.toContain('cmatch_insert');
    expect(cmrPols.rows.map((r) => r.policyname)).toContain('circle_match_results_service_role_all');

    // match_results, deal_casepacks, deal_pipeline_states: zero `broker_id IS NULL` policies remain
    const nullLeakPols = await db.query<{ tablename: string; policyname: string }>(`
      SELECT tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('match_results', 'deal_casepacks', 'deal_pipeline_states')
        AND (
          COALESCE(qual, '') ~* 'broker_id\\s+is\\s+null'
          OR COALESCE(with_check, '') ~* 'broker_id\\s+is\\s+null'
        );
    `);
    expect(nullLeakPols.rows).toEqual([]);

    // Verify NULL broker_id row in match_results is invisible to authenticated user
    await db.exec(`
      INSERT INTO public.match_results (broker_id, grade, score, stage1_passed) VALUES
        (NULL, 'S', 99, true),
        ('${ACTOR_A}', 'A', 85, true);
    `);
    const mrVisible = await db.exec(`
      SET ROLE authenticated;
      SELECT grade FROM public.match_results;
      RESET ROLE;
    `);
    expect((mrVisible[1]?.rows as Array<{ grade: string }>).map((r) => r.grade)).toEqual(['A']);
  });

  it('(3) locks down all SECURITY DEFINER functions with search_path=public and revokes PUBLIC/anon on sensitive RPCs', async () => {
    const hardeningSql = readMigration('20261126000001_sota_rls_rpc_and_fk_hardening.sql');
    await db.exec(hardeningSql);

    const secDefRes = await db.query<{ proname: string; proconfig: string[] | null }>(`
      SELECT p.proname, p.proconfig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.prosecdef = true
      ORDER BY p.proname;
    `);

    const fnNames = secDefRes.rows.map((r) => r.proname);
    expect(fnNames).toEqual(
      expect.arrayContaining([
        'expire_stale_handoffs',
        'is_admin',
        'my_active_circle_ids',
        'handle_new_user',
        'handle_broker_role_assigned',
      ])
    );

    for (const fn of secDefRes.rows) {
      expect(fn.proconfig ?? [], `SECURITY DEFINER function ${fn.proname} must pin search_path`).toContain(
        'search_path=public'
      );
    }

    // Verify EXECUTE privileges
    const privCheck = await db.query<{
      anon_expire: boolean;
      auth_expire: boolean;
      svc_expire: boolean;
      anon_create: boolean;
      anon_approve: boolean;
      anon_seal: boolean;
      auth_approve: boolean;
      svc_approve: boolean;
    }>(`
      SELECT
        has_function_privilege('anon', 'public.expire_stale_handoffs()', 'EXECUTE') AS anon_expire,
        has_function_privilege('authenticated', 'public.expire_stale_handoffs()', 'EXECUTE') AS auth_expire,
        has_function_privilege('service_role', 'public.expire_stale_handoffs()', 'EXECUTE') AS svc_expire,
        has_function_privilege('anon', 'public.create_im_version(uuid, text, text, jsonb, uuid)', 'EXECUTE') AS anon_create,
        has_function_privilege('anon', 'public.approve_im_version(uuid, text, uuid, text, text)', 'EXECUTE') AS anon_approve,
        has_function_privilege('anon', 'public.seal_im_version(uuid)', 'EXECUTE') AS anon_seal,
        has_function_privilege('authenticated', 'public.approve_im_version(uuid, text, uuid, text, text)', 'EXECUTE') AS auth_approve,
        has_function_privilege('service_role', 'public.approve_im_version(uuid, text, uuid, text, text)', 'EXECUTE') AS svc_approve;
    `);

    expect(privCheck.rows[0]).toEqual({
      anon_expire: false,
      auth_expire: false,
      svc_expire: true,
      anon_create: false,
      anon_approve: false,
      anon_seal: false,
      auth_approve: true,
      svc_approve: true,
    });
  });

  it('(4) enforces CAS_CONFLICT (SQLSTATE 40001) in approve_im_version when expected hash mismatches content_hash', async () => {
    const hardeningSql = readMigration('20261126000001_sota_rls_rpc_and_fk_hardening.sql');
    await db.exec(hardeningSql);

    await db.exec(`INSERT INTO public.profiles (id, email, role) VALUES ('${ACTOR_A}', 'cas@broker.kr', 'broker');`);
    const bRes = await db.query<{ id: string }>(
      `INSERT INTO public.building_ssot_lite (owner_id, address) VALUES ($1, 'Teheran-ro 152') RETURNING id;`,
      [ACTOR_A]
    );
    const buildingId = bRes.rows[0].id;

    const sRes = await db.query<{ id: string }>(
      `INSERT INTO public.im_series (building_id, owner_id, label) VALUES ($1, $2, 'CAS Series') RETURNING id;`,
      [buildingId, ACTOR_A]
    );
    const seriesId = sRes.rows[0].id;

    const vRes = await db.query<{ new_version_id: string }>(
      `SELECT new_version_id FROM public.create_im_version($1, 'generate', 'Draft v1', '{"price": 120}'::jsonb, $2);`,
      [seriesId, ACTOR_A]
    );
    const versionId = vRes.rows[0].new_version_id;

    await db.query(`UPDATE public.document_objects SET content_hash = 'sha256:actual_v1' WHERE id = $1;`, [versionId]);

    // Mismatched expected content_hash -> must throw SQLSTATE 40001 (CAS_CONFLICT) before mutating document_objects
    let caughtErr: (Error & { code?: string }) | null = null;
    try {
      await db.query(
        `SELECT public.approve_im_version($1, 'sha256:stale_expected', $2, 'fact_om', 'Should fail CAS');`,
        [versionId, ACTOR_A]
      );
    } catch (err) {
      caughtErr = err as Error & { code?: string };
    }

    expect(caughtErr).not.toBeNull();
    expect(caughtErr?.code).toBe('40001');
    expect(caughtErr?.message).toMatch(/CAS_CONFLICT/);

    const afterFail = await db.query<{ status: string; sealed_at: string | null }>(
      `SELECT status, sealed_at FROM public.document_objects WHERE id = $1;`,
      [versionId]
    );
    expect(afterFail.rows[0].status).toBe('draft');
    expect(afterFail.rows[0].sealed_at).toBeNull();

    const approvalsAfterFail = await db.query(`SELECT id FROM public.im_approvals WHERE version_id = $1;`, [versionId]);
    expect(approvalsAfterFail.rows).toHaveLength(0);

    // Matching expected content_hash -> succeeds and seals
    const okRes = await db.query<{ approved: boolean }>(
      `SELECT public.approve_im_version($1, 'sha256:actual_v1', $2, 'fact_om', 'CAS matched') AS approved;`,
      [versionId, ACTOR_A]
    );
    expect(okRes.rows[0].approved).toBe(true);

    const afterOk = await db.query<{ status: string; seal_hash: string }>(
      `SELECT status, seal_hash FROM public.document_objects WHERE id = $1;`,
      [versionId]
    );
    expect(afterOk.rows[0]).toEqual({ status: 'published', seal_hash: 'sha256:actual_v1' });
  });

  it('(5) creates all 13 guarded hot FK indexes and enforces policy-scan gates on migrations >= 20261126000001', async () => {
    const hardeningSql = readMigration('20261126000001_sota_rls_rpc_and_fk_hardening.sql');
    await db.exec(hardeningSql);

    const expectedIndexes = [
      'idx_im_share_links_workspace_item_id',
      'idx_im_generation_jobs_building_id',
      'idx_im_generation_jobs_owner_id',
      'idx_document_objects_broker_id',
      'idx_broker_clients_building_id',
      'idx_magazine_editions_broker_user_id',
      'idx_magazine_editions_deal_id',
      'idx_magazine_dispatch_logs_edition_id',
      'idx_magazine_dispatch_logs_broker_user_id',
      'idx_magazine_analytics_events_broker_user_id',
      'idx_spaces_building_id',
      'idx_spaces_building_ssot_lite_id',
      'idx_leasing_inquiries_building_id',
    ];

    const idxRes = await db.query<{ indexname: string }>(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY($1::text[]);
    `, [expectedIndexes]);
    expect(idxRes.rows.map((r) => r.indexname).sort()).toEqual([...expectedIndexes].sort());

    // Verify all repository migrations >= NEW_FROM pass policy-scan with 0 ERRORs
    const migrationsDir = path.resolve(ROOT, 'supabase/migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => /^\d{14}_.*\.sql$/.test(f) && f.slice(0, 14) >= NEW_FROM)
      .sort();
    const repoErrors = files.flatMap((f) => scanFile(f)).filter((f: { level: string }) => f.level === 'ERROR');
    expect(repoErrors).toEqual([]);

    // Synthetic future migration creating a table WITHOUT RLS -> must fail scanSql
    const missingRlsFindings = scanSql(
      `CREATE TABLE public.unprotected_future_table (id uuid primary key);`,
      '20261126000002_future_no_rls.sql'
    );
    expect(missingRlsFindings.some((f: { level: string; cmd: string }) => f.level === 'ERROR' && f.cmd === 'create_table')).toBe(
      true
    );

    // Synthetic future migration with PUBLIC USING (true) on non-allowlisted table -> must fail scanSql
    const badPublicRead = scanSql(
      `
        CREATE TABLE public.private_deals (id uuid primary key);
        ALTER TABLE public.private_deals ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "leak_all" ON public.private_deals FOR SELECT USING (true);
      `,
      '20261126000002_future_public_leak.sql'
    );
    expect(badPublicRead.filter((f: { level: string }) => f.level === 'ERROR')).toHaveLength(1);

    // Allowlisted public reference table with SELECT USING (true) -> passes
    const okAllowlisted = scanSql(
      `CREATE POLICY "official_land_prices_read" ON public.official_land_prices FOR SELECT TO anon, authenticated USING (true);`,
      '20261126000002_future_allowlisted.sql'
    );
    expect(okAllowlisted.filter((f: { level: string }) => f.level === 'ERROR')).toHaveLength(0);
  });

  it('(6) runs cleanly on an empty synthetic PGlite schema without assuming optional tables or columns exist', async () => {
    const bareDb = new PGlite();
    try {
      const hardeningSql = readMigration('20261126000001_sota_rls_rpc_and_fk_hardening.sql');
      await bareDb.exec(hardeningSql);
      await bareDb.exec(hardeningSql);
    } finally {
      await bareDb.close();
    }
  });
});
