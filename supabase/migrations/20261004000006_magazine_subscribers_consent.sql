-- ============================================================================
-- 20261004000006_magazine_subscribers_consent.sql
-- 목적  : magazine_subscribers 에 수신 동의 증빙·더블옵트인·해지·E.164 정규화 컬럼 추가 + 중복 방지 partial unique.
--         기존 컬럼(broker_id, subscriber_name/phone/email, channel, status, source, interest_profile, segment, client_id …)은 변경하지 않는다.
-- 결함  : G-01, T2-09b/e, S2-07, S2-23 (정보통신망법 §50 / 개인정보보호법 §15·§22의2)
-- 정책  : 기존 구독자는 동의 기록이 없으므로 confirm_status='pending', marketing_consent_at=null 로 남는다 →
--         sendGate 가 NO_CONSENT 로 차단하는 것이 **정상**(법규 준수). 임의 동의 백필 금지.
-- 적용  : SQL Editor 수동. 000001 이후. (011 broker_user_id 컬럼도 여기서 add column if not exists)
--
-- [적용 전 확인 쿼리]
--   -- (1) 이메일 중복(브로커별 lower) — 있으면 이 마이그레이션이 중단된다
--   select broker_id, lower(subscriber_email) as email_lc, count(*) from public.magazine_subscribers
--    where subscriber_email is not null group by 1,2 having count(*) > 1;
--   -- (2) 기존 status/source CHECK 정의
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.magazine_subscribers'::regclass and contype = 'c';
--   -- (3) 행 수
--   select count(*) from public.magazine_subscribers;
--
-- [적용 후 검증 쿼리]
--   select column_name, data_type, column_default from information_schema.columns
--    where table_schema='public' and table_name='magazine_subscribers'
--      and column_name in ('privacy_consent_at','marketing_consent_at','consent_version','consent_channel','night_consent',
--                          'consent_ip_hash','confirm_status','confirm_token_hash','unsubscribed_at','reconfirm_due_at',
--                          'phone_e164','age_confirmed','broker_user_id') order by 1;       -- 13행
--   select indexname from pg_indexes where tablename='magazine_subscribers' and indexname like 'uq_mag_sub_%';  -- 2행
--   select confirm_status, count(*) from public.magazine_subscribers group by 1;           -- 전원 pending, 행 수 불변
--
-- [롤백]  supabase/migrations/_rollback/20261004000006_magazine_subscribers_consent_rollback.sql
-- 동기: src/domain/magazine/subscriber-consent-types.ts (SUBSCRIBE_SOURCES), consent-service.ts
-- ============================================================================
begin;

do $$
declare
  dup int;
  r   record;
  vals text[];
  existing text[];
  canon_status text[] := array['active','paused','unsubscribed','purged'];
  -- 코드가 쓰는 source: SUBSCRIBE_SOURCES + CRM 동기화(clients/new)
  canon_source text[] := array['manual','vibe_card','magazine','im','qr_card','crm_sync'];
begin
  if to_regclass('public.magazine_subscribers') is null then
    raise exception '000006 중단: public.magazine_subscribers 가 없습니다.';
  end if;

  -- ── 사전 가드: 이메일 중복 ───────────────────────────────────────────────
  select count(*) into dup from (
    select 1 from public.magazine_subscribers
     where subscriber_email is not null
     group by broker_id, lower(subscriber_email) having count(*) > 1
  ) d;
  if dup > 0 then
    raise exception '000006 중단: (broker_id, lower(subscriber_email)) 중복 % 그룹 — 위 [적용 전 확인 쿼리](1)로 확인 후 정리하세요.', dup;
  end if;

  -- ── status CHECK 확장(기존 ∪ purged): 000014 익명화가 status='purged' 를 쓴다 ───────
  vals := canon_status;
  for r in
    select conname, pg_get_constraintdef(oid) as def from pg_constraint
    where conrelid = 'public.magazine_subscribers'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~ '\mstatus\M' and pg_get_constraintdef(oid) !~ '(confirm_status|channel|source)'
  loop
    select coalesce(array_agg(distinct m[1]), '{}') into existing from regexp_matches(r.def, '''([^'']+)''', 'g') as m;
    vals := vals || existing;
  end loop;
  select array_agg(distinct x order by x) into vals from unnest(vals) as x;
  for r in
    select conname from pg_constraint
    where conrelid = 'public.magazine_subscribers'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~ '\mstatus\M' and pg_get_constraintdef(oid) !~ '(confirm_status|channel|source)'
  loop
    execute format('alter table public.magazine_subscribers drop constraint %I', r.conname);
  end loop;
  execute format('alter table public.magazine_subscribers add constraint magazine_subscribers_status_check check (status in (%s))',
                 (select string_agg(quote_literal(x), ',' order by x) from unnest(vals) as x));

  -- ── source CHECK 확장(기존 ∪ 코드 사용값) ───────────────────────────────
  vals := canon_source;
  for r in
    select conname, pg_get_constraintdef(oid) as def from pg_constraint
    where conrelid = 'public.magazine_subscribers'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~ '\msource\M'
  loop
    select coalesce(array_agg(distinct m[1]), '{}') into existing from regexp_matches(r.def, '''([^'']+)''', 'g') as m;
    vals := vals || existing;
  end loop;
  select array_agg(distinct x order by x) into vals from unnest(vals) as x;
  for r in
    select conname from pg_constraint
    where conrelid = 'public.magazine_subscribers'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~ '\msource\M'
  loop
    execute format('alter table public.magazine_subscribers drop constraint %I', r.conname);
  end loop;
  execute format('alter table public.magazine_subscribers add constraint magazine_subscribers_source_check check (source is null or source in (%s))',
                 (select string_agg(quote_literal(x), ',' order by x) from unnest(vals) as x));
end $$;

-- ── 신규 컬럼 ───────────────────────────────────────────────────────────────
alter table public.magazine_subscribers add column if not exists broker_user_id       uuid;
alter table public.magazine_subscribers add column if not exists privacy_consent_at   timestamptz;
alter table public.magazine_subscribers add column if not exists marketing_consent_at timestamptz;
alter table public.magazine_subscribers add column if not exists consent_version      text;
alter table public.magazine_subscribers add column if not exists consent_channel      text;
alter table public.magazine_subscribers add column if not exists night_consent        boolean not null default false;
alter table public.magazine_subscribers add column if not exists consent_ip_hash      text;
alter table public.magazine_subscribers add column if not exists confirm_status       text not null default 'pending';
alter table public.magazine_subscribers add column if not exists confirm_token_hash   text;
alter table public.magazine_subscribers add column if not exists unsubscribed_at      timestamptz;
alter table public.magazine_subscribers add column if not exists reconfirm_due_at     timestamptz;
alter table public.magazine_subscribers add column if not exists phone_e164           text;
alter table public.magazine_subscribers add column if not exists age_confirmed        boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.magazine_subscribers'::regclass and conname = 'magazine_subscribers_confirm_status_check') then
    alter table public.magazine_subscribers
      add constraint magazine_subscribers_confirm_status_check check (confirm_status in ('pending','confirmed'));
  end if;
end $$;

-- ── 인덱스 ──────────────────────────────────────────────────────────────────
create unique index if not exists uq_mag_sub_broker_phone_e164
  on public.magazine_subscribers (broker_id, phone_e164)
  where phone_e164 is not null and status <> 'deleted';

create unique index if not exists uq_mag_sub_broker_email_lc
  on public.magazine_subscribers (broker_id, lower(subscriber_email))
  where subscriber_email is not null;

create index if not exists idx_mag_sub_confirm_token
  on public.magazine_subscribers (confirm_token_hash) where confirm_token_hash is not null;

create index if not exists idx_mag_sub_broker_user
  on public.magazine_subscribers (broker_user_id) where broker_user_id is not null;

-- ── 자동 검증 ───────────────────────────────────────────────────────────────
do $$
declare cnt int;
begin
  select count(*) into cnt from information_schema.columns
   where table_schema = 'public' and table_name = 'magazine_subscribers'
     and column_name in ('privacy_consent_at','marketing_consent_at','consent_version','consent_channel','night_consent',
                         'consent_ip_hash','confirm_status','confirm_token_hash','unsubscribed_at','reconfirm_due_at',
                         'phone_e164','age_confirmed','broker_user_id');
  if cnt <> 13 then raise exception '검증 실패: 신규 컬럼 13개 중 % 개만 존재', cnt; end if;
  select count(*) into cnt from pg_indexes
   where schemaname = 'public' and tablename = 'magazine_subscribers' and indexname in ('uq_mag_sub_broker_phone_e164','uq_mag_sub_broker_email_lc');
  if cnt <> 2 then raise exception '검증 실패: partial unique 인덱스 2개 중 % 개만 존재', cnt; end if;
end $$;

commit;
