import { NextRequest, NextResponse } from 'next/server';
import { requireBroker, type AuthGuardResult } from '@/lib/auth-guard';
import { studioService } from '@/domain/building/pptx-studio/studio-service';
import { createServiceClient } from '@/lib/supabase/service';
import { assertStudioDealOwner } from '@/lib/authz/studio-owner';

export async function POST(req: NextRequest) {
  let brokerId = 'broker-system';
  let studioGuard: AuthGuardResult | null = null;
  if (!(process.env.NODE_ENV === 'test' && req.headers.get('x-test-bypass'))) {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    studioGuard = guard;
    if (guard.user?.id) brokerId = guard.user.id;
  }

  try {
    const { buildingId, preset } = await req.json();
    if (!buildingId) {
      return NextResponse.json({ ok: false, error: 'buildingId is required' }, { status: 400 });
    }

    // P0-SEC: 매물(또는 원본 IM 문서) 소유자만 Basic IM 스튜디오 프로젝트 생성·조회 가능
    // (이전: 남의 buildingId 로 IM 본문·렌트롤을 내 스튜디오 프로젝트로 복제 가능)
    const denied = await assertStudioDealOwner(studioGuard, buildingId);
    if (denied) return denied;

    // Fetch building & latest IM document from Supabase (excluding studio project rows)
    let buildingName = 'CRE 빌딩';
    let docBody: Record<string, any> = {};
    let brokerInfo: Record<string, any> | undefined;

    try {
      const supabase = createServiceClient();
      const { data: docs } = await supabase
        .from('document_objects')
        .select('id, title, body, building_id, broker_id, owner_id, document_type')
        .or(`building_id.eq.${buildingId},id.eq.${buildingId}`)
        .in('document_type', ['mobile_im', 'im_lite', 'im_lite_draft', 'blind_teaser'])
        .order('created_at', { ascending: false })
        .limit(10);

      // Pick the latest real IM document (not a PptxProject snapshot)
      const realDoc = (docs || []).find(
        (d: any) => d?.body && !Array.isArray(d.body.slides)
      );

      const { data: bldg } = await supabase
        .from('building_ssot_lite')
        .select('*')
        .eq('id', realDoc?.building_id || buildingId)
        .maybeSingle();

      if (realDoc) {
        buildingName = realDoc.title || bldg?.building_name || bldg?.raw_address || buildingName;
        docBody = (realDoc.body as Record<string, any>) || {};
      } else if (bldg) {
        buildingName = bldg.building_name || bldg.raw_address || buildingName;
        docBody = {
          ssot_summary: {
            building_name: bldg.building_name,
            address: bldg.road_address || bldg.raw_address,
            jibun_address: bldg.jibun_address,
            asking_price_manwon: bldg.asking_price_manwon || bldg.price_manwon,
            land_area_sqm: bldg.land_area_sqm,
            total_gross_area_sqm: bldg.total_area_sqm || bldg.gross_area_sqm,
            floors_above: bldg.floors_above,
            floors_below: bldg.floors_below,
            completion_year: bldg.built_year || bldg.completion_year,
            zoning: bldg.zoning,
            bcr_pct: bldg.bcr_pct,
            far_pct: bldg.far_pct,
            parking_count: bldg.parking_count,
            elevator_count: bldg.elevator_count,
            asset_type: bldg.asset_type,
            area_signal: bldg.area_signal,
            price_band: bldg.price_band,
          },
        };
      }

      const ownerId = realDoc?.broker_id ?? realDoc?.owner_id ?? bldg?.owner_id ?? (brokerId !== 'broker-system' ? brokerId : undefined);
      if (ownerId) {
        const { fetchBrokerContact, toPptxBrokerInput } = await import('@/domain/broker/broker-contact');
        brokerInfo = toPptxBrokerInput(await fetchBrokerContact(supabase, ownerId)) ?? undefined;
      }
    } catch (err) {
      console.warn('[basic-im-studio] Failed to fetch building data:', err);
    }

    if (preset && typeof preset === 'string') {
      docBody = { ...docBody, preset };
    }

    // Check for existing project and enrich it with latest docBody
    const existing = await studioService.findProjectByDealId(buildingId);
    if (existing && existing.themeId === 'credeal_basic') {
      const enriched = await studioService.enrichProjectFromDocBody(existing, docBody, buildingName, brokerInfo);
      if (preset && typeof preset === 'string' && preset !== enriched.visualPreset) {
        await studioService.updateProjectTheme(enriched.id, { visualPreset: preset });
      }
      return NextResponse.json({ ok: true, project: enriched, isExisting: true });
    }

    const project = await studioService.createBasicImProject(buildingId, buildingName, docBody, brokerInfo);
    return NextResponse.json({ ok: true, project, isExisting: false }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'Failed to initialize Basic IM studio' },
      { status: 500 }
    );
  }
}
