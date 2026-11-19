import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';
import { assertPublishable } from '@/lib/legal/publish-gate';
import { evaluateDealCardPublishContent } from '@/lib/deal-card/publish-content-gate';
import {
  assertLegacyOrDbOwnership,
  buildSanitizedDealCardPublicSnapshot,
  getWorkspaceItemByAnyId,
  isMissingRelationOrColumnError,
  updateWorkspaceItemState,
  upsertWorkspaceItem,
  WorkspaceRepositoryError,
  type WorkspaceItemRecord,
} from '@/lib/workspace/workspace-repository';
import { buildBrokerProfileMeta } from '@/lib/workspace/summary/types-and-helpers';
import {
  isUuid,
  getQuickImRecord,
  markDealCardSent,
} from '@/lib/im-lite/quick-generate-store';

function isSchemaColumnErr(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === '42703' || err.code === 'PGRST204') return true;
  return /does not exist|schema cache/i.test(String(err.message || ''));
}

async function fetchVerifiedBrokerSnapshotProfile(
  supabase: ReturnType<typeof createServiceClient> | null,
  userId: string,
  statutoryFallback?: {
    company?: string;
    officeAddress?: string;
    phone?: string;
    officeRegNumber?: string;
    representativeName?: string;
  } | null
): Promise<Record<string, any> | null> {
  let pRow: Record<string, unknown> | null = null;
  let bpRow: Record<string, unknown> | null = null;

  if (supabase && typeof supabase.from === 'function' && isUuid(userId)) {
    try {
      const pFull = await supabase
        .from('profiles')
        .select('display_name, company, phone, photo_url')
        .eq('id', userId)
        .maybeSingle();
      if (pFull?.error && isSchemaColumnErr(pFull.error)) {
        const pMin = await supabase
          .from('profiles')
          .select('display_name, company, phone')
          .eq('id', userId)
          .maybeSingle();
        pRow = (pMin?.data as Record<string, unknown> | null) ?? null;
      } else {
        pRow = (pFull?.data as Record<string, unknown> | null) ?? null;
      }
    } catch {
      pRow = null;
    }

    try {
      const bpFull = await supabase
        .from('broker_profiles')
        .select(
          'user_id, slug, card_name, photo_url, deal_specialty, license_number, office_reg_number, office_address, representative_name'
        )
        .eq('user_id', userId)
        .maybeSingle();
      if (bpFull?.error && isSchemaColumnErr(bpFull.error)) {
        const bpCore = await supabase
          .from('broker_profiles')
          .select('user_id, slug, card_name, photo_url, license_number, office_reg_number')
          .eq('user_id', userId)
          .maybeSingle();
        if (bpCore?.error && isSchemaColumnErr(bpCore.error)) {
          const bpMin = await supabase
            .from('broker_profiles')
            .select('user_id, slug, office_reg_number')
            .eq('user_id', userId)
            .maybeSingle();
          bpRow = (bpMin?.data as Record<string, unknown> | null) ?? null;
        } else {
          bpRow = (bpCore?.data as Record<string, unknown> | null) ?? null;
        }
      } else {
        bpRow = (bpFull?.data as Record<string, unknown> | null) ?? null;
      }
    } catch {
      bpRow = null;
    }
  }

  const meta = buildBrokerProfileMeta(pRow, bpRow);
  const company = meta?.company || statutoryFallback?.company || undefined;
  const officeAddress = meta?.officeAddress || statutoryFallback?.officeAddress || undefined;
  const phone = meta?.phone || statutoryFallback?.phone || undefined;
  const officeRegNumber = meta?.officeRegNumber || statutoryFallback?.officeRegNumber || undefined;
  const representativeName =
    meta?.representativeName || statutoryFallback?.representativeName || undefined;
  const displayName =
    meta?.displayName ||
    (typeof bpRow?.card_name === 'string' && bpRow.card_name) ||
    representativeName ||
    undefined;
  const photoUrl =
    meta?.photoUrl ||
    (typeof bpRow?.photo_url === 'string' ? bpRow.photo_url : undefined) ||
    (typeof pRow?.photo_url === 'string' ? pRow.photo_url : undefined);

  if (!company && !officeAddress && !phone && !officeRegNumber && !representativeName && !displayName) {
    return null;
  }

  return {
    ...(meta || {}),
    ...(displayName ? { displayName, display_name: displayName } : {}),
    ...(company ? { company } : {}),
    ...(phone ? { phone } : {}),
    ...(officeAddress ? { officeAddress, office_address: officeAddress } : {}),
    ...(officeRegNumber
      ? {
          officeRegNumber,
          office_reg_number: officeRegNumber,
          registrationNo: officeRegNumber,
        }
      : {}),
    ...(representativeName
      ? { representativeName, representative_name: representativeName }
      : {}),
    ...(photoUrl ? { photoUrl, avatar_url: photoUrl } : {}),
    ...(typeof bpRow?.card_name === 'string' && bpRow.card_name
      ? { card_name: bpRow.card_name }
      : {}),
    is_licensed: Boolean(meta?.is_licensed || officeRegNumber),
  };
}

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
    const reqBody = await req.json().catch(() => ({} as Record<string, any>));
    const reqBodyCard4 =
      reqBody?.card4 && typeof reqBody.card4 === 'object' && !Array.isArray(reqBody.card4)
        ? (reqBody.card4 as Record<string, any>)
        : undefined;
    let requestedPriceBand: string | undefined =
      typeof reqBody?.priceBand === 'string'
        ? reqBody.priceBand
        : typeof reqBodyCard4?.priceBand === 'string'
        ? reqBodyCard4.priceBand
        : undefined;
    let supabase: ReturnType<typeof createServiceClient> | null = null;
    try {
      supabase = createServiceClient();
    } catch {
      supabase = null;
    }

    let wsExistingCard4: Record<string, any> | undefined = reqBodyCard4;
    let wsExistingTitle: string | undefined;
    let wsExistingAddress: string | undefined;
    let wsItem: WorkspaceItemRecord | null = null;
    let existingTeaserBody: Record<string, any> | null = null;
    let hasBuildingRow = false;
    let hasQuickRec = false;

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
        if (ownerCheck.status === 403) {
          return ownerCheck.response;
        }
        if (ownerCheck.status === 404) {
          try {
            wsItem = await getWorkspaceItemByAnyId(supabase, dealcardId, 'dealcard');
          } catch (err) {
            if (err instanceof WorkspaceRepositoryError) {
              return NextResponse.json(
                { ok: false, error: err.message, code: err.code },
                { status: err.status }
              );
            }
            wsItem = null;
          }
          if (wsItem) {
            if (wsItem.status === 'archived' || Boolean(wsItem.deletedAt)) {
              return NextResponse.json(
                { ok: false, error: '대상 자료를 찾을 수 없습니다.', code: 'NOT_FOUND' },
                { status: 404 }
              );
            }
            if (wsItem.ownerId !== user!.id && guard.role !== 'admin') {
              return NextResponse.json(
                { ok: false, error: '이 매물에 대한 권한이 없습니다.', code: 'FORBIDDEN' },
                { status: 403 }
              );
            }
            targetBuildingId = wsItem.buildingId || wsItem.id;
            const draftCard4 = (wsItem.draftPayload as Record<string, any> | null)?.card4;
            const snapCard4 = (wsItem.publishedSnapshot as Record<string, any> | null)?.card4;
            const wsCard4 = reqBodyCard4 || draftCard4 || snapCard4;
            if (wsCard4 && typeof wsCard4 === 'object') {
              wsExistingCard4 = wsCard4 as Record<string, any>;
            }
            wsExistingTitle = wsItem.title || undefined;
            wsExistingAddress = wsItem.address || undefined;
            requestedPriceBand =
              requestedPriceBand ||
              wsExistingCard4?.priceBand ||
              wsItem.priceBand ||
              undefined;
          } else {
            const quickRec = getQuickImRecord(dealcardId);
            if (!quickRec) {
              return ownerCheck.response;
            }
            if (quickRec.ownerId && quickRec.ownerId !== user!.id && guard.role !== 'admin') {
              return NextResponse.json(
                { ok: false, error: '이 매물에 대한 권한이 없습니다.', code: 'FORBIDDEN' },
                { status: 403 }
              );
            }
            hasQuickRec = true;
            wsExistingCard4 = wsExistingCard4 || (quickRec.card4 as unknown as Record<string, any>);
            requestedPriceBand = requestedPriceBand || quickRec.card4?.priceBand;
          }
        } else {
          return ownerCheck.response;
        }
      } else {
        hasBuildingRow = true;
        try {
          wsItem = await getWorkspaceItemByAnyId(supabase, targetBuildingId, 'dealcard');
        } catch {
          wsItem = null;
        }
        try {
          const { data: teaserDoc } = await supabase
            .from('document_objects')
            .select('body')
            .eq('building_id', targetBuildingId)
            .eq('document_type', 'blind_teaser')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (teaserDoc?.body && typeof teaserDoc.body === 'object') {
            existingTeaserBody = teaserDoc.body as Record<string, any>;
          }
        } catch {
          existingTeaserBody = null;
        }

        // DealCard P1-2: Prefer wsItem.draftPayload.card4 ahead of stale teaserDoc.body.card4 / publishedSnapshot.card4
        const draftCard4 = (wsItem?.draftPayload as Record<string, any> | null)?.card4;
        const snapCard4 = (wsItem?.publishedSnapshot as Record<string, any> | null)?.card4;
        const teaserCard4 = existingTeaserBody?.card4;
        const preferredCard4 = reqBodyCard4 || draftCard4 || teaserCard4 || snapCard4;
        if (preferredCard4 && typeof preferredCard4 === 'object') {
          wsExistingCard4 = preferredCard4 as Record<string, any>;
        }
        if (wsItem) {
          wsExistingTitle = wsItem.title || undefined;
          wsExistingAddress = wsItem.address || undefined;
        }
        requestedPriceBand =
          requestedPriceBand ||
          wsExistingCard4?.priceBand ||
          wsItem?.priceBand ||
          (teaserCard4 && typeof teaserCard4 === 'object' ? teaserCard4.priceBand : undefined) ||
          undefined;
      }
    } else {
      const quickRec = getQuickImRecord(dealcardId);
      if (quickRec?.ownerId && quickRec.ownerId !== user!.id && guard.role !== 'admin') {
        return NextResponse.json(
          { ok: false, error: '이 매물에 대한 권한이 없습니다.', code: 'FORBIDDEN' },
          { status: 403 }
        );
      }
      if (quickRec?.card4) {
        hasQuickRec = true;
      }
      if (supabase && typeof supabase.from === 'function') {
        try {
          wsItem = await getWorkspaceItemByAnyId(
            supabase,
            dealcardId,
            'dealcard',
            guard.role === 'admin' ? undefined : user!.id
          );
          if (!wsItem) {
            // DealCard P1-1: enforce cross-tenant non-UUID ownership (workspace_items + legacy activity_events)
            const legacyOwn = await assertLegacyOrDbOwnership(supabase, {
              id: dealcardId,
              userId: user!.id,
              isAdmin: guard.role === 'admin',
              kind: 'dealcard',
            });
            wsItem = legacyOwn.existingItem;
          }
          if (wsItem) {
            if (wsItem.status === 'archived' || Boolean(wsItem.deletedAt)) {
              return NextResponse.json(
                { ok: false, error: '대상 자료를 찾을 수 없습니다.', code: 'NOT_FOUND' },
                { status: 404 }
              );
            }
            if (wsItem.ownerId !== user!.id && guard.role !== 'admin') {
              return NextResponse.json(
                { ok: false, error: '이 매물에 대한 권한이 없습니다.', code: 'FORBIDDEN' },
                { status: 403 }
              );
            }
            const draftCard4 = (wsItem.draftPayload as Record<string, any> | null)?.card4;
            const snapCard4 = (wsItem.publishedSnapshot as Record<string, any> | null)?.card4;
            const preferredCard4 =
              reqBodyCard4 ||
              draftCard4 ||
              (quickRec?.card4 as unknown as Record<string, any> | undefined) ||
              snapCard4;
            if (preferredCard4 && typeof preferredCard4 === 'object') {
              wsExistingCard4 = preferredCard4;
              requestedPriceBand =
                requestedPriceBand || preferredCard4.priceBand || wsItem.priceBand || undefined;
            }
            wsExistingTitle = wsItem.title || undefined;
            wsExistingAddress = wsItem.address || undefined;
          } else if (quickRec?.card4) {
            wsExistingCard4 = wsExistingCard4 || (quickRec.card4 as unknown as Record<string, any>);
            requestedPriceBand = requestedPriceBand || quickRec.card4.priceBand;
          }
        } catch (err) {
          if (err instanceof WorkspaceRepositoryError) {
            return NextResponse.json(
              { ok: false, error: err.message, code: err.code },
              { status: err.status }
            );
          }
          return NextResponse.json(
            { ok: false, error: '매물 조회 중 오류가 발생했습니다.', code: 'DB_READ_FAILED' },
            { status: 500 }
          );
        }
      } else if (quickRec?.card4) {
        wsExistingCard4 = wsExistingCard4 || (quickRec.card4 as unknown as Record<string, any>);
        requestedPriceBand = requestedPriceBand || quickRec.card4.priceBand;
      }
    }

    // DealCard P1-1: Never return phantom 200 PUBLISHED when target DealCard does not exist
    if (!wsItem && !hasBuildingRow && !hasQuickRec) {
      return NextResponse.json(
        { ok: false, code: 'NOT_FOUND', error: '딜카드를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }
    if (!hasBuildingRow && !wsExistingCard4) {
      return NextResponse.json(
        { ok: false, code: 'NOT_FOUND', error: '딜카드를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const gate = await assertPublishable({ supabase, userId: user!.id, kind: 'dealcard' });
    if (!gate.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: gate.code,
          error: gate.message,
          missingFields: gate.missingFields,
          missingLabels: gate.missingLabels,
        },
        { status: 422 }
      );
    }

    // WP-7.3C P1-5: same content gate as summary mark_sent — blind points (+ headline,
    // pointBriefs), placeholder copy, and the price band that is actually written to
    // the snapshot (stored card4) as well as any client-requested band.
    const contentGate = evaluateDealCardPublishContent(
      wsExistingCard4 as Parameters<typeof evaluateDealCardPublishContent>[0],
      { extraPriceBands: [requestedPriceBand] }
    );
    if (!contentGate.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: contentGate.code,
          error: contentGate.error,
          ...(contentGate.violations ? { violations: contentGate.violations } : {}),
        },
        { status: contentGate.status }
      );
    }

    // Verified DB broker statutory profile (never trust client reqBody.brokerProfile)
    const verifiedBrokerProfile = await fetchVerifiedBrokerSnapshotProfile(
      supabase,
      user!.id,
      gate.statutory
    );

    if (hasBuildingRow && isUuid(targetBuildingId) && supabase && typeof supabase.from === 'function') {
      const teaserDocPatch: Record<string, unknown> = {
        status: 'published',
        visibility: 'public_blind',
        updated_at: publishedAt,
        ...(wsExistingCard4
          ? {
              body: {
                ...(existingTeaserBody || {}),
                card4: wsExistingCard4,
              },
              ...(wsExistingCard4.headline ? { title: String(wsExistingCard4.headline) } : {}),
            }
          : {}),
      };
      const [docRes, sigRes, ssotRes] = await Promise.all([
        supabase
          .from('document_objects')
          .update(teaserDocPatch)
          .eq('building_id', targetBuildingId)
          .eq('document_type', 'blind_teaser'),
        supabase
          .from('building_signal_cards')
          .update({
            status: 'shared_external',
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

      const writeErr =
        ssotRes?.error ||
        (docRes?.error && !isMissingRelationOrColumnError(docRes.error) ? docRes.error : null) ||
        (sigRes?.error && !isMissingRelationOrColumnError(sigRes.error) ? sigRes.error : null);
      if (writeErr) {
        return NextResponse.json(
          {
            ok: false,
            error: '발행 상태 저장에 실패했습니다.',
            code: 'DB_WRITE_FAILED',
          },
          { status: 500 }
        );
      }
    }

    if (supabase && typeof supabase.from === 'function') {
      try {
        // Never spread wsItem.draftPayload directly into publishedSnapshot (memoText/personas/PII stay private)
        const existingSanitizedSnap =
          wsItem?.publishedSnapshot && typeof wsItem.publishedSnapshot === 'object'
            ? buildSanitizedDealCardPublicSnapshot(wsItem.publishedSnapshot) ?? {}
            : {};
        const rawSnapshotPayload: Record<string, unknown> = {
          ...existingSanitizedSnap,
          ...(wsExistingCard4 ? { card4: wsExistingCard4 } : {}),
          ...(verifiedBrokerProfile ? { brokerProfile: verifiedBrokerProfile } : {}),
        };
        const snapshotPayload = buildSanitizedDealCardPublicSnapshot(rawSnapshotPayload) ?? {};

        const { hasUnpublishedEdits: _omitUnpub, ...cleanDraftBase } = (
          wsItem?.draftPayload && typeof wsItem.draftPayload === 'object' ? wsItem.draftPayload : {}
        ) as Record<string, unknown>;
        const cleanedDraftPayload: Record<string, unknown> = {
          ...cleanDraftBase,
          ...(wsExistingCard4 ? { card4: wsExistingCard4 } : {}),
        };

        const targetWorkspaceLookupId = wsItem?.id || targetBuildingId;
        const stateRes = await updateWorkspaceItemState(supabase, {
          id: targetWorkspaceLookupId,
          userId: user!.id,
          isAdmin: guard.role === 'admin',
          kind: 'dealcard',
          status: 'sent',
          publishedSnapshot: snapshotPayload,
        });

        if (wsItem && (!stateRes.item || !stateRes.tableAvailable)) {
          return NextResponse.json(
            {
              ok: false,
              error: '발행 상태 저장에 실패했습니다.',
              code: 'DB_WRITE_FAILED',
            },
            { status: 500 }
          );
        }

        // DealCard P1-2: Clear draftPayload.hasUnpublishedEdits and sync title/price_band on re-publish
        if (wsItem && stateRes.item && 'hasUnpublishedEdits' in (wsItem.draftPayload || {})) {
          await supabase
            .from('workspace_items')
            .update({
              draft_payload: cleanedDraftPayload,
              ...(wsExistingCard4?.headline ? { title: String(wsExistingCard4.headline) } : {}),
              ...(requestedPriceBand ? { price_band: requestedPriceBand } : {}),
              updated_at: publishedAt,
            })
            .eq('id', wsItem.id);
        }

        if (!stateRes.item && wsExistingCard4) {
          const upsertRes = await upsertWorkspaceItem(supabase, {
            legacyId: isUuid(targetBuildingId) ? null : targetBuildingId,
            buildingId: isUuid(targetBuildingId) ? targetBuildingId : null,
            ownerId: user!.id,
            isAdmin: guard.role === 'admin',
            kind: 'dealcard',
            status: 'sent',
            title:
              wsExistingTitle ||
              String(wsExistingCard4.headline || `${wsExistingCard4.region || ''} ${wsExistingCard4.use || ''}`).trim() ||
              '블라인드 딜카드',
            address: wsExistingAddress || (wsExistingCard4.region ? String(wsExistingCard4.region) : undefined),
            priceBand: requestedPriceBand || (wsExistingCard4.priceBand ? String(wsExistingCard4.priceBand) : null),
            draftPayload: cleanedDraftPayload,
            publishedSnapshot: snapshotPayload,
          });
          if (!upsertRes.item && !hasBuildingRow && !hasQuickRec) {
            return NextResponse.json(
              {
                ok: false,
                error: '발행 상태 저장에 실패했습니다.',
                code: 'DB_WRITE_FAILED',
              },
              { status: 500 }
            );
          }
        }
      } catch (err) {
        if (err instanceof WorkspaceRepositoryError) {
          return NextResponse.json(
            { ok: false, error: err.message, code: err.code },
            { status: err.status }
          );
        }
        return NextResponse.json(
          {
            ok: false,
            error: '발행 상태 저장 중 오류가 발생했습니다.',
            code: 'DB_WRITE_FAILED',
          },
          { status: 500 }
        );
      }
    } else if (!hasQuickRec) {
      return NextResponse.json(
        {
          ok: false,
          error: '데이터베이스 연결을 확인할 수 없습니다.',
          code: 'DB_UNAVAILABLE',
        },
        { status: 500 }
      );
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
