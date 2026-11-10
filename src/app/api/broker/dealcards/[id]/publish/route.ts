import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';
import {
  isUuid,
  getQuickImRecord,
  markDealCardSent,
} from '@/lib/im-lite/quick-generate-store';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  const { id: dealcardId } = await params;
  if (!dealcardId) {
    return NextResponse.json({ error: 'Missing dealcard ID' }, { status: 400 });
  }

  try {
    const publishedAt = new Date().toISOString();
    let targetBuildingId = dealcardId;
    let supabase: ReturnType<typeof createServiceClient> | null = null;
    try {
      supabase = createServiceClient();
    } catch {
      supabase = null;
    }

    if (isUuid(dealcardId) && supabase && typeof supabase.from === 'function') {
      let ownerCheck = await assertBuildingOwner(supabase, targetBuildingId, user!.id, {
        allowAdmin: true,
        role: guard.role,
      });

      if (!ownerCheck.ok && ownerCheck.status === 404) {
        try {
          const { data: sigCard } = await supabase
            .from('building_signal_cards')
            .select('id, building_id')
            .eq('id', dealcardId)
            .maybeSingle();
          if (sigCard?.building_id) {
            targetBuildingId = String(sigCard.building_id);
            ownerCheck = await assertBuildingOwner(supabase, targetBuildingId, user!.id, {
              allowAdmin: true,
              role: guard.role,
            });
          }
        } catch {
          // Non-blocking
        }
      }

      if (!ownerCheck.ok) {
        const quickRec = getQuickImRecord(dealcardId);
        if (ownerCheck.status === 403 || !quickRec) {
          return ownerCheck.response;
        }
        if (quickRec.ownerId && quickRec.ownerId !== user!.id && guard.role !== 'admin') {
          return NextResponse.json(
            { ok: false, error: '이 매물에 대한 권한이 없습니다.', code: 'FORBIDDEN' },
            { status: 403 }
          );
        }
      } else {
        await Promise.allSettled([
          supabase
            .from('document_objects')
            .update({
              status: 'published',
              visibility: 'public_blind',
              updated_at: publishedAt,
            })
            .eq('building_id', targetBuildingId)
            .eq('document_type', 'blind_teaser'),
          supabase
            .from('building_signal_cards')
            .update({
              status: 'published',
              visibility: 'public_blind',
              updated_at: publishedAt,
            })
            .eq('building_id', targetBuildingId),
          supabase
            .from('building_ssot_lite')
            .update({
              status: 'public_signal_ready',
              updated_at: publishedAt,
            })
            .eq('id', targetBuildingId),
        ]);
      }
    } else {
      const quickRec = getQuickImRecord(dealcardId);
      if (quickRec?.ownerId && quickRec.ownerId !== user!.id && guard.role !== 'admin') {
        return NextResponse.json(
          { ok: false, error: '이 매물에 대한 권한이 없습니다.', code: 'FORBIDDEN' },
          { status: 403 }
        );
      }
    }

    markDealCardSent(targetBuildingId);
    if (dealcardId !== targetBuildingId) {
      markDealCardSent(dealcardId);
    }

    if (supabase && typeof supabase.from === 'function') {
      try {
        await supabase.from('activity_events').insert({
          actor_id: user!.id,
          event_type: 'dealcard_sent',
          entity_type: 'building',
          entity_id: isUuid(targetBuildingId) ? targetBuildingId : user!.id,
          metadata: {
            building_id: targetBuildingId,
            dealcard_id: dealcardId,
            status: 'sent',
          },
        });
      } catch {
        // Non-blocking
      }
    }

    try {
      revalidatePath(`/dc/${targetBuildingId}`);
      if (dealcardId !== targetBuildingId) {
        revalidatePath(`/dc/${dealcardId}`);
      }
    } catch {
      // Ignore outside request context
    }

    return NextResponse.json({
      ok: true,
      dealcardId: targetBuildingId,
      status: 'PUBLISHED',
      publicUrl: `/dc/${targetBuildingId}`,
      publishedBy: user!.id,
      publishedAt,
      message: '블라인드 딜카드가 공식 발행되었습니다.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? 'Publish error' },
      { status: 500 }
    );
  }
}
