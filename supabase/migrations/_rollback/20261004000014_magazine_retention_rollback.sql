-- ROLLBACK for 20261004000014_magazine_retention.sql (함수만 제거; 이미 익명화/삭제된 데이터는 복구 불가)
begin;
drop function if exists public.magazine_purge_unsubscribed(int);
drop function if exists public.magazine_purge_old_events(int);
commit;
