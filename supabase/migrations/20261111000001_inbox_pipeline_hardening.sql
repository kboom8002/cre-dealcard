-- =============================================================================
-- Migration: 20261111000001_inbox_pipeline_hardening.sql
-- Purpose:
--   1. Ensure public.im_inquiry_requests exists with tenant-isolated RLS
--   2. Ensure public.in_app_notifications exists with user-scoped RLS
--   3. Ensure public.im_share_links has recipient_id / revoked_at / revoked_reason columns & indexes
-- =============================================================================

create table if not exists public.im_inquiry_requests (
  id uuid primary key default gen_random_uuid(),
  building_id text not null,
  doc_id uuid null,
  broker_user_id uuid not null,
  requester_name text not null,
  requester_phone text not null,
  requester_email text null,
  message text null,
  source text not null default 'im_cta',
  notification_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_im_inquiry_requests_broker_created
  on public.im_inquiry_requests (broker_user_id, created_at desc);

create index if not exists idx_im_inquiry_requests_building
  on public.im_inquiry_requests (building_id);

alter table public.im_inquiry_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'im_inquiry_requests'
      and policyname = 'broker_select_own_im_inquiries'
  ) then
    create policy broker_select_own_im_inquiries
      on public.im_inquiry_requests
      for select
      to authenticated
      using (broker_user_id = auth.uid());
  end if;
end $$;

create table if not exists public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null default 'system',
  title text not null,
  body text not null default '',
  link text null,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_in_app_notifications_user_unread
  on public.in_app_notifications (user_id, is_read, created_at desc);

alter table public.in_app_notifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'in_app_notifications'
      and policyname = 'user_select_own_notifications'
  ) then
    create policy user_select_own_notifications
      on public.in_app_notifications
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'in_app_notifications'
      and policyname = 'user_update_own_notifications'
  ) then
    create policy user_update_own_notifications
      on public.in_app_notifications
      for update
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

create table if not exists public.im_share_links (
  token text primary key,
  building_id text not null,
  broker_id uuid null,
  recipient_id text null,
  status text not null default 'active',
  expires_at timestamptz null,
  revoked_at timestamptz null,
  revoked_reason text null,
  created_at timestamptz not null default now()
);

alter table public.im_share_links
  add column if not exists broker_id uuid null,
  add column if not exists recipient_id text null,
  add column if not exists status text not null default 'active',
  add column if not exists expires_at timestamptz null,
  add column if not exists revoked_at timestamptz null,
  add column if not exists revoked_reason text null;

create index if not exists idx_im_share_links_building_status
  on public.im_share_links (building_id, status);

create index if not exists idx_im_share_links_recipient
  on public.im_share_links (recipient_id);

alter table public.im_share_links enable row level security;
