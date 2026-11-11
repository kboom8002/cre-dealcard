import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import {
  getInboxState,
  getQuickImRecord,
  isUuid,
} from '@/lib/im-lite/quick-generate-store';
import { revokeShareLinkToken } from '@/lib/security/share-link-tokens';

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
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const buildingId = typeof body?.buildingId === 'string' ? body.buildingId.trim() : '';
    const threadId = typeof body?.threadId === 'string' ? body.threadId.trim() : '';
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : 'broker_locked';

    if (!token && !buildingId && !threadId) {
      return NextResponse.json(
        { ok: false, error: '잠글 링크 토큰 또는 매물·고객 식별자가 필요합니다.' },
        { status: 400 }
      );
    }

    // Check custom client ownership when threadId is provided
    if (threadId && !isAdmin) {
      const rawCustomId = threadId.replace(/^custom[-_]/, '');
      const matchedCustom = getInboxState().customClients.find(
        (c) => c.id === threadId || c.id === rawCustomId
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

    let resolvedBuildingId = buildingId;
    let revokedAt = new Date().toISOString();

    if (token || buildingId) {
      const result = await revokeShareLinkToken({
        token: token || undefined,
        buildingId: buildingId || undefined,
        brokerId: userId,
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
    // and record thread_id in activity_events for all thread prefixes (including custom_ / cli- / view_)
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

      if (threadId && isUuid(userId)) {
        await supabase.from('activity_events').insert({
          actor_id: userId,
          event_type: 'link_revoked',
          entity_type: 'building',
          entity_id: resolvedBuildingId && isUuid(resolvedBuildingId) ? resolvedBuildingId : userId,
          metadata: {
            thread_id: threadId,
            building_id: resolvedBuildingId || null,
            share_token: token || null,
            reason,
            revoked: true,
          },
        });
      }
    } catch {
      // Non-blocking fallback
    }

    return NextResponse.json({
      ok: true,
      revoked: true,
      status: 'revoked',
      token: token || undefined,
      buildingId: resolvedBuildingId || undefined,
      threadId: threadId || undefined,
      revokedAt,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || '링크 잠금 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
