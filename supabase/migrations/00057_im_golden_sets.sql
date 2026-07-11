-- Phase A: Mobile IM Golden Set 테이블
-- golden-im-manager.ts의 markAsGoldenIM/buildIMFewShotBlock이 참조하는 테이블

CREATE TABLE IF NOT EXISTS im_golden_sets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id TEXT NOT NULL,
  building_id TEXT NOT NULL,
  section_type TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT '',
  price_band TEXT NOT NULL DEFAULT '',
  markdown TEXT NOT NULL,
  judge_score NUMERIC(3,1) DEFAULT 4.0,
  was_edited BOOLEAN DEFAULT FALSE,
  approved_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, section_type)
);

-- 동적 Few-shot 검색용 인덱스
CREATE INDEX idx_im_golden_sets_lookup
  ON im_golden_sets(asset_type, section_type, judge_score DESC);

-- RLS: 서비스 키만 접근
ALTER TABLE im_golden_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_only_im_golden_sets"
  ON im_golden_sets
  FOR ALL
  USING (auth.role() = 'service_role');
