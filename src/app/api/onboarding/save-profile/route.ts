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
      // slug가 없으면 자동 생성 (vibe card URL용)
      let existingSlug: string | null = null;
      const { data: existingBP } = await supabase
        .from('broker_profiles')
        .select('slug')
        .eq('user_id', user.id)
        .single();
      existingSlug = existingBP?.slug || null;

      if (!existingSlug) {
        // 이름 기반 slug 생성 (없으면 user.id 앞 8자리 사용)
        const baseName = body.user_name || user.id.substring(0, 8);
        const slugBase = baseName.toLowerCase().replace(/[^a-z0-9\uAC00-\uD7A3]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        existingSlug = `${slugBase}-${user.id.substring(0, 6)}`;
      }

      const brokerUpsertData: Record<string, unknown> = {
        user_id: user.id,
        slug: existingSlug,
        vibe_vector: session.vibe_vector,
        vibe_vti: session.vti_type,
        vibe_complement: session.complement_vector,
        vibe_template_id: session.matched_template_id,
        vibe_valence: (session.before_scores as { valence?: number } | null)?.valence ?? null,
        vibe_trust: (session.before_scores as { trust?: number } | null)?.trust ?? null,
        vibe_analyzed_at: new Date().toISOString(),
      };
      // 온보딩 사진을 broker_profiles.avatar_url에도 저장
      if (session.photo_url) {
        brokerUpsertData['avatar_url'] = session.photo_url;
      }
      // 이름도 저장
      if (body.user_name) {
        brokerUpsertData['name'] = body.user_name;
      }

      const { error: profileErr } = await supabase
        .from('broker_profiles')
        .upsert(brokerUpsertData, { onConflict: 'user_id' });

      if (profileErr) {
        console.error('[save-profile] broker_profiles upsert error:', profileErr);
      }
    }

    // ── 3. Update profiles table ────────────────────────────────────────────
    const profileUpdates: Record<string, unknown> = { role: 'broker' };
    if (body.specialty) profileUpdates['specialty'] = body.specialty;
    if (body.region) profileUpdates['region'] = body.region;
    if (body.user_name) profileUpdates['display_name'] = body.user_name;
    if (body.user_phone) profileUpdates['phone'] = body.user_phone;
    // 온보딩 사진이 있으면 profiles.photo_url에도 저장
    if (session.photo_url) profileUpdates['photo_url'] = session.photo_url;

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
