-- im_generation_jobs: 비동기 IM 생성 작업 추적 테이블
CREATE TABLE IF NOT EXISTS im_generation_jobs (
  id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  input_payload JSONB,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 사용자별 작업 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_im_jobs_user ON im_generation_jobs(user_id, created_at DESC);
-- 상태별 정리 인덱스
CREATE INDEX IF NOT EXISTS idx_im_jobs_status ON im_generation_jobs(status, created_at);

-- RLS 활성화
ALTER TABLE im_generation_jobs ENABLE ROW LEVEL SECURITY;

-- 서비스 역할은 전체 접근
CREATE POLICY "Service role full access" ON im_generation_jobs
  FOR ALL USING (true) WITH CHECK (true);

-- 사용자는 자신의 작업만 조회 가능
CREATE POLICY "Users can read own jobs" ON im_generation_jobs
  FOR SELECT USING (auth.uid() = user_id);

-- 7일 지난 완료 작업 자동 정리 (옵션 — pg_cron 사용 시)
-- SELECT cron.schedule('cleanup-im-jobs', '0 4 * * *', $$DELETE FROM im_generation_jobs WHERE completed_at < NOW() - INTERVAL '7 days'$$);
