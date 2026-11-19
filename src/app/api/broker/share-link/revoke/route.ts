/**
 * POST /api/broker/share-link/revoke — 공유 링크 폐기
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { revokeShareLink } from '@/domain/distribution/share-link-service';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('broker-share-link-revoke-route');

const RevokeShareLinkSchema = z.object({
  token: z.string().min(1, 'token is required'),
  brokerId: z.string().min(1, 'brokerId is required'),
});

export async function POST(req: NextRequest) {
  // Auth guard — 미인증 요청 차단
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  const callerId = auth.user!.id;
  const isAdmin = auth.role === 'admin' || auth.profile?.role === 'admin';

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

    if (!isAdmin && brokerId !== callerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createServiceClient();
    const { data: linkRow, error: linkErr } = await supabase
      .from('share_link')
      .select('token, broker_id')
      .eq('token', token)
      .maybeSingle();

    if (linkErr) {
      log.error('share_link ownership check failed', { message: linkErr.message });
      return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
    }

    if (!linkRow) {
      return NextResponse.json({ error: '공유 링크를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (!isAdmin && String(linkRow.broker_id) !== callerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const targetBrokerId = isAdmin ? String(linkRow.broker_id || brokerId) : callerId;
    const success = await revokeShareLink(token, targetBrokerId);

    if (!success) {
      return NextResponse.json({ error: 'Failed to revoke' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error('POST /api/broker/share-link/revoke failed', {
      message: err instanceof Error ? err.message : 'unknown_error',
    });
    return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
  }
}
