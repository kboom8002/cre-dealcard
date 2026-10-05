-- ============================================================================
-- ROLLBACK for 20261004000001_magazine_rls_lockdown.sql
-- 주의: 이 롤백은 **취약한 원본 정책(PUBLIC USING(true))을 되살린다**. 장애 시 임시 복구용으로만 사용하고,
--       복구 후 즉시 원인 수정 → 재적용할 것.
-- 운영 정책이 원본 마이그레이션과 달랐다면 db-snapshots/pg_policies_before 덤프 결과로 정책을 직접 복원하라.
-- ============================================================================
begin;

-- 신규 정책 제거
drop policy if exists "magazine_issues_service_all"  on public.magazine_issues;
drop policy if exists "magazine_issues_public_read"  on public.magazine_issues;
drop policy if exists "editions_service_all"         on public.magazine_editions;
drop policy if exists "analytics_service_all"        on public.magazine_analytics_events;

-- 원본(00054) 복원
drop policy if exists "Public can view magazine_issues" on public.magazine_issues;
create policy "Public can view magazine_issues"
  on public.magazine_issues for select using (true);

drop policy if exists "Service role can insert/update magazine_issues" on public.magazine_issues;
create policy "Service role can insert/update magazine_issues"
  on public.magazine_issues for all using (true) with check (true);

-- 원본(00063) 복원
drop policy if exists "editions_public_read" on public.magazine_editions;
create policy "editions_public_read"
  on public.magazine_editions for select using (status = 'published');

create policy "editions_service_all"
  on public.magazine_editions for all using (true) with check (true);

drop policy if exists "analytics_insert_public" on public.magazine_analytics_events;
create policy "analytics_insert_public"
  on public.magazine_analytics_events for insert with check (true);

create policy "analytics_service_all"
  on public.magazine_analytics_events for all using (true) with check (true);

-- 원본(00065) 복원
drop policy if exists "Public subscribe" on public.magazine_subscribers;
create policy "Public subscribe" on public.magazine_subscribers
  for insert with check (true);

commit;
