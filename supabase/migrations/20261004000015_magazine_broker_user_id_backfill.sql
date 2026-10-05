-- ============================================================================
-- 20261004000015_magazine_broker_user_id_backfill.sql      (적용 보류 가능 — 000011 이후, 사용자 승인 후)
-- 목적  : 000011 에서 만든 broker_user_id 를 기존 행에 채운다. 삭제·broker_id 변경은 하지 않는다. 매핑 불가 행은 건드리지 않고 목록화한다.
-- 규칙  : (1) broker_id 가 broker_profiles.user_id 의 **텍스트 표현과 일치**(uuid 키)하면 그 user_id,
--         (2) 아니면 slug 로 보고 broker_profiles.slug → user_id 로 매핑. ::uuid 캐스트는 쓰지 않는다(slug 혼재 시 22P02 방지).
--         (3) magazine_analytics_events 는 broker_id 컬럼이 없으므로 edition_id → magazine_editions.broker_user_id 로 매핑
--             (editions 가 먼저 백필됨 — 처리 순서 고정).
-- 수정이력: 2026-10-06 E5(pglite) 지적 — analytics.broker_id 부재로 전체 롤백되던 결함 + ::uuid 캐스트 제거.
-- 전제  : P0-04(발송 킬스위치) 배포 완료 — 백필로 uuid 키 구독자(운영 4명 실측)가 slug 배포 대상에 포함돼 대상이 늘어난다(함정 #3).
--         MAGAZINE_SEND_ENABLED=false 상태에서 적용.
-- 번호  : 계약상 000011 과 분리된 별도 파일 — 000015 는 이 파일용으로 사용(조율자 확인).
--
-- [적용 전 확인 쿼리]  (결과 저장; 백업 권장)
--   create schema if not exists backup_20261004;
--   create table backup_20261004.magazine_subscribers_pre_backfill as table public.magazine_subscribers;
--   create table backup_20261004.magazine_issues_pre_backfill      as table public.magazine_issues;
--   create table backup_20261004.magazine_editions_pre_backfill    as table public.magazine_editions;
--   -- 매핑 가능/불가 건수 (캐스트 없이 텍스트 비교)
--   select 'subscribers' t,
--          count(*) filter (where broker_user_id is null) as null_cnt,
--          count(*) filter (where broker_user_id is null and exists (
--              select 1 from public.broker_profiles bp
--               where bp.user_id::text = lower(broker_id) or bp.slug = broker_id)) as mappable
--   from public.magazine_subscribers;
-- [적용 후 검증 쿼리]
--   -- 행 수 불변 + 매핑 불가 목록(남아 있는 null)
--   select broker_id, count(*) from public.magazine_subscribers where broker_user_id is null group by 1;
--   select broker_id, count(*) from public.magazine_issues      where broker_user_id is null group by 1;
-- [롤백]  supabase/migrations/_rollback/20261004000015_magazine_broker_user_id_backfill_rollback.sql
-- ============================================================================
begin;

do $$
declare
  t text;
  -- 순서 중요: editions 가 analytics 보다 먼저 와야 edition 경유 매핑이 채워진다.
  tables text[] := array['magazine_subscribers','magazine_issues','magazine_editions','magazine_poll_responses','magazine_analytics_events'];
  before_cnt bigint; after_cnt bigint; updated bigint; unmapped bigint;
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      raise notice '건너뜀: public.% 없음', t; continue;
    end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='broker_user_id') then
      raise exception '백필 중단: public.%.broker_user_id 없음 — 000011 먼저 적용', t;
    end if;

    execute format('select count(*) from public.%I', t) into before_cnt;

    if exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='broker_id') then
      -- (1) uuid 키: 텍스트 비교 (캐스트 금지)
      execute format($f$
        update public.%1$I x set broker_user_id = bp.user_id
          from public.broker_profiles bp
         where x.broker_user_id is null and bp.user_id is not null
           and bp.user_id::text = lower(x.broker_id)
      $f$, t);
      get diagnostics updated = row_count;
      raise notice '% : uuid 키 매핑 % 행', t, updated;

      -- (2) slug → broker_profiles.slug → user_id
      execute format($f$
        update public.%1$I x set broker_user_id = bp.user_id
          from public.broker_profiles bp
         where x.broker_user_id is null and bp.user_id is not null
           and bp.slug is not null and bp.slug = x.broker_id
      $f$, t);
      get diagnostics updated = row_count;
      raise notice '% : slug 매핑 % 행', t, updated;

    elsif to_regclass('public.magazine_editions') is not null
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='edition_id')
      and exists (select 1 from information_schema.columns where table_schema='public' and table_name='magazine_editions' and column_name='broker_user_id') then
      -- broker_id 컬럼이 없는 테이블(magazine_analytics_events): edition_id(uuid) → magazine_editions.broker_user_id
      execute format($f$
        update public.%1$I x set broker_user_id = e.broker_user_id
          from public.magazine_editions e
         where x.broker_user_id is null and e.broker_user_id is not null
           and e.id = x.edition_id
      $f$, t);
      get diagnostics updated = row_count;
      raise notice '% : edition 경유 매핑 % 행', t, updated;
    else
      raise notice '% : broker_id/edition_id 컬럼이 없어 백필 대상 아님', t;
    end if;

    execute format('select count(*) from public.%I where broker_user_id is null', t) into unmapped;
    execute format('select count(*) from public.%I', t) into after_cnt;
    raise notice '% : 매핑 불가(null 잔존) % 행 — 삭제하지 않음', t, unmapped;

    if after_cnt <> before_cnt then
      raise exception '백필 검증 실패: % 행 수 변경 (% → %)', t, before_cnt, after_cnt;
    end if;
  end loop;
end $$;

commit;
