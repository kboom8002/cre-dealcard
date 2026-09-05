import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import type { MobileIMSection } from '@/domain/building/mobile-im/types';
import { computeTargetHash } from '@/domain/building/im-core';
import { studioService } from '@/domain/building/pptx-studio/studio-service';
import { InvalidationEngine } from '@/platform/im-pipeline/regeneration/invalidation-engine';
import { broadcastDealcardMutation } from '@/platform/im-pipeline/realtime/dealcard-sync-channel';


// D37 H-3: 섹션 저장 시 수치 검증 유틸
function validateSectionClaims(
  sections: MobileIMSection[],
  ssotSummary?: Record<string, any>,
): string[] {
  const warnings: string[] = [];
  if (!ssotSummary) return warnings;

  for (const sec of sections) {
    const md = (sec as any).markdown as string || '';

    // 가격 불일치 검증
    if (sec.section_type === 'property_overview' && ssotSummary.asking_price) {
      const priceStr = String(ssotSummary.asking_price);
      // 가격이 마크다운에 전혀 없으면 경고
      if (priceStr.length >= 3 && !md.includes(priceStr) && !md.includes(Number(priceStr).toLocaleString())) {
        warnings.push(`[${sec.section_type}] 매매 희망가(${priceStr})가 본문에 불일치할 수 있습니다.`);
      }
    }

    // 면적 불일치 검증
    if (sec.section_type === 'property_overview' && ssotSummary.total_area) {
      const areaStr = String(ssotSummary.total_area);
      if (areaStr.length >= 3 && !md.includes(areaStr) && !md.includes(Number(areaStr).toLocaleString())) {
        warnings.push(`[${sec.section_type}] 연면적(${areaStr})이 본문에 불일치할 수 있습니다.`);
      }
    }
  }
  return warnings;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const { id } = await params;
  if (process.env.DEPRECATE_LEGACY_WRITES === 'true' || req.headers.get('x-enforce-modern-pipeline') === 'true') {
    return NextResponse.json(
      {
        error: 'LEGACY_WRITE_DEPRECATED',
        message: '구형 섹션 직접 저장 API(save-sections)는 폐기(410 Gone)되었습니다. IM CORE v1 및 Mobile Composer API를 사용하십시오.',
      },
      { status: 410 }
    );
  }
  let sections: MobileIMSection[];
  let newTitle: string | undefined;
  let hiddenSections: string[] | undefined;
  let photos: Array<{ url: string; caption?: string; order?: number }> | undefined;
  let ogTitle: string | undefined;
  let ogDescription: string | undefined;
  let heroTitle: string | undefined;
  let heroSubtitle: string | undefined;
  let keyInvestmentPoint: string | undefined;

  try {
    const body = await req.json();
    sections = body.sections;
    newTitle = body.title;
    hiddenSections = body.hidden_sections;
    photos = body.photos;
    ogTitle = body.ogTitle;
    ogDescription = body.ogDescription;
    heroTitle = body.heroTitle;
    heroSubtitle = body.heroSubtitle;
    keyInvestmentPoint = body.keyInvestmentPoint;
    if (!sections || !Array.isArray(sections)) {
      return NextResponse.json({ error: "Invalid 'sections' payload" }, { status: 400 });
    }

    for (const sec of sections) {
      if (!sec.section_type || typeof (sec as any).markdown !== 'string') {
        return NextResponse.json({ error: "Invalid section structure" }, { status: 400 });
      }
      let markdown = (sec as any).markdown;
      markdown = markdown.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      markdown = markdown.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
      markdown = markdown.replace(/(\s)on[a-z]+\s*=\s*(['"])(?:(?!\2).)*\2/gi, '$1');
      markdown = markdown.replace(/(\s)on[a-z]+\s*=\s*[^>\s]+/gi, '$1');
      markdown = markdown.replace(/href\s*=\s*(['"])javascript:[^'"]*\1/gi, 'href="#"');
      markdown = markdown.replace(/src\s*=\s*(['"])javascript:[^'"]*\1/gi, 'src=""');
      (sec as any).markdown = markdown;
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: doc, error: fetchErr } = await supabase
    .from('document_objects')
    .select('id, owner_id, broker_id, body, status, building_id')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const ownerId = doc.broker_id ?? doc.owner_id;
  if (ownerId !== guard.user!.id) {
    return NextResponse.json({ error: 'Forbidden: not your document' }, { status: 403 });
  }

  if (doc.status === 'published') {
    return NextResponse.json({ error: 'Cannot edit a published document' }, { status: 400 });
  }

  const content = (doc.body as Record<string, unknown>) || {};
  
  const updatedContent: Record<string, any> = {
    ...content,
    sections: sections,
    ...(newTitle ? { title: newTitle } : {}),
    ...(hiddenSections !== undefined ? { hidden_sections: hiddenSections } : {}),
    ...(photos !== undefined ? { photos } : {}),
    ...(ogTitle !== undefined ? { ogTitle } : {}),
    ...(ogDescription !== undefined ? { ogDescription } : {}),
    ...(heroTitle !== undefined ? { heroTitle } : {}),
    ...(heroSubtitle !== undefined ? { heroSubtitle } : {}),
    ...(keyInvestmentPoint !== undefined ? { heroCard: { ...((content as Record<string, any>).heroCard || {}), keyInvestmentPoint } } : {}),
  };

  // Compute deterministic SHA-256 target hash
  const tier = updatedContent.releaseTier ?? 'fact_om';
  const newTargetHash = computeTargetHash({
    body: updatedContent,
    releaseTier: tier,
    policyVersion: '2026-08-31',
  });
  updatedContent.targetHash = newTargetHash;
  updatedContent.approval_target_hash = newTargetHash;

  const existingSections = (content.sections as any[]) || [];
  
  for (const section of sections) {
    const prev = existingSections.find((s: any) => s.section_type === section.section_type);
    if (prev && typeof prev.markdown === 'string' && prev.markdown !== section.markdown) {
      const prevLen = prev.markdown.length;
      const currLen = section.markdown.length;
      const maxLen = Math.max(prevLen, currLen);
      let diffRatio = 0;
      if (maxLen > 0) {
        let diffCount = Math.abs(prevLen - currLen);
        const minLen = Math.min(prevLen, currLen);
        for (let i = 0; i < minLen; i++) {
          if (prev.markdown[i] !== section.markdown[i]) diffCount++;
        }
        diffRatio = Math.min(diffCount / maxLen, 1);
      }
      
      await supabase.from('im_edit_diffs').insert({
        document_id: id,
        section_type: section.section_type,
        original_markdown: prev.markdown,
        edited_markdown: section.markdown,
        broker_id: guard.user!.id,
        diff_ratio: diffRatio,
      });
    }
  }

  const { error: updateErr } = await supabase
    .from('document_objects')
    .update({
      ...(newTitle ? { title: newTitle } : {}),
      body: updatedContent,
      approval_target_hash: newTargetHash,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Forward sync to PPTX Studio project if exists
  const buildingId = (doc as any).building_id || id;
  try {
    const pptxProject =
      studioService.findProjectByDealId(buildingId) ||
      studioService.findProjectByDealId(id);

    if (pptxProject) {
      if (newTitle) {
        pptxProject.title = newTitle;
        const cover = pptxProject.slides.find(
          (s) => s.layoutType?.includes('A01') || s.dataKey === 'cover'
        );
        if (cover) {
          studioService.patchSlideOverrides(pptxProject.id, cover.id, { title: newTitle });
        }
      }
      if (heroTitle || heroSubtitle) {
        const overview = pptxProject.slides.find(
          (s) => s.layoutType?.includes('A02') || s.dataKey === 'overview'
        );
        if (overview) {
          studioService.patchSlideOverrides(pptxProject.id, overview.id, {
            title: heroTitle || overview.title,
            kicker: heroSubtitle || overview.kicker,
          });
        }
      }
    }
  } catch (syncErr) {
    console.warn('[save-sections] Forward sync to PPTX Studio failed (non-blocking):', syncErr);
  }

  // Broadcast mutation via Realtime Channel
  try {
    const invalidationEngine = new InvalidationEngine();
    const scope = invalidationEngine.resolveScope('copy_text_changed');
    await broadcastDealcardMutation(supabase, {
      buildingId,
      documentId: id,
      targetHash: newTargetHash,
      changeKind: 'copy_text_changed',
      invalidatedChannels: scope.invalidatedChannels,
      timestamp: new Date().toISOString(),
      updatedBy: guard.user!.id,
    });
  } catch (broadcastErr) {
    console.warn('[save-sections] Broadcast failed (non-blocking):', broadcastErr);
  }

  // D37 H-3: Claim 수치 검증 (non-blocking warnings)
  const ssotSummary = (content as Record<string, any>).ssot_summary;
  const claimWarnings = validateSectionClaims(sections, ssotSummary);

  return NextResponse.json({
    ok: true,
    message: '섹션이 성공적으로 저장되었습니다.',
    targetHash: newTargetHash,
    ...(claimWarnings.length > 0 ? { warnings: claimWarnings } : {}),
  });
}

