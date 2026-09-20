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

  const { id: projectId } = await params;

  try {
    let project;
    try {
      project = studioService.getProject(projectId);
    } catch {
      project = studioService.findProjectByDealId(projectId);
    }

    if (!project) {
      return NextResponse.json(
        { ok: false, error: `Project ${projectId} not found` },
        { status: 404 }
      );
    }

    // ── Build merged doc body from slide overrides (deep merge) ──
    const mergedBody: Record<string, any> = {
      preset: 'credeal_basic',
    };
    for (const slide of project.slides.filter(s => !s.hidden)) {
      if (slide.dataKey && slide.slideOverrides && Object.keys(slide.slideOverrides).length > 0) {
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
          .from('buildings')
          .select('*')
          .eq('id', doc.building_id)
          .maybeSingle();
        building = bldg;
      }

      const ownerId = doc?.broker_id ?? doc?.owner_id ?? building?.owner_id;
      if (ownerId) {
        const { data: bp } = await supabase
          .from('broker_profiles')
          .select('display_name, company_name, phone, specialty')
          .eq('user_id', ownerId)
          .maybeSingle();
        broker = bp;
      }
    } catch (err) {
      console.warn('[pptx-studio/download] DB lookup failed, proceeding with overrides only:', err);
    }

    const body = doc?.body ?? {};
    const fullBody: Record<string, any> = { ...body, ...mergedBody };

    // ── Determine posture & grade ──
    const posture = body.investment_posture
      ?? body.investmentPosture
      ?? body.posture
      ?? body.identity?.investmentPosture
      ?? body.ssot_summary?.investment_posture
      ?? building?.investment_posture
      ?? 'income';

    let grade = body.dataGrade ?? body.dataCompleteness?.qualityGrade ?? body.grade ?? 'B';

    // ── Rule 44 Compliance: Delegate to MobileImPptxRenderer ──
    const { MobileImPptxRenderer } = await import(
      '@/domain/building/mobile-im/pptx/pptx-renderer'
    );
    const renderer = new MobileImPptxRenderer();

    const result = await renderer.render({
      buildingId: project.dealId,
      preset: (body.preset as any) || 'credeal_basic',
      posture,
      grade,
      incomeArchetype: body.incomeArchetype ?? undefined,
      hasViolation: body.hasViolation ?? body.violationStatus === 'exists',
      hasJointCollateral: body.hasJointCollateral ?? false,
      releaseTier: 'basic' as ReleaseTier,
      docno: body.docno ?? `IM-${project.dealId.substring(0, 6).toUpperCase()}`,
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

    const safeTitle = (project.title || 'IM_Presentation').replace(/[^a-zA-Z0-9\u3131-\u318E\u3200-\u321E\uAC00-\uD7A3]/g, '_');
    const filename = `${safeTitle}_official.pptx`;

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-cache',
        'X-Slide-Count': String(result.slideCount),
        'X-Project-Stage': project.stage,
        'X-File-Size': String(result.fileSizeBytes),
      },
    });
  } catch (err: any) {
    console.error('[pptx-studio/download] Generation failed:', err);
    return NextResponse.json(
      { ok: false, error: err.message || 'Failed to generate PPTX download' },
      { status: 500 }
    );
  }
}
