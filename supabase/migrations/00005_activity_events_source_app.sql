-- ============================================================
-- Migration 00004: Extend activity_events source_app
-- Adds 'js-space-ai-page' to allowed source_app values
-- ============================================================

-- Drop the old constraint
ALTER TABLE activity_events
  DROP CONSTRAINT IF EXISTS activity_events_source_app_check;

-- Add the new constraint with all 3 systems
ALTER TABLE activity_events
  ADD CONSTRAINT activity_events_source_app_check
  CHECK (source_app IS NULL OR source_app IN (
    'js-building-ssot-mvp',
    'js-full-im-studio',
    'js-space-ai-page'
  ));
