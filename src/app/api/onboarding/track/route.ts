/**
 * POST /api/onboarding/track
 *
 * Analytics event ingestion endpoint.
 * Body: { session_token?: string, event_name: string, event_data?: Record<string, unknown> }
 *
 * Public endpoint with IP rate limiting and body size cap.
 */

import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createModuleLogger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limiter';
import { getClientIp } from '@/lib/magazine/public-guard';

const log = createModuleLogger('onboarding-track-route');
const MAX_BODY_BYTES = 16 * 1024;

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req) ?? 'unknown';
    const allowed = await checkRateLimit(ip, 'public_onboarding_track', 60, 60_000);
    if (!allowed) {
      return Response.json(
        { ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429 }
      );
    }

    const declaredLen = Number(req.headers.get('content-length'));
    if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
      return Response.json(
        { ok: false, error: '요청 내용이 너무 큽니다.' },
        { status: 413 }
      );
    }

    const rawText = await req.text();
    if (Buffer.byteLength(rawText, 'utf8') > MAX_BODY_BYTES) {
      return Response.json(
        { ok: false, error: '요청 내용이 너무 큽니다.' },
        { status: 413 }
      );
    }

    let body: {
      session_token?: unknown;
      event_name?: unknown;
      event_data?: unknown;
    } = {};
    try {
      body = rawText ? JSON.parse(rawText) : {};
    } catch {
      return Response.json({ ok: false, error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    const eventName =
      typeof body.event_name === 'string'
        ? body.event_name.trim().slice(0, 100)
        : null;
    if (!eventName) {
      return Response.json({ ok: true });
    }

    const sessionToken =
      typeof body.session_token === 'string' && body.session_token.trim().length > 0
        ? body.session_token.trim().slice(0, 200)
        : null;

    const eventData =
      body.event_data !== null &&
      typeof body.event_data === 'object' &&
      !Array.isArray(body.event_data)
        ? (body.event_data as Record<string, unknown>)
        : null;

    const supabase = createServiceClient();

    // Resolve session_id from token (if provided)
    let sessionId: string | null = null;
    if (sessionToken) {
      const { data: session } = await supabase
        .from('onboarding_sessions')
        .select('id')
        .eq('session_token', sessionToken)
        .maybeSingle();
      sessionId = session?.id ?? null;
    }

    // Insert event row
    const { error } = await supabase.from('onboarding_events').insert({
      session_id: sessionId,
      event_name: eventName,
      event_data: eventData,
    });

    if (error) {
      log.warn('[onboarding/track] DB insert degraded', { code: error.code || 'UNKNOWN' });
    }

    // 온보딩 완료 이벤트 수신 시 onboarding_sessions.completed_at 업데이트 (안전망)
    if (eventName === 'onboard_complete' && sessionId) {
      await supabase
        .from('onboarding_sessions')
        .update({
          completed_at: new Date().toISOString(),
          current_stage: 'complete',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .is('completed_at', null);
    }
  } catch (err) {
    log.warn('[onboarding/track] Unexpected error', {
      message: err instanceof Error ? err.message.slice(0, 120) : 'unknown',
    });
  }

  return Response.json({ ok: true });
}
