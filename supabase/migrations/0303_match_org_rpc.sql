-- 0303_match_org_rpc.sql
-- Matching RPC and Contribution Score view
-- Spec reference: docs/DISTRIBUTION_AND_IDENTITY.md §7, §8

-- ── Contribution Score View (reciprocity gate) ───────────────────
CREATE OR REPLACE VIEW public.contribution_score AS
SELECT
  bp.user_id AS broker_id,
  COUNT(DISTINCT p.id) FILTER (
    WHERE p.created_at > NOW() - INTERVAL '6 months'
  ) AS recent_parties,
  COUNT(DISTINCT gp.token) FILTER (
    WHERE gp.created_at > NOW() - INTERVAL '6 months'
  ) AS recent_grants
FROM public.broker_profiles bp
LEFT JOIN public.party p ON p.owner_broker_id = bp.user_id
LEFT JOIN public.grant_pass gp ON gp.issued_by = bp.user_id
GROUP BY bp.user_id;

-- ── Match Scoring Function ───────────────────────────────────────
-- SECURITY DEFINER: bypasses RLS to aggregate across brokers
-- ⛔ INVARIANT: Return columns MUST NOT include party identifiers
CREATE OR REPLACE FUNCTION public.match_org(p_deal_id UUID)
RETURNS TABLE (
  broker_id UUID,
  match_count INT,
  strength TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_caller_id UUID;
  v_caller_parties INT;
BEGIN
  -- Check caller's contribution score (reciprocity gate)
  v_caller_id := auth.uid();
  
  SELECT recent_parties INTO v_caller_parties
  FROM contribution_score
  WHERE contribution_score.broker_id = v_caller_id;
  
  IF COALESCE(v_caller_parties, 0) < 3 THEN
    RAISE EXCEPTION 'Insufficient contribution: need at least 3 recent parties for org-level matching';
  END IF;

  RETURN QUERY
  SELECT
    p.owner_broker_id AS broker_id,
    COUNT(DISTINCT bc.party_id)::INT AS match_count,
    CASE
      WHEN MAX(
        CASE
          WHEN bc.confidence = 'high' AND bc.observed_at > NOW() - INTERVAL '3 months' THEN 0.9
          WHEN bc.confidence = 'high' THEN 0.7
          WHEN bc.confidence = 'medium' AND bc.observed_at > NOW() - INTERVAL '1 month' THEN 0.65
          WHEN bc.confidence = 'medium' THEN 0.5
          ELSE 0.3
        END
      ) >= 0.7 THEN 'high'
      ELSE 'medium'
    END AS strength
  FROM buyer_condition bc
  JOIN party p ON p.id = bc.party_id
  WHERE bc.confidence != 'low'  -- low 단독 매칭 제외
    AND p.owner_broker_id != v_caller_id  -- 자기 매수자 제외 (own은 별도)
    AND p.retention_until >= CURRENT_DATE  -- 보유기간 만료 제외
  GROUP BY p.owner_broker_id
  HAVING COUNT(DISTINCT bc.party_id) > 0
  ORDER BY match_count DESC;
END;
$func$;

REVOKE ALL ON FUNCTION public.match_org(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_org(UUID) TO authenticated;
