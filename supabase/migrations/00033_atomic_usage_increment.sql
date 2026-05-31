-- supabase/migrations/00033_atomic_usage_increment.sql
-- Atomic usage counter increment function to prevent race conditions.

CREATE OR REPLACE FUNCTION increment_usage_counter(
  p_user_id UUID,
  p_feature_name TEXT,
  p_billing_month TEXT,
  p_max_limit INT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO usage_counters (
    user_id,
    feature_name,
    billing_month,
    current_count,
    max_limit,
    updated_at
  )
  VALUES (
    p_user_id,
    p_feature_name,
    p_billing_month,
    1,
    p_max_limit,
    now()
  )
  ON CONFLICT (user_id, feature_name, billing_month)
  DO UPDATE SET
    current_count = usage_counters.current_count + 1,
    updated_at = now();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
