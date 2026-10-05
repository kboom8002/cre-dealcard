-- ROLLBACK for 20261004000011_magazine_broker_user_id.sql
-- 주의: broker_user_id 값(백필 결과)이 삭제된다. 000006 이 magazine_subscribers.broker_user_id 를 먼저 만들었더라도 여기서 함께 삭제됨.
-- 백필(000015)을 적용했다면 그 백업(backup_20261004.*)을 보관할 것.
begin;
do $$
declare
  t text;
  tables text[] := array['magazine_subscribers','magazine_issues','magazine_editions','magazine_analytics_events','magazine_poll_responses'];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop index if exists public.%I', 'idx_' || t || '_broker_user');
    execute format('alter table public.%I drop constraint if exists %I', t, 'fk_' || t || '_broker_user');
    execute format('alter table public.%I drop column if exists broker_user_id', t);
  end loop;
end $$;
commit;
