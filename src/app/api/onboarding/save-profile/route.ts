/**
 * POST /api/onboarding/save-profile
 *
 * Authenticated endpoint called after login to persist the onboarding profile.
 * - Looks up the onboarding session by session_token
 * - Upserts broker_profiles with vibe data
 * - Updates profiles table with specialty / region
 * - Marks the session as completed
 *
 * Auth: Bearer token required.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod/v4';
import { verifyAuth } from '@/lib/auth-guard';
import { toApiError } from '@/lib/api-error';
import { createServiceClient } from '@/lib/supabase/service';

// ── Validation schema ─────────────────────────────────────────────────────────

const SaveProfileRequest = z.object({
  session_token: z.string().min(1, 'session_token은 필수입니다.'),
  specialty: z
    .enum([
      'small_building',
      'office_lease',
      'retail',
      'industrial',
      'attorney',
      'tax_accountant',
      'legal_scrivener',
      'other',
    ])
    .optional(),
  region: z
    .enum([
      'seongsu_seongdong',
      'gangnam_seocho',
      'yeouido_mapo',
      'cbd',
      'pangyo',
      'other',
    ])
    .optional(),
  role: z.enum(['expert', 'owner']).optional(),
  user_name: z.string().min(1).max(60).optional(),
  user_phone: z.string().min(9).max(20).optional(),
});

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth check
  const guard = await verifyAuth(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  if (!user) {
    return Response.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
      { status: 401 },
    );
  }

  try {
    const json = await req.json();
    const body = SaveProfileRequest.parse(json);

    const supabase = createServiceClient();

    // ── 1. Lookup session by token ──────────────────────────────────────────
    const { data: session, error: sessionErr } = await supabase
      .from('onboarding_sessions')
      .select('*')
      .eq('session_token', body.session_token)
      .single();

    if (sessionErr || !session) {
      return Response.json(
        { ok: false, error: { code: 'NOT_FOUND', message: '온보딩 세션을 찾을 수 없습니다.' } },
        { status: 404 },
      );
    }

    // ── 2. Upsert broker_profiles with vibe data ────────────────────────────
    if (session.vibe_vector) {
      const { error: profileErr } = await supabase
        .from('broker_profiles')
        .upsert(
          {
            user_id: user.id,
            vibe_vector: session.vibe_vector,
            vibe_vti: session.vti_type,
            vibe_complement: session.complement_vector,
            vibe_template_id: session.matched_template_id,
            vibe_valence: (session.before_scores as { valence?: number } | null)?.valence ?? null,
            vibe_trust: (session.before_scores as { trust?: number } | null)?.trust ?? null,
            vibe_analyzed_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );

      if (profileErr) {
        console.error('[save-profile] broker_profiles upsert error:', profileErr);
      }
    }

    // ── 3. Update profiles table ────────────────────────────────────────────
    const profileUpdates: Record<string, unknown> = {};
    if (body.specialty) profileUpdates['specialty'] = body.specialty;
    if (body.region) profileUpdates['region'] = body.region;
    if (body.user_name) profileUpdates['display_name'] = body.user_name;
    if (body.user_phone) profileUpdates['phone'] = body.user_phone;

    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileUpdateErr } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', user.id);

      if (profileUpdateErr) {
        console.error('[save-profile] profiles update error:', profileUpdateErr);
      }
    }

    // ── 4. Update session: link user, set stage & completed_at ────────────
    const sessionUpdates: Record<string, unknown> = {
      user_id: user.id,
      current_stage: 'profile_complete',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (body.specialty) sessionUpdates['specialty'] = body.specialty;
    if (body.region) sessionUpdates['region'] = body.region;
    if (body.role) sessionUpdates['role'] = body.role;

    const { error: updateErr } = await supabase
      .from('onboarding_sessions')
      .update(sessionUpdates)
      .eq('session_token', body.session_token);

    if (updateErr) {
      console.error('[save-profile] session update error:', updateErr);
    }

    return Response.json({
      ok: true,
      data: {
        user_id: user.id,
        session_token: body.session_token,
        stage: 'profile_complete',
      },
    });
  } catch (error) {
    console.error('[save-profile] Route error:', error);
    return toApiError(error);
  }
}
