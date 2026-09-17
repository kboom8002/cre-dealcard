import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { generateSpecialEdition } from '@/domain/magazine/special-edition-generator';
import { distributeSpecialEdition } from '@/domain/magazine/distribute-special-edition';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('route-special-magazine');

export const dynamic = 'force-dynamic';

/**
 * GET /api/broker/magazine/special?buildingId=xxx
 * 특정 매물의 속보 타깃 독자 수 및 사전 정보 조회
 */
export async function GET(req: NextRequest) {
  try {
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const buildingId = searchParams.get('buildingId');
    if (!buildingId) {
      return NextResponse.json({ error: 'buildingId 파라미터가 필요합니다.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 1. 매물 정보 조회
    const { data: building, error: bError } = await supabase
      .from('building_ssot_lite')
      .select('id, address, area_signal, asset_type, price, attrs')
      .eq('id', buildingId)
      .maybeSingle();

    if (bError || !building) {
      return NextResponse.json({ error: '매물을 찾을 수 없습니다.' }, { status: 404 });
    }

    const areaSignal = building.area_signal || '핵심권역';
    const assetType = building.asset_type || '꼬마빌딩';
    const priceDisplay = building.price || building.attrs?.askingPriceDisplay || '가격 협의';

    // 2. 브로커의 활성 구독자 목록 조회
    const { data: subscribers } = await supabase
      .from('magazine_subscribers')
      .select('id, subscriber_name, subscriber_phone, segment, channel, interest_tags, interest_profile')
      .eq('broker_id', user.id)
      .eq('status', 'active');

    const subList = subscribers || [];
    const areaLower = areaSignal.toLowerCase();
    const assetLower = assetType.toLowerCase();

    // 스마트 타깃 필터링
    const matched = subList.filter((s: any) => {
      const tags = s.interest_tags || {};
      const regions: string[] = tags.regions || [];
      const assetTypes: string[] = tags.assetTypes || [];

      const rMatch = regions.some(r => areaLower.includes(r.toLowerCase()) || r.toLowerCase().includes(areaLower));
      const aMatch = assetTypes.some(a => assetLower.includes(a.toLowerCase()) || a.toLowerCase().includes(assetLower));

      if (rMatch || aMatch) return true;
      if (!regions.length && !assetTypes.length) return true;
      return s.segment === 'investor';
    });

    const { getBuyerTemperature } = await import('@/domain/magazine/buyer-temperature');
    let hotLeadCount = 0;

    const matchedPreview = matched.map((s: any) => {
      const temp = getBuyerTemperature(s.interest_profile, 50);
      if (temp.label === '🔥 적극검토' || temp.label === '📈 관심') {
        hotLeadCount++;
      }
      return {
        id: s.id,
        name: s.subscriber_name,
        phone: s.subscriber_phone,
        temperature: temp.label,
        badgeBg: temp.badgeBg,
        color: temp.color,
      };
    });

    const defaultHeadline = `[단독 속보] ${areaSignal} ${assetType} 급매 안내 (${priceDisplay})`;

    return NextResponse.json({
      building: {
        id: building.id,
        areaSignal,
        assetType,
        priceDisplay,
      },
      totalSubscribers: subList.length,
      targetCount: matched.length,
      hotLeadCount,
      matchedPreview: matchedPreview.slice(0, 10),
      defaultHeadline,
    });
  } catch (err: any) {
    log.error('[GET /api/broker/magazine/special] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/broker/magazine/special
 * 속보 매거진 생성 및 즉시 배포
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseAuth = await createServerSupabaseClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const { buildingId, headline, urgentNote, autoDistribute = true } = body;

    if (!buildingId) {
      return NextResponse.json({ error: 'buildingId가 누락되었습니다.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 1. 속보 에디션 생성
    const edition = await generateSpecialEdition({
      supabase,
      brokerId: user.id,
      buildingId,
      urgentHeadline: headline,
      urgentNote,
    });

    // 2. 자동 배포 요청인 경우 즉시 배포 수행
    let distributionResult = null;
    if (autoDistribute) {
      const { data: building } = await supabase
        .from('building_ssot_lite')
        .select('area_signal, asset_type, price')
        .eq('id', buildingId)
        .single();

      distributionResult = await distributeSpecialEdition(supabase, {
        edition,
        buildingId,
        areaSignal: building?.area_signal || '핵심권역',
        assetType: building?.asset_type || '꼬마빌딩',
        priceBand: building?.price || '',
        headline: edition.title,
        brokerId: user.id,
      });
    }

    return NextResponse.json({
      success: true,
      edition,
      distributionResult,
    });
  } catch (err: any) {
    log.error('[POST /api/broker/magazine/special] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
