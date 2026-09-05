import { ApprovalLedgerService, type ApprovalEvent, type ReleaseRecord } from '../../im-core/approval/ledger-service';
import type { PptxProject } from '../project/types';

export interface StudioApprovalResult {
  project: PptxProject;
  editorialApproval?: ApprovalEvent;
  fileApproval?: ApprovalEvent;
  release?: ReleaseRecord;
}

export class StudioApprovalService {
  private ledger: ApprovalLedgerService;

  constructor(ledger?: ApprovalLedgerService) {
    this.ledger = ledger ?? new ApprovalLedgerService();
  }

  async approveEditorial(
    project: PptxProject,
    brokerId: string,
    targetHash: string
  ): Promise<ApprovalEvent> {
    if (project.stage !== 'S50_GATE_CHECK' && project.stage !== 'S40_PREVIEW') {
      throw new Error(`PRECONDITION_FAILED: Cannot approve editorial from stage ${project.stage}`);
    }

    const event = await this.ledger.recordApprovalEvent({
      artifactRunId: project.id,
      eventType: 'human_approve',
      actorId: brokerId,
      actorRole: 'broker',
      targetHash,
      reason: '슬라이드 구성 및 문안 편집 승인 (S60)',
    });

    project.stage = 'S60_EDITORIAL_APPROVAL';
    project.editorialApprovedBy = brokerId;
    project.editorialApprovedAt = new Date().toISOString();

    return event;
  }

  async approveFile(
    project: PptxProject,
    fileHash: string,
    fileUrl: string,
    brokerId: string
  ): Promise<{ fileApproval: ApprovalEvent; release: ReleaseRecord }> {
    if (project.stage !== 'S60_EDITORIAL_APPROVAL') {
      throw new Error(
        `PRECONDITION_FAILED: 파일 승인(S70) 전 편집 승인(S60)이 반드시 선행되어야 합니다`
      );
    }

    const fileApproval = await this.ledger.recordApprovalEvent({
      artifactRunId: project.id,
      eventType: 'human_approve',
      actorId: brokerId,
      actorRole: 'broker',
      targetHash: fileHash,
      reason: '최종 렌더링된 PPTX 바이너리 해시 승인 (S70)',
    });

    project.stage = 'S70_FILE_APPROVAL';
    project.fileApprovedBy = brokerId;
    project.fileApprovedAt = new Date().toISOString();
    project.artifactFileHash = fileHash;

    const release = await this.ledger.createReleaseRecord(project.id, 'pptx', fileUrl);
    await this.ledger.updateReleaseStatus(release.id, 'PUBLISHED', fileApproval.id);

    return {
      fileApproval,
      release,
    };
  }
}
