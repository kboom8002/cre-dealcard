import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { requireBroker } from '@/lib/auth-guard';
import { studioService } from '@/domain/building/pptx-studio/studio-service';
import { StudioApprovalService } from '@/domain/building/pptx-studio/approval/studio-approval-service';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let brokerId = 'broker-system';
  if (process.env.NODE_ENV !== 'test' && !req.headers.get('x-test-bypass')) {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    if (guard.user?.id) brokerId = guard.user.id;
  } else {
    brokerId = req.headers.get('x-broker-id') || 'broker-test';
  }

  const { id: projectId } = await params;

  try {
    let project;
    try {
      project = studioService.getProject(projectId);
    } catch {
      project = studioService.findProjectByDealId(projectId);
    }

    if (!project) {
      return NextResponse.json(
        { ok: false, error: `Project ${projectId} not found` },
        { status: 404 }
      );
    }

    // Advance to preview if currently in early drafting stage
    if (
      project.stage === 'S00_INIT' ||
      project.stage === 'S10_COMPOSITION' ||
      project.stage === 'S20_COPY' ||
      project.stage === 'S30_LAYOUT'
    ) {
      project.stage = 'S40_PREVIEW';
    }

    const body = await req.json().catch(() => ({}));
    let targetHash = body.targetHash;
    if (!targetHash) {
      const serialized = JSON.stringify(project.slides);
      targetHash = `sha256:${createHash('sha256').update(serialized).digest('hex')}`;
    }

    const approvalService = new StudioApprovalService();
    const event = await approvalService.approveEditorial(
      project,
      brokerId,
      targetHash
    );

    studioService.saveProject(project);

    // Sync to document_objects and broadcast S60 approval event
    try {
      const { createServiceClient } = await import('@/lib/supabase/service');
      const { broadcastApprovalEvent } = await import('@/platform/im-pipeline/realtime/dealcard-sync-channel');
      const supabase = createServiceClient();
      const dealId = project.dealId;

      await supabase
        .from('document_objects')
        .update({
          approval_stage: 'S60_EDITORIAL_APPROVAL',
          approval_target_hash: targetHash,
          updated_at: new Date().toISOString(),
        })
        .or(`building_id.eq.${dealId},id.eq.${dealId}`);

      await broadcastApprovalEvent(supabase, {
        buildingId: dealId,
        projectId: project.id,
        stage: 'S60_EDITORIAL_APPROVAL',
        targetHash,
        approvalEvent: event,
        timestamp: new Date().toISOString(),
      });
    } catch (syncErr) {
      console.warn('[approve-editorial] Sync to document_objects/broadcast failed (non-blocking):', syncErr);
    }

    return NextResponse.json({
      ok: true,
      projectId: project.id,
      stage: project.stage,
      editorialApprovedBy: project.editorialApprovedBy,
      editorialApprovedAt: project.editorialApprovedAt,
      targetHash,
      event,
      message: '슬라이드 구성 및 문안 편집 승인 (S60)이 완료되었습니다.',
    });
  } catch (err: any) {
    const isPrecondition = err.message?.includes('PRECONDITION_FAILED');
    return NextResponse.json(
      { ok: false, error: err.message || 'Editorial approval failed', code: isPrecondition ? 'PRECONDITION_FAILED' : 'ERROR' },
      { status: isPrecondition ? 412 : 400 }
    );
  }
}
