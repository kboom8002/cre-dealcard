-- 0120_tacit_labels.sql
-- CREDEAL v3 Tacit Knowledge Label Capture Schema (S2-T3)

CREATE TABLE IF NOT EXISTS public.tacit_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID NOT NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  buyer_id UUID,
  label_category VARCHAR(50) NOT NULL, -- deal_fallout, buyer_rejection, price_mismatch, eviction_issue
  reason_code VARCHAR(100) NOT NULL,    -- loan_rejected, price_too_high, parking_shortage, etc.
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tacit_labels_deal_id ON public.tacit_labels(deal_id);
CREATE INDEX IF NOT EXISTS idx_tacit_labels_reason_code ON public.tacit_labels(reason_code);

ALTER TABLE public.tacit_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read tacit labels" ON public.tacit_labels FOR SELECT USING (true);
CREATE POLICY "Service role full tacit labels" ON public.tacit_labels FOR ALL USING (auth.role() = 'service_role');
