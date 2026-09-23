import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { studioService } from '@/domain/building/pptx-studio/studio-service';
import { createPersistentApprovalLedger } from '@/platform/im-pipeline/supabase-approval-ledger';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let brokerId = 'broker-system';
  if (!(process.env.NODE_ENV === 'test' && req.headers.get('x-test-bypass'))) {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    if (guard.user?.id) brokerId = guard.user.id;
  } else {
    brokerId = req.headers.get('x-broker-id') || 'broker-test';
  }

  const { id } = await params;

  try {
    let project;
    try {
      project = await studioService.getProject(id);
    } catch {
      // Check if id is dealId
      project = await studioService.findProjectByDealId(id);
    }

    if (!project) {
      // If deal-card id was passed, initialize a default project on-demand
      project = await studioService.createProject(
        id,
        `pkg-${Date.now()}`,
        'CRE 투자설명서 (IM)',
        'institutional_dark_gold'
      );
    }

    const ledger = createPersistentApprovalLedger();
    let latestApproval = null;
    let releaseRecord = null;
    try {
      latestApproval = await ledger.getLatestApproval(project.id);
      releaseRecord = await ledger.getReleaseByArtifact(project.id);
    } catch {
      // In-memory fallback
    }

    return NextResponse.json({
      ok: true,
      project,
      stage: project.stage,
      latestApproval,
      releaseRecord,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Project not found' },
      { status: 404 }
    );
  }
}
