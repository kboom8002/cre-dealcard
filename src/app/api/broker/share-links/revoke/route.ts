import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import {
  getInboxState,
  getQuickImRecord,
  isUuid,
} from '@/lib/im-lite/quick-generate-store';
import {
  resolveShareTokenBuildingId,
  revokeRecipientShareLinkTokens,
  revokeShareLinkToken,
} from '@/lib/security/share-link-tokens';
import {
  assertLegacyOrDbOwnership,
  WorkspaceRepositoryError,
} from '@/lib/workspace/workspace-repository';
import { verifyBrokerOwnership } from '@/lib/inbox/inbox-ownership';

type ServiceSupabase = ReturnType<typeof createServiceClient>;

interface GateRowLookup {
  id?: string;
  building_id?: string | null;
  target_broker_id?: string | null;
}

interface InquiryRowLookup {
  id?: string;
  building_id?: string | null;
  broker_user_id?: string | null;
}

interface ShareLinkRowLookup {
  token?: string;
  building_id?: string | null;
  broker_id?: string | null;
}

interface MemShareTokenEntry {
  buildingId?: string;
  brokerId?: string | null;
  recipientId?: string | null;
}

function tryCreateServiceClient(): ServiceSupabase | null {
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}

async function verifyBuildingOwnershipForRevoke(
  supabase: ServiceSupabase | null,
  params: {
    buildingId: string;
    userId: string;
    isAdmin: boolean;
    requireExisting: boolean;
  }
): Promise<{ ok: true; verifiedOwnerId: string | null } | { ok: false; response: NextResponse }> {
  const { buildingId, userId, isAdmin, requireExisting } = params;
  if (isAdmin || !buildingId) {
    return { ok: true, verifiedOwnerId: isAdmin ? userId : null };
  }

  const quickRec = getQuickImRecord(buildingId);
  if (quickRec?.ownerId && quickRec.ownerId !== userId) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: '다른 중개인의 매물 링크는 잠글 수 없습니다.' },
        { status: 403 }
      ),
    };
  }

  const quickOwnerMatched = Boolean(quickRec?.ownerId && quickRec.ownerId === userId);
  if (!supabase) {
    if (requireExisting && !quickOwnerMatched) {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: '매물 소유권을 확인할 수 없습니다.' },
          { status: 403 }
        ),
      };
    }
    return { ok: true, verifiedOwnerId: quickOwnerMatched ? userId : null };
  }

  try {
    const res = await assertLegacyOrDbOwnership(supabase, {
      id: buildingId,
      userId,
      isAdmin,
      requireExisting: requireExisting && !quickOwnerMatched,
    });
    return { ok: true, verifiedOwnerId: res.ownerId || (quickOwnerMatched ? userId : null) };
  } catch (ownErr) {
    if (ownErr instanceof WorkspaceRepositoryError) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            error:
              ownErr.status === 404
                ? '대상 매물을 찾을 수 없습니다.'
                : '다른 중개인의 매물 링크는 잠글 수 없습니다.',
          },
          { status: ownErr.status === 404 ? 404 : ownErr.status === 403 ? 403 : 500 }
        ),
      };
    }
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: '매물 소유권 확인 중 오류가 발생했습니다.' },
        { status: 500 }
      ),
    };
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const userId = guard.user?.id || null;
  const isAdmin = guard.role === 'admin' || (guard.user as { role?: string } | null)?.role === 'admin';
  if (!userId) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token =
      typeof body?.token === 'string'
        ? body.token.trim()
        : typeof body?.shareToken === 'string'
          ? body.shareToken.trim()
          : '';
    const buildingId = typeof body?.buildingId === 'string' ? body.buildingId.trim() : '';
    const threadId = typeof body?.threadId === 'string' ? body.threadId.trim() : '';
    const gateRequestId =
      typeof body?.gateRequestId === 'string' ? body.gateRequestId.trim() : '';
    const rawScope =
      typeof body?.scope === 'string' ? body.scope.trim().toLowerCase() : '';
    const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'broker_locked';
    const effectiveThreadId = threadId || gateRequestId;

    if (!token && !buildingId && !effectiveThreadId) {
      return NextResponse.json(
        { ok: false, error: '잠글 링크 토큰 또는 매물·고객 식별자가 필요합니다.' },
        { status: 400 }
      );
    }

    // Check custom client ownership when threadId is provided
    if (effectiveThreadId && !isAdmin) {
      const rawCustomId = effectiveThreadId.replace(/^custom[-_]/, '');
      const matchedCustom = getInboxState().customClients.find(
        (c) => c.id === effectiveThreadId || c.id === rawCustomId
      );
      if (matchedCustom && (!matchedCustom.ownerId || matchedCustom.ownerId !== userId)) {
        return NextResponse.json(
          { ok: false, error: '다른 중개인의 고객 링크는 잠글 수 없습니다.' },
          { status: 403 }
        );
      }
    }

    const supabase = tryCreateServiceClient();
    let resolvedBuildingId = buildingId || (token ? resolveShareTokenBuildingId(token) : '');
    let revokedAt = new Date().toISOString();

    // WP-18: Distinguish per-thread lock (scope === 'thread' OR untokenized customer thread)
    // from building-wide lock (scope === 'building' OR buildingId without threadId/gateRequestId OR legacy token lock)
    const isThreadScoped =
      rawScope === 'thread' ||
      (rawScope !== 'building' && !token && Boolean(effectiveThreadId));

    if (isThreadScoped) {
      const rawGateId = (gateRequestId || effectiveThreadId).replace(/^srv-/, '');
      const isCustomOrViewThread =
        effectiveThreadId.startsWith('custom_') ||
        effectiveThreadId.startsWith('custom-') ||
        effectiveThreadId.startsWith('cli-') ||
        effectiveThreadId.startsWith('sub_') ||
        effectiveThreadId.startsWith('view_');
      const resolvedGateRequestId =
        gateRequestId || (!isCustomOrViewThread && rawGateId ? rawGateId : '');

      const memStore = (globalThis as {
        __CRE_SHARE_LINK_TOKEN_STORE__?: {
          tokens?: Record<string, MemShareTokenEntry>;
          revokedTokens?: Record<string, MemShareTokenEntry>;
        };
      }).__CRE_SHARE_LINK_TOKEN_STORE__;

      // Resolve explicit token / gate_requests / im_inquiry_requests / im_share_links BEFORE ownership validation
      let matchedShareLinkRow: ShareLinkRowLookup | null = null;
      if (token && supabase && typeof supabase.from === 'function') {
        try {
          const q = supabase
            .from('im_share_links')
            .select('token, building_id, broker_id')
            .eq('token', token);
          const res = typeof q?.maybeSingle === 'function' ? await q.maybeSingle() : await q?.single?.();
          matchedShareLinkRow = (res?.data as ShareLinkRowLookup | null) ?? null;
        } catch {
          matchedShareLinkRow = null;
        }
      }

      let grRow: GateRowLookup | null = null;
      let inqRow: InquiryRowLookup | null = null;
      if (resolvedGateRequestId && isUuid(resolvedGateRequestId) && supabase && typeof supabase.from === 'function') {
        const [grLookup, inqLookup] = await Promise.all([
          (async () => {
            let r = await supabase
              .from('gate_requests')
              .select('id, building_id, target_broker_id')
              .eq('id', resolvedGateRequestId)
              .maybeSingle();
            if (r?.error && (r.error.code === '42703' || r.error.code === 'PGRST204')) {
              r = await supabase
                .from('gate_requests')
                .select('id, building_id')
                .eq('id', resolvedGateRequestId)
                .maybeSingle();
            }
            return r;
          })().catch(() => ({ data: null })),
          Promise.resolve(
            supabase
              .from('im_inquiry_requests')
              .select('id, building_id, broker_user_id')
              .eq('id', resolvedGateRequestId)
              .maybeSingle()
          ).catch(() => ({ data: null })),
        ]);
        grRow = (grLookup?.data as GateRowLookup | null) ?? null;
        inqRow = (inqLookup?.data as InquiryRowLookup | null) ?? null;

        if (!grRow && !inqRow && !matchedShareLinkRow) {
          try {
            const recipientCandidates = Array.from(
              new Set([effectiveThreadId, resolvedGateRequestId, rawGateId].filter(Boolean))
            );
            let slQ = supabase
              .from('im_share_links')
              .select('token, building_id, broker_id') as unknown as {
              in?: (col: string, vals: string[]) => unknown;
              eq: (col: string, val: string) => unknown;
              limit?: (n: number) => unknown;
              maybeSingle?: () => Promise<{ data?: ShareLinkRowLookup | null }>;
            };
            if (typeof slQ.in === 'function') {
              slQ = slQ.in('recipient_id', recipientCandidates) as typeof slQ;
            } else if (typeof slQ.eq === 'function') {
              slQ = slQ.eq('recipient_id', resolvedGateRequestId) as typeof slQ;
            }
            if (typeof slQ.limit === 'function') {
              slQ = slQ.limit(1) as typeof slQ;
            }
            const slRes =
              typeof slQ.maybeSingle === 'function'
                ? await slQ.maybeSingle()
                : await (slQ as unknown as Promise<{ data?: ShareLinkRowLookup[] | ShareLinkRowLookup | null }>);
            const rawSlData = slRes?.data;
            matchedShareLinkRow = Array.isArray(rawSlData) ? (rawSlData[0] ?? null) : (rawSlData ?? null);
          } catch {
            matchedShareLinkRow = null;
          }
        }
      }

      const memRecipientMatch = Object.values(memStore?.tokens || {}).find(
        (entry) =>
          entry?.recipientId &&
          (entry.recipientId === effectiveThreadId ||
            entry.recipientId === resolvedGateRequestId ||
            entry.recipientId === rawGateId)
      );

      if (!isAdmin) {
        if (token) {
          const memOwner =
            memStore?.tokens?.[token]?.brokerId ||
            memStore?.revokedTokens?.[token]?.brokerId ||
            null;
          if (memOwner && String(memOwner) !== userId) {
            return NextResponse.json(
              { ok: false, error: '다른 중개인이 발급한 공유 링크는 잠글 수 없습니다.' },
              { status: 403 }
            );
          }
          if (matchedShareLinkRow?.broker_id && String(matchedShareLinkRow.broker_id) !== userId) {
            return NextResponse.json(
              { ok: false, error: '다른 중개인이 발급한 공유 링크는 잠글 수 없습니다.' },
              { status: 403 }
            );
          }
        }

        if (grRow?.target_broker_id && String(grRow.target_broker_id) !== userId) {
          return NextResponse.json(
            { ok: false, error: '다른 중개인의 열람 요청 링크는 잠글 수 없습니다.' },
            { status: 403 }
          );
        }
        if (inqRow?.broker_user_id && String(inqRow.broker_user_id) !== userId) {
          return NextResponse.json(
            { ok: false, error: '다른 중개인의 문의 링크는 잠글 수 없습니다.' },
            { status: 403 }
          );
        }
        if (matchedShareLinkRow?.broker_id && String(matchedShareLinkRow.broker_id) !== userId) {
          return NextResponse.json(
            { ok: false, error: '다른 중개인이 발급한 공유 링크는 잠글 수 없습니다.' },
            { status: 403 }
          );
        }
        if (memRecipientMatch?.brokerId && String(memRecipientMatch.brokerId) !== userId) {
          return NextResponse.json(
            { ok: false, error: '다른 중개인이 발급한 공유 링크는 잠글 수 없습니다.' },
            { status: 403 }
          );
        }

        // Prevent supplying caller's own buildingId to bypass ownership check on a foreign gate_request/inquiry row
        if (buildingId && grRow?.building_id && buildingId !== String(grRow.building_id)) {
          return NextResponse.json(
            { ok: false, error: '대상 매물과 열람 요청의 매물 정보가 일치하지 않습니다.' },
            { status: 403 }
          );
        }
        if (buildingId && inqRow?.building_id && buildingId !== String(inqRow.building_id)) {
          return NextResponse.json(
            { ok: false, error: '대상 매물과 문의의 매물 정보가 일치하지 않습니다.' },
            { status: 403 }
          );
        }

        const rowBuildingId = String(
          buildingId ||
            grRow?.building_id ||
            inqRow?.building_id ||
            matchedShareLinkRow?.building_id ||
            memRecipientMatch?.buildingId ||
            ''
        ).trim();

        const hasNullBrokerOnGr = Boolean(grRow && !grRow.target_broker_id);
        const hasNullBrokerOnInq = Boolean(inqRow && !inqRow.broker_user_id);

        // Fail closed when gate_request/inquiry lacks explicit broker owner and has no building to verify
        if ((hasNullBrokerOnGr || hasNullBrokerOnInq) && !rowBuildingId) {
          return NextResponse.json(
            { ok: false, error: '열람 요청의 소유 중개인을 확인할 수 없습니다.' },
            { status: 403 }
          );
        }

        let verifiedBuildingOwner: string | null = null;
        if (rowBuildingId) {
          const mustExistInDb =
            hasNullBrokerOnGr ||
            hasNullBrokerOnInq ||
            Boolean(!grRow && !inqRow && !matchedShareLinkRow && !memRecipientMatch);
          const ownCheck = await verifyBuildingOwnershipForRevoke(supabase, {
            buildingId: rowBuildingId,
            userId,
            isAdmin,
            requireExisting: mustExistInDb,
          });
          if (!ownCheck.ok) {
            return ownCheck.response;
          }
          verifiedBuildingOwner = ownCheck.verifiedOwnerId;
        }

        if (hasNullBrokerOnGr && !verifiedBuildingOwner) {
          return NextResponse.json(
            { ok: false, error: '열람 요청의 소유 중개인을 확인할 수 없습니다.' },
            { status: 403 }
          );
        }

        if (
          resolvedGateRequestId &&
          isUuid(resolvedGateRequestId) &&
          !grRow &&
          !inqRow &&
          !matchedShareLinkRow &&
          !memRecipientMatch &&
          !verifiedBuildingOwner
        ) {
          return NextResponse.json(
            { ok: false, error: '대상 열람 요청 또는 공유 링크를 찾을 수 없습니다.' },
            { status: 404 }
          );
        }

        if (rowBuildingId) {
          resolvedBuildingId = rowBuildingId;
        }
      } else {
        const rowBuildingId = String(
          buildingId ||
            grRow?.building_id ||
            inqRow?.building_id ||
            matchedShareLinkRow?.building_id ||
            memRecipientMatch?.buildingId ||
            ''
        ).trim();
        if (rowBuildingId) {
          resolvedBuildingId = rowBuildingId;
        }
      }

      if (effectiveThreadId.startsWith('view_') && !isAdmin) {
        const viewOwn = await verifyBrokerOwnership({
          userId,
          isAdmin,
          buildingId: resolvedBuildingId,
          threadId: effectiveThreadId,
          action: 'revoke_link',
        });
        if (!viewOwn.allowed) {
          return NextResponse.json(
            { ok: false, error: viewOwn.reason || '다른 중개인의 열람 링크는 잠글 수 없습니다.' },
            { status: viewOwn.status || 403 }
          );
        }
      }

      if (!resolvedBuildingId && !token) {
        return NextResponse.json(
          { ok: false, error: '잠글 링크 토큰 또는 대상 매물 ID(buildingId)가 필요합니다.' },
          { status: 400 }
        );
      }

      if (effectiveThreadId) {
        await revokeRecipientShareLinkTokens(effectiveThreadId, { brokerId: userId, supabase });
        if (rawGateId && rawGateId !== effectiveThreadId) {
          await revokeRecipientShareLinkTokens(rawGateId, { brokerId: userId, supabase });
        }
      }

      if (token) {
        const revokeTokenRes = await revokeShareLinkToken({
          scope: 'thread',
          token,
          buildingId: resolvedBuildingId || undefined,
          brokerId: userId,
          threadId: effectiveThreadId || undefined,
          gateRequestId: resolvedGateRequestId || undefined,
          reason,
          isAdmin,
        });
        if (!revokeTokenRes.ok) {
          return NextResponse.json(
            { ok: false, error: revokeTokenRes.error || '링크 잠금 처리에 실패했습니다.' },
            { status: revokeTokenRes.status || 400 }
          );
        }
      }

      try {
        if (supabase && resolvedGateRequestId && isUuid(resolvedGateRequestId)) {
          try {
            let grUpdQ = supabase
              .from('gate_requests')
              .update({ status: 'revoked' })
              .eq('id', resolvedGateRequestId);
            if (isUuid(resolvedBuildingId)) {
              grUpdQ = grUpdQ.eq('building_id', resolvedBuildingId);
            }
            const grUpdRes = await grUpdQ;
            if (grUpdRes?.error?.code === '23514') {
              let grFallbackQ = supabase
                .from('gate_requests')
                .update({ status: 'rejected' })
                .eq('id', resolvedGateRequestId);
              if (isUuid(resolvedBuildingId)) {
                grFallbackQ = grFallbackQ.eq('building_id', resolvedBuildingId);
              }
              await grFallbackQ;
            }
          } catch {
            // ignore if gate_requests unavailable
          }

          try {
            let inqUpd = supabase
              .from('im_inquiry_requests')
              .update({ status: 'revoked' })
              .eq('id', resolvedGateRequestId);
            if (isUuid(resolvedBuildingId)) {
              inqUpd = inqUpd.eq('building_id', resolvedBuildingId);
            }
            if (!isAdmin) {
              inqUpd = inqUpd.eq('broker_user_id', userId);
            }
            await inqUpd;
          } catch {
            // ignore if im_inquiry_requests unavailable
          }
        }

        const entityUuid =
          resolvedBuildingId && isUuid(resolvedBuildingId)
            ? resolvedBuildingId
            : resolvedGateRequestId && isUuid(resolvedGateRequestId)
              ? resolvedGateRequestId
              : isUuid(userId)
                ? userId
                : null;

        if (supabase && !token) {
          await supabase.from('activity_events').insert({
            actor_id: isUuid(userId) ? userId : null,
            event_type: 'thread_link_revoked',
            entity_type: 'building',
            entity_id: entityUuid,
            metadata: {
              scope: 'thread',
              gate_request_id: resolvedGateRequestId || null,
              thread_id: effectiveThreadId || null,
              building_id: resolvedBuildingId || null,
              share_token: null,
              reason,
              revoked: true,
            },
          });
        }
      } catch {
        // Non-blocking audit fallback in test env
      }

      return NextResponse.json({
        ok: true,
        revoked: true,
        scope: 'thread',
        status: 'revoked',
        token: token || undefined,
        buildingId: resolvedBuildingId || undefined,
        threadId: effectiveThreadId || undefined,
        gateRequestId: resolvedGateRequestId || undefined,
        revokedAt,
      });
    }

    if (!token && !buildingId) {
      return NextResponse.json(
        { ok: false, error: '잠글 링크 토큰 또는 대상 매물 ID(buildingId)가 필요합니다.' },
        { status: 400 }
      );
    }

    // Building-scoped ownership validation
    if (buildingId && !isAdmin) {
      const ownCheck = await verifyBuildingOwnershipForRevoke(supabase, {
        buildingId,
        userId,
        isAdmin,
        requireExisting: false,
      });
      if (!ownCheck.ok) {
        return ownCheck.response;
      }
    }

    if (token || buildingId) {
      const result = await revokeShareLinkToken({
        scope: 'building',
        token: token || undefined,
        buildingId: buildingId || undefined,
        brokerId: userId,
        threadId: effectiveThreadId || undefined,
        reason,
        isAdmin,
      });

      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.error || '링크 잠금 처리에 실패했습니다.' },
          { status: result.status || 400 }
        );
      }

      resolvedBuildingId = result.buildingId || buildingId;
      revokedAt = result.revokedAt || revokedAt;
    }

    // INBOX-07 & C-S1-02: Sync document_objects.body.is_revoked (only on building-wide lock, never per-recipient token)
    try {
      const supabase = createServiceClient();

      if ((rawScope === 'building' || !token) && resolvedBuildingId && isUuid(resolvedBuildingId)) {
        const { data: latestDoc } = await supabase
          .from('document_objects')
          .select('id, body')
          .eq('building_id', resolvedBuildingId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestDoc?.id) {
          const nextBody = {
            ...(latestDoc.body || {}),
            is_revoked: true,
            revoked_at: revokedAt,
          };
          await supabase
            .from('document_objects')
            .update({ body: nextBody })
            .eq('id', latestDoc.id);
        }
      }
    } catch {
      // Non-blocking fallback
    }

    return NextResponse.json({
      ok: true,
      revoked: true,
      scope: 'building',
      status: 'revoked',
      token: token || undefined,
      buildingId: resolvedBuildingId || undefined,
      threadId: effectiveThreadId || undefined,
      revokedAt,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || '링크 잠금 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
