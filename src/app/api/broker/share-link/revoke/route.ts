/**
 * POST /api/broker/share-link/revoke — 공유 링크 폐기
 */
import { NextRequest, NextResponse } from 'next/server';
import { revokeShareLink } from '@/domain/distribution/share-link-service';
import { requireBroker } from '@/lib/auth-guard';

export async function POST(req: NextRequest) {
  // Auth guard — 미인증 요청 차단
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  try {
    const { token, brokerId } = await req.json();

    if (!token || !brokerId) {
      return NextResponse.json({ error: 'token and brokerId required' }, { status: 400 });
    }

    const success = await revokeShareLink(token, brokerId);

    if (!success) {
      return NextResponse.json({ error: 'Failed to revoke' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
