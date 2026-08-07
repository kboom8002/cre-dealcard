-- ═══════════════════════════════════════════════════════════
-- 1. broker_circles — 서클(팀) 마스터
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS broker_circles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  created_by    UUID NOT NULL REFERENCES profiles(id),
  avatar_emoji  TEXT DEFAULT '🤝',
  invite_code   TEXT UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  max_members   INT NOT NULL DEFAULT 10,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- 2. broker_circle_members — 멤버십
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS broker_circle_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id     UUID NOT NULL REFERENCES broker_circles(id) ON DELETE CASCADE,
  broker_id     UUID NOT NULL REFERENCES profiles(id),
  role          TEXT NOT NULL DEFAULT 'member'
                CHECK (role IN ('owner', 'admin', 'member')),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'active', 'left', 'removed')),
  invited_by    UUID REFERENCES profiles(id),
  joined_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(circle_id, broker_id)
);

-- ═══════════════════════════════════════════════════════════
-- 3. circle_shared_assets — 서클에 공유된 자산 (opt-in)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS circle_shared_assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id     UUID NOT NULL REFERENCES broker_circles(id) ON DELETE CASCADE,
  broker_id     UUID NOT NULL REFERENCES profiles(id),
  asset_type    TEXT NOT NULL CHECK (asset_type IN ('building', 'buyer_intent', 'tenant_intent')),
  asset_id      UUID NOT NULL,
  -- Progressive Trust: 시스템이 자동 관리, 초기값 signal_only
  visibility    TEXT NOT NULL DEFAULT 'signal_only'
                CHECK (visibility IN ('signal_only', 'basic_info', 'full_detail')),
  shared_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(circle_id, asset_type, asset_id)
);

-- ═══════════════════════════════════════════════════════════
-- 4. circle_match_results — 팀 크로스 매칭 + 양측 승인 추적
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS circle_match_results (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id              UUID NOT NULL REFERENCES broker_circles(id),
  building_id            UUID NOT NULL,
  building_broker_id     UUID NOT NULL REFERENCES profiles(id),
  buyer_intent_id        UUID NOT NULL,
  buyer_broker_id        UUID NOT NULL REFERENCES profiles(id),
  -- 매칭 결과
  grade                  TEXT NOT NULL CHECK (grade IN ('S', 'A', 'B', 'C')),
  score                  NUMERIC(5,2) NOT NULL,
  stage1_passed          BOOLEAN DEFAULT TRUE,
  stage2_similarity      NUMERIC(5,4),
  stage3_score           NUMERIC(5,2),
  reasoning              TEXT,
  purpose_weight_profile TEXT,
  -- 양측 승인 상태
  building_broker_approved  BOOLEAN DEFAULT FALSE,
  buyer_broker_approved     BOOLEAN DEFAULT FALSE,
  building_broker_approved_at TIMESTAMPTZ,
  buyer_broker_approved_at   TIMESTAMPTZ,
  identity_revealed_at       TIMESTAMPTZ,
  -- 공동중개
  co_brokerage_deal_id  UUID,  -- 자동 생성된 파이프라인 딜 ID
  co_brokerage_note     TEXT,
  fee_split_ratio       TEXT,  -- e.g. "50:50", "60:40"
  -- 타임스탬프
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  expired_at            TIMESTAMPTZ,  -- 승인 타임아웃
  UNIQUE(circle_id, building_id, buyer_intent_id)
);

-- ═══════════════════════════════════════════════════════════
-- RLS Policies
-- ═══════════════════════════════════════════════════════════
ALTER TABLE broker_circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_circle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_shared_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_match_results ENABLE ROW LEVEL SECURITY;

-- Helper: 현재 사용자의 active 서클 ID 목록
CREATE OR REPLACE FUNCTION my_active_circle_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT circle_id FROM broker_circle_members
  WHERE broker_id = auth.uid() AND status = 'active'
$$;

-- broker_circles policies
DO $$ BEGIN
  CREATE POLICY "circles_select" ON broker_circles FOR SELECT
    USING (id IN (SELECT my_active_circle_ids()) OR created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "circles_insert" ON broker_circles FOR INSERT
    WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "circles_update" ON broker_circles FOR UPDATE
    USING (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "circles_delete" ON broker_circles FOR DELETE
    USING (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- broker_circle_members policies
DO $$ BEGIN
  CREATE POLICY "members_select" ON broker_circle_members FOR SELECT
    USING (broker_id = auth.uid() OR circle_id IN (SELECT my_active_circle_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "members_insert" ON broker_circle_members FOR INSERT
    WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "members_update" ON broker_circle_members FOR UPDATE
    USING (broker_id = auth.uid() OR circle_id IN (
      SELECT circle_id FROM broker_circle_members
      WHERE broker_id = auth.uid() AND role IN ('owner', 'admin') AND status = 'active'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- circle_shared_assets policies
DO $$ BEGIN
  CREATE POLICY "shared_select" ON circle_shared_assets FOR SELECT
    USING (circle_id IN (SELECT my_active_circle_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "shared_insert" ON circle_shared_assets FOR INSERT
    WITH CHECK (broker_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "shared_delete" ON circle_shared_assets FOR DELETE
    USING (broker_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- circle_match_results policies
DO $$ BEGIN
  CREATE POLICY "cmatch_select" ON circle_match_results FOR SELECT
    USING (building_broker_id = auth.uid() OR buyer_broker_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cmatch_insert" ON circle_match_results FOR INSERT
    WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "cmatch_update" ON circle_match_results FOR UPDATE
    USING (building_broker_id = auth.uid() OR buyer_broker_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_bcm_broker_status ON broker_circle_members(broker_id, status);
CREATE INDEX IF NOT EXISTS idx_bcm_circle_status ON broker_circle_members(circle_id, status);
CREATE INDEX IF NOT EXISTS idx_csa_circle_type ON circle_shared_assets(circle_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_csa_asset ON circle_shared_assets(asset_id);
CREATE INDEX IF NOT EXISTS idx_csa_broker ON circle_shared_assets(broker_id);
CREATE INDEX IF NOT EXISTS idx_cmr_circle ON circle_match_results(circle_id);
CREATE INDEX IF NOT EXISTS idx_cmr_building_broker ON circle_match_results(building_broker_id);
CREATE INDEX IF NOT EXISTS idx_cmr_buyer_broker ON circle_match_results(buyer_broker_id);
CREATE INDEX IF NOT EXISTS idx_cmr_grade ON circle_match_results(circle_id, grade);
CREATE INDEX IF NOT EXISTS idx_bc_invite_code ON broker_circles(invite_code) WHERE invite_code IS NOT NULL;
