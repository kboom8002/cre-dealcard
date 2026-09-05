-- 20260903000002_harness_reports.sql
-- CIM-0203 / PR-M2-03: 공통 검사보고서 (harness_reports) 및 7-상태 평가 원장

CREATE TABLE IF NOT EXISTS harness_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_run_id UUID NOT NULL REFERENCES artifact_runs(id) ON DELETE CASCADE,
  profile TEXT NOT NULL,
  results JSONB NOT NULL,
  blocker_count INT NOT NULL DEFAULT 0,
  all_run BOOLEAN NOT NULL DEFAULT false,
  report_hash TEXT NOT NULL,
  rule_registry_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_harness_reports_artifact ON harness_reports(artifact_run_id);
CREATE INDEX IF NOT EXISTS idx_harness_reports_hash ON harness_reports(report_hash);
