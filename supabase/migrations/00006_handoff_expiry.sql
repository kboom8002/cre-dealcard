-- ============================================================
-- Migration 00005: Handoff expiry enforcement and single-use
-- ============================================================

-- 1. Function to expire stale handoffs
CREATE OR REPLACE FUNCTION expire_stale_handoffs()
RETURNS INTEGER AS $$
DECLARE expired_count INTEGER;
BEGIN
  UPDATE full_im_handoffs
  SET status = 'expired', updated_at = NOW()
  WHERE status IN ('created', 'pending_import')
    AND expires_at < NOW();
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Add expires_at to space_ai_handoffs
ALTER TABLE space_ai_handoffs
  ADD COLUMN IF NOT EXISTS expires_at timestamptz
    DEFAULT (NOW() + INTERVAL '24 hours');

-- 3. Add consumed_at to mvp_return_handoffs
ALTER TABLE mvp_return_handoffs
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;
