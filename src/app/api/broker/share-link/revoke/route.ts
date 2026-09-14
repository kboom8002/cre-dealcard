/**
 * POST /api/broker/share-link/revoke — 공유 링크 폐기
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { revokeShareLink } from '@/domain/distribution/share-link-service';
import { requireBroker } from '@/lib/auth-guard';

const RevokeShareLinkSchema = z.object({
  token: z.string().min(1, 'token is required'),
  brokerId: z.string().min(1, 'brokerId is required'),
});

export async function POST(req: NextRequest) {
  // Auth guard — 미인증 요청 차단
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const parsed = RevokeShareLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid revoke request', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { token, brokerId } = parsed.data;

    const success = await revokeShareLink(token, brokerId);

    if (!success) {
      return NextResponse.json({ error: 'Failed to revoke' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
