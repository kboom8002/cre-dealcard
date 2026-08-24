/**
 * GET  /api/broker/profile  — 내 브로커 프로필 조회
 * PUT  /api/broker/profile  — 내 브로커 프로필 수정
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod/v4';
import { requireBroker } from '@/lib/auth-guard';

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

export async function GET(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

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
    const baseName = (profile?.display_name || user!.id.substring(0, 8)) as string;
    const slugBase = baseName.toLowerCase().replace(/[^a-z0-9\uAC00-\uD7A3]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'broker';
    const autoSlug = `${slugBase}-${user!.id.substring(0, 6)}`;

    const { data: newBrokerProfile } = await supabase
      .from('broker_profiles')
      .upsert({
        user_id: user!.id,
        slug: autoSlug,
      }, { onConflict: 'user_id' })
      .select()
      .maybeSingle();

    brokerProfile = newBrokerProfile;
  } else if (!brokerProfile.slug) {
    const baseName = (profile?.display_name || user!.id.substring(0, 8)) as string;
    const slugBase = baseName.toLowerCase().replace(/[^a-z0-9\uAC00-\uD7A3]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'broker';
    const autoSlug = `${slugBase}-${user!.id.substring(0, 6)}`;
    
    await supabase
      .from('broker_profiles')
      .update({ slug: autoSlug })
      .eq('user_id', user!.id);
    
    brokerProfile.slug = autoSlug;
  }

  return NextResponse.json({
    ok: true,
    data: {
      ...profile,
      broker: brokerProfile ?? null,
      email: user!.email,
    },
  });
}

export async function PUT(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  const json = await req.json();
  const parsed = ProfileUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

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
      console.error('[Profile PUT] profiles update error:', error);
      return NextResponse.json({ error: `기본 정보 저장 오류: ${error.message}` }, { status: 500 });
    }
  }

  // 2. Upsert broker_profiles table (화이트리스트 컬럼만 전달)
  const brokerUpdate: Record<string, unknown> = { user_id: user!.id };
  for (const [key, value] of Object.entries(parsed.data)) {
    if (VALID_BROKER_COLUMNS.has(key) && value !== undefined) {
      brokerUpdate[key] = value;
    }
  }

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
        console.error('[Profile PUT] broker_profiles update error:', error);
        return NextResponse.json({ error: `전문 프로필 저장 오류: ${error.message}` }, { status: 500 });
      }
    } else {
      const { error } = await supabase
        .from('broker_profiles')
        .insert(brokerUpdate);
      if (error) {
        console.error('[Profile PUT] broker_profiles insert error:', error);
        return NextResponse.json({ error: `전문 프로필 생성 오류: ${error.message}` }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

// PATCH is an alias for PUT (for partial updates like FAQ)
export async function PATCH(req: NextRequest) {
  return PUT(req);
}
