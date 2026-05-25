-- ============================================================
-- 00022_pipeline_analytics.sql
-- Pipeline stage transitions, Match failure logs, Market leading indicators, Price negotiation history
-- ============================================================

-- ── pipeline_stage_transitions ─────────────────────────────
create table if not exists pipeline_stage_transitions (
  id                    uuid primary key default gen_random_uuid(),
  broker_id             uuid not null references profiles(id) on delete cascade,
  building_ssot_lite_id uuid references building_ssot_lite(id) on delete cascade,
  lease_space_id        uuid references lease_spaces(id) on delete cascade,
  from_stage            text not null,
  to_stage              text not null,
  transition_reason     text,
  hold_days             numeric not null default 0,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists pipeline_transitions_broker_id_idx on pipeline_stage_transitions(broker_id);
create index if not exists pipeline_transitions_building_id_idx on pipeline_stage_transitions(building_ssot_lite_id);
create index if not exists pipeline_transitions_lease_id_idx on pipeline_stage_transitions(lease_space_id);
create index if not exists pipeline_transitions_created_at_idx on pipeline_stage_transitions(created_at desc);

alter table pipeline_stage_transitions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'pipeline_stage_transitions' and policyname = 'pipeline_transitions_own_all'
  ) then
    execute 'create policy "pipeline_transitions_own_all"
      on pipeline_stage_transitions for all to authenticated
      using (broker_id = auth.uid())
      with check (broker_id = auth.uid())';
  end if;
end $$;


-- ── match_failure_logs ──────────────────────────────────────
create table if not exists match_failure_logs (
  id                    uuid primary key default gen_random_uuid(),
  broker_id             uuid not null references profiles(id) on delete cascade,
  match_result_id       uuid references match_results(id) on delete cascade,
  lease_space_id        uuid references lease_spaces(id) on delete cascade,
  tenant_intent_id      uuid references tenant_intent(id) on delete cascade,
  entity_type           text not null check (entity_type in ('sale', 'lease')),
  failure_reason        text not null,
  price_gap_pct         numeric,
  rejected_by           text not null check (rejected_by in ('buyer', 'tenant', 'owner', 'broker')),
  rejection_detail      text,
  created_at            timestamptz not null default now()
);

create index if not exists match_failure_broker_id_idx on match_failure_logs(broker_id);
create index if not exists match_failure_match_result_id_idx on match_failure_logs(match_result_id);
create index if not exists match_failure_lease_id_idx on match_failure_logs(lease_space_id);
create index if not exists match_failure_tenant_id_idx on match_failure_logs(tenant_intent_id);
create index if not exists match_failure_created_at_idx on match_failure_logs(created_at desc);

alter table match_failure_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'match_failure_logs' and policyname = 'match_failures_own_all'
  ) then
    execute 'create policy "match_failures_own_all"
      on match_failure_logs for all to authenticated
      using (broker_id = auth.uid())
      with check (broker_id = auth.uid())';
  end if;
end $$;


-- ── market_leading_indicators ───────────────────────────────
create table if not exists market_leading_indicators (
  id                    uuid primary key default gen_random_uuid(),
  region                text not null,
  asset_type            text not null,
  period_start          date not null,
  period_end            date not null,
  demand_score          numeric not null default 0,
  supply_score          numeric not null default 0,
  avg_hold_days         numeric not null default 0,
  conversion_rate       numeric not null default 0,
  price_resistance_band jsonb not null default '{}'::jsonb,
  absorption_rate       numeric not null default 0,
  trend_direction       text not null check (trend_direction in ('up', 'flat', 'down')),
  computed_at           timestamptz not null default now()
);

create index if not exists market_indicators_region_asset_idx on market_leading_indicators(region, asset_type);
create index if not exists market_indicators_computed_at_idx on market_leading_indicators(computed_at desc);

alter table market_leading_indicators enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'market_leading_indicators' and policyname = 'market_indicators_select'
  ) then
    execute 'create policy "market_indicators_select"
      on market_leading_indicators for select to authenticated
      using (true)';
  end if;
end $$;


-- ── price_negotiation_history ──────────────────────────────
create table if not exists price_negotiation_history (
  id                    uuid primary key default gen_random_uuid(),
  broker_id             uuid not null references profiles(id) on delete cascade,
  entity_type           text not null check (entity_type in ('sale', 'lease')),
  entity_id             uuid not null,
  original_price        numeric not null,
  adjusted_price        numeric not null,
  adjustment_pct        numeric not null,
  adjustment_reason     text,
  adjusted_by           text not null check (adjusted_by in ('owner', 'buyer', 'tenant', 'broker')),
  created_at            timestamptz not null default now()
);

create index if not exists price_neg_broker_id_idx on price_negotiation_history(broker_id);
create index if not exists price_neg_entity_idx on price_negotiation_history(entity_type, entity_id);
create index if not exists price_neg_created_at_idx on price_negotiation_history(created_at desc);

alter table price_negotiation_history enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'price_negotiation_history' and policyname = 'price_negotiation_own_all'
  ) then
    execute 'create policy "price_negotiation_own_all"
      on price_negotiation_history for all to authenticated
      using (broker_id = auth.uid())
      with check (broker_id = auth.uid())';
  end if;
end $$;
