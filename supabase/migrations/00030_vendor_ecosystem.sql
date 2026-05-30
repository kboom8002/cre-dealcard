-- ============================================================
-- Migration 00030: CRE Vendor Ecosystem
-- 서비스 파트너(Vendor) 입점 + 서비스 카드 + 매칭 + 구독
-- ============================================================

-- ── 1. profiles.role에 'vendor' 추가 ──────────────────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'public_user','broker','admin','expert','owner',
    'pm_manager','tenant_prospect','js_operator','im_editor','reviewer',
    'vendor'
  ));

-- ── 2. vendor_profiles ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_profiles (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- 서비스 분류
  vendor_category   text        NOT NULL
    CHECK (vendor_category IN (
      'interior','legal','tax','pm_fm','finance','appraisal','insurance'
    )),

  -- 프로필
  company_name      text        NOT NULL,
  company_desc      text,
  specialty_regions text[]      NOT NULL DEFAULT '{}',
  license_number    text,                  -- 자격증/면허 번호 (API 자동검증용)
  license_verified  boolean     NOT NULL DEFAULT false,
  license_info      text,                  -- 자격증 상세 정보
  portfolio_urls    text[]      DEFAULT '{}',

  -- 입점 심사
  is_verified       boolean     NOT NULL DEFAULT false,
  verification_note text,
  verified_at       timestamptz,
  verified_by       uuid        REFERENCES profiles(id),

  -- 입점 tier
  vendor_tier       text        NOT NULL DEFAULT 'basic'
    CHECK (vendor_tier IN ('basic','pro','premium')),

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_profiles_user_id
  ON vendor_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_vendor_profiles_category
  ON vendor_profiles (vendor_category, is_verified);

ALTER TABLE vendor_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_profiles_select_public"
  ON vendor_profiles FOR SELECT
  USING (is_verified = true);

CREATE POLICY "vendor_profiles_select_own"
  ON vendor_profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "vendor_profiles_insert_own"
  ON vendor_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "vendor_profiles_update_own"
  ON vendor_profiles FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "vendor_profiles_admin_all"
  ON vendor_profiles FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TRIGGER vendor_profiles_updated_at
  BEFORE UPDATE ON vendor_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3. service_cards (서비스 딜카드) ──────────────────────────
CREATE TABLE IF NOT EXISTS service_cards (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id         uuid        NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE,

  -- 서비스 정보
  service_category  text        NOT NULL
    CHECK (service_category IN (
      'interior','legal','tax','pm_fm','finance','appraisal','insurance'
    )),
  title             text        NOT NULL,
  description       text        NOT NULL,
  service_regions   text[]      NOT NULL DEFAULT '{}',
  target_assets     text[]      DEFAULT '{}',
  price_range       text,
  price_unit        text,

  -- 실적
  portfolio_summary text,
  completion_count  int         NOT NULL DEFAULT 0,
  avg_rating        numeric(3,2),

  -- 자동 매칭 조건
  match_conditions  jsonb       NOT NULL DEFAULT '{}',

  -- SEO
  seo_title         text,
  seo_description   text,

  -- 상태
  visibility        text        NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public','vendor_only','internal')),
  status            text        NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft','published','archived')),

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_cards_vendor_id
  ON service_cards (vendor_id);
CREATE INDEX IF NOT EXISTS idx_service_cards_category
  ON service_cards (service_category, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_cards_regions
  ON service_cards USING GIN (service_regions);

ALTER TABLE service_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_cards_public_read"
  ON service_cards FOR SELECT
  USING (status = 'published' AND visibility = 'public');

CREATE POLICY "service_cards_vendor_own"
  ON service_cards FOR ALL
  USING (vendor_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid()));

CREATE POLICY "service_cards_admin_all"
  ON service_cards FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TRIGGER service_cards_updated_at
  BEFORE UPDATE ON service_cards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 4. service_matches (서비스↔매물/아고라 매칭) ──────────────
CREATE TABLE IF NOT EXISTS service_matches (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_card_id   uuid        NOT NULL REFERENCES service_cards(id) ON DELETE CASCADE,
  building_id       uuid        REFERENCES building_ssot_lite(id) ON DELETE SET NULL,
  agora_thread_id   uuid        REFERENCES agora_threads(id) ON DELETE SET NULL,

  -- 매칭 컨텍스트
  match_trigger     text        NOT NULL
    CHECK (match_trigger IN (
      'deal_completion','vacancy_signal','readiness_check',
      'gate_approval','agora_question','manual','ai_recommendation'
    )),
  match_score       numeric(5,2),

  -- 리드 전환 추적
  status            text        NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested','viewed','contacted','converted','declined')),

  -- 리드 수수료 (건당 수수료 모델)
  lead_fee_charged  boolean     NOT NULL DEFAULT false,
  lead_fee_amount   numeric(10,2),

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_matches_card
  ON service_matches (service_card_id, status);
CREATE INDEX IF NOT EXISTS idx_service_matches_building
  ON service_matches (building_id)
  WHERE building_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_matches_agora
  ON service_matches (agora_thread_id)
  WHERE agora_thread_id IS NOT NULL;

ALTER TABLE service_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_matches_vendor_read"
  ON service_matches FOR SELECT
  USING (service_card_id IN (
    SELECT sc.id FROM service_cards sc
    JOIN vendor_profiles vp ON vp.id = sc.vendor_id
    WHERE vp.user_id = auth.uid()
  ));

CREATE POLICY "service_matches_public_read"
  ON service_matches FOR SELECT
  USING (status IN ('suggested','viewed'));

CREATE POLICY "service_matches_admin_all"
  ON service_matches FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TRIGGER service_matches_updated_at
  BEFORE UPDATE ON service_matches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 5. vendor_subscriptions (입점 구독 — user_subscriptions와 분리) ─
CREATE TABLE IF NOT EXISTS vendor_subscriptions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id             uuid        NOT NULL REFERENCES vendor_profiles(id) ON DELETE CASCADE UNIQUE,

  tier                  text        NOT NULL DEFAULT 'basic'
    CHECK (tier IN ('basic','pro','premium')),
  status                text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','past_due','canceled')),

  -- Tier별 기능 한도
  max_service_cards     int         NOT NULL DEFAULT 3,
  max_monthly_leads     int,                             -- NULL = 무제한
  agora_expert_badge    boolean     NOT NULL DEFAULT false,
  featured_placement    boolean     NOT NULL DEFAULT false,

  -- 리드 수수료 단가 (건당)
  lead_fee_per_contact  numeric(10,2) NOT NULL DEFAULT 50000, -- 기본 5만 원/건

  current_period_start  timestamptz NOT NULL DEFAULT now(),
  current_period_end    timestamptz NOT NULL DEFAULT now() + INTERVAL '1 month',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vendor_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendor_subs_own_read"
  ON vendor_subscriptions FOR SELECT
  USING (vendor_id IN (SELECT id FROM vendor_profiles WHERE user_id = auth.uid()));

CREATE POLICY "vendor_subs_admin_all"
  ON vendor_subscriptions FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TRIGGER vendor_subscriptions_updated_at
  BEFORE UPDATE ON vendor_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 6. vendor_profiles 생성 시 자동으로 basic 구독 생성 ──────────
CREATE OR REPLACE FUNCTION handle_new_vendor_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO vendor_subscriptions (vendor_id, tier, max_service_cards, max_monthly_leads)
  VALUES (NEW.id, 'basic', 3, 10)
  ON CONFLICT (vendor_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_new_vendor_subscription
  AFTER INSERT ON vendor_profiles
  FOR EACH ROW EXECUTE FUNCTION handle_new_vendor_subscription();

-- ── 7. usage_counters에 vendor 기능 추가 ─────────────────────────
ALTER TABLE usage_counters DROP CONSTRAINT IF EXISTS usage_counters_feature_name_check;
ALTER TABLE usage_counters ADD CONSTRAINT usage_counters_feature_name_check
  CHECK (feature_name IN (
    'deal_card_creation','ai_matching','im_generation',
    'service_card_creation','vendor_lead_contact'
  ));

-- ── 8. agora_replies.author_role에 vendor 역할 추가 ──────────────
ALTER TABLE agora_replies DROP CONSTRAINT IF EXISTS agora_replies_author_role_check;
ALTER TABLE agora_replies ADD CONSTRAINT agora_replies_author_role_check
  CHECK (author_role IN (
    'user','broker','expert','ai',
    'vendor_interior','vendor_legal','vendor_tax',
    'vendor_pm','vendor_finance','vendor_appraisal','vendor_insurance'
  ));
