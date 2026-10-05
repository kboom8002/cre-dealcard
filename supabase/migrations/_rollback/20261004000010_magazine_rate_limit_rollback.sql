-- ROLLBACK for 20261004000010_magazine_rate_limit.sql
-- 주의: 롤백하면 공개 API 레이트리밋(public-guard)이 동작하지 않는다 → 코드가 fail-closed 면 공개 구독/분석 API 가 거부된다.
begin;
drop function if exists public.magazine_rl_hit(text, int, int);
drop function if exists public.magazine_rl_gc(int);
drop table if exists public.magazine_rate_limits;
commit;
