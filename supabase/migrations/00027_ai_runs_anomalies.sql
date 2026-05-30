-- supabase/migrations/00027_ai_runs_anomalies.sql

-- ai_runs 테이블에 이상치/환각 플래그 보존 컬럼 추가
ALTER TABLE ai_runs
  ADD COLUMN IF NOT EXISTS anomaly_flags JSONB DEFAULT '[]';

-- 컬럼 주석 추가
COMMENT ON COLUMN ai_runs.anomaly_flags IS 'AI 실행 결과 이상치 감지 및 환각 의심 플래그 리스트';
