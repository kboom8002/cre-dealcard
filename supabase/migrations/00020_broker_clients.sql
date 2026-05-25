-- ============================================================
-- 00020_broker_clients.sql
-- Broker Client CRM + Contact History
-- ============================================================

-- ── broker_clients ─────────────────────────────────────────
create table if not exists broker_clients (
  id             uuid primary key default gen_random_uuid(),
  broker_id      uuid not null references profiles(id) on delete cascade,
  client_type    text not null check (client_type in ('seller', 'buyer', 'both')),
  display_name   text not null,
  company        text,
  phone          text,
  email          text,
  tier           text not null default 'normal' check (tier in ('vip', 'normal', 'potential', 'dormant')),
  tags           text[] not null default '{}',
  notes          text,
  -- linked entities (soft references for flexibility)
  linked_building_ids     uuid[] not null default '{}',
  linked_buyer_intent_ids uuid[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists broker_clients_broker_id_idx on broker_clients(broker_id);
create index if not exists broker_clients_client_type_idx on broker_clients(client_type);
create index if not exists broker_clients_tier_idx on broker_clients(tier);
create index if not exists broker_clients_created_at_idx on broker_clients(created_at desc);

alter table broker_clients enable row level security;

-- Broker can manage own clients
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'broker_clients' and policyname = 'broker_clients_own'
  ) then
    execute 'create policy "broker_clients_own"
      on broker_clients for all to authenticated
      using (broker_id = auth.uid())
      with check (broker_id = auth.uid())';
  end if;
end $$;

-- ── contact_history ────────────────────────────────────────
create table if not exists contact_history (
  id             uuid primary key default gen_random_uuid(),
  broker_id      uuid not null references profiles(id) on delete cascade,
  client_id      uuid not null references broker_clients(id) on delete cascade,
  contact_type   text not null check (contact_type in ('phone', 'kakao', 'sms', 'email', 'meeting', 'site_visit', 'note')),
  summary        text not null,
  scheduled_at   timestamptz,
  completed_at   timestamptz,
  metadata       jsonb not null default '{}',
  created_at     timestamptz not null default now()
);

create index if not exists contact_history_broker_id_idx on contact_history(broker_id);
create index if not exists contact_history_client_id_idx on contact_history(client_id);
create index if not exists contact_history_created_at_idx on contact_history(created_at desc);

alter table contact_history enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'contact_history' and policyname = 'contact_history_own'
  ) then
    execute 'create policy "contact_history_own"
      on contact_history for all to authenticated
      using (broker_id = auth.uid())
      with check (broker_id = auth.uid())';
  end if;
end $$;

-- ── updated_at triggers ────────────────────────────────────
create or replace trigger set_broker_clients_updated_at
  before update on broker_clients
  for each row execute function set_updated_at();
