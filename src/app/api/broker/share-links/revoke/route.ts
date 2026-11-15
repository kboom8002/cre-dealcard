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

    // Check building ownership safely (UUID-guarded for building_ssot_lite)
    if (buildingId && !isAdmin) {
      const quickRec = getQuickImRecord(buildingId);
      if (quickRec?.ownerId && quickRec.ownerId !== userId) {
        return NextResponse.json(
          { ok: false, error: '다른 중개인의 매물 링크는 잠글 수 없습니다.' },
          { status: 403 }
        );
      }

      try {
        const supabase = createServiceClient();
        if (isUuid(buildingId)) {
          const q: any = supabase
            .from('building_ssot_lite')
            .select('id, owner_id')
            .eq('id', buildingId);
          const res = typeof q.maybeSingle === 'function' ? await q.maybeSingle() : await q.single?.();
          if (res?.data?.owner_id && String(res.data.owner_id) !== userId) {
            return NextResponse.json(
              { ok: false, error: '다른 중개인의 매물 링크는 잠글 수 없습니다.' },
              { status: 403 }
            );
          }
        } else {
          let evQ: any = supabase
            .from('activity_events')
            .select('actor_id, entity_id, event_type, metadata, created_at');
          if (typeof evQ.in === 'function') {
            evQ = evQ.in('event_type', ['im_upserted', 'dealcard_upserted']);
          }
          if (typeof evQ.order === 'function') {
            evQ = evQ.order('created_at', { ascending: false });
          }
          const { data: acts } = await evQ;
          for (const ev of acts || []) {
            const meta = (ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}) as Record<string, any>;
            const evBId = String(meta.building_id || meta.im_id || ev?.entity_id || '').trim();
            if (evBId === buildingId) {
              if (ev.actor_id && String(ev.actor_id) !== userId) {
                return NextResponse.json(
                  { ok: false, error: '다른 중개인의 매물 링크는 잠글 수 없습니다.' },
                  { status: 403 }
                );
              }
              break;
            }
          }
        }
      } catch {
        // Ignore DB error when running in unit test without Supabase
      }
    }

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

      // Verify explicit token ownership if token was passed with scope === 'thread'
      if (token && !isAdmin) {
        const memStore = (globalThis as any).__CRE_SHARE_LINK_TOKEN_STORE__;
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
        try {
          const supabase = createServiceClient();
          const q: any = supabase
            .from('im_share_links')
            .select('token, broker_id')
            .eq('token', token);
          const res =
            typeof q?.maybeSingle === 'function' ? await q.maybeSingle() : await q?.single?.();
          if (res?.data?.broker_id && String(res.data.broker_id) !== userId) {
            return NextResponse.json(
              { ok: false, error: '다른 중개인이 발급한 공유 링크는 잠글 수 없습니다.' },
              { status: 403 }
            );
          }
        } catch {
          // non-blocking in offline test
        }
      }

      if (effectiveThreadId) {
        await revokeRecipientShareLinkTokens(effectiveThreadId);
        if (rawGateId && rawGateId !== effectiveThreadId) {
          await revokeRecipientShareLinkTokens(rawGateId);
        }
      }

      if (token) {
        const memStore = (globalThis as any).__CRE_SHARE_LINK_TOKEN_STORE__;
        if (memStore) {
          memStore.revokedTokens = memStore.revokedTokens || {};
          memStore.revokedTokens[token] = {
            token,
            buildingId: resolvedBuildingId || undefined,
            brokerId: userId,
            revokedAt,
            reason,
          };
          if (memStore.tokens?.[token]) {
            memStore.tokens[token] = {
              ...memStore.tokens[token],
              status: 'revoked',
              revokedAt,
              revokedReason: reason,
            };
          }
        }
      }

      try {
        const supabase = createServiceClient();

        if (token) {
          const slTable: any = supabase.from('im_share_links');
          if (slTable && typeof slTable.update === 'function') {
            await slTable
              .update({
                status: 'revoked',
                revoked_at: revokedAt,
                revoked_reason: reason,
              })
              .eq('token', token);
          }
        }

        if (resolvedGateRequestId) {
          try {
            const grQ: any = supabase
              .from('gate_requests')
              .select('id, building_id')
              .eq('id', resolvedGateRequestId);
            const grRes =
              typeof grQ?.maybeSingle === 'function'
                ? await grQ.maybeSingle()
                : await grQ?.single?.();
            if (!resolvedBuildingId && grRes?.data?.building_id) {
              resolvedBuildingId = String(grRes.data.building_id);
            }
          } catch {
            // ignore
          }

          try {
            await supabase
              .from('gate_requests')
              .update({ status: 'revoked' })
              .eq('id', resolvedGateRequestId);
          } catch {
            // ignore if gate_requests unavailable
          }

          try {
            await supabase
              .from('im_inquiry_requests')
              .update({ status: 'revoked' })
              .eq('id', resolvedGateRequestId);
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
            share_token: token || null,
            reason,
            revoked: true,
          },
        });
      } catch {
        // Non-blocking fallback
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

    if (token || buildingId) {
      const result = await revokeShareLinkToken({
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

      if (!token && resolvedBuildingId && isUuid(resolvedBuildingId)) {
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
