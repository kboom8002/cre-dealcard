-- ============================================================
-- Migration 00003: Full IM Handoff Integration
-- Adds:
--   1. full_im_handoffs table (Gap 1)
--   2. source_app column to activity_events (Gap 2)
--   3. building_ssot_full table (Full IM Studio creates entries)
--   4. handoff_source_snapshots table
--   5. im_projects table
-- ============================================================

-- ============================================================
-- 1. full_im_handoffs
-- MVP side: creates handoff token → Full IM Studio imports
-- ============================================================

create table full_im_handoffs (
  id uuid primary key default gen_random_uuid(),

  -- Opaque single-use token (high entropy)
  handoff_token text unique not null default encode(gen_random_bytes(32), 'hex'),

  -- Source references (MVP side)
  source_building_ssot_lite_id uuid references building_ssot_lite(id) on delete restrict,
  source_document_ids uuid[] not null default '{}',
  source_buyer_intent_id uuid references buyer_intent_lite(id) on delete set null,
  source_owner_readiness_id uuid references owner_readiness_checks(id) on delete set null,
  source_expert_note_request_id uuid references expert_note_requests(id) on delete set null,

  -- What the broker/owner wants
  requested_output text not null
    check (requested_output in ('im_lite','buyer_ready_full_im','expert_review','expert_full_build','dealroom_ready_package')),
  package_intent text not null default 'unknown'
    check (package_intent in ('ai_self_authoring','ai_expert_review','expert_full_build','dealroom_ready_package','unknown')),

  -- Who initiated
  created_by uuid references profiles(id) on delete set null,
  actor_role text not null default 'broker'
    check (actor_role in ('public_user','owner','broker','admin','system')),

  -- Data boundary
  source_visibility_level text not null default 'internal_only'
    check (source_visibility_level in ('public','public_blind','registered_interest','qualified_summary','gate_restricted','internal_only','private_truth')),
  allowed_import_scope text[] not null default '{"building_ssot_lite"}',

  -- Lifecycle
  status text not null default 'created'
    check (status in ('created','pending_import','imported','expired','revoked','failed')),

  -- Versioning
  contracts_version text not null default '0.2.0',
  payload_version text not null default '1.0',

  -- Timestamps
  expires_at timestamptz not null default (now() + interval '7 days'),
  imported_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index full_im_handoffs_token_idx on full_im_handoffs(handoff_token);
create index full_im_handoffs_building_id_idx on full_im_handoffs(source_building_ssot_lite_id);
create index full_im_handoffs_created_by_idx on full_im_handoffs(created_by);
create index full_im_handoffs_status_idx on full_im_handoffs(status);
create index full_im_handoffs_created_at_idx on full_im_handoffs(created_at desc);

alter table full_im_handoffs enable row level security;

-- Owner/broker can see their own handoffs
create policy "handoffs_select_own"
  on full_im_handoffs for select
  to authenticated
  using (created_by = auth.uid());

-- Owner/broker can create handoffs for their buildings
create policy "handoffs_insert_own"
  on full_im_handoffs for insert
  to authenticated
  with check (created_by = auth.uid());

-- Owner/broker can revoke their own handoffs
create policy "handoffs_update_own"
  on full_im_handoffs for update
  to authenticated
  using (created_by = auth.uid());

-- Admin can see all
create policy "handoffs_admin_select"
  on full_im_handoffs for select
  to authenticated
  using (is_admin());

-- Admin can update (manage status)
create policy "handoffs_admin_update"
  on full_im_handoffs for update
  to authenticated
  using (is_admin());

create trigger full_im_handoffs_updated_at
  before update on full_im_handoffs
  for each row execute function set_updated_at();

-- ============================================================
-- 2. activity_events: add source_app column (Gap 2)
-- Allows both apps to share the table with source identification
-- ============================================================

alter table activity_events
  add column if not exists source_app text
    check (source_app is null or source_app in ('js-building-ssot-mvp','js-full-im-studio'));

create index activity_events_source_app_idx on activity_events(source_app);

-- ============================================================
-- 3. building_ssot_full
-- Full IM Studio creates these; stored in shared Supabase
-- ============================================================

create table building_ssot_full (
  id uuid primary key default gen_random_uuid(),
  source_building_ssot_lite_id uuid references building_ssot_lite(id) on delete restrict,
  created_by uuid references profiles(id) on delete set null,

  -- Core data layers (JSONB blobs — Full IM fills these progressively)
  asset_identity jsonb not null default '{}',
  physical_fact jsonb not null default '{}',
  legal_registry jsonb not null default '{}',
  lease_income jsonb not null default '{}',
  market_location jsonb not null default '{}',
  value_up_hypothesis jsonb not null default '{}',
  risk_unknown jsonb not null default '{}',
  buyer_fit jsonb not null default '{}',
  disclosure_gate jsonb not null default '{}',
  evidence_source jsonb not null default '{}',
  b2c_consumer_demand jsonb not null default '{}',
  space_environmental jsonb not null default '{}',
  tenant_operator_management jsonb not null default '{}',
  ai_answer_document_contract jsonb not null default '{}',

  readiness_status text not null default 'lite_imported'
    check (readiness_status in ('lite_imported','needs_data','im_lite_ready','full_im_draft_ready','buyer_ready_candidate')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index building_ssot_full_lite_id_idx on building_ssot_full(source_building_ssot_lite_id);
create index building_ssot_full_created_by_idx on building_ssot_full(created_by);

alter table building_ssot_full enable row level security;

create policy "bssot_full_select_own"
  on building_ssot_full for select
  to authenticated
  using (created_by = auth.uid());

create policy "bssot_full_insert_own"
  on building_ssot_full for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "bssot_full_update_own"
  on building_ssot_full for update
  to authenticated
  using (created_by = auth.uid());

create policy "bssot_full_admin_select"
  on building_ssot_full for select
  to authenticated
  using (is_admin());

create trigger building_ssot_full_updated_at
  before update on building_ssot_full
  for each row execute function set_updated_at();

-- ============================================================
-- 4. handoff_source_snapshots
-- Immutable record of what was imported (never mutates MVP data)
-- ============================================================

create table handoff_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null references full_im_handoffs(id) on delete restrict,

  source_app text not null default 'js-building-ssot-mvp',
  contracts_version text not null,
  payload_version text not null,

  source_building_ssot_lite_id uuid not null,
  source_objects jsonb not null default '{}',  -- frozen snapshot of source data at import time

  imported_by uuid references profiles(id) on delete set null,
  imported_at timestamptz not null default now(),

  import_status text not null default 'imported'
    check (import_status in ('pending','imported','imported_with_warnings','failed')),
  warnings text[] not null default '{}'
);

create index handoff_snapshots_handoff_id_idx on handoff_source_snapshots(handoff_id);
create index handoff_snapshots_building_id_idx on handoff_source_snapshots(source_building_ssot_lite_id);

alter table handoff_source_snapshots enable row level security;

create policy "snapshots_select_own"
  on handoff_source_snapshots for select
  to authenticated
  using (imported_by = auth.uid());

create policy "snapshots_admin_select"
  on handoff_source_snapshots for select
  to authenticated
  using (is_admin());

-- ============================================================
-- 5. im_projects
-- Full IM production projects
-- ============================================================

create table im_projects (
  id uuid primary key default gen_random_uuid(),
  source_app text not null default 'js-full-im-studio'
    check (source_app in ('js-building-ssot-mvp','js-full-im-studio','manual')),
  source_building_ssot_lite_id uuid references building_ssot_lite(id) on delete set null,
  building_ssot_full_id uuid references building_ssot_full(id) on delete restrict,
  handoff_id uuid references full_im_handoffs(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  project_owner_id uuid references profiles(id) on delete set null,

  project_type text not null
    check (project_type in ('ai_self_authoring','ai_expert_review','expert_full_build','dealroom_ready_package')),
  target_output text not null
    check (target_output in ('external_snapshot','im_lite','buyer_ready_full_im','dealroom_ready_package')),
  status text not null default 'intake'
    check (status in ('intake','ssot_building','readiness_checked','outline_generated','ai_draft','expert_patch','gate_review','client_review','buyer_ready','exported','dealroom_published','archived','blocked')),

  readiness_score int check (readiness_score >= 0 and readiness_score <= 100),
  required_expert_patches text[] not null default '{}',
  source_document_ids uuid[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index im_projects_building_id_idx on im_projects(source_building_ssot_lite_id);
create index im_projects_full_id_idx on im_projects(building_ssot_full_id);
create index im_projects_created_by_idx on im_projects(created_by);
create index im_projects_status_idx on im_projects(status);

alter table im_projects enable row level security;

create policy "im_projects_select_own"
  on im_projects for select
  to authenticated
  using (created_by = auth.uid());

create policy "im_projects_insert_own"
  on im_projects for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "im_projects_update_own"
  on im_projects for update
  to authenticated
  using (created_by = auth.uid());

create policy "im_projects_admin_select"
  on im_projects for select
  to authenticated
  using (is_admin());

create trigger im_projects_updated_at
  before update on im_projects
  for each row execute function set_updated_at();

-- ============================================================
-- Done. Migration 00003 complete.
-- ============================================================
