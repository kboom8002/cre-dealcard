-- ============================================================================
-- 20261004000003_magazine_poll_responses.sql
-- 목적  : 매거진 1-Click 설문 응답 테이블 (service_role 전용, 전화번호 컬럼 없음)
--         20260828_magazine_poll_responses.sql 원본은 **적용 금지**:
--           · `Anyone can read results` SELECT USING(true) → 응답자 정보 공개
--           · subscriber_phone(PII) 저장, choice INTEGER 무제한, edition_date TEXT
-- 결함  : S2-14, T3-01 (함정 #9: 원본 마이그레이션 적용 전에 RLS 수정본으로 대체)
-- 적용  : SQL Editor 수동. 000001 이후.
--
-- [적용 전 확인 쿼리]
--   select to_regclass('public.magazine_poll_responses');   -- null 이어야 함 (운영에 아직 없음)
--
-- [적용 후 검증 쿼리]
--   select policyname, roles, cmd from pg_policies where tablename = 'magazine_poll_responses';  -- service_role 1건
--   select column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name='magazine_poll_responses' order by ordinal_position;  -- phone 컬럼 없음
--
-- [롤백]  supabase/migrations/_rollback/20261004000003_magazine_poll_responses_rollback.sql (drop table)
-- 계약  : docs/magazine/audit-2026-10-04/db-schema-contract.md
-- ============================================================================
begin;

do $$
begin
  -- 원본(20260828)이 이미 적용돼 있다면(컬럼 visitor_id 없음) 수동 점검 후 진행
  if to_regclass('public.magazine_poll_responses') is not null
     and not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'magazine_poll_responses' and column_name = 'visitor_id') then
    raise exception '000003 중단: 원본(20260828) 형태의 magazine_poll_responses 가 이미 존재합니다. 데이터 확인 후 수동 정리 필요.';
  end if;
end $$;

create table if not exists public.magazine_poll_responses (
  id              uuid primary key default gen_random_uuid(),
  broker_id       text not null,                       -- 브로커 slug (URL 키)
  broker_user_id  uuid,                                -- 정규 FK 후보(DC-1 c) — 000011 백필 대상
  edition_id      text,
  edition_date    date not null,
  visitor_id      text not null,                       -- 익명 방문자 식별(전화번호 아님)
  subscriber_id   uuid,                                -- 서명된 sid 로 귀속된 경우만
  choice          smallint not null check (choice between 0 and 5),
  created_at      timestamptz not null default now(),
  unique (broker_id, edition_date, visitor_id)
);

create index if not exists idx_poll_responses_broker_date
  on public.magazine_poll_responses (broker_id, edition_date);
create index if not exists idx_poll_responses_broker_user
  on public.magazine_poll_responses (broker_user_id) where broker_user_id is not null;

alter table public.magazine_poll_responses enable row level security;

drop policy if exists "Anyone can vote"          on public.magazine_poll_responses;
drop policy if exists "Anyone can read results"  on public.magazine_poll_responses;
drop policy if exists "poll_service_all"         on public.magazine_poll_responses;
create policy "poll_service_all" on public.magazine_poll_responses
  for all to service_role using (true) with check (true);

-- 신규 테이블은 Supabase 기본 GRANT(anon/authenticated)가 붙으므로 명시 회수 (RLS 우회 사고 대비 이중 방어)
revoke all on table public.magazine_poll_responses from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'magazine_poll_responses'
             and (roles && array['public','anon','authenticated']::name[])) then
    raise exception '검증 실패: magazine_poll_responses 에 service_role 외 정책이 있습니다.';
  end if;
end $$;

commit;
