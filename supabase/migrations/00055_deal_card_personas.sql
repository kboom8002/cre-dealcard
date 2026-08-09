-- ============================================================
-- Migration 00055: Deal Card Personas (AI Ideal Buyer Persona DB Persistence)
-- Persists AI-generated ideal buyer personas per building
-- ============================================================

create table if not exists deal_card_personas (
  id                    uuid primary key default gen_random_uuid(),
  building_ssot_lite_id uuid not null references building_ssot_lite(id) on delete cascade,
  broker_id             uuid not null references profiles(id) on delete cascade,
  personas_data         jsonb not null,    -- Full IdealBuyerPersonasOutput
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- One active persona set per building per broker
  constraint deal_card_personas_unique unique (building_ssot_lite_id, broker_id)
);

create index deal_card_personas_building_idx on deal_card_personas(building_ssot_lite_id);
create index deal_card_personas_broker_idx   on deal_card_personas(broker_id);

alter table deal_card_personas enable row level security;

create policy "personas_broker_own"
  on deal_card_personas for all to authenticated
  using (broker_id = auth.uid());

create trigger deal_card_personas_updated_at
  before update on deal_card_personas
  for each row execute function set_updated_at();
