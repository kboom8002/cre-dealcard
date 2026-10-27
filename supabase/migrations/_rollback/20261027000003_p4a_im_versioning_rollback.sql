-- ============================================================================
-- 20261027000003_p4a_im_versioning_rollback.sql
-- 목적  : Rollback for 20261027000003_p4a_im_versioning.sql
-- ============================================================================

BEGIN;

-- 1. Drop trigger and functions
DROP TRIGGER IF EXISTS trg_sealed_im_document ON public.document_objects;
DROP FUNCTION IF EXISTS public.check_sealed_im_document();
DROP FUNCTION IF EXISTS public.seal_im_version(UUID);
DROP FUNCTION IF EXISTS public.approve_im_version(UUID, TEXT, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_im_version(UUID, TEXT, TEXT, JSONB, UUID);

-- 2. Drop dependent tables
DROP TABLE IF EXISTS public.im_share_links CASCADE;
DROP TABLE IF EXISTS public.im_studio_states CASCADE;
DROP TABLE IF EXISTS public.im_renditions CASCADE;
DROP TABLE IF EXISTS public.im_approvals CASCADE;
DROP TABLE IF EXISTS public.im_input_snapshots CASCADE;

-- 3. Remove columns from document_objects
ALTER TABLE public.document_objects
  DROP COLUMN IF EXISTS series_id,
  DROP COLUMN IF EXISTS version_no,
  DROP COLUMN IF EXISTS parent_version_id,
  DROP COLUMN IF EXISTS origin,
  DROP COLUMN IF EXISTS generation_job_id,
  DROP COLUMN IF EXISTS input_snapshot_id,
  DROP COLUMN IF EXISTS content_hash,
  DROP COLUMN IF EXISTS doc_hash,
  DROP COLUMN IF EXISTS sealed_at,
  DROP COLUMN IF EXISTS seal_hash,
  DROP COLUMN IF EXISTS superseded_by,
  DROP COLUMN IF EXISTS label;

-- 4. Drop im_series table
DROP TABLE IF EXISTS public.im_series CASCADE;

-- 5. Drop version_id from im_pro_grants if exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='im_pro_grants') THEN
    ALTER TABLE public.im_pro_grants DROP COLUMN IF EXISTS version_id;
  END IF;
END $$;

COMMIT;
