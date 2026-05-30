-- supabase/migrations/00028_subscription.sql

-- 1. 사용자 구독 정보 테이블 생성
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'premium')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 month'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS 활성화
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- 본인 구독 정보만 SELECT 가능
CREATE POLICY "Users can view own subscription"
  ON user_subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- 관리자는 모든 구독 정보 SELECT/UPDATE 가능
CREATE POLICY "Admins can manage all subscriptions"
  ON user_subscriptions FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 2. 월별 API/기능 사용량 카운터 테이블 생성
CREATE TABLE IF NOT EXISTS usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  feature_name TEXT NOT NULL CHECK (feature_name IN ('deal_card_creation', 'ai_matching', 'im_generation')),
  billing_month TEXT NOT NULL, -- 포맷: 'YYYY-MM'
  current_count INT NOT NULL DEFAULT 0,
  max_limit INT, -- NULL 이면 무제한
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, feature_name, billing_month)
);

-- RLS 활성화
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage counters"
  ON usage_counters FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all usage counters"
  ON usage_counters FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 3. 프로필 가입 시 자동으로 free 구독을 설정해주는 트리거/펑션 설정 (안전 보조용)
CREATE OR REPLACE FUNCTION handle_new_user_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_subscriptions (user_id, tier)
  VALUES (NEW.id, 'free')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tr_new_user_subscription
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_subscription();

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_counters_query ON usage_counters(user_id, feature_name, billing_month);
