-- ============================================================
-- 00032_lease_aipage_bridge.sql
-- Bridge: lease_spaces ↔ spaces (AI Leasing Studio)
-- + campaign_copies table for AI-generated marketing copy
-- ============================================================

-- ── lease_spaces: AI 리싱 페이지 연결 ─────────────────────────
ALTER TABLE lease_spaces
  ADD COLUMN IF NOT EXISTS aipage_space_id uuid REFERENCES spaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lease_spaces_aipage_space_id_idx
  ON lease_spaces(aipage_space_id) WHERE aipage_space_id IS NOT NULL;

-- ── campaign_copies ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_copies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  leasing_page_id uuid REFERENCES leasing_pages(id) ON DELETE SET NULL,
  copy_type       text NOT NULL,  -- kakao, naver_listing, sms, instagram_caption
  target_tenant_type text,
  title           text,
  body            text NOT NULL,
  boundary_note   text,
  status          text NOT NULL DEFAULT 'generated',
  ai_generated    boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_copies_space_id_idx ON campaign_copies(space_id);
CREATE INDEX IF NOT EXISTS campaign_copies_leasing_page_id_idx ON campaign_copies(leasing_page_id);

ALTER TABLE campaign_copies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'campaign_copies' AND policyname = 'campaign_copies_public_select'
  ) THEN
    EXECUTE 'CREATE POLICY "campaign_copies_public_select"
      ON campaign_copies FOR SELECT TO public
      USING (true)';
  END IF;
END $$;

-- ── vibe_fit_results ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vibe_fit_results (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id                  uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  vibe_summary              text,
  vibe_tags                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  vad                       jsonb NOT NULL DEFAULT '{}'::jsonb,
  tenant_vibe_alignment     jsonb NOT NULL DEFAULT '[]'::jsonb,
  mixed_signal_risks        jsonb NOT NULL DEFAULT '[]'::jsonb,
  retrofit_vibe_opportunities jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_evidence          jsonb NOT NULL DEFAULT '[]'::jsonb,
  boundary_note             text,
  confidence                text,
  ai_generated              boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vibe_fit_results_space_id_idx ON vibe_fit_results(space_id);

ALTER TABLE vibe_fit_results ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vibe_fit_results' AND policyname = 'vibe_fit_results_public_select'
  ) THEN
    EXECUTE 'CREATE POLICY "vibe_fit_results_public_select"
      ON vibe_fit_results FOR SELECT TO public
      USING (true)';
  END IF;
END $$;

-- ── tenant_fit_results ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_fit_results (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id                  uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  target_tenant_type        text NOT NULL,
  fit_level                 text,
  fit_score                 numeric,
  strengths                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  check_needed              jsonb NOT NULL DEFAULT '[]'::jsonb,
  weaker_points             jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_facility_checks  jsonb NOT NULL DEFAULT '[]'::jsonb,
  legal_or_permit_checks    jsonb NOT NULL DEFAULT '[]'::jsonb,
  safe_summary              text,
  boundary_note             text,
  confidence                text,
  ai_generated              boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now(),

  UNIQUE (space_id, target_tenant_type)
);

CREATE INDEX IF NOT EXISTS tenant_fit_results_space_id_idx ON tenant_fit_results(space_id);

ALTER TABLE tenant_fit_results ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tenant_fit_results' AND policyname = 'tenant_fit_results_public_select'
  ) THEN
    EXECUTE 'CREATE POLICY "tenant_fit_results_public_select"
      ON tenant_fit_results FOR SELECT TO public
      USING (true)';
  END IF;
END $$;

-- ── leasing_inquiries ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leasing_inquiries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  leasing_page_id uuid REFERENCES leasing_pages(id) ON DELETE SET NULL,
  prospect        jsonb NOT NULL DEFAULT '{}'::jsonb,
  requirement     jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'pending',
  ai_qualification jsonb DEFAULT '{}'::jsonb,
  broker_client_id uuid REFERENCES broker_clients(id) ON DELETE SET NULL,
  tenant_intent_id uuid REFERENCES tenant_intent(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leasing_inquiries_space_id_idx ON leasing_inquiries(space_id);
CREATE INDEX IF NOT EXISTS leasing_inquiries_status_idx ON leasing_inquiries(status);

ALTER TABLE leasing_inquiries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'leasing_inquiries' AND policyname = 'leasing_inquiries_public_insert'
  ) THEN
    EXECUTE 'CREATE POLICY "leasing_inquiries_public_insert"
      ON leasing_inquiries FOR INSERT TO public
      WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'leasing_inquiries' AND policyname = 'leasing_inquiries_public_select'
  ) THEN
    EXECUTE 'CREATE POLICY "leasing_inquiries_public_select"
      ON leasing_inquiries FOR SELECT TO public
      USING (true)';
  END IF;
END $$;
