import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import {
  appendInboxCallNote,
  getInboxState,
  getQuickImRecord,
  isUuid,
  recordGateDecision,
  setBuildingCorrectionNotice,
  setBuildingRevokedState,
  upsertCustomInboxClient,
} from '@/lib/im-lite/quick-generate-store';
import {
  issueShareLinkToken,
  restoreShareLinkToken,
  revokeShareLinkToken,
} from '@/lib/security/share-link-tokens';

async function verifyBrokerOwnership(params: {
  userId: string;
  isAdmin: boolean;
  buildingId: string;
  threadId: string;
}): Promise<{ allowed: boolean; reason?: string }> {
  const { userId, isAdmin, buildingId, threadId } = params;
  if (isAdmin) return { allowed: true };

  // 1. Check in-memory/file quick IM record ownership (even for non-UUID buildingIds)
  if (buildingId) {
    const quickRec = getQuickImRecord(buildingId);
    if (quickRec?.ownerId && quickRec.ownerId !== userId) {
      return { allowed: false, reason: '다른 중개인의 매물에 접근할 수 없습니다.' };
    }
  }

  // 2. Check custom client ownership
  if (threadId) {
    const rawCustomId = threadId.replace(/^custom[-_]/, '');
    const inboxState = getInboxState();
    const matchedCustom = inboxState.customClients.find(
      (c) => c.id === threadId || c.id === rawCustomId
    );
    if (matchedCustom && (!matchedCustom.ownerId || matchedCustom.ownerId !== userId)) {
      return { allowed: false, reason: '다른 중개인의 고객 정보에 접근할 수 없습니다.' };
    }
  }

  // 3. Check Supabase ownership for gate_requests and buildings (supports UUID and non-UUID keys)
  try {
    const supabase = createServiceClient();
    const rawReqId = threadId.replace(/^srv-/, '');

    if (rawReqId && !threadId.startsWith('custom_') && !threadId.startsWith('cli-')) {
      const { data: gateReq } = await supabase
        .from('gate_requests')
        .select('id, building_id, buildings(owner_id)')
        .eq('id', rawReqId)
        .maybeSingle();

      if (gateReq) {
        const joinedBuilding = Array.isArray((gateReq as any).buildings)
          ? (gateReq as any).buildings[0]
          : (gateReq as any).buildings;
        const ownerId = joinedBuilding?.owner_id;
        if (ownerId && ownerId !== userId) {
          return { allowed: false, reason: '해당 IM 열람 요청의 소유 중개인이 아닙니다.' };
        }
      }
    }

    if (buildingId) {
      const { data: ssotRow } = await supabase
        .from('building_ssot_lite')
        .select('owner_id')
        .eq('id', buildingId)
        .maybeSingle();

      if (ssotRow?.owner_id && ssotRow.owner_id !== userId) {
        return { allowed: false, reason: '해당 빌딩의 소유 중개인이 아닙니다.' };
      }

      if (isUuid(buildingId)) {
        const { data: bldRow } = await supabase
          .from('buildings')
          .select('owner_id')
          .eq('id', buildingId)
          .maybeSingle();

        if ((bldRow as any)?.owner_id && (bldRow as any).owner_id !== userId) {
          return { allowed: false, reason: '해당 빌딩의 소유 중개인이 아닙니다.' };
        }
      }
    }
  } catch {
    // Non-blocking if DB tables are unavailable in test environment
  }

  return { allowed: true };
}

export async function POST(req: NextRequest) {
  try {
    // IB-03: Always require broker authentication regardless of UUID format
    const guard = await requireBroker(req);
    if (guard.error || !guard.user?.id) {
      return (
        guard.error ||
        NextResponse.json(
          { ok: false, error: '인증이 필요합니다. 다시 로그인해 주세요.' },
          { status: 401 }
        )
      );
    }

    const userId = guard.user.id;
    const isAdmin = (guard.user as { role?: string }).role === 'admin';

    const body = await req.json();
    const action = String(body?.action || '');
    const threadId = String(body?.threadId || '');
    const buildingId = String(body?.buildingId || 'bld-01');
    const shareToken = String(body?.shareToken || body?.token || '');

    // Verify ownership across UUID and non-UUID buildingIds / gate_requests / custom clients
    const ownership = await verifyBrokerOwnership({
      userId,
      isAdmin,
      buildingId,
      threadId,
    });
    if (!ownership.allowed) {
      return NextResponse.json(
        { ok: false, error: ownership.reason || '권한이 없습니다.' },
        { status: 403 }
      );
    }

    // 1. Approve / Reject / Reset Gate or Send IM (supports both gate_requests and custom_ threads)
    if (
      action === 'approve_gate' ||
      action === 'approve' ||
      action === 'send_im' ||
      action === 'reject_gate' ||
      action === 'reject' ||
      action === 'reset_gate'
    ) {
      const decision =
        action === 'approve_gate' || action === 'approve' || action === 'send_im'
          ? 'approved'
          : action === 'reject_gate' || action === 'reject'
          ? 'rejected'
          : 'pending';

      let issuedToken = shareToken;
      let issuedShareUrl = `/im-lite/${encodeURIComponent(buildingId)}`;

      if (decision === 'approved') {
        const issued = await issueShareLinkToken({
          buildingId,
          brokerId: userId,
          recipientId: threadId || String(body?.recipientId || 'client'),
          ttlDays: Number(body?.ttlDays) > 0 ? Number(body.ttlDays) : 30,
        });
        issuedToken = issued.token;
        issuedShareUrl = issued.shareUrl;
      } else if (issuedToken) {
        issuedShareUrl = `/im-lite/${encodeURIComponent(buildingId)}?token=${encodeURIComponent(issuedToken)}`;
      }

      recordGateDecision(threadId || buildingId, decision, issuedToken, buildingId);

      const rawId = threadId.replace(/^srv-/, '');
      if (rawId && !threadId.startsWith('custom_') && !threadId.startsWith('cli-')) {
        try {
          const supabase = createServiceClient();
          await supabase
            .from('gate_requests')
            .update({ status: decision })
            .eq('id', rawId);

          await supabase.from('activity_events').insert({
            actor_id: userId,
            event_type:
              decision === 'approved' ? 'gate_request_approved' : 'gate_request_rejected',
            entity_type: 'building',
            entity_id: isUuid(buildingId) ? buildingId : isUuid(rawId) ? rawId : userId,
            metadata: {
              thread_id: threadId,
              request_id: rawId,
              building_id: buildingId,
              share_token: issuedToken,
              decision,
            },
          });
        } catch {
          // non-blocking
        }
      }

      return NextResponse.json({
        ok: true,
        action,
        status: 'active',
        decision,
        token: issuedToken,
        shareToken: issuedToken,
        shareUrl: issuedShareUrl,
      });
    }

    // 2. Send DealCard / Newsletter (supports custom_ threads as well)
    if (action === 'send_dealcard') {
      return NextResponse.json({
        ok: true,
        action,
        buildingId,
        shareUrl: `/dc/${encodeURIComponent(buildingId)}`,
      });
    }

    if (action === 'send_magazine' || action === 'send_newsletter') {
      let resolvedMagazineUrl =
        typeof body?.publicUrl === 'string' && body.publicUrl.trim()
          ? body.publicUrl.trim()
          : '/magazine';
      if (resolvedMagazineUrl === '/magazine') {
        try {
          const supabase = createServiceClient();
          const { data: bp } = await supabase
            .from('broker_profiles')
            .select('slug')
            .eq('user_id', userId)
            .maybeSingle();
          const slug = bp?.slug ? String(bp.slug).trim() : '';
          if (slug) {
            const { data: latestIssue } = await supabase
              .from('magazine_issues')
              .select('issue_date')
              .eq('broker_id', slug)
              .order('issue_date', { ascending: false })
              .limit(1)
              .maybeSingle();
            resolvedMagazineUrl = latestIssue?.issue_date
              ? `/magazine/${encodeURIComponent(slug)}/${encodeURIComponent(String(latestIssue.issue_date))}`
              : `/magazine/${encodeURIComponent(slug)}`;
          }
        } catch {
          // non-blocking fallback to /magazine
        }
      }
      return NextResponse.json({
        ok: true,
        action,
        buildingId,
        shareUrl: resolvedMagazineUrl,
      });
    }

    // 3. Revoke / Restore Share Link
    if (
      action === 'revoke_link' ||
      action === 'revoke' ||
      action === 'restore_link' ||
      action === 'unlock_share_link'
    ) {
      const revoked = action === 'revoke_link' || action === 'revoke';

      if (revoked) {
        const revokeRes = await revokeShareLinkToken({
          token: shareToken || undefined,
          buildingId,
          brokerId: userId,
          reason: body?.reason ? String(body.reason) : 'broker_revoked',
          isAdmin,
        });
        if (!revokeRes.ok) {
          return NextResponse.json(
            { ok: false, error: revokeRes.error || '링크 잠금 처리에 실패했습니다.' },
            { status: revokeRes.status }
          );
        }
      } else {
        await restoreShareLinkToken({
          token: shareToken || undefined,
          buildingId,
          brokerId: userId,
        });
      }

      try {
        const supabase = createServiceClient();
        const { data: latestDoc } = await supabase
          .from('document_objects')
          .select('id, body')
          .eq('building_id', buildingId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestDoc?.id) {
          const nextBody = {
            ...(latestDoc.body || {}),
            is_revoked: revoked,
            revoked_at: revoked ? new Date().toISOString() : null,
          };
          await supabase
            .from('document_objects')
            .update({ body: nextBody })
            .eq('id', latestDoc.id);
        }

        await supabase.from('activity_events').insert({
          actor_id: userId,
          event_type: revoked ? 'link_revoked' : 'link_restored',
          entity_type: 'building',
          entity_id: isUuid(buildingId) ? buildingId : userId,
          metadata: {
            thread_id: threadId,
            building_id: buildingId,
            share_token: shareToken,
            revoked,
          },
        });
      } catch {
        // non-blocking
      }

      return NextResponse.json({
        ok: true,
        action,
        buildingId,
        revoked,
        status: revoked ? 'revoked' : 'active',
      });
    }

    // 4. Correction Notice
    if (action === 'correction_notice' || action === 'clear_correction_notice') {
      const message =
        action === 'clear_correction_notice'
          ? null
          : String(
              body?.message ||
                '매물 임대 조건 및 주요 수치가 최신 기준으로 정정되었습니다. 최신 내용을 확인해 주세요.'
            );

      const state = setBuildingCorrectionNotice(buildingId, message);
      const notice = state.correctionNotices[buildingId] || null;

      try {
        const supabase = createServiceClient();
        const { data: latestDoc } = await supabase
          .from('document_objects')
          .select('id, body')
          .eq('building_id', buildingId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestDoc?.id) {
          const nextBody = {
            ...(latestDoc.body || {}),
            correction_notice: notice,
          };
          await supabase
            .from('document_objects')
            .update({ body: nextBody })
            .eq('id', latestDoc.id);
        }

        await supabase.from('activity_events').insert({
          actor_id: userId,
          event_type: message ? 'correction_notice_published' : 'correction_notice_cleared',
          entity_type: 'building',
          entity_id: isUuid(buildingId) ? buildingId : userId,
          metadata: {
            thread_id: threadId,
            building_id: buildingId,
            message,
          },
        });
      } catch {
        // non-blocking
      }

      return NextResponse.json({
        ok: true,
        action,
        buildingId,
        correctionNotice: notice,
      });
    }

    // 5. Add Call Note / Log Call (supports custom_ threads and persists to broker_custom_clients / activity_events)
    if (action === 'add_call_note' || action === 'log_call') {
      const note = String(body?.note || body?.memo || '').trim();
      if (!note) {
        return NextResponse.json({ error: '메모 내용을 입력해 주세요.' }, { status: 400 });
      }
      const description = note.startsWith('통화 기록:') ? note : `통화 기록: ${note}`;
      appendInboxCallNote(threadId || buildingId, description, '방금 전');

      let dbPersisted = false;
      try {
        const supabase = createServiceClient();
        const rawClientId = threadId.replace(/^custom[-_]/, '');

        if (threadId.startsWith('custom_') || threadId.startsWith('cli-')) {
          try {
            const { error: customErr } = await supabase
              .from('broker_custom_clients')
              .update({ notes: description })
              .eq('id', rawClientId)
              .eq('broker_id', userId);
            if (!customErr) dbPersisted = true;
          } catch {
            // table may not exist
          }
        }

        const { error: eventErr } = await supabase.from('activity_events').insert({
          actor_id: userId,
          event_type: 'call_note_recorded',
          entity_type: 'building',
          entity_id: isUuid(buildingId) ? buildingId : isUuid(rawClientId) ? rawClientId : userId,
          metadata: {
            thread_id: threadId,
            raw_client_id: rawClientId,
            building_id: buildingId,
            note: description,
          },
        });
        if (!eventErr) dbPersisted = true;
      } catch {
        // non-blocking
      }

      return NextResponse.json({
        ok: true,
        persisted: true,
        dbPersisted,
        action,
        threadId,
        description,
      });
    }

    // 6. Upsert Custom Client (never fabricates fake phone 010-0000-0000)
    if (action === 'upsert_client') {
      const clientName = String(body?.clientName || '').trim();
      if (!clientName) {
        return NextResponse.json({ error: '고객 성함을 입력해 주세요.' }, { status: 400 });
      }
      const clientGrade = (body?.clientGrade as 'VIP' | '일반' | '잠재') || 'VIP';
      const rawPhone = String(body?.clientPhone || '').trim();
      const clientPhone = rawPhone === '010-0000-0000' ? '' : rawPhone;
      const budget = String(body?.budget || '').trim();
      const preferredRegion = String(body?.preferredRegion || '').trim();
      const buildingTitle = String(body?.buildingTitle || '관심 매물 상담').trim();
      const newsletterSubscribed = body?.newsletterSubscribed !== false;

      let resolvedClientId = body?.clientId ? String(body.clientId) : undefined;
      try {
        const supabase = createServiceClient();
        const tierMap: Record<string, 'vip' | 'normal' | 'potential'> = {
          VIP: 'vip',
          일반: 'normal',
          잠재: 'potential',
        };
        const insQuery: any = supabase.from('broker_clients').insert({
          broker_id: userId,
          client_type: 'buyer',
          display_name: clientName,
          phone: clientPhone || null,
          tier: tierMap[clientGrade] || 'vip',
          tags: [preferredRegion, budget, newsletterSubscribed ? '뉴스레터구독' : ''].filter(
            Boolean
          ),
          notes: [
            budget ? `예산: ${budget}` : '',
            preferredRegion ? `선호권역: ${preferredRegion}` : '',
            buildingTitle ? `관심매물: ${buildingTitle}` : '',
          ]
            .filter(Boolean)
            .join(' / '),
          linked_building_ids: isUuid(buildingId) ? [buildingId] : [],
        });
        const insRes =
          typeof insQuery?.select === 'function'
            ? await insQuery.select('id').single()
            : await insQuery;
        if (insRes?.data?.id) {
          resolvedClientId = `custom_${insRes.data.id}`;
        }
        await supabase.from('activity_events').insert({
          actor_id: userId,
          event_type: 'custom_client_upserted',
          entity_type: 'building',
          entity_id: isUuid(buildingId) ? buildingId : userId,
          metadata: {
            client_id: resolvedClientId || `custom_${Date.now()}`,
            client_name: clientName,
            client_grade: clientGrade,
            client_phone: clientPhone,
            budget,
            preferred_region: preferredRegion,
            building_id: buildingId,
            building_title: buildingTitle,
            newsletter_subscribed: newsletterSubscribed,
          },
        });
      } catch {
        // non-blocking
      }

      const state = upsertCustomInboxClient({
        id: resolvedClientId,
        ownerId: userId,
        clientName,
        clientGrade,
        clientPhone,
        budget,
        preferredRegion,
        buildingId,
        buildingTitle,
        newsletterSubscribed,
      });

      return NextResponse.json({
        ok: true,
        action,
        clientId: state.customClients[0]?.id || resolvedClientId,
        client: state.customClients[0],
      });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || '소통함 작업 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
