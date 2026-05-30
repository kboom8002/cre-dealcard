-- ============================================================
-- Migration 00031: CRE Pulse + Oiticle
-- 메타 인텔리전스 기반 인사이트 콘텐츠 시스템
-- ============================================================

-- ── 1. cre_pulses (주간/월간 시장 펄스) ─────────────────────────
CREATE TABLE IF NOT EXISTS cre_pulses (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  region          text        NOT NULL,
  period_type     text        NOT NULL CHECK (period_type IN ('weekly','monthly')),
  period_label    text        NOT NULL,

  -- 시그널 스냅샷
  signals         jsonb       NOT NULL DEFAULT '{}',
  pulse_score     numeric(5,2) NOT NULL DEFAULT 50,
  trend           text        NOT NULL DEFAULT 'flat'
    CHECK (trend IN ('up','flat','down')),

  -- AI 요약
  summary_ko      text        NOT NULL,
  key_findings    text[]      NOT NULL DEFAULT '{}',

  -- SEO
  seo_title       text,
  seo_slug        text        UNIQUE,

  -- 관련 콘텐츠
  related_deal_ids    uuid[]  DEFAULT '{}',
  related_thread_ids  uuid[]  DEFAULT '{}',
  related_service_ids uuid[]  DEFAULT '{}',

  status          text        NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft','published','archived')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cre_pulses_region_period
  ON cre_pulses (region, period_type, period_label DESC);
CREATE INDEX IF NOT EXISTS idx_cre_pulses_slug
  ON cre_pulses (seo_slug) WHERE seo_slug IS NOT NULL;

ALTER TABLE cre_pulses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cre_pulses_public_read"
  ON cre_pulses FOR SELECT
  USING (status = 'published');

CREATE POLICY "cre_pulses_admin_all"
  ON cre_pulses FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── 2. cre_oiticles (롱폼 인사이트 콘텐츠) ─────────────────────
CREATE TABLE IF NOT EXISTS cre_oiticles (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 유형
  oiticle_type    text        NOT NULL
    CHECK (oiticle_type IN ('MA','CS','LG','TX','PM','IA','TR','PS')),

  -- 콘텐츠
  title           text        NOT NULL,
  slug            text        NOT NULL UNIQUE,
  excerpt         text        NOT NULL,
  body_md         text        NOT NULL,
  cover_image     text,

  -- 작성자 (AI + 중개인/벤더 기고 허용)
  author_type     text        NOT NULL DEFAULT 'ai'
    CHECK (author_type IN ('ai','broker','vendor','admin')),
  author_id       uuid        REFERENCES profiles(id),
  author_name     text        NOT NULL DEFAULT 'DealCard AI',

  -- 분류
  regions         text[]      NOT NULL DEFAULT '{}',
  asset_types     text[]      DEFAULT '{}',
  tags            text[]      NOT NULL DEFAULT '{}',

  -- 데이터 기반
  source_pulse_id uuid        REFERENCES cre_pulses(id),
  data_snapshot   jsonb       DEFAULT '{}',

  -- SEO
  seo_title       text,
  seo_description text,

  -- 관련 콘텐츠
  related_deal_ids    uuid[]  DEFAULT '{}',
  related_thread_ids  uuid[]  DEFAULT '{}',
  related_service_ids uuid[]  DEFAULT '{}',

  -- 참여
  views           int         NOT NULL DEFAULT 0,
  likes           int         NOT NULL DEFAULT 0,
  share_count     int         NOT NULL DEFAULT 0,

  -- 상태
  status          text        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','review','published','archived')),
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oiticles_slug
  ON cre_oiticles (slug);
CREATE INDEX IF NOT EXISTS idx_oiticles_type_status
  ON cre_oiticles (oiticle_type, status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_oiticles_author
  ON cre_oiticles (author_id) WHERE author_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oiticles_regions
  ON cre_oiticles USING GIN (regions);
CREATE INDEX IF NOT EXISTS idx_oiticles_tags
  ON cre_oiticles USING GIN (tags);

ALTER TABLE cre_oiticles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oiticles_public_read"
  ON cre_oiticles FOR SELECT
  USING (status = 'published');

CREATE POLICY "oiticles_author_own"
  ON cre_oiticles FOR ALL
  USING (author_id = auth.uid());

CREATE POLICY "oiticles_admin_all"
  ON cre_oiticles FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TRIGGER oiticles_updated_at
  BEFORE UPDATE ON cre_oiticles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3. view count increment function ────────────────────────────
CREATE OR REPLACE FUNCTION increment_oiticle_views(oiticle_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE cre_oiticles SET views = views + 1 WHERE id = oiticle_id;
END;
$$ LANGUAGE plpgsql;
