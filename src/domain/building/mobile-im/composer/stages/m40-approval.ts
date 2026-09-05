import { ApprovalLedgerService, type ApprovalEvent } from '../../../im-core/approval/ledger-service';
import { computeTargetHash } from '../../../im-core/target-hash';
import type { MobileDraftSection } from './m20-draft-version';

export async function executeM40Approval(
  dealId: string,
  targetLevel: 'L1' | 'L1.5',
  sections: MobileDraftSection[],
  brokerId: string,
  ledger: ApprovalLedgerService
): Promise<{ approvalEvent: ApprovalEvent; targetHash: string }> {
  const targetHash = computeTargetHash({
    body: { dealId, targetLevel, sections },
    releaseTier: targetLevel === 'L1.5' ? 'decision_im' : 'fact_om',
    policyVersion: '2026-08-31',
  });

  const approvalEvent = await ledger.recordApprovalEvent({
    artifactRunId: dealId,
    targetHash,
    actorId: brokerId,
    actorRole: 'broker',
    eventType: 'human_approve',
  });

  return {
    approvalEvent,
    targetHash,
  };
}
