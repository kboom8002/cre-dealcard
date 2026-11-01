-- =============================================================================
-- Migration: 20261101000001_optimize_disk_io_indexes.sql
-- Purpose: Reduce Supabase Disk IO consumption by adding composite indexes for
--          the hottest access patterns on document_objects, building_ssot_lite,
--          and activity_events.
-- =============================================================================

-- 1. document_objects: lookup latest documents by (building_id, document_type, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_document_objects_bld_type_created
  ON public.document_objects (building_id, document_type, created_at DESC)
  WHERE status <> 'archived';

-- 2. document_objects: lookup broker's active documents by (owner_id, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_document_objects_owner_created
  ON public.document_objects (owner_id, created_at DESC)
  WHERE status <> 'archived';

-- 3. building_ssot_lite: lookup broker's active buildings by (owner_id, updated_at DESC)
CREATE INDEX IF NOT EXISTS idx_building_ssot_lite_owner_updated
  ON public.building_ssot_lite (owner_id, updated_at DESC)
  WHERE status <> 'archived';

-- 4. activity_events: lookup recent view events by (event_type, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_activity_events_type_created
  ON public.activity_events (event_type, created_at DESC);
