-- Add metadata JSONB column and 'published' status to document_objects
-- Required for IM approval workflow

-- 1. Add metadata column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='document_objects' AND column_name='metadata'
  ) THEN
    ALTER TABLE document_objects ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;
END $$;

-- 2. Update status check constraint to include 'published'
ALTER TABLE document_objects
  DROP CONSTRAINT IF EXISTS document_objects_status_check;

ALTER TABLE document_objects
  ADD CONSTRAINT document_objects_status_check
  CHECK (status IN (
    'draft',
    'disclosure_checked',
    'broker_reviewed',
    'approved_internal',
    'shared_external',
    'archived',
    'published',
    'revision_needed'
  ));
