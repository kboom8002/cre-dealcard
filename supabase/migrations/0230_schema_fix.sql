-- 0230_schema_fix.sql
-- CREDEAL v3 Phase 1: Fix PKs for dev-spec-v2
-- Run with: supabase db push (local)

-- ═══ zoning_ordinance ═══
-- Spec mandates Composite PK (region_code, ordinance_type)
ALTER TABLE zoning_ordinance DROP CONSTRAINT IF EXISTS zoning_ordinance_pkey;
ALTER TABLE zoning_ordinance DROP COLUMN IF EXISTS id;
ALTER TABLE zoning_ordinance ADD PRIMARY KEY (region_code, ordinance_type);

-- ═══ location_hierarchy ═══
-- Spec mandates region_code as PK
ALTER TABLE location_hierarchy DROP CONSTRAINT IF EXISTS location_hierarchy_pkey;
ALTER TABLE location_hierarchy DROP CONSTRAINT IF EXISTS location_hierarchy_region_code_key;
ALTER TABLE location_hierarchy DROP COLUMN IF EXISTS id;
ALTER TABLE location_hierarchy ADD PRIMARY KEY (region_code);
