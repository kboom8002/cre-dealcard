-- ============================================================================
-- 20261004000012_magazine_cron_runs.sql
-- 목적  : 매거진 cron 실행 기록(브로커별 ok/skipped/failed + 사유 + 소요시간). 운영 헬스(O-01)·중복 실행 진단용.
-- 결함  : G-06 (T2-CL 계열: cron 500 이 조용히 묻힘)
-- 적용  : SQL Editor 수동. 미적용이어도 cron 은 동작하되 실행 기록이 남지 않음 → 코드가 이를 경고 로그로 남겨야 한다(발송은 영향 없음).
--
-- [적용 전 확인 쿼리]  select to_regclass('public.magazine_cron_runs');  -- null
-- [적용 후 검증 쿼리]  select policyname, roles from pg_policies where tablename = 'magazine_cron_runs'; -- service_role 1건
-- [롤백]  supabase/migrations/_rollback/20261004000012_magazine_cron_runs_rollback.sql
-- ============================================================================
begin;

create table if not exists public.magazine_cron_runs (
  id              uuid primary key default gen_random_uuid(),
  run_id          text,
  broker_id       text,                                  -- slug
  broker_user_id  uuid,
  issue_date      date,
  kind            text,
  status          text not null check (status in ('ok','skipped','failed')),
  reason          text,
  duration_ms     int,
  created_at      timestamptz not null default now()
);

create index if not exists idx_magazine_cron_runs_created on public.magazine_cron_runs (created_at desc);
create index if not exists idx_magazine_cron_runs_run on public.magazine_cron_runs (run_id);
create index if not exists idx_magazine_cron_runs_broker on public.magazine_cron_runs (broker_id, created_at desc);

alter table public.magazine_cron_runs enable row level security;
drop policy if exists "cron_runs_service_all" on public.magazine_cron_runs;
create policy "cron_runs_service_all" on public.magazine_cron_runs
  for all to service_role using (true) with check (true);
revoke all on table public.magazine_cron_runs from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='magazine_cron_runs'
             and (roles && array['public','anon','authenticated']::name[])) then
    raise exception '검증 실패: magazine_cron_runs 에 service_role 외 정책이 있습니다.';
  end if;
end $$;

commit;
