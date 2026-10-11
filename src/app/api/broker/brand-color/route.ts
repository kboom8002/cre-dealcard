/**
 * 브랜드 컬러 (Basic IM) — pptx_custom_presets 의 "회사 기본 프리셋" 재사용
 *
 * GET    /api/broker/brand-color  → 현재 적용 중인 브랜드 컬러 (본인/같은 법인 기본 프리셋의 tokens.accent)
 * PUT    /api/broker/brand-color  → { accent: '#RRGGBB' } 저장 (이름 고정 프리셋 upsert + is_company_default=true,
 *                                    같은 사용자의 다른 기본 프리셋은 해제)
 * DELETE /api/broker/brand-color  → 브랜드 컬러 해제 (기본 팔레트로 복귀)
 *
 * 저장은 tokens.accent 한 값만 사용한다. Basic IM 은 이 값에서 팔레트를 파생하고(brand-skin.ts, WCAG 대비 가드),
 * 시퀀스·레이아웃·글꼴은 건드리지 않는다. 검증 실패 → 400, 생성/다운로드에는 영향 없음.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireBroker } from '@/lib/auth-guard';
import { deriveBrandSkin, normalizeBrandHex, resolveBrandAccent } from '@/domain/building/mobile-im/pptx/brand-skin';

export const runtime = 'nodejs';

const BRAND_PRESET_NAME = '브랜드 컬러 (Basic IM)';

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const supabase = db();
    const brand = await resolveBrandAccent({ supabase: supabase as any, ownerId: guard.user!.id });
    if (!brand) return NextResponse.json({ accent: null });
    const derived = deriveBrandSkin(brand.accent);
    return NextResponse.json({
      accent: brand.accent,
      source: brand.source,
      preset_id: brand.presetId,
      // 대비 가드로 실제 사용 색이 입력과 다를 수 있음 — UI 에 미리보기로 안내
      effective_accent: derived?.palette.accent ?? brand.accent,
      adjusted: derived?.adjusted ?? false,
    });
  } catch (err) {
    console.error('[brand-color-get] Error:', err);
    return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const user = guard.user!;

    const body = await req.json().catch(() => ({}));
    const accent = normalizeBrandHex((body as any)?.accent);
    if (!accent) {
      return NextResponse.json({ error: '색상은 #RRGGBB 형식이어야 합니다.' }, { status: 400 });
    }
    const derived = deriveBrandSkin(accent)!;

    const supabase = db();
    // company_id 는 서버에서 조회 (클라이언트 값 무시)
    const { data: profile } = await supabase.from('broker_profiles').select('company_id').eq('user_id', user.id).maybeSingle();
    const companyId = profile?.company_id ?? null;

    // 이 사용자의 기존 기본 프리셋 해제 (이름 고정 프리셋 외)
    await supabase
      .from('pptx_custom_presets')
      .update({ is_company_default: false })
      .eq('user_id', user.id)
      .eq('is_company_default', true)
      .neq('preset_name', BRAND_PRESET_NAME);

    const { data: existing } = await supabase
      .from('pptx_custom_presets')
      .select('id')
      .eq('user_id', user.id)
      .eq('preset_name', BRAND_PRESET_NAME)
      .maybeSingle();

    const fields = {
      tokens: { accent },
      company_id: companyId,
      is_company_default: true,
      base_preset_id: 'credeal_basic',
      preset_desc: 'Basic IM 브랜드 대표색 (팔레트 자동 파생)',
      updated_at: new Date().toISOString(),
    };
    const res = existing
      ? await supabase.from('pptx_custom_presets').update(fields).eq('id', existing.id).eq('user_id', user.id).select('id').single()
      : await supabase.from('pptx_custom_presets').insert({ ...fields, user_id: user.id, preset_name: BRAND_PRESET_NAME }).select('id').single();
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });

    return NextResponse.json({
      accent,
      preset_id: res.data?.id,
      effective_accent: derived.palette.accent,
      adjusted: derived.adjusted,
    });
  } catch (err) {
    console.error('[brand-color-put] Error:', err);
    return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const { error } = await db()
      .from('pptx_custom_presets')
      .update({ is_company_default: false })
      .eq('user_id', guard.user!.id)
      .eq('is_company_default', true);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[brand-color-delete] Error:', err);
    return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
  }
}
