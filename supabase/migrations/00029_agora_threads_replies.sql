-- Migration: 00029_agora_threads_replies.sql
-- CRE Agora — 질문 쓰레드 + 댓글 테이블
-- 작성자는 페르소나 이름으로 표시 (is_seed=true 시 자동 생성)

-- ── agora_threads ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agora_threads (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 분류
  category              text        NOT NULL
    CHECK (category IN ('sale','lease','invest','legal','market','manage','finance')),
  region                text        -- gbd, ybd, cbd, seongsu, pangyo, mapo, jongno, hongdae
    CHECK (region IN ('gbd','ybd','cbd','seongsu','pangyo','mapo','jongno','hongdae') OR region IS NULL),

  -- 질문 콘텐츠
  title                 text        NOT NULL,
  content               text        NOT NULL,

  -- 작성자 (시드: 페르소나 이름, 실사용자: 닉네임/이름)
  author_id             uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  author_name           text        NOT NULL DEFAULT '익명',

  -- QIS 시드 여부
  is_seed               boolean     NOT NULL DEFAULT false,

  -- 메타
  tags                  text[]      NOT NULL DEFAULT '{}',
  views                 int         NOT NULL DEFAULT 0,
  reply_count           int         NOT NULL DEFAULT 0,
  is_hot                boolean     NOT NULL DEFAULT false,

  -- AI 큐레이션 답변 (면책 조항 포함)
  ai_answer             text,

  -- 딜카드 연결
  matched_deal_ids      uuid[]      NOT NULL DEFAULT '{}',
  market_report_region  text,
  related_thread_ids    uuid[]      NOT NULL DEFAULT '{}',

  -- SEO
  seo_title             text,
  seo_description       text,

  -- 상태
  status                text        NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'draft', 'deleted')),

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_agora_threads_category
  ON agora_threads (category, status, is_hot, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agora_threads_region
  ON agora_threads (region, status, created_at DESC)
  WHERE region IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agora_threads_title_unique
  ON agora_threads (title)
  WHERE is_seed = true;

-- updated_at 트리거
CREATE OR REPLACE FUNCTION update_agora_threads_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agora_threads_updated_at ON agora_threads;
CREATE TRIGGER trg_agora_threads_updated_at
  BEFORE UPDATE ON agora_threads
  FOR EACH ROW EXECUTE FUNCTION update_agora_threads_updated_at();

-- ── agora_replies ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agora_replies (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid        NOT NULL REFERENCES agora_threads(id) ON DELETE CASCADE,

  author_id   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  author_name text        NOT NULL DEFAULT '익명',
  author_role text        NOT NULL DEFAULT 'user'
    CHECK (author_role IN ('user', 'broker', 'expert', 'ai')),

  content     text        NOT NULL,
  is_ai       boolean     NOT NULL DEFAULT false,
  upvotes     int         NOT NULL DEFAULT 0,

  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agora_replies_thread_id
  ON agora_replies (thread_id, created_at ASC);

-- ── RLS 정책 ──────────────────────────────────────────────────────
ALTER TABLE agora_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE agora_replies  ENABLE ROW LEVEL SECURITY;

-- 공개 읽기 (published 상태만)
CREATE POLICY "agora_threads_public_read"
  ON agora_threads FOR SELECT
  USING (status = 'published');

-- 인증 사용자만 질문 작성
CREATE POLICY "agora_threads_auth_insert"
  ON agora_threads FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 본인 질문 수정
CREATE POLICY "agora_threads_author_update"
  ON agora_threads FOR UPDATE
  USING (auth.uid() = author_id);

-- 서비스 롤은 전체 접근 (시드 생성 등)
CREATE POLICY "agora_threads_service_all"
  ON agora_threads FOR ALL
  USING (auth.role() = 'service_role');

-- 댓글 공개 읽기
CREATE POLICY "agora_replies_public_read"
  ON agora_replies FOR SELECT
  USING (true);

-- 인증 사용자만 댓글 작성
CREATE POLICY "agora_replies_auth_insert"
  ON agora_replies FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 서비스 롤 전체 접근
CREATE POLICY "agora_replies_service_all"
  ON agora_replies FOR ALL
  USING (auth.role() = 'service_role');

-- ── reply_count 자동 업데이트 ─────────────────────────────────────
CREATE OR REPLACE FUNCTION update_agora_reply_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE agora_threads
    SET reply_count = reply_count + 1,
        is_hot      = CASE WHEN (reply_count + 1) >= 5 THEN true ELSE is_hot END
    WHERE id = NEW.thread_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE agora_threads
    SET reply_count = GREATEST(reply_count - 1, 0)
    WHERE id = OLD.thread_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_agora_reply_count ON agora_replies;
CREATE TRIGGER trg_agora_reply_count
  AFTER INSERT OR DELETE ON agora_replies
  FOR EACH ROW EXECUTE FUNCTION update_agora_reply_count();
