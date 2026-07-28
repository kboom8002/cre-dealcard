-- 0121_edit_diffs.sql
-- CREDEAL v3 IM Edit Diffs Schema for LLM Calibration (S2-T4)

CREATE TABLE IF NOT EXISTS public.im_edit_diffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  section_key VARCHAR(50) NOT NULL,
  original_ai_content TEXT NOT NULL,
  edited_broker_content TEXT NOT NULL,
  char_diff_count INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edit_diffs_deal_id ON public.im_edit_diffs(deal_id);

ALTER TABLE public.im_edit_diffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read edit diffs" ON public.im_edit_diffs FOR SELECT USING (true);
CREATE POLICY "Service role full edit diffs" ON public.im_edit_diffs FOR ALL USING (auth.role() = 'service_role');
