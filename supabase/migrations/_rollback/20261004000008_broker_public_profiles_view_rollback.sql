-- ROLLBACK for 20261004000008_broker_public_profiles_view.sql
-- view 제거 + 원본(00039:52) anon 직접 조회 정책 복원 (is_public=true 행 전체 컬럼 노출 — 임시 복구용)
begin;
drop view if exists public.broker_public_profiles;

drop policy if exists "broker_profiles_public_read" on public.broker_profiles;
create policy "broker_profiles_public_read"
  on public.broker_profiles for select
  to anon
  using (is_public = true);

commit;
