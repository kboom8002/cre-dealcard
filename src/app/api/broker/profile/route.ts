/**
 * GET  /api/broker/profile  — 내 브로커 프로필 조회 (+ 매거진 설정 조인)
 * PUT  /api/broker/profile  — 내 브로커 프로필 수정
 *
 * I-02/S2-06: slug는 validateSlug(형식·예약어) + 중복 409.
 * DC-5: `magazine_title`/`magazine_theme_color`는 broker_profiles 컬럼이 아니다(존재하지 않음).
 *       `magazine_settings`(title, theme_color) 테이블에 upsert하고, 테이블이 아직 없으면 해당 필드만 건너뛴 뒤
 *       응답에 `settingsSaved:false`를 알린다(500 아님).
 * 프로필 PUT 500의 원인: 에디터가 slug 폴백 "demo"를 보내 → 타 브로커 소유 slug와 충돌(23505) → 500.
 *       (magazine_* 키는 zod가 이미 제거하고 있었음) → 예약어/중복 검증으로 400/409 처리.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { getBrokerSubscriptionTier } from '@/domain/subscription/tier-gate';
import { validateSlug } from '@/lib/magazine/slug';
import { jsonError } from '@/lib/magazine/authz';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


const ProfileUpdateSchema = z.object({
  display_name: z.string().min(1).max(50).optional(),
  phone: z.string().max(30).optional(),
  company: z.string().max(100).optional(),
  specialty_regions: z.array(z.string()).max(30).optional(),
  specialty_assets: z.array(z.string()).max(30).optional(),
  bio: z.string().max(3000).optional(),
  slug: z.string().max(100).optional(),
  tagline: z.string().max(200).optional(),

  // 자격/등록
  license_number: z.string().max(50).optional(),
  office_reg_number: z.string().max(50).optional(),
  association: z.string().max(100).optional(),
  career_start_year: z.number().min(1950).max(2030).nullable().optional(),

  // 거래 실적
  total_deal_count_self: z.number().min(0).nullable().optional(),
  deal_size_range: z.string().nullable().optional(),
  deal_specialty: z.array(z.string()).max(20).optional(),
  buyer_types: z.array(z.string()).max(20).optional(),
  preferred_price_range: z.string().nullable().optional(),
  languages: z.array(z.string()).max(20).optional(),

  // 서비스 정책
  fee_policy: z.string().nullable().optional(),
  consult_methods: z.array(z.string()).optional(),
  response_time_hours: z.number().min(1).max(168).nullable().optional(),

  // 소셜
  kakao_channel: z.string().max(200).optional(),
  naver_blog_url: z.string().max(300).optional(),
  youtube_url: z.string().max(300).optional(),
  linkedin_url: z.string().max(300).optional(),

  // SEO / 공개
  seo_summary: z.string().max(1000).optional(),
  is_public: z.boolean().optional(),

  // GEO
  office_address: z.string().max(300).optional(),
  office_district: z.string().max(50).optional(),

  // Avatar / Photo
  avatar_url: z.string().max(2000).nullable().optional(),

  // 매거진 설정 → magazine_settings 테이블 (broker_profiles 컬럼 아님)
  magazine_title: z.string().trim().max(60).nullable().optional(),
  magazine_theme_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});

/** broker_profiles 테이블에 실제로 존재하는 컬럼 화이트리스트 */
const VALID_BROKER_COLUMNS = new Set([
  'specialty_regions', 'specialty_assets', 'bio', 'slug', 'is_verified',
  'license_number', 'office_reg_number', 'association', 'career_start_year',
  'total_deal_count_self', 'deal_size_range', 'deal_types_ratio',
  'deal_specialty', 'buyer_types', 'preferred_price_range', 'languages',
  'fee_policy', 'consult_methods', 'response_time_hours',
  'kakao_channel', 'naver_blog_url', 'youtube_url', 'linkedin_url',
  'seo_summary', 'is_public',
  'office_address', 'office_district', 'office_dong',
]);

/** 테이블/컬럼이 아직 없는 오류(마이그레이션 미적용) */
function isNotMigrated(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === '42P01' || err.code === '42703' || err.code === 'PGRST205' || err.code === 'PGRST204') return true;
  const m = (err.message ?? '').toLowerCase();
  return m.includes('does not exist') || m.includes('schema cache');
}

/** 자동 slug: 형식 규칙(SLUG_RE: 영문 소문자·숫자·하이픈 3~30자)을 만족하는 ASCII만 사용 (한글 이름 → 접두 생략). */
function buildAutoSlug(displayName: string | null | undefined, userId: string): string {
  const suffix = userId.replace(/-/g, '').substring(0, 6).toLowerCase();
  const base = (displayName ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20)
    .replace(/-+$/g, '');
  const candidate = base ? `${base}-${suffix}` : `broker-${suffix}`;
  const v = validateSlug(candidate);
  return v.ok ? v.slug : `broker-${suffix}`;
}

export async function GET(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  const supabase = createServiceClient();

  let { data: profile } = await supabase
    .from('profiles')
    .select('id, role, display_name, phone, company, tagline, photo_url, created_at')
    .eq('id', user!.id)
    .maybeSingle();

  // 가입 시 Auth 메타데이터에 입력된 이름이 있으면 우선 복원
  let userMetaName: string | undefined;
  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(user!.id);
    userMetaName = (authUser?.user?.user_metadata?.display_name 
      || authUser?.user?.user_metadata?.name 
      || authUser?.user?.user_metadata?.full_name) as string | undefined;
  } catch { /* ignore */ }

  const emailPrefix = user!.email?.split('@')[0];

  if (profile) {
    if ((!profile.display_name || profile.display_name === emailPrefix) && userMetaName && userMetaName !== emailPrefix) {
      profile.display_name = userMetaName;
      await supabase
        .from('profiles')
        .update({ display_name: userMetaName })
        .eq('id', user!.id);
    }
  } else {
    // profiles row가 없으면 생성
    const defaultDisplayName = userMetaName || emailPrefix || '중개사';
    const { data: newProfile } = await supabase
      .from('profiles')
      .upsert({
        id: user!.id,
        role: 'broker',
        display_name: defaultDisplayName,
      })
      .select()
      .single();
    profile = newProfile;
  }

  let { data: brokerProfile } = await supabase
    .from('broker_profiles')
    .select('*')
    .eq('user_id', user!.id)
    .maybeSingle();

  // broker_profiles row가 없으면 자동 생성
  if (!brokerProfile) {
    const autoSlug = buildAutoSlug(profile?.display_name as string | undefined, user!.id);

    const { data: newBrokerProfile, error: createErr } = await supabase
      .from('broker_profiles')
      .upsert({
        user_id: user!.id,
        slug: autoSlug,
      }, { onConflict: 'user_id' })
      .select()
      .maybeSingle();
    if (createErr) {
      log.error('[Profile GET] broker_profiles create error:', createErr.message);
      return jsonError('INTERNAL_ERROR', '프로필을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
    }

    brokerProfile = newBrokerProfile;
  } else if (!brokerProfile.slug) {
    const autoSlug = buildAutoSlug(profile?.display_name as string | undefined, user!.id);

    const { error: slugErr } = await supabase
      .from('broker_profiles')
      .update({ slug: autoSlug })
      .eq('user_id', user!.id);
    if (slugErr) {
      log.error('[Profile GET] slug backfill error:', slugErr.message);
      return jsonError('INTERNAL_ERROR', '프로필을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
    }

    brokerProfile.slug = autoSlug;
  }

  // 매거진 설정 조인 (magazine_settings: title, theme_color). 없으면 null — 가짜 기본값 없음.
  let magazineTitle: string | null = null;
  let magazineThemeColor: string | null = null;
  let settingsAvailable = true;
  {
    const { data: settings, error: settingsErr } = await supabase
      .from('magazine_settings')
      .select('title, theme_color')
      .eq('broker_user_id', user!.id)
      .maybeSingle();
    if (settingsErr) {
      settingsAvailable = false;
      if (!isNotMigrated(settingsErr)) log.error('[Profile GET] magazine_settings error:', settingsErr.message);
    } else if (settings) {
      magazineTitle = (settings as { title?: string | null }).title ?? null;
      magazineThemeColor = (settings as { theme_color?: string | null }).theme_color ?? null;
    }
  }

  const { tier: subscriptionTier, isPaid: isPaidTier } = await getBrokerSubscriptionTier(
    supabase,
    user!.id
  );

  return NextResponse.json({
    ok: true,
    data: {
      ...profile,
      broker: brokerProfile ?? null,
      email: user!.email,
      magazine_title: magazineTitle,
      magazine_theme_color: magazineThemeColor,
      settingsAvailable,
      subscription: {
        tier: subscriptionTier,
        isPaid: isPaidTier,
      },
    },
  });
}

export async function PUT(req: NextRequest) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const { user } = guard;
  
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return jsonError('INVALID_JSON', '요청 형식이 올바르지 않습니다.', 400);
    }
    const parsed = ProfileUpdateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
    }
  
    const supabase = createServiceClient();

    // 0. 검증 선행: slug 형식·예약어·중복 (쓰기 전에 모두 확인)
    let nextSlug: string | undefined;
    let currentSlug: string | null = null;
    {
      const { data: cur, error: curErr } = await supabase
        .from('broker_profiles')
        .select('slug')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (curErr) {
        log.error('[Profile PUT] current slug lookup error:', curErr.message);
        return jsonError('INTERNAL_ERROR', '프로필을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
      }
      currentSlug = (cur as { slug?: string | null } | null)?.slug ?? null;
    }
    if (parsed.data.slug !== undefined) {
      const v = validateSlug(parsed.data.slug);
      if (!v.ok) return jsonError(v.code === 'RESERVED' ? 'SLUG_RESERVED' : 'SLUG_INVALID', v.message, 400);
      if (v.slug !== currentSlug) {
        const { data: taken, error: takenErr } = await supabase
          .from('broker_profiles')
          .select('user_id')
          .eq('slug', v.slug)
          .neq('user_id', user!.id)
          .limit(1);
        if (takenErr) {
          log.error('[Profile PUT] slug duplicate check error:', takenErr.message);
          return jsonError('INTERNAL_ERROR', '주소를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
        }
        if ((taken ?? []).length > 0) {
          return jsonError('SLUG_TAKEN', '이미 사용 중인 주소입니다. 다른 주소를 선택해 주세요.', 409);
        }
      }
      nextSlug = v.slug;
    }

    // 1. Update profiles table
    const profileUpdate: Record<string, unknown> = {};
    if (parsed.data.display_name !== undefined) profileUpdate.display_name = parsed.data.display_name;
    if (parsed.data.phone !== undefined) profileUpdate.phone = parsed.data.phone;
    if (parsed.data.company !== undefined) profileUpdate.company = parsed.data.company;
    if (parsed.data.tagline !== undefined) profileUpdate.tagline = parsed.data.tagline;
    if (parsed.data.avatar_url !== undefined) profileUpdate.photo_url = parsed.data.avatar_url;
  
    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user!.id,
          role: 'broker',
          ...profileUpdate,
        });
      if (error) {
        log.error('[Profile PUT] profiles update error:', error);
        return NextResponse.json({ error: `기본 정보 저장 오류: ${error.message}` }, { status: 500 });
      }
    }
  
    // 2. Upsert broker_profiles table (화이트리스트 컬럼만 전달 — magazine_title/magazine_theme_color 제외)
    const brokerUpdate: Record<string, unknown> = { user_id: user!.id };
    for (const [key, value] of Object.entries(parsed.data)) {
      if (VALID_BROKER_COLUMNS.has(key) && value !== undefined) {
        brokerUpdate[key] = value;
      }
    }
    if (nextSlug !== undefined) brokerUpdate.slug = nextSlug;
    // 현재 slug와 동일하면 쓰기에서 제외(불필요한 unique 충돌 경로 제거)
    if (nextSlug !== undefined && nextSlug === currentSlug) delete brokerUpdate.slug;
  
    if (Object.keys(brokerUpdate).length > 1) {
      const { data: existing } = await supabase
        .from('broker_profiles')
        .select('user_id')
        .eq('user_id', user!.id)
        .maybeSingle();
  
      if (existing) {
        const { error } = await supabase
          .from('broker_profiles')
          .update(brokerUpdate)
          .eq('user_id', user!.id);
        if (error) {
          if (error.code === '23505') return jsonError('SLUG_TAKEN', '이미 사용 중인 주소입니다. 다른 주소를 선택해 주세요.', 409);
          log.error('[Profile PUT] broker_profiles update error:', error);
          return NextResponse.json({ error: `전문 프로필 저장 오류: ${error.message}` }, { status: 500 });
        }
      } else {
        const { error } = await supabase
          .from('broker_profiles')
          .insert(brokerUpdate);
        if (error) {
          if (error.code === '23505') return jsonError('SLUG_TAKEN', '이미 사용 중인 주소입니다. 다른 주소를 선택해 주세요.', 409);
          log.error('[Profile PUT] broker_profiles insert error:', error);
          return NextResponse.json({ error: `전문 프로필 생성 오류: ${error.message}` }, { status: 500 });
        }
      }
    }

    // 3. 매거진 설정 → magazine_settings upsert (테이블 미존재 시 해당 필드만 건너뛰고 settingsSaved:false)
    const settingsRequested =
      parsed.data.magazine_title !== undefined || parsed.data.magazine_theme_color !== undefined;
    if (settingsRequested) {
      const settingsRow: Record<string, unknown> = {
        broker_user_id: user!.id,
        broker_slug: nextSlug ?? currentSlug,
        updated_at: new Date().toISOString(),
      };
      if (parsed.data.magazine_title !== undefined) settingsRow.title = parsed.data.magazine_title;
      if (parsed.data.magazine_theme_color !== undefined) settingsRow.theme_color = parsed.data.magazine_theme_color;

      const { error: settingsErr } = await supabase
        .from('magazine_settings')
        .upsert(settingsRow, { onConflict: 'broker_user_id' });
      if (settingsErr) {
        const notMigrated = isNotMigrated(settingsErr);
        if (!notMigrated) log.error('[Profile PUT] magazine_settings upsert error:', settingsErr.message);
        return NextResponse.json({
          ok: true,
          settingsSaved: false,
          settingsReason: notMigrated ? 'NOT_MIGRATED' : 'FAILED',
        });
      }
      return NextResponse.json({ ok: true, settingsSaved: true });
    }
  
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error('[profile-put] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: '요청 처리에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// PATCH is an alias for PUT (for partial updates like FAQ)
export async function PATCH(req: NextRequest) {
  try {
    return await PUT(req);
  } catch (err) {
    log.error('[profile-patch] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: '요청 처리에 실패했습니다.' },
      { status: 500 }
    );
  }
}
