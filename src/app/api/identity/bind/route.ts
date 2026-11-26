import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getClientIp } from '@/lib/magazine/public-guard';
import { createModuleLogger } from '@/lib/logger';
import { bindViewerHistory } from '@/domain/identity/bind';
import {
  bindRecipientToParty,
  IdentityForbiddenError,
} from '@/domain/identity/party-service';

const log = createModuleLogger('identity-bind-route');

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const ip = getClientIp(req) ?? guard.user?.id ?? 'anonymous';
  const allowed = await checkRateLimit(ip, 'identity_bind_post', 30, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }

  try {
    const body = await req.json();
    const { type, viewerId, partyId, recipientId } = body;
    const scope = { ownerBrokerId: guard.user!.id, isAdmin: guard.role === 'admin' };

    // 익명 Viewer 단계에서 발생한 슬라이더 이벤트를 Party에 소급 바인딩
    if (type === 'viewer') {
      if (!viewerId || !partyId) {
        return NextResponse.json({ error: 'Missing viewerId or partyId' }, { status: 400 });
      }
      const result = await bindViewerHistory(viewerId, partyId, scope);
      return NextResponse.json(result);
    }

    // Recipient를 Party에 확정적으로 결합
    if (type === 'recipient') {
      if (!recipientId || !partyId) {
        return NextResponse.json({ error: 'Missing recipientId or partyId' }, { status: 400 });
      }
      await bindRecipientToParty(recipientId, partyId, scope);
      return NextResponse.json({ bound: true });
    }

    return NextResponse.json(
      { error: 'Invalid type parameter. Expected "viewer" or "recipient"' },
      { status: 400 },
    );
  } catch (error: unknown) {
    if (error instanceof IdentityForbiddenError) {
      return NextResponse.json({ ok: false, error: '권한이 없습니다.' }, { status: 403 });
    }
    log.error('[POST /api/identity/bind] Error:', error);
    return NextResponse.json(
      { ok: false, error: '바인딩 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
