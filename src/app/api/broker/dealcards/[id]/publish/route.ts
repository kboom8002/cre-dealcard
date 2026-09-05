import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  const { id: dealcardId } = await params;

  try {
    return NextResponse.json({
      ok: true,
      dealcardId,
      status: 'PUBLISHED',
      publicUrl: `/dc/${dealcardId}`,
      publishedBy: user!.id,
      publishedAt: new Date().toISOString(),
      message: '블라인드 딜카드가 공식 발행되었습니다.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? 'Publish error' },
      { status: 500 }
    );
  }
}
