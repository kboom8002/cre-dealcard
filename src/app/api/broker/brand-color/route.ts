/**
 * 브랜드 컬러 (Basic IM) — pptx_custom_presets 의 "회사 기본 프리셋" 재사용
 *
 * GET    /api/broker/brand-color  → 현재 적용 중인 브랜드 컬러 (본인/같은 법인 기본 프리셋의 tokens.accent)
 * PUT    /api/broker/brand-color  → { accent: '#RRGGBB' } 저장 (이름 고정 프리셋 upsert + is_company_default=true,
 *                                    같은 사용자의 다른 기본 프리셋은 해제)
 * DELETE /api/broker/brand-color  → 브랜드 컬러 해제 (기본 팔레트로 복귀)
 *
 * Zero-Trust RLS: `withBrokerTenantContext` 를 통해 인증된 브로커 세션의 RLS 클라이언트(`auth.uid()`)로만 접근한다.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  deriveBrandSkin,
  normalizeBrandHex,
  resolveBrandAccent,
} from '@/domain/building/mobile-im/pptx/brand-skin';
import { withBrokerTenantContext } from '@/lib/supabase/tenant-context';

export const runtime = 'nodejs';

const BRAND_PRESET_NAME = '브랜드 컬러 (Basic IM)';

export async function GET(req: NextRequest) {
  return withBrokerTenantContext(req, async ({ userId, supabase }) => {
    const brand = await resolveBrandAccent({ supabase: supabase as any, ownerId: userId });
    if (!brand) return NextResponse.json({ accent: null });
    const derived = deriveBrandSkin(brand.accent);
    return NextResponse.json({
      accent: brand.accent,
      source: brand.source,
      preset_id: brand.presetId,
      effective_accent: derived?.palette.accent ?? brand.accent,
      adjusted: derived?.adjusted ?? false,
    });
  });
}

export async function PUT(req: NextRequest) {
  return withBrokerTenantContext(req, async ({ req: innerReq, userId, supabase }) => {
    const body = await innerReq.json().catch(() => ({}));
    const accent = normalizeBrandHex((body as { accent?: unknown })?.accent);
    if (!accent) {
      return NextResponse.json({ error: '색상은 #RRGGBB 형식이어야 합니다.' }, { status: 400 });
    }
    const derived = deriveBrandSkin(accent)!;

    // company_id 는 서버에서 조회 (클라이언트 값 무시, RLS broker_profiles_select_own 적용)
    const { data: profile } = await supabase
      .from('broker_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    const companyId = (profile as { company_id?: string | null } | null)?.company_id ?? null;

    // 이 사용자의 기존 기본 프리셋 해제 (이름 고정 프리셋 외)
    await supabase
      .from('pptx_custom_presets')
      .update({ is_company_default: false })
      .eq('user_id', userId)
      .eq('is_company_default', true)
      .neq('preset_name', BRAND_PRESET_NAME);

    const { data: existing } = await supabase
      .from('pptx_custom_presets')
      .select('id')
      .eq('user_id', userId)
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
      ? await supabase
          .from('pptx_custom_presets')
          .update(fields)
          .eq('id', existing.id)
          .eq('user_id', userId)
          .select('id')
          .single()
      : await supabase
          .from('pptx_custom_presets')
          .insert({ ...fields, user_id: userId, preset_name: BRAND_PRESET_NAME })
          .select('id')
          .single();

    if (res.error) {
      throw new Error(res.error.message);
    }

    return NextResponse.json({
      accent,
      preset_id: res.data?.id,
      effective_accent: derived.palette.accent,
      adjusted: derived.adjusted,
    });
  });
}

export async function DELETE(req: NextRequest) {
  return withBrokerTenantContext(req, async ({ userId, supabase }) => {
    const { error } = await supabase
      .from('pptx_custom_presets')
      .update({ is_company_default: false })
      .eq('user_id', userId)
      .eq('is_company_default', true);
    if (error) {
      throw new Error(error.message);
    }
    return NextResponse.json({ success: true });
  });
}
