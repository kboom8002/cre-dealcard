-- ============================================================
-- Migration 00008: Matching Engine, CasePack, Deal Pipeline
-- Implements JS-Oracle → cre-dealcard upgrade (Phase 1-3)
-- ============================================================

-- ── match_results ─────────────────────────────────────────
create table if not exists match_results (
  id                    uuid primary key default gen_random_uuid(),
  building_ssot_lite_id uuid references building_ssot_lite(id) on delete cascade,
  buyer_intent_lite_id  uuid references buyer_intent_lite(id)  on delete cascade,
  broker_id             uuid references profiles(id)            on delete cascade,
  grade                 text not null check (grade in ('S','A','B','C')),
  score                 numeric(5,2) not null default 0,
  stage1_passed         boolean not null default false,
  stage2_similarity     numeric(6,5),        -- cosine 0-1
  stage3_score          numeric(5,2),
  reasoning             text,
  purpose_weight_profile text,               -- '사옥'|'투자'|'증여'|'default'
  created_at            timestamptz not null default now()
);

create index match_results_building_idx on match_results(building_ssot_lite_id);
create index match_results_buyer_idx    on match_results(buyer_intent_lite_id);
create index match_results_broker_idx   on match_results(broker_id);
create index match_results_grade_idx    on match_results(grade);

alter table match_results enable row level security;

create policy "match_results_broker_own"
  on match_results for all to authenticated
  using (broker_id = auth.uid());

-- ── promotion score columns on building_ssot_lite ────────
alter table building_ssot_lite
  add column if not exists promotion_score        numeric(6,4) not null default 0,
  add column if not exists promotion_updated_at   timestamptz,
  add column if not exists matched_buyer_count    integer      not null default 0,
  add column if not exists vacancy_inquiry_count  integer      not null default 0,
  add column if not exists vacancy_avg_fit_score  numeric(5,2),
  add column if not exists vacancy_demand_verified boolean     not null default false;

create index if not exists building_ssot_lite_promo_idx
  on building_ssot_lite(promotion_score desc);

-- ── deal_casepacks ────────────────────────────────────────
create table if not exists deal_casepacks (
  id                    uuid primary key default gen_random_uuid(),
  building_ssot_lite_id uuid references building_ssot_lite(id) on delete cascade,
  broker_id             uuid references profiles(id)            on delete cascade,
  task                  text not null,
  knowledge             text,
  warning               text,
  output                text,
  audience              text,
  situation             text,
  logic                 text,
  format                text,
  source_event_type     text not null
    check (source_event_type in (
      'deal_card_created','im_created','match_computed',
      'gate_requested','space_ai_triggered'
    )),
  created_at            timestamptz not null default now()
);

create index deal_casepacks_building_idx on deal_casepacks(building_ssot_lite_id);
create index deal_casepacks_broker_idx   on deal_casepacks(broker_id);

alter table deal_casepacks enable row level security;

create policy "casepacks_broker_own"
  on deal_casepacks for all to authenticated
  using (broker_id = auth.uid());

-- ── deal_pipeline_states ──────────────────────────────────
create type deal_stage as enum (
  'memo_input','deal_card_created','gate_requested',
  'im_created','buyer_meeting','loi','contract','closed','failed'
);

create table if not exists deal_pipeline_states (
  id                    uuid primary key default gen_random_uuid(),
  building_ssot_lite_id uuid references building_ssot_lite(id) on delete cascade,
  broker_id             uuid references profiles(id)            on delete cascade,
  stage                 deal_stage not null default 'memo_input',
  entered_at            timestamptz not null default now(),
  metadata              jsonb        not null default '{}',
  updated_at            timestamptz not null default now()
);

create index deal_pipeline_building_idx on deal_pipeline_states(building_ssot_lite_id);
create index deal_pipeline_stage_idx    on deal_pipeline_states(stage);
create index deal_pipeline_broker_idx   on deal_pipeline_states(broker_id);

alter table deal_pipeline_states enable row level security;

create policy "pipeline_broker_own"
  on deal_pipeline_states for all to authenticated
  using (broker_id = auth.uid());

create trigger deal_pipeline_updated_at
  before update on deal_pipeline_states
  for each row execute function set_updated_at();

-- ── hold_days view ────────────────────────────────────────
create or replace view deal_pipeline_with_hold as
select
  dps.*,
  extract(day from now() - dps.entered_at)::integer as hold_days
from deal_pipeline_states dps;
