-- ============================================================
-- 00021_lease_spaces.sql
-- CRE Leasing spaces, Tenant intents, and matching engine schemas
-- ============================================================

-- ── lease_spaces ───────────────────────────────────────────
create table if not exists lease_spaces (
  id                    uuid primary key default gen_random_uuid(),
  building_id           uuid references building_ssot_lite(id) on delete cascade,
  broker_id             uuid not null references profiles(id) on delete cascade,
  deal_type             text not null check (deal_type in ('lease', 'sublease')),
  floor                 text,                     -- '1F', 'B1', '3F'
  area_sqm              numeric,                  -- 전용 면적 (제곱미터)
  space_type            text not null check (space_type in ('office', 'retail', 'f_and_b', 'warehouse', 'other')),
  deposit               numeric,                  -- 보증금 (만원)
  monthly_rent          numeric,                  -- 월차임 (만원)
  maintenance_fee       numeric,                  -- 관리비 (만원)
  available_from        date,                     -- 입주 가능일
  lease_term_months     int,                      -- 최소 임대 기간 (개월)
  incentives            jsonb not null default '{}'::jsonb, -- 프리렌트, 렌트프리, 인테리어 지원 등
  restrictions          text[] not null default '{}'::text[], -- 업종 제한
  status                text not null default 'active' check (status in ('active', 'inactive', 'contracted')),
  is_marketplace_listed boolean not null default false, -- 마켓플레이스 공개 여부
  hidden_fields         text[] not null default '{}'::text[],
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists lease_spaces_building_id_idx on lease_spaces(building_id);
create index if not exists lease_spaces_broker_id_idx on lease_spaces(broker_id);
create index if not exists lease_spaces_space_type_idx on lease_spaces(space_type);
create index if not exists lease_spaces_status_idx on lease_spaces(status);
create index if not exists lease_spaces_is_marketplace_listed_idx on lease_spaces(is_marketplace_listed);
create index if not exists lease_spaces_created_at_idx on lease_spaces(created_at desc);

alter table lease_spaces enable row level security;

-- RLS Policies for lease_spaces
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'lease_spaces' and policyname = 'lease_spaces_own_all'
  ) then
    execute 'create policy "lease_spaces_own_all"
      on lease_spaces for all to authenticated
      using (broker_id = auth.uid())
      with check (broker_id = auth.uid())';
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'lease_spaces' and policyname = 'lease_spaces_marketplace_select'
  ) then
    execute 'create policy "lease_spaces_marketplace_select"
      on lease_spaces for select to public
      using (is_marketplace_listed = true)';
  end if;
end $$;


-- ── tenant_intent ──────────────────────────────────────────
create table if not exists tenant_intent (
  id                    uuid primary key default gen_random_uuid(),
  broker_id             uuid not null references profiles(id) on delete cascade,
  client_id             uuid references broker_clients(id) on delete set null, -- CRM 고객 연동
  business_type         text,                     -- 희망 업종
  preferred_regions     text[] not null default '{}'::text[], -- 선호 권역
  area_min              numeric,                  -- 최소 희망 전용 면적
  area_max              numeric,                  -- 최대 희망 전용 면적
  budget_deposit_max    numeric,                  -- 보증금 상한
  budget_monthly_max    numeric,                  -- 월차임 상한
  preferred_floors      text[] not null default '{}'::text[],
  move_in_target        date,                     -- 희망 입주 시기
  must_have             text[] not null default '{}'::text[],
  nice_to_have          text[] not null default '{}'::text[],
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists tenant_intent_broker_id_idx on tenant_intent(broker_id);
create index if not exists tenant_intent_client_id_idx on tenant_intent(client_id);
create index if not exists tenant_intent_created_at_idx on tenant_intent(created_at desc);

alter table tenant_intent enable row level security;

-- RLS Policies for tenant_intent
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'tenant_intent' and policyname = 'tenant_intent_own_all'
  ) then
    execute 'create policy "tenant_intent_own_all"
      on tenant_intent for all to authenticated
      using (broker_id = auth.uid())
      with check (broker_id = auth.uid())';
  end if;
end $$;


-- ── lease_match_results ─────────────────────────────────────
create table if not exists lease_match_results (
  lease_space_id        uuid not null references lease_spaces(id) on delete cascade,
  tenant_intent_id      uuid not null references tenant_intent(id) on delete cascade,
  grade                 text not null check (grade in ('S', 'A', 'B', 'C')),
  score                 numeric not null,
  reasoning             text,
  created_at            timestamptz not null default now(),
  primary key (lease_space_id, tenant_intent_id)
);

create index if not exists lease_match_results_grade_idx on lease_match_results(grade);
create index if not exists lease_match_results_score_idx on lease_match_results(score desc);

alter table lease_match_results enable row level security;

-- RLS Policies for lease_match_results
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'lease_match_results' and policyname = 'lease_match_results_own_all'
  ) then
    execute 'create policy "lease_match_results_own_all"
      on lease_match_results for all to authenticated
      using (
        exists (
          select 1 from lease_spaces
          where id = lease_space_id and broker_id = auth.uid()
        )
      )';
  end if;
end $$;


-- ── updated_at Triggers ─────────────────────────────────────
create or replace trigger set_lease_spaces_updated_at
  before update on lease_spaces
  for each row execute function set_updated_at();

create or replace trigger set_tenant_intent_updated_at
  before update on tenant_intent
  for each row execute function set_updated_at();
