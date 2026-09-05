import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { createRegenerationPlan } from '@/platform/im-pipeline/regeneration/planner';
import type { ChangeKind } from '@/platform/im-pipeline/regeneration/invalidation-engine';

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  try {
    const body = await req.json();
    const { dealId, changeKind } = body;

    if (!dealId || !changeKind) {
      return NextResponse.json(
        { error: 'dealId and changeKind are required' },
        { status: 400 }
      );
    }

    const plan = createRegenerationPlan(dealId, changeKind as ChangeKind);

    return NextResponse.json({
      ok: true,
      plan,
      message: '최소 재생성 계획 미리보기가 생성되었습니다.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? 'Invalid request' },
      { status: 400 }
    );
  }
}
