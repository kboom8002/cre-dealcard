-- ============================================================================
-- 20261004000011_magazine_broker_user_id.sql
-- 목적  : 매거진 5개 테이블에 정규 브로커 식별자 `broker_user_id uuid`(→ auth.users) 컬럼 + 인덱스 추가 (DC-1 = c).
--         URL·QR 은 slug(broker_id), DB 조인·권한은 broker_user_id. 이 파일은 **컬럼/인덱스만** 만든다 — 값 채우기(백필)는
--         별도 파일 20261004000015_magazine_broker_user_id_backfill.sql (적용 보류 가능).
-- 결함  : D2-08, D2-20, T2-CL-3 (F-04)
-- 전제  : P0-04(발송 킬스위치) 배포 완료 후 적용 권장(함정 #3 — 백필 시 배포 대상이 늘 수 있음). 컬럼 추가만으로는 영향 없음.
-- 적용  : SQL Editor 수동.
--
-- [적용 전 확인 쿼리]
--   select table_name from information_schema.columns
--    where table_schema='public' and column_name='broker_user_id' and table_name like 'magazine%';
--   select 'magazine_subscribers' t, count(*) from public.magazine_subscribers
--   union all select 'magazine_issues', count(*) from public.magazine_issues
--   union all select 'magazine_editions', count(*) from public.magazine_editions
--   union all select 'magazine_analytics_events', count(*) from public.magazine_analytics_events;
-- [적용 후 검증 쿼리]
--   select table_name, data_type from information_schema.columns
--    where table_schema='public' and column_name='broker_user_id' and table_name like 'magazine%' order by 1;  -- 4~5행(poll_responses 는 000003 적용 시)
--   -- 위 행 수 쿼리를 다시 실행 → 적용 전과 동일해야 함
-- [롤백]  supabase/migrations/_rollback/20261004000011_magazine_broker_user_id_rollback.sql
-- ============================================================================
begin;

do $$
declare
  t text;
  tables text[] := array['magazine_subscribers','magazine_issues','magazine_editions','magazine_analytics_events','magazine_poll_responses'];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      raise notice '건너뜀: public.% 없음 (magazine_poll_responses 는 000003 적용 후 이 파일을 다시 실행하면 추가됨 — 멱등)', t;
      continue;
    end if;

    execute format('alter table public.%I add column if not exists broker_user_id uuid', t);

    -- FK (nullable, 삭제 시 null) — 이미 있으면 건너뜀
    if not exists (select 1 from pg_constraint where conrelid = format('public.%I', t)::regclass
                   and conname = 'fk_' || t || '_broker_user') then
      execute format(
        'alter table public.%I add constraint %I foreign key (broker_user_id) references auth.users(id) on delete set null not valid',
        t, 'fk_' || t || '_broker_user');
      execute format('alter table public.%I validate constraint %I', t, 'fk_' || t || '_broker_user');
    end if;

    execute format('create index if not exists %I on public.%I (broker_user_id) where broker_user_id is not null',
                   'idx_' || t || '_broker_user', t);
  end loop;
end $$;

commit;
