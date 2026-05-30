-- supabase/migrations/00025_verification_status.sql

-- building_ssot_lite 테이블에 공공데이터 교차 검증을 위한 컬럼 추가
ALTER TABLE building_ssot_lite
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'mismatch', 'not_found', 'skipped')),
  ADD COLUMN IF NOT EXISTS verification_details JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- 컬럼 주석 추가
COMMENT ON COLUMN building_ssot_lite.verification_status IS '공공 데이터 교차 확인 결과 상태';
COMMENT ON COLUMN building_ssot_lite.verification_details IS '공공 데이터 대조 검증 항목별 상세 결과 세부사항';
COMMENT ON COLUMN building_ssot_lite.verified_at IS '공공 데이터 교차 확인 완료 일시';
