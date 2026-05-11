-- ============================================================
-- RLS Verification Script
-- Run this after applying 00001_mvp_schema.sql to verify policies
-- Source: docs/12-security-rls-storage.md section 17
-- ============================================================

-- Verify RLS is enabled on all 12 tables
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles',
    'broker_profiles',
    'building_ssot_lite',
    'building_signal_cards',
    'buyer_intent_lite',
    'owner_readiness_checks',
    'document_objects',
    'gate_requests',
    'expert_note_requests',
    'evidence_files',
    'activity_events',
    'ai_runs'
  )
order by tablename;

-- Expected: all 12 rows with rowsecurity = true

-- Verify policies exist on each table
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'broker_profiles',
    'building_ssot_lite',
    'building_signal_cards',
    'buyer_intent_lite',
    'owner_readiness_checks',
    'document_objects',
    'gate_requests',
    'expert_note_requests',
    'evidence_files',
    'activity_events',
    'ai_runs'
  )
order by tablename, policyname;

-- Count tables with RLS enabled (should be 12)
select count(*) as rls_enabled_count
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles','broker_profiles','building_ssot_lite','building_signal_cards',
    'buyer_intent_lite','owner_readiness_checks','document_objects','gate_requests',
    'expert_note_requests','evidence_files','activity_events','ai_runs'
  )
  and rowsecurity = true;
