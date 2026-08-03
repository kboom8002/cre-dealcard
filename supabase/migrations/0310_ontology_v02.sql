-- 0310_ontology_v02.sql
-- CREDEAL Ontology v0.1 → v0.2 Migration
-- Spec: ONTOLOGY_V0.2_SPEC.md
-- 
-- Breaking changes:
-- 1. parcels/buildings array-ification
-- 2. provenance 4-tier → 5-tier (seller added)
-- 3. Derived value provenance composition
-- 4. R10 deprecated → T rule group

-- ── 1. Provenance 5-tier: Add 'seller' to check constraints ──────
-- Update assets table provenance JSONB to support 'seller' tier
COMMENT ON COLUMN public.assets.provenance IS
  'v0.2: 5-tier provenance (public, expert, seller, broker, assumed). seller는 매도인 진술 전용.';

-- ── 2. Slot array-ification columns ──────────────────────────────
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS parcels JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS buildings JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS effective_land_area_m2 NUMERIC,
  ADD COLUMN IF NOT EXISTS effective_far_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS exclusion_impact_ratio NUMERIC,
  ADD COLUMN IF NOT EXISTS far_counted_area_m2 NUMERIC,
  ADD COLUMN IF NOT EXISTS cap_rate_basis TEXT DEFAULT 'noi_price',
  ADD COLUMN IF NOT EXISTS ontology_version TEXT DEFAULT 'v0.1.0';

COMMENT ON COLUMN public.assets.parcels IS
  'v0.2: 필지 배열. 다필지 물건 표현. 단일 필지도 배열.';
COMMENT ON COLUMN public.assets.buildings IS
  'v0.2: 건축물 배열. 다동(부속건축물) 표현.';

-- ── 3. New enum-like columns on lease_units ──────────────────────
ALTER TABLE public.lease_units
  ADD COLUMN IF NOT EXISTS converted_deposit_krw BIGINT,
  ADD COLUMN IF NOT EXISTS is_protected BOOLEAN,
  ADD COLUMN IF NOT EXISTS renewal_right_remaining NUMERIC,
  ADD COLUMN IF NOT EXISTS priority_repayment BOOLEAN,
  ADD COLUMN IF NOT EXISTS rent_cap_applied BOOLEAN,
  ADD COLUMN IF NOT EXISTS premium_protection BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS handover_condition TEXT,
  ADD COLUMN IF NOT EXISTS mgmt_fee_type TEXT,
  ADD COLUMN IF NOT EXISTS lease_act_application TEXT;

COMMENT ON COLUMN public.lease_units.converted_deposit_krw IS
  'T01: 환산보증금 = 보증금 + 월세 × 100';
COMMENT ON COLUMN public.lease_units.is_protected IS
  'T01: 상임법 적용 여부 (환산보증금 ≤ 기준액)';
COMMENT ON COLUMN public.lease_units.renewal_right_remaining IS
  'T03: 계약갱신요구권 잔여 (년)';

-- ── 4. Acquisition cost & value growth slots ─────────────────────
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS acquisition_tax_krw BIGINT,
  ADD COLUMN IF NOT EXISTS registration_tax_krw BIGINT,
  ADD COLUMN IF NOT EXISTS broker_fee_krw BIGINT,
  ADD COLUMN IF NOT EXISTS due_diligence_cost_krw BIGINT,
  ADD COLUMN IF NOT EXISTS vat_refund_krw BIGINT,
  ADD COLUMN IF NOT EXISTS total_acquisition_cost_krw BIGINT,
  ADD COLUMN IF NOT EXISTS land_value_ratio NUMERIC,
  ADD COLUMN IF NOT EXISTS land_price_scenarios JSONB,
  ADD COLUMN IF NOT EXISTS total_return_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS npv_krw BIGINT,
  ADD COLUMN IF NOT EXISTS irr_pct NUMERIC;

-- ── 5. Disclosure policy columns ─────────────────────────────────
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS show_dcf BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS show_irr BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS show_sensitivity BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cap_rate_basis_display TEXT DEFAULT 'noi_price';

-- ── 6. Zoning enum reference table enhancements ──────────────────
ALTER TABLE public.zoning_ordinance
  ADD COLUMN IF NOT EXISTS jimok TEXT,
  ADD COLUMN IF NOT EXISTS use_district TEXT,
  ADD COLUMN IF NOT EXISTS use_zone TEXT,
  ADD COLUMN IF NOT EXISTS exclusion_kind TEXT;

-- ── 7. Publish record table (발행 이력 보호) ─────────────────────
CREATE TABLE IF NOT EXISTS public.publish_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  ontology_version TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_publish_records_asset ON public.publish_records(asset_id);
CREATE INDEX IF NOT EXISTS idx_publish_records_deal ON public.publish_records(deal_id);

COMMENT ON TABLE public.publish_records IS
  'v0.2: 발행 이력 보호. 이미 발행된 IM은 Pin된 ontology 버전으로 재현 가능.';

-- ── 8. Migration: Scalar → Array for existing data ───────────────
-- Migrate existing scalar land/building data to arrays
UPDATE public.assets
SET
  parcels = CASE
    WHEN (attrs->>'landAreaM2') IS NOT NULL THEN
      jsonb_build_array(jsonb_build_object(
        'pnu', COALESCE(pnu, ''),
        'areaM2', (attrs->>'landAreaM2')::numeric,
        'ownershipRatio', 1.0,
        'jimok', COALESCE(attrs->>'jimok', '대'),
        'exclusions', '[]'::jsonb
      ))
    ELSE '[]'::jsonb
  END,
  buildings = CASE
    WHEN (attrs->>'totalFloorAreaM2') IS NOT NULL THEN
      jsonb_build_array(jsonb_build_object(
        'primaryUse', COALESCE(attrs->>'primaryUse', '근린생활시설'),
        'buildYear', COALESCE((attrs->>'buildYear')::int, 2000),
        'totalFloorAreaM2', (attrs->>'totalFloorAreaM2')::numeric,
        'farCountedAreaM2', COALESCE((attrs->>'farCountedAreaM2')::numeric, (attrs->>'totalFloorAreaM2')::numeric),
        'floors', '[]'::jsonb
      ))
    ELSE '[]'::jsonb
  END,
  ontology_version = 'v0.2.0'
WHERE ontology_version IS NULL OR ontology_version = 'v0.1.0';

-- ── 9. T rule: Compute converted deposits for existing lease units ─
UPDATE public.lease_units
SET
  converted_deposit_krw = deposit_krw + (monthly_rent_krw * 100),
  is_protected = (deposit_krw + (monthly_rent_krw * 100)) <= 900000000,
  premium_protection = TRUE
WHERE converted_deposit_krw IS NULL;
