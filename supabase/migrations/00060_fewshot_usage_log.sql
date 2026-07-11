-- Phase L: 퓨샷 품질 피드백 루프
-- 어떤 퓨샷이 실제 AI 출력 품질(Judge Score) 향상에 도움이 되었는지 기록하는 이력 로그

CREATE TABLE IF NOT EXISTS im_fewshot_usage_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id   TEXT NOT NULL,              -- IM 생성 요청 ID
  section_type    TEXT NOT NULL,              -- 섹션 유형
  golden_ids_used TEXT[] DEFAULT '{}',        -- 동적 Few-shot에 사용된 golden ID 배열
  hardcoded_used  BOOLEAN DEFAULT FALSE,      -- 하드코딩 예시 노출 여부
  result_score    NUMERIC(3,1),               -- 해당 섹션의 최종 AI Judge 점수
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 추가 (통계 쿼리 최적화)
CREATE INDEX IF NOT EXISTS idx_fewshot_usage_log_golden ON im_fewshot_usage_log USING GIN(golden_ids_used);
CREATE INDEX IF NOT EXISTS idx_fewshot_usage_log_section ON im_fewshot_usage_log(section_type);
CREATE INDEX IF NOT EXISTS idx_fewshot_usage_log_created ON im_fewshot_usage_log(created_at);
