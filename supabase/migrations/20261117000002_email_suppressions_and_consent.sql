-- =============================================================================
-- Migration: 20261117000002_email_suppressions_and_consent.sql
-- Purpose:
--   Wave 2 (WP 2-A / WP 2-B / D5):
--   1. Create canonical `public.email_suppressions` table for permanent
--      unsubscribe / hard_bounce / complaint tracking (never purged by 90d cron).
--   2. Reconcile consent audit columns across `public.magazine_subscribers`
--      and `public.broker_clients` (`consent_status`, `consent_source`,
--      `consented_at`, `unsubscribed_at`, `reconfirm_notified_at`, `confirm_token_hash`).
-- =============================================================================

BEGIN;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION
  WHEN feature_not_supported OR undefined_file THEN
    NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash text NOT NULL,
  broker_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'broker'
    CHECK (scope IN ('global', 'broker')),
  reason text NOT NULL
    CHECK (reason IN ('unsubscribe', 'hard_bounce', 'complaint')),
  source text NOT NULL DEFAULT 'unsubscribe_link',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_suppressions_global_hash
  ON public.email_suppressions (email_hash)
  WHERE scope = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_suppressions_broker_hash
  ON public.email_suppressions (broker_id, email_hash)
  WHERE scope = 'broker' AND broker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_suppressions_lookup
  ON public.email_suppressions (email_hash, broker_id);

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppressions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.email_suppressions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.email_suppressions TO service_role;
GRANT SELECT ON TABLE public.email_suppressions TO authenticated;

DROP POLICY IF EXISTS "email_suppressions_service_all" ON public.email_suppressions;
CREATE POLICY "email_suppressions_service_all"
  ON public.email_suppressions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "email_suppressions_broker_read" ON public.email_suppressions;
CREATE POLICY "email_suppressions_broker_read"
  ON public.email_suppressions
  FOR SELECT
  TO authenticated
  USING (broker_id = auth.uid());

ALTER TABLE IF EXISTS public.magazine_subscribers
  ADD COLUMN IF NOT EXISTS consent_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS consent_source text,
  ADD COLUMN IF NOT EXISTS consented_at timestamptz,
  ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconfirm_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirm_token_hash text;

UPDATE public.magazine_subscribers
SET consent_status = CASE
  WHEN status = 'unsubscribed' OR unsubscribed_at IS NOT NULL THEN 'unsubscribed'
  WHEN confirm_status = 'confirmed' THEN 'confirmed'
  ELSE 'pending'
END
WHERE consent_status IS DISTINCT FROM CASE
  WHEN status = 'unsubscribed' OR unsubscribed_at IS NOT NULL THEN 'unsubscribed'
  WHEN confirm_status = 'confirmed' THEN 'confirmed'
  ELSE 'pending'
END;

ALTER TABLE IF EXISTS public.broker_clients
  ADD COLUMN IF NOT EXISTS consent_status text NOT NULL DEFAULT 'unconfirmed',
  ADD COLUMN IF NOT EXISTS consent_source text,
  ADD COLUMN IF NOT EXISTS consented_at timestamptz,
  ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconfirm_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirm_token_hash text;

-- WP-7.4E P0-1: lock down direct PostgREST writes on public.broker_clients.
-- All /broker/clients and /broker/w/inbox writes go through server routes using
-- service_role, preventing direct client-side consent_status='confirmed' or
-- unsubscribed_at=null spoofing.
DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.broker_clients') IS NOT NULL THEN
    ALTER TABLE public.broker_clients ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.broker_clients FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "broker_clients_own_all" ON public.broker_clients;
    DROP POLICY IF EXISTS "broker_clients_own" ON public.broker_clients;
    DROP POLICY IF EXISTS "broker_clients_select_own" ON public.broker_clients;
    DROP POLICY IF EXISTS "broker_clients_service_all" ON public.broker_clients;
    FOR r IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'broker_clients'
        AND cmd <> 'SELECT'
        AND NOT (roles = ARRAY['service_role']::name[])
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.broker_clients', r.policyname);
    END LOOP;
    CREATE POLICY "broker_clients_service_all"
      ON public.broker_clients
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    CREATE POLICY "broker_clients_select_own"
      ON public.broker_clients
      FOR SELECT
      TO authenticated
      USING (broker_id = auth.uid());
    REVOKE ALL ON public.broker_clients FROM PUBLIC, anon;
    REVOKE INSERT, UPDATE, DELETE ON public.broker_clients FROM authenticated;
    GRANT SELECT ON public.broker_clients TO authenticated;
    GRANT ALL ON public.broker_clients TO service_role;
  END IF;
END $$;

-- WP-7.8A NL P0-3: Idempotent historical suppression backfill into public.email_suppressions
-- from existing public.magazine_subscribers and public.broker_clients rows.
DO $$
DECLARE
  has_ms_broker_user_id boolean;
  has_ms_delivery_status boolean;
  has_bc_delivery_status boolean;
  has_broker_profiles boolean;
BEGIN
  IF to_regclass('public.email_suppressions') IS NOT NULL THEN
    -- 1. Backfill from public.magazine_subscribers
    IF to_regclass('public.magazine_subscribers') IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'magazine_subscribers'
          AND column_name = 'broker_user_id'
      ) INTO has_ms_broker_user_id;

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'magazine_subscribers'
          AND column_name = 'email_delivery_status'
      ) INTO has_ms_delivery_status;

      has_broker_profiles := to_regclass('public.broker_profiles') IS NOT NULL;

      IF has_ms_broker_user_id AND has_broker_profiles THEN
        INSERT INTO public.email_suppressions (email_hash, broker_id, scope, reason, source)
        SELECT DISTINCT
          encode(pg_catalog.sha256(convert_to(lower(btrim(ms.subscriber_email)), 'UTF8')), 'hex'),
          COALESCE(ms.broker_user_id, bp.user_id),
          'broker',
          'unsubscribe',
          'migration_backfill'
        FROM public.magazine_subscribers ms
        LEFT JOIN public.broker_profiles bp
          ON ms.broker_user_id IS NULL
         AND (bp.slug = ms.broker_id OR bp.user_id::text = ms.broker_id)
        WHERE ms.subscriber_email IS NOT NULL
          AND btrim(ms.subscriber_email) <> ''
          AND (ms.status = 'unsubscribed' OR ms.unsubscribed_at IS NOT NULL)
          AND COALESCE(ms.broker_user_id, bp.user_id) IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = COALESCE(ms.broker_user_id, bp.user_id)
          )
        ON CONFLICT DO NOTHING;
      ELSIF has_ms_broker_user_id THEN
        INSERT INTO public.email_suppressions (email_hash, broker_id, scope, reason, source)
        SELECT DISTINCT
          encode(pg_catalog.sha256(convert_to(lower(btrim(ms.subscriber_email)), 'UTF8')), 'hex'),
          ms.broker_user_id,
          'broker',
          'unsubscribe',
          'migration_backfill'
        FROM public.magazine_subscribers ms
        WHERE ms.subscriber_email IS NOT NULL
          AND btrim(ms.subscriber_email) <> ''
          AND (ms.status = 'unsubscribed' OR ms.unsubscribed_at IS NOT NULL)
          AND ms.broker_user_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = ms.broker_user_id
          )
        ON CONFLICT DO NOTHING;
      END IF;

      IF has_ms_delivery_status THEN
        EXECUTE $sql$
          INSERT INTO public.email_suppressions (email_hash, broker_id, scope, reason, source)
          SELECT DISTINCT ON (encode(pg_catalog.sha256(convert_to(lower(btrim(ms.subscriber_email)), 'UTF8')), 'hex'))
            encode(pg_catalog.sha256(convert_to(lower(btrim(ms.subscriber_email)), 'UTF8')), 'hex'),
            NULL::uuid,
            'global',
            CASE WHEN ms.email_delivery_status = 'complained' THEN 'complaint' ELSE 'hard_bounce' END,
            'migration_backfill'
          FROM public.magazine_subscribers ms
          WHERE ms.subscriber_email IS NOT NULL
            AND btrim(ms.subscriber_email) <> ''
            AND ms.email_delivery_status IN ('bounced', 'complained')
          ORDER BY
            encode(pg_catalog.sha256(convert_to(lower(btrim(ms.subscriber_email)), 'UTF8')), 'hex'),
            CASE WHEN ms.email_delivery_status = 'complained' THEN 0 ELSE 1 END
          ON CONFLICT DO NOTHING
        $sql$;
      END IF;
    END IF;

    -- 2. Backfill from public.broker_clients
    IF to_regclass('public.broker_clients') IS NOT NULL THEN
      INSERT INTO public.email_suppressions (email_hash, broker_id, scope, reason, source)
      SELECT DISTINCT
        encode(pg_catalog.sha256(convert_to(lower(btrim(bc.email)), 'UTF8')), 'hex'),
        bc.broker_id,
        'broker',
        'unsubscribe',
        'migration_backfill'
      FROM public.broker_clients bc
      WHERE bc.email IS NOT NULL
        AND btrim(bc.email) <> ''
        AND bc.broker_id IS NOT NULL
        AND (
          bc.unsubscribed_at IS NOT NULL
          OR bc.consent_status = 'unsubscribed'
          OR (bc.tags IS NOT NULL AND '수신거부' = ANY(bc.tags))
        )
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = bc.broker_id
        )
      ON CONFLICT DO NOTHING;

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'broker_clients'
          AND column_name = 'email_delivery_status'
      ) INTO has_bc_delivery_status;

      IF has_bc_delivery_status THEN
        EXECUTE $sql$
          INSERT INTO public.email_suppressions (email_hash, broker_id, scope, reason, source)
          SELECT DISTINCT ON (encode(pg_catalog.sha256(convert_to(lower(btrim(bc.email)), 'UTF8')), 'hex'))
            encode(pg_catalog.sha256(convert_to(lower(btrim(bc.email)), 'UTF8')), 'hex'),
            NULL::uuid,
            'global',
            CASE WHEN bc.email_delivery_status = 'complained' THEN 'complaint' ELSE 'hard_bounce' END,
            'migration_backfill'
          FROM public.broker_clients bc
          WHERE bc.email IS NOT NULL
            AND btrim(bc.email) <> ''
            AND bc.email_delivery_status IN ('bounced', 'complained')
          ORDER BY
            encode(pg_catalog.sha256(convert_to(lower(btrim(bc.email)), 'UTF8')), 'hex'),
            CASE WHEN bc.email_delivery_status = 'complained' THEN 0 ELSE 1 END
          ON CONFLICT DO NOTHING
        $sql$;
      END IF;
    END IF;
  END IF;
END $$;

-- WP-7.8A Inbox P1-3: Lock down direct PostgREST writes on public.contact_history
-- (FORCE RLS + service_role write-only + owner-scoped SELECT with parent broker_clients ownership check).
DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.contact_history') IS NOT NULL THEN
    ALTER TABLE public.contact_history ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.contact_history FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "contact_history_own" ON public.contact_history;
    DROP POLICY IF EXISTS "contact_history_service_all" ON public.contact_history;
    DROP POLICY IF EXISTS "contact_history_select_own" ON public.contact_history;
    FOR r IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'contact_history'
        AND cmd <> 'SELECT'
        AND NOT (roles = ARRAY['service_role']::name[])
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.contact_history', r.policyname);
    END LOOP;
    CREATE POLICY "contact_history_service_all"
      ON public.contact_history
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    CREATE POLICY "contact_history_select_own"
      ON public.contact_history
      FOR SELECT
      TO authenticated
      USING (
        broker_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.broker_clients bc
          WHERE bc.id = contact_history.client_id
            AND bc.broker_id = auth.uid()
        )
      );
    REVOKE ALL ON TABLE public.contact_history FROM PUBLIC, anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.contact_history FROM authenticated;
    GRANT SELECT ON TABLE public.contact_history TO authenticated;
    GRANT ALL ON TABLE public.contact_history TO service_role;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.magazine_dispatch_logs
  ADD COLUMN IF NOT EXISTS error_reason text;

DO $$
BEGIN
  IF to_regclass('public.workspace_items') IS NOT NULL THEN
    ALTER TABLE public.workspace_items
      DROP CONSTRAINT IF EXISTS workspace_items_kind_check;
    ALTER TABLE public.workspace_items
      ADD CONSTRAINT workspace_items_kind_check
      CHECK (kind IN ('dealcard', 'im', 'magazine'));
  END IF;
END $$;

-- WP-7.7B P0-1: PostgREST privilege & FORCE RLS lockdown on magazine_* tables.
-- 1. anon has ZERO direct PostgREST access (public reads go through Next.js service_role routes after masking).
-- 2. authenticated has owner-scoped SELECT ONLY (no direct INSERT/UPDATE/DELETE consent or publish-gate bypass).
DO $$
DECLARE
  t text;
  r record;
  has_broker_user_id boolean;
  has_broker_id boolean;
  owner_expr text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'magazine_subscribers',
    'magazine_editions',
    'magazine_issues',
    'magazine_dispatch_logs'
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

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = t
          AND column_name = 'broker_user_id'
      ) INTO has_broker_user_id;

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = t
          AND column_name = 'broker_id'
      ) INTO has_broker_id;

      IF has_broker_user_id AND has_broker_id THEN
        owner_expr := '(broker_user_id = auth.uid() OR broker_id = auth.uid()::text OR EXISTS (SELECT 1 FROM public.broker_profiles bp WHERE bp.user_id = auth.uid() AND (bp.slug = broker_id OR bp.user_id::text = broker_id)))';
      ELSIF has_broker_user_id THEN
        owner_expr := '(broker_user_id = auth.uid())';
      ELSIF has_broker_id THEN
        owner_expr := '(broker_id = auth.uid()::text OR EXISTS (SELECT 1 FROM public.broker_profiles bp WHERE bp.user_id = auth.uid() AND (bp.slug = broker_id OR bp.user_id::text = broker_id)))';
      ELSE
        owner_expr := 'false';
      END IF;

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
        t || '_select_own',
        t,
        owner_expr
      );

      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', t);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.%I FROM authenticated', t);
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
