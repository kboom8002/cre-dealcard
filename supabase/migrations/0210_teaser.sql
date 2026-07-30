-- 0210_teaser.sql
-- CREDEAL v3 Phase 2: Teaser module tables

CREATE TABLE IF NOT EXISTS teaser_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID,
  asset_id UUID,
  banding_overrides JSONB DEFAULT '{}',
  curiosity_slot TEXT DEFAULT 'exactCapRate',
  hook_copy TEXT,
  photo_policy TEXT DEFAULT 'exclude_facade',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teaser_configs_deal ON teaser_configs(deal_id);

CREATE TABLE IF NOT EXISTS teaser_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teaser_config_id UUID REFERENCES teaser_configs(id),
  visitor_fp TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'slider_interact', 'cta_click', 'gate_request', 'share')),
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teaser_events_config ON teaser_events(teaser_config_id);
CREATE INDEX IF NOT EXISTS idx_teaser_events_visitor ON teaser_events(visitor_fp);
