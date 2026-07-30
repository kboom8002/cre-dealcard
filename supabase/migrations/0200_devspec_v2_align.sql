-- 0200_devspec_v2_align.sql
-- CREDEAL v3 Phase 1: Align schema with dev-spec-v2
-- Run with: supabase db push (local)

-- ═══ assets ═══
ALTER TABLE assets ADD COLUMN IF NOT EXISTS region_code TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS zoning_region TEXT;
CREATE INDEX IF NOT EXISTS idx_assets_region ON assets(region_code);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);

-- ═══ deals ═══
ALTER TABLE deals ADD COLUMN IF NOT EXISTS lost_reason_note TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS outcome_price_krw BIGINT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_deals_broker ON deals(broker_id);

-- ═══ lease_units ═══
ALTER TABLE lease_units ADD COLUMN IF NOT EXISTS mgmt_fee_krw BIGINT DEFAULT 0;
ALTER TABLE lease_units ADD COLUMN IF NOT EXISTS lease_start DATE;
ALTER TABLE lease_units ADD COLUMN IF NOT EXISTS source_tier TEXT DEFAULT 'broker_input';

-- ═══ deal_parties ═══
ALTER TABLE deal_parties ADD COLUMN IF NOT EXISTS profession TEXT;
ALTER TABLE deal_parties ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE deal_parties ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE deal_parties ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';

-- ═══ tacit_labels ═══
ALTER TABLE tacit_labels ADD COLUMN IF NOT EXISTS asset_id UUID;
ALTER TABLE tacit_labels ADD COLUMN IF NOT EXISTS match_id UUID;
ALTER TABLE tacit_labels ADD COLUMN IF NOT EXISTS label_kind TEXT;
ALTER TABLE tacit_labels ADD COLUMN IF NOT EXISTS label_value TEXT;
ALTER TABLE tacit_labels ADD COLUMN IF NOT EXISTS context JSONB DEFAULT '{}';

-- ═══ im_edit_diffs ═══
ALTER TABLE im_edit_diffs ADD COLUMN IF NOT EXISTS doc_id UUID;
ALTER TABLE im_edit_diffs ADD COLUMN IF NOT EXISTS section_type TEXT;
ALTER TABLE im_edit_diffs ADD COLUMN IF NOT EXISTS broker_id UUID;
ALTER TABLE im_edit_diffs ADD COLUMN IF NOT EXISTS judge_score REAL;
ALTER TABLE im_edit_diffs ADD COLUMN IF NOT EXISTS consented BOOLEAN DEFAULT FALSE;

-- ═══ New Tables ═══
CREATE TABLE IF NOT EXISTS zoning_ordinance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_code TEXT NOT NULL,
  ordinance_type TEXT NOT NULL,
  max_far_pct REAL,
  max_bcr_pct REAL,
  max_height_m REAL,
  effective_date DATE,
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zoning_region ON zoning_ordinance(region_code);

CREATE TABLE IF NOT EXISTS location_hierarchy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_code TEXT UNIQUE NOT NULL,
  sido TEXT NOT NULL,
  sigungu TEXT NOT NULL,
  eupmyeondong TEXT,
  ri TEXT,
  parent_code TEXT,
  level INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_location_region ON location_hierarchy(region_code);
