-- Migration: Create im_share_links table for persistent share link issuance, verification, and revocation (IB-04, IB-05)

create table if not exists public.im_share_links (
  token text primary key,
  building_id text not null,
  broker_id uuid,
  recipient_id text,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_im_share_links_building_id on public.im_share_links (building_id);
create index if not exists idx_im_share_links_broker_id on public.im_share_links (broker_id);
create index if not exists idx_im_share_links_status on public.im_share_links (status);

alter table public.im_share_links enable row level security;

drop policy if exists "Brokers can view own im_share_links" on public.im_share_links;
create policy "Brokers can view own im_share_links"
  on public.im_share_links
  for select
  using (auth.uid() = broker_id);

drop policy if exists "Brokers can insert own im_share_links" on public.im_share_links;
create policy "Brokers can insert own im_share_links"
  on public.im_share_links
  for insert
  with check (auth.uid() = broker_id);

drop policy if exists "Brokers can update own im_share_links" on public.im_share_links;
create policy "Brokers can update own im_share_links"
  on public.im_share_links
  for update
  using (auth.uid() = broker_id)
  with check (auth.uid() = broker_id);
