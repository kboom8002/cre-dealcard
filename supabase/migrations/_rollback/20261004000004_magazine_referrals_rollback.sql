-- ROLLBACK for 20261004000004_magazine_referrals.sql (적용했을 경우에만)
begin;
drop table if exists public.magazine_referrals;
commit;
