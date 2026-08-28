-- Magazine Poll Responses table for 1-Click voting in magazine viewer
CREATE TABLE IF NOT EXISTS magazine_poll_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  broker_id TEXT NOT NULL,
  edition_date TEXT NOT NULL,
  choice INTEGER NOT NULL,
  subscriber_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poll_responses_broker_date
  ON magazine_poll_responses (broker_id, edition_date);

-- RLS: anyone can insert (public poll), read aggregated results
ALTER TABLE magazine_poll_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can vote" ON magazine_poll_responses
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can read results" ON magazine_poll_responses
  FOR SELECT USING (true);
