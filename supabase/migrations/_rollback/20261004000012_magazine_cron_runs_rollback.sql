-- ROLLBACK for 20261004000012_magazine_cron_runs.sql
begin;
drop table if exists public.magazine_cron_runs;
commit;
