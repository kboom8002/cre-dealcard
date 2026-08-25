-- C-3: 포스처 결정 이력 테이블
CREATE TABLE IF NOT EXISTS posture_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL,
  proposed_posture TEXT,
  proposed_confidence NUMERIC(3,2),
  proposed_reason TEXT,
  confirmed_posture TEXT NOT NULL,
  confirmed_by TEXT NOT NULL,
  changed_from TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posture_decisions_deal ON posture_decisions(deal_id);
COMMENT ON TABLE posture_decisions IS 'C-3: 포스처(투자관점) 결정 및 변경 이력';
