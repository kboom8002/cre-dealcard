-- ROLLBACK for 20261004000013_magazine_editions_unique_kind.sql
-- 이 파일이 만든 인덱스만 제거한다 (00063 의 uq_edition_broker_type_label 제약은 유지).
begin;
drop index if exists public.uq_magazine_editions_broker_type_label;
commit;
