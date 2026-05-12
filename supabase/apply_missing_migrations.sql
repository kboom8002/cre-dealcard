-- ============================================================
-- 프로덕션 DB 누락 테이블 일괄 적용 스크립트
-- cre-dealcard / Supabase SQL Editor에서 실행
--
-- 포함 내용:
--   00008_matching.sql (match_results, deal_casepacks, deal_pipeline_states)
--   00009_prediction_graph.sql (knowledge_edges, external_transactions, buyer_clusters 등)
--   00011_iot_living_data.sql (IoT, retrofit 관련)
--
-- ⚠️ pgvector(vector 타입) 의존 컬럼은 제외 — pgvector 활성화 후 별도 실행
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- [00008] match_results
-- ────────────────────────────────────────────────────────────

create table if not exists match_results (
  id                    uuid primary key default gen_random_uuid(),
  building_ssot_lite_id uuid references building_ssot_lite(id) on delete cascade,
  buyer_intent_lite_id  uuid references buyer_intent_lite(id)  on delete cascade,
  broker_id             uuid references profiles(id)            on delete set null,
  grade                 text not null check (grade in ('S','A','B','C')),
  score                 numeric(5,2) not null default 0,
  stage1_passed         boolean not null default false,
  stage2_similarity     numeric(6,5),
  stage3_score          numeric(5,2),
  reasoning             text,
  purpose_weight_profile text,
  created_at            timestamptz not null default now()
);

create index if not exists match_results_building_idx on match_results(building_ssot_lite_id);
create index if not exists match_results_buyer_idx    on match_results(buyer_intent_lite_id);
create index if not exists match_results_broker_idx   on match_results(broker_id);
create index if not exists match_results_grade_idx    on match_results(grade);

alter table match_results enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'match_results' and policyname = 'match_results_broker_own'
  ) then
    execute 'create policy "match_results_broker_own"
      on match_results for all to authenticated
      using (broker_id = auth.uid() or broker_id is null)';
  end if;
end $$;

-- building_ssot_lite에 프로모션/매칭 관련 컬럼 추가
alter table building_ssot_lite
  add column if not exists promotion_score        numeric(6,4) not null default 0,
  add column if not exists promotion_updated_at   timestamptz,
  add column if not exists matched_buyer_count    integer      not null default 0,
  add column if not exists vacancy_inquiry_count  integer      not null default 0,
  add column if not exists vacancy_avg_fit_score  numeric(5,2),
  add column if not exists vacancy_demand_verified boolean     not null default false;

create index if not exists building_ssot_lite_promo_idx
  on building_ssot_lite(promotion_score desc);

-- deal_casepacks
create table if not exists deal_casepacks (
  id                    uuid primary key default gen_random_uuid(),
  building_ssot_lite_id uuid references building_ssot_lite(id) on delete cascade,
  broker_id             uuid references profiles(id)            on delete set null,
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

create index if not exists deal_casepacks_building_idx on deal_casepacks(building_ssot_lite_id);
create index if not exists deal_casepacks_broker_idx   on deal_casepacks(broker_id);

alter table deal_casepacks enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'deal_casepacks' and policyname = 'casepacks_broker_own'
  ) then
    execute 'create policy "casepacks_broker_own"
      on deal_casepacks for all to authenticated
      using (broker_id = auth.uid() or broker_id is null)';
  end if;
end $$;

-- deal_pipeline_states
do $$ begin
  if not exists (select 1 from pg_type where typname = 'deal_stage') then
    create type deal_stage as enum (
      'memo_input','deal_card_created','gate_requested',
      'im_created','buyer_meeting','loi','contract','closed','failed'
    );
  end if;
end $$;

create table if not exists deal_pipeline_states (
  id                    uuid primary key default gen_random_uuid(),
  building_ssot_lite_id uuid references building_ssot_lite(id) on delete cascade,
  broker_id             uuid references profiles(id)            on delete set null,
  stage                 deal_stage not null default 'memo_input',
  entered_at            timestamptz not null default now(),
  metadata              jsonb        not null default '{}',
  updated_at            timestamptz not null default now()
);

create index if not exists deal_pipeline_building_idx on deal_pipeline_states(building_ssot_lite_id);
create index if not exists deal_pipeline_stage_idx    on deal_pipeline_states(stage);
create index if not exists deal_pipeline_broker_idx   on deal_pipeline_states(broker_id);

alter table deal_pipeline_states enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'deal_pipeline_states' and policyname = 'pipeline_broker_own'
  ) then
    execute 'create policy "pipeline_broker_own"
      on deal_pipeline_states for all to authenticated
      using (broker_id = auth.uid() or broker_id is null)';
  end if;
end $$;

create or replace trigger deal_pipeline_updated_at
  before update on deal_pipeline_states
  for each row execute function set_updated_at();

create or replace view deal_pipeline_with_hold as
select
  dps.*,
  extract(day from now() - dps.entered_at)::integer as hold_days
from deal_pipeline_states dps;

-- activity_events에 building_ssot_lite_id, broker_id 컬럼 추가 (없는 경우)
alter table activity_events
  add column if not exists building_ssot_lite_id uuid references building_ssot_lite(id) on delete set null,
  add column if not exists broker_id             uuid references profiles(id)            on delete set null;

create index if not exists activity_events_building_idx
  on activity_events(building_ssot_lite_id);

-- ────────────────────────────────────────────────────────────
-- [00009] Knowledge Graph + Prediction Infrastructure
-- ────────────────────────────────────────────────────────────

create table if not exists knowledge_edges (
  id         uuid    primary key default gen_random_uuid(),
  from_type  text    not null
    check (from_type in ('building','buyer','deal','space','tenant','im','market')),
  from_id    uuid    not null,
  to_type    text    not null
    check (to_type in ('building','buyer','deal','space','tenant','im','market')),
  to_id      uuid    not null,
  edge_type  text    not null
    check (edge_type in (
      'matched_with','has_deal','has_space','has_im',
      'inquired','fits','viewed','comparable_to',
      'in_district','buyer_overlap','tenant_overlap','learned_from'
    )),
  weight     numeric(5,4) not null default 0.5,
  metadata   jsonb        not null default '{}',
  created_at timestamptz  not null default now()
);

create index if not exists ke_from_idx   on knowledge_edges(from_type, from_id);
create index if not exists ke_to_idx     on knowledge_edges(to_type, to_id);
create index if not exists ke_type_idx   on knowledge_edges(edge_type);
create index if not exists ke_weight_idx on knowledge_edges(weight desc);

create unique index if not exists ke_unique_idx
  on knowledge_edges(from_type, from_id, to_type, to_id, edge_type);

alter table knowledge_edges enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'knowledge_edges' and policyname = 'ke_read_authenticated'
  ) then
    execute 'create policy "ke_read_authenticated"
      on knowledge_edges for select to authenticated using (true)';
  end if;
end $$;

-- external_transactions (국토부 실거래 데이터)
create table if not exists external_transactions (
  id                uuid    primary key default gen_random_uuid(),
  source            text    not null default 'molit',
  address           text    not null,
  district          text,
  dong              text,
  latitude          numeric(10,7),
  longitude         numeric(10,7),
  transaction_price bigint  not null,
  land_area         numeric(10,2),
  building_area     numeric(10,2),
  floors            integer,
  built_year        integer,
  parking_count     integer,
  usage_type        text,
  land_price        bigint,
  zoning            text,
  transaction_date  date    not null,
  raw_data          jsonb   default '{}',
  fetched_at        timestamptz not null default now()
);

create index if not exists ext_tx_district_idx on external_transactions(district);
create index if not exists ext_tx_price_idx    on external_transactions(transaction_price);
create index if not exists ext_tx_date_idx     on external_transactions(transaction_date);
create index if not exists ext_tx_usage_idx    on external_transactions(usage_type);

-- price_features
create table if not exists price_features (
  id                    uuid primary key default gen_random_uuid(),
  source_transaction_id uuid references external_transactions(id),
  building_ssot_lite_id uuid references building_ssot_lite(id),
  transaction_price     bigint not null,
  district_encoded      integer,
  dong_encoded          integer,
  building_area         numeric(10,2),
  land_area             numeric(10,2),
  floors                integer,
  built_year            integer,
  building_age          integer,
  parking_count         integer,
  usage_type_encoded    integer,
  district_avg_price_3m bigint,
  district_tx_count_3m  integer,
  district_price_trend  numeric(5,3),
  zoning_encoded        integer,
  created_at            timestamptz default now()
);

-- deal_conversion_features
create table if not exists deal_conversion_features (
  id                        uuid primary key default gen_random_uuid(),
  building_ssot_lite_id     uuid references building_ssot_lite(id),
  broker_id                 uuid references profiles(id),
  converted                 boolean,
  curiosity_score           numeric(5,2),
  hidden_fields_count       integer,
  best_match_grade          integer,
  avg_match_score           numeric(5,2),
  matched_buyer_count       integer,
  s_grade_count             integer,
  current_stage_ord         integer,
  total_hold_days           integer,
  avg_stage_velocity        numeric(5,2),
  promotion_score           numeric(6,4),
  vacancy_demand_verified   boolean,
  vacancy_inquiry_count     integer,
  event_count_7d            integer,
  event_count_30d           integer,
  gate_request_count        integer,
  buyer_memo_count          integer,
  casepacks_count           integer,
  missing_data_count        integer,
  days_since_creation       integer,
  has_im                    boolean,
  has_space_ai              boolean,
  buyer_cluster_id          integer,
  snapshot_at               timestamptz not null default now()
);

create index if not exists dcf_building_idx   on deal_conversion_features(building_ssot_lite_id);
create index if not exists dcf_converted_idx  on deal_conversion_features(converted);
create index if not exists dcf_snapshot_idx   on deal_conversion_features(snapshot_at);

-- buyer_intent_lite에 클러스터 컬럼 추가
alter table buyer_intent_lite
  add column if not exists cluster_id          integer,
  add column if not exists cluster_label       text,
  add column if not exists cluster_updated_at  timestamptz;

create table if not exists buyer_clusters (
  id              serial primary key,
  label           text not null,
  weight_profile  text not null
    check (weight_profile in ('사옥','투자','증여','default')),
  centroid        jsonb not null default '{}',
  member_count    integer not null default 0,
  avg_budget_min  bigint,
  avg_budget_max  bigint,
  top_regions     text[],
  top_purposes    text[],
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- [00011] IoT Living Data
-- ────────────────────────────────────────────────────────────

alter table building_ssot_lite
  add column if not exists iot_daily_footfall        integer,
  add column if not exists iot_avg_dwell_minutes     numeric(5,1),
  add column if not exists iot_peak_hour             text,
  add column if not exists iot_footfall_trend        text
    check (iot_footfall_trend in ('increasing','stable','declining')),
  add column if not exists iot_monthly_energy_kwh    numeric(10,2),
  add column if not exists iot_energy_efficiency     numeric(4,2),
  add column if not exists iot_floor_occupancy       jsonb,
  add column if not exists iot_device_id             text,
  add column if not exists iot_last_synced_at        timestamptz;

create table if not exists retrofit_products (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  category        text not null,
  monthly_fee_krw integer not null,
  install_fee_krw integer not null,
  noi_impact_pct  numeric(4,1),
  payback_months  integer,
  created_at      timestamptz default now()
);

insert into retrofit_products (slug, name, category, monthly_fee_krw, install_fee_krw, noi_impact_pct, payback_months)
values
  ('ai-cctv',    'AI CCTV 유동인구 분석', 'cctv', 150000, 500000,  8.5, 8),
  ('smart-hvac', '스마트 공조 제어',       'hvac', 200000, 1500000, 15.0, 14)
on conflict (slug) do nothing;

create table if not exists retrofit_inquiries (
  id              uuid primary key default gen_random_uuid(),
  building_id     uuid references building_ssot_lite(id),
  broker_id       uuid,
  space_id        uuid,
  product_id      uuid references retrofit_products(id),
  trigger_source  text,
  status          text default 'lead'
    check (status in ('lead','contracted','installed','cancelled')),
  broker_incentive_krw integer default 0,
  created_at      timestamptz default now(),
  installed_at    timestamptz
);

create table if not exists iot_data_stream (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid references building_ssot_lite(id),
  device_id   text not null,
  metric_type text not null,
  value       numeric not null,
  floor       text,
  recorded_at timestamptz not null,
  created_at  timestamptz default now()
);

create index if not exists idx_iot_stream_building_metric
  on iot_data_stream(building_id, metric_type, recorded_at desc);

create table if not exists owner_report_history (
  id               uuid primary key default gen_random_uuid(),
  space_id         uuid not null,
  building_id      uuid,
  sent_at          timestamptz default now(),
  has_retrofit_cta boolean default false
);

create table if not exists api_clients (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  api_key        text unique not null,
  plan           text not null check (plan in ('starter','pro','enterprise')),
  allowed_fields text[] not null,
  created_at     timestamptz default now()
);

create table if not exists api_usage_events (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid references api_clients(id),
  endpoint          text not null,
  billed_amount_krw integer not null,
  created_at        timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- building_signal_cards에 deal_curiosity_score 컬럼 추가
-- ────────────────────────────────────────────────────────────
alter table building_signal_cards
  add column if not exists deal_curiosity_score numeric(5,2) default 0;

-- ────────────────────────────────────────────────────────────
-- 완료 확인
-- ────────────────────────────────────────────────────────────
do $$
begin
  raise notice '✅ 누락 테이블 일괄 적용 완료!';
  raise notice '  - match_results, deal_casepacks, deal_pipeline_states';
  raise notice '  - knowledge_edges, external_transactions, buyer_clusters';
  raise notice '  - IoT/retrofit/api 테이블';
  raise notice '  - building_ssot_lite: 프로모션·IoT 컬럼 추가';
  raise notice '  - activity_events: building_ssot_lite_id, broker_id 추가';
  raise notice '';
  raise notice '⚡ 다음 단계: seed_demo_v2.sql 실행';
end $$;
