-- ============================================================
-- Migration 00007: Space AI Page Schema Merge
-- Creates tables required by cre-aipage in the shared unified database.
-- Carefully skips tables that already exist in cre-dealcard (profiles, activity_events, ai_runs, full_im_handoffs).
-- ============================================================

-- 01. Organizations
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_type text check (org_type in ('brokerage','owner','pm','js_internal','other')) default 'other',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Profiles (Alter existing)
alter table profiles add column if not exists organization_id uuid references organizations(id);
-- We relax the check constraint on role to allow both MVP and Aipage roles
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check 
  check (role in ('public_user','broker','admin','expert','owner','pm_manager','tenant_prospect','js_operator'));

-- 02. Buildings (aipage specific)
create table if not exists buildings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  external_building_ssot_id text,
  display_name text,
  blind_name text,
  area_signal text,
  address_public_level text check (address_public_level in ('area_only','street_level','building_level','exact_address','hidden')) default 'area_only',
  public_summary text,
  source_app text default 'js-space-ai-page',
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 03. Spaces
create table if not exists spaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  building_id uuid references buildings(id),
  building_ssot_lite_id uuid, -- from dealcard integration
  source_full_im_project_id uuid, -- from full im trigger

  status text check (status in ('draft','intake','needs_photos','visual_classified','page_generated','published','leased','archived','blocked')) default 'draft',

  display_name text,
  blind_name text,
  floor text,
  unit_name text,
  space_type text,
  area_private_py numeric,
  area_supply_py numeric,
  available_from text,

  deposit_krw bigint,
  monthly_rent_krw bigint,
  maintenance_fee_krw bigint,
  premium_krw bigint,
  terms_public_allowed boolean default true,

  identity jsonb default '{}'::jsonb,
  lease_terms jsonb default '{}'::jsonb,
  physical jsonb default '{}'::jsonb,
  facility jsonb default '{}'::jsonb,
  access_flow jsonb default '{}'::jsonb,
  marketing jsonb default '{}'::jsonb,
  tenant_constraints jsonb default '{}'::jsonb,
  visual_summary jsonb default '{}'::jsonb,

  missing_data jsonb default '[]'::jsonb,
  risk_notes jsonb default '[]'::jsonb,
  disclosure jsonb default '{}'::jsonb,

  confidence text default 'unknown',
  source_app text check (source_app IN ('js-mvp', 'js-space-ai-page', 'js-full-im-studio', 'manual')) default 'js-space-ai-page',
  source_object_id text,

  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists space_ssot_snapshots (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references spaces(id) on delete cascade,
  snapshot_type text check (snapshot_type in ('manual','ai_structured','publish','handoff','system')) default 'manual',
  snapshot_json jsonb not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- 04. Visual Evidence
create table if not exists visual_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  building_id uuid references buildings(id),
  space_id uuid references spaces(id) on delete cascade,

  storage_bucket text not null,
  storage_path text not null,
  public_url text,
  thumbnail_url text,

  status text check (status in ('uploaded','processing','classified','needs_review','public_ready','private_only','blocked')) default 'uploaded',

  capture_scope text default 'unknown',
  capture_subject text default 'unknown',
  quality jsonb default '{}'::jsonb,

  tags jsonb default '[]'::jsonb,
  facility_tags jsonb default '[]'::jsonb,
  risk_tags jsonb default '[]'::jsonb,
  vibe_tags jsonb default '[]'::jsonb,
  tenant_relevance jsonb default '[]'::jsonb,
  answers_questions jsonb default '[]'::jsonb,

  visibility text default 'broker_internal',
  confidence text default 'unknown',

  ai_generated boolean default false,
  model text,
  prompt_version text,

  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists visual_albums (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  building_id uuid references buildings(id),
  space_id uuid references spaces(id) on delete cascade,

  album_type text not null,
  target_tenant_type text,
  target_question text,
  title text not null,
  description text,

  visibility text default 'public_blind',
  status text check (status in ('draft','generated','reviewed','published','private_only','blocked')) default 'draft',

  source_refs jsonb default '[]'::jsonb,
  confidence text default 'unknown',

  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists visual_album_items (
  id uuid primary key default gen_random_uuid(),
  album_id uuid references visual_albums(id) on delete cascade,
  visual_asset_id uuid references visual_assets(id) on delete cascade,
  sort_order integer default 0,
  caption text,
  created_at timestamptz default now(),
  unique(album_id, visual_asset_id)
);

create table if not exists visual_answer_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  space_id uuid references spaces(id) on delete cascade,
  album_id uuid references visual_albums(id),

  question text not null,
  short_answer text not null,
  detailed_answer text,

  linked_image_ids jsonb default '[]'::jsonb,
  related_tenant_types jsonb default '[]'::jsonb,

  evidence_strength text check (evidence_strength in ('strong','medium','weak','insufficient')) default 'insufficient',
  missing_checks jsonb default '[]'::jsonb,
  boundary_note text,

  visibility text default 'public_blind',
  status text check (status in ('draft','generated','reviewed','published','blocked')) default 'draft',

  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists missing_shot_requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references spaces(id) on delete cascade,
  request_type text not null,
  target_question text not null,
  reason text not null,
  priority text check (priority in ('low','medium','high')) default 'medium',
  status text check (status in ('open','uploaded','resolved','dismissed')) default 'open',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 05. Tenant Fit & Vibe
create table if not exists tenant_fit_results (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references spaces(id) on delete cascade,
  target_tenant_type text not null,
  fit_level text check (fit_level in ('high_potential','medium_potential','limited_potential','weak_fit','unknown')) not null,
  fit_score integer check (fit_score >= 0 and fit_score <= 100),

  strengths jsonb default '[]'::jsonb,
  check_needed jsonb default '[]'::jsonb,
  weaker_points jsonb default '[]'::jsonb,
  required_facility_checks jsonb default '[]'::jsonb,
  legal_or_permit_checks jsonb default '[]'::jsonb,
  suggested_visual_album_ids jsonb default '[]'::jsonb,

  safe_summary text not null,
  boundary_note text not null,

  source_refs jsonb default '[]'::jsonb,
  confidence text default 'unknown',
  ai_generated boolean default true,
  model text,
  prompt_version text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists vibe_fit_results (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references spaces(id) on delete cascade,

  vibe_summary text not null,
  vibe_tags jsonb default '[]'::jsonb,
  vad jsonb default '{}'::jsonb,
  tenant_vibe_alignment jsonb default '[]'::jsonb,
  mixed_signal_risks jsonb default '[]'::jsonb,
  retrofit_vibe_opportunities jsonb default '[]'::jsonb,
  missing_evidence jsonb default '[]'::jsonb,

  boundary_note text not null,
  confidence text default 'photo_based_inference',

  ai_generated boolean default true,
  model text,
  prompt_version text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 06. Leasing Pages
create table if not exists leasing_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id),
  building_id uuid references buildings(id),
  space_id uuid references spaces(id) on delete cascade,

  slug text unique not null,

  status text check (status in ('draft','generated','review_required','published','unpublished','archived','blocked')) default 'draft',
  visibility text default 'public_blind',

  title text not null,
  subtitle text,
  answer_hero text not null,

  target_tenant_types jsonb default '[]'::jsonb,
  visual_album_ids jsonb default '[]'::jsonb,
  tenant_fit_result_ids jsonb default '[]'::jsonb,
  vibe_fit_result_id uuid references vibe_fit_results(id),

  inquiry_form_enabled boolean default true,
  boundary_note text not null,
  seo jsonb default '{}'::jsonb,

  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  published_at timestamptz
);

create table if not exists leasing_page_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid references leasing_pages(id) on delete cascade,

  section_type text not null,
  title text not null,
  sort_order integer not null,
  markdown text,
  content_json jsonb default '{}'::jsonb,

  linked_album_ids jsonb default '[]'::jsonb,
  linked_visual_asset_ids jsonb default '[]'::jsonb,

  visibility text default 'public_blind',
  status text check (status in ('draft','generated','reviewed','published','blocked')) default 'draft',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists campaign_copies (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references spaces(id) on delete cascade,
  leasing_page_id uuid references leasing_pages(id),

  copy_type text check (copy_type in ('kakao','naver_listing','sms','instagram_caption','tenant_specific_pitch','owner_summary')) not null,
  target_tenant_type text,
  title text,
  body text not null,

  status text check (status in ('generated','copied','edited','archived','blocked')) default 'generated',
  boundary_note text,

  ai_generated boolean default true,
  model text,
  prompt_version text,

  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 07. Inquiries
create table if not exists leasing_inquiries (
  id uuid primary key default gen_random_uuid(),
  leasing_page_id uuid references leasing_pages(id),
  space_id uuid references spaces(id) on delete cascade,
  building_id uuid references buildings(id),

  status text check (status in ('submitted','qualified','contacted','tour_requested','tour_scheduled','tour_completed','not_fit','closed','archived')) default 'submitted',

  prospect jsonb default '{}'::jsonb,
  requirement jsonb default '{}'::jsonb,
  question_text text,
  source_channel text default 'leasing_page',
  consent jsonb default '{}'::jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists inquiry_qualifications (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid references leasing_inquiries(id) on delete cascade,
  space_id uuid references spaces(id) on delete cascade,

  fit_estimate text check (fit_estimate in ('strong','moderate','weak','not_enough_info')) default 'not_enough_info',
  summary text not null,
  budget_fit text default 'unknown',
  timing_fit text default 'unknown',
  facility_fit text default 'unknown',

  key_concerns jsonb default '[]'::jsonb,
  recommended_next_action text not null,
  kakao_reply_draft text,
  missing_info_to_ask jsonb default '[]'::jsonb,

  ai_generated boolean default true,
  model text,
  prompt_version text,

  created_at timestamptz default now()
);

-- 08. Handoffs
create table if not exists mvp_handoffs (
  id uuid primary key default gen_random_uuid(),
  source_app text default 'js-mvp',
  target_app text default 'js-space-ai-page',
  payload_version text not null,
  status text check (status in ('created','imported','expired','blocked','failed')) default 'created',
  payload_json jsonb not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  expires_at timestamptz
);

-- ai_runs alter
alter table ai_runs add column if not exists space_id uuid references spaces(id);
alter table ai_runs add column if not exists entity_type text;
alter table ai_runs add column if not exists entity_id uuid;
alter table ai_runs add column if not exists agent_name text;
alter table ai_runs add column if not exists input_summary jsonb default '{}'::jsonb;
alter table ai_runs add column if not exists output_summary jsonb default '{}'::jsonb;
alter table ai_runs add column if not exists completed_at timestamptz;

create table if not exists processing_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  entity_type text not null,
  entity_id uuid,
  status text check (status in ('queued','processing','completed','failed','blocked')) default 'queued',
  payload_json jsonb default '{}'::jsonb,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
