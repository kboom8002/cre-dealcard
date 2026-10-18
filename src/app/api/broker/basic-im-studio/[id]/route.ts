import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { studioService } from '@/domain/building/pptx-studio/studio-service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(process.env.NODE_ENV === 'test' && req.headers.get('x-test-bypass'))) {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
  }

  const { id } = await params;
  try {
    let project;
    try { project = await studioService.getProject(id); }
    catch { project = await studioService.findProjectByDealId(id); }
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
  if (!(process.env.NODE_ENV === 'test' && req.headers.get('x-test-bypass'))) {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
  }

  const { id } = await params;
  try {
    const body = await req.json();
    const {
      action = 'override',
      slideId,
      slideIndex,
      layoutType,
      overrides,
      orderedSlideIds,
      hidden,
      themePatch,
      expectedLockVersion,
    } = body;

    let project;
    try { project = await studioService.getProject(id); }
    catch { project = await studioService.findProjectByDealId(id); }
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }

    let updated = project;

    if (action === 'reorder') {
      if (!Array.isArray(orderedSlideIds)) {
        return NextResponse.json({ ok: false, error: 'orderedSlideIds array is required' }, { status: 400 });
      }
      updated = await studioService.reorderSlides(project.id, orderedSlideIds, expectedLockVersion);
    } else if (action === 'toggle') {
      if (!slideId) {
        return NextResponse.json({ ok: false, error: 'slideId is required' }, { status: 400 });
      }
      updated = await studioService.toggleSlideVisibility(project.id, slideId, hidden, expectedLockVersion);
    } else if (action === 'layout') {
      if (typeof slideIndex !== 'number' || !layoutType) {
        return NextResponse.json({ ok: false, error: 'slideIndex and layoutType are required' }, { status: 400 });
      }
      updated = await studioService.updateSlideLayout(project.id, slideIndex, layoutType, expectedLockVersion);
    } else if (action === 'theme') {
      if (!themePatch || typeof themePatch !== 'object') {
        return NextResponse.json({ ok: false, error: 'themePatch object is required' }, { status: 400 });
      }
      updated = await studioService.updateProjectTheme(project.id, themePatch, expectedLockVersion);
    } else if (action === 'reset') {
      if (!slideId) {
        return NextResponse.json({ ok: false, error: 'slideId is required' }, { status: 400 });
      }
      updated = await studioService.resetSlideOverrides(project.id, slideId, expectedLockVersion);
    } else {
      if (!slideId || !overrides) {
        return NextResponse.json(
          { ok: false, error: 'slideId and overrides are required' },
          { status: 400 }
        );
      }
      updated = await studioService.patchSlideOverrides(
        project.id, slideId, overrides, expectedLockVersion
      );
    }

    return NextResponse.json({ ok: true, project: updated });
  } catch (err: any) {
    const isStale = err.message?.includes('STALE_LOCK_ERROR');
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: isStale ? 409 : 500 }
    );
  }
}
