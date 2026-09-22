import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { studioService } from '@/domain/building/pptx-studio/studio-service';
import { createServiceClient } from '@/lib/supabase/service';
import type { ReleaseTier } from '@/domain/building/im-core/release-tier';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(process.env.NODE_ENV === 'test' && req.headers.get('x-test-bypass'))) {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
  }

  const { id } = await params;
  try {
    let project;
    try { project = studioService.getProject(id); }
    catch { project = studioService.findProjectByDealId(id); }
    
    // P-C4: cold start로 in-memory 유실 시 DB에서 자동 복구
    if (!project) {
      try {
        const actualId = id.replace(/^basic-/, '');
        const recoverySupabase = createServiceClient();
        const { data: recoveryDoc } = await recoverySupabase
          .from('document_objects')
          .select('id, title, body, building_id')
          .or(`building_id.eq.${actualId},id.eq.${actualId}`)
          .in('document_type', ['mobile_im', 'im_lite', 'im_lite_draft', 'blind_teaser'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recoveryDoc?.body) {
          project = studioService.createBasicImProject(actualId, recoveryDoc.title || 'Basic IM', recoveryDoc.body);
          console.warn(`[basic-im-studio/download] P-C4: cold start 복구 후 프로젝트 재생성 (${actualId})`);
        }
      } catch (recoverErr) {
        console.warn('[basic-im-studio/download] P-C4: 복구 실패:', recoverErr);
      }
    }
    
    if (!project) {
      return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
    }

    // ── B1 Fix: Build merged doc body from slide overrides (deep merge) ──
    const mergedBody: Record<string, any> = {
      preset: 'credeal_basic',
    };
    for (const slide of (project.slides || []).filter(s => !s?.hidden)) {
      if (slide.dataKey && Object.keys(slide.slideOverrides || {}).length > 0) {
        mergedBody[slide.dataKey] = {
          ...(mergedBody[slide.dataKey] ?? {}),
          ...slide.slideOverrides,
        };
      }
    }

    // ── Fetch building data from Supabase for enrichment ──
    const supabase = createServiceClient();
    let doc: Record<string, any> | null = null;
    let building: Record<string, any> | null = null;
    let broker: Record<string, any> | null = null;

    try {
      const { data: docRow } = await supabase
        .from('document_objects')
        .select('id, title, body, building_id, broker_id, owner_id')
        .or(`building_id.eq.${project.dealId},id.eq.${project.dealId}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      doc = docRow;

      if (doc?.building_id) {
        const { data: bldg } = await supabase
          .from('building_ssot_lite') // W-6: buildings → building_ssot_lite 통일
          .select('*')
          .eq('id', doc.building_id)
          .maybeSingle();
        building = bldg;
      }

      const ownerId = doc?.broker_id ?? doc?.owner_id ?? building?.owner_id;
      if (ownerId) {
        const { data: bp } = await supabase
          .from('profiles')
          .select('display_name, company, phone, broker_profiles(deal_specialty)')
          .eq('id', ownerId)
          .maybeSingle();
        if (bp) {
          broker = {
            ...bp,
            company_name: bp.company,
            specialty: Array.isArray(bp.broker_profiles) ? bp.broker_profiles[0]?.deal_specialty : (bp.broker_profiles as any)?.deal_specialty
          };
        }
      }
    } catch (err) {
      console.warn('[basic-im-studio/download] DB lookup failed, proceeding with overrides only:', err);
    }

    const body = doc?.body ?? {};

    // ── Merge Studio overrides INTO the doc body ──
    // Studio overrides take precedence over auto-generated data
    const fullBody: Record<string, any> = { ...body, ...mergedBody };

    // ── Determine posture & grade ──
    const posture = body.investment_posture
      ?? body.investmentPosture
      ?? body.posture
      ?? body.identity?.investmentPosture
      ?? body.ssot_summary?.investment_posture
      ?? building?.investment_posture
      ?? 'income';

    let grade = body.dataGrade ?? body.dataCompleteness?.qualityGrade ?? body.grade;
    if (!grade) {
      try {
        const { computeDataQualityBadge, tierToGrade } = await import(
          '@/domain/building/mobile-im/data-quality-badge'
        );
        const ssot = body.ssot_summary ?? {};
        const badge = computeDataQualityBadge({
          hasAddress: !!(ssot.address || ssot.raw_address),
          hasPublicData: !!(body.external_data?.buildingRegister || ssot.building_register_source === 'api'),
          hasMonthlyRent: !!(ssot.monthly_rent_total_krw || body.financial?.monthlyRentKrw),
          hasVacancy: ssot.vacancy_pct != null || !!ssot.vacancy_signal,
          hasPhotos: !!(body.photos_v2?.length || body.photos?.length),
          hasAskingPrice: !!(ssot.asking_price_manwon || ssot.price_band),
          hasFloorLeases: !!(body.floor_leases?.length || body.rentRoll?.length),
          hasTotalGrossArea: !!(ssot.total_gross_area_sqm || ssot.size_signal),
          hasLandArea: !!(ssot.land_area_sqm),
        }, posture as any);
        grade = tierToGrade(badge.tier);
      } catch {
        grade = 'B';
      }
    }

    // ── B1 Fix: Use MobileImPptxRenderer (production pipeline) ──
    const { MobileImPptxRenderer } = await import(
      '@/domain/building/mobile-im/pptx/pptx-renderer'
    );
    const renderer = new MobileImPptxRenderer();

    const result = await renderer.render({
      buildingId: project.dealId,
      preset: 'credeal_basic',
      posture,
      grade,
      incomeArchetype: body.incomeArchetype ?? undefined,
      hasViolation: body.hasViolation ?? body.violationStatus === 'exists',
      hasJointCollateral: body.hasJointCollateral ?? false,
      releaseTier: (body.releaseTier as ReleaseTier) || 'decision_im', // W-7: 다른 라우트와 통일
      docno: body.docno ?? `IM-${(project.dealId || 'UNKNOWN').substring(0, 6).toUpperCase()}`,
      doc: {
        title: project.title || doc?.title || 'Basic IM',
        body: fullBody,
        sections: body.sections,
      },
      building: building || undefined,
      broker: broker || undefined,
      provenance: body.provenance ?? {},
      supabase,
    });

    const safeTitle = (project.title || 'Basic_IM').replace(/[^a-zA-Z0-9\u3131-\u318E\u3200-\u321E\uAC00-\uD7A3]/g, '_');

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle + '_basic_im.pptx')}`,
        'Cache-Control': 'no-store',
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
