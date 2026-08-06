-- pptx_custom_presets: 중개법인 단위 커스텀 PPTX 프리셋
-- 같은 company_id의 브로커가 공유 (RLS로 제어)
CREATE TABLE IF NOT EXISTS pptx_custom_presets (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- 소유/공유
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id      TEXT,            -- 중개법인 ID (NULL이면 개인 전용)
  
  -- 식별
  preset_name     TEXT NOT NULL,
  preset_desc     TEXT,
  
  -- PptxThemeTokens JSON (전체 토큰 저장)
  tokens          JSONB NOT NULL DEFAULT '{}',
  
  -- 레이아웃 메타 (tokens에도 있지만 쿼리 편의를 위해 별도 컬럼)
  cover_style     TEXT NOT NULL DEFAULT 'institutional_masses'
                    CHECK (cover_style IN ('institutional_masses','split','hero_dark','corporate_card','obsidian_glow')),
  layout_style    TEXT NOT NULL DEFAULT 'classic'
                    CHECK (layout_style IN ('classic','modern','executive','minimal','dramatic')),
  
  -- 브랜딩
  company_name    TEXT,
  company_tagline TEXT,
  logo_url        TEXT,         -- Supabase Storage URL
  
  -- 기반 프리셋 (어떤 내장 프리셋에서 출발했는지)
  base_preset_id  TEXT DEFAULT 'golden_institutional',
  
  -- 공개 설정
  is_company_default  BOOLEAN DEFAULT false,  -- 법인 기본 프리셋
  is_public           BOOLEAN DEFAULT false,  -- 플랫폼 전체 공개 (향후 마켓플레이스용)
  
  -- 사용 통계
  use_count       INTEGER DEFAULT 0,
  
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id, preset_name)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS pptx_custom_presets_company_id_idx ON pptx_custom_presets(company_id);
CREATE INDEX IF NOT EXISTS pptx_custom_presets_user_id_idx ON pptx_custom_presets(user_id);

-- RLS
ALTER TABLE pptx_custom_presets ENABLE ROW LEVEL SECURITY;

-- 내 것 또는 같은 법인 것은 읽기 가능
CREATE POLICY "pptx_preset_read" ON pptx_custom_presets
  FOR SELECT USING (
    user_id = auth.uid()
    OR (
      company_id IS NOT NULL
      AND company_id IN (
        SELECT company_id FROM pptx_custom_presets WHERE user_id = auth.uid() AND company_id IS NOT NULL
      )
    )
    OR is_public = true
  );

-- 내 것만 쓰기 가능
CREATE POLICY "pptx_preset_write" ON pptx_custom_presets
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_pptx_preset_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pptx_custom_presets_updated_at
  BEFORE UPDATE ON pptx_custom_presets
  FOR EACH ROW EXECUTE FUNCTION update_pptx_preset_updated_at();
