-- ============================================================================
-- 20261004000005_magazine_dispatch_logs.sql
-- 목적  : 발송 원장(멱등 키 기반). sendGate 가 모든 이메일/알림톡 발송 직전에 기록하고, 동일 idempotency_key 재발송을 차단.
-- 결함  : G-03 전제 (T2-03/T2-04 중복 발송·감사 추적), 함정 #1/#4
-- 적용  : SQL Editor 수동. 발송 활성화(G-07) 전에 적용 — 미적용이면 코드는 발송을 차단해야 한다(fail-closed).
--
-- [적용 전 확인 쿼리]  select to_regclass('public.magazine_dispatch_logs');  -- null
-- [적용 후 검증 쿼리]
--   select indexname from pg_indexes where tablename = 'magazine_dispatch_logs';
--   select policyname, roles from pg_policies where tablename = 'magazine_dispatch_logs';   -- service_role 1건
-- [롤백]  supabase/migrations/_rollback/20261004000005_magazine_dispatch_logs_rollback.sql
-- 키 형식: idempotency_key = `${editionKey}:${subscriberId}:${channel}`
-- ============================================================================
begin;

create table if not exists public.magazine_dispatch_logs (
  id                uuid primary key default gen_random_uuid(),
  idempotency_key   text not null unique,
  edition_id        text,
  broker_id         text not null,                      -- slug
  broker_user_id    uuid,
  subscriber_id     uuid,
  channel           text not null check (channel in ('email','kakao')),
  kind              text not null default 'weekly' check (kind in ('weekly','flash')),
  status            text not null check (status in ('queued','sent','blocked','failed','dry_run')),
  blocked_reason    text,
  provider_msg_id   text,
  error             text,
  recipient_hash    text,                               -- 수신처 해시(원문 PII 저장 금지)
  created_at        timestamptz not null default now()
);

create index if not exists idx_dispatch_logs_broker_created
  on public.magazine_dispatch_logs (broker_id, created_at desc);
create index if not exists idx_dispatch_logs_subscriber
  on public.magazine_dispatch_logs (subscriber_id) where subscriber_id is not null;

alter table public.magazine_dispatch_logs enable row level security;

drop policy if exists "dispatch_logs_service_all" on public.magazine_dispatch_logs;
create policy "dispatch_logs_service_all" on public.magazine_dispatch_logs
  for all to service_role using (true) with check (true);

revoke all on table public.magazine_dispatch_logs from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'magazine_dispatch_logs'
             and (roles && array['public','anon','authenticated']::name[])) then
    raise exception '검증 실패: magazine_dispatch_logs 에 service_role 외 정책이 있습니다.';
  end if;
end $$;

commit;
