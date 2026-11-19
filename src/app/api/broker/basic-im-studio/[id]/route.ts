import { NextRequest, NextResponse } from 'next/server';
import { requireBroker, type AuthGuardResult } from '@/lib/auth-guard';
import { assertStudioDealOwner } from '@/lib/authz/studio-owner';
import { studioService } from '@/domain/building/pptx-studio/studio-service';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let studioGuard: AuthGuardResult | null = null;
  if (!(process.env.NODE_ENV === 'test' && req.headers.get('x-test-bypass'))) {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    studioGuard = guard;
  }

  const { id } = await params;
  const ownerScopeId =
    studioGuard?.role === 'admin' ? undefined : studioGuard?.user?.id;
  try {
    let project;
    try {
      project = await studioService.getProject(id);
    } catch {
      project = await studioService.findProjectByDealId(id, ownerScopeId);
    }
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }

    // P0-SEC: 프로젝트 소유권 = dealId(매물/원본 문서) 소유권. 소유자·admin 만 접근.
    const denied = await assertStudioDealOwner(studioGuard, project.dealId);
    if (denied) return denied;
    return NextResponse.json({ ok: true, project });
  } catch (err: any) {
    console.error('[basic-im-studio/[id]] GET failed:', err);
    return NextResponse.json(
      { ok: false, error: '스튜디오 프로젝트를 불러오지 못했습니다.' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let studioGuard: AuthGuardResult | null = null;
  if (!(process.env.NODE_ENV === 'test' && req.headers.get('x-test-bypass'))) {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    studioGuard = guard;
  }

  const { id } = await params;
  const ownerId = studioGuard?.user?.id;
  const ownerScopeId = studioGuard?.role === 'admin' ? undefined : ownerId;
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
    } = body;
    const rawExpectedLock = body.expectedLockVersion ?? body.lockVersion;
    const expectedLockVersion =
      typeof rawExpectedLock === 'number' && Number.isFinite(rawExpectedLock)
        ? rawExpectedLock
        : undefined;

    let project;
    try {
      project = await studioService.getProject(id);
    } catch {
      project = await studioService.findProjectByDealId(id, ownerScopeId);
    }
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }

    // P0-SEC: 프로젝트 소유권 = dealId(매물/원본 문서) 소유권. 소유자·admin 만 접근.
    const denied = await assertStudioDealOwner(studioGuard, project.dealId);
    if (denied) return denied;

    let updated = project;

    if (action === 'reorder') {
      if (!Array.isArray(orderedSlideIds)) {
        return NextResponse.json({ ok: false, error: 'orderedSlideIds array is required' }, { status: 400 });
      }
      updated = await studioService.reorderSlides(
        project.id,
        orderedSlideIds,
        expectedLockVersion,
        ownerId
      );
    } else if (action === 'toggle') {
      if (!slideId) {
        return NextResponse.json({ ok: false, error: 'slideId is required' }, { status: 400 });
      }
      updated = await studioService.toggleSlideVisibility(
        project.id,
        slideId,
        hidden,
        expectedLockVersion,
        ownerId
      );
    } else if (action === 'layout') {
      if (typeof slideIndex !== 'number' || !layoutType) {
        return NextResponse.json({ ok: false, error: 'slideIndex and layoutType are required' }, { status: 400 });
      }
      updated = await studioService.updateSlideLayout(
        project.id,
        slideIndex,
        layoutType,
        expectedLockVersion,
        ownerId
      );
    } else if (action === 'theme') {
      if (!themePatch || typeof themePatch !== 'object') {
        return NextResponse.json({ ok: false, error: 'themePatch object is required' }, { status: 400 });
      }
      updated = await studioService.updateProjectTheme(
        project.id,
        themePatch,
        expectedLockVersion,
        ownerId
      );
    } else if (action === 'reset') {
      if (!slideId) {
        return NextResponse.json({ ok: false, error: 'slideId is required' }, { status: 400 });
      }
      updated = await studioService.resetSlideOverrides(
        project.id,
        slideId,
        expectedLockVersion,
        ownerId
      );
    } else {
      if (!slideId || !overrides) {
        return NextResponse.json(
          { ok: false, error: 'slideId and overrides are required' },
          { status: 400 }
        );
      }
      updated = await studioService.patchSlideOverrides(
        project.id,
        slideId,
        overrides,
        expectedLockVersion,
        ownerId
      );
    }

    return NextResponse.json({ ok: true, project: updated });
  } catch (err: any) {
    const isStale = Boolean(err?.message?.includes('STALE_LOCK_ERROR'));
    if (isStale) {
      return NextResponse.json(
        {
          ok: false,
          code: 'STALE_LOCK_ERROR',
          error: 'STALE_LOCK_ERROR: 다른 화면에서 먼저 수정되었습니다. 새로고침 후 다시 시도해 주세요.',
        },
        { status: 409 }
      );
    }
    console.error('[basic-im-studio/[id]] PATCH failed:', err);
    return NextResponse.json(
      { ok: false, error: '슬라이드 변경사항 저장에 실패했습니다.' },
      { status: 500 }
    );
  }
}
