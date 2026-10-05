-- ROLLBACK for 20261004000015_magazine_broker_user_id_backfill.sql
-- 백필 이전에 broker_user_id 가 모두 null 이었다면(= 000011 직후 상태) 아래로 되돌린다.
-- 일부 행이 백필 전부터 값을 가졌다면 이 스크립트 대신 backup_20261004.*_pre_backfill 에서 broker_user_id 만 복원할 것.
begin;
update public.magazine_subscribers set broker_user_id = null where broker_user_id is not null;
update public.magazine_issues      set broker_user_id = null where broker_user_id is not null;
update public.magazine_editions    set broker_user_id = null where broker_user_id is not null;
update public.magazine_analytics_events set broker_user_id = null where broker_user_id is not null;
do $$
begin
  if to_regclass('public.magazine_poll_responses') is not null then
    execute 'update public.magazine_poll_responses set broker_user_id = null where broker_user_id is not null';
  end if;
end $$;
commit;
