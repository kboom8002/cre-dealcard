-- 20260903000003_approval_release_ledger.sql
-- CIM-0204 / PR-M2-04: 승인 및 릴리스 감사 원장 (approval_events, release_records)

CREATE TABLE IF NOT EXISTS approval_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_run_id UUID NOT NULL REFERENCES artifact_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('machine_check', 'human_approve', 'human_reject', 'invalidate', 'withdraw')),
  actor_id UUID,
  actor_role TEXT,
  target_hash TEXT NOT NULL,
  harness_report_id UUID REFERENCES harness_reports(id),
  predecessor_approval_id UUID REFERENCES approval_events(id),
  reason TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_events_artifact ON approval_events(artifact_run_id);
CREATE INDEX IF NOT EXISTS idx_approval_events_target_hash ON approval_events(target_hash);

CREATE TABLE IF NOT EXISTS release_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_run_id UUID NOT NULL REFERENCES artifact_runs(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('dealcard', 'mobile', 'pptx')),
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'MACHINE_CHECKED', 'HUMAN_APPROVED', 'PUBLISHED', 'STALE', 'WITHDRAWN', 'SUPERSEDED')),
  public_url TEXT,
  artifact_file_hash TEXT,
  approved_approval_id UUID REFERENCES approval_events(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_release_records_artifact ON release_records(artifact_run_id);
CREATE INDEX IF NOT EXISTS idx_release_records_status ON release_records(status);
CREATE INDEX IF NOT EXISTS idx_release_records_channel ON release_records(channel);
