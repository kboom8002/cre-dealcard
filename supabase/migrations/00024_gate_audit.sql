-- supabase/migrations/00024_gate_audit.sql

-- 1. Gate 접근 로그 테이블 생성
CREATE TABLE IF NOT EXISTS gate_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_request_id UUID REFERENCES gate_requests(id) ON DELETE CASCADE,
  accessor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  building_id UUID REFERENCES building_ssot_lite(id) ON DELETE CASCADE,
  accessed_fields TEXT[] NOT NULL DEFAULT '{}',
  access_type TEXT NOT NULL CHECK (access_type IN ('view', 'download', 'share', 'copy')),
  ip_hash TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS 활성화
ALTER TABLE gate_access_log ENABLE ROW LEVEL SECURITY;

-- 사용자는 본인의 접근 로그만 SELECT 가능
CREATE POLICY "Users can view own access logs"
  ON gate_access_log FOR SELECT
  USING (accessor_id = auth.uid());

-- 관리자(Admin)는 전체 접근 로그 SELECT 가능
CREATE POLICY "Admins can view all access logs"
  ON gate_access_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 2. gate_requests 테이블에 만료 관련 컬럼 추가
ALTER TABLE gate_requests
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_expired BOOLEAN DEFAULT false;

-- 승인 시 자동으로 72시간 뒤 만료 일시를 설정하는 트리거 생성
CREATE OR REPLACE FUNCTION set_gate_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    NEW.expires_at := NOW() + INTERVAL '72 hours';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tr_gate_expiry
  BEFORE UPDATE ON gate_requests
  FOR EACH ROW EXECUTE FUNCTION set_gate_expiry();

-- 성능 최적화를 위한 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_gate_access_log_accessor ON gate_access_log(accessor_id);
CREATE INDEX IF NOT EXISTS idx_gate_access_log_building ON gate_access_log(building_id);
CREATE INDEX IF NOT EXISTS idx_gate_requests_expires ON gate_requests(expires_at) WHERE auto_expired = false;
