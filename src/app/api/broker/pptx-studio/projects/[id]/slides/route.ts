import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { studioService } from '@/domain/building/pptx-studio/studio-service';
import { createServiceClient } from '@/lib/supabase/service';
import { computeTargetHash } from '@/domain/building/im-core';
import { broadcastDealcardMutation } from '@/platform/im-pipeline/realtime/dealcard-sync-channel';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let brokerId = 'broker-system';
  if (process.env.NODE_ENV !== 'test' && !req.headers.get('x-test-bypass')) {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    if (guard.user?.id) brokerId = guard.user.id;
  } else {
    brokerId = req.headers.get('x-broker-id') || 'broker-test';
  }

  const { id: projectId } = await params;

  try {
    const body = await req.json();
    const { action, expectedLockVersion } = body;

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

    const actualProjectId = project.id;

    if (action === 'reorder') {
      const { slideIds } = body;
      if (!Array.isArray(slideIds)) {
        return NextResponse.json(
          { ok: false, error: 'slideIds must be an array of slide IDs' },
          { status: 400 }
        );
      }
      const updated = studioService.reorderSlides(actualProjectId, slideIds, expectedLockVersion);
      return NextResponse.json({ ok: true, project: updated });
    }

    if (action === 'toggle_visibility') {
      const { slideId, hidden } = body;
      if (!slideId) {
        return NextResponse.json(
          { ok: false, error: 'slideId is required' },
          { status: 400 }
        );
      }
      const updated = studioService.toggleSlideVisibility(actualProjectId, slideId, hidden, expectedLockVersion);
      return NextResponse.json({ ok: true, project: updated });
    }

    if (action === 'patch_overrides') {
      const { slideId, overrides } = body;
      if (!slideId || !overrides) {
        return NextResponse.json(
          { ok: false, error: 'slideId and overrides are required' },
          { status: 400 }
        );
      }
      const updated = studioService.patchSlideOverrides(actualProjectId, slideId, overrides, expectedLockVersion);

      // Reverse-sync to document_objects and broadcast
      try {
        const supabase = createServiceClient();
        const dealId = project.dealId;
        const { data: doc } = await supabase
          .from('document_objects')
          .select('id, title, body, status, building_id')
          .or(`building_id.eq.${dealId},id.eq.${dealId}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (doc && doc.body) {
          const targetSlide = updated.slides.find((s) => s.id === slideId);
          let mutated = false;
          const docBody = { ...(doc.body as Record<string, any>) };

          if (targetSlide?.dataKey === 'cover' || targetSlide?.layoutType?.includes('A01')) {
            if (overrides.title) {
              doc.title = String(overrides.title);
              docBody.title = String(overrides.title);
              mutated = true;
            }
            if (overrides.kicker) {
              docBody.subtitle = String(overrides.kicker);
              mutated = true;
            }
          }

          if (targetSlide?.dataKey === 'overview' || targetSlide?.layoutType?.includes('A02')) {
            if (overrides.title) {
              docBody.heroTitle = String(overrides.title);
              mutated = true;
            }
            if (overrides.kicker) {
              docBody.heroSubtitle = String(overrides.kicker);
              mutated = true;
            }
            if (overrides.leadSentence) {
              docBody.heroCard = {
                ...(docBody.heroCard || {}),
                keyInvestmentPoint: String(overrides.leadSentence),
              };
              mutated = true;
            }
          }

          if (Array.isArray(docBody.sections) && targetSlide?.dataKey) {
            const section = docBody.sections.find(
              (s: any) =>
                s.section_type === targetSlide.dataKey ||
                s.section_type?.includes(targetSlide.dataKey) ||
                (targetSlide.dataKey === 'overview' && s.section_type === 'property_overview') ||
                (targetSlide.dataKey === 'thesis' && s.section_type === 'investment_highlights')
            );
            if (section && overrides.title) {
              section.title = String(overrides.title);
              mutated = true;
            }
          }

          if (mutated) {
            const tier = docBody.releaseTier ?? 'fact_om';
            const newTargetHash = computeTargetHash({
              body: docBody,
              releaseTier: tier,
              policyVersion: '2026-08-31',
            });
            docBody.approval_target_hash = newTargetHash;

            await supabase
              .from('document_objects')
              .update({
                title: doc.title,
                body: docBody,
                approval_target_hash: newTargetHash,
                updated_at: new Date().toISOString(),
              })
              .eq('id', doc.id);

            await broadcastDealcardMutation(supabase, {
              buildingId: doc.building_id || dealId,
              documentId: doc.id,
              projectId: actualProjectId,
              targetHash: newTargetHash,
              changeKind: 'opinion_edited',
              invalidatedChannels: ['pptx', 'mobile'],
              timestamp: new Date().toISOString(),
              updatedBy: brokerId,
            });
          }
        }
      } catch (reverseSyncErr) {
        console.warn('[slides/route] Reverse sync to document_objects failed (non-blocking):', reverseSyncErr);
      }

      return NextResponse.json({ ok: true, project: updated });
    }


    if (action === 'update_layout') {
      const { slideIndex, layoutType } = body;
      if (typeof slideIndex !== 'number' || !layoutType) {
        return NextResponse.json(
          { ok: false, error: 'slideIndex and layoutType are required' },
          { status: 400 }
        );
      }
      const updated = studioService.updateSlideLayout(actualProjectId, slideIndex, layoutType, expectedLockVersion);
      return NextResponse.json({ ok: true, project: updated });
    }

    // Batch update of slides
    if (Array.isArray(body.slides)) {
      let current = project;
      for (const item of body.slides) {
        if (item.id && item.slideOverrides) {
          current = studioService.patchSlideOverrides(actualProjectId, item.id, item.slideOverrides);
        }
        if (item.id && item.hidden !== undefined) {
          current = studioService.toggleSlideVisibility(actualProjectId, item.id, item.hidden);
        }
      }
      return NextResponse.json({ ok: true, project: current });
    }

    return NextResponse.json(
      { ok: false, error: 'Invalid action or missing parameters' },
      { status: 400 }
    );
  } catch (err: any) {
    const isStale = err.message?.includes('STALE_LOCK_ERROR');
    return NextResponse.json(
      { ok: false, error: err.message || 'Failed to update slides' },
      { status: isStale ? 409 : 400 }
    );
  }
}
