-- 0110_ontology_schema.sql
-- CREDEAL v3 Core Ontology Database Schema (S1-T1)

-- 1. Assets Table (Physical & Property SSoT)
CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pnu VARCHAR(19) NOT NULL,
  asset_type VARCHAR(50) NOT NULL DEFAULT 'smallBuilding', -- smallBuilding, logisticsCenter, landSite, strataRetail
  attrs JSONB NOT NULL DEFAULT '{}'::jsonb,                 -- Ontology ~70 slots
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,            -- 4-tier provenance metadata
  data_grade VARCHAR(2) NOT NULL DEFAULT 'C',              -- A, B, C, D
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_pnu ON public.assets(pnu);
CREATE INDEX IF NOT EXISTS idx_assets_asset_type ON public.assets(asset_type);

-- 2. Deals Table (Transaction & Marketing Pipeline)
CREATE TABLE IF NOT EXISTS public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID NOT NULL,
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
  asking_price_krw NUMERIC(15,0),
  pipeline_stage VARCHAR(50) NOT NULL DEFAULT 'draft',    -- draft, gate1, gate2, gate3, matching, loi, contract, closed
  mandate_type VARCHAR(30) DEFAULT 'exclusive',           -- exclusive, general, non_exclusive
  archetypes TEXT[] DEFAULT '{}'::text[],                  -- STABLE_INCOME, VALUE_ADD, etc.
  lost_reason VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deals_broker_id ON public.deals(broker_id);
CREATE INDEX IF NOT EXISTS idx_deals_pipeline_stage ON public.deals(pipeline_stage);

-- 3. Lease Units Table (Rent Roll Roster)
CREATE TABLE IF NOT EXISTS public.lease_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
  floor VARCHAR(20) NOT NULL,
  unit_number VARCHAR(30),
  tenant_sector VARCHAR(50),                              -- f_and_b, office, retail, medical, vacant
  area_pyung NUMERIC(10,2),
  deposit_krw NUMERIC(14,0) DEFAULT 0,
  monthly_rent_krw NUMERIC(14,0) DEFAULT 0,
  opposing_power BOOLEAN DEFAULT false,                   -- 대항력 여부
  is_vacant BOOLEAN DEFAULT false,
  lease_end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lease_units_asset_id ON public.lease_units(asset_id);

-- 4. Deal Parties Table (Stakeholders & Roles)
CREATE TABLE IF NOT EXISTS public.deal_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL,                              -- seller, buyer, co_broker, lawyer, tax_accountant
  name VARCHAR(100) NOT NULL,
  contact_phone VARCHAR(50),
  contact_email VARCHAR(100),
  nda_signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deal_parties_deal_id ON public.deal_parties(deal_id);

-- RLS Policies
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lease_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read assets" ON public.assets FOR SELECT USING (true);
CREATE POLICY "Public read deals" ON public.deals FOR SELECT USING (true);
CREATE POLICY "Public read lease units" ON public.lease_units FOR SELECT USING (true);
CREATE POLICY "Public read deal parties" ON public.deal_parties FOR SELECT USING (true);

CREATE POLICY "Service role full assets" ON public.assets FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full deals" ON public.deals FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full lease units" ON public.lease_units FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full deal parties" ON public.deal_parties FOR ALL USING (auth.role() = 'service_role');
