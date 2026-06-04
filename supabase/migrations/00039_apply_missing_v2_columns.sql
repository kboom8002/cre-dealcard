-- ============================================================
-- Migration 00039: Apply Missing Broker Profile V2 Columns
-- ============================================================

-- 1. 자격/등록 정보
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS license_number text;
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS office_reg_number text;
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS association text;
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS career_start_year integer;

-- 2. 거래 실적
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS total_deal_count_self integer;
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS deal_size_range text;
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS deal_types_ratio jsonb DEFAULT '{}';

-- 3. 전문성 심화
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS deal_specialty text[] DEFAULT '{}';
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS buyer_types text[] DEFAULT '{}';
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS preferred_price_range text;
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS languages text[] DEFAULT '{"한국어"}';

-- 4. 서비스 정책
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS fee_policy text DEFAULT '법정수수료준수';
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS consult_methods text[] DEFAULT '{"전화", "카카오톡"}';
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS response_time_hours integer DEFAULT 24;

-- 5. 소셜 링크
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS kakao_channel text;
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS naver_blog_url text;
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS youtube_url text;
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS linkedin_url text;

-- 6. SEO / 공개 프로필
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS seo_summary text;
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS slug text UNIQUE;
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

-- 7. 사무소 GEO
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS office_address text;
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS office_district text;
ALTER TABLE broker_profiles ADD COLUMN IF NOT EXISTS office_dong text[] DEFAULT '{}';

-- Index for slug-based public lookup (using IF NOT EXISTS where possible, or drop first)
DROP INDEX IF EXISTS idx_broker_profiles_slug;
CREATE INDEX idx_broker_profiles_slug ON broker_profiles(slug) WHERE slug IS NOT NULL;

DROP INDEX IF EXISTS idx_broker_profiles_public;
CREATE INDEX idx_broker_profiles_public ON broker_profiles(is_public) WHERE is_public = true;

-- Drop and recreate policy for SELECT
DROP POLICY IF EXISTS "broker_profiles_public_read" ON broker_profiles;
CREATE POLICY "broker_profiles_public_read"
  ON broker_profiles FOR SELECT
  TO anon
  USING (is_public = true);
