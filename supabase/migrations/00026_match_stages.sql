-- supabase/migrations/00026_match_stages.sql

-- match_results 테이블에 3단계 매칭 결과 보존 컬럼 추가
ALTER TABLE match_results
  ADD COLUMN IF NOT EXISTS stage1_passed BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS stage1_details JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS stage2_similarity FLOAT DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS stage3_weights JSONB DEFAULT '{}';

-- 컬럼 주석 추가
COMMENT ON COLUMN match_results.stage1_passed IS 'Stage 1: 하드 필터 조건 충족 여부';
COMMENT ON COLUMN match_results.stage1_details IS 'Stage 1: 상세 하드 필터 통과 여부 (지역, 예산, 자산 등)';
COMMENT ON COLUMN match_results.stage2_similarity IS 'Stage 2: 시맨틱 문장 유사도 분석 점수 (0~100)';
COMMENT ON COLUMN match_results.stage3_weights IS 'Stage 3: 앙상블 가중치 매칭 점수 기여 세부 내역';
