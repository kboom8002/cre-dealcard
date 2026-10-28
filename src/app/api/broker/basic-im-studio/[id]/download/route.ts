import { NextRequest, NextResponse } from 'next/server';
import { requireBroker, type AuthGuardResult } from '@/lib/auth-guard';
import { assertStudioDealOwner } from '@/lib/authz/studio-owner';
import { studioService } from '@/domain/building/pptx-studio/studio-service';
import { createServiceClient } from '@/lib/supabase/service';
import type { ReleaseTier } from '@/domain/building/im-core/release-tier';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let studioGuard: AuthGuardResult | null = null;
  if (!(process.env.NODE_ENV === 'test' && req.headers.get('x-test-bypass'))) {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    studioGuard = guard;
  }

  const { id } = await params;
  const searchParams = req.nextUrl.searchParams;
  const queryVisualPreset = searchParams.get('visualPreset') || searchParams.get('preset') || undefined;
  const queryBrandAccent = searchParams.get('brandAccent') || undefined;
  const queryCoverStyle = searchParams.get('coverStyle') || undefined;
  const queryLayoutStyle = searchParams.get('layoutStyle') || undefined;

  try {
    let project;
    try { project = await studioService.getProject(id); }
    catch { project = await studioService.findProjectByDealId(id); }

    // P-C4: cold start로 in-memory 유실 시 DB에서 자동 복구
    if (!project) {
      // P0-SEC: 복구(프로젝트 재생성) 전에 대상 dealId 소유권부터 확인
      const deniedRecovery = await assertStudioDealOwner(studioGuard, id.replace(/^basic-/, ''));
      if (deniedRecovery) return deniedRecovery;
      try {
        const actualId = id.replace(/^basic-/, '');
        const recoverySupabase = createServiceClient();
        const { data: recoveryDocs } = await recoverySupabase
          .from('document_objects')
          .select('id, title, body, building_id')
          .or(`building_id.eq.${actualId},id.eq.${actualId}`)
          .in('document_type', ['mobile_im', 'im_lite', 'im_lite_draft', 'blind_teaser'])
          .order('created_at', { ascending: false })
          .limit(10);

        const recoveryDoc = (recoveryDocs || []).find(
          (d: any) => d?.body && !Array.isArray(d.body.slides)
        );
        if (recoveryDoc?.body) {
          project = await studioService.createBasicImProject(actualId, recoveryDoc.title || 'Basic IM', recoveryDoc.body);
          console.warn(`[basic-im-studio/download] P-C4: cold start 복구 후 프로젝트 재생성 (${actualId})`);
        }
      } catch (recoverErr) {
        console.warn('[basic-im-studio/download] P-C4: 복구 실패:', recoverErr);
      }
    }

    if (!project) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }

    // P0-SEC: 프로젝트 소유권 = dealId(매물/원본 문서) 소유권. 소유자·admin 만 접근.
    const denied = await assertStudioDealOwner(studioGuard, project.dealId);
    if (denied) return denied;

    // ── Collect Studio Slide Overrides, Hidden Slides, Slide Order, and Theme/HeaderFooter ──
    const studioSlideOverrides: Record<string, Record<string, any>> = {};
    const studioInitialOverrides: Record<string, Record<string, any>> = {};
    const studioSlideTitles: Record<string, { title?: string; kicker?: string; layoutType?: string }> = {};
    const studioHiddenDataKeys: string[] = [];
    const studioSlideOrder: string[] = [];

    for (const slide of project.slides || []) {
      const dk = slide.dataKey || '';
      if (!dk) continue;
      if (slide.hidden && dk !== 'cover' && dk !== 'closing') {
        studioHiddenDataKeys.push(dk);
      } else {
        studioSlideOrder.push(dk);
      }
      if (slide.slideOverrides && Object.keys(slide.slideOverrides).length > 0) {
        studioSlideOverrides[dk] = {
          ...(studioSlideOverrides[dk] ?? {}),
          ...slide.slideOverrides,
        };
      }
      if (slide.initialOverrides && Object.keys(slide.initialOverrides).length > 0) {
        studioInitialOverrides[dk] = {
          ...(studioInitialOverrides[dk] ?? {}),
          ...slide.initialOverrides,
        };
      }
      studioSlideTitles[dk] = {
        title: slide.title,
        kicker: slide.kicker,
        layoutType: slide.layoutType,
      };
    }

    // ── Fetch building data from Supabase for enrichment ──
    const supabase = createServiceClient();
    let doc: Record<string, any> | null = null;
    let building: Record<string, any> | null = null;
    let broker: Record<string, any> | null = null;

    try {
      const { data: docRows } = await supabase
        .from('document_objects')
        .select('id, title, body, building_id, broker_id, owner_id, document_type')
        .or(`building_id.eq.${project.dealId},id.eq.${project.dealId}`)
        .in('document_type', ['mobile_im', 'im_lite', 'im_lite_draft', 'blind_teaser'])
        .order('created_at', { ascending: false })
        .limit(10);

      // Select the latest real IM document (not a PptxProject row)
      doc = (docRows || []).find((r: any) => r?.body && !Array.isArray(r.body.slides)) ?? null;

      const targetBuildingId = doc?.building_id || project.dealId;
      if (targetBuildingId) {
        const { data: bldg } = await supabase
          .from('building_ssot_lite')
          .select('*')
          .eq('id', targetBuildingId)
          .maybeSingle();
        building = bldg;
      }

      const ownerId = doc?.broker_id ?? doc?.owner_id ?? building?.owner_id;
      const { fetchBrokerContact, toPptxBrokerInput } = await import('@/domain/broker/broker-contact');
      broker = toPptxBrokerInput(await fetchBrokerContact(supabase, ownerId)) ?? null;
    } catch (err) {
      console.warn('[basic-im-studio/download] DB lookup failed, proceeding with overrides only:', err);
    }

    const baseBody = doc?.body ?? project.buildingContext ?? {};

    // Apply closing/cover broker overrides to broker object if specified in Studio
    const closingOv = studioSlideOverrides['closing'] || {};
    const coverOv = studioSlideOverrides['cover'] || {};
    const effectiveCompanyName =
      project.headerFooter?.companyName ||
      closingOv.brokerCompany ||
      coverOv.brokerCompany ||
      broker?.company_name;

    const effectiveBroker = {
      ...(broker || {}),
      company_name: effectiveCompanyName || broker?.company_name || 'CRE DEAL 파트너스 중개법인',
      display_name: closingOv.brokerName || coverOv.brokerName || broker?.display_name || '',
      phone: closingOv.brokerPhone || coverOv.brokerPhone || broker?.phone || '',
      email: closingOv.brokerEmail || broker?.email || '',
      registration_no: closingOv.brokerRegNo || broker?.registration_no || '',
    };

    const effectiveVisualPreset = queryVisualPreset || project.visualPreset || 'credeal_basic';
    const effectiveBrandAccent = queryBrandAccent || project.brandAccent || undefined;
    const effectiveCoverStyle = (queryCoverStyle || project.coverStyle) as any;
    const effectiveLayoutStyle = (queryLayoutStyle || project.layoutStyle) as any;

    const fullBody: Record<string, any> = {
      ...baseBody,
      ...studioSlideOverrides,
      preset: 'credeal_basic',
      _studioSlideOverrides: studioSlideOverrides,
      _studioInitialOverrides: studioInitialOverrides,
      _studioSlideTitles: studioSlideTitles,
      _studioHiddenDataKeys: studioHiddenDataKeys,
      _studioSlideOrder: studioSlideOrder,
      _studioHeaderFooter: project.headerFooter ?? null,
      _studioThemeOverrides: {
        visualPreset: effectiveVisualPreset,
        brandAccent: effectiveBrandAccent,
        coverStyle: effectiveCoverStyle,
        layoutStyle: effectiveLayoutStyle,
      },
    };

    // If user added/edited comps in Studio and un-hid the comps slide, ensure manual_comps is populated
    if (
      Array.isArray(studioSlideOverrides['comps']?.compsRows) &&
      studioSlideOverrides['comps'].compsRows.length > 0 &&
      !studioHiddenDataKeys.includes('comps')
    ) {
      fullBody.manual_comps = studioSlideOverrides['comps'].compsRows;
      fullBody.broker_extras = {
        ...(fullBody.broker_extras || {}),
        market_comps: studioSlideOverrides['comps'].compsRows,
      };
    }

    // Determine posture & grade
    const posture = baseBody.investment_posture
      ?? baseBody.investmentPosture
      ?? baseBody.posture
      ?? baseBody.identity?.investmentPosture
      ?? baseBody.ssot_summary?.investment_posture
      ?? building?.investment_posture
      ?? 'income';

    let grade = baseBody.dataGrade ?? baseBody.dataCompleteness?.qualityGrade ?? baseBody.grade;
    if (!grade) {
      try {
        const { computeDataQualityBadge, tierToGrade } = await import(
          '@/domain/building/mobile-im/data-quality-badge'
        );
        const ssot = baseBody.ssot_summary ?? {};
        const badge = computeDataQualityBadge({
          hasAddress: !!(ssot.address || ssot.raw_address),
          hasPublicData: !!(baseBody.external_data?.buildingRegister || ssot.building_register_source === 'api'),
          hasMonthlyRent: !!(ssot.monthly_rent_total_krw || baseBody.financial?.monthlyRentKrw),
          hasVacancy: ssot.vacancy_pct != null || !!ssot.vacancy_signal,
          hasPhotos: !!(baseBody.photos_v2?.length || baseBody.photos?.length),
          hasAskingPrice: !!(ssot.asking_price_manwon || ssot.price_band),
          hasFloorLeases: !!(baseBody.floor_leases?.length || baseBody.rentRoll?.length),
          hasTotalGrossArea: !!(ssot.total_gross_area_sqm || ssot.size_signal),
          hasLandArea: !!(ssot.land_area_sqm),
        }, posture as any);
        grade = tierToGrade(badge.tier);
      } catch {
        grade = 'B';
      }
    }
    if (grade === 'D') grade = 'C'; // Studio preview/download fallback guard

    const { MobileImPptxRenderer } = await import(
      '@/domain/building/mobile-im/pptx/pptx-renderer'
    );
    const renderer = new MobileImPptxRenderer();

    const coverTitle = coverOv.title || project.title?.replace(/\s*Basic\s*IM$/i, '') || doc?.title || 'Basic IM';

    const result = await renderer.render({
      buildingId: project.dealId,
      preset: 'credeal_basic',
      visualPreset: effectiveVisualPreset,
      brandAccent: effectiveBrandAccent,
      logoUrl: project.headerFooter?.logoUrl || undefined,
      posture,
      grade,
      incomeArchetype: baseBody.incomeArchetype ?? undefined,
      hasViolation: baseBody.hasViolation ?? baseBody.violationStatus === 'exists',
      hasJointCollateral: baseBody.hasJointCollateral ?? false,
      releaseTier: (baseBody.releaseTier as ReleaseTier) || 'decision_im',
      docno: baseBody.docno ?? `IM-${(project.dealId || 'UNKNOWN').substring(0, 6).toUpperCase()}`,
      doc: {
        title: coverTitle,
        body: fullBody,
        sections: baseBody.sections,
      },
      building: building || undefined,
      broker: effectiveBroker,
      provenance: baseBody.provenance ?? {},
      supabase,
    });

    const safeTitle = (coverTitle || 'Basic_IM').replace(/[^a-zA-Z0-9\u3131-\u318E\u3200-\u321E\uAC00-\uD7A3]/g, '_');

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle + '_basic_im.pptx')}`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Slide-Count': String(result.slideCount),
        'X-File-Size': String(result.fileSizeBytes),
        'X-Warnings': encodeURIComponent(JSON.stringify((result.warnings || []).slice(0, 10))),
        'X-Audit-Violations': String(result.auditReport?.totalViolations ?? 0),
      },
    });
  } catch (err: any) {
    console.error('[basic-im-studio/download] Generation failed:', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Failed to generate Basic IM PPTX' },
      { status: 500 }
    );
  }
}
