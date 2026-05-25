-- building_ssot_lite에 Studio Pro 컬럼 추가
alter table building_ssot_lite
  add column if not exists lease_summary       jsonb    default '{}',
  add column if not exists floor_plan_url      text,
  add column if not exists repair_history      jsonb    default '{}',
  add column if not exists disclosure_prefs    jsonb    default '{}',
  add column if not exists layer_scores        jsonb    default '{}',
  add column if not exists completeness_score  int      default 0 check (completeness_score >= 0 and completeness_score <= 100);

-- evidence_files에 카테고리 메타데이터 추가
alter table evidence_files
  add column if not exists file_name          text,
  add column if not exists file_size_bytes    bigint,
  add column if not exists mime_type          text,
  add column if not exists layer_category     text check (layer_category in (
    'building_register',
    'registry_docs',
    'land_use_plan',
    'rent_roll',
    'photos',
    'floor_plan',
    'repair_history',
    'vacancy_docs',
    'asking_price',
    'disclosure_policy',
    'other'
  )),
  add column if not exists is_verified        boolean  default false,
  add column if not exists verified_at        timestamptz;

-- 인덱스 추가
create index if not exists evidence_files_layer_category_idx on evidence_files(layer_category);
create index if not exists building_ssot_lite_completeness_idx on building_ssot_lite(completeness_score desc);
