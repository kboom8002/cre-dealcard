-- ============================================================================
-- 20261004000016_magazine_analytics_v2.sql
-- 목적  : 분석 재구축(E-04) 보조 DB 변경
--         (1) 구독자 귀속 이벤트 조회 인덱스  — metadata->>'subscriber_id'
--         (2) 브로커 시간당 핫리드 알림 상한 조회 인덱스 — activity_events (broker_id, event_type, created_at)
--         (3) increment_edition_views 보강: search_path 고정 · null 안전 · anon/authenticated 실행 권한 회수
--             (공개 RPC 로 아무 호수의 조회수를 올릴 수 있던 구멍 차단. 호출은 서비스 키를 쓰는 /api/public/magazine/analytics 만)
--         (4) visitor_id 컬럼 의미 주석 (v2_ = 서버 HMAC 해시)
-- 결함  : T3-04, S2-28, D2-25, S2-08
-- 주의  : 이 파일은 운영에 자동 적용되지 않는다(SQL Editor 에서 수동). 코드는 미적용 상태에서도 동작한다
--         (RPC 는 기존 함수가 그대로 호출됨, 인덱스는 성능만 영향).
--
-- [적용 전 확인 쿼리]
--   select proname, prosecdef, proconfig from pg_proc where proname = 'increment_edition_views';
--   select count(*) filter (where visitor_id like 'v2\_%') as v2, count(*) as total from public.magazine_analytics_events;
-- [적용 후 검증 쿼리]
--   select has_function_privilege('anon','public.increment_edition_views(uuid)','execute');          -- false
--   select has_function_privilege('service_role','public.increment_edition_views(uuid)','execute');  -- true
--   select indexname from pg_indexes where indexname in ('idx_mae_subscriber_created','idx_activity_events_broker_type_created');
-- [롤백]  supabase/migrations/_rollback/20261004000016_magazine_analytics_v2_rollback.sql
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.magazine_analytics_events') is null or to_regclass('public.magazine_editions') is null then
    raise exception '000016 중단: magazine_analytics_events / magazine_editions 가 없습니다.';
  end if;
end $$;

-- (1) 구독자 귀속 이벤트 조회 (loadSubscriberEvents: metadata->>'subscriber_id' in (...) + created_at 범위)
create index if not exists idx_mae_subscriber_created
  on public.magazine_analytics_events ((metadata->>'subscriber_id'), created_at desc)
  where metadata ? 'subscriber_id';

-- (2) 시간당 알림 상한 조회 (activity_events: broker_id + event_type + created_at)
do $$
begin
  if to_regclass('public.activity_events') is not null
     and exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='activity_events' and column_name='broker_id') then
    execute 'create index if not exists idx_activity_events_broker_type_created
               on public.activity_events (broker_id, event_type, created_at desc)';
  end if;
end $$;

-- (3) 조회수 증가 함수 보강
create or replace function public.increment_edition_views(edition_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.magazine_editions
     set view_count = coalesce(view_count, 0) + 1
   where id = edition_id;
end;
$$;

revoke all on function public.increment_edition_views(uuid) from public;
revoke all on function public.increment_edition_views(uuid) from anon;
revoke all on function public.increment_edition_views(uuid) from authenticated;
grant execute on function public.increment_edition_views(uuid) to service_role;

-- (4) 의미 주석
comment on column public.magazine_analytics_events.visitor_id is
  'v2_ + HMAC-SHA256(MAGAZINE_SID_SECRET, 브라우저 랜덤 uuid) 40hex. 레거시(2026-10 이전)는 base64 기기 지문(충돌) — 집계 제외.';

commit;
