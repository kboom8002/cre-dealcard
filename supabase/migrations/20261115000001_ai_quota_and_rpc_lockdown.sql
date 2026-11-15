-- Wave 2 WP-05: AI Quota & Distributed Rate-Limit RPC Lockdown
-- 1. Lock down increment_usage_counter so anon/authenticated cannot forge usage counters directly
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.increment_usage_counter(uuid, text, text) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.increment_usage_counter(uuid, text, text) TO service_role;
EXCEPTION
  WHEN undefined_function THEN NULL;
END $$;

DO $$
BEGIN
  ALTER FUNCTION public.increment_usage_counter(uuid, text, text, int) SET search_path = public;
  REVOKE EXECUTE ON FUNCTION public.increment_usage_counter(uuid, text, text, int) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.increment_usage_counter(uuid, text, text, int) TO service_role;
EXCEPTION
  WHEN undefined_function THEN NULL;
END $$;

-- 2. Distributed fixed-window rate-limit counter table (service_role only)
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  bucket_key TEXT PRIMARY KEY,
  hit_count INT NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_reset_at
  ON public.rate_limit_counters (reset_at);

ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.rate_limit_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limit_counters TO service_role;

DROP POLICY IF EXISTS "rate_limit_counters_service_role_only" ON public.rate_limit_counters;
CREATE POLICY "rate_limit_counters_service_role_only"
  ON public.rate_limit_counters
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Atomic distributed rate-limit RPC (service_role only)
CREATE OR REPLACE FUNCTION public.check_distributed_rate_limit(
  p_bucket_key text,
  p_max_requests int,
  p_window_seconds int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_window interval := make_interval(secs => GREATEST(COALESCE(p_window_seconds, 60), 1));
  v_count int;
BEGIN
  IF p_bucket_key IS NULL OR length(trim(p_bucket_key)) = 0 OR COALESCE(p_max_requests, 0) <= 0 THEN
    RETURN false;
  END IF;

  -- Lightweight opportunistic cleanup of expired buckets (~1% sample)
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_counters
    WHERE reset_at < v_now - interval '10 minutes';
  END IF;

  INSERT INTO public.rate_limit_counters (bucket_key, hit_count, reset_at, updated_at)
  VALUES (p_bucket_key, 1, v_now + v_window, v_now)
  ON CONFLICT (bucket_key) DO UPDATE
    SET hit_count = CASE
          WHEN public.rate_limit_counters.reset_at <= v_now THEN 1
          ELSE public.rate_limit_counters.hit_count + 1
        END,
        reset_at = CASE
          WHEN public.rate_limit_counters.reset_at <= v_now THEN v_now + v_window
          ELSE public.rate_limit_counters.reset_at
        END,
        updated_at = v_now
  RETURNING hit_count INTO v_count;

  RETURN v_count <= p_max_requests;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_distributed_rate_limit(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_distributed_rate_limit(text, int, int) TO service_role;
