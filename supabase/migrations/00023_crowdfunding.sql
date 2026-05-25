-- ============================================================
-- 00023_crowdfunding.sql
-- Crowdfunding projects, Investor profiles, Match results, and Pipeline states
-- ============================================================

-- ── funding_projects ───────────────────────────────────────
create table if not exists funding_projects (
  id                        uuid primary key default gen_random_uuid(),
  operator_id               uuid not null references profiles(id) on delete cascade,
  project_name              text not null,
  asset_type                text not null check (asset_type in ('real_estate', 'startup', 'art', 'ip')),
  target_amount             numeric not null,
  min_investment            numeric not null,
  expected_return_pct       numeric not null,
  investment_period_months  integer not null,
  risk_level                integer not null check (risk_level between 1 and 5),
  token_type                text not null check (token_type in ('sto', 'equity', 'profit_share')),
  regulatory_status         text,
  description_memo          text,
  ssot_data                 jsonb not null default '{}'::jsonb,
  status                    text not null default 'draft' check (status in ('draft', 'open', 'funded', 'failed', 'closed')),
  current_amount            numeric not null default 0,
  investor_count            integer not null default 0,
  is_public                 boolean not null default false,
  gate_level                integer not null default 0 check (gate_level between 0 and 4),
  hidden_fields             text[] not null default '{}'::text[],
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists funding_projects_operator_idx on funding_projects(operator_id);
create index if not exists funding_projects_status_idx on funding_projects(status);
create index if not exists funding_projects_is_public_idx on funding_projects(is_public);
create index if not exists funding_projects_created_at_idx on funding_projects(created_at desc);

alter table funding_projects enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'funding_projects' and policyname = 'funding_projects_own_all'
  ) then
    execute 'create policy "funding_projects_own_all"
      on funding_projects for all to authenticated
      using (operator_id = auth.uid())
      with check (operator_id = auth.uid())';
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'funding_projects' and policyname = 'funding_projects_public_select'
  ) then
    execute 'create policy "funding_projects_public_select"
      on funding_projects for select to public
      using (is_public = true)';
  end if;
end $$;


-- ── investor_profiles ───────────────────────────────────────
create table if not exists investor_profiles (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references profiles(id) on delete cascade,
  investor_type             text not null check (investor_type in ('general', 'qualified', 'professional')),
  investment_preference     text[] not null default '{}'::text[],
  preferred_sectors         text[] not null default '{}'::text[],
  investment_min            numeric,
  investment_max            numeric,
  max_risk_tolerance        integer check (max_risk_tolerance between 1 and 5),
  expected_return_min       numeric,
  investment_horizon_months integer,
  must_have_criteria        text[] not null default '{}'::text[],
  nice_to_have_criteria     text[] not null default '{}'::text[],
  kyc_verified              boolean not null default false,
  kyc_verified_at           timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint investor_profiles_user_unique unique (user_id)
);

create index if not exists investor_profiles_user_idx on investor_profiles(user_id);
create index if not exists investor_profiles_type_idx on investor_profiles(investor_type);

alter table investor_profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'investor_profiles' and policyname = 'investor_profiles_own_all'
  ) then
    execute 'create policy "investor_profiles_own_all"
      on investor_profiles for all to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid())';
  end if;
end $$;


-- ── funding_match_results ───────────────────────────────────
create table if not exists funding_match_results (
  funding_project_id        uuid not null references funding_projects(id) on delete cascade,
  investor_profile_id       uuid not null references investor_profiles(id) on delete cascade,
  grade                     text not null check (grade in ('S', 'A', 'B', 'C')),
  score                     numeric not null,
  reasoning                 text,
  created_at                timestamptz not null default now(),
  primary key (funding_project_id, investor_profile_id)
);

create index if not exists funding_match_grade_idx on funding_match_results(grade);
create index if not exists funding_match_score_idx on funding_match_results(score desc);

alter table funding_match_results enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'funding_match_results' and policyname = 'funding_match_own_all'
  ) then
    execute 'create policy "funding_match_own_all"
      on funding_match_results for all to authenticated
      using (
        exists (
          select 1 from funding_projects
          where id = funding_project_id and operator_id = auth.uid()
        ) or exists (
          select 1 from investor_profiles
          where id = investor_profile_id and user_id = auth.uid()
        )
      )';
  end if;
end $$;


-- ── funding_pipeline_states ─────────────────────────────────
create table if not exists funding_pipeline_states (
  id                    uuid primary key default gen_random_uuid(),
  funding_project_id    uuid not null references funding_projects(id) on delete cascade,
  stage                 text not null check (stage in ('draft', 'review', 'open', '50pct', '80pct', 'funded', 'failed')),
  entered_at            timestamptz not null default now(),
  metadata              jsonb not null default '{}'::jsonb
);

create index if not exists funding_pipeline_proj_idx on funding_pipeline_states(funding_project_id);
create index if not exists funding_pipeline_stage_idx on funding_pipeline_states(stage);

alter table funding_pipeline_states enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'funding_pipeline_states' and policyname = 'funding_pipeline_own_all'
  ) then
    execute 'create policy "funding_pipeline_own_all"
      on funding_pipeline_states for all to authenticated
      using (
        exists (
          select 1 from funding_projects
          where id = funding_project_id and operator_id = auth.uid()
        )
      )';
  end if;
end $$;


-- ── funding_failure_logs ────────────────────────────────────
create table if not exists funding_failure_logs (
  id                    uuid primary key default gen_random_uuid(),
  funding_project_id    uuid not null references funding_projects(id) on delete cascade,
  achievement_pct       numeric not null,
  matched_investor_count integer not null,
  high_fit_count        integer not null,
  failure_factors       jsonb not null default '{}'::jsonb,
  price_sensitivity_score numeric not null default 0,
  marketing_reach_score   numeric not null default 0,
  created_at            timestamptz not null default now()
);

create index if not exists funding_failure_proj_idx on funding_failure_logs(funding_project_id);

alter table funding_failure_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'funding_failure_logs' and policyname = 'funding_failures_own_all'
  ) then
    execute 'create policy "funding_failures_own_all"
      on funding_failure_logs for all to authenticated
      using (
        exists (
          select 1 from funding_projects
          where id = funding_project_id and operator_id = auth.uid()
        )
      )';
  end if;
end $$;


-- ── Triggers ────────────────────────────────────────────────
create or replace trigger set_funding_projects_updated_at
  before update on funding_projects
  for each row execute function set_updated_at();

create or replace trigger set_investor_profiles_updated_at
  before update on investor_profiles
  for each row execute function set_updated_at();
