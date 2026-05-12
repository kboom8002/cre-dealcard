-- 1. building_ssot_lite에 IoT 필드 추가
ALTER TABLE building_ssot_lite ADD COLUMN IF NOT EXISTS iot_daily_footfall INTEGER;
ALTER TABLE building_ssot_lite ADD COLUMN IF NOT EXISTS iot_avg_dwell_minutes NUMERIC(5,1);
ALTER TABLE building_ssot_lite ADD COLUMN IF NOT EXISTS iot_peak_hour TEXT;
ALTER TABLE building_ssot_lite ADD COLUMN IF NOT EXISTS iot_footfall_trend TEXT CHECK (iot_footfall_trend IN ('increasing','stable','declining'));
ALTER TABLE building_ssot_lite ADD COLUMN IF NOT EXISTS iot_monthly_energy_kwh NUMERIC(10,2);
ALTER TABLE building_ssot_lite ADD COLUMN IF NOT EXISTS iot_energy_efficiency NUMERIC(4,2);
ALTER TABLE building_ssot_lite ADD COLUMN IF NOT EXISTS iot_floor_occupancy JSONB;
ALTER TABLE building_ssot_lite ADD COLUMN IF NOT EXISTS iot_device_id TEXT;
ALTER TABLE building_ssot_lite ADD COLUMN IF NOT EXISTS iot_last_synced_at TIMESTAMPTZ;

-- 2. 레트로핏 제품 카탈로그
CREATE TABLE IF NOT EXISTS retrofit_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,       -- 'ai-cctv', 'smart-hvac'
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,              -- 'cctv' | 'hvac' | 'sensor'
  monthly_fee_krw INTEGER NOT NULL,
  install_fee_krw INTEGER NOT NULL,
  noi_impact_pct  NUMERIC(4,1),              -- 예상 NOI 개선율 (%)
  payback_months  INTEGER,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Seed basic products
INSERT INTO retrofit_products (slug, name, category, monthly_fee_krw, install_fee_krw, noi_impact_pct, payback_months)
VALUES 
  ('ai-cctv', 'AI CCTV 유동인구 분석', 'cctv', 150000, 500000, 8.5, 8),
  ('smart-hvac', '스마트 공조 제어', 'hvac', 200000, 1500000, 15.0, 14)
ON CONFLICT (slug) DO NOTHING;

-- 3. 레트로핏 문의/인센티브 추적
CREATE TABLE IF NOT EXISTS retrofit_inquiries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id     UUID REFERENCES building_ssot_lite(id),
  broker_id       UUID,
  space_id        UUID,                       -- AiPage 공간 ID
  product_id      UUID REFERENCES retrofit_products(id),
  trigger_source  TEXT,                       -- 'owner_report_cta' | 'direct'
  status          TEXT DEFAULT 'lead'         -- 'lead' | 'contracted' | 'installed'
    CHECK (status IN ('lead','contracted','installed','cancelled')),
  broker_incentive_krw INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  installed_at    TIMESTAMPTZ
);

-- 4. IoT 원시 스트림 (타임시리즈)
CREATE TABLE IF NOT EXISTS iot_data_stream (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id     UUID REFERENCES building_ssot_lite(id),
  device_id       TEXT NOT NULL,
  metric_type     TEXT NOT NULL,              -- 'footfall' | 'energy_kwh' | 'occupancy'
  value           NUMERIC NOT NULL,
  floor           TEXT,
  recorded_at     TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iot_stream_building_metric
  ON iot_data_stream(building_id, metric_type, recorded_at DESC);

-- 5. owner_report_history (CTA 트리거 조건 판단용)
CREATE TABLE IF NOT EXISTS owner_report_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    UUID NOT NULL,
  building_id UUID,
  sent_at     TIMESTAMPTZ DEFAULT now(),
  has_retrofit_cta BOOLEAN DEFAULT false
);

-- 6. api_clients & api_usage_events (Sprint 5)
CREATE TABLE IF NOT EXISTS api_clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  api_key         TEXT UNIQUE NOT NULL,
  plan            TEXT NOT NULL CHECK (plan IN ('starter', 'pro', 'enterprise')),
  allowed_fields  TEXT[] NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_usage_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID REFERENCES api_clients(id),
  endpoint          TEXT NOT NULL,
  billed_amount_krw INTEGER NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);
