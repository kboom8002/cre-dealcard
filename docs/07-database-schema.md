# 07. Database Schema — JS Building SSoT MVP v0.1

## 1. Purpose

This document defines the Supabase Postgres schema for JS Building SSoT MVP v0.1.

The database is the source of truth for:

```text
profiles
broker profiles
building SSoT Lite
building signal cards
buyer intents
owner readiness checks
documents
gate requests
expert note requests
evidence files
activity events
AI run logs
```

The schema must support the core product loop:

```text
input
→ building_ssot_lite
→ building_signal_card
→ document_object
→ gate_request_lite / expert_note_request
→ activity_event
```

## 2. Schema Principles

```text
1. Every exposed table must have RLS enabled.
2. Public/blind output must be separated from private truth.
3. AI-generated output is stored as draft by default.
4. Every important mutation must create activity_event.
5. Evidence files are metadata rows linked to Supabase Storage paths.
6. Prompt/model output must be traceable through ai_runs.
7. Use JSONB for flexible early-stage domain layers, but core routing fields should be columns.
```

## 3. Extensions

Recommended Supabase/Postgres extensions:

```sql
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";
create extension if not exists "vector";
```

`vector` can be unused in v0.1 but should be available for future semantic search.

---

# 4. Table: profiles

## Purpose

Stores user profile and role information associated with Supabase Auth users.

## Columns

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'public_user' check (role in ('public_user','broker','admin','expert')),
  display_name text,
  phone text,
  company text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## Indexes

```sql
create index profiles_role_idx on profiles(role);
```

## RLS

```sql
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
```

## Acceptance Criteria

- Authenticated users can read/update their own profile.
- Users cannot read other users' profiles unless admin policy is added.

---

# 5. Table: broker_profiles

## Purpose

Stores broker-specific profile information for JS/internal/external broker workflows.

## Columns

```sql
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
```

## Indexes

```sql
create index broker_profiles_user_id_idx on broker_profiles(user_id);
```

## RLS

```sql
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
```

---

# 6. Table: building_ssot_lite

## Purpose

The central MVP object. Stores minimal AI-ready building truth created from address, memo, or broker input.

It is not a full Building SSoT. It is the MVP version used to generate public signal, blind teaser, reports, and early gate requests.

## Columns

```sql
create table building_ssot_lite (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null,
  created_by_role text not null default 'public_user',
  input_type text not null check (input_type in ('address','broker_memo','voice_note','manual_form')),
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

  status text not null default 'draft' check (status in ('draft','public_signal_ready','snapshot_draft_ready','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## Indexes

```sql
create index building_ssot_lite_owner_id_idx on building_ssot_lite(owner_id);
create index building_ssot_lite_status_idx on building_ssot_lite(status);
create index building_ssot_lite_asset_type_idx on building_ssot_lite(asset_type);
create index building_ssot_lite_created_at_idx on building_ssot_lite(created_at desc);
```

## RLS

```sql
alter table building_ssot_lite enable row level security;

create policy "building_ssot_select_own"
on building_ssot_lite for select
to authenticated
using (owner_id = auth.uid());

create policy "building_ssot_insert_own"
on building_ssot_lite for insert
to authenticated
with check (owner_id = auth.uid());

create policy "building_ssot_update_own"
on building_ssot_lite for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());
```

For anonymous public reports, the app may use a server-side service layer to create rows with `owner_id = null` and return a signed/result token. Do not expose anonymous rows directly via broad public select policy.

## Example Row

```json
{
  "input_type": "broker_memo",
  "raw_input": "성수동 80억대 근생, 일부 임대 중, 사옥 가능성...",
  "area_signal": "성수·뚝섬권",
  "asset_type": "근생 꼬마빌딩",
  "price_band": "80억대",
  "current_use_signal": "일부 임대 중",
  "fit_summary": "사옥+부분임대형 매수자에게 검토 가치가 있을 수 있음",
  "caution_summary": "임대차, 주차, 위반건축물 여부 확인 필요",
  "hidden_fields": ["exact_address", "tenant_name", "unit_rent", "seller_motivation"],
  "status": "public_signal_ready"
}
```

## Acceptance Criteria

- A building_ssot_lite row is created for every radar/deal-card flow.
- hidden_fields stores sensitive classes detected by Disclosure Guard.
- public/blind outputs do not read private raw details directly.

---

# 7. Table: building_signal_cards

## Purpose

Stores public/blind-safe building signal generated from building_ssot_lite.

## Columns

```sql
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
  visibility text not null default 'public_blind' check (visibility in ('public','public_blind','gate_restricted','internal_only')),
  status text not null default 'draft' check (status in ('draft','disclosure_checked','broker_reviewed','approved_internal','shared_external','archived')),
  body jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## Indexes

```sql
create index building_signal_cards_building_id_idx on building_signal_cards(building_id);
create index building_signal_cards_owner_id_idx on building_signal_cards(owner_id);
create index building_signal_cards_visibility_idx on building_signal_cards(visibility);
```

## RLS

Owner can read own cards. Public card delivery should use a specific service endpoint that returns redacted fields only.

---

# 8. Table: buyer_intent_lite

## Purpose

Stores structured buyer demand extracted from memo/form input.

## Columns

```sql
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
  risk_tolerance text check (risk_tolerance in ('low','medium','high','unknown')) default 'unknown',
  financing_note text,
  visibility text not null default 'private' check (visibility in ('private','broker_only','anonymous_matchable')),
  normalized jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## Indexes

```sql
create index buyer_intent_lite_owner_id_idx on buyer_intent_lite(owner_id);
create index buyer_intent_lite_budget_min_idx on buyer_intent_lite(budget_min);
create index buyer_intent_lite_budget_max_idx on buyer_intent_lite(budget_max);
```

## RLS

User/broker can access own buyer intents only. Anonymous matchable use must go through a service endpoint that strips contact/private details.

---

# 9. Table: owner_readiness_checks

## Purpose

Stores owner/building readiness checklist and score.

## Columns

```sql
create table owner_readiness_checks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null,
  building_id uuid references building_ssot_lite(id) on delete set null,
  checklist jsonb not null default '{}',
  readiness_score int not null default 0 check (readiness_score >= 0 and readiness_score <= 100),
  available_outputs text[] not null default '{}',
  missing_data text[] not null default '{}',
  next_recommended_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## Acceptance Criteria

- Score is 0–100.
- Missing data drives Full IM readiness UI.
- Check creates activity_event `owner_readiness_checked`.

---

# 10. Table: document_objects

## Purpose

Stores generated document artifacts, including reports, blind teasers, buyer memos, owner prep memos, and missing data checklists.

## Columns

```sql
create table document_objects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null,
  source_type text not null check (source_type in ('building_ssot_lite','buyer_intent_lite','owner_readiness_check','gate_request','manual')),
  source_id uuid,
  building_id uuid references building_ssot_lite(id) on delete set null,
  document_type text not null check (document_type in ('deal_curiosity_report','blind_teaser','buyer_fit_memo','owner_prep_memo','missing_data_checklist','gate_request_note')),
  visibility text not null default 'internal_only' check (visibility in ('public','public_blind','gate_restricted','internal_only','private_truth')),
  status text not null default 'draft' check (status in ('draft','disclosure_checked','broker_reviewed','approved_internal','shared_external','archived')),
  title text,
  body jsonb not null default '{}',
  markdown text,
  source_refs jsonb not null default '{}',
  model_version text,
  prompt_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## Indexes

```sql
create index document_objects_owner_id_idx on document_objects(owner_id);
create index document_objects_building_id_idx on document_objects(building_id);
create index document_objects_document_type_idx on document_objects(document_type);
create index document_objects_status_idx on document_objects(status);
```

## Acceptance Criteria

- AI documents default to `draft`.
- Every document has source_refs.
- Public/blind documents must pass disclosure guard before `shared_external`.

---

# 11. Table: gate_requests

## Purpose

Stores requests for higher-disclosure access.

## Columns

```sql
create table gate_requests (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references building_ssot_lite(id) on delete cascade,
  requester_id uuid references profiles(id) on delete set null,
  target_broker_id uuid references profiles(id) on delete set null,
  requested_level text not null check (requested_level in ('G1','G2','G3')),
  requested_fields text[] not null default '{}',
  reason text,
  status text not null default 'submitted' check (status in ('submitted','broker_review','approved','rejected','expired')),
  reviewer_id uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## Acceptance Criteria

- Protected fields are not exposed before approval.
- Create/review actions generate activity_event rows.

---

# 12. Table: expert_note_requests

## Purpose

Stores requests for expert 3-line review.

## Columns

```sql
create table expert_note_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  building_id uuid references building_ssot_lite(id) on delete set null,
  request_type text not null default 'expert_3_line_note',
  user_goal text,
  contact jsonb not null default '{}',
  ai_report_id uuid references document_objects(id) on delete set null,
  status text not null default 'requested' check (status in ('requested','in_review','completed','cancelled')),
  expert_note text,
  next_recommendation text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
```

---

# 13. Table: evidence_files

## Purpose

Stores metadata for uploaded files. Actual files live in Supabase Storage.

## Columns

```sql
create table evidence_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null,
  building_id uuid references building_ssot_lite(id) on delete set null,
  file_type text,
  storage_bucket text not null default 'evidence-private',
  storage_path text not null,
  visibility text not null default 'private' check (visibility in ('private','expert_only','gate_restricted','public_redacted')),
  contains_sensitive_data boolean not null default true,
  training_allowed boolean not null default false,
  created_at timestamptz not null default now()
);
```

---

# 14. Table: activity_events

## Purpose

Stores product analytics and audit events.

## Columns

```sql
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
```

## Indexes

```sql
create index activity_events_actor_id_idx on activity_events(actor_id);
create index activity_events_event_type_idx on activity_events(event_type);
create index activity_events_entity_idx on activity_events(entity_type, entity_id);
create index activity_events_created_at_idx on activity_events(created_at desc);
```

## Rule

Do not log raw sensitive data in metadata.

---

# 15. Table: ai_runs

## Purpose

Stores AI execution trace for debugging, prompt evaluation, and future learning.

## Columns

```sql
create table ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  run_type text not null,
  input_ref jsonb not null default '{}',
  output_ref jsonb not null default '{}',
  model text,
  prompt_version text,
  status text not null default 'started' check (status in ('started','completed','failed')),
  token_usage jsonb not null default '{}',
  latency_ms int,
  error text,
  created_at timestamptz not null default now()
);
```

---

# 16. Common Updated_at Trigger

```sql
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
```

Apply to tables with `updated_at`.

---

# 17. Acceptance Criteria

- All listed tables exist.
- All exposed tables have RLS enabled.
- Core indexes are created.
- `building_ssot_lite` is the required source object for public reports and broker deal cards.
- `document_objects` always store generated artifacts as `draft` unless reviewed.
- Every major flow can log an `activity_event`.
- Evidence metadata is separated from file storage.
- AI execution is traceable through `ai_runs`.

## 18. Non-goals

- Full organization/multi-tenant schema
- Billing tables
- Expert marketplace transaction tables
- Full dealroom tables
- Full IM section tables
- Complex vector retrieval schema
