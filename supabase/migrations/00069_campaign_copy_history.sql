-- Campaign copy history
CREATE TABLE IF NOT EXISTS campaign_copies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  building_id UUID REFERENCES building_ssot_lite(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE campaign_copies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_own_copies" ON campaign_copies
  FOR ALL USING (broker_id = auth.uid());
