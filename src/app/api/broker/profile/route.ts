/**
 * GET  /api/broker/profile  — 내 브로커 프로필 조회
 * PUT  /api/broker/profile  — 내 브로커 프로필 수정
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod/v4';
import { requireBroker } from '@/lib/auth-guard';

const ProfileUpdateSchema = z.object({
  display_name: z.string().min(2).max(30).optional(),
  phone: z.string().max(20).optional(),
  company: z.string().max(50).optional(),
  specialty_regions: z.array(z.string()).max(10).optional(),
  specialty_assets: z.array(z.string()).max(10).optional(),
  bio: z.string().max(500).optional(),
  slug: z.string().max(50).optional(),
  magazine_title: z.string().max(100).optional(),
  magazine_theme_color: z.string().max(20).optional(),
  tagline: z.string().max(100).optional(),

  // 자격/등록
  license_number: z.string().max(30).optional(),
  office_reg_number: z.string().max(30).optional(),
  association: z.string().max(50).optional(),
  career_start_year: z.number().min(1980).max(2026).nullable().optional(),

  // 거래 실적
  total_deal_count_self: z.number().min(0).nullable().optional(),
  deal_size_range: z.string().nullable().optional(),
  deal_specialty: z.array(z.string()).max(5).optional(),
  buyer_types: z.array(z.string()).max(5).optional(),
  preferred_price_range: z.string().nullable().optional(),
  languages: z.array(z.string()).max(5).optional(),

  // 서비스 정책
  fee_policy: z.string().nullable().optional(),
  consult_methods: z.array(z.string()).optional(),
  response_time_hours: z.number().min(1).max(168).nullable().optional(),

  // 소셜
  kakao_channel: z.string().max(100).optional(),
  naver_blog_url: z.string().max(200).optional(),
  youtube_url: z.string().max(200).optional(),
  linkedin_url: z.string().max(200).optional(),

  // SEO
  seo_summary: z.string().max(500).optional(),
  is_public: z.boolean().optional(),

  // GEO
  office_address: z.string().max(200).optional(),
  office_district: z.string().max(20).optional(),

  // Avatar
  avatar_url: z.string().url().max(1000).nullable().optional(),
});

/** broker_profiles 테이블에서 조회할 v2 확장 컬럼 목록 */
const BROKER_PROFILE_COLUMNS = [
  'specialty_regions', 'specialty_assets', 'bio', 'slug', 'magazine_title', 'magazine_theme_color', 'is_verified', 'created_at',
  // v2 자격/등록
  'license_number', 'office_reg_number', 'association', 'career_start_year',
  // v2 거래 실적
  'total_deal_count_self', 'deal_size_range', 'deal_specialty', 'buyer_types',
  'preferred_price_range', 'languages',
  // v2 서비스 정책
  'fee_policy', 'consult_methods', 'response_time_hours',
  // v2 소셜
  'kakao_channel', 'naver_blog_url', 'youtube_url', 'linkedin_url',
  // v2 SEO
  'seo_summary', 'is_public',
  // v2 GEO
  'office_address', 'office_district',
  // Avatar
  'avatar_url',
].join(', ');

/** broker_profiles 테이블에 upsert 할 v2 필드 키 목록 */
const BROKER_UPSERT_KEYS = [
  'specialty_regions', 'specialty_assets', 'bio', 'slug', 'magazine_title', 'magazine_theme_color',
  'license_number', 'office_reg_number', 'association', 'career_start_year',
  'total_deal_count_self', 'deal_size_range', 'deal_specialty', 'buyer_types',
  'preferred_price_range', 'languages',
  'fee_policy', 'consult_methods', 'response_time_hours',
  'kakao_channel', 'naver_blog_url', 'youtube_url', 'linkedin_url',
  'seo_summary', 'is_public',
  'office_address', 'office_district',
  'avatar_url',
] as const;

export async function GET(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, display_name, phone, company, tagline, created_at')
    .eq('id', user!.id)
    .single();

  const { data: brokerProfile } = await supabase
    .from('broker_profiles')
    .select(BROKER_PROFILE_COLUMNS)
    .eq('user_id', user!.id)
    .single();

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

  const { display_name, phone, company } = parsed.data;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Update profiles table
  const profileUpdate: Record<string, unknown> = {};
  if (display_name !== undefined) profileUpdate.display_name = display_name;
  if (phone !== undefined) profileUpdate.phone = phone;
  if (company !== undefined) profileUpdate.company = company;
  if (parsed.data.tagline !== undefined) profileUpdate.tagline = parsed.data.tagline;

  // ─── Fix: avatar_url → profiles.photo_url 동기화 ───────────
  // Vibe Card (/vibe-card/[slug])가 profiles.photo_url을 읽으므로
  // 프로필 저장 시 avatar_url이 포함되면 photo_url도 함께 갱신
  if (parsed.data.avatar_url) {
    profileUpdate.photo_url = parsed.data.avatar_url;
  }

  if (Object.keys(profileUpdate).length > 0) {
    const { error } = await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('id', user!.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Upsert broker_profiles table (v2 확장 필드 포함)
  const brokerUpdate: Record<string, unknown> = { user_id: user!.id };
  for (const key of BROKER_UPSERT_KEYS) {
    const value = parsed.data[key];
    if (value !== undefined) brokerUpdate[key] = value;
  }

  if (Object.keys(brokerUpdate).length > 1) {
    const { error } = await supabase
      .from('broker_profiles')
      .upsert(brokerUpdate, { onConflict: 'user_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
