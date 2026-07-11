-- Phase D: Golden Set 스키마 v2 확장
-- 섹션 별칭, 입력 소스, 태그, 버전, 활용 추적, 라이프사이클

-- 1. 섹션 별칭 (원본 섹션명 보존)
ALTER TABLE im_golden_sets ADD COLUMN IF NOT EXISTS section_alias TEXT DEFAULT '';

-- 2. 입력 소스 추적
ALTER TABLE im_golden_sets ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'auto_approve';

-- 3. 태그 시스템 (검색/분류용)
ALTER TABLE im_golden_sets ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- 4. 버전 관리
ALTER TABLE im_golden_sets ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE im_golden_sets ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES im_golden_sets(id);

-- 5. 활용 추적
ALTER TABLE im_golden_sets ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0;
ALTER TABLE im_golden_sets ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- 6. 비활성화 (soft delete)
ALTER TABLE im_golden_sets ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 7. 원본 파일 참조
ALTER TABLE im_golden_sets ADD COLUMN IF NOT EXISTS source_file_url TEXT;
ALTER TABLE im_golden_sets ADD COLUMN IF NOT EXISTS source_file_name TEXT;

-- 인덱스: 활성 골든셋 검색 최적화
CREATE INDEX IF NOT EXISTS idx_golden_active_lookup
  ON im_golden_sets(asset_type, section_type, is_active, judge_score DESC)
  WHERE is_active = TRUE;

-- 인덱스: 태그 GIN 검색
CREATE INDEX IF NOT EXISTS idx_golden_tags ON im_golden_sets USING GIN(tags);

-- 인덱스: 소스 타입별 필터
CREATE INDEX IF NOT EXISTS idx_golden_source_type ON im_golden_sets(source_type);
