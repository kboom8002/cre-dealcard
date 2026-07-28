-- 0130_im_tiering.sql
-- CREDEAL v3 IM Tiering (Basic vs. Pro) & Grants Schema (S3-T4)

CREATE TABLE IF NOT EXISTS public.im_pro_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  requester_name VARCHAR(100) NOT NULL,
  requester_phone VARCHAR(50) NOT NULL,
  requester_email VARCHAR(100),
  status VARCHAR(30) NOT NULL DEFAULT 'pending', -- pending, granted, active, revoked, expired
  nda_signed_at TIMESTAMPTZ,
  watermark_seed VARCHAR(100),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_im_pro_grants_deal_id ON public.im_pro_grants(deal_id);
CREATE INDEX IF NOT EXISTS idx_im_pro_grants_status ON public.im_pro_grants(status);

ALTER TABLE public.im_pro_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read grants" ON public.im_pro_grants FOR SELECT USING (true);
CREATE POLICY "Service role full grants" ON public.im_pro_grants FOR ALL USING (auth.role() = 'service_role');
