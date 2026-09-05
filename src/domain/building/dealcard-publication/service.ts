import { parseMemoToObservations } from '../memo-intake/parser';
import { generateDealcardPackage, type DealcardPackage } from './banding-engine';
import { renderDealcardHtml, type RenderedDealcardHtml } from './assembler';
import { HarnessEvaluator, type GateReport } from '@/assurance/im-harness/evaluator';
import { registerDealcardBlindProfile } from '@/assurance/im-harness/profiles/dealcard-profile';
import { ApprovalLedgerService, type ReleaseRecord } from '../im-core/approval/ledger-service';
import type { PipelineRepository } from '@/platform/im-pipeline/repository';

export interface DealcardPublishResult {
  package: DealcardPackage;
  rendered: RenderedDealcardHtml;
  report: GateReport;
  release: ReleaseRecord;
}

export class DealcardPublicationService {
  private evaluator: HarnessEvaluator;
  private ledger: ApprovalLedgerService;
  private repository: PipelineRepository;

  constructor(repository: PipelineRepository, ledger?: ApprovalLedgerService) {
    this.repository = repository;
    this.ledger = ledger ?? new ApprovalLedgerService();
    this.evaluator = new HarnessEvaluator('2026-08-31');
    registerDealcardBlindProfile(this.evaluator);
  }

  async publishFromMemo(
    dealId: string,
    rawMemoText: string,
    brokerId: string
  ): Promise<DealcardPublishResult> {
    // 1. Create deal and artifact runs
    const idempotencyKey = `dealcard:${dealId}:${rawMemoText.length}`;
    const dealRun = await this.repository.createDealRun(dealId, 'initial', idempotencyKey);
    const artifactRun = await this.repository.createArtifactRun(dealRun.id, 'dealcard');

    // 2. Parse memo
    const observationSet = parseMemoToObservations(rawMemoText);

    // 3. Band package
    const pkg = generateDealcardPackage(observationSet);

    // 4. Evaluate harness profile
    const report = await this.evaluator.evaluateProfile('P-DEALCARD-BLIND', artifactRun.id, pkg, pkg.packageHash);

    if (report.blockerCount > 0) {
      throw new Error(
        `DEALCARD_PUBLISH_BLOCKED: 블라인드 하네스 검사 미통과 (${report.blockerCount}건 차단)`
      );
    }

    // 5. Record approval event bound to packageHash
    const approvalEvent = await this.ledger.recordApprovalEvent({
      artifactRunId: artifactRun.id,
      eventType: 'human_approve',
      actorId: brokerId,
      actorRole: 'broker',
      targetHash: pkg.packageHash,
      harnessReportId: report.reportId,
    });

    // 6. Create release record and transition to PUBLISHED
    const release = await this.ledger.createReleaseRecord(
      artifactRun.id,
      'dealcard',
      `/dealcard/${dealId}`
    );
    const publishedRelease = await this.ledger.updateReleaseStatus(
      release.id,
      'PUBLISHED',
      approvalEvent.id
    );

    const rendered = renderDealcardHtml(pkg);

    return {
      package: pkg,
      rendered,
      report,
      release: publishedRelease,
    };
  }
}
