-- =============================================================================
-- Migration: 20261117000001_workspace_items_and_drift_fix.sql
-- Purpose:
--   Wave 1 (WP 1-A / Decision D1):
--   1. Create canonical `public.workspace_items` table as DB SSoT for broker
--      DealCard & IM drafts, published snapshots, correction notices, and soft deletes.
--   2. Ensure `public.in_app_notifications` exists with user-scoped RLS.
--   3. Idempotently reconcile 3-way schema drift columns & indexes across
--      `im_share_links`, `broker_clients`, `activity_events`, `im_inquiry_requests`,
--      `user_subscriptions`, and `magazine_subscribers`.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── 1. public.workspace_items (D1) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workspace_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('dealcard', 'im')),
  legacy_id text,
  building_id uuid REFERENCES public.building_ssot_lite(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'sent', 'revoked', 'archived')),
  title text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  price_band text,
  draft_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_snapshot jsonb,
  correction_notice jsonb,
  version integer NOT NULL DEFAULT 1,
  doc_hash text,
  published_at timestamptz,
  revoked_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_items_owner_kind_active
  ON public.workspace_items (owner_id, kind, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_items_building_kind
  ON public.workspace_items (building_id, kind)
  WHERE building_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_items_legacy_id
  ON public.workspace_items (legacy_id)
  WHERE legacy_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_items_owner_kind_legacy
  ON public.workspace_items (owner_id, kind, legacy_id)
  WHERE legacy_id IS NOT NULL;

DROP INDEX IF EXISTS public.uq_workspace_items_kind_legacy_non_demo;
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_items_kind_legacy_non_demo
  ON public.workspace_items (kind, legacy_id)
  WHERE deleted_at IS NULL
    AND legacy_id IS NOT NULL
    AND legacy_id NOT IN ('bld-01', 'bld-02', 'bld-03', 'im-doc-01', 'im-doc-02', 'im-doc-03');

DROP TRIGGER IF EXISTS workspace_items_updated_at ON public.workspace_items;
CREATE TRIGGER workspace_items_updated_at
  BEFORE UPDATE ON public.workspace_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.workspace_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_items FORCE ROW LEVEL SECURITY;

-- WP-7.3C P1-3 (publish-gate integrity): all workspace_items writes go through
-- service-role server code that enforces the statutory / blind-guard / price-band
-- publish gates. Authenticated brokers get owner-scoped READ only — a broker JWT
-- must never be able to set status='sent' or write a raw published_snapshot.
-- anon gets NO access: public /dc, /im-lite and OG reads are served by
-- service-role server code (deal-public-guard / getPublicWorkspaceProjection),
-- so a direct anon grant would only allow cross-tenant enumeration of
-- owner_id / building_id / published snapshots.
REVOKE ALL ON TABLE public.workspace_items FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.workspace_items TO service_role;
GRANT SELECT ON TABLE public.workspace_items TO authenticated;

DROP POLICY IF EXISTS "workspace_items_service_all" ON public.workspace_items;
CREATE POLICY "workspace_items_service_all"
  ON public.workspace_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "workspace_items_owner_all" ON public.workspace_items;
DROP POLICY IF EXISTS "workspace_items_owner_select" ON public.workspace_items;
CREATE POLICY "workspace_items_owner_select"
  ON public.workspace_items
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "workspace_items_public_published_read" ON public.workspace_items;

-- ── 2. public.in_app_notifications ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'system',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_created
  ON public.in_app_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_unread
  ON public.in_app_notifications (user_id, is_read, created_at DESC);

ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.in_app_notifications TO service_role;
GRANT SELECT, UPDATE ON TABLE public.in_app_notifications TO authenticated;

DROP POLICY IF EXISTS "in_app_notifications_service_all" ON public.in_app_notifications;
CREATE POLICY "in_app_notifications_service_all"
  ON public.in_app_notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "in_app_notifications_owner_select" ON public.in_app_notifications;
CREATE POLICY "in_app_notifications_owner_select"
  ON public.in_app_notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "in_app_notifications_owner_update" ON public.in_app_notifications;
CREATE POLICY "in_app_notifications_owner_update"
  ON public.in_app_notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 3. Schema drift reconciliation ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.im_share_links (
  token text PRIMARY KEY,
  building_id text,
  workspace_item_id uuid REFERENCES public.workspace_items(id) ON DELETE SET NULL,
  broker_id uuid,
  created_by uuid,
  recipient_id text,
  kind text DEFAULT 'im',
  channel text,
  status text NOT NULL DEFAULT 'active',
  revoked_reason text,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.im_share_links
  ADD COLUMN IF NOT EXISTS building_id text,
  ADD COLUMN IF NOT EXISTS workspace_item_id uuid REFERENCES public.workspace_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS broker_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS recipient_id text,
  ADD COLUMN IF NOT EXISTS kind text DEFAULT 'im',
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS revoked_reason text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$
DECLARE
  r record;
  fk record;
BEGIN
  IF to_regclass('public.im_share_links') IS NOT NULL THEN
    -- WP-7.8B Inbox P0-1: Reconcile 20261027000003 column drift idempotently:
    -- 1) Drop NOT NULL on series_id so standalone / non-series share links can insert.
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'im_share_links'
        AND column_name = 'series_id'
    ) THEN
      ALTER TABLE public.im_share_links ALTER COLUMN series_id DROP NOT NULL;
    END IF;

    -- 2) Convert uuid recipient_id to text so non-UUID CRM thread IDs ("cli-123", "custom_*") persist cleanly.
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'im_share_links'
        AND column_name = 'recipient_id'
        AND data_type = 'uuid'
    ) THEN
      FOR fk IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid
         AND a.attnum = ANY (c.conkey)
        WHERE c.conrelid = 'public.im_share_links'::regclass
          AND a.attname = 'recipient_id'
          AND c.contype IN ('f', 'c')
      LOOP
        EXECUTE format('ALTER TABLE public.im_share_links DROP CONSTRAINT IF EXISTS %I', fk.conname);
      END LOOP;
      DROP INDEX IF EXISTS public.idx_im_share_links_recipient_id;
      ALTER TABLE public.im_share_links
        ALTER COLUMN recipient_id TYPE text USING recipient_id::text;
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_im_share_links_token_uidx
      ON public.im_share_links (token);
    CREATE INDEX IF NOT EXISTS idx_im_share_links_building_status
      ON public.im_share_links (building_id, status);
    CREATE INDEX IF NOT EXISTS idx_im_share_links_broker_created
      ON public.im_share_links (broker_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_im_share_links_recipient_id
      ON public.im_share_links (recipient_id)
      WHERE recipient_id IS NOT NULL;

    -- WP-7.8B Inbox P0-1: Lock down direct PostgREST writes on public.im_share_links.
    -- All share-link issuance/revocation/restore mutations run server-side via service_role;
    -- authenticated brokers get owner-scoped SELECT only; anon gets zero direct table access.
    ALTER TABLE public.im_share_links ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.im_share_links FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Brokers can view own im_share_links" ON public.im_share_links;
    DROP POLICY IF EXISTS "Brokers can insert own im_share_links" ON public.im_share_links;
    DROP POLICY IF EXISTS "Brokers can update own im_share_links" ON public.im_share_links;
    DROP POLICY IF EXISTS "im_share_links_select_all" ON public.im_share_links;
    DROP POLICY IF EXISTS "im_share_links_broker_select_own" ON public.im_share_links;
    DROP POLICY IF EXISTS "im_share_links_broker_update_own" ON public.im_share_links;
    DROP POLICY IF EXISTS "im_share_links_select_own" ON public.im_share_links;
    DROP POLICY IF EXISTS "im_share_links_service_all" ON public.im_share_links;
    FOR r IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'im_share_links'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.im_share_links', r.policyname);
    END LOOP;

    CREATE POLICY "im_share_links_service_all"
      ON public.im_share_links
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);

    CREATE POLICY "im_share_links_select_own"
      ON public.im_share_links
      FOR SELECT
      TO authenticated
      USING (broker_id = auth.uid() OR created_by = auth.uid());

    REVOKE ALL ON TABLE public.im_share_links FROM PUBLIC, anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.im_share_links FROM authenticated;
    GRANT SELECT ON TABLE public.im_share_links TO authenticated;
    GRANT ALL ON TABLE public.im_share_links TO service_role;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.broker_clients
  ADD COLUMN IF NOT EXISTS bounce_reason text,
  ADD COLUMN IF NOT EXISTS unsubscribe_at timestamptz,
  ADD COLUMN IF NOT EXISTS crm_status text DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS budget text,
  ADD COLUMN IF NOT EXISTS preferred_region text,
  ADD COLUMN IF NOT EXISTS building_id text,
  ADD COLUMN IF NOT EXISTS building_title text,
  ADD COLUMN IF NOT EXISTS transactional_basis text,
  ADD COLUMN IF NOT EXISTS grade text;

DO $$
BEGIN
  IF to_regclass('public.broker_clients') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_broker_clients_broker_created
      ON public.broker_clients (broker_id, created_at DESC);
  END IF;
END $$;

ALTER TABLE IF EXISTS public.activity_events
  ADD COLUMN IF NOT EXISTS building_id text,
  ADD COLUMN IF NOT EXISTS building_ssot_lite_id uuid;

DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.activity_events') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_activity_events_actor_type_created
      ON public.activity_events (actor_id, event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_events_building_type_created
      ON public.activity_events (building_id, event_type, created_at DESC)
      WHERE building_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_activity_events_entity_type_created
      ON public.activity_events (entity_id, event_type, created_at DESC)
      WHERE entity_id IS NOT NULL;

    -- WP-7.4E P0-1: lock down direct PostgREST writes on public.activity_events.
    -- All legitimate event writes run server-side via service_role; authenticated
    -- brokers get owner-scoped SELECT only so client JWTs can never forge events.
    ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.activity_events FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "events_insert_authenticated" ON public.activity_events;
    DROP POLICY IF EXISTS "events_insert_anon" ON public.activity_events;
    DROP POLICY IF EXISTS "activity_events_insert_anon" ON public.activity_events;
    DROP POLICY IF EXISTS "activity_events_insert_system" ON public.activity_events;
    DROP POLICY IF EXISTS "events_select_own" ON public.activity_events;
    DROP POLICY IF EXISTS "events_service_all" ON public.activity_events;
    FOR r IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'activity_events'
        AND cmd <> 'SELECT'
        AND NOT (roles = ARRAY['service_role']::name[])
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.activity_events', r.policyname);
    END LOOP;
    CREATE POLICY "events_service_all"
      ON public.activity_events
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    CREATE POLICY "events_select_own"
      ON public.activity_events
      FOR SELECT
      TO authenticated
      USING (actor_id = auth.uid());
    REVOKE ALL ON public.activity_events FROM PUBLIC, anon;
    REVOKE INSERT, UPDATE, DELETE ON public.activity_events FROM authenticated;
    GRANT SELECT ON public.activity_events TO authenticated;
    GRANT ALL ON public.activity_events TO service_role;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.im_inquiry_requests
  ADD COLUMN IF NOT EXISTS notification_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'submitted';

DO $$
BEGIN
  IF to_regclass('public.im_inquiry_requests') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_im_inquiry_requests_broker_created
      ON public.im_inquiry_requests (broker_user_id, created_at DESC);
  END IF;
END $$;

ALTER TABLE IF EXISTS public.user_subscriptions
  ADD COLUMN IF NOT EXISTS monthly_dealcard_limit integer DEFAULT 10;

ALTER TABLE IF EXISTS public.magazine_subscribers
  ADD COLUMN IF NOT EXISTS interest_tags text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS broker_user_id uuid;

DO $$
BEGIN
  IF to_regclass('public.gate_requests') IS NOT NULL THEN
    ALTER TABLE public.gate_requests DROP CONSTRAINT IF EXISTS gate_requests_status_check;
    ALTER TABLE public.gate_requests
      ADD CONSTRAINT gate_requests_status_check
      CHECK (status IN ('submitted', 'broker_review', 'approved', 'rejected', 'expired', 'revoked'));
  END IF;
END $$;

-- ── 4. Tighten P4a IM versioning RLS policies from USING (true) to owner-scoped ─
DO $$
BEGIN
  IF to_regclass('public.im_input_snapshots') IS NOT NULL THEN
    ALTER TABLE public.im_input_snapshots ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "im_input_snapshots_select_authenticated" ON public.im_input_snapshots;
    DROP POLICY IF EXISTS "im_input_snapshots_service_all" ON public.im_input_snapshots;
    CREATE POLICY "im_input_snapshots_service_all"
      ON public.im_input_snapshots
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    DROP POLICY IF EXISTS "im_input_snapshots_owner_select" ON public.im_input_snapshots;
    CREATE POLICY "im_input_snapshots_owner_select"
      ON public.im_input_snapshots
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.building_ssot_lite b
          WHERE b.id = im_input_snapshots.building_id AND b.owner_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.im_series s
          WHERE s.id = im_input_snapshots.series_id AND s.owner_id = auth.uid()
        )
      );
  END IF;

  IF to_regclass('public.im_approvals') IS NOT NULL THEN
    ALTER TABLE public.im_approvals ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "im_approvals_select_authenticated" ON public.im_approvals;
    DROP POLICY IF EXISTS "im_approvals_insert_authenticated" ON public.im_approvals;
    DROP POLICY IF EXISTS "im_approvals_service_all" ON public.im_approvals;
    CREATE POLICY "im_approvals_service_all"
      ON public.im_approvals
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    DROP POLICY IF EXISTS "im_approvals_owner_select" ON public.im_approvals;
    CREATE POLICY "im_approvals_owner_select"
      ON public.im_approvals
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.document_objects d
          LEFT JOIN public.building_ssot_lite b ON b.id = d.building_id
          WHERE d.id = im_approvals.version_id
            AND (d.owner_id = auth.uid() OR b.owner_id = auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM public.im_series s
          WHERE s.id = im_approvals.series_id AND s.owner_id = auth.uid()
        )
      );
    DROP POLICY IF EXISTS "im_approvals_owner_insert" ON public.im_approvals;
    CREATE POLICY "im_approvals_owner_insert"
      ON public.im_approvals
      FOR INSERT
      TO authenticated
      WITH CHECK (
        (actor_id IS NULL OR actor_id = auth.uid())
        AND (
          EXISTS (
            SELECT 1 FROM public.document_objects d
            LEFT JOIN public.building_ssot_lite b ON b.id = d.building_id
            WHERE d.id = im_approvals.version_id
              AND (d.owner_id = auth.uid() OR b.owner_id = auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM public.im_series s
            WHERE s.id = im_approvals.series_id AND s.owner_id = auth.uid()
          )
        )
      );
  END IF;

  IF to_regclass('public.im_renditions') IS NOT NULL THEN
    ALTER TABLE public.im_renditions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "im_renditions_select_authenticated" ON public.im_renditions;
    DROP POLICY IF EXISTS "im_renditions_service_all" ON public.im_renditions;
    CREATE POLICY "im_renditions_service_all"
      ON public.im_renditions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    DROP POLICY IF EXISTS "im_renditions_owner_select" ON public.im_renditions;
    CREATE POLICY "im_renditions_owner_select"
      ON public.im_renditions
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.document_objects d
          LEFT JOIN public.building_ssot_lite b ON b.id = d.building_id
          WHERE d.id = im_renditions.version_id
            AND (d.owner_id = auth.uid() OR b.owner_id = auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM public.im_series s
          WHERE s.id = im_renditions.series_id AND s.owner_id = auth.uid()
        )
      );
  END IF;

  IF to_regclass('public.im_studio_states') IS NOT NULL THEN
    ALTER TABLE public.im_studio_states ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "im_studio_states_select_authenticated" ON public.im_studio_states;
    DROP POLICY IF EXISTS "im_studio_states_all_authenticated" ON public.im_studio_states;
    DROP POLICY IF EXISTS "im_studio_states_service_all" ON public.im_studio_states;
    CREATE POLICY "im_studio_states_service_all"
      ON public.im_studio_states
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    DROP POLICY IF EXISTS "im_studio_states_owner_all" ON public.im_studio_states;
    CREATE POLICY "im_studio_states_owner_all"
      ON public.im_studio_states
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.document_objects d
          LEFT JOIN public.building_ssot_lite b ON b.id = d.building_id
          WHERE d.id = im_studio_states.version_id
            AND (d.owner_id = auth.uid() OR b.owner_id = auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM public.im_series s
          WHERE s.id = im_studio_states.series_id AND s.owner_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.document_objects d
          LEFT JOIN public.building_ssot_lite b ON b.id = d.building_id
          WHERE d.id = im_studio_states.version_id
            AND (d.owner_id = auth.uid() OR b.owner_id = auth.uid())
        )
        OR EXISTS (
          SELECT 1 FROM public.im_series s
          WHERE s.id = im_studio_states.series_id AND s.owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── 5. Phase 2 Schema-Drift Reconciliation (im_pro_grants, im_generation_jobs, external_data_cache, share_link, bookings) ─
ALTER TABLE IF EXISTS public.im_pro_grants
  ADD COLUMN IF NOT EXISTS download_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_downloads integer NOT NULL DEFAULT 5;

ALTER TABLE IF EXISTS public.im_generation_jobs
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS error text;

ALTER TABLE IF EXISTS public.external_data_cache
  ADD COLUMN IF NOT EXISTS registry_data jsonb,
  ADD COLUMN IF NOT EXISTS registry_fetched_at timestamptz;

CREATE TABLE IF NOT EXISTS public.share_link (
  token text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  deal_id uuid NOT NULL,
  deal_version integer NOT NULL DEFAULT 1,
  tier text NOT NULL CHECK (tier IN ('teaser', 'basic')),
  broker_id uuid NOT NULL,
  recipient_id uuid,
  distinct_viewers integer NOT NULL DEFAULT 0,
  contaminated boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.share_link ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.share_link FROM PUBLIC, anon;
GRANT ALL ON TABLE public.share_link TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.share_link TO authenticated;

DROP POLICY IF EXISTS "share_link_service_all" ON public.share_link;
CREATE POLICY "share_link_service_all"
  ON public.share_link
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "share_link_owner_all" ON public.share_link;
CREATE POLICY "share_link_owner_all"
  ON public.share_link
  FOR ALL
  TO authenticated
  USING (broker_id = auth.uid())
  WITH CHECK (broker_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.party (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  owner_broker_id uuid NOT NULL,
  name text NOT NULL,
  phone_e164 text NOT NULL,
  email text,
  entity_type text CHECK (entity_type IN ('individual', 'corp', 'fund', 'agent')),
  consent_version text NOT NULL,
  consent_at timestamptz NOT NULL,
  retention_until date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone_e164)
);

ALTER TABLE IF EXISTS public.party
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS owner_broker_id uuid,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS consent_version text,
  ADD COLUMN IF NOT EXISTS consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS retention_until date;

ALTER TABLE public.party ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.party FROM PUBLIC, anon;
GRANT ALL ON TABLE public.party TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.party TO authenticated;

DROP POLICY IF EXISTS "party_service_all" ON public.party;
CREATE POLICY "party_service_all"
  ON public.party
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "party_owner_all" ON public.party;
CREATE POLICY "party_owner_all"
  ON public.party
  FOR ALL
  TO authenticated
  USING (owner_broker_id = auth.uid())
  WITH CHECK (owner_broker_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  building_id uuid,
  slot_date date NOT NULL DEFAULT CURRENT_DATE,
  slot_start timestamptz NOT NULL DEFAULT now(),
  slot_end timestamptz NOT NULL DEFAULT now(),
  slot_type text NOT NULL DEFAULT 'standard',
  status text NOT NULL DEFAULT 'available',
  held_by uuid,
  held_until timestamptz,
  price_band text,
  exact_price integer,
  recurrence_rule text,
  capacity integer DEFAULT 1,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES public.availability_slots(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL,
  booked_by uuid,
  buyer_intent_id uuid,
  status text NOT NULL DEFAULT 'hold'
    CHECK (status IN ('hold', 'confirmed', 'completed', 'cancelled', 'no_show')),
  hold_expires_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  gate_request_id uuid,
  match_result_id uuid,
  fit_score integer,
  quoted_price integer,
  deposit_amount integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.bookings FROM PUBLIC, anon;
GRANT ALL ON TABLE public.bookings TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.bookings TO authenticated;

DROP POLICY IF EXISTS "bookings_service_all" ON public.bookings;
CREATE POLICY "bookings_service_all"
  ON public.bookings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "bookings_owner_select" ON public.bookings;
CREATE POLICY "bookings_owner_select"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (
    requester_id = auth.uid()
    OR booked_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.availability_slots s
      WHERE s.id = bookings.slot_id AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "bookings_owner_insert" ON public.bookings;
CREATE POLICY "bookings_owner_insert"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid() OR booked_by = auth.uid());

DROP POLICY IF EXISTS "bookings_owner_update" ON public.bookings;
CREATE POLICY "bookings_owner_update"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (
    requester_id = auth.uid()
    OR booked_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.availability_slots s
      WHERE s.id = bookings.slot_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    requester_id = auth.uid()
    OR booked_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.availability_slots s
      WHERE s.id = bookings.slot_id AND s.owner_id = auth.uid()
    )
  );

-- ── 7. track_event Partitions (2026-11+, 2027 & DEFAULT Safety Net) ───────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_partitioned_table pt
    JOIN pg_class c ON c.oid = pt.partrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'track_event'
  ) THEN
    CREATE TABLE IF NOT EXISTS public.track_event_2026_11 PARTITION OF public.track_event
      FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
    CREATE TABLE IF NOT EXISTS public.track_event_2026_12 PARTITION OF public.track_event
      FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
    CREATE TABLE IF NOT EXISTS public.track_event_2027 PARTITION OF public.track_event
      FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');
    IF to_regclass('public.track_event_default') IS NULL THEN
      CREATE TABLE public.track_event_default PARTITION OF public.track_event DEFAULT;
    END IF;
  END IF;
END
$$;

-- ── 8. Atomic Pro IM Grant Download Quota RPC ────────────────────────────────
CREATE OR REPLACE FUNCTION public.consume_im_pro_grant_download(
  p_grant_id uuid,
  p_default_max integer DEFAULT 5
)
RETURNS TABLE (id uuid, download_count integer, max_downloads integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.im_pro_grants AS g
     SET download_count = COALESCE(g.download_count, 0) + 1
   WHERE g.id = p_grant_id
     AND COALESCE(g.download_count, 0) < COALESCE(NULLIF(g.max_downloads, 0), GREATEST(1, COALESCE(p_default_max, 5)))
  RETURNING g.id, g.download_count, COALESCE(NULLIF(g.max_downloads, 0), GREATEST(1, COALESCE(p_default_max, 5)));
END;
$$;

REVOKE ALL ON FUNCTION public.consume_im_pro_grant_download(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_im_pro_grant_download(uuid, integer) TO service_role;

-- ── 9. usage_counters.feature_name CHECK constraint alignment (ai_generation_daily) ──
DO $$
BEGIN
  IF to_regclass('public.usage_counters') IS NOT NULL THEN
    ALTER TABLE public.usage_counters DROP CONSTRAINT IF EXISTS usage_counters_feature_name_check;
    ALTER TABLE public.usage_counters ADD CONSTRAINT usage_counters_feature_name_check
      CHECK (feature_name IN (
        'deal_card_creation','ai_matching','im_generation','ai_generation_daily',
        'service_card_creation','vendor_lead_contact'
      ));
  END IF;
END
$$;

-- ── 10. building_signal_cards.status CHECK constraint alignment (WP-7.6 P1-1) ──
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'building_signal_cards'
  ) THEN
    ALTER TABLE public.building_signal_cards DROP CONSTRAINT IF EXISTS building_signal_cards_status_check;
    ALTER TABLE public.building_signal_cards ADD CONSTRAINT building_signal_cards_status_check
      CHECK (status IN (
        'draft',
        'disclosure_checked',
        'broker_reviewed',
        'approved_internal',
        'shared_external',
        'published',
        'active',
        'archived'
      ));
  END IF;
END
$$;

COMMIT;
