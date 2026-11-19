import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  appendInboxCallNote,
  isUuid,
  setBuildingCorrectionNotice,
  setBuildingRevokedState,
} from '@/lib/im-lite/quick-generate-store';
import {
  restoreShareLinkToken,
  revokeShareLinkToken,
} from '@/lib/security/share-link-tokens';
import { updateWorkspaceItemState, WorkspaceRepositoryError } from '@/lib/workspace/workspace-repository';
import { isIgnorableSchemaError } from './inbox-schema-caps';

type GovernanceSupabase = ReturnType<typeof createServiceClient>;

/** WP-7.3E P2-10: input caps mirroring inbox-import.ts (memo ≤ 1000). */
export const MAX_CALL_NOTE_LENGTH = 1000;
export const MAX_CORRECTION_MESSAGE_LENGTH = 500;

async function updateLatestDocumentObjectBody(
  supabase: GovernanceSupabase,
  params: {
    buildingId: string;
    userId: string;
    isAdmin: boolean;
    buildNextBody: (prevBody: Record<string, any>) => Record<string, any>;
    lookupErrorMessage: string;
    updateErrorMessage: string;
  }
): Promise<NextResponse | null> {
  const { buildingId, userId, isAdmin, buildNextBody, lookupErrorMessage, updateErrorMessage } = params;
  const scopeOwner = !isAdmin && isUuid(userId);

  let lookupQ: any = supabase
    .from('document_objects')
    .select('id, body')
    .eq('building_id', buildingId);
  if (scopeOwner) {
    lookupQ = lookupQ.eq('owner_id', userId);
  }
  const { data: latestDoc, error: docLookupErr } = await lookupQ
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (docLookupErr && !isIgnorableSchemaError(docLookupErr)) {
    return NextResponse.json(
      { ok: false, persisted: false, error: lookupErrorMessage },
      { status: 500 }
    );
  }

  if (latestDoc?.id) {
    const nextBody = buildNextBody(latestDoc.body || {});
    let updQ: any = supabase
      .from('document_objects')
      .update({ body: nextBody })
      .eq('id', latestDoc.id);
    if (scopeOwner) {
      updQ = updQ.eq('owner_id', userId);
    }
    const { error: docUpdErr } = await updQ;
    if (docUpdErr && !isIgnorableSchemaError(docUpdErr)) {
      return NextResponse.json(
        { ok: false, persisted: false, error: updateErrorMessage },
        { status: 500 }
      );
    }
  }

  return null;
}

export async function handleLinkRevokeAction(params: {
  action: string;
  userId: string;
  isAdmin: boolean;
  threadId: string;
  shareToken: string;
  body: Record<string, any>;
  buildingId: string;
}) {
  const { action, userId, isAdmin, threadId, shareToken, body } = params;
  let buildingId = params.buildingId;
  const revoked = action === 'revoke_link' || action === 'revoke';
  let loggedViaTokenHelper = false;

  if (revoked) {
    if (shareToken || buildingId) {
      const revokeRes = await revokeShareLinkToken({
        token: shareToken || undefined,
        buildingId: buildingId || undefined,
        brokerId: userId,
        threadId: threadId || undefined,
        reason: body?.reason ? String(body.reason) : 'broker_revoked',
        isAdmin,
      });
      if (!revokeRes.ok) {
        return NextResponse.json(
          { ok: false, error: revokeRes.error || '링크 잠금 처리에 실패했습니다.' },
          { status: revokeRes.status }
        );
      }
      if (!buildingId && revokeRes.buildingId) {
        buildingId = revokeRes.buildingId;
      }
      loggedViaTokenHelper = true;
    }
  } else {
    const restoreScope: 'thread' | 'building' =
      shareToken && body?.scope !== 'building' ? 'thread' : 'building';
    if (shareToken) {
      const restoreRes = await restoreShareLinkToken({
        token: shareToken,
        buildingId: buildingId || undefined,
        brokerId: userId,
        threadId: threadId || undefined,
        scope: restoreScope,
        isAdmin,
      });
      if (!restoreRes.ok) {
        return NextResponse.json(
          { ok: false, error: restoreRes.error || '링크 잠금 해제에 실패했습니다.' },
          { status: restoreRes.status || 400 }
        );
      }
      if (!buildingId && restoreRes.buildingId) {
        buildingId = restoreRes.buildingId;
      }
      loggedViaTokenHelper = true;
    } else if (buildingId) {
      const restoreRes = await restoreShareLinkToken({
        buildingId,
        brokerId: userId,
        threadId: threadId || undefined,
        scope: 'building',
        isAdmin,
      });
      if (!restoreRes.ok) {
        return NextResponse.json(
          { ok: false, error: restoreRes.error || '링크 잠금 해제에 실패했습니다.' },
          { status: restoreRes.status || 400 }
        );
      }
      loggedViaTokenHelper = true;
    }
  }

  let supabase: ReturnType<typeof createServiceClient> | null = null;
  try {
    supabase = createServiceClient();
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (
      !(
        process.env.NODE_ENV === 'test' &&
        msg.includes('getServerEnv must not be called on the client')
      )
    ) {
      return NextResponse.json(
        { ok: false, persisted: false, error: '데이터베이스 연결을 초기화할 수 없습니다.' },
        { status: 503 }
      );
    }
  }

  if (supabase) {
    if (buildingId && !shareToken) {
      try {
        await updateWorkspaceItemState(supabase, {
          id: buildingId,
          userId,
          isAdmin,
          status: revoked ? 'revoked' : 'published',
        });
      } catch (err) {
        if (err instanceof WorkspaceRepositoryError) {
          return NextResponse.json(
            { ok: false, persisted: false, error: err.message },
            { status: err.status }
          );
        }
        throw err;
      }
    }

    if (buildingId && isUuid(buildingId) && !shareToken) {
      const docErrRes = await updateLatestDocumentObjectBody(supabase, {
        buildingId,
        userId,
        isAdmin,
        buildNextBody: (prevBody) => ({
          ...prevBody,
          is_revoked: revoked,
          revoked_at: revoked ? new Date().toISOString() : null,
        }),
        lookupErrorMessage: '문서 상태를 조회하지 못했습니다.',
        updateErrorMessage: '문서 잠금 상태를 저장하지 못했습니다.',
      });
      if (docErrRes) return docErrRes;
    }

    if (isUuid(userId) && !loggedViaTokenHelper) {
      const { error: evErr } = await supabase.from('activity_events').insert({
        actor_id: userId,
        event_type: revoked ? 'link_revoked' : 'link_restored',
        entity_type: 'building',
        entity_id: buildingId && isUuid(buildingId) ? buildingId : userId,
        metadata: {
          thread_id: threadId || null,
          building_id: buildingId || null,
          share_token: shareToken || null,
          revoked,
        },
      });
      if (evErr && !isIgnorableSchemaError(evErr)) {
        return NextResponse.json(
          { ok: false, persisted: false, error: '링크 상태 이력을 저장하지 못했습니다.' },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    action,
    buildingId: buildingId || undefined,
    threadId: threadId || undefined,
    revoked,
    status: revoked ? 'revoked' : 'active',
  });
}

export async function handleCorrectionNoticeAction(params: {
  action: string;
  userId: string;
  isAdmin: boolean;
  buildingId: string;
  threadId: string;
  body: Record<string, any>;
}) {
  const { action, userId, isAdmin, buildingId, threadId, body } = params;
  const targetKey = buildingId || threadId;
  const rawMessage = typeof body?.message === 'string' ? body.message.trim() : '';
  if (action !== 'clear_correction_notice' && rawMessage.length > MAX_CORRECTION_MESSAGE_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `정정 공지는 ${MAX_CORRECTION_MESSAGE_LENGTH}자 이내로 입력해 주세요.` },
      { status: 400 }
    );
  }
  const message =
    action === 'clear_correction_notice'
      ? null
      : rawMessage ||
        '매물 임대 조건 및 주요 수치가 최신 기준으로 정정되었습니다. 최신 내용을 확인해 주세요.';

  const state = setBuildingCorrectionNotice(targetKey, message);
  const notice = state.correctionNotices[targetKey] || null;

  let supabase: ReturnType<typeof createServiceClient> | null = null;
  try {
    supabase = createServiceClient();
  } catch {
    supabase = null;
  }

  if (supabase) {
    if (buildingId) {
      try {
        await updateWorkspaceItemState(supabase, {
          id: buildingId,
          userId,
          isAdmin,
          correctionNotice: notice
            ? { message: notice.message, updatedAt: notice.updatedAt }
            : null,
        });
      } catch (err) {
        if (err instanceof WorkspaceRepositoryError) {
          return NextResponse.json(
            { ok: false, persisted: false, error: err.message },
            { status: err.status }
          );
        }
        throw err;
      }
    }

    if (buildingId && isUuid(buildingId)) {
      const docErrRes = await updateLatestDocumentObjectBody(supabase, {
        buildingId,
        userId,
        isAdmin,
        buildNextBody: (prevBody) => ({
          ...prevBody,
          correction_notice: notice,
        }),
        lookupErrorMessage: '문서 상태를 조회하지 못했습니다.',
        updateErrorMessage: '정정 공지를 문서에 저장하지 못했습니다.',
      });
      if (docErrRes) return docErrRes;
    }

    if (isUuid(userId)) {
      const { error: evErr } = await supabase.from('activity_events').insert({
        actor_id: userId,
        event_type: message ? 'correction_notice_published' : 'correction_notice_cleared',
        entity_type: 'building',
        entity_id: buildingId && isUuid(buildingId) ? buildingId : userId,
        metadata: {
          thread_id: threadId || null,
          building_id: buildingId || null,
          message,
        },
      });
      if (evErr && !isIgnorableSchemaError(evErr)) {
        return NextResponse.json(
          { ok: false, persisted: false, error: '정정 공지 이력을 저장하지 못했습니다.' },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    action,
    buildingId: buildingId || undefined,
    correctionNotice: notice,
  });
}

export async function handleCallNoteAction(params: {
  action: string;
  userId: string;
  buildingId: string;
  threadId: string;
  body: Record<string, any>;
}) {
  const { action, userId, buildingId, threadId, body } = params;
  const note = String(body?.note || body?.memo || '').trim();
  if (!note) {
    return NextResponse.json({ ok: false, error: '메모 내용을 입력해 주세요.' }, { status: 400 });
  }
  if (note.length > MAX_CALL_NOTE_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `통화 메모는 ${MAX_CALL_NOTE_LENGTH}자 이내로 입력해 주세요.` },
      { status: 400 }
    );
  }
  const description = note.startsWith('통화 기록:') ? note : `통화 기록: ${note}`;

  let dbPersisted = false;
  let supabaseClient: ReturnType<typeof createServiceClient> | null = null;
  try {
    supabaseClient = createServiceClient();
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (
      !(
        process.env.NODE_ENV === 'test' &&
        msg.includes('getServerEnv must not be called on the client')
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          persisted: false,
          error: '통화 기록 저장을 위해 데이터베이스에 연결할 수 없습니다.',
        },
        { status: 503 }
      );
    }
  }

  if (supabaseClient && isUuid(userId)) {
    const rawClientId = threadId.replace(/^(?:custom[-_]|cli-)/, '');
    const entityUuid =
      buildingId && isUuid(buildingId)
        ? buildingId
        : rawClientId && isUuid(rawClientId)
        ? rawClientId
        : userId;

    const { error: eventErr } = await supabaseClient.from('activity_events').insert({
      actor_id: userId,
      event_type: 'call_note_recorded',
      entity_type: 'building',
      entity_id: entityUuid,
      metadata: {
        thread_id: threadId || null,
        raw_client_id: rawClientId || null,
        building_id: buildingId || null,
        note: description,
      },
    });

    if (eventErr) {
      return NextResponse.json(
        {
          ok: false,
          persisted: false,
          error: '통화 기록 저장 중 데이터베이스 오류가 발생했습니다.',
        },
        { status: 500 }
      );
    }
    dbPersisted = true;
  }

  appendInboxCallNote(threadId || buildingId || userId, description, '방금 전');

  return NextResponse.json({
    ok: true,
    persisted: true,
    dbPersisted,
    action,
    threadId,
    description,
  });
}
