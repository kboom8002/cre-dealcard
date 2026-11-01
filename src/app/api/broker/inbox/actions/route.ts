import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import {
  appendInboxCallNote,
  isUuid,
  recordGateDecision,
  setBuildingCorrectionNotice,
  setBuildingRevokedState,
  upsertCustomInboxClient,
} from '@/lib/im-lite/quick-generate-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body?.action || '');
    const threadId = String(body?.threadId || '');
    const buildingId = String(body?.buildingId || 'bld-01');
    const shareToken = String(body?.shareToken || `tok-${buildingId}`);

    // Only call Supabase requireBroker when operating on UUID entities or syncing DB clients
    const rawReqId = threadId.replace(/^srv-/, '');
    const needsSupabaseSync =
      isUuid(buildingId) || isUuid(rawReqId) || action === 'upsert_client';
    const guard = needsSupabaseSync ? await requireBroker(req) : { user: null, error: null };
    const userId = guard.user?.id || null;

    if (action === 'approve_gate' || action === 'reject_gate' || action === 'reset_gate') {
      const decision =
        action === 'approve_gate'
          ? 'approved'
          : action === 'reject_gate'
          ? 'rejected'
          : 'pending';
      const issuedToken =
        decision === 'approved'
          ? shareToken || `g2-${buildingId.slice(0, 8)}-${Date.now().toString(36)}`
          : shareToken;

      recordGateDecision(threadId || buildingId, decision, issuedToken, buildingId);

      const rawId = threadId.replace(/^srv-/, '');
      if (userId && isUuid(rawId)) {
        try {
          const supabase = createServiceClient();
          await supabase
            .from('gate_requests')
            .update({ status: decision })
            .eq('id', rawId);

          await supabase.from('activity_events').insert({
            actor_id: userId,
            event_type: decision === 'approved' ? 'gate_request_approved' : 'gate_request_rejected',
            entity_type: 'building',
            entity_id: isUuid(buildingId) ? buildingId : rawId,
            metadata: {
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
        shareToken: issuedToken,
        shareUrl: `/im-lite/${buildingId}?token=${encodeURIComponent(issuedToken)}`,
      });
    }

    if (action === 'revoke_link' || action === 'restore_link') {
      const revoked = action === 'revoke_link';
      setBuildingRevokedState(buildingId, revoked, shareToken);

      if (userId && isUuid(buildingId)) {
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
        } catch {
          // non-blocking
        }
      }

      return NextResponse.json({
        ok: true,
        action,
        buildingId,
        revoked,
        status: revoked ? 'revoked' : 'active',
      });
    }

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

      if (userId && isUuid(buildingId)) {
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
        } catch {
          // non-blocking
        }
      }

      return NextResponse.json({
        ok: true,
        action,
        buildingId,
        correctionNotice: notice,
      });
    }

    if (action === 'add_call_note') {
      const note = String(body?.note || '').trim();
      if (!note) {
        return NextResponse.json({ error: '메모 내용을 입력해 주세요.' }, { status: 400 });
      }
      const description = note.startsWith('통화 기록:') ? note : `통화 기록: ${note}`;
      appendInboxCallNote(threadId || buildingId, description, '방금 전');

      if (userId) {
        try {
          const supabase = createServiceClient();
          await supabase.from('activity_events').insert({
            actor_id: userId,
            event_type: 'call_note_recorded',
            entity_type: 'building',
            entity_id: isUuid(buildingId) ? buildingId : userId,
            metadata: {
              thread_id: threadId,
              building_id: buildingId,
              note: description,
            },
          });
        } catch {
          // non-blocking
        }
      }

      return NextResponse.json({
        ok: true,
        action,
        threadId,
        description,
      });
    }

    if (action === 'upsert_client') {
      const clientName = String(body?.clientName || '').trim();
      if (!clientName) {
        return NextResponse.json({ error: '고객 성함을 입력해 주세요.' }, { status: 400 });
      }
      const clientGrade = (body?.clientGrade as 'VIP' | '일반' | '잠재') || 'VIP';
      const clientPhone = String(body?.clientPhone || '010-0000-0000').trim();
      const budget = String(body?.budget || '100억 내외').trim();
      const preferredRegion = String(body?.preferredRegion || '서울 주요 역세권').trim();
      const buildingTitle = String(body?.buildingTitle || '관심 매물 상담').trim();
      const newsletterSubscribed = body?.newsletterSubscribed !== false;

      const state = upsertCustomInboxClient({
        id: body?.clientId,
        ownerId: userId || undefined,
        clientName,
        clientGrade,
        clientPhone,
        budget,
        preferredRegion,
        buildingId,
        buildingTitle,
        newsletterSubscribed,
      });

      if (userId) {
        try {
          const supabase = createServiceClient();
          const tierMap: Record<string, 'vip' | 'normal' | 'potential'> = {
            VIP: 'vip',
            일반: 'normal',
            잠재: 'potential',
          };
          await supabase.from('broker_clients').insert({
            broker_id: userId,
            client_type: 'buyer',
            display_name: clientName,
            phone: clientPhone,
            tier: tierMap[clientGrade] || 'vip',
            tags: [preferredRegion, budget, newsletterSubscribed ? '소식지구독' : ''].filter(Boolean),
            notes: `예산: ${budget} / 선호권역: ${preferredRegion} / 관심매물: ${buildingTitle}`,
            linked_building_ids: isUuid(buildingId) ? [buildingId] : [],
          });
        } catch {
          // non-blocking
        }
      }

      return NextResponse.json({
        ok: true,
        action,
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
