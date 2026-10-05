-- ============================================================================
-- 20261004000004_magazine_referrals.sql      ★★★ 적용 보류 (DEFERRED) ★★★
-- 결정  : DC-11 = (b) 레퍼럴 보상 기능 축소(전달/공유 버튼만). 코드는 이 테이블에 의존하지 않는다.
--         차기 (a) 귀속·마일스톤 구현을 결정할 때에만 적용한다. 지금은 **적용하지 말 것**.
-- 목적  : 20260828_magazine_referrals.sql 원본은 **적용 금지**
--         (`Anyone can read own referrals` SELECT USING(true) → 추천인/피추천인 전화번호 공개, S2-14).
--         이 파일은 전화번호 대신 구독자 식별자를 쓰고 service_role 전용 RLS 로 교체한 안전 버전.
-- 결함  : S2-14, T2-08
--
-- [적용 전 확인 쿼리]  select to_regclass('public.magazine_referrals');  -- null 이어야 함
-- [적용 후 검증 쿼리]  select policyname, roles from pg_policies where tablename = 'magazine_referrals'; -- service_role 만
-- [롤백]  supabase/migrations/_rollback/20261004000004_magazine_referrals_rollback.sql
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.magazine_referrals') is not null
     and not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'magazine_referrals' and column_name = 'referrer_subscriber_id') then
    raise exception '000004 중단: 원본(20260828) 형태의 magazine_referrals 가 이미 존재합니다.';
  end if;
end $$;

create table if not exists public.magazine_referrals (
  id                      uuid primary key default gen_random_uuid(),
  broker_id               text not null,                 -- slug
  broker_user_id          uuid,
  referrer_subscriber_id  uuid not null,
  referred_subscriber_id  uuid not null,
  milestone_reached       integer not null default 0,
  created_at              timestamptz not null default now(),
  unique (broker_id, referrer_subscriber_id, referred_subscriber_id)
);

create index if not exists idx_referrals_broker_referrer
  on public.magazine_referrals (broker_id, referrer_subscriber_id);

alter table public.magazine_referrals enable row level security;

drop policy if exists "Anyone can create referral"       on public.magazine_referrals;
drop policy if exists "Anyone can read own referrals"    on public.magazine_referrals;
drop policy if exists "referrals_service_all"            on public.magazine_referrals;
create policy "referrals_service_all" on public.magazine_referrals
  for all to service_role using (true) with check (true);

revoke all on table public.magazine_referrals from anon, authenticated;

commit;
