import { randomUUID } from 'crypto';
import type { PublicationPackage } from '../../im-core/publication/package-builder';
import { executeM00BuildRequest } from './stages/m00-build-request';
import { executeM10ContentPlan } from './stages/m10-content-plan';
import { executeM20DraftVersion, type MobileDraftSection } from './stages/m20-draft-version';
import { executeM30GateReport } from './stages/m30-gate-report';
import { executeM40Approval } from './stages/m40-approval';
import { executeM50Distribution } from './stages/m50-distribution';
import { ApprovalLedgerService, type ReleaseRecord } from '../../im-core/approval/ledger-service';
import type { GateReport } from '@/assurance/im-harness/evaluator';

export interface MobileComposedArtifact {
  packageId: string;
  dealId: string;
  level: 'L1' | 'L1.5';
  sections: MobileDraftSection[];
  report: GateReport;
  targetHash: string;
  release: ReleaseRecord;
  createdAt: string;
}

export class MobileComposer {
  private ledger: ApprovalLedgerService;

  constructor(ledger?: ApprovalLedgerService) {
    this.ledger = ledger ?? new ApprovalLedgerService();
  }

  async compose(
    pkg: PublicationPackage,
    requestedLevel: 'L1' | 'L1.5',
    brokerId: string
  ): Promise<MobileComposedArtifact> {
    // Stage M00: Build Request Validation
    const { targetLevel } = executeM00BuildRequest(pkg, requestedLevel);

    // Stage M10: Content Plan
    const plan = executeM10ContentPlan(targetLevel);

    // Stage M20: Draft Synthesis (Zero numeric recalculation)
    const sections = executeM20DraftVersion(pkg, plan);

    // Stage M30: Quality Gate Check
    const report = await executeM30GateReport(pkg.dealId, targetLevel, sections);

    // Stage M40: Human Broker Approval Binding
    const { approvalEvent, targetHash } = await executeM40Approval(
      pkg.dealId,
      targetLevel,
      sections,
      brokerId,
      this.ledger
    );

    // Stage M50: Distribution / Release
    const release = await executeM50Distribution(
      pkg.dealId,
      approvalEvent.id,
      targetHash,
      this.ledger
    );

    return {
      packageId: randomUUID(),
      dealId: pkg.dealId,
      level: targetLevel,
      sections,
      report,
      targetHash,
      release,
      createdAt: new Date().toISOString(),
    };
  }
}
