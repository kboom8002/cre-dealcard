-- ============================================================================
-- 20261029000001_lockdown_magazine_rpc_and_cleanup.sql
-- 목적: append_magazine_deal_snippet search_path 고정 및 권한 차단
--       보안 결함: SECURITY DEFINER 함수에 search_path 미지정 + public 실행 권한 방지
-- ============================================================================

-- Lockdown append_magazine_deal_snippet search_path & permissions
ALTER FUNCTION public.append_magazine_deal_snippet(UUID, JSONB) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.append_magazine_deal_snippet(UUID, JSONB) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_magazine_deal_snippet(UUID, JSONB) TO service_role;
