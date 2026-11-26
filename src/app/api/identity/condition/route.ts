import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getClientIp } from '@/lib/magazine/public-guard';
import { createModuleLogger } from '@/lib/logger';
import { IdentityForbiddenError } from '@/domain/identity/party-service';
import {
  insertCondition,
  getLatestCondition,
  getConditionHistory,
} from '@/domain/identity/condition-engine';

const log = createModuleLogger('identity-condition-route');

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const ip = getClientIp(req) ?? guard.user?.id ?? 'anonymous';
  const allowed = await checkRateLimit(ip, 'identity_condition_post', 30, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }

  try {
    const body = await req.json();
    if (!body?.partyId || typeof body.partyId !== 'string') {
      return NextResponse.json({ error: 'Missing partyId parameter' }, { status: 400 });
    }

    const ownerBrokerId = guard.user!.id;
    const isAdmin = guard.role === 'admin';
    const condition = await insertCondition(body, { ownerBrokerId, isAdmin });
    return NextResponse.json(condition);
  } catch (error: unknown) {
    if (error instanceof IdentityForbiddenError) {
      return NextResponse.json({ ok: false, error: '권한이 없습니다.' }, { status: 403 });
    }
    log.error('[POST /api/identity/condition] Error:', error);
    return NextResponse.json(
      { ok: false, error: '매수 조건 저장 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const ip = getClientIp(req) ?? guard.user?.id ?? 'anonymous';
  const allowed = await checkRateLimit(ip, 'identity_condition_get', 60, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }

  try {
    const url = new URL(req.url);
    const partyId = url.searchParams.get('partyId');
    const history = url.searchParams.get('history') === 'true';

    if (!partyId) {
      return NextResponse.json({ error: 'Missing partyId parameter' }, { status: 400 });
    }

    const scope = { ownerBrokerId: guard.user!.id, isAdmin: guard.role === 'admin' };
    if (history) {
      const result = await getConditionHistory(partyId, scope);
      return NextResponse.json(result);
    } else {
      const result = await getLatestCondition(partyId, scope);
      return NextResponse.json(result);
    }
  } catch (error: unknown) {
    if (error instanceof IdentityForbiddenError) {
      return NextResponse.json({ ok: false, error: '권한이 없습니다.' }, { status: 403 });
    }
    log.error('[GET /api/identity/condition] Error:', error);
    return NextResponse.json(
      { ok: false, error: '매수 조건 조회 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
