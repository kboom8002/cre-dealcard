import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getClientIp } from '@/lib/magazine/public-guard';
import { createModuleLogger } from '@/lib/logger';
import {
  findOrCreateParty,
  deleteParty,
  IdentityForbiddenError,
} from '@/domain/identity/party-service';

const log = createModuleLogger('identity-party-route');

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const ip = getClientIp(req) ?? guard.user?.id ?? 'anonymous';
  const allowed = await checkRateLimit(ip, 'identity_party_post', 30, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }

  try {
    const body = await req.json();
    const ownerBrokerId = guard.user!.id;
    const isAdmin = guard.role === 'admin';

    if (
      !isAdmin &&
      typeof body?.ownerBrokerId === 'string' &&
      body.ownerBrokerId.trim().length > 0 &&
      body.ownerBrokerId.trim() !== ownerBrokerId
    ) {
      return NextResponse.json(
        { ok: false, error: '타 중개사 소유 당사자 정보에는 접근할 수 없습니다.' },
        { status: 403 },
      );
    }

    const party = await findOrCreateParty(
      {
        ...body,
        ownerBrokerId: isAdmin && body?.ownerBrokerId ? body.ownerBrokerId : ownerBrokerId,
        tenantId: body?.tenantId || ownerBrokerId,
      },
      { ownerBrokerId, isAdmin },
    );
    return NextResponse.json(party);
  } catch (error: unknown) {
    if (error instanceof IdentityForbiddenError) {
      return NextResponse.json({ ok: false, error: '권한이 없습니다.' }, { status: 403 });
    }
    log.error('[POST /api/identity/party] Error:', error);
    return NextResponse.json(
      { ok: false, error: '당사자 요청 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const ip = getClientIp(req) ?? guard.user?.id ?? 'anonymous';
  const allowed = await checkRateLimit(ip, 'identity_party_delete', 20, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing party id parameter' }, { status: 400 });
    }

    const ownerBrokerId = guard.user!.id;
    const isAdmin = guard.role === 'admin';

    await deleteParty(id, { ownerBrokerId, isAdmin });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof IdentityForbiddenError) {
      return NextResponse.json({ ok: false, error: '권한이 없습니다.' }, { status: 403 });
    }
    log.error('[DELETE /api/identity/party] Error:', error);
    return NextResponse.json(
      { ok: false, error: '당사자 삭제 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
