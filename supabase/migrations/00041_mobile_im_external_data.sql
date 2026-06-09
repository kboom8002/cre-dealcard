-- Migration: 00041_mobile_im_external_data.sql
-- Mobile IM Lite 자동 생성을 위한 공공데이터 캐시 테이블

-- ─── external_data_cache ────────────────────────────────────────────────────
-- 건축물대장, 공시지가, 토지이용계획, 실거래가, 카카오 POI 데이터 캐시
-- API 키 있을 때 실 데이터, 없을 때 deterministic fallback 저장

CREATE TABLE IF NOT EXISTS external_data_cache (
  id                          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  building_ssot_lite_id       UUID NOT NULL REFERENCES building_ssot_lite(id) ON DELETE CASCADE,

  -- 주소 해석 결과
  pnu                         TEXT,                    -- 19자리 필지고유번호
  legal_dong_code             TEXT,
  road_address                TEXT,
  jibun_address               TEXT,
  latitude                    DOUBLE PRECISION,
  longitude                   DOUBLE PRECISION,

  -- 건축물대장 (국토교통부)
  building_register           JSONB DEFAULT '{}',
  building_register_fetched_at TIMESTAMPTZ,

  -- 개별공시지가 (국토교통부)
  official_land_price         JSONB DEFAULT '{}',
  land_price_fetched_at       TIMESTAMPTZ,

  -- 토지이용계획 (LURIS)
  land_use_plan               JSONB DEFAULT '{}',
  land_use_fetched_at         TIMESTAMPTZ,

  -- 상업용 실거래가 (국토교통부)
  comparable_transactions     JSONB DEFAULT '[]',
  transactions_fetched_at     TIMESTAMPTZ,

  -- 카카오 로컬 POI
  location_poi                JSONB DEFAULT '{}',
  location_fetched_at         TIMESTAMPTZ,

  -- 메타
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- 한 SSoT당 하나의 캐시 레코드
CREATE UNIQUE INDEX IF NOT EXISTS external_data_cache_ssot_unique
  ON external_data_cache (building_ssot_lite_id);

CREATE INDEX IF NOT EXISTS external_data_cache_pnu_idx
  ON external_data_cache (pnu);

-- RLS: 서비스 롤만 접근 (외부 데이터는 민감 정보 포함 가능)
ALTER TABLE external_data_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to external_data_cache"
  ON external_data_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── building_ssot_lite.raw_address 컬럼 추가 (없으면) ─────────────────────
-- 공공데이터 호출에 사용되는 원본 주소 문자열
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'building_ssot_lite' AND column_name = 'raw_address'
  ) THEN
    ALTER TABLE building_ssot_lite ADD COLUMN raw_address TEXT;
  END IF;
END $$;

-- ─── document_objects.type 에 'mobile_im' 추가 ──────────────────────────────
-- document_objects 테이블이 type ENUM을 사용하는 경우 'mobile_im'을 추가
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'document_type'
  ) THEN
    ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'mobile_im';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- type이 TEXT 컬럼인 경우 무시
  NULL;
END $$;

-- updated_at 자동 갱신 트리거
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
  FOR EACH ROW
  EXECUTE FUNCTION update_external_data_cache_updated_at();
