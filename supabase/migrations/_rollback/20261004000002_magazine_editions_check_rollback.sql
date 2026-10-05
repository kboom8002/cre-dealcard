-- ROLLBACK for 20261004000002_magazine_editions_check.sql
-- 원본(00063) CHECK 로 복원. needs_review 행은 review 로 되돌린다(데이터 변경 — 롤백 전 건수 확인).
--   select count(*) from public.magazine_editions where status = 'needs_review';
begin;

update public.magazine_editions set status = 'review' where status = 'needs_review';

alter table public.magazine_editions drop constraint if exists magazine_editions_status_check;
alter table public.magazine_editions drop constraint if exists magazine_editions_edition_type_check;

alter table public.magazine_editions add constraint magazine_editions_status_check
  check (status in ('draft','editing','review','scheduled','published','archived'));
alter table public.magazine_editions add constraint magazine_editions_edition_type_check
  check (edition_type in ('daily','weekly','monthly','special'));

commit;
