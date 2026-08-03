-- 0301_distribution_identity_schema.sql  
-- CREDEAL Distribution & Identity System — 3-Layer Identity Model
-- Spec reference: docs/DISTRIBUTION_AND_IDENTITY.md §3

-- ── Viewer (anonymous browser/device) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.viewer (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ua_class      TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON COLUMN public.viewer.ua_class IS
  '오염 탐지 및 렌더 분기 전용. 재식별 가능한 지문 저장 금지.';

-- ── Recipient (broker-declared target) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.recipient (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  broker_id     UUID NOT NULL,
  label         TEXT NOT NULL,
  contact_hint  TEXT,
  party_id      UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Party (verified identity with consent) ───────────────────────
CREATE TABLE IF NOT EXISTS public.party (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL,
  owner_broker_id  UUID NOT NULL,
  name             TEXT NOT NULL,
  phone_e164       TEXT NOT NULL,
  email            TEXT,
  entity_type      TEXT CHECK (entity_type IN ('individual','corp','fund','agent')),
  consent_version  TEXT NOT NULL,
  consent_at       TIMESTAMPTZ NOT NULL,
  retention_until  DATE NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, phone_e164)
);

-- ── Share Link (teaser/basic distribution) ───────────────────────
CREATE TABLE IF NOT EXISTS public.share_link (
  token             TEXT PRIMARY KEY,
  tenant_id         UUID NOT NULL,
  deal_id           UUID NOT NULL,
  deal_version      INT NOT NULL DEFAULT 1,
  tier              TEXT NOT NULL CHECK (tier IN ('teaser','basic')),
  broker_id         UUID NOT NULL,
  recipient_id      UUID REFERENCES public.recipient(id),
  distinct_viewers  INT NOT NULL DEFAULT 0,
  contaminated      BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at        TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_share_link_deal_tier ON public.share_link (deal_id, tier);
CREATE INDEX IF NOT EXISTS idx_share_link_recipient ON public.share_link (recipient_id) WHERE recipient_id IS NOT NULL;

-- ── Buyer Condition (append-only snapshots) ──────────────────────
CREATE TABLE IF NOT EXISTS public.buyer_condition (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id     UUID NOT NULL REFERENCES public.party(id) ON DELETE CASCADE,
  source       TEXT NOT NULL CHECK (source IN ('gate_form','grant_form','slider','broker_note')),
  confidence   TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
  budget_band  TEXT,
  regions      TEXT[],
  asset_types  TEXT[],
  purpose      TEXT,
  financing    TEXT,
  observed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_buyer_condition_party ON public.buyer_condition (party_id, observed_at DESC);
COMMENT ON TABLE public.buyer_condition IS
  '갱신하지 않고 누적한다. 최신 = observed_at 최대 + confidence 최고 조합.';

-- ── Grant Pass (Pro viewing permission) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.grant_pass (
  token          TEXT PRIMARY KEY,
  tenant_id      UUID NOT NULL,
  deal_id        UUID NOT NULL,
  deal_version   INT NOT NULL DEFAULT 1,
  party_id       UUID NOT NULL REFERENCES public.party(id),
  issued_by      UUID NOT NULL,
  nda_signed_at  TIMESTAMPTZ NOT NULL,
  watermark_ref  TEXT NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  revoked_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_grant_pass_deal ON public.grant_pass (deal_id);
CREATE INDEX IF NOT EXISTS idx_grant_pass_party ON public.grant_pass (party_id);

-- ── Track Event (append-only, monthly partitioned) ───────────────
CREATE TABLE IF NOT EXISTS public.track_event (
  id           BIGSERIAL,
  tenant_id    UUID NOT NULL,
  deal_id      UUID NOT NULL,
  kind         TEXT NOT NULL,
  viewer_id    UUID,
  share_token  TEXT,
  grant_token  TEXT,
  party_id     UUID,
  payload      JSONB NOT NULL DEFAULT '{}',
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (occurred_at);

-- Pre-create 3 months of partitions
CREATE TABLE IF NOT EXISTS public.track_event_2026_08 PARTITION OF public.track_event
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS public.track_event_2026_09 PARTITION OF public.track_event
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS public.track_event_2026_10 PARTITION OF public.track_event
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE INDEX IF NOT EXISTS idx_track_event_deal ON public.track_event (deal_id, kind);
CREATE INDEX IF NOT EXISTS idx_track_event_viewer ON public.track_event (viewer_id) WHERE viewer_id IS NOT NULL;

-- ── RLS Policies ─────────────────────────────────────────────────
ALTER TABLE public.party           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_condition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipient       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_link      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_pass      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viewer          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_event     ENABLE ROW LEVEL SECURITY;

-- Party: only owner broker can access
CREATE POLICY party_owner_only ON public.party
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR (
      tenant_id = (auth.jwt() ->> 'tenant_id')::UUID
      AND owner_broker_id = auth.uid()
    )
  );

-- Buyer Condition: via party ownership
CREATE POLICY condition_via_party ON public.buyer_condition
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.party p
      WHERE p.id = buyer_condition.party_id
        AND p.owner_broker_id = auth.uid()
    )
  );

-- Recipient: only creating broker
CREATE POLICY recipient_broker_only ON public.recipient
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR broker_id = auth.uid()
  );

-- Share Link: only creating broker
CREATE POLICY share_link_broker_only ON public.share_link
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR broker_id = auth.uid()
  );

-- Grant Pass: service role only (accessed via API routes)
CREATE POLICY grant_pass_service ON public.grant_pass
  FOR ALL
  USING (auth.role() = 'service_role');

-- Viewer: service role only (created by tracking API)
CREATE POLICY viewer_service ON public.viewer
  FOR ALL
  USING (auth.role() = 'service_role');

-- Track Event: service role only (fire-and-forget insert)
CREATE POLICY track_event_service ON public.track_event
  FOR ALL
  USING (auth.role() = 'service_role');
