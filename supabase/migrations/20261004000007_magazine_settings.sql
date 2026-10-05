-- ============================================================================
-- 20261004000007_magazine_settings.sql
-- 목적  : 매거진 제목·테마·발송 요일/시각·자동발송 설정을 broker_profiles 와 분리해 저장 (DC-5=b).
--         broker_profiles 컬럼 추가는 anon 노출 확대(S2-19)를 부르므로 별도 테이블로 분리.
-- 결함  : D2-01, T1-01 (에디터가 존재하지 않는 broker_profiles.magazine_title select → 400 → 'demo' 폴백)
-- 적용  : SQL Editor 수동. 000001 이후.
--
-- [적용 전 확인 쿼리]  select to_regclass('public.magazine_settings');  -- null
-- [적용 후 검증 쿼리]
--   select policyname, roles, cmd from pg_policies where tablename = 'magazine_settings' order by 1;
--     -- authenticated 3건(select/insert/update, auth.uid()=broker_user_id) + service_role 1건, anon 0건
-- [롤백]  supabase/migrations/_rollback/20261004000007_magazine_settings_rollback.sql
-- 계약  : docs/magazine/audit-2026-10-04/db-schema-contract.md (auto_send 기본 false: 발송 관문 전까지 자동발송 금지)
-- ============================================================================
begin;

create table if not exists public.magazine_settings (
  broker_user_id  uuid primary key references auth.users(id) on delete cascade,
  broker_slug     text,
  title           text,
  theme_color     text,
  send_day        text not null default 'TUE' check (send_day in ('MON','TUE','WED','THU','FRI')),
  send_hour_kst   int  not null default 10 check (send_hour_kst between 8 and 20),
  auto_send       boolean not null default false,
  updated_at      timestamptz not null default now()
);

create index if not exists idx_magazine_settings_slug
  on public.magazine_settings (broker_slug) where broker_slug is not null;

alter table public.magazine_settings enable row level security;

-- owner: 본인 행만 (anon 정책 없음)
drop policy if exists "magazine_settings_owner_select" on public.magazine_settings;
create policy "magazine_settings_owner_select" on public.magazine_settings
  for select to authenticated using (auth.uid() = broker_user_id);

drop policy if exists "magazine_settings_owner_insert" on public.magazine_settings;
create policy "magazine_settings_owner_insert" on public.magazine_settings
  for insert to authenticated with check (auth.uid() = broker_user_id);

drop policy if exists "magazine_settings_owner_update" on public.magazine_settings;
create policy "magazine_settings_owner_update" on public.magazine_settings
  for update to authenticated using (auth.uid() = broker_user_id) with check (auth.uid() = broker_user_id);

drop policy if exists "magazine_settings_service_all" on public.magazine_settings;
create policy "magazine_settings_service_all" on public.magazine_settings
  for all to service_role using (true) with check (true);

revoke all on table public.magazine_settings from anon;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'magazine_settings'
             and (roles && array['public','anon']::name[])) then
    raise exception '검증 실패: magazine_settings 에 public/anon 정책이 있습니다.';
  end if;
end $$;

commit;
