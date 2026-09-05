import { describe, it, expect } from 'vitest';
import { CanaryController } from '@/platform/im-pipeline/canary-controller';
import { IncidentRollbackHarness } from '@/platform/im-pipeline/rollback-harness';
import { InMemoryPipelineRepository } from '@/platform/im-pipeline/repository';
import { ApprovalLedgerService } from '@/domain/building/im-core/approval/ledger-service';

describe('Canary Promotion & Emergency Rollback Drill (PR-B5-02 / Negative-Pair Obligation)', () => {
  it('Positive Pair: Validated canary promotion can be instantaneously rolled back to 0%', () => {
    const canary = new CanaryController();

    // 1. Promote to 10%
    const promo = canary.promote(10, {
      exitGatePass: true,
      noOpenP0P1: true,
      rollbackVerified: true,
      observabilityReady: true,
    });
    expect(promo.currentPercentage).toBe(10);

    // 2. Simulate SEV-1 incident rollback
    const rollback = canary.emergencyRollback('SEV-1 모의 훈련: 비정상 해시 감지');
    expect(rollback.currentPercentage).toBe(0);
    expect(rollback.actionTaken).toContain('Trafffic dialed down from 10% to 0%');
  });

  it('Negative Pair: Canary promotion attempt with open P0 defects is strictly blocked', () => {
    const canary = new CanaryController();

    expect(() =>
      canary.promote(10, {
        exitGatePass: true,
        noOpenP0P1: false, // Open defect!
        rollbackVerified: true,
        observabilityReady: true,
      })
    ).toThrowError(/CANARY_PROMOTION_BLOCKED/);
  });
});
