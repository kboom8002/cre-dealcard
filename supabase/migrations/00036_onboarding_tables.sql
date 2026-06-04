-- ============================================================
-- Migration: 00036_onboarding_tables.sql
-- Date: 2026-05-31
-- Description: Onboarding sessions & events tables for
--              Shock & Awe onboarding v2
-- ============================================================

-- ── onboarding_sessions ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.onboarding_sessions (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token    TEXT         UNIQUE NOT NULL,
  user_id          UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  role             TEXT         CHECK (role IN ('expert', 'owner')),
  current_stage    TEXT         NOT NULL DEFAULT 'role_select',
  photo_url        TEXT,
  vibe_vector      JSONB,
  complement_vector JSONB,
  vti_type         TEXT,
  matched_template_id TEXT,
  before_scores    JSONB,
  after_scores     JSONB,
  vti_description  TEXT,
  specialty        TEXT,
  region           TEXT,
  radar_address    TEXT,
  first_deal_card_id UUID,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_token
  ON public.onboarding_sessions(session_token);

CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user
  ON public.onboarding_sessions(user_id);

-- ── onboarding_events ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.onboarding_events (
  id           BIGSERIAL    PRIMARY KEY,
  session_id   UUID         REFERENCES public.onboarding_sessions(id) ON DELETE CASCADE,
  event_name   TEXT         NOT NULL,
  event_data   JSONB,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_events_session
  ON public.onboarding_events(session_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_events_name
  ON public.onboarding_events(event_name);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_events   ENABLE ROW LEVEL SECURITY;

-- Service role has unrestricted access (used by API routes)
CREATE POLICY "service_all_onboarding_sessions"
  ON public.onboarding_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_all_onboarding_events"
  ON public.onboarding_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read/update their own session
CREATE POLICY "owner_read_own_session"
  ON public.onboarding_sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "owner_update_own_session"
  ON public.onboarding_sessions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── updated_at trigger ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onboarding_sessions_updated_at ON public.onboarding_sessions;
CREATE TRIGGER trg_onboarding_sessions_updated_at
  BEFORE UPDATE ON public.onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
