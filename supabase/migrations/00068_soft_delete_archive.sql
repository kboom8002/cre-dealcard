-- Soft delete: add archived_at column
ALTER TABLE building_ssot_lite ADD COLUMN IF NOT EXISTS
  archived_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_building_ssot_lite_archived
  ON building_ssot_lite(archived_at) WHERE archived_at IS NOT NULL;
