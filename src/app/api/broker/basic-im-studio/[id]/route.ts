import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { studioService } from '@/domain/building/pptx-studio/studio-service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    let project;
    try { project = studioService.getProject(id); }
    catch { project = studioService.findProjectByDealId(id); }
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, project });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let brokerId = 'broker-system';
  if (!(process.env.NODE_ENV === 'test' && req.headers.get('x-test-bypass'))) {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    if (guard.user?.id) brokerId = guard.user.id;
  }

  const { id } = await params;
  try {
    const body = await req.json();
    const { slideId, overrides, expectedLockVersion } = body;

    if (!slideId || !overrides) {
      return NextResponse.json(
        { ok: false, error: 'slideId and overrides are required' },
        { status: 400 }
      );
    }

    let project;
    try { project = studioService.getProject(id); }
    catch { project = studioService.findProjectByDealId(id); }
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }

    const updated = studioService.patchSlideOverrides(
      project.id, slideId, overrides, expectedLockVersion
    );
    return NextResponse.json({ ok: true, project: updated });
  } catch (err: any) {
    const isStale = err.message?.includes('STALE_LOCK_ERROR');
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: isStale ? 409 : 500 }
    );
  }
}
