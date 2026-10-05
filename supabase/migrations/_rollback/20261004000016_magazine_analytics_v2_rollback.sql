-- 롤백: 20261004000016_magazine_analytics_v2.sql
-- 인덱스 제거 + increment_edition_views 를 00063 원본 정의로 복원(권한 포함: 공개 실행 가능 — 원래 상태).
begin;

drop index if exists public.idx_mae_subscriber_created;
drop index if exists public.idx_activity_events_broker_type_created;

create or replace function public.increment_edition_views(edition_id uuid)
returns void as $$
begin
  update magazine_editions
    set view_count = view_count + 1
  where id = edition_id;
end;
$$ language plpgsql;

grant execute on function public.increment_edition_views(uuid) to public;

comment on column public.magazine_analytics_events.visitor_id is null;

commit;
