-- ============================================================
-- 00062: 명함 연락처 이메일
-- ============================================================
-- contact_email: 명함에 표시할 이메일 (NULL이면 auth.users.email 사용)

ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS contact_email text;
