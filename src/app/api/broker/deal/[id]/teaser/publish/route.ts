import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { simulateReidentification } from '@/domain/deal/teaser/photo-safety';
import { dealService, Deal } from '@/domain/deal/deal-service';
import { DealStage } from '@/domain/deal/deal-transition';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';
import {
  isUuid,
  getQuickImRecord,
  markDealCardSent,
} from '@/lib/im-lite/quick-generate-store';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let actorId = 'broker_user_id';
    let actorRole: string | null = null;
    const isTestBypass =
      process.env.NODE_ENV === 'test' && Boolean(request.headers.get('x-test-bypass'));
    if (!isTestBypass) {
      const auth = await requireBroker(request);
      if (auth.error) return auth.error;
      if (auth.user?.id) actorId = auth.user.id;
      actorRole = auth.role ?? null;
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { photoUrl = '', title = '', currentStage = 'im_draft' } = body;

    // Rule 39: Reject browser-local blob: URLs
    if (typeof photoUrl === 'string' && photoUrl.trim().startsWith('blob:')) {
      return NextResponse.json(
        {
          success: false,
          error: '임시 브라우저 URL(blob:)은 발행할 수 없습니다. 업로드된 이미지 URL을 사용해 주세요.',
        },
        { status: 400 }
      );
    }

    let resolvedBuildingId = id;
    let supabase: ReturnType<typeof createServiceClient> | null = null;
    try {
      supabase = createServiceClient();
    } catch {
      supabase = null;
    }

    if (isUuid(id) && supabase && typeof supabase.from === 'function') {
      let ownerCheck = await assertBuildingOwner(supabase, resolvedBuildingId, actorId, {
        allowAdmin: true,
        role: actorRole,
      });

      if (!ownerCheck.ok && ownerCheck.status === 404) {
        try {
          const { data: sigCard } = await supabase
            .from('building_signal_cards')
            .select('id, building_id')
            .eq('id', id)
            .maybeSingle();
          if (sigCard?.building_id) {
            resolvedBuildingId = String(sigCard.building_id);
            ownerCheck = await assertBuildingOwner(supabase, resolvedBuildingId, actorId, {
              allowAdmin: true,
              role: actorRole,
            });
          }
        } catch {
          // Non-blocking
        }
      }

      if (!ownerCheck.ok) {
        if (ownerCheck.status === 403) {
          return ownerCheck.response;
        }
        if (!isTestBypass && !getQuickImRecord(id)) {
          return ownerCheck.response;
        }
      }
    }

    // 1. Safety check
    const safetyResult = simulateReidentification(photoUrl, title);

    if (!safetyResult.isSafe) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Photo rejected due to high re-identification risk', 
          details: safetyResult.detectedRiskFactors 
        },
        { status: 400 }
      );
    }

    // 2. Transition Deal Stage (e.g. im_draft -> im_published)
    const deal: Deal = {
      id: resolvedBuildingId,
      stage: currentStage as DealStage,
      updatedAt: new Date().toISOString()
    };

    const transition = await dealService.transitionDealStage(deal, 'im_published', actorId);

    if (!transition.allowed) {
      return NextResponse.json(
        { success: false, error: transition.reason },
        { status: 400 }
      );
    }

    markDealCardSent(resolvedBuildingId);
    if (id !== resolvedBuildingId) {
      markDealCardSent(id);
    }

    if (supabase && typeof supabase.from === 'function') {
      const nowIso = new Date().toISOString();
      try {
        if (isUuid(resolvedBuildingId)) {
          await Promise.allSettled([
            supabase
              .from('document_objects')
              .update({
                status: 'published',
                visibility: 'public_blind',
                updated_at: nowIso,
              })
              .eq('building_id', resolvedBuildingId)
              .eq('document_type', 'blind_teaser'),
            supabase
              .from('building_signal_cards')
              .update({
                status: 'published',
                visibility: 'public_blind',
                updated_at: nowIso,
              })
              .eq('building_id', resolvedBuildingId),
          ]);
        }
        await supabase.from('activity_events').insert({
          actor_id: isUuid(actorId) ? actorId : null,
          event_type: 'dealcard_sent',
          entity_type: 'building',
          entity_id: isUuid(resolvedBuildingId) ? resolvedBuildingId : null,
          metadata: {
            building_id: resolvedBuildingId,
            deal_id: id,
            status: 'sent',
          },
        });
      } catch {
        // Non-blocking
      }
    }

    try {
      revalidatePath(`/dc/${resolvedBuildingId}`);
    } catch {
      // Ignore outside request context
    }

    return NextResponse.json({
      success: true,
      buildingId: resolvedBuildingId,
      safetyResult,
      transition
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
