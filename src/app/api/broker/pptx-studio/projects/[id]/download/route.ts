import { NextRequest, NextResponse } from 'next/server';
import { requireBroker, type AuthGuardResult } from '@/lib/auth-guard';
import { assertStudioDealOwner } from '@/lib/authz/studio-owner';
import { studioService } from '@/domain/building/pptx-studio/studio-service';
import { createServiceClient } from '@/lib/supabase/service';
import { createModuleLogger } from '@/lib/logger';
import type { ReleaseTier } from '@/domain/building/im-core/release-tier';

export const maxDuration = 300;

const log = createModuleLogger('pptx-studio-download');

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const PREFERRED_DOC_TYPES = new Set([
  'mobile_im',
  'im_lite',
  'im_pro',
  'im_lite_draft',
  'blind_teaser',
]);

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

  const { id: projectId } = await params;
  const searchParams = req.nextUrl.searchParams;
  const queryVisualPreset = searchParams.get('visualPreset') || searchParams.get('preset') || undefined;
  const queryBrandAccent = searchParams.get('brandAccent') || undefined;
  const queryCoverStyle = searchParams.get('coverStyle') || undefined;
  const queryLayoutStyle = searchParams.get('layoutStyle') || undefined;
  const queryHeaderFooterRaw = searchParams.get('headerFooter') || undefined;
  let queryHeaderFooter: Record<string, any> | undefined;
  if (queryHeaderFooterRaw) {
    try {
      const parsed = JSON.parse(queryHeaderFooterRaw);
      if (parsed && typeof parsed === 'object') queryHeaderFooter = parsed;
    } catch {
      // ignore invalid query JSON
    }
  }

  try {
    let project;
    try {
      project = await studioService.getProject(projectId);
    } catch {
      project = await studioService.findProjectByDealId(projectId);
    }

    if (!project) {
      return NextResponse.json(
        { ok: false, error: `Project ${projectId} not found` },
        { status: 404 }
      );
    }

    // P0-SEC: 프로젝트 소유권 = dealId(매물/원본 문서) 소유권. 소유자·admin 만 접근.
    const denied = await assertStudioDealOwner(studioGuard, project.dealId);
    if (denied) return denied;

    // ── Collect Studio Slide Overrides, Hidden Slides, Slide Order, and Theme/HeaderFooter ──
    const mergedBody: Record<string, any> = {
      preset: 'credeal_basic',
    };
    const studioSlideOverrides: Record<string, Record<string, any>> = {};
    const studioInitialOverrides: Record<string, Record<string, any>> = {};
    const studioSlideTitles: Record<string, { title?: string; kicker?: string; layoutType?: string }> = {};
    const studioHiddenDataKeys: string[] = [];
    const studioSlideOrder: string[] = [];

    for (const slide of project.slides || []) {
      if (!slide) continue;
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
        if (!slide.hidden) {
          mergedBody[dk] = {
            ...(mergedBody[dk] ?? {}),
            ...slide.slideOverrides,
          };
        }
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
      const docQuery = supabase
        .from('document_objects')
        .select('id, title, body, building_id, broker_id, owner_id, document_type')
        .or(`building_id.eq.${project.dealId},id.eq.${project.dealId}`)
        .order('created_at', { ascending: false })
        .limit(10);

      let docCandidates: Array<Record<string, any>> = [];
      if (docQuery && typeof (docQuery as any).then === 'function') {
        const { data: docRows } = await (docQuery as any);
        if (Array.isArray(docRows)) {
          docCandidates = docRows;
        } else if (docRows && typeof docRows === 'object') {
          docCandidates = [docRows];
        }
      } else if (docQuery && typeof (docQuery as any).maybeSingle === 'function') {
        const { data: docRow } = await docQuery.maybeSingle();
        if (docRow) docCandidates = [docRow];
      }

      // Exclude Studio project rows (which have body.slides array) and prefer real IM document types
      const nonStudioRows = docCandidates.filter(
        (r) => r && !Array.isArray(r.body?.slides)
      );
      doc =
        nonStudioRows.find((r) => PREFERRED_DOC_TYPES.has(String(r.document_type || ''))) ??
        nonStudioRows[0] ??
        null;

      const targetBuildingId = doc?.building_id || (isUuid(project.dealId) ? project.dealId : null);
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
      log.warn({ err, dealId: project.dealId }, '[pptx-studio/download] DB lookup failed, proceeding with overrides only');
    }

    const body = doc?.body ?? project.buildingContext ?? {};

    // ── Determine posture & grade ──
    const posture = body.investment_posture
      ?? body.investmentPosture
      ?? body.posture
      ?? body.identity?.investmentPosture
      ?? body.ssot_summary?.investment_posture
      ?? building?.investment_posture
      ?? 'income';

    const grade = body.dataGrade ?? body.dataCompleteness?.qualityGrade ?? body.grade ?? 'B';

    if (grade === 'D') {
      return NextResponse.json(
        {
          ok: false,
          code: 'INSUFFICIENT_DATA_GRADE_D',
          error: '데이터 등급 D 매물은 PPTX 생성이 제한됩니다.',
        },
        { status: 422 }
      );
    }

    const effectiveVisualPreset = queryVisualPreset || project.visualPreset || (body.preset as string) || 'credeal_basic';
    const effectiveBrandAccent = queryBrandAccent || project.brandAccent || undefined;
    const coverLayoutType = studioSlideTitles['cover']?.layoutType;
    const rawCoverStyle = (queryCoverStyle || project.coverStyle) as any;
    const effectiveCoverStyle =
      (!rawCoverStyle || rawCoverStyle === 'institutional_masses') && coverLayoutType === 'A01_SPLIT'
        ? 'split'
        : (!rawCoverStyle || rawCoverStyle === 'institutional_masses') && coverLayoutType === 'A01_HERO'
        ? 'hero_dark'
        : rawCoverStyle;
    const effectiveLayoutStyle = (queryLayoutStyle || project.layoutStyle) as any;
    const effectiveHeaderFooter = queryHeaderFooter
      ? { ...(project.headerFooter ?? {}), ...queryHeaderFooter }
      : (project.headerFooter ?? null);

    const fullBody: Record<string, any> = {
      ...body,
      ...mergedBody,
      preset: (body.preset as string) || 'credeal_basic',
      _studioSlideOverrides: studioSlideOverrides,
      ...(Object.keys(studioInitialOverrides).length > 0
        ? { _studioInitialOverrides: studioInitialOverrides }
        : {}),
      _studioSlideTitles: studioSlideTitles,
      _studioHiddenDataKeys: studioHiddenDataKeys,
      _studioSlideOrder: studioSlideOrder,
      ...(effectiveHeaderFooter ? { _studioHeaderFooter: effectiveHeaderFooter } : {}),
      _studioThemeOverrides: {
        visualPreset: effectiveVisualPreset,
        brandAccent: effectiveBrandAccent,
        coverStyle: effectiveCoverStyle,
        layoutStyle: effectiveLayoutStyle,
      },
    };

    // ── Rule 44 Compliance: Delegate to MobileImPptxRenderer ──
    const { MobileImPptxRenderer } = await import(
      '@/domain/building/mobile-im/pptx/pptx-renderer'
    );
    const renderer = new MobileImPptxRenderer();

    const coverOv = studioSlideOverrides['cover'] || {};
    const coverTitle = String(coverOv.title || project.title || doc?.title || 'Basic IM');

    const result = await renderer.render({
      buildingId: project.dealId,
      preset: (body.preset as any) || 'credeal_basic',
      visualPreset: effectiveVisualPreset,
      brandAccent: effectiveBrandAccent,
      logoUrl: effectiveHeaderFooter?.logoUrl || undefined,
      posture,
      grade,
      incomeArchetype: body.incomeArchetype ?? undefined,
      hasViolation: body.hasViolation ?? body.violationStatus === 'exists',
      hasJointCollateral: body.hasJointCollateral ?? false,
      releaseTier: (body.releaseTier as ReleaseTier) || 'decision_im',
      docno: body.docno ?? `IM-${(project.dealId || 'UNKNOWN').substring(0, 6).toUpperCase()}`,
      doc: {
        title: coverTitle,
        body: fullBody,
        sections: body.sections,
      },
      building: building || undefined,
      broker: broker || undefined,
      provenance: body.provenance ?? {},
      supabase,
    });

    const safeTitle = (project.title || 'IM_Presentation').replace(/[^a-zA-Z0-9\u3131-\u318E\u3200-\u321E\uAC00-\uD7A3]/g, '_');
    const filename = `${safeTitle}_official.pptx`;

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Slide-Count': String(result.slideCount),
        'X-Project-Stage': project.stage,
        'X-File-Size': String(result.fileSizeBytes),
      },
    });
  } catch (err: unknown) {
    log.error({ err, projectId }, '[pptx-studio/download] Generation failed');
    return NextResponse.json(
      { ok: false, error: 'PPTX 파일 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
