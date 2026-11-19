import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { simulateReidentification } from '@/domain/deal/teaser/photo-safety';
import { dealService, Deal } from '@/domain/deal/deal-service';
import { DealStage } from '@/domain/deal/deal-transition';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';
import { assertPublishable } from '@/lib/legal/publish-gate';
import { validateBlindPriceBand } from '@/lib/deal-card/price-band';
import { evaluateDealCardPublishContent } from '@/lib/deal-card/publish-content-gate';
import { fetchVerifiedBrokerSnapshotProfile } from '@/lib/deal-card/verified-broker-profile';
import { syncLegacyBuildingPublishedStatus } from '@/lib/deal-card/publish-sync';
import { recordFunnelEvent } from '@/lib/observability/funnel-slo';
import {
  assertLegacyOrDbOwnership,
  buildSanitizedDealCardPublicSnapshot,
  getWorkspaceItemByAnyId,
  updateWorkspaceItemState,
  WorkspaceRepositoryError,
  type WorkspaceItemRecord,
} from '@/lib/workspace/workspace-repository';
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

    let wsItem: WorkspaceItemRecord | null = null;
    let hasLegacyDocOrSignal = false;
    const quickRec = getQuickImRecord(id);

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
            hasLegacyDocOrSignal = true;
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
        if (ownerCheck.status === 404) {
          try {
            wsItem = await getWorkspaceItemByAnyId(supabase, id, 'dealcard');
          } catch (err) {
            if (err instanceof WorkspaceRepositoryError) {
              return NextResponse.json(
                { ok: false, success: false, code: err.code, error: err.message },
                { status: err.status }
              );
            }
            wsItem = null;
          }
          if (wsItem) {
            if (wsItem.status === 'archived' || Boolean(wsItem.deletedAt)) {
              return NextResponse.json(
                { ok: false, success: false, code: 'NOT_FOUND', error: '대상 자료를 찾을 수 없습니다.' },
                { status: 404 }
              );
            }
            if (wsItem.ownerId !== actorId && actorRole !== 'admin') {
              return NextResponse.json(
                { ok: false, success: false, code: 'FORBIDDEN', error: '이 매물에 대한 권한이 없습니다.' },
                { status: 403 }
              );
            }
            resolvedBuildingId = wsItem.buildingId || wsItem.id;
          } else if (!isTestBypass && !quickRec) {
            return ownerCheck.response;
          }
        } else {
          return ownerCheck.response;
        }
      }
    } else if (!isUuid(id)) {
      if (quickRec?.ownerId && quickRec.ownerId !== actorId && actorRole !== 'admin') {
        return NextResponse.json(
          { ok: false, success: false, code: 'FORBIDDEN', error: '이 매물에 대한 권한이 없습니다.' },
          { status: 403 }
        );
      }
      if (supabase && typeof supabase.from === 'function') {
        try {
          const own = await assertLegacyOrDbOwnership(supabase, {
            id,
            userId: actorId,
            isAdmin: actorRole === 'admin',
            kind: 'dealcard',
            requireExisting: false,
          });
          wsItem = own.existingItem;
        } catch (err) {
          if (err instanceof WorkspaceRepositoryError) {
            return NextResponse.json(
              { ok: false, success: false, code: err.code, error: err.message },
              { status: err.status }
            );
          }
          throw err;
        }
        if (wsItem && (wsItem.status === 'archived' || Boolean(wsItem.deletedAt))) {
          return NextResponse.json(
            { ok: false, success: false, code: 'NOT_FOUND', error: '대상 자료를 찾을 수 없습니다.' },
            { status: 404 }
          );
        }
      }
    }

    // 0. Statutory disclosure gate & blind price-band gate (P0-2)
    let requestedPriceBand: string | undefined =
      typeof body?.priceBand === 'string'
        ? body.priceBand
        : typeof body?.card4?.priceBand === 'string'
        ? body.card4.priceBand
        : undefined;
    const resolvedQuickRec = getQuickImRecord(resolvedBuildingId) || quickRec;
    if (!requestedPriceBand && resolvedQuickRec?.card4?.priceBand) {
      requestedPriceBand = resolvedQuickRec.card4.priceBand;
    }
    let teaserDocBody: Record<string, unknown> | null = null;
    if (supabase && typeof supabase.from === 'function') {
      try {
        if (!wsItem) {
          wsItem = await getWorkspaceItemByAnyId(supabase, resolvedBuildingId, 'dealcard');
        }
        const draftBand = (wsItem?.draftPayload as Record<string, unknown> | null)?.card4;
        const draftCard4Band =
          draftBand && typeof draftBand === 'object'
            ? (draftBand as Record<string, unknown>).priceBand
            : undefined;
        if (!requestedPriceBand) {
          requestedPriceBand =
            (typeof draftCard4Band === 'string' ? draftCard4Band : undefined) ||
            wsItem?.priceBand ||
            undefined;
        }
        if (isUuid(resolvedBuildingId)) {
          const [{ data: teaserDoc }, { data: sigRow }] = await Promise.all([
            supabase
              .from('document_objects')
              .select('id, body')
              .eq('building_id', resolvedBuildingId)
              .eq('document_type', 'blind_teaser')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from('building_signal_cards')
              .select('id, title, area_signal, asset_type, price_band, deal_points')
              .eq('building_id', resolvedBuildingId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);
          if (teaserDoc?.id || sigRow?.id) {
            hasLegacyDocOrSignal = true;
          }
          if (teaserDoc?.body && typeof teaserDoc.body === 'object') {
            teaserDocBody = teaserDoc.body as Record<string, unknown>;
            if (!requestedPriceBand) {
              const teaserCard4 = teaserDocBody.card4 as Record<string, unknown> | undefined;
              if (typeof teaserCard4?.priceBand === 'string') {
                requestedPriceBand = teaserCard4.priceBand;
              }
            }
          } else if (sigRow?.id) {
            teaserDocBody = {
              card4: {
                ...(typeof sigRow.title === 'string' && sigRow.title ? { headline: sigRow.title } : {}),
                ...(typeof sigRow.area_signal === 'string' && sigRow.area_signal ? { region: sigRow.area_signal } : {}),
                ...(typeof sigRow.asset_type === 'string' && sigRow.asset_type ? { use: sigRow.asset_type } : {}),
                ...(typeof sigRow.price_band === 'string' && sigRow.price_band ? { priceBand: sigRow.price_band } : {}),
                ...(Array.isArray(sigRow.deal_points) ? { points: sigRow.deal_points } : {}),
              },
            };
            if (!requestedPriceBand && typeof sigRow.price_band === 'string') {
              requestedPriceBand = sigRow.price_band;
            }
          }
        }
      } catch {
        // Non-blocking
      }
    }

    if (!isTestBypass && !isUuid(resolvedBuildingId) && !wsItem && !hasLegacyDocOrSignal && !resolvedQuickRec) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          code: 'NOT_FOUND',
          error: '대상 티저 또는 딜카드를 찾을 수 없습니다.',
        },
        { status: 404 }
      );
    }

    const gate = await assertPublishable({
      supabase,
      userId: actorId,
      kind: 'dealcard',
    });
    if (!gate.ok) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          code: gate.code,
          error: gate.message,
          missingFields: gate.missingFields,
          missingLabels: gate.missingLabels,
        },
        { status: 422 }
      );
    }

    if (requestedPriceBand && requestedPriceBand.trim().length > 0) {
      const bandCheck = validateBlindPriceBand(requestedPriceBand);
      if (!bandCheck.valid) {
        return NextResponse.json(
          {
            ok: false,
            success: false,
            code: 'BLIND_PRICE_BAND_INVALID',
            error: bandCheck.reason || '블라인드 가격 구간 형식을 확인해 주세요.',
          },
          { status: 422 }
        );
      }
    }

    // WP-7.3C P1-5: resolve the exact snapshot that will be published, then run the
    // same content gate as summary mark_sent (blind points + headline + pointBriefs,
    // placeholder copy, price band of the stored card4) on it.
    const existingSanitizedSnap =
      wsItem?.publishedSnapshot && typeof wsItem.publishedSnapshot === 'object'
        ? buildSanitizedDealCardPublicSnapshot(wsItem.publishedSnapshot)
        : null;
    const draftCard4 = (wsItem?.draftPayload as Record<string, unknown> | undefined)?.card4;
    const rawSnapshot: Record<string, unknown> | null =
      existingSanitizedSnap && Object.keys(existingSanitizedSnap).length > 0
        ? existingSanitizedSnap
        : teaserDocBody?.card4
        ? { card4: teaserDocBody.card4 }
        : draftCard4
        ? { card4: draftCard4 }
        : (wsItem?.draftPayload as Record<string, unknown> | undefined) || null;
    const snapshotCard4 =
      rawSnapshot?.card4 && typeof rawSnapshot.card4 === 'object'
        ? (rawSnapshot.card4 as Record<string, unknown>)
        : resolvedQuickRec?.card4
        ? (resolvedQuickRec.card4 as unknown as Record<string, unknown>)
        : null;
    const contentGate = evaluateDealCardPublishContent(
      snapshotCard4 as Parameters<typeof evaluateDealCardPublishContent>[0],
      { extraPriceBands: [requestedPriceBand] }
    );
    if (!contentGate.ok) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          code: contentGate.code,
          error: contentGate.error,
          ...(contentGate.violations ? { violations: contentGate.violations } : {}),
        },
        { status: contentGate.status }
      );
    }

    // DB-verified broker profile (never the client body) for the public snapshot.
    const verifiedBrokerProfile = await fetchVerifiedBrokerSnapshotProfile(
      supabase,
      actorId,
      gate.statutory
    );

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

    let updatedWsItem: WorkspaceItemRecord | null = null;
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
                status: 'shared_external',
                visibility: 'public_blind',
                updated_at: nowIso,
              })
              .eq('building_id', resolvedBuildingId),
            syncLegacyBuildingPublishedStatus(supabase, resolvedBuildingId, nowIso),
          ]);
        }

        const sanitizedSnapshot = rawSnapshot
          ? buildSanitizedDealCardPublicSnapshot({
              ...rawSnapshot,
              ...(verifiedBrokerProfile ? { brokerProfile: verifiedBrokerProfile } : {}),
            })
          : undefined;

        try {
          const stateRes = await updateWorkspaceItemState(supabase, {
            id: resolvedBuildingId,
            userId: actorId,
            isAdmin: actorRole === 'admin',
            kind: 'dealcard',
            status: 'sent',
            ...(sanitizedSnapshot ? { publishedSnapshot: sanitizedSnapshot } : {}),
          });
          updatedWsItem = stateRes.item;
          if (!updatedWsItem && id !== resolvedBuildingId) {
            const altRes = await updateWorkspaceItemState(supabase, {
              id,
              userId: actorId,
              isAdmin: actorRole === 'admin',
              kind: 'dealcard',
              status: 'sent',
              ...(sanitizedSnapshot ? { publishedSnapshot: sanitizedSnapshot } : {}),
            });
            updatedWsItem = altRes.item;
          }
        } catch (err) {
          if (err instanceof WorkspaceRepositoryError) {
            return NextResponse.json(
              { ok: false, success: false, code: err.code, error: err.message },
              { status: err.status }
            );
          }
          throw err;
        }

        if (!isTestBypass && !updatedWsItem && !hasLegacyDocOrSignal && !resolvedQuickRec) {
          return NextResponse.json(
            {
              ok: false,
              success: false,
              code: 'NOT_FOUND',
              error: '대상 티저 또는 딜카드를 찾을 수 없습니다.',
            },
            { status: 404 }
          );
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
      } catch (err) {
        if (err instanceof WorkspaceRepositoryError) {
          return NextResponse.json(
            { ok: false, success: false, code: err.code, error: err.message },
            { status: err.status }
          );
        }
        // Non-blocking activity_events errors
      }
    } else if (!isTestBypass && !resolvedQuickRec) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          code: 'NOT_FOUND',
          error: '대상 티저 또는 딜카드를 찾을 수 없습니다.',
        },
        { status: 404 }
      );
    }

    markDealCardSent(resolvedBuildingId);
    if (id !== resolvedBuildingId) {
      markDealCardSent(id);
    }

    try {
      revalidatePath(`/dc/${resolvedBuildingId}`);
    } catch {
      // Ignore outside request context
    }

    recordFunnelEvent({
      funnel: 'deal_creation',
      outcome: 'ok',
      entityId: resolvedBuildingId,
      meta: { channel: 'dealcard_publish' },
    });

    return NextResponse.json({
      success: true,
      buildingId: resolvedBuildingId,
      safetyResult,
      transition
    });
  } catch (error: unknown) {
    recordFunnelEvent({
      funnel: 'deal_creation',
      outcome: 'failed',
      code: 'DEALCARD_PUBLISH_ERROR',
    });
    const safeMsg =
      error instanceof WorkspaceRepositoryError
        ? error.message
        : '딜카드 발행 처리 중 서버 오류가 발생했습니다.';
    return NextResponse.json({ success: false, error: safeMsg }, { status: 500 });
  }
}
