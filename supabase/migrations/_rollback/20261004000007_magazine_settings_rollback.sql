-- ROLLBACK for 20261004000007_magazine_settings.sql
-- 주의: 제목·테마·발송설정 데이터가 삭제된다. 백업: create table backup_20261004.magazine_settings as table public.magazine_settings;
begin;
drop table if exists public.magazine_settings;
commit;
