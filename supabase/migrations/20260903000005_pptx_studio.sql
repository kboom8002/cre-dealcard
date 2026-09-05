-- 20260903000005_pptx_studio.sql
-- PPTX IM Studio: Projects & Slides

CREATE TABLE IF NOT EXISTS pptx_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL,
  package_id UUID NOT NULL,
  version INT NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  theme_id TEXT NOT NULL DEFAULT 'corporate_navy',
  target_audience TEXT NOT NULL DEFAULT 'investor',
  lock_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pptx_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pptx_projects(id) ON DELETE CASCADE,
  slide_index INT NOT NULL,
  layout_type TEXT NOT NULL,
  content_unit_ids TEXT[] NOT NULL DEFAULT '{}',
  slide_overrides JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, slide_index)
);

CREATE INDEX IF NOT EXISTS idx_pptx_projects_deal ON pptx_projects(deal_id);
CREATE INDEX IF NOT EXISTS idx_pptx_slides_proj ON pptx_slides(project_id);
