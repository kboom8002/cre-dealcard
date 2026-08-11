/**
 * GET  /api/broker/pptx-preset
 *   - 내 커스텀 프리셋 + 같은 법인 공유 프리셋 목록 반환
 *   - ?include_builtin=true 시 내장 프리셋 목록도 함께 반환
 *
 * POST /api/broker/pptx-preset
 *   - 새 커스텀 프리셋 저장
 *   - Body: { preset_name, tokens, cover_style, layout_style, company_name, company_tagline, base_preset_id, company_id? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PPTX_PRESET_TEMPLATES } from '@/domain/building/mobile-im/pptx/pptx-theme';
import { requireBroker } from '@/lib/auth-guard';

export const runtime = 'nodejs';

const BUILTIN_PRESETS = Object.values(PPTX_PRESET_TEMPLATES).map(p => ({
  id: p.presetId,
  preset_name: p.presetName,
  is_builtin: true,
  cover_style: p.coverStyle,
  layout_style: p.layoutStyle,
  tokens: p,
  company_name: p.companyName,
  company_tagline: p.companyTagline,
  created_at: null,
}));

export async function GET(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const user = guard.user!;

  const includeBuiltin = req.nextUrl.searchParams.get('include_builtin') === 'true';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: myPresets, error } = await supabase
    .from('pptx_custom_presets')
    .select('id, preset_name, preset_desc, cover_style, layout_style, company_name, company_tagline, logo_url, base_preset_id, is_company_default, company_id, tokens, use_count, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 같은 법인 프리셋 (내 것 제외)
  const myCompanyIds = [...new Set((myPresets ?? []).map(p => p.company_id).filter(Boolean))];
  let companyPresets: any[] = [];
  if (myCompanyIds.length > 0) {
    const { data: cp } = await supabase
      .from('pptx_custom_presets')
      .select('id, preset_name, preset_desc, cover_style, layout_style, company_name, company_tagline, logo_url, base_preset_id, is_company_default, company_id, tokens, use_count, created_at, updated_at')
      .in('company_id', myCompanyIds)
      .neq('user_id', user.id)
      .order('created_at', { ascending: false });
    companyPresets = cp ?? [];
  }

  const result: any = {
    my_presets: myPresets ?? [],
    company_presets: companyPresets,
  };
  if (includeBuiltin) result.builtin_presets = BUILTIN_PRESETS;

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const user = guard.user!;

  const body = await req.json();
  const {
    preset_name, preset_desc, tokens, cover_style, layout_style,
    company_name, company_tagline, logo_url, base_preset_id, company_id,
    is_company_default,
  } = body;

  if (!preset_name || !tokens) {
    return NextResponse.json({ error: 'preset_name and tokens are required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from('pptx_custom_presets')
    .insert({
      user_id: user.id,
      company_id: company_id ?? null,
      preset_name,
      preset_desc: preset_desc ?? null,
      tokens,
      cover_style: cover_style ?? 'institutional_masses',
      layout_style: layout_style ?? 'classic',
      company_name: company_name ?? null,
      company_tagline: company_tagline ?? null,
      logo_url: logo_url ?? null,
      base_preset_id: base_preset_id ?? 'golden_institutional',
      is_company_default: is_company_default ?? false,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '같은 이름의 프리셋이 이미 존재합니다.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ preset: data }, { status: 201 });
}
