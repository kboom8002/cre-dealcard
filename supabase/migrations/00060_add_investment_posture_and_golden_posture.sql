-- 00060_add_investment_posture_and_golden_posture.sql
-- UAT-02 테스트에서 발견된 DB 스키마 누락 수정

-- 1-1. assets 테이블에 investment_posture 컬럼 추가
ALTER TABLE assets ADD COLUMN IF NOT EXISTS investment_posture TEXT DEFAULT 'income';
CREATE INDEX IF NOT EXISTS idx_assets_investment_posture ON assets(investment_posture);

-- 1-2. im_golden_sets 테이블에 posture 컬럼 추가
ALTER TABLE im_golden_sets ADD COLUMN IF NOT EXISTS posture TEXT DEFAULT 'income';
CREATE INDEX IF NOT EXISTS idx_golden_sets_posture ON im_golden_sets(posture);
