import { describe, it, expect } from 'vitest';
import { PptxStudioService } from '@/domain/building/pptx-studio/project/studio-service';
import { StudioApprovalService } from '@/domain/building/pptx-studio/approval/studio-approval-service';

describe('PPTX Studio 2-Stage Approval E2E Flow (PR-B3-04 / Negative-Pair Obligation)', () => {
  const studioService = new PptxStudioService();
  const approvalService = new StudioApprovalService();

  it('Positive Pair: Sequential S60 Editorial Approval -> S70 File Approval produces published release', async () => {
    const project = studioService.createProject(
      'deal-approval-e2e',
      'pkg-app-1',
      '테헤란로 프라임 오피스'
    );

    // Advance to preview / gate check
    studioService.advanceStage(project.id, 'S40_PREVIEW', 1);

    // Stage 1: Editorial Approval (S60)
    const editorialApproval = await approvalService.approveEditorial(
      project,
      'broker-lee',
      'sha256:target-hash-deck-content'
    );
    expect(editorialApproval.id).toBeDefined();
    expect(project.stage).toBe('S60_EDITORIAL_APPROVAL');
    expect(project.editorialApprovedBy).toBe('broker-lee');

    // Stage 2: Artifact File Byte Approval (S70)
    const { fileApproval, release } = await approvalService.approveFile(
      project,
      'sha256:binary-pptx-file-hash',
      'https://storage.example.com/pptx/final.pptx',
      'broker-lee'
    );
    expect(fileApproval.id).toBeDefined();
    expect(project.stage).toBe('S70_FILE_APPROVAL');
    expect(release.status).toBe('PUBLISHED');
    expect(release.channel).toBe('pptx');
  });

  it('Negative Pair: Direct file approval without preceding editorial approval is blocked', async () => {
    const project = studioService.createProject(
      'deal-approval-neg',
      'pkg-app-2',
      '종로 소형 근생'
    );

    // Project is at S00_INIT without S60 editorial approval
    await expect(
      approvalService.approveFile(
        project,
        'sha256:fake-hash',
        'https://storage.example.com/fake.pptx',
        'broker-lee'
      )
    ).rejects.toThrowError(/PRECONDITION_FAILED/);
  });
});
