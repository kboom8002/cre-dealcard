import { ApprovalLedgerService, type ReleaseRecord } from '../../../im-core/approval/ledger-service';

export async function executeM50Distribution(
  dealId: string,
  approvalEventId: string,
  targetHash: string,
  ledger: ApprovalLedgerService
): Promise<ReleaseRecord> {
  const publicPath = `/im-lite/${dealId}`;

  const release = await ledger.createReleaseRecord(
    dealId,
    'mobile',
    publicPath
  );

  return await ledger.updateReleaseStatus(release.id, 'PUBLISHED', approvalEventId);
}
