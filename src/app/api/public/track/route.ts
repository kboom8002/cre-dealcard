/**
 * POST /api/public/track
 *
 * Fire-and-forget 이벤트 수집 API.
 * 50ms 이내 응답 목표. 실패해도 열람을 막지 않습니다.
 * §9-6: 토큰을 로그·에러 리포트에 남기지 않습니다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createModuleLogger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getClientIp } from '@/lib/magazine/public-guard';

const log = createModuleLogger('public-track-route');
const MAX_BODY_BYTES = 16 * 1024;

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req) ?? 'unknown';
    const allowed = await checkRateLimit(ip, 'public_track', 60, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429 }
      );
    }

    const declaredLen = Number(req.headers.get('content-length'));
    if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, error: '요청 내용이 너무 큽니다.' },
        { status: 413 }
      );
    }

    const rawText = await req.text();
    if (Buffer.byteLength(rawText, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, error: '요청 내용이 너무 큽니다.' },
        { status: 413 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const {
      tenantId,
      dealId,
      kind,
      viewerId,
      shareToken,
      grantToken,
      partyId,
      ...payload
    } = body;

    if (
      typeof tenantId !== 'string' ||
      !tenantId.trim() ||
      typeof dealId !== 'string' ||
      !dealId.trim() ||
      typeof kind !== 'string' ||
      !kind.trim()
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Fire-and-forget: 큐 삽입만 하고 즉시 응답 (Rule 26: .then(onFulfilled, onRejected))
    supabase
      .from('track_event')
      .insert({
        tenant_id: tenantId.trim().slice(0, 128),
        deal_id: dealId.trim().slice(0, 128),
        kind: kind.trim().slice(0, 64),
        viewer_id: typeof viewerId === 'string' && viewerId.trim() ? viewerId.trim().slice(0, 128) : null,
        share_token: typeof shareToken === 'string' && shareToken.trim() ? shareToken.trim().slice(0, 512) : null,
        grant_token: typeof grantToken === 'string' && grantToken.trim() ? grantToken.trim().slice(0, 512) : null,
        party_id: typeof partyId === 'string' && partyId.trim() ? partyId.trim().slice(0, 128) : null,
        payload,
      })
      .then(
        ({ error }) => {
          if (error) {
            // §9-6: 토큰 및 내부 상세 SQL 오류를 노출하지 않음
            log.warn('[track] Insert degraded', { code: error.code || 'UNKNOWN' });
          }
        },
        () => {
          log.warn('[track] Insert rejected');
        }
      );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
