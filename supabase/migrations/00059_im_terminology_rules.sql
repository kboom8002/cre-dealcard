-- Phase J: 용어 사전 DB화
-- 구어체 -> CRE 업계 표준 용어 자동 치환 규칙을 DB에서 관리하도록 테이블 설계

CREATE TABLE IF NOT EXISTS im_terminology_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern     TEXT NOT NULL,              -- 정규표현식 또는 리터럴
  is_regex    BOOLEAN DEFAULT TRUE,       -- regex 여부
  replacement TEXT NOT NULL,              -- 치환 문자열 (정적 또는 특수 함수 지정)
  category    TEXT NOT NULL DEFAULT 'general',  -- 면적/비용/임대/거래/법률/신용/건물상태/투자/홍보/법적위험...
  priority    INTEGER DEFAULT 100,        -- 낮을수록 먼저 실행
  is_active   BOOLEAN DEFAULT TRUE,
  hit_count   INTEGER DEFAULT 0,          -- 발동 횟수
  last_hit_at TIMESTAMPTZ,
  created_by  TEXT,                       -- 생성자 ID
  note        TEXT DEFAULT '',            -- 규칙 설명
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_term_rules_active ON im_terminology_rules(is_active, priority);
CREATE INDEX IF NOT EXISTS idx_term_rules_category ON im_terminology_rules(category);
