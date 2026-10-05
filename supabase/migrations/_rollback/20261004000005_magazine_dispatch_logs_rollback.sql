-- ROLLBACK for 20261004000005_magazine_dispatch_logs.sql
-- 주의: 발송 원장이 삭제되면 멱등성 보호가 사라진다. 발송 플래그(MAGAZINE_SEND_ENABLED)가 false 인 상태에서만 수행.
-- 백업: create table backup_20261004.magazine_dispatch_logs as table public.magazine_dispatch_logs;
begin;
drop table if exists public.magazine_dispatch_logs;
commit;
