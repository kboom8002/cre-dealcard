-- ============================================================
-- Migration 00009: Knowledge Graph + Prediction Infrastructure
-- G-X, G-D, G-I, G-S, P-D2, P-X, P-D
-- ============================================================

-- ── G-X: 지식 그래프 엣지 테이블 ─────────────────────────────
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

create index ke_from_idx   on knowledge_edges(from_type, from_id);
create index ke_to_idx     on knowledge_edges(to_type, to_id);
create index ke_type_idx   on knowledge_edges(edge_type);
create index ke_weight_idx on knowledge_edges(weight desc);
-- prevent duplicate edges
create unique index ke_unique_idx
  on knowledge_edges(from_type, from_id, to_type, to_id, edge_type);

alter table knowledge_edges enable row level security;
-- Edges are system-generated; brokers can read but not write directly
create policy "ke_read_authenticated"
  on knowledge_edges for select to authenticated using (true);

-- ── G-D + G-I: CasePack & IM embeddings ──────────────────────
-- Requires pgvector extension (enable in Supabase dashboard first)
-- create extension if not exists vector;

alter table deal_casepacks
  add column if not exists embedding vector(1536),
  add column if not exists embedding_updated_at timestamptz;

alter table im_projects
  add column if not exists embedding           vector(1536),
  add column if not exists embedding_updated_at timestamptz,
  add column if not exists outcome             text
    check (outcome in ('success','failed','pending')) default 'pending',
  add column if not exists outcome_notes       text;

-- HNSW indexes (better accuracy than IVFFlat for < 100k rows)
-- Run these AFTER pgvector is enabled:
-- create index deal_casepacks_emb_idx on deal_casepacks using hnsw (embedding vector_cosine_ops);
-- create index im_projects_emb_idx    on im_projects    using hnsw (embedding vector_cosine_ops);

-- ── P-D: 외부 실거래 데이터 ───────────────────────────────────
create table if not exists external_transactions (
  id                uuid    primary key default gen_random_uuid(),
  source            text    not null default 'molit',  -- 국토부
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

create index ext_tx_district_idx on external_transactions(district);
create index ext_tx_price_idx    on external_transactions(transaction_price);
create index ext_tx_date_idx     on external_transactions(transaction_date);
create index ext_tx_usage_idx    on external_transactions(usage_type);

-- Price features (engineered, ready for model training)
create table if not exists price_features (
  id                    uuid primary key default gen_random_uuid(),
  source_transaction_id uuid references external_transactions(id),
  building_ssot_lite_id uuid references building_ssot_lite(id),
  -- Target
  transaction_price     bigint not null,
  -- Location features
  district_encoded      integer,
  dong_encoded          integer,
  -- Building features
  building_area         numeric(10,2),
  land_area             numeric(10,2),
  floors                integer,
  built_year            integer,
  building_age          integer,
  parking_count         integer,
  usage_type_encoded    integer,
  -- Market features
  district_avg_price_3m bigint,
  district_tx_count_3m  integer,
  district_price_trend  numeric(5,3), -- 3개월 가격 추세 기울기
  -- Zoning
  zoning_encoded        integer,
  -- Timestamps
  created_at            timestamptz default now()
);

-- ── P-X: 전환율 피처 스냅샷 ──────────────────────────────────
create table if not exists deal_conversion_features (
  id                        uuid primary key default gen_random_uuid(),
  building_ssot_lite_id     uuid references building_ssot_lite(id),
  broker_id                 uuid references profiles(id),
  -- Target
  converted                 boolean,        -- true=closed, false=failed, null=pending
  -- Deal card features
  curiosity_score           numeric(5,2),
  hidden_fields_count       integer,
  -- Match features
  best_match_grade          integer,        -- S=4,A=3,B=2,C=1
  avg_match_score           numeric(5,2),
  matched_buyer_count       integer,
  s_grade_count             integer,
  -- Pipeline features
  current_stage_ord         integer,        -- 0-8
  total_hold_days           integer,
  avg_stage_velocity        numeric(5,2),
  -- Promotion features
  promotion_score           numeric(6,4),
  vacancy_demand_verified   boolean,
  vacancy_inquiry_count     integer,
  -- Activity features
  event_count_7d            integer,
  event_count_30d           integer,
  gate_request_count        integer,
  buyer_memo_count          integer,
  casepacks_count           integer,
  -- Quality features
  missing_data_count        integer,
  -- Context features
  days_since_creation       integer,
  has_im                    boolean,
  has_space_ai              boolean,
  buyer_cluster_id          integer,
  -- Metadata
  snapshot_at               timestamptz not null default now()
);

create index dcf_building_idx   on deal_conversion_features(building_ssot_lite_id);
create index dcf_converted_idx  on deal_conversion_features(converted);
create index dcf_snapshot_idx   on deal_conversion_features(snapshot_at);

-- ── P-D2: 매수자 클러스터 결과 ───────────────────────────────
alter table buyer_intent_lite
  add column if not exists cluster_id          integer,
  add column if not exists cluster_label       text,
  add column if not exists cluster_updated_at  timestamptz;

create table if not exists buyer_clusters (
  id              serial primary key,
  label           text not null,          -- "강남 사옥 법인"
  weight_profile  text not null           -- '사옥'|'투자'|'증여'|'default'
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
