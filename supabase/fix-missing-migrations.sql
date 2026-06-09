-- ============================================================
-- 🔧 CRE DealCard — Missing Migrations Fix
-- Supabase SQL Editor에서 전체 복사 후 Run 클릭
-- URL: https://supabase.com/dashboard/project/vwbmaulavgjwezffbxgi/sql/new
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- STEP 1: document_objects 제약 조건 수정
-- ────────────────────────────────────────────────────────────

ALTER TABLE document_objects
  DROP CONSTRAINT IF EXISTS document_objects_document_type_check;

ALTER TABLE document_objects
  ADD CONSTRAINT document_objects_document_type_check
  CHECK (document_type IN (
    'deal_curiosity_report',
    'blind_teaser',
    'buyer_fit_memo',
    'owner_prep_memo',
    'missing_data_checklist',
    'gate_request_note',
    'snapshot',
    'mobile_im'
  ));

ALTER TABLE document_objects
  DROP CONSTRAINT IF EXISTS document_objects_status_check;

ALTER TABLE document_objects
  ADD CONSTRAINT document_objects_status_check
  CHECK (status IN (
    'draft', 'generating', 'generated',
    'pending_approval', 'published',
    'revision_needed', 'disclosure_checked',
    'broker_reviewed', 'approved_internal',
    'shared_external', 'archived'
  ));


-- ────────────────────────────────────────────────────────────
-- STEP 2: document_objects 컬럼 추가
-- ────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='document_objects' AND column_name='broker_id'
  ) THEN
    ALTER TABLE document_objects
      ADD COLUMN broker_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='document_objects' AND column_name='slug'
  ) THEN
    ALTER TABLE document_objects ADD COLUMN slug TEXT;
    CREATE UNIQUE INDEX document_objects_slug_idx
      ON document_objects(slug) WHERE slug IS NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='document_objects' AND column_name='content'
  ) THEN
    ALTER TABLE document_objects ADD COLUMN content JSONB DEFAULT '{}';
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────
-- STEP 3: building_ssot_lite 컬럼 추가
-- ────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='building_ssot_lite' AND column_name='raw_address'
  ) THEN
    ALTER TABLE building_ssot_lite ADD COLUMN raw_address TEXT;
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────
-- STEP 4: external_data_cache 테이블 생성
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS external_data_cache (
  id                           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  building_ssot_lite_id        UUID NOT NULL
    REFERENCES building_ssot_lite(id) ON DELETE CASCADE,
  pnu                          TEXT,
  legal_dong_code              TEXT,
  road_address                 TEXT,
  jibun_address                TEXT,
  latitude                     DOUBLE PRECISION,
  longitude                    DOUBLE PRECISION,
  building_register            JSONB DEFAULT '{}',
  building_register_fetched_at TIMESTAMPTZ,
  official_land_price          JSONB DEFAULT '{}',
  land_price_fetched_at        TIMESTAMPTZ,
  land_use_plan                JSONB DEFAULT '{}',
  land_use_fetched_at          TIMESTAMPTZ,
  comparable_transactions      JSONB DEFAULT '[]',
  transactions_fetched_at      TIMESTAMPTZ,
  location_poi                 JSONB DEFAULT '{}',
  location_fetched_at          TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS external_data_cache_ssot_unique
  ON external_data_cache (building_ssot_lite_id);

CREATE INDEX IF NOT EXISTS external_data_cache_pnu_idx
  ON external_data_cache (pnu);

ALTER TABLE external_data_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to external_data_cache"
  ON external_data_cache FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_external_data_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS external_data_cache_updated_at ON external_data_cache;
CREATE TRIGGER external_data_cache_updated_at
  BEFORE UPDATE ON external_data_cache
  FOR EACH ROW EXECUTE FUNCTION update_external_data_cache_updated_at();


-- ────────────────────────────────────────────────────────────
-- STEP 5: Demo 시딩 — building_ssot_lite (GBD Office)
-- ────────────────────────────────────────────────────────────

INSERT INTO building_ssot_lite (
  id, owner_id, created_by_role, input_type, raw_input,
  area_signal, asset_type, price_band, size_signal,
  current_use_signal, vacancy_signal,
  fit_summary, caution_summary,
  hidden_fields, layers, confidence, disclosure, status, raw_address
) VALUES (
  'b1111111-1111-1111-1111-111111111111',
  (SELECT id FROM profiles LIMIT 1),
  'broker', 'broker_memo',
  '강남구 테헤란로 427 소재 A급 오피스 빌딩. 연면적 약 8,500㎡, 지하3층/지상15층. 완전임대 상태 월 임대료 1.1억. WALT 2.8년. 매각 희망가 450억원.',
  '강남구 GBD (테헤란로)', '오피스 빌딩', '450억원',
  '연면적 8,500㎡ (2,571평), 지하3층/지상15층',
  '완전임대 (Multi-tenant 오피스)', '완전임대 (0% 공실)',
  '강남 GBD A급 완전임대 안정 수익형. 자산운용사·법인 사옥 최적.',
  '준공 18년 경과 설비 노후화 확인 필요. 외국계 임차인 1.8년 만기 리스크.',
  ARRAY['tenant_name','exact_address','unit_rent','seller_motivation'],
  '{"asset_identity":{"asset_type":"오피스 빌딩","area_tier":"GBD_A급","asset_grade":"A"},"physical_fact":{"total_area_sqm":8500,"floors_above":15,"floors_below":3,"completion_year":2007,"parking_count":120,"vacancy_pct":0},"income_signal":{"monthly_rent_krw":110000000,"cap_rate_base_pct":2.53,"irr_5y_base_pct":8.4}}'::jsonb,
  '{"asset_type":"confirmed","price_band":"confirmed","monthly_rent":"inferred","vacancy_signal":"confirmed"}'::jsonb,
  '{"tenant_name":"redacted","exact_address":"redacted","unit_rent":"redacted"}'::jsonb,
  'snapshot_draft_ready',
  '서울특별시 강남구 테헤란로 427'
)
ON CONFLICT (id) DO UPDATE SET
  layers     = EXCLUDED.layers,
  status     = EXCLUDED.status,
  raw_address = EXCLUDED.raw_address,
  updated_at = NOW();


-- ────────────────────────────────────────────────────────────
-- STEP 6: Demo 시딩 — document_objects (Mobile IM)
-- ────────────────────────────────────────────────────────────

INSERT INTO document_objects (
  id, owner_id, broker_id, source_type, source_id, building_id,
  document_type, visibility, status, slug, title,
  model_version, prompt_version, body, content
) VALUES (
  'd1111111-1111-1111-1111-111111111111',
  (SELECT id FROM profiles LIMIT 1),
  (SELECT id FROM profiles LIMIT 1),
  'building_ssot_lite',
  'b1111111-1111-1111-1111-111111111111',
  'b1111111-1111-1111-1111-111111111111',
  'mobile_im', 'public_blind', 'published',
  'demo-gbd-office-hongildong',
  '강남구 GBD A급 오피스 빌딩 — Mobile IM (Pipeline Demo)',
  'gpt-4o-2024-11-20', 'mobile-im-v1.2-phase0',
  '{"building_id":"f1111111-1111-1111-1111-111111111111","blind_name":"강남구 GBD *** 오피스 빌딩","area_signal":"강남구 GBD (테헤란로)","asset_type":"오피스 빌딩","price_band":"450억원","completeness_score":92,"ai_used":true}'::jsonb,
  '{"building_ssot_lite_id":"b1111111-1111-1111-1111-111111111111","ai_used":true,"model":"gpt-4o-2024-11-20","financial_summary":{"monthly_rent_krw":110000000,"purchase_price_krw":45000000000,"noi_base":1140000000,"cap_rate_base":2.53,"irr_5y_base":8.4,"gross_yield":2.93,"price_per_pyeong":17500000},"readiness":{"score":92,"missing":[]}}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  content    = EXCLUDED.content,
  body       = EXCLUDED.body,
  status     = EXCLUDED.status,
  updated_at = NOW();


-- ────────────────────────────────────────────────────────────
-- STEP 7: Demo 시딩 — external_data_cache
-- ────────────────────────────────────────────────────────────

INSERT INTO external_data_cache (
  building_ssot_lite_id, pnu, legal_dong_code,
  road_address, jibun_address, latitude, longitude,
  building_register, building_register_fetched_at,
  official_land_price, land_price_fetched_at,
  comparable_transactions, transactions_fetched_at,
  location_poi, location_fetched_at
) VALUES (
  'b1111111-1111-1111-1111-111111111111',
  '1168010100108870002',
  '1168010100',
  '서울특별시 강남구 테헤란로 427',
  '서울특별시 강남구 대치동 887-2',
  37.5074,
  127.0592,
  '{"gross_floor_area_sqm":8493.6,"site_area_sqm":1420.0,"floors_above_ground":15,"floors_below_ground":3,"completion_date":"2007-03-15","main_purpose_code":"업무시설","structure":"철근콘크리트","parking_inside":120,"elevator_count":6,"land_area_sqm":1420.0,"floor_area_ratio_pct":598.1,"building_coverage_pct":59.4,"source":"국토교통부 건축물대장","fetched_at":"2026-06-05T00:00:00Z"}'::jsonb,
  '2026-06-05T00:00:00Z'::timestamptz,
  '{"official_price_per_sqm":8350000,"year":2024,"prior_year_price_per_sqm":7820000,"two_year_prior_price_per_sqm":6820000,"yoy_change_pct":6.78,"cagr_2y_pct":10.6,"source":"국토교통부 공시지가","fetched_at":"2026-06-05T00:00:00Z"}'::jsonb,
  '2026-06-05T00:00:00Z'::timestamptz,
  '[{"address":"서울 강남구 역삼동 오피스 빌딩","deal_date":"2024-09-15","total_price_krw":48200000000,"total_area_sqm":9120,"price_per_sqm":5285087,"floors_above":18,"completion_year":2006,"distance_km":0.3},{"address":"서울 강남구 테헤란로 오피스","deal_date":"2024-03-22","total_price_krw":41500000000,"total_area_sqm":7850,"price_per_sqm":5286624,"floors_above":14,"completion_year":2009,"distance_km":0.5},{"address":"서울 강남구 대치동 A급 오피스","deal_date":"2023-11-10","total_price_krw":52000000000,"total_area_sqm":10200,"price_per_sqm":5098039,"floors_above":20,"completion_year":2012,"distance_km":0.7},{"address":"서울 강남구 역삼동 B급 오피스","deal_date":"2023-08-05","total_price_krw":28700000000,"total_area_sqm":5800,"price_per_sqm":4948276,"floors_above":12,"completion_year":2004,"distance_km":0.9}]'::jsonb,
  '2026-06-05T00:00:00Z'::timestamptz,
  '{"subway":{"nearest_station":"강남역","line":"2호선","walking_minutes":8},"cafes":{"count_500m":47},"restaurants":{"count_500m":112},"banks":{"count_500m":18},"convenience":{"count_200m":6},"hospitals":{"count_1km":23},"hotels":{"count_1km":8},"source":"카카오 로컬 API","fetched_at":"2026-06-05T00:00:00Z"}'::jsonb,
  '2026-06-05T00:00:00Z'::timestamptz
)
ON CONFLICT (building_ssot_lite_id) DO UPDATE SET
  building_register            = EXCLUDED.building_register,
  official_land_price          = EXCLUDED.official_land_price,
  comparable_transactions      = EXCLUDED.comparable_transactions,
  location_poi                 = EXCLUDED.location_poi,
  updated_at                   = NOW();


-- ────────────────────────────────────────────────────────────
-- STEP 8: NEED_MIGRATION.flag 해소 확인용 쿼리
-- ────────────────────────────────────────────────────────────

-- 실행 후 아래 결과가 나오면 성공:
SELECT
  (SELECT COUNT(*) FROM external_data_cache)  AS external_data_cache_rows,
  (SELECT COUNT(*) FROM document_objects WHERE document_type = 'mobile_im') AS mobile_im_docs,
  (SELECT slug FROM document_objects WHERE slug = 'demo-gbd-office-hongildong') AS demo_slug_ok;
