-- ============================================================
-- JS Building SSoT MVP v0.1 — Schema Migration
-- Tables, indexes, RLS policies, and triggers
-- Source: docs/07-database-schema.md, docs/12-security-rls-storage.md
-- ============================================================

-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";
-- vector can be enabled later for semantic search
-- create extension if not exists "vector";

-- ============================================================
-- Common trigger function for updated_at
-- ============================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- Helper: check if current user has admin role in profiles
-- Used by admin RLS policies
-- ============================================================

create or replace function is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql security definer stable;

-- ============================================================
-- 1. profiles
-- ============================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'public_user'
    check (role in ('public_user','broker','admin','expert')),
  display_name text,
  phone text,
  company text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on profiles(role);

alter table profiles enable row level security;

create policy "profiles_select_own"
  on profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_update_own"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_insert_own"
  on profiles for insert
  to authenticated
  with check (id = auth.uid());

create trigger profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- ============================================================
-- 2. broker_profiles
-- ============================================================

create table broker_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  specialty_regions text[] not null default '{}',
  specialty_assets text[] not null default '{}',
  bio text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index broker_profiles_user_id_idx on broker_profiles(user_id);

alter table broker_profiles enable row level security;

create policy "broker_profiles_select_own"
  on broker_profiles for select
  to authenticated
  using (user_id = auth.uid());

create policy "broker_profiles_insert_own"
  on broker_profiles for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "broker_profiles_update_own"
  on broker_profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger broker_profiles_updated_at
  before update on broker_profiles
  for each row execute function set_updated_at();

-- ============================================================
-- 3. building_ssot_lite
-- ============================================================

create table building_ssot_lite (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null,
  created_by_role text not null default 'public_user',
  input_type text not null
    check (input_type in ('address','broker_memo','voice_note','manual_form')),
  raw_input text not null,

  area_signal text,
  asset_type text,
  price_band text,
  size_signal text,
  current_use_signal text,
  vacancy_signal text,
  fit_summary text,
  caution_summary text,
  hidden_fields text[] not null default '{}',

  layers jsonb not null default '{}',
  confidence jsonb not null default '{}',
  disclosure jsonb not null default '{}',

  status text not null default 'draft'
    check (status in ('draft','public_signal_ready','snapshot_draft_ready','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index building_ssot_lite_owner_id_idx on building_ssot_lite(owner_id);
create index building_ssot_lite_status_idx on building_ssot_lite(status);
create index building_ssot_lite_asset_type_idx on building_ssot_lite(asset_type);
create index building_ssot_lite_created_at_idx on building_ssot_lite(created_at desc);

alter table building_ssot_lite enable row level security;

-- Authenticated users can read their own rows
create policy "building_ssot_select_own"
  on building_ssot_lite for select
  to authenticated
  using (owner_id = auth.uid());

-- Authenticated users can insert their own rows
create policy "building_ssot_insert_own"
  on building_ssot_lite for insert
  to authenticated
  with check (owner_id = auth.uid());

-- Authenticated users can update their own rows
create policy "building_ssot_update_own"
  on building_ssot_lite for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Admin can read all rows for review
create policy "building_ssot_admin_select"
  on building_ssot_lite for select
  to authenticated
  using (is_admin());

create trigger building_ssot_lite_updated_at
  before update on building_ssot_lite
  for each row execute function set_updated_at();

-- ============================================================
-- 4. building_signal_cards
-- ============================================================

create table building_signal_cards (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references building_ssot_lite(id) on delete cascade,
  owner_id uuid references profiles(id) on delete set null,
  title text not null,
  area_signal text,
  asset_type text,
  price_band text,
  deal_points text[] not null default '{}',
  caution_points text[] not null default '{}',
  buyer_fit_types text[] not null default '{}',
  visibility text not null default 'public_blind'
    check (visibility in ('public','public_blind','gate_restricted','internal_only')),
  status text not null default 'draft'
    check (status in ('draft','disclosure_checked','broker_reviewed','approved_internal','shared_external','archived')),
  body jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index building_signal_cards_building_id_idx on building_signal_cards(building_id);
create index building_signal_cards_owner_id_idx on building_signal_cards(owner_id);
create index building_signal_cards_visibility_idx on building_signal_cards(visibility);

alter table building_signal_cards enable row level security;

create policy "signal_cards_select_own"
  on building_signal_cards for select
  to authenticated
  using (owner_id = auth.uid());

create policy "signal_cards_insert_own"
  on building_signal_cards for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "signal_cards_update_own"
  on building_signal_cards for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "signal_cards_admin_select"
  on building_signal_cards for select
  to authenticated
  using (is_admin());

create trigger building_signal_cards_updated_at
  before update on building_signal_cards
  for each row execute function set_updated_at();

-- ============================================================
-- 5. buyer_intent_lite
-- ============================================================

create table buyer_intent_lite (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null,
  raw_input text not null,
  buyer_type text,
  budget_min numeric,
  budget_max numeric,
  budget_display text,
  preferred_regions text[] not null default '{}',
  asset_types text[] not null default '{}',
  purchase_purpose text,
  must_have text[] not null default '{}',
  nice_to_have text[] not null default '{}',
  risk_tolerance text default 'unknown'
    check (risk_tolerance in ('low','medium','high','unknown')),
  financing_note text,
  visibility text not null default 'private'
    check (visibility in ('private','broker_only','anonymous_matchable')),
  normalized jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index buyer_intent_lite_owner_id_idx on buyer_intent_lite(owner_id);
create index buyer_intent_lite_budget_min_idx on buyer_intent_lite(budget_min);
create index buyer_intent_lite_budget_max_idx on buyer_intent_lite(budget_max);

alter table buyer_intent_lite enable row level security;

create policy "buyer_intent_select_own"
  on buyer_intent_lite for select
  to authenticated
  using (owner_id = auth.uid());

create policy "buyer_intent_insert_own"
  on buyer_intent_lite for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "buyer_intent_update_own"
  on buyer_intent_lite for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create trigger buyer_intent_lite_updated_at
  before update on buyer_intent_lite
  for each row execute function set_updated_at();

-- ============================================================
-- 6. owner_readiness_checks
-- ============================================================

create table owner_readiness_checks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null,
  building_id uuid references building_ssot_lite(id) on delete set null,
  checklist jsonb not null default '{}',
  readiness_score int not null default 0
    check (readiness_score >= 0 and readiness_score <= 100),
  available_outputs text[] not null default '{}',
  missing_data text[] not null default '{}',
  next_recommended_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index owner_readiness_checks_owner_id_idx on owner_readiness_checks(owner_id);
create index owner_readiness_checks_building_id_idx on owner_readiness_checks(building_id);

alter table owner_readiness_checks enable row level security;

create policy "readiness_select_own"
  on owner_readiness_checks for select
  to authenticated
  using (owner_id = auth.uid());

create policy "readiness_insert_own"
  on owner_readiness_checks for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "readiness_update_own"
  on owner_readiness_checks for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create trigger owner_readiness_checks_updated_at
  before update on owner_readiness_checks
  for each row execute function set_updated_at();

-- ============================================================
-- 7. document_objects
-- ============================================================

create table document_objects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null,
  source_type text not null
    check (source_type in ('building_ssot_lite','buyer_intent_lite','owner_readiness_check','gate_request','manual')),
  source_id uuid,
  building_id uuid references building_ssot_lite(id) on delete set null,
  document_type text not null
    check (document_type in ('deal_curiosity_report','blind_teaser','buyer_fit_memo','owner_prep_memo','missing_data_checklist','gate_request_note')),
  visibility text not null default 'internal_only'
    check (visibility in ('public','public_blind','gate_restricted','internal_only','private_truth')),
  status text not null default 'draft'
    check (status in ('draft','disclosure_checked','broker_reviewed','approved_internal','shared_external','archived')),
  title text,
  body jsonb not null default '{}',
  markdown text,
  source_refs jsonb not null default '{}',
  model_version text,
  prompt_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index document_objects_owner_id_idx on document_objects(owner_id);
create index document_objects_building_id_idx on document_objects(building_id);
create index document_objects_document_type_idx on document_objects(document_type);
create index document_objects_status_idx on document_objects(status);

alter table document_objects enable row level security;

create policy "documents_select_own"
  on document_objects for select
  to authenticated
  using (owner_id = auth.uid());

create policy "documents_insert_own"
  on document_objects for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "documents_update_own"
  on document_objects for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "documents_admin_select"
  on document_objects for select
  to authenticated
  using (is_admin());

create trigger document_objects_updated_at
  before update on document_objects
  for each row execute function set_updated_at();

-- ============================================================
-- 8. gate_requests
-- ============================================================

create table gate_requests (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references building_ssot_lite(id) on delete cascade,
  requester_id uuid references profiles(id) on delete set null,
  target_broker_id uuid references profiles(id) on delete set null,
  requested_level text not null
    check (requested_level in ('G1','G2','G3')),
  requested_fields text[] not null default '{}',
  reason text,
  status text not null default 'submitted'
    check (status in ('submitted','broker_review','approved','rejected','expired')),
  reviewer_id uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index gate_requests_building_id_idx on gate_requests(building_id);
create index gate_requests_requester_id_idx on gate_requests(requester_id);
create index gate_requests_status_idx on gate_requests(status);
create index gate_requests_created_at_idx on gate_requests(created_at desc);

alter table gate_requests enable row level security;

-- Requester can read own gate requests
create policy "gate_requests_select_own"
  on gate_requests for select
  to authenticated
  using (requester_id = auth.uid());

-- Requester can insert gate requests
create policy "gate_requests_insert_own"
  on gate_requests for insert
  to authenticated
  with check (requester_id = auth.uid());

-- Admin can read all gate requests for review
create policy "gate_requests_admin_select"
  on gate_requests for select
  to authenticated
  using (is_admin());

-- Admin can update gate requests (approve/reject)
create policy "gate_requests_admin_update"
  on gate_requests for update
  to authenticated
  using (is_admin());

create trigger gate_requests_updated_at
  before update on gate_requests
  for each row execute function set_updated_at();

-- ============================================================
-- 9. expert_note_requests
-- ============================================================

create table expert_note_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  building_id uuid references building_ssot_lite(id) on delete set null,
  request_type text not null default 'expert_3_line_note',
  user_goal text,
  contact jsonb not null default '{}',
  ai_report_id uuid references document_objects(id) on delete set null,
  status text not null default 'requested'
    check (status in ('requested','in_review','completed','cancelled')),
  expert_note text,
  next_recommendation text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index expert_note_requests_user_id_idx on expert_note_requests(user_id);
create index expert_note_requests_building_id_idx on expert_note_requests(building_id);
create index expert_note_requests_status_idx on expert_note_requests(status);

alter table expert_note_requests enable row level security;

-- User can read own requests
create policy "expert_notes_select_own"
  on expert_note_requests for select
  to authenticated
  using (user_id = auth.uid());

-- User can insert own requests
create policy "expert_notes_insert_own"
  on expert_note_requests for insert
  to authenticated
  with check (user_id = auth.uid());

-- Admin can read all for review queue
create policy "expert_notes_admin_select"
  on expert_note_requests for select
  to authenticated
  using (is_admin());

-- Admin can update (complete/cancel)
create policy "expert_notes_admin_update"
  on expert_note_requests for update
  to authenticated
  using (is_admin());

-- ============================================================
-- 10. evidence_files
-- ============================================================

create table evidence_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null,
  building_id uuid references building_ssot_lite(id) on delete set null,
  file_type text,
  storage_bucket text not null default 'evidence-private',
  storage_path text not null,
  visibility text not null default 'private'
    check (visibility in ('private','expert_only','gate_restricted','public_redacted')),
  contains_sensitive_data boolean not null default true,
  training_allowed boolean not null default false,
  created_at timestamptz not null default now()
);

create index evidence_files_owner_id_idx on evidence_files(owner_id);
create index evidence_files_building_id_idx on evidence_files(building_id);

alter table evidence_files enable row level security;

-- Owner can read own files
create policy "evidence_select_own"
  on evidence_files for select
  to authenticated
  using (owner_id = auth.uid());

-- Owner can insert own files
create policy "evidence_insert_own"
  on evidence_files for insert
  to authenticated
  with check (owner_id = auth.uid());

-- ============================================================
-- 11. activity_events
-- ============================================================

create table activity_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  actor_role text,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index activity_events_actor_id_idx on activity_events(actor_id);
create index activity_events_event_type_idx on activity_events(event_type);
create index activity_events_entity_idx on activity_events(entity_type, entity_id);
create index activity_events_created_at_idx on activity_events(created_at desc);

alter table activity_events enable row level security;

-- Users can read own events
create policy "events_select_own"
  on activity_events for select
  to authenticated
  using (actor_id = auth.uid());

-- Users can insert events (server-side service will typically use service_role)
create policy "events_insert_authenticated"
  on activity_events for insert
  to authenticated
  with check (true);

-- Admin can read all events for analytics
create policy "events_admin_select"
  on activity_events for select
  to authenticated
  using (is_admin());

-- ============================================================
-- 12. ai_runs
-- ============================================================

create table ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  run_type text not null,
  input_ref jsonb not null default '{}',
  output_ref jsonb not null default '{}',
  model text,
  prompt_version text,
  status text not null default 'started'
    check (status in ('started','completed','failed')),
  token_usage jsonb not null default '{}',
  latency_ms int,
  error text,
  created_at timestamptz not null default now()
);

create index ai_runs_user_id_idx on ai_runs(user_id);
create index ai_runs_run_type_idx on ai_runs(run_type);
create index ai_runs_status_idx on ai_runs(status);
create index ai_runs_created_at_idx on ai_runs(created_at desc);

alter table ai_runs enable row level security;

-- Users can read own AI runs
create policy "ai_runs_select_own"
  on ai_runs for select
  to authenticated
  using (user_id = auth.uid());

-- Insert allowed for authenticated (server service creates these)
create policy "ai_runs_insert_authenticated"
  on ai_runs for insert
  to authenticated
  with check (true);

-- Admin can read all AI runs
create policy "ai_runs_admin_select"
  on ai_runs for select
  to authenticated
  using (is_admin());

-- ============================================================
-- Done. All 12 MVP tables created with RLS enabled.
-- ============================================================
