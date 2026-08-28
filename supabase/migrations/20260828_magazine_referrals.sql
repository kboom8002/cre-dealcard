-- Magazine Referral System for subscriber growth loop
CREATE TABLE IF NOT EXISTS magazine_referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  broker_id TEXT NOT NULL,
  referrer_phone TEXT NOT NULL,
  referred_phone TEXT NOT NULL,
  milestone_reached INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(broker_id, referrer_phone, referred_phone)
);

CREATE INDEX IF NOT EXISTS idx_referrals_broker_referrer
  ON magazine_referrals (broker_id, referrer_phone);

-- RLS
ALTER TABLE magazine_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create referral" ON magazine_referrals
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can read own referrals" ON magazine_referrals
  FOR SELECT USING (true);
