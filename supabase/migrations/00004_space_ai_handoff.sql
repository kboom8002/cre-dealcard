-- ============================================================
-- 00003_space_ai_handoff.sql
--
-- Adds bidirectional handoff table between cre-dealcard and cre-aipage.
-- Source: docs/23-handoff-api.md (Integration with JS MVP)
-- ============================================================

-- ── 1. MVP → Space AI Page handoff records ───────────────────────────────────

create table if not exists space_ai_handoffs (
  id uuid primary key default gen_random_uuid(),

  -- Source references
  building_ssot_lite_id uuid references building_ssot_lite(id) on delete set null,
  broker_id uuid references profiles(id) on delete set null,

  -- Payload
  memo_text text not null,
  space_basics jsonb not null default '{}',
  target_tenant_types text[] not null default '{}',

  -- Status
  status text not null default 'pending'
    check (status in ('pending', 'imported', 'failed')),

  -- Space AI Page response
  space_ai_space_id uuid,          -- space.id returned by cre-aipage
  space_ai_handoff_id uuid,        -- handoff.id returned by cre-aipage

  -- App metadata
  source_app text not null default 'js-building-ssot-mvp',
  target_app text not null default 'js-space-ai-page',
  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index space_ai_handoffs_building_idx
  on space_ai_handoffs(building_ssot_lite_id);

create index space_ai_handoffs_broker_idx
  on space_ai_handoffs(broker_id);

create index space_ai_handoffs_space_idx
  on space_ai_handoffs(space_ai_space_id);

create index space_ai_handoffs_created_at_idx
  on space_ai_handoffs(created_at desc);

-- ── 2. RLS ────────────────────────────────────────────────────────────────────

alter table space_ai_handoffs enable row level security;

-- Broker can read/insert own handoffs
create policy "space_ai_handoffs_select_own"
  on space_ai_handoffs for select
  to authenticated
  using (broker_id = auth.uid());

create policy "space_ai_handoffs_insert_own"
  on space_ai_handoffs for insert
  to authenticated
  with check (broker_id = auth.uid() or broker_id is null);

-- Service role can manage all (for server-side operations)
create policy "space_ai_handoffs_service"
  on space_ai_handoffs for all
  to service_role
  using (true)
  with check (true);

-- Admin can view all
create policy "space_ai_handoffs_admin_select"
  on space_ai_handoffs for select
  to authenticated
  using (
    exists (
      select 1 from profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ── 3. MVP return handoffs (Space AI Page → MVP results) ─────────────────────

create table if not exists mvp_return_handoffs (
  id uuid primary key default gen_random_uuid(),
  return_token uuid not null default gen_random_uuid(),

  -- References
  space_id uuid not null,
  leasing_page_id uuid,
  broker_id uuid references profiles(id) on delete set null,

  -- Result payload
  payload jsonb not null default '{}',

  -- Status
  status text not null default 'created'
    check (status in ('created', 'consumed', 'expired')),

  created_at timestamptz not null default now()
);

create unique index mvp_return_handoffs_token_idx
  on mvp_return_handoffs(return_token);

create index mvp_return_handoffs_space_idx
  on mvp_return_handoffs(space_id);

alter table mvp_return_handoffs enable row level security;

create policy "mvp_return_handoffs_service"
  on mvp_return_handoffs for all
  to service_role
  using (true)
  with check (true);
