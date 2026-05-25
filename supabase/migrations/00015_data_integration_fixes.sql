-- ============================================================
-- Migration 00015: SSoT ↔ Full IM Integration Fixes
-- Implements Phase 1, Phase 2, Phase 3 database extensions
-- ============================================================

-- 1. G-AUTH-1: Drop and extend profiles.role check constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'public_user', 'broker', 'admin', 'expert', 'owner',
    'pm_manager', 'tenant_prospect', 'js_operator',
    'im_editor', 'reviewer'
  ));

-- 2. G-DOC-2: Ensure required Storage Buckets exist physically in storage.buckets
-- Requires insertion into public schema storage.buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('evidence-private', 'evidence-private', false),
  ('full-im-evidence-private', 'full-im-evidence-private', false),
  ('full-im-export-private', 'full-im-export-private', false),
  ('full-im-export-shared', 'full-im-export-shared', false),
  ('full-im-thumbnails', 'full-im-thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- 3. G-EVT-3: Create Cross-System Funnel View for Analytics
CREATE OR REPLACE VIEW cross_system_funnel_view AS
WITH counts AS (
  SELECT
    count(*) FILTER (WHERE event_type = 'address_submitted') AS address_submitted_count,
    count(*) FILTER (WHERE event_type = 'building_ssot_lite_created') AS ssot_lite_count,
    count(*) FILTER (WHERE event_type = 'building_signal_card_created') AS signal_card_count,
    count(*) FILTER (WHERE event_type = 'blind_teaser_generated') AS teaser_count,
    count(*) FILTER (WHERE event_type = 'full_im_handoff_created') AS handoff_count,
    count(*) FILTER (WHERE event_type = 'handoff_imported') AS imported_count,
    count(*) FILTER (WHERE event_type = 'gate_review_completed') AS gate_review_count,
    count(*) FILTER (WHERE event_type = 'im_exported') AS im_exported_count
  FROM activity_events
)
SELECT
  address_submitted_count,
  ssot_lite_count,
  signal_card_count,
  teaser_count,
  handoff_count,
  imported_count,
  gate_review_count,
  im_exported_count
FROM counts;

-- 4. G-HO-4: Create Trigger to Sync FullIM im_projects status to DealCard deal_pipeline_states stage
CREATE OR REPLACE FUNCTION sync_im_project_to_pipeline()
RETURNS TRIGGER AS $$
DECLARE
  v_stage deal_stage;
  v_building_id uuid;
BEGIN
  -- Map im_projects status to deal_stage
  CASE NEW.status
    WHEN 'intake', 'ssot_building' THEN
      v_stage := 'im_created'::deal_stage;
    WHEN 'gate_review' THEN
      v_stage := 'gate_requested'::deal_stage;
    WHEN 'buyer_ready', 'exported', 'dealroom_published' THEN
      v_stage := 'buyer_meeting'::deal_stage;
    WHEN 'archived', 'blocked' THEN
      v_stage := 'failed'::deal_stage;
    ELSE
      v_stage := NULL;
  END CASE;

  -- Find building_ssot_lite id
  IF NEW.source_building_ssot_lite_id IS NOT NULL THEN
    v_building_id := NEW.source_building_ssot_lite_id::uuid;

    IF v_stage IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM deal_pipeline_states WHERE building_ssot_lite_id = v_building_id) THEN
        UPDATE deal_pipeline_states
        SET stage = v_stage,
            metadata = metadata || jsonb_build_object('im_project_id', NEW.id, 'im_project_status', NEW.status),
            updated_at = now()
        WHERE building_ssot_lite_id = v_building_id;
      ELSE
        INSERT INTO deal_pipeline_states (building_ssot_lite_id, broker_id, stage, metadata, updated_at)
        VALUES (
          v_building_id,
          COALESCE(NEW.project_owner_id, NEW.created_by),
          v_stage,
          jsonb_build_object('im_project_id', NEW.id, 'im_project_status', NEW.status),
          now()
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_im_project_to_pipeline ON im_projects;
CREATE TRIGGER trg_sync_im_project_to_pipeline
  AFTER INSERT OR UPDATE ON im_projects
  FOR EACH ROW
  EXECUTE FUNCTION sync_im_project_to_pipeline();
