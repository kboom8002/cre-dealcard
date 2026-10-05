-- ============================================================================
-- 20261004000014_magazine_retention.sql
-- 목적  : 보유기간 경과 개인정보 파기 함수 2종 (개인정보보호법 §21 — 해지 후 즉시/기간 경과 파기, 행태정보 보유 제한).
--         magazine_purge_unsubscribed(p_days=30)  : 해지 후 p_days 경과 구독자의 식별정보를 익명화하고 status='purged'
--         magazine_purge_old_events(p_days=365)   : p_days 초과 analytics 이벤트 삭제
--         함수만 만든다(스케줄링은 별도 cron/수동 호출 — 자동 실행 없음). service_role 전용 실행.
-- 결함  : S2-18 (G-01)
-- 전제  : 000006 (confirm_token_hash, consent_ip_hash, phone_e164, status 'purged' CHECK 확장) 적용 후.
--
-- [적용 전 확인 쿼리]
--   select count(*) from public.magazine_subscribers where status = 'unsubscribed' and unsubscribed_at < now() - interval '30 days';  -- 파기 예정 건수(dry-run)
--   select count(*) from public.magazine_analytics_events where created_at < now() - interval '365 days';
-- [적용 후 검증 쿼리]
--   select has_function_privilege('anon','public.magazine_purge_unsubscribed(int)','execute');       -- false
--   select has_function_privilege('service_role','public.magazine_purge_unsubscribed(int)','execute'); -- true
--   -- 실행(service_role): select public.magazine_purge_unsubscribed(30);  (반환: 익명화 건수)
-- [롤백]  supabase/migrations/_rollback/20261004000014_magazine_retention_rollback.sql  (함수만 제거 — 이미 익명화된 데이터는 복구 불가, 실행 전 백업)
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.magazine_subscribers') is null or to_regclass('public.magazine_analytics_events') is null then
    raise exception '000014 중단: magazine_subscribers / magazine_analytics_events 가 없습니다.';
  end if;
  -- 000006 의존 컬럼 점검
  if (select count(*) from information_schema.columns
       where table_schema='public' and table_name='magazine_subscribers'
         and column_name in ('phone_e164','consent_ip_hash','confirm_token_hash','unsubscribed_at')) <> 4 then
    raise exception '000014 중단: magazine_subscribers 에 000006 컬럼(phone_e164, consent_ip_hash, confirm_token_hash, unsubscribed_at)이 없습니다. 000006 먼저 적용하세요.';
  end if;
end $$;

create or replace function public.magazine_purge_unsubscribed(p_days int default 30)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_days is null or p_days < 0 then
    raise exception 'magazine_purge_unsubscribed: p_days must be >= 0';
  end if;

  -- 식별정보 익명화: 행 자체는 통계·멱등 키 보존을 위해 남기되 연락처/동의 식별값을 제거.
  -- subscriber_name 은 NOT NULL 일 수 있어 빈 문자열이 아닌 고정 익명 값 사용.
  update public.magazine_subscribers
     set subscriber_name   = '(삭제됨)',
         subscriber_phone  = null,
         subscriber_email  = null,
         phone_e164        = null,
         consent_ip_hash   = null,
         confirm_token_hash = null,
         status            = 'purged'
   where status = 'unsubscribed'
     and unsubscribed_at is not null
     and unsubscribed_at < now() - make_interval(days => p_days);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.magazine_purge_old_events(p_days int default 365)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_days is null or p_days < 1 then
    raise exception 'magazine_purge_old_events: p_days must be >= 1';
  end if;
  delete from public.magazine_analytics_events
   where created_at < now() - make_interval(days => p_days);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.magazine_purge_unsubscribed(int) from public, anon, authenticated;
revoke all on function public.magazine_purge_old_events(int)    from public, anon, authenticated;
grant execute on function public.magazine_purge_unsubscribed(int) to service_role;
grant execute on function public.magazine_purge_old_events(int)    to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.magazine_purge_unsubscribed(int)', 'execute')
     or has_function_privilege('authenticated', 'public.magazine_purge_old_events(int)', 'execute') then
    raise exception '검증 실패: 파기 함수가 anon/authenticated 에 실행 가능합니다.';
  end if;
end $$;

commit;
