-- supabase/migrations/00034_poc_features.sql
-- New tables for PoC Features Phase 0 implementation

-- Profiles table reference might exist or we use UUID without references if it is external
-- Standard postgres functions: gen_random_uuid() and now()

-- 1. poc_surveys
CREATE TABLE IF NOT EXISTS poc_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  step_index INTEGER NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}',
  completed_at TIMESTAMPTZ DEFAULT now()
);

-- 2. market_sentiment_polls
CREATE TABLE IF NOT EXISTS market_sentiment_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  sentiment TEXT CHECK (sentiment IN ('bullish', 'neutral', 'bearish')),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. content_share_events
CREATE TABLE IF NOT EXISTS content_share_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID NOT NULL,
  viewer_id UUID,
  event_type TEXT NOT NULL, -- 'view', 'click', 'scroll', 'cta_click'
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. lead_scores
CREATE TABLE IF NOT EXISTS lead_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID,
  lead_name TEXT,
  score NUMERIC(5,2) NOT NULL DEFAULT 0,
  engagement_count INTEGER NOT NULL DEFAULT 0,
  last_active_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- 5. content_curations
CREATE TABLE IF NOT EXISTS content_curations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. curation_items
CREATE TABLE IF NOT EXISTS curation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curation_id UUID REFERENCES content_curations(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL, -- 'dealcard', 'news', 'report', 'custom'
  item_id UUID,
  custom_content JSONB DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 7. content_ab_tests
CREATE TABLE IF NOT EXISTS content_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curation_id UUID REFERENCES content_curations(id) ON DELETE CASCADE,
  variant TEXT NOT NULL CHECK (variant IN ('A', 'B')),
  title TEXT,
  description TEXT,
  views INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0
);

-- 8. external_news
CREATE TABLE IF NOT EXISTS external_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  sentiment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. external_reports
CREATE TABLE IF NOT EXISTS external_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution TEXT NOT NULL, -- 'CBRE', 'Cushman', etc.
  title TEXT NOT NULL,
  url TEXT,
  published_date DATE,
  summary TEXT,
  structured_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. social_sentiment
CREATE TABLE IF NOT EXISTS social_sentiment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  source TEXT NOT NULL,
  sentiment_score NUMERIC(5,2),
  mention_count INTEGER DEFAULT 0,
  analysis_date DATE DEFAULT CURRENT_DATE
);

-- 11. youtube_trends
CREATE TABLE IF NOT EXISTS youtube_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  channel_title TEXT,
  view_count BIGINT,
  like_count BIGINT,
  published_at TIMESTAMPTZ,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. auction_listings
CREATE TABLE IF NOT EXISTS auction_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT UNIQUE NOT NULL,
  court TEXT,
  address TEXT,
  appraised_value BIGINT,
  minimum_bid BIGINT,
  status TEXT,
  auction_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 13. rental_market_data
CREATE TABLE IF NOT EXISTS rental_market_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region TEXT NOT NULL,
  building_type TEXT,
  deposit_avg BIGINT,
  monthly_rent_avg BIGINT,
  vacancy_rate NUMERIC(5,2),
  source TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 14. rental_trend_data
CREATE TABLE IF NOT EXISTS rental_trend_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region TEXT NOT NULL,
  quarter TEXT NOT NULL,
  vacancy_rate NUMERIC(5,2),
  rental_index NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 15. land_use_plans
CREATE TABLE IF NOT EXISTS land_use_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pnu TEXT UNIQUE NOT NULL,
  zoning TEXT,
  restrictions TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 16. energy_ratings
CREATE TABLE IF NOT EXISTS energy_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID,
  rating TEXT,
  annual_energy_consumption NUMERIC(12,2),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 17. commercial_district
CREATE TABLE IF NOT EXISTS commercial_district (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  district_code TEXT UNIQUE NOT NULL,
  district_name TEXT,
  sales_volume_index NUMERIC(5,2),
  footfall_index NUMERIC(5,2),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 18. official_land_prices
CREATE TABLE IF NOT EXISTS official_land_prices (
  pnu TEXT NOT NULL,
  year INTEGER NOT NULL,
  price_per_sqm BIGINT NOT NULL,
  PRIMARY KEY (pnu, year)
);

-- 19. co_brokerage_requests
CREATE TABLE IF NOT EXISTS co_brokerage_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID,
  building_id UUID,
  commission_split TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 20. buyer_wishlists
CREATE TABLE IF NOT EXISTS buyer_wishlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID,
  regions TEXT[],
  budget_max BIGINT,
  preferred_purposes TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 21. vendor_reviews
CREATE TABLE IF NOT EXISTS vendor_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL,
  broker_id UUID,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 22. share_pages
CREATE TABLE IF NOT EXISTS share_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curation_id UUID REFERENCES content_curations(id) ON DELETE CASCADE,
  custom_subdomain TEXT UNIQUE,
  logo_url TEXT,
  theme_color TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
