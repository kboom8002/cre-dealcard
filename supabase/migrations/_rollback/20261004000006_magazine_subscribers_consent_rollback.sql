-- ROLLBACK for 20261004000006_magazine_subscribers_consent.sql
-- 주의: 동의 증빙 데이터(marketing_consent_at 등)가 삭제된다 → 롤백 전 백업 필수:
--   create schema if not exists backup_20261004;
--   create table backup_20261004.magazine_subscribers as table public.magazine_subscribers;
-- broker_user_id / unsubscribed_at 은 다른 마이그레이션(000011 / 00065 원본)과 공유되므로 여기서 삭제하지 않는다.
begin;

drop index if exists public.uq_mag_sub_broker_phone_e164;
drop index if exists public.uq_mag_sub_broker_email_lc;
drop index if exists public.idx_mag_sub_confirm_token;

alter table public.magazine_subscribers drop constraint if exists magazine_subscribers_confirm_status_check;

alter table public.magazine_subscribers
  drop column if exists privacy_consent_at,
  drop column if exists marketing_consent_at,
  drop column if exists consent_version,
  drop column if exists consent_channel,
  drop column if exists night_consent,
  drop column if exists consent_ip_hash,
  drop column if exists confirm_status,
  drop column if exists confirm_token_hash,
  drop column if exists reconfirm_due_at,
  drop column if exists phone_e164,
  drop column if exists age_confirmed;

-- status/source CHECK 는 확장(상위집합) 상태로 둔다(기존 행 호환). 원본 복원이 필요하면:
--   alter table public.magazine_subscribers drop constraint if exists magazine_subscribers_status_check;
--   alter table public.magazine_subscribers add constraint magazine_subscribers_status_check check (status in ('active','paused','unsubscribed'));
--   (purged/crm_sync/qr_card 행이 없는지 먼저 확인)

commit;
