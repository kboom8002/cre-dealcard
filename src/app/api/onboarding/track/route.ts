/**
 * POST /api/onboarding/track
 *
 * Analytics event ingestion endpoint.
 * Body: { session_token?: string, event_name: string, event_data?: Record<string, unknown> }
 *
 * Always returns { ok: true } — errors are logged but not surfaced.
 * Public endpoint (no auth required).
 */

import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      session_token?: unknown;
      event_name?: unknown;
      event_data?: unknown;
    };

    const eventName = typeof body.event_name === 'string' ? body.event_name.trim() : null;
    if (!eventName) {
      // Still return ok:true — bad event names are silently dropped
      return Response.json({ ok: true });
    }

    const sessionToken =
      typeof body.session_token === 'string' && body.session_token.length > 0
        ? body.session_token
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
        .single();
      sessionId = session?.id ?? null;
    }

    // Insert event row
    const { error } = await supabase.from('onboarding_events').insert({
      session_id: sessionId,
      event_name: eventName,
      event_data: eventData,
    });

    if (error) {
      console.error('[onboarding/track] DB insert error:', error);
    }

    // 온보딩 완료 이벤트 수신 시 onboarding_sessions.completed_at 업데이트 (안전망)
    // save-profile이 호출되지 않은 경우를 대비한 보조 경로
    if (eventName === 'onboard_complete' && sessionId) {
      await supabase
        .from('onboarding_sessions')
        .update({
          completed_at: new Date().toISOString(),
          current_stage: 'complete',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .is('completed_at', null); // 이미 완료된 경우 덮어쓰지 않음
    }
  } catch (err) {
    // Never let analytics break the caller
    console.error('[onboarding/track] Unexpected error:', err);
  }

  return Response.json({ ok: true });
}
