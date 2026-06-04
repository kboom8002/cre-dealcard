-- ============================================================
-- Migration 00038: Broker Sentiment Votes & Stats
-- ============================================================

CREATE TABLE IF NOT EXISTS broker_sentiment_votes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  region        text NOT NULL,           -- gbd, ybd, cbd, seongsu, pangyo, mapo, jongno, hongdae
  period_label  text NOT NULL,           -- e.g. 2026-W23
  
  -- Likert scale questions (1~5)
  q_transaction integer NOT NULL CHECK (q_transaction BETWEEN 1 AND 5),
  q_lease       integer NOT NULL CHECK (q_lease BETWEEN 1 AND 5),
  q_outlook     integer NOT NULL CHECK (q_outlook BETWEEN 1 AND 5),
  
  comment       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  
  -- Prevent multiple votes by same broker in same region/week
  CONSTRAINT uniq_broker_sentiment_vote UNIQUE(user_id, region, period_label)
);

-- Trigger for updated_at
CREATE OR REPLACE TRIGGER broker_sentiment_votes_updated_at
  BEFORE UPDATE ON broker_sentiment_votes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Aggregated stats view (calculated as security definer by default to aggregate all broker votes)
CREATE OR REPLACE VIEW broker_sentiment_stats AS
SELECT
  region,
  period_label,
  COUNT(*)::integer AS vote_count,
  ROUND(AVG(q_transaction)::numeric, 2)::numeric AS avg_transaction,
  ROUND(AVG(q_lease)::numeric, 2)::numeric AS avg_lease,
  ROUND(AVG(q_outlook)::numeric, 2)::numeric AS avg_outlook,
  -- Sentiment index: 0 to 100 based on transaction and lease questions
  ROUND(((AVG(q_transaction) + AVG(q_lease)) / 2 - 1) / 4 * 100)::integer AS sentiment_index,
  ROUND(coalesce(stddev_samp(q_transaction), 0)::numeric, 2)::numeric AS std_transaction,
  ROUND(coalesce(stddev_samp(q_outlook), 0)::numeric, 2)::numeric AS std_outlook,
  CASE WHEN COUNT(*) >= 30 THEN true ELSE false END AS statistically_significant
FROM broker_sentiment_votes
GROUP BY region, period_label;

-- Grant select on the view to public
GRANT SELECT ON broker_sentiment_stats TO anon, authenticated;

-- Enable RLS on votes table
ALTER TABLE broker_sentiment_votes ENABLE ROW LEVEL SECURITY;

-- Policy for INSERT (only authenticated brokers/admins can insert, and user_id must match auth.uid())
CREATE POLICY "broker_vote_insert"
  ON broker_sentiment_votes FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('broker', 'admin')
    )
  );

-- Policy for UPDATE (only owns can update)
CREATE POLICY "broker_vote_update"
  ON broker_sentiment_votes FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('broker', 'admin')
    )
  );

-- Policy for SELECT (brokers can see their own votes)
CREATE POLICY "broker_vote_select_own"
  ON broker_sentiment_votes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
