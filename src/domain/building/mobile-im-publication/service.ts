import { createMobileIMPackage } from './builder';
import type { MobileIMPackage, MobileIMLevel } from './types';
import type { CorePackage } from '../common-pipeline/core-assembler';
import { HarnessEvaluator, type GateReport } from '@/assurance/im-harness/evaluator';
import { registerMobileIMProfiles } from '@/assurance/im-harness/profiles/mobile-profile';
import { ApprovalLedgerService, type ReleaseRecord } from '../im-core/approval/ledger-service';
import type { PipelineRepository } from '@/platform/im-pipeline/repository';

export interface MobileIMPublishResult {
  package: MobileIMPackage;
  report: GateReport;
  release: ReleaseRecord;
}

export class MobileIMPublicationService {
  private evaluator: HarnessEvaluator;
  private ledger: ApprovalLedgerService;
  private repository: PipelineRepository;

  constructor(repository: PipelineRepository, ledger?: ApprovalLedgerService) {
    this.repository = repository;
    this.ledger = ledger ?? new ApprovalLedgerService();
    this.evaluator = new HarnessEvaluator('2026-08-31');
    registerMobileIMProfiles(this.evaluator);
  }

  async publishMobileIM(
    corePackage: CorePackage,
    level: MobileIMLevel,
    claims: any[],
    brokerId: string
  ): Promise<MobileIMPublishResult> {
    const profile = level === 'L1.5' ? 'P-MOBILE-L15' : 'P-MOBILE-L1';

    // 1. Create deal run & artifact run
    const idempotencyKey = `mobile-im:${corePackage.dealId}:${level}:${corePackage.packageHash.slice(0, 16)}`;
    const dealRun = await this.repository.createDealRun(corePackage.dealId, 'initial', idempotencyKey);
    const artifactRun = await this.repository.createArtifactRun(dealRun.id, 'mobile');

    // 2. Build Mobile IM Package
    const pkg = createMobileIMPackage(corePackage, level, claims, 'pending');

    // 3. Evaluate Profile Harness
    const report = await this.evaluator.evaluateProfile(profile, artifactRun.id, pkg, pkg.packageHash);

    if (report.blockerCount > 0) {
      throw new Error(`MOBILE_IM_PUBLISH_BLOCKED: 모바일 IM 하네스 검증 차단 (${report.blockerCount}건 차단)`);
    }

    // 4. Record Approval Event
    const approvalEvent = await this.ledger.recordApprovalEvent({
      artifactRunId: artifactRun.id,
      eventType: 'human_approve',
      actorId: brokerId,
      actorRole: 'broker',
      targetHash: pkg.packageHash,
      harnessReportId: report.reportId,
    });

    // 5. Create Release Record and transition to PUBLISHED
    const release = await this.ledger.createReleaseRecord(
      artifactRun.id,
      'mobile',
      `/im-lite/${corePackage.dealId}`
    );
    const publishedRelease = await this.ledger.updateReleaseStatus(
      release.id,
      'PUBLISHED',
      approvalEvent.id
    );

    return {
      package: pkg,
      report,
      release: publishedRelease,
    };
  }

  async withdrawMobileIM(releaseId: string, reason: string): Promise<ReleaseRecord> {
    return this.ledger.updateReleaseStatus(releaseId, 'WITHDRAWN');
  }
}
