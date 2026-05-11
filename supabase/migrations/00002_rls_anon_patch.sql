-- ============================================================
-- JS Building SSoT MVP v0.1 — Patch Migration 002
-- Fix: gate_requests anonymous insert + activity_events anon policy
-- Source: docs/12-security-rls-storage.md, docs/11-gate-disclosure-policy.md
-- ============================================================

-- gate_requests: allow anonymous (anon role) insert
-- MVP allows unauthenticated Gate G1/G2 requests per docs/11 section 4.1

-- Drop the old authenticated-only insert policy
drop policy if exists "gate_requests_insert_own" on gate_requests;

-- Allow anyone (anon + authenticated) to insert gate requests
-- requester_id can be null for anonymous requests
create policy "gate_requests_insert_anon"
  on gate_requests for insert
  to anon, authenticated
  with check (
    -- Anonymous: requester_id must be null
    -- Authenticated: requester_id must match uid or be null
    requester_id is null
    or requester_id = auth.uid()
  );

-- Allow anon to read gate requests they created (by session — limited in MVP)
-- For now, allow anon to select all submitted (read-only preview)
-- Admin service role bypasses RLS entirely
create policy "gate_requests_anon_select_submitted"
  on gate_requests for select
  to anon
  using (status = 'submitted');

-- activity_events: allow anon insert (events from public flows)
-- Current policy requires authenticated — fix to allow anon
drop policy if exists "activity_events_insert_system" on activity_events;

create policy "activity_events_insert_anon"
  on activity_events for insert
  to anon, authenticated
  with check (true);

-- building_ssot_lite: allow anon insert for public radar flow
-- Drop authenticated-only insert if exists
drop policy if exists "buildings_insert_own" on building_ssot_lite;

create policy "buildings_insert_own_or_anon"
  on building_ssot_lite for insert
  to anon, authenticated
  with check (
    owner_id is null
    or owner_id = auth.uid()
  );

-- owner_readiness_checks: allow anon insert (public checklist flow)
drop policy if exists "readiness_insert_own" on owner_readiness_checks;

create policy "readiness_insert_own_or_anon"
  on owner_readiness_checks for insert
  to anon, authenticated
  with check (
    owner_id is null
    or owner_id = auth.uid()
  );

-- expert_note_requests: allow anon insert (lead capture)
drop policy if exists "expert_notes_insert_own" on expert_note_requests;

create policy "expert_notes_insert_anon"
  on expert_note_requests for insert
  to anon, authenticated
  with check (
    user_id is null
    or user_id = auth.uid()
  );
