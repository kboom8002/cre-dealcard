-- ROLLBACK for 20261004000009_activity_events_anon_insert_drop.sql
-- 원본(00002:37-40) anon INSERT 정책 복원 (이벤트 위조 위험 복귀 — 임시 복구용)
begin;
drop policy if exists "activity_events_insert_anon" on public.activity_events;
create policy "activity_events_insert_anon"
  on public.activity_events for insert
  to anon, authenticated
  with check (true);
commit;
