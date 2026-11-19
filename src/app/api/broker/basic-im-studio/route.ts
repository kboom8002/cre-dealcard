import { NextRequest, NextResponse } from 'next/server';
import { requireBroker, type AuthGuardResult } from '@/lib/auth-guard';
import { studioService } from '@/domain/building/pptx-studio/studio-service';
import { createServiceClient } from '@/lib/supabase/service';
import { assertStudioDealOwner } from '@/lib/authz/studio-owner';
import { getWorkspaceItemByAnyId } from '@/lib/workspace/workspace-repository';
import { isUuid } from '@/lib/im-lite/quick-generate-store';

const SAFE_DEAL_ID_RE = /^[A-Za-z0-9_.-]{1,128}$/;

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
    const body = await req.json();
    const rawBuildingId = body?.buildingId;
    const preset = body?.preset;
    if (!rawBuildingId || typeof rawBuildingId !== 'string') {
      return NextResponse.json({ ok: false, error: 'buildingId is required' }, { status: 400 });
    }
    const cleanBuildingId = rawBuildingId.trim();
    if (!SAFE_DEAL_ID_RE.test(cleanBuildingId)) {
      return NextResponse.json(
        { ok: false, code: 'INVALID_BUILDING_ID', error: '유효하지 않은 매물 식별자입니다.' },
        { status: 400 }
      );
    }

    // P0-SEC: 매물(또는 원본 IM 문서) 소유자만 Basic IM 스튜디오 프로젝트 생성·조회 가능
    const denied = await assertStudioDealOwner(studioGuard, cleanBuildingId);
    if (denied) return denied;

    const ownerScopeId =
      studioGuard?.role === 'admin'
        ? undefined
        : brokerId !== 'broker-system'
        ? brokerId
        : undefined;
    const persistedOwnerId = brokerId !== 'broker-system' ? brokerId : undefined;

    // Fetch building & latest IM document from Supabase (excluding studio project rows)
    let buildingName = 'CRE 빌딩';
    let docBody: Record<string, any> = {};
    let brokerInfo: Record<string, any> | undefined;

    try {
      const supabase = createServiceClient();

      // 1) Owner-scoped canonical workspace_items lookup (branches safely on isUuid vs eq('legacy_id', ...))
      const wsItem = await getWorkspaceItemByAnyId(
        supabase,
        cleanBuildingId,
        'im',
        ownerScopeId
      ).catch(() => null);

      const resolvedUuid = isUuid(cleanBuildingId)
        ? cleanBuildingId
        : wsItem?.buildingId && isUuid(wsItem.buildingId)
        ? wsItem.buildingId
        : null;

      let realDoc: any = null;
      if (resolvedUuid) {
        const byBuildingRes = await supabase
          .from('document_objects')
          .select('id, title, body, building_id, broker_id, owner_id, document_type')
          .eq('building_id', resolvedUuid)
          .in('document_type', ['mobile_im', 'im_lite', 'im_lite_draft', 'blind_teaser'])
          .order('created_at', { ascending: false })
          .limit(3);
        let docs = Array.isArray(byBuildingRes?.data) ? byBuildingRes.data : [];
        if (docs.length === 0) {
          const byIdRes = await supabase
            .from('document_objects')
            .select('id, title, body, building_id, broker_id, owner_id, document_type')
            .eq('id', resolvedUuid)
            .in('document_type', ['mobile_im', 'im_lite', 'im_lite_draft', 'blind_teaser'])
            .limit(1);
          docs = Array.isArray(byIdRes?.data) ? byIdRes.data : [];
        }
        realDoc = docs.find((d: any) => d?.body && !Array.isArray(d.body.slides)) || null;
      }

      const targetSsotId =
        realDoc?.building_id && isUuid(String(realDoc.building_id))
          ? String(realDoc.building_id)
          : resolvedUuid;
      let bldg: Record<string, any> | null = null;
      if (targetSsotId) {
        const { data: bldgRow } = await supabase
          .from('building_ssot_lite')
          .select('id, owner_id, raw_address, area_signal, asset_type, price_band, vacancy_signal, layers')
          .eq('id', targetSsotId)
          .maybeSingle();
        bldg = (bldgRow as Record<string, any> | null) ?? null;
      }

      const layers = (bldg?.layers && typeof bldg.layers === 'object' ? bldg.layers : {}) as Record<string, any>;
      const locLayer = (layers.location && typeof layers.location === 'object' ? layers.location : {}) as Record<string, any>;
      const physLayer = (layers.physical && typeof layers.physical === 'object' ? layers.physical : {}) as Record<string, any>;
      const leaseLayer = (layers.lease_summary && typeof layers.lease_summary === 'object' ? layers.lease_summary : {}) as Record<string, any>;

      const wsDraft =
        wsItem?.draftPayload && typeof wsItem.draftPayload === 'object'
          ? (wsItem.draftPayload as Record<string, any>)
          : wsItem?.publishedSnapshot && typeof wsItem.publishedSnapshot === 'object'
          ? (wsItem.publishedSnapshot as Record<string, any>)
          : null;

      if (realDoc) {
        buildingName =
          wsItem?.title ||
          realDoc.title ||
          locLayer.building_name ||
          bldg?.raw_address ||
          buildingName;
        docBody = {
          ...((realDoc.body as Record<string, any>) || {}),
          ...(wsDraft?.studioOverrides ? { studioOverrides: wsDraft.studioOverrides } : {}),
        };
      } else if (wsDraft && Object.keys(wsDraft).length > 0) {
        buildingName = wsItem?.title || String(wsDraft.title || wsDraft.buildingName || bldg?.raw_address || buildingName);
        docBody = {
          ...wsDraft,
          ssot_summary: {
            address: wsItem?.address || locLayer.address || bldg?.raw_address || wsDraft.address || '',
            asking_price_manwon:
              Number(wsDraft.askingPriceManwon ?? leaseLayer.asking_price_manwon ?? 0) || undefined,
            land_area_sqm: Number(wsDraft.landAreaSqm ?? physLayer.land_area_sqm ?? 0) || undefined,
            total_gross_area_sqm:
              Number(wsDraft.gfaSqm ?? physLayer.total_floor_area_sqm ?? 0) || undefined,
            zoning: wsDraft.zoning || physLayer.zoning || undefined,
            total_deposit_manwon:
              Number(wsDraft.totalDepositManwon ?? leaseLayer.total_deposit_manwon ?? 0) || undefined,
            monthly_rent_total_krw:
              Number(leaseLayer.monthly_rent_total_krw ?? 0) ||
              (Number(wsDraft.monthlyRentTotalManwon) > 0
                ? Number(wsDraft.monthlyRentTotalManwon) * 10000
                : undefined),
            vacancy_pct: wsDraft.vacancyPct ?? leaseLayer.vacancy_pct,
            area_signal: bldg?.area_signal,
            asset_type: bldg?.asset_type,
            price_band: wsItem?.priceBand || bldg?.price_band,
            ...(wsDraft.ssot_summary && typeof wsDraft.ssot_summary === 'object'
              ? wsDraft.ssot_summary
              : {}),
          },
        };
      } else if (bldg) {
        buildingName = locLayer.building_name || bldg.raw_address || buildingName;
        docBody = {
          coordinates: layers.coordinates || undefined,
          ssot_summary: {
            building_name: locLayer.building_name || bldg.raw_address,
            address: locLayer.address || locLayer.raw_address || bldg.raw_address,
            pnu: locLayer.pnu || locLayer.canonical_pnu,
            asking_price_manwon: leaseLayer.asking_price_manwon,
            total_deposit_manwon: leaseLayer.total_deposit_manwon,
            monthly_rent_total_krw: leaseLayer.monthly_rent_total_krw,
            vacancy_pct: leaseLayer.vacancy_pct,
            vacancy_signal: bldg.vacancy_signal,
            land_area_sqm: physLayer.land_area_sqm,
            total_gross_area_sqm: physLayer.total_floor_area_sqm,
            floors_above: physLayer.floors_above,
            floors_below: physLayer.floors_below,
            completion_date: physLayer.completion_date,
            zoning: physLayer.zoning,
            bcr_pct: physLayer.bcr_pct,
            far_pct: physLayer.far_pct,
            parking_count: physLayer.parking_count,
            elevator_count: physLayer.elevator_count,
            asset_type: bldg.asset_type,
            area_signal: bldg.area_signal,
            price_band: bldg.price_band,
          },
        };
      } else {
        const { resolveOrSynthesizeQuickImRecord } = await import('@/lib/im-lite/quick-generate-store');
        const synth = await resolveOrSynthesizeQuickImRecord(
          cleanBuildingId,
          supabase,
          null,
          { ownerId: ownerScopeId }
        );
        if (synth) {
          buildingName = synth.buildingName || buildingName;
          docBody = synth.fullDocBody || {};
        }
      }

      const ownerId =
        realDoc?.broker_id ??
        realDoc?.owner_id ??
        wsItem?.ownerId ??
        bldg?.owner_id ??
        persistedOwnerId;
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
    const existing = await studioService.findProjectByDealId(cleanBuildingId, ownerScopeId);
    if (existing && existing.themeId === 'credeal_basic') {
      const enriched = await studioService.enrichProjectFromDocBody(
        existing,
        docBody,
        buildingName,
        brokerInfo,
        persistedOwnerId
      );
      if (preset && typeof preset === 'string' && preset !== enriched.visualPreset) {
        await studioService.updateProjectTheme(
          enriched.id,
          { visualPreset: preset },
          undefined,
          persistedOwnerId
        );
      }
      return NextResponse.json({ ok: true, project: enriched, isExisting: true });
    }

    const project = await studioService.createBasicImProject(
      cleanBuildingId,
      buildingName,
      docBody,
      brokerInfo,
      persistedOwnerId
    );
    return NextResponse.json({ ok: true, project, isExisting: false }, { status: 201 });
  } catch (err: any) {
    console.error('[basic-im-studio] POST failed:', err);
    return NextResponse.json(
      { ok: false, error: 'Basic IM 스튜디오를 초기화하지 못했습니다.' },
      { status: 500 }
    );
  }
}
