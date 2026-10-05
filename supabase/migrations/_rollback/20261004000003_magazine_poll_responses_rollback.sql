-- ROLLBACK for 20261004000003_magazine_poll_responses.sql
-- 주의: 응답 데이터가 모두 삭제된다. 먼저 백업: create table backup_20261004.magazine_poll_responses as table public.magazine_poll_responses;
begin;
drop table if exists public.magazine_poll_responses;
commit;
