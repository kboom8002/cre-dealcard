-- 0100_assumptions.sql
-- Create financial assumptions and data provenance tracking table for CREDEAL v3

CREATE TABLE IF NOT EXISTS public.building_financial_assumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID REFERENCES public.building_ssot_lite(id) ON DELETE CASCADE,
  asset_id UUID,
  opex_ratio_pct NUMERIC(5,2) DEFAULT 10.00 NOT NULL,
  wacc_pct NUMERIC(5,2) DEFAULT 5.50 NOT NULL,
  remodeling_cost_per_pyung NUMERIC(12,2) DEFAULT 0 NOT NULL,
  vacancy_reserve_pct NUMERIC(5,2) DEFAULT 5.00 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.building_financial_assumptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow public read access to financial assumptions"
  ON public.building_financial_assumptions FOR SELECT
  USING (true);

CREATE POLICY "Allow service role full access to financial assumptions"
  ON public.building_financial_assumptions FOR ALL
  USING (auth.role() = 'service_role');
