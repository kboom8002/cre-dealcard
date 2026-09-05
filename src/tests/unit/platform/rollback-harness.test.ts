import { describe, it, expect } from 'vitest';
import { InMemoryPipelineRepository } from '@/platform/im-pipeline/repository';
import { ApprovalLedgerService } from '@/domain/building/im-core/approval/ledger-service';
import { IncidentRollbackHarness } from '@/platform/im-pipeline/rollback-harness';

describe('Incident Rollback Harness (CIM-0703 / PR-M7-03)', () => {
  it('should immediately withdraw release on SEV-1 incident', async () => {
    const repository = new InMemoryPipelineRepository();
    const ledger = new ApprovalLedgerService();
    const rollbackHarness = new IncidentRollbackHarness(repository, ledger);

    const release = await ledger.createReleaseRecord('art-001', 'mobile', '/im-lite/deal-01');
    await ledger.updateReleaseStatus(release.id, 'PUBLISHED');

    const response = await rollbackHarness.handleIncident({
      severity: 'SEV-1',
      dealId: 'deal-01',
      releaseId: release.id,
      errorMessage: 'PII Leakage Detected',
      triggeredAt: new Date().toISOString(),
    });

    expect(response.rollbackSucceeded).toBe(true);
    const updatedRelease = await ledger.getReleaseRecord(release.id);
    expect(updatedRelease?.status).toBe('WITHDRAWN');
  });

  it('should degrade release to STALE on SEV-2 incident for re-review', async () => {
    const repository = new InMemoryPipelineRepository();
    const ledger = new ApprovalLedgerService();
    const rollbackHarness = new IncidentRollbackHarness(repository, ledger);

    const release = await ledger.createReleaseRecord('art-002', 'pptx', '/storage/pptx/deal-02.pptx');
    await ledger.updateReleaseStatus(release.id, 'PUBLISHED');

    const response = await rollbackHarness.handleIncident({
      severity: 'SEV-2',
      dealId: 'deal-02',
      releaseId: release.id,
      errorMessage: 'Rentroll Discrepancy > 1%',
      triggeredAt: new Date().toISOString(),
    });

    expect(response.rollbackSucceeded).toBe(true);
    const updatedRelease = await ledger.getReleaseRecord(release.id);
    expect(updatedRelease?.status).toBe('STALE');
  });
});
