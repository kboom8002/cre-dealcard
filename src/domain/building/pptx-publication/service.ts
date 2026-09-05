import { generateStructuredPPTXDeck } from './generator';
import type { PPTXDeckSpec } from './types';
import { PPTXRenderManager, type RenderJob } from './render-cache';
import type { CorePackage } from '../common-pipeline/core-assembler';
import { HarnessEvaluator, type GateReport } from '@/assurance/im-harness/evaluator';
import { registerPPTXProfiles } from '@/assurance/im-harness/profiles/pptx-profile';
import { ApprovalLedgerService, type ReleaseRecord } from '../im-core/approval/ledger-service';
import type { PipelineRepository } from '@/platform/im-pipeline/repository';

export interface PPTXPublishResult {
  deck: PPTXDeckSpec;
  renderJob: RenderJob;
  report: GateReport;
  release: ReleaseRecord;
}

export class PPTXPublicationService {
  private evaluator: HarnessEvaluator;
  private ledger: ApprovalLedgerService;
  private renderManager: PPTXRenderManager;
  private repository: PipelineRepository;

  constructor(repository: PipelineRepository, ledger?: ApprovalLedgerService) {
    this.repository = repository;
    this.ledger = ledger ?? new ApprovalLedgerService();
    this.renderManager = new PPTXRenderManager();
    this.evaluator = new HarnessEvaluator('2026-08-31');
    registerPPTXProfiles(this.evaluator);
  }

  async createDraftPreview(
    core: CorePackage
  ): Promise<{ deck: PPTXDeckSpec; renderJob: RenderJob; report: GateReport }> {
    const deck = generateStructuredPPTXDeck(core);
    const renderJob = this.renderManager.createRenderJob(deck.deckId, deck.deckHash, true);
    await this.renderManager.processJob(renderJob.jobId);

    const report = await this.evaluator.evaluateProfile('P-PPTX-PREVIEW', deck.deckId, deck, deck.deckHash);

    return { deck, renderJob, report };
  }

  async publishFinalPPTX(
    core: CorePackage,
    brokerId: string
  ): Promise<PPTXPublishResult> {
    const idempotencyKey = `pptx:${core.dealId}:${core.packageHash.slice(0, 16)}`;
    const dealRun = await this.repository.createDealRun(core.dealId, 'initial', idempotencyKey);
    const artifactRun = await this.repository.createArtifactRun(dealRun.id, 'pptx');

    const deck = generateStructuredPPTXDeck(core);
    const renderJob = this.renderManager.createRenderJob(deck.deckId, deck.deckHash, false);
    const processedJob = await this.renderManager.processJob(renderJob.jobId);

    // Evaluate P-PPTX-FINAL
    const report = await this.evaluator.evaluateProfile('P-PPTX-FINAL', artifactRun.id, deck, deck.deckHash);

    if (report.blockerCount > 0) {
      throw new Error(`PPTX_PUBLISH_BLOCKED: PPTX 최종 발행 하네스 검증 차단 (${report.blockerCount}건 차단)`);
    }

    // Record approval event
    const approvalEvent = await this.ledger.recordApprovalEvent({
      artifactRunId: artifactRun.id,
      eventType: 'human_approve',
      actorId: brokerId,
      actorRole: 'broker',
      targetHash: deck.deckHash,
      harnessReportId: report.reportId,
    });

    // Release record
    const release = await this.ledger.createReleaseRecord(
      artifactRun.id,
      'pptx',
      processedJob.artifactFileUrl
    );
    const publishedRelease = await this.ledger.updateReleaseStatus(
      release.id,
      'PUBLISHED',
      approvalEvent.id
    );

    return {
      deck,
      renderJob: processedJob,
      report,
      release: publishedRelease,
    };
  }
}
