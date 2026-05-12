-- ============================================================
-- 🚀 JS Full IM Studio + Mobile IM 통합 설정 스크립트 (Clean-up & Schema)
-- 이 스크립트를 Supabase SQL Editor에 전체 복사 후 한 번에 실행하세요.
-- 
-- 1. 기존 꼬여있는 cre-fullim 테이블 초기화 (안전하게 Drop)
-- 2. cre-fullim 코어 스키마 생성
-- 3. mobile_im_projects 테이블 생성 (신규)
-- 4. 공유 테이블 (ai_runs, activity_events) 컬럼 추가
-- 5. RLS 정책 설정 (생략됨, 필요시 추가)
-- 6. 데모 데이터 시딩
-- ============================================================

-- --------------------------------------------------------
-- 1. 기존 테이블 초기화 (이전 잘못된 스키마로 인한 컬럼 에러 방지)
-- --------------------------------------------------------
drop table if exists golden_im_candidates cascade;
drop table if exists expert_patches cascade;
drop table if exists expert_assignments cascade;
drop table if exists expert_profiles cascade;
drop table if exists im_section_versions cascade;
drop table if exists im_sections cascade;
drop table if exists im_project_members cascade;
drop table if exists dealroom_qna_items cascade;
drop table if exists dealroom_qna_packs cascade;
drop table if exists export_jobs cascade;
drop table if exists evidence_files cascade;
drop table if exists gate_reviews cascade;
drop table if exists im_projects cascade;
drop table if exists building_ssot_full cascade;
drop table if exists handoff_source_snapshots cascade;
drop table if exists mobile_im_projects cascade;

-- --------------------------------------------------------
-- 2. 코어 스키마 (cre-fullim/supabase/migrations/0000_initial_schema.sql)
-- --------------------------------------------------------
create table if not exists handoff_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  handoff_id text not null,
  source_app text not null default 'js-building-ssot-mvp',
  source_app_version text,
  contracts_version text not null,
  payload_version text not null,
  source_building_ssot_lite_id text not null,
  source_objects jsonb not null default '{}',
  import_status text not null default 'pending',
  warnings text[] not null default '{}',
  imported_by uuid,
  imported_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_handoff_snapshots_handoff_id on handoff_source_snapshots(handoff_id);
create index if not exists idx_handoff_snapshots_source_bsl on handoff_source_snapshots(source_building_ssot_lite_id);

create table if not exists building_ssot_full (
  id uuid primary key default gen_random_uuid(),
  source_building_ssot_lite_id text,
  handoff_source_snapshot_id uuid references handoff_source_snapshots(id),
  created_by uuid not null,
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
  readiness_status text not null default 'lite_imported',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_bssot_full_created_by on building_ssot_full(created_by);
create index if not exists idx_bssot_full_source_lite on building_ssot_full(source_building_ssot_lite_id);

create table if not exists im_projects (
  id uuid primary key default gen_random_uuid(),
  source_app text not null default 'js-full-im-studio',
  source_building_ssot_lite_id text,
  building_ssot_full_id uuid not null references building_ssot_full(id),
  created_by uuid not null,
  project_owner_id uuid,
  project_type text not null,
  target_output text not null,
  package_intent text default 'unknown',
  status text not null default 'intake',
  readiness_score int check (readiness_score is null or readiness_score between 0 and 100),
  required_expert_patches jsonb not null default '[]',
  source_document_ids text[] not null default '{}',
  source_refs jsonb not null default '[]',
  title text,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_im_projects_created_by on im_projects(created_by);
create index if not exists idx_im_projects_bssot on im_projects(building_ssot_full_id);
create index if not exists idx_im_projects_status on im_projects(status);

create table if not exists im_project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references im_projects(id) on delete cascade,
  user_id uuid not null,
  role text not null,
  status text not null default 'active',
  invited_by uuid,
  created_at timestamptz default now(),
  unique(project_id, user_id, role)
);

create index if not exists idx_project_members_user on im_project_members(user_id);
create index if not exists idx_project_members_project on im_project_members(project_id);

create table if not exists im_sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references im_projects(id) on delete cascade,
  section_type text not null,
  section_order int not null,
  title text not null,
  status text not null default 'not_started',
  confidence text not null default 'unknown',
  risk_level text not null default 'medium',
  requires_expert_patch boolean not null default false,
  required_expert_roles text[] not null default '{}',
  missing_data text[] not null default '{}',
  required_evidence text[] not null default '{}',
  content_json jsonb not null default '{}',
  markdown text,
  source_refs jsonb not null default '[]',
  evidence_refs jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(project_id, section_type)
);

create index if not exists idx_im_sections_project on im_sections(project_id);
create index if not exists idx_im_sections_status on im_sections(status);
create index if not exists idx_im_sections_type on im_sections(section_type);

create table if not exists im_section_versions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references im_sections(id) on delete cascade,
  project_id uuid not null references im_projects(id) on delete cascade,
  version_number int not null,
  version_source text not null,
  content_json jsonb not null default '{}',
  markdown text,
  source_refs jsonb not null default '[]',
  evidence_refs jsonb not null default '[]',
  created_by uuid,
  created_at timestamptz default now(),
  unique(section_id, version_number)
);

create table if not exists expert_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  expert_role text not null,
  display_name text,
  organization text,
  license_note text,
  bio text,
  status text not null default 'active',
  created_at timestamptz default now()
);

create index if not exists idx_expert_profiles_user on expert_profiles(user_id);
create index if not exists idx_expert_profiles_role on expert_profiles(expert_role);

create table if not exists expert_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references im_projects(id) on delete cascade,
  section_id uuid references im_sections(id) on delete set null,
  expert_id uuid not null references expert_profiles(id),
  expert_role text not null,
  assignment_type text not null,
  status text not null default 'assigned',
  instructions text,
  due_at timestamptz,
  created_by uuid not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_expert_assignments_project on expert_assignments(project_id);
create index if not exists idx_expert_assignments_expert on expert_assignments(expert_id);
create index if not exists idx_expert_assignments_status on expert_assignments(status);

create table if not exists expert_patches (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references expert_assignments(id) on delete set null,
  project_id uuid not null references im_projects(id) on delete cascade,
  section_id uuid references im_sections(id) on delete set null,
  expert_id uuid not null references expert_profiles(id),
  expert_role text not null,
  patch_type text not null,
  before_text text,
  after_text text not null,
  edit_tags text[] not null default '{}',
  rationale text,
  visibility_after_review text not null default 'internal_only',
  requires_additional_review boolean not null default false,
  training_rights text not null default 'not_allowed',
  status text not null default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_expert_patches_project on expert_patches(project_id);
create index if not exists idx_expert_patches_section on expert_patches(section_id);
create index if not exists idx_expert_patches_expert on expert_patches(expert_id);

create table if not exists gate_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references im_projects(id) on delete cascade,
  target_type text not null,
  target_id uuid,
  gate_type text not null,
  status text not null,
  violations jsonb not null default '[]',
  required_actions text[] not null default '{}',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_gate_reviews_project on gate_reviews(project_id);
create index if not exists idx_gate_reviews_gate_type on gate_reviews(gate_type);
create index if not exists idx_gate_reviews_status on gate_reviews(status);

create table if not exists evidence_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references im_projects(id) on delete cascade,
  building_ssot_full_id uuid references building_ssot_full(id) on delete cascade,
  uploaded_by uuid not null,
  evidence_type text not null,
  title text not null,
  storage_path text,
  source_uri text,
  visibility text not null default 'private_truth',
  review_status text not null default 'uploaded',
  contains_sensitive_data boolean not null default true,
  training_allowed boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_evidence_project on evidence_files(project_id);
create index if not exists idx_evidence_bssot on evidence_files(building_ssot_full_id);
create index if not exists idx_evidence_visibility on evidence_files(visibility);

create table if not exists export_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references im_projects(id) on delete cascade,
  export_type text not null,
  status text not null default 'queued',
  output_uri text,
  error_message text,
  created_by uuid not null,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists dealroom_qna_packs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references im_projects(id) on delete cascade,
  status text not null default 'draft',
  summary text,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists dealroom_qna_items (
  id uuid primary key default gen_random_uuid(),
  qna_pack_id uuid not null references dealroom_qna_packs(id) on delete cascade,
  project_id uuid not null references im_projects(id) on delete cascade,
  question text not null,
  answer_status text not null default 'draft',
  draft_answer text,
  required_evidence text[] not null default '{}',
  visibility text not null default 'gate_restricted',
  expert_required boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists golden_im_candidates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references im_projects(id) on delete cascade,
  section_id uuid references im_sections(id) on delete set null,
  expert_patch_id uuid references expert_patches(id) on delete set null,
  section_type text,
  ai_draft text,
  expert_revision text,
  edit_tags text[] not null default '{}',
  redaction_status text not null default 'pending',
  training_rights text not null default 'not_allowed',
  review_status text not null default 'candidate',
  metadata jsonb not null default '{}',
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

-- activity_events (공유 테이블: 컬럼 병합)
create table if not exists activity_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  entity_type text not null,
  occurred_at timestamptz default now()
);
alter table activity_events add column if not exists source_app text not null default 'js-full-im-studio';
alter table activity_events add column if not exists actor_id uuid;
alter table activity_events add column if not exists actor_role text not null default 'system';
alter table activity_events add column if not exists entity_id text;
alter table activity_events add column if not exists metadata jsonb not null default '{}';

create index if not exists idx_activity_events_event_name on activity_events(event_name);
create index if not exists idx_activity_events_entity on activity_events(entity_type, entity_id);
create index if not exists idx_activity_events_actor on activity_events(actor_id);
create index if not exists idx_activity_events_occurred_at on activity_events(occurred_at);

-- ai_runs (공유 테이블: 컬럼 병합)
create table if not exists ai_runs (
  id uuid primary key default gen_random_uuid()
);
alter table ai_runs add column if not exists project_id uuid references im_projects(id) on delete set null;
alter table ai_runs add column if not exists section_id uuid references im_sections(id) on delete set null;
alter table ai_runs add column if not exists user_id uuid;
alter table ai_runs add column if not exists run_type text;
alter table ai_runs add column if not exists input_ref jsonb not null default '{}';
alter table ai_runs add column if not exists output_ref jsonb not null default '{}';
alter table ai_runs add column if not exists model text;
alter table ai_runs add column if not exists prompt_version text;
alter table ai_runs add column if not exists status text not null default 'started';
alter table ai_runs add column if not exists token_usage jsonb;
alter table ai_runs add column if not exists latency_ms int;
alter table ai_runs add column if not exists error text;
alter table ai_runs add column if not exists created_at timestamptz default now();

-- --------------------------------------------------------
-- 2. Mobile IM 프로젝트 테이블 (신규 추가)
-- --------------------------------------------------------
create table if not exists mobile_im_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  source_type text not null,
  source_handoff_token text,
  status text not null default 'published',
  readiness_score int not null default 0,
  title text,
  kakao_copy text,
  building_snapshot jsonb not null default '{}',
  sections jsonb not null default '[]',
  gate_result jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_mobile_im_projects_slug on mobile_im_projects(slug);

-- --------------------------------------------------------
-- 3. 기존 데모 데이터 정리 (IF EXISTS 처리하여 에러 방지)
-- --------------------------------------------------------
do $$
begin
  delete from golden_im_candidates  where id = '00000000-0000-0000-0000-000000000070';
  delete from expert_patches         where id = '00000000-0000-0000-0000-000000000060';
  delete from expert_assignments     where id = '00000000-0000-0000-0000-000000000050';
  delete from im_sections            where project_id = '00000000-0000-0000-0000-000000000010';
  delete from im_projects            where id = '00000000-0000-0000-0000-000000000010';
  delete from building_ssot_full     where id = '00000000-0000-0000-0000-000000000020';
  delete from handoff_source_snapshots where id = '00000000-0000-0000-0000-000000000030';
  delete from expert_profiles        where id = '00000000-0000-0000-0000-000000000040';
exception when undefined_table then
  -- 테이블이 없으면 무시
end $$;

-- --------------------------------------------------------
-- 4. 데모 데이터 시딩
-- --------------------------------------------------------
insert into handoff_source_snapshots (
  id, handoff_id, source_app, contracts_version, payload_version,
  source_building_ssot_lite_id, source_objects, import_status
) values (
  '00000000-0000-0000-0000-000000000030',
  'demo-handoff-hof_demo_2026_sungsu_001',
  'js-building-ssot-mvp',
  '1.0.0', '1.0',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '{}',
  'imported'
) on conflict do nothing;

insert into building_ssot_full (
  id, source_building_ssot_lite_id,
  created_by,
  asset_identity, physical_fact, legal_registry,
  lease_income, market_location, value_up_hypothesis,
  risk_unknown, buyer_fit, disclosure_gate,
  readiness_status
) values (
  '00000000-0000-0000-0000-000000000020',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  jsonb_build_object(
    'disclosure_name',         '성수권역 복합 상업시설',
    'area_signal',             '성동구 성수권역',
    'gross_area_sqm',          1850,
    'net_leasable_area_sqm',   1320,
    'building_type',           'mixed_use',
    'floors_above_ground',     6,
    'construction_year',       2018,
    'asking_price_krw',        9500000000
  ),
  jsonb_build_object(
    'elevator', true,
    'parking_count', 12,
    'condition_grade', 'B+'
  ),
  jsonb_build_object(
    'land_use_zone',      '일반상업지역',
    'floor_area_ratio',   0.82,
    'registry_confirmed', true
  ),
  jsonb_build_object(
    'lease_count',                  8,
    'anchor_tenant_type',           'F&B',
    'monthly_rent_total_krw',       38000000,
    'operating_expense_monthly_krw',4200000,
    'rent_roll_confirmed',          true
  ),
  jsonb_build_object(
    'district',         '성동구',
    'nearest_subway',   '성수역 도보 3분',
    'commercial_grade', '1급지'
  ),
  jsonb_build_object(
    'vacancy_floor',        '3층 일부',
    'value_add_potential',  'high',
    'repositioning_note',   '3층 공실 해소 시 NOI 15% 상향 가능'
  ),
  jsonb_build_object(
    'main_risk',   '3층 공실 해소 시점 불확실',
    'risk_level',  'medium'
  ),
  jsonb_build_object(
    'target_buyer',     '기관 투자자, 패밀리오피스',
    'min_budget_krw',   8000000000,
    'max_budget_krw',   11000000000
  ),
  jsonb_build_object(
    'gate_level',       'G3',
    'protected_fields', array['exact_address','tenant_name','unit_rent','owner_contact']
  ),
  'lite_imported'
) on conflict do nothing;

insert into im_projects (
  id, building_ssot_full_id,
  created_by,
  project_type, target_output, package_intent,
  status, readiness_score,
  title
) values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000000',
  'ai_expert_review',
  'buyer_ready_full_im',
  'ai_expert_review',
  'outline_generated',
  81,
  '성수권역 복합 상업시설 — Full IM Draft'
) on conflict do nothing;

insert into im_sections (id, project_id, section_type, section_order, title, status, confidence, risk_level, requires_expert_patch, content_json) values
('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000010', 'cover_confidentiality',              1,  '표지 및 기밀유지 안내',      'planned',            'unknown',        'low',    false, '{}'),
('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000010', 'executive_summary',                  2,  '핵심 요약',                  'ai_draft',           'inferred',       'low',    false, jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type','paragraph','data',jsonb_build_object('text','본 자산은 성수권역 핵심 상권에 위치한 우량 복합상업시설입니다. 연면적 1,850㎡, 6층 규모로 2018년 리모델링 완료되었으며, F&B 앵커 테넌트를 포함해 8개 임차인이 운영 중입니다.'))))),
('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000010', 'investment_thesis_buyer_fit',        3,  '투자 논거 및 매수자 적합성', 'ai_draft',           'inferred',       'low',    false, jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type','paragraph','data',jsonb_build_object('text','성수권역 급등 지역 내 밸류애드 포텐셜이 높은 기관 투자자 적합 자산입니다. 3층 공실 해소 시 NOI 15% 추가 상승 여력이 있습니다.'))))),
('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000010', 'property_fact_sheet',                4,  '물건 기본 팩트 시트',        'ai_draft',           'confirmed',      'low',    false, jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type','paragraph','data',jsonb_build_object('text','연면적 1,850㎡ / 대지 350㎡ / 지상 6층 / 2018년 리모델링 / 주차 12대 / 엘리베이터 있음'))))),
('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000010', 'location_market_context',            5,  'Location & Market Context',  'ai_draft',           'confirmed',      'low',    false, jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type','paragraph','data',jsonb_build_object('text','성수역 도보 3분, 성동구 일반상업지역, 인근 복합문화시설 집적으로 유동인구 급증 중. 2025년 기준 권역 평균 실거래 단가 3,200만원/㎡.'))))),
('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000010', 'building_condition_physical_review', 6,  '건물 상태 및 물리적 검토',   'planned',            'unknown',        'medium', false, '{}'),
('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-000000000010', 'rent_roll_lease_quality',            7,  '임대 현황 및 임대차 품질',   'needs_expert_patch', 'needs_evidence', 'high',   true,  '{}'),
('00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0000-000000000010', 'income_noi_yield_analysis',          8,  '임대수입·NOI·수익률 분석',  'needs_expert_patch', 'needs_evidence', 'high',   true,  jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type','paragraph','data',jsonb_build_object('text','NOI는 약 4억원으로 추정되며 수익률이 보장됩니다.'))))),
('00000000-0000-0000-0000-000000000109', '00000000-0000-0000-0000-000000000010', 'operating_expense_noi',              9,  'Operating Expense & NOI',    'planned',            'unknown',        'medium', false, '{}'),
('00000000-0000-0000-0000-000000000110', '00000000-0000-0000-0000-000000000010', 'valuation_logic_comparables',        10, '가치평가 논리 및 비교사례',  'planned',            'unknown',        'medium', false, '{}'),
('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000010', 'value_add_repositioning_scenario',   11, '가치상승·리포지셔닝 시나리오','planned',           'unknown',        'low',    false, '{}'),
('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-000000000010', 'debt_sensitivity_cash_flow',         12, '대출 민감도 및 현금흐름',    'planned',            'unknown',        'medium', false, '{}'),
('00000000-0000-0000-0000-000000000113', '00000000-0000-0000-0000-000000000010', 'risk_factors_dd_checklist',          13, '리스크 요인 및 DD 체크리스트','ai_draft',          'inferred',       'medium', false, jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type','paragraph','data',jsonb_build_object('text','주요 리스크: ① 3층 공실 해소 시점 불확실, ② 앵커테넌트 임대차 만기 2026년 10월. DD 시 임대차계약서 원본 확인 필수.'))))),
('00000000-0000-0000-0000-000000000114', '00000000-0000-0000-0000-000000000010', 'tax_structure_note',                 14, 'Tax Structure Note',         'planned',            'unknown',        'high',   true,  '{}'),
('00000000-0000-0000-0000-000000000115', '00000000-0000-0000-0000-000000000010', 'land_zoning_legal_constraints',      15, '토지·용도지역·법적 제약',    'planned',            'unknown',        'medium', false, '{}'),
('00000000-0000-0000-0000-000000000116', '00000000-0000-0000-0000-000000000010', 'appendix_evidence_index',            16, '부록: 증거 자료 인덱스',     'planned',            'unknown',        'low',    false, '{}'),
('00000000-0000-0000-0000-000000000117', '00000000-0000-0000-0000-000000000010', 'deal_process_next_steps',            17, '딜 프로세스 및 다음 단계',   'ai_draft',           'confirmed',      'low',    false, jsonb_build_object('blocks', jsonb_build_array(jsonb_build_object('type','paragraph','data',jsonb_build_object('text','인수의향서(LOI) 접수 후 상세 추정 자료 제공. 실사(DD) 기간 4주, 계약 체결 목표일 2026년 7월 31일.'))))),
('00000000-0000-0000-0000-000000000118', '00000000-0000-0000-0000-000000000010', 'disclaimer_contact',                 18, '면책 사항 및 연락처',        'planned',            'unknown',        'low',    false, '{}')
on conflict (project_id, section_type) do nothing;

insert into expert_profiles (id, user_id, expert_role, display_name, organization, status) values (
  '00000000-0000-0000-0000-000000000040',
  '00000000-0000-0000-0000-000000000000',
  'cre_consultant',
  '김민준 CRE 컨설턴트',
  'JS Advisory',
  'active'
) on conflict do nothing;

insert into expert_assignments (
  id, project_id, section_id, expert_id, expert_role,
  assignment_type, status, instructions, created_by
) values (
  '00000000-0000-0000-0000-000000000050',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000108',
  '00000000-0000-0000-0000-000000000040',
  'cre_consultant',
  'section_patch',
  'assigned',
  'NOI 추정치 및 Cap Rate 근거 검토 후 가드레일 준수 여부 확인 요망. "수익률 보장" 표현 반드시 수정 필요.',
  '00000000-0000-0000-0000-000000000000'
) on conflict do nothing;

insert into expert_patches (
  id, project_id, section_id, expert_id, expert_role,
  patch_type, before_text, after_text, edit_tags, rationale,
  visibility_after_review, status
) values (
  '00000000-0000-0000-0000-000000000060',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000108',
  '00000000-0000-0000-0000-000000000040',
  'cre_consultant',
  'financial_assumption_fix',
  'NOI는 약 4억원으로 추정되며 수익률이 보장됩니다.',
  '공개 임대수익(연간 약 4.56억원) 및 추정 운영비(연간 약 0.5억원) 기준 NOI는 약 4억원 내외로 추정됩니다. 실제 수익률은 임대조건, 공실기간, 운영비 변동에 따라 달라질 수 있으며, 별도 실사를 통해 확인하시기 바랍니다.',
  array['overclaim_removed','risk_balance_added','financial_assumption_added'],
  '"수익률이 보장됩니다" 표현은 부동산거래신고법 위반 소지. 추정치임을 명확히 하고 실사 조건부 문구로 교체.',
  'buyer_ready',
  'approved'
) on conflict do nothing;

insert into golden_im_candidates (
  id, project_id, section_id, section_type,
  ai_draft, expert_revision, edit_tags,
  redaction_status, training_rights, review_status
) values (
  '00000000-0000-0000-0000-000000000070',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000108',
  'income_noi_yield_analysis',
  'NOI는 약 4억원으로 추정되며 수익률이 보장됩니다.',
  '공개 임대수익(연간 약 4.56억원) 및 추정 운영비(연간 약 0.5억원) 기준 NOI는 약 4억원 내외로 추정됩니다. 실제 수익률은 임대조건, 공실기간, 운영비 변동에 따라 달라질 수 있으며, 별도 실사를 통해 확인하시기 바랍니다.',
  array['overclaim_removed','risk_balance_added','financial_assumption_added'],
  'redacted',
  'allowed_anonymized',
  'candidate'
) on conflict do nothing;

-- 완료 확인
do $$
begin
  raise notice '✅ Full IM Studio 스키마 및 데모 시딩 완료!';
  raise notice '  - 신규 추가: mobile_im_projects 테이블';
  raise notice '  - IM 프로젝트 ID: 00000000-0000-0000-0000-000000000010 (readiness_score=81)';
end $$;
