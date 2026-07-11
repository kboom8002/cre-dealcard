-- ============================================================
-- Migration 00063: Weekly Magazine Edition System
-- 브로커 주간 매거진 에디션 + 분석 이벤트
-- ============================================================

-- ── 1. magazine_editions (브로커별 주간/일간/월간 매거진) ────────────

CREATE TABLE IF NOT EXISTS magazine_editions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id       TEXT NOT NULL,
  edition_type    TEXT NOT NULL DEFAULT 'weekly'
    CHECK (edition_type IN ('daily','weekly','monthly','special')),
  edition_label   TEXT NOT NULL,       -- 'W28-2026', '2026-07-11'
  title           TEXT NOT NULL,

  -- 커버
  market_temp     TEXT                 -- '적극 매수', '선별 매수', '관망', '조정 대기', '위기 경계'
    CHECK (market_temp IS NULL OR market_temp IN (
      '적극 매수','선별 매수','관망','조정 대기','위기 경계'
    )),
  cover_keywords  TEXT[] DEFAULT '{}',
  cover_image_url TEXT,               -- 브로커별 커버 배경 이미지

  -- 브로커 5필드 (현장 노트)
  field_note      JSONB DEFAULT '{}',

  -- 테마
  theme_title     TEXT,
  theme_body_md   TEXT,
  theme_asset_types TEXT[] DEFAULT '{}',

  -- 콘텐츠
  content         JSONB NOT NULL DEFAULT '{}',
  oiticle_ids     UUID[] DEFAULT '{}',
  featured_deal_ids UUID[] DEFAULT '{}',

  -- 타겟
  target_segments TEXT[] DEFAULT '{all}',

  -- 상태
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','editing','review','scheduled','published','archived')),
  scheduled_at    TIMESTAMPTZ,
  published_at    TIMESTAMPTZ,

  -- 성과
  view_count      INTEGER DEFAULT 0,
  share_count     INTEGER DEFAULT 0,

  -- 메타
  theme_color     TEXT DEFAULT '#6366f1',
  version         INTEGER DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 유니크 제약: 동일 브로커·유형·라벨 조합은 1개만
ALTER TABLE magazine_editions
  ADD CONSTRAINT uq_edition_broker_type_label
  UNIQUE (broker_id, edition_type, edition_label);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_editions_broker_status
  ON magazine_editions (broker_id, status, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_editions_type_label
  ON magazine_editions (edition_type, edition_label DESC);

CREATE INDEX IF NOT EXISTS idx_editions_published
  ON magazine_editions (published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_editions_scheduled
  ON magazine_editions (scheduled_at)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_editions_cover_keywords
  ON magazine_editions USING GIN (cover_keywords);

CREATE INDEX IF NOT EXISTS idx_editions_target_segments
  ON magazine_editions USING GIN (target_segments);

-- RLS
ALTER TABLE magazine_editions ENABLE ROW LEVEL SECURITY;

-- 퍼블리시된 에디션은 모든 사용자가 읽을 수 있음
CREATE POLICY "editions_public_read"
  ON magazine_editions FOR SELECT
  USING (status = 'published');

-- 브로커 본인 에디션 관리 (broker_id가 slug와 매칭되는 broker_profiles 소유자)
CREATE POLICY "editions_broker_own"
  ON magazine_editions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM broker_profiles bp
      WHERE bp.slug = magazine_editions.broker_id
        AND bp.user_id = auth.uid()
    )
  );

-- 관리자 전체 접근
CREATE POLICY "editions_admin_all"
  ON magazine_editions FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 서비스 역할 전체 접근 (배치 생성용)
CREATE POLICY "editions_service_all"
  ON magazine_editions FOR ALL
  USING (true)
  WITH CHECK (true);

-- updated_at 자동 갱신 트리거
CREATE TRIGGER editions_updated_at
  BEFORE UPDATE ON magazine_editions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── 2. magazine_analytics_events (매거진 분석 이벤트) ─────────────

CREATE TABLE IF NOT EXISTS magazine_analytics_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id    UUID REFERENCES magazine_editions(id) ON DELETE CASCADE,
  visitor_id    TEXT NOT NULL,
  event_type    TEXT NOT NULL
    CHECK (event_type IN ('page_view','section_view','click','scroll_depth','dwell')),
  section_id    TEXT,
  target_url    TEXT,
  dwell_seconds INTEGER,
  scroll_pct    INTEGER,
  metadata      JSONB DEFAULT '{}',
  target_param  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_analytics_edition_event
  ON magazine_analytics_events (edition_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_visitor
  ON magazine_analytics_events (visitor_id, created_at DESC);

-- RLS
ALTER TABLE magazine_analytics_events ENABLE ROW LEVEL SECURITY;

-- 브로커는 자기 에디션의 분석 이벤트만 조회 가능
CREATE POLICY "analytics_broker_read"
  ON magazine_analytics_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM magazine_editions me
      JOIN broker_profiles bp ON bp.slug = me.broker_id
      WHERE me.id = magazine_analytics_events.edition_id
        AND bp.user_id = auth.uid()
    )
  );

-- 이벤트 기록은 누구나 가능 (익명 방문자 포함)
CREATE POLICY "analytics_insert_public"
  ON magazine_analytics_events FOR INSERT
  WITH CHECK (true);

-- 관리자 전체 접근
CREATE POLICY "analytics_admin_all"
  ON magazine_analytics_events FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 서비스 역할 전체 접근
CREATE POLICY "analytics_service_all"
  ON magazine_analytics_events FOR ALL
  USING (true)
  WITH CHECK (true);


-- ── 3. broker_profiles에 커버 이미지 컬럼 추가 ────────────────────

ALTER TABLE broker_profiles
  ADD COLUMN IF NOT EXISTS magazine_cover_image TEXT;

COMMENT ON COLUMN broker_profiles.magazine_cover_image
  IS '브로커 매거진 커버 배경 이미지 URL';


-- ── 4. 에디션 조회수 증가 함수 ──────────────────────────────────

CREATE OR REPLACE FUNCTION increment_edition_views(edition_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE magazine_editions
    SET view_count = view_count + 1
  WHERE id = edition_id;
END;
$$ LANGUAGE plpgsql;
