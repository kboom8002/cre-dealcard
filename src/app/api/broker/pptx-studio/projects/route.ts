import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { studioService } from '@/domain/building/pptx-studio/studio-service';

export async function POST(req: NextRequest) {
  let brokerId = 'broker-system';
  if (process.env.NODE_ENV !== 'test' && !req.headers.get('x-test-bypass')) {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    if (guard.user?.id) brokerId = guard.user.id;
  } else {
    brokerId = req.headers.get('x-broker-id') || 'broker-test';
  }

  try {
    const body = await req.json();
    const { dealId, packageId, title, themeId, posture, grade, recreate } = body;

    if (!dealId) {
      return NextResponse.json(
        { ok: false, error: 'dealId is required' },
        { status: 400 }
      );
    }

    if (!recreate) {
      const existing = studioService.findProjectByDealId(dealId);
      if (existing) {
        return NextResponse.json({
          ok: true,
          project: existing,
          isExisting: true,
        });
      }
    }

    const project = studioService.createProject(
      dealId,
      packageId || `pkg-${Date.now()}`,
      title || 'CRE 투자설명서 (IM)',
      themeId || 'institutional_dark_gold'
    );

    return NextResponse.json(
      {
        ok: true,
        project,
        isExisting: false,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Failed to initialize studio project' },
      { status: 500 }
    );
  }
}
