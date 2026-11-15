-- ============================================================
-- Migration 00042: Mobile IM Pipeline Schema Extensions
-- Extracted DDL from 00042 (demo seed rows moved to supabase/seed/00042_mobile_im_pipeline_demo_seed.sql)
-- ============================================================

-- document_type 체크 제약 완화 (mobile_im 추가)
ALTER TABLE document_objects
  DROP CONSTRAINT IF EXISTS document_objects_document_type_check;

ALTER TABLE document_objects
  ADD CONSTRAINT document_objects_document_type_check
  CHECK (document_type IN (
    'deal_curiosity_report',
    'blind_teaser',
    'buyer_fit_memo',
    'owner_prep_memo',
    'missing_data_checklist',
    'gate_request_note',
    'snapshot',
    'mobile_im'
  ));

-- status 체크 제약 완화 (pending_approval, published, revision_needed 추가)
ALTER TABLE document_objects
  DROP CONSTRAINT IF EXISTS document_objects_status_check;

ALTER TABLE document_objects
  ADD CONSTRAINT document_objects_status_check
  CHECK (status IN (
    'draft',
    'generating',
    'generated',
    'pending_approval',
    'published',
    'revision_needed',
    'disclosure_checked',
    'broker_reviewed',
    'approved_internal',
    'shared_external',
    'archived'
  ));

-- broker_id 컬럼 추가 (없는 경우)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_objects' AND column_name = 'broker_id'
  ) THEN
    ALTER TABLE document_objects ADD COLUMN broker_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- slug 컬럼 추가 (없는 경우)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_objects' AND column_name = 'slug'
  ) THEN
    ALTER TABLE document_objects ADD COLUMN slug TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS document_objects_slug_idx ON document_objects(slug) WHERE slug IS NOT NULL;
  END IF;
END $$;

-- content 컬럼 추가 (없는 경우 — body 대신 사용)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_objects' AND column_name = 'content'
  ) THEN
    ALTER TABLE document_objects ADD COLUMN content JSONB DEFAULT '{}';
  END IF;
END $$;
