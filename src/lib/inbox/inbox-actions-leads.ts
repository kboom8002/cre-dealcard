import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isRealProductionRuntime } from '@/lib/env';
import {
  getInboxState,
  isUuid,
  recordGateDecision,
  setBuildingRevokedState,
} from '@/lib/im-lite/quick-generate-store';
import { assertPublishable, type PublishAssetKind } from '@/lib/legal/publish-gate';
import {
  isBuildingShareLinkRevoked,
  isBuildingShareLinkRevokedAsync,
  issueShareLinkToken,
  restoreShareLinkToken,
  type ShareLinkChannel,
} from '@/lib/security/share-link-tokens';
import { parseGateRequestReason, toSafeEpochMs } from './inbox-helpers';
import { isIgnorableSchemaError } from './inbox-schema-caps';
import { upsertBrokerClientFromInbound } from './upsert-broker-client';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('inbox-actions-leads');

async function enforceLeadStatutoryPublishGate(
  supabaseClient: ReturnType<typeof createServiceClient> | null,
  userId: string,
  kind: PublishAssetKind
): Promise<NextResponse | null> {
  const strictEnv =
    isRealProductionRuntime() ||
    process.env.REQUIRE_WORKSPACE_ITEMS_TABLE === '1' ||
    process.env.DISABLE_MEMORY_STORE === '1';

  if (!strictEnv && Boolean(process.env.VITEST)) {
    if (!supabaseClient || !isUuid(userId)) {
      return null;
    }
    let hasAnyProfileRows = false;
    try {
      const pfQ = supabaseClient.from('profiles').select('id').limit(1);
      const pfRes = await pfQ;
      if (Array.isArray(pfRes?.data) && pfRes.data.length > 0) {
        hasAnyProfileRows = true;
      }
    } catch {
      // non-blocking
    }
    if (!hasAnyProfileRows) {
      try {
        const bpQ = supabaseClient.from('broker_profiles').select('user_id').limit(1);
        const bpRes = await bpQ;
        if (Array.isArray(bpRes?.data) && bpRes.data.length > 0) {
          hasAnyProfileRows = true;
        }
      } catch {
        // non-blocking
      }
    }
    if (!hasAnyProfileRows) {
      return null;
    }
  }

  const gate = await assertPublishable({
    supabase: supabaseClient,
    userId,
    kind,
  });
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
  return null;
}

export async function handleGateDecisionAction(params: {
  action: string;
  userId: string;
  buildingId: string;
  threadId: string;
  shareToken: string;
  body: Record<string, unknown>;
}) {
  const { action, userId, threadId, shareToken, body } = params;
  let buildingId = params.buildingId;
  const decision: 'approved' | 'rejected' | 'submitted' =
    action === 'approve_gate' || action === 'approve' || action === 'send_im'
      ? 'approved'
      : action === 'reject_gate' || action === 'reject'
      ? 'rejected'
      : 'submitted';

  const rawId = threadId.replace(/^srv-/, '');
  const isClientOrViewThread =
    threadId.startsWith('custom_') ||
    threadId.startsWith('cli-') ||
    threadId.startsWith('sub_') ||
    threadId.startsWith('view_');

  let supabaseClient: ReturnType<typeof createServiceClient> | null = null;
  try {
    supabaseClient = createServiceClient();
  } catch {
    supabaseClient = null;
  }

  let existingGateRow: Record<string, unknown> | null = null;
  let existingInqRow: Record<string, unknown> | null = null;
  if (supabaseClient && rawId && isUuid(rawId) && !isClientOrViewThread) {
    const [{ data: grRow }, inqLookup] = await Promise.all([
      supabaseClient
        .from('gate_requests')
        .select('id, building_id, status, expires_at, reason')
        .eq('id', rawId)
        .maybeSingle(),
      Promise.resolve(
        supabaseClient
          .from('im_inquiry_requests')
          .select('id, building_id, status, broker_user_id, requester_name, requester_phone, requester_email')
          .eq('id', rawId)
          .maybeSingle()
      ).catch(() => ({ data: null, error: null })),
    ]);

    if (grRow) {
      existingGateRow = grRow;
      if (!buildingId && grRow.building_id) {
        buildingId = String(grRow.building_id);
      }
    }
    if (!inqLookup?.error && inqLookup?.data) {
      existingInqRow = inqLookup.data;
      if (!buildingId && inqLookup.data.building_id) {
        buildingId = String(inqLookup.data.building_id);
      }
    }
  }

  const memDecision = rawId ? getInboxState().gateDecisions?.[rawId] : undefined;
  const nowMs = Date.now();
  const effectiveCurrentStatus = existingGateRow
    ? existingGateRow.status === 'expired' ||
      (existingGateRow.status === 'approved' &&
        existingGateRow.expires_at &&
        toSafeEpochMs(existingGateRow.expires_at) > 0 &&
        toSafeEpochMs(existingGateRow.expires_at) <= nowMs)
      ? 'expired'
      : String(existingGateRow.status || '')
    : existingInqRow?.status
    ? String(existingInqRow.status)
    : memDecision?.status || '';

  if (decision === 'approved' && effectiveCurrentStatus === 'expired') {
    return NextResponse.json(
      {
        ok: false,
        error: '유효기간이 만료된 열람 요청입니다. 요청 상태를 초기화한 뒤 다시 승인해 주세요.',
      },
      { status: 409 }
    );
  }

  if (action === 'send_im' && effectiveCurrentStatus === 'rejected') {
    return NextResponse.json(
      {
        ok: false,
        error:
          '거절된 열람 요청에는 바로 IM을 보낼 수 없습니다. 먼저 열람 요청을 승인하거나 초기화해 주세요.',
      },
      { status: 409 }
    );
  }

  if (decision === 'approved' && !buildingId) {
    return NextResponse.json(
      { ok: false, error: '연결된 매물이 없습니다. 먼저 매물을 지정하거나 발행해 주세요.' },
      { status: 400 }
    );
  }

  let issuedToken = shareToken;
  let issuedShareUrl = buildingId ? `/im-lite/${encodeURIComponent(buildingId)}` : '';

  if (decision === 'approved') {
    const gateErr = await enforceLeadStatutoryPublishGate(supabaseClient, userId, 'im');
    if (gateErr) return gateErr;

    const wasBuildingRevoked =
      isBuildingShareLinkRevoked(buildingId) ||
      (await isBuildingShareLinkRevokedAsync(buildingId, supabaseClient).catch(() => false));
    if (wasBuildingRevoked) {
      const restoreRes = await restoreShareLinkToken({
        buildingId,
        brokerId: userId,
        threadId: threadId || undefined,
        scope: 'building',
        preserveRevokedTokens: true,
      });
      if (!restoreRes.ok && restoreRes.status >= 500) {
        return NextResponse.json(
          {
            ok: false,
            persisted: false,
            error: restoreRes.error || '매물 링크 잠금 해제 상태를 저장하지 못했습니다.',
          },
          { status: restoreRes.status }
        );
      }
    }

    setBuildingRevokedState(buildingId, false);
    const issued = await issueShareLinkToken({
      buildingId,
      brokerId: userId,
      recipientId: threadId || String(body?.recipientId || 'client'),
      ttlDays: Number(body?.ttlDays) > 0 ? Number(body.ttlDays) : 30,
    });
    issuedToken = issued.token;
    issuedShareUrl = issued.shareUrl;
  } else if (issuedToken && buildingId) {
    issuedShareUrl = `/im-lite/${encodeURIComponent(buildingId)}?token=${encodeURIComponent(
      issuedToken
    )}`;
  }

  if (supabaseClient && isUuid(userId)) {
    const entityUuid =
      buildingId && isUuid(buildingId)
        ? buildingId
        : rawId && isUuid(rawId)
        ? rawId
        : userId;

    if (rawId && isUuid(rawId) && !isClientOrViewThread) {
      const shouldUpdateGateStatus =
        action !== 'send_im' ||
        effectiveCurrentStatus === 'submitted' ||
        effectiveCurrentStatus === 'pending' ||
        effectiveCurrentStatus === 'broker_review';

      if (shouldUpdateGateStatus && existingGateRow) {
        const { error: gateUpdErr } = await supabaseClient
          .from('gate_requests')
          .update({ status: decision })
          .eq('id', rawId);

        if (gateUpdErr) {
          return NextResponse.json(
            {
              ok: false,
              persisted: false,
              error: '열람 요청 상태를 데이터베이스에 저장하지 못했습니다.',
            },
            { status: 500 }
          );
        }
      }

      if (
        existingInqRow &&
        (shouldUpdateGateStatus ||
          decision === 'approved' ||
          decision === 'rejected' ||
          decision === 'submitted')
      ) {
        const { error: inqUpdErr } = await supabaseClient
          .from('im_inquiry_requests')
          .update({ status: decision, updated_at: new Date().toISOString() })
          .eq('id', rawId)
          .eq('broker_user_id', userId);
        if (inqUpdErr && isIgnorableSchemaError(inqUpdErr)) {
          await supabaseClient
            .from('im_inquiry_requests')
            .update({ status: decision })
            .eq('id', rawId)
            .eq('broker_user_id', userId);
        } else if (inqUpdErr) {
          return NextResponse.json(
            {
              ok: false,
              persisted: false,
              error: '문의 상태를 데이터베이스에 저장하지 못했습니다.',
            },
            { status: 500 }
          );
        }
      }
    }

    if (decision === 'approved') {
      const { error: restoreEvErr } = await supabaseClient.from('activity_events').insert({
        actor_id: userId,
        event_type: 'link_restored',
        entity_type: 'building',
        entity_id: entityUuid,
        metadata: {
          thread_id: threadId || null,
          building_id: buildingId || null,
          share_token: issuedToken,
          scope: 'recipient_approval',
          revoked: false,
        },
      });
      if (restoreEvErr) {
        return NextResponse.json(
          { ok: false, persisted: false, error: '링크 복구 이력을 저장하지 못했습니다.' },
          { status: 500 }
        );
      }
    }

    const primaryEventType = isClientOrViewThread
      ? 'im_link_sent'
      : decision === 'approved'
      ? 'gate_request_approved'
      : decision === 'rejected'
      ? 'gate_request_rejected'
      : 'gate_request_reset';

    const { error: evErr } = await supabaseClient.from('activity_events').insert({
      actor_id: userId,
      event_type: primaryEventType,
      entity_type: 'building',
      entity_id: entityUuid,
      metadata: {
        thread_id: threadId || null,
        request_id: !isClientOrViewThread && rawId ? rawId : null,
        building_id: buildingId || null,
        share_token: issuedToken || null,
        decision,
      },
    });

    if (evErr) {
      return NextResponse.json(
        {
          ok: false,
          persisted: false,
          error: '열람 처리 기록을 데이터베이스에 저장하지 못했습니다.',
        },
        { status: 500 }
      );
    }
  }

  if (threadId || buildingId) {
    recordGateDecision(
      threadId || buildingId,
      decision === 'submitted' ? 'pending' : decision,
      issuedToken,
      buildingId || undefined
    );
  }

  if (decision === 'approved' && supabaseClient) {
    try {
      const parsedReason = existingGateRow?.reason
        ? parseGateRequestReason(existingGateRow.reason)
        : null;
      const crmName =
        parsedReason?.requesterName ||
        (typeof existingInqRow?.requester_name === 'string' ? existingInqRow.requester_name : '') ||
        (typeof body?.clientName === 'string' ? body.clientName : '');
      const crmPhone =
        parsedReason?.requesterPhone ||
        (typeof existingInqRow?.requester_phone === 'string' ? existingInqRow.requester_phone : '') ||
        (typeof body?.clientPhone === 'string' ? body.clientPhone : '');
      const crmEmail =
        parsedReason?.requesterEmail ||
        (typeof existingInqRow?.requester_email === 'string' ? existingInqRow.requester_email : '') ||
        (typeof body?.clientEmail === 'string' ? body.clientEmail : '');
      const crmCompany =
        parsedReason?.requesterCompany ||
        (typeof body?.clientCompany === 'string' ? body.clientCompany : '');

      if (crmPhone || crmEmail) {
        await upsertBrokerClientFromInbound({
          supabase: supabaseClient,
          brokerUserId: userId,
          name: crmName,
          phone: crmPhone,
          email: crmEmail,
          company: crmCompany,
          buildingId: buildingId || null,
          buildingTitle: parsedReason?.buildingTitle || undefined,
          clientRole: 'buyer',
          source: 'approve_gate',
        });
      }
    } catch (crmErr) {
      log.warn('[approve_gate] upsertBrokerClientFromInbound failed (non-blocking)', {
        error: crmErr instanceof Error ? crmErr.message : String(crmErr),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    persisted: true,
    action,
    status: 'active',
    decision,
    token: issuedToken,
    shareToken: issuedToken,
    shareUrl: issuedShareUrl,
  });
}

export async function handleArchiveThreadAction(params: {
  action: string;
  userId: string;
  buildingId: string;
  threadId: string;
}) {
  const { action, userId, buildingId, threadId } = params;
  if (!threadId) {
    return NextResponse.json(
      { ok: false, error: '보관 처리할 대화 스레드 ID(threadId)가 필요합니다.' },
      { status: 400 }
    );
  }
  const isArchive = action === 'archive_thread';
  const rawId = threadId.replace(/^srv-/, '');

  let supabaseClient: ReturnType<typeof createServiceClient> | null = null;
  try {
    supabaseClient = createServiceClient();
  } catch {
    supabaseClient = null;
  }

  if (supabaseClient && isUuid(userId)) {
    const { error: archEvErr } = await supabaseClient.from('activity_events').insert({
      actor_id: userId,
      event_type: isArchive ? 'inbox_thread_archived' : 'inbox_thread_unarchived',
      entity_type: 'building',
      entity_id:
        buildingId && isUuid(buildingId)
          ? buildingId
          : isUuid(rawId)
          ? rawId
          : userId,
      metadata: {
        thread_id: threadId,
        request_id: rawId || null,
        building_id: buildingId || null,
        archived: isArchive,
      },
    });

    if (archEvErr && !isIgnorableSchemaError(archEvErr)) {
      return NextResponse.json(
        {
          ok: false,
          persisted: false,
          error: '대화 보관 상태를 데이터베이스에 저장하지 못했습니다.',
        },
        { status: 500 }
      );
    }

    if (isArchive && isUuid(rawId)) {
      const { error: inqArchErr } = await supabaseClient
        .from('im_inquiry_requests')
        .update({ status: 'closed' })
        .eq('id', rawId)
        .eq('broker_user_id', userId);
      if (inqArchErr && !isIgnorableSchemaError(inqArchErr)) {
        return NextResponse.json(
          { ok: false, persisted: false, error: '문의 보관 상태 반영에 실패했습니다.' },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    action,
    threadId,
    archived: isArchive,
  });
}

export async function handleSendDealcardOrMagazineAction(params: {
  action: string;
  userId: string;
  buildingId: string;
  threadId: string;
  clientId: string;
  body: Record<string, unknown>;
}) {
  const { action, userId, buildingId, threadId, clientId, body } = params;

  if (action === 'send_dealcard') {
    if (!buildingId) {
      return NextResponse.json(
        { ok: false, error: '연결된 매물이 없습니다. 먼저 매물을 지정해 주세요.' },
        { status: 400 }
      );
    }
    let supabaseForGate: ReturnType<typeof createServiceClient> | null = null;
    try {
      supabaseForGate = createServiceClient();
    } catch {
      supabaseForGate = null;
    }
    const gateErr = await enforceLeadStatutoryPublishGate(supabaseForGate, userId, 'dealcard');
    if (gateErr) return gateErr;

    const recipientRef = threadId || clientId || null;
    const issuedDc = await issueShareLinkToken({
      buildingId,
      brokerId: userId,
      recipientId: recipientRef,
      ttlDays: Number(body?.ttlDays) > 0 ? Number(body.ttlDays) : 30,
      kind: 'dealcard',
      channel:
        typeof body?.channel === 'string'
          ? (body.channel as ShareLinkChannel)
          : 'kakao_share',
    });
    return NextResponse.json({
      ok: true,
      action,
      buildingId,
      shareToken: issuedDc.token,
      shareUrl: issuedDc.shareUrl,
    });
  }

  // send_magazine | send_newsletter
  let supabaseForGate: ReturnType<typeof createServiceClient> | null = null;
  try {
    supabaseForGate = createServiceClient();
  } catch {
    supabaseForGate = null;
  }
  const magGateErr = await enforceLeadStatutoryPublishGate(supabaseForGate, userId, 'magazine');
  if (magGateErr) return magGateErr;

  let resolvedMagazineUrl =
    typeof body?.publicUrl === 'string' && body.publicUrl.trim()
      ? body.publicUrl.trim()
      : '/magazine';
  const targetSegment =
    typeof body?.targetSegment === 'string' && body.targetSegment.trim()
      ? body.targetSegment.trim()
      : 'all';
  let recipientCount = 0;
  let lookupFailed = false;

  try {
    const supabase = createServiceClient();
    const { data: bp } = await supabase
      .from('broker_profiles')
      .select('slug')
      .eq('user_id', userId)
      .maybeSingle();
    const slug = bp?.slug ? String(bp.slug).trim() : '';
    const brokerKeys = Array.from(new Set([userId, slug].filter(Boolean)));

    if (resolvedMagazineUrl === '/magazine' && slug) {
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

    const [subRes, brokerClientsRes, clientEventsRes] = await Promise.all([
      Promise.resolve(
        supabase.from('magazine_subscribers').select('*').in('broker_id', brokerKeys)
      ).catch(() => ({ data: null })),
      (async () => {
        try {
          const res = await supabase
            .from('broker_clients')
            .select(
              'id, display_name, phone, email, client_type, client_role, tier, is_vip, tags, email_delivery_status, consent_status, unsubscribed_at, created_at'
            )
            .eq('broker_id', userId);
          if (res?.error && isIgnorableSchemaError(res.error)) {
            return await supabase
              .from('broker_clients')
              .select('id, display_name, phone, client_type, tier, tags, created_at')
              .eq('broker_id', userId);
          }
          return res;
        } catch {
          return { data: null };
        }
      })(),
      Promise.resolve(
        isUuid(userId)
          ? supabase
              .from('activity_events')
              .select('id, event_type, metadata, created_at')
              .eq('actor_id', userId)
              .in('event_type', [
                'custom_client_upserted',
                'custom_client_deleted',
                'newsletter_subscription_toggled',
                'magazine_subscribed',
                'magazine_unsubscribed',
              ])
              .order('created_at', { ascending: true })
              .limit(400)
          : { data: null }
      ).catch(() => ({ data: null })),
    ]);

    const normalizeSubKey = (
      phone?: unknown,
      email?: unknown,
      name?: unknown,
      fallbackId?: unknown
    ): string => {
      const rawPhone = typeof phone === 'string' ? phone.trim() : '';
      let digits = rawPhone.replace(/\D/g, '');
      if (digits.startsWith('82') && digits.length >= 11) {
        digits = '0' + digits.slice(digits.startsWith('820') ? 3 : 2);
      }
      if (digits.length >= 9) return `tel:${digits}`;
      const rawEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      if (rawEmail) return `email:${rawEmail}`;
      const rawName = typeof name === 'string' ? name.trim() : '';
      if (rawName) return `name:${rawName}`;
      const rawId = typeof fallbackId === 'string' ? fallbackId.trim() : '';
      return rawId ? `id:${rawId}` : '';
    };

    type ContactConsentRecord = {
      subscribed: boolean;
      updatedAtMs: number;
      isVip: boolean;
      clientType: 'buyer' | 'seller' | 'both';
    };
    const consentMap = new Map<string, ContactConsentRecord>();

    const applyConsentState = (
      key: string,
      subscribed: boolean,
      updatedAtMs: number,
      isVip: boolean,
      clientType: 'buyer' | 'seller' | 'both'
    ) => {
      if (!key) return;
      const prev = consentMap.get(key);
      if (!prev || updatedAtMs >= prev.updatedAtMs) {
        consentMap.set(key, {
          subscribed,
          updatedAtMs,
          isVip: isVip || Boolean(prev?.isVip),
          clientType: clientType !== 'buyer' ? clientType : prev?.clientType || 'buyer',
        });
      }
    };

    const rawClientData = (brokerClientsRes as { data?: unknown } | null)?.data;
    const dbClientRows = (Array.isArray(rawClientData) ? rawClientData : []) as Array<Record<string, unknown>>;
    const pendingOrUnconfirmedKeys = new Set<string>();
    const confirmedSubKeys = new Set<string>();
    const registerUnconfirmedContactKeys = (
      primaryKey: string,
      phone?: unknown,
      email?: unknown,
      id?: unknown
    ) => {
      if (primaryKey) pendingOrUnconfirmedKeys.add(primaryKey);
      const telKey = normalizeSubKey(phone);
      if (telKey) pendingOrUnconfirmedKeys.add(telKey);
      const emailKey = normalizeSubKey(undefined, email);
      if (emailKey) pendingOrUnconfirmedKeys.add(emailKey);
      const rawId = typeof id === 'string' ? id.trim() : '';
      if (rawId) {
        pendingOrUnconfirmedKeys.add(`id:${rawId}`);
        pendingOrUnconfirmedKeys.add(`id:custom_${rawId}`);
        pendingOrUnconfirmedKeys.add(`id:cli-${rawId}`);
      }
    };

    for (const c of dbClientRows) {
      const deliveryStatus = String(c?.email_delivery_status || 'ok').toLowerCase();
      const isBouncedOrComplained =
        deliveryStatus === 'bounced' || deliveryStatus === 'complained';
      const tags = Array.isArray(c?.tags) ? c.tags.map((t: unknown) => String(t)) : [];
      const isVip =
        c?.is_vip === true ||
        String(c?.tier || '').toLowerCase() === 'vip' ||
        tags.includes('VIP') ||
        tags.includes('high_interest');
      const consentStatus = String(c?.consent_status || '').trim().toLowerCase();
      const isPendingOrUnconfirmedClient =
        consentStatus === 'pending' ||
        consentStatus === 'unconfirmed' ||
        (consentStatus !== 'confirmed' && tags.some((t: string) => /수신확인대기/i.test(t)));
      const hasConsentOut =
        consentStatus === 'unsubscribed' ||
        Boolean(c?.unsubscribed_at) ||
        tags.some((t: string) => /수신거부|해지|unsub/i.test(t));
      const hasExplicitOptIn =
        !isPendingOrUnconfirmedClient &&
        consentStatus !== 'unsubscribed' &&
        tags.some((t: string) => /뉴스레터|구독|newsletter|subscribe|수신동의/i.test(t));
      const hasExplicitOptOut = hasConsentOut;
      const rawType = String(c?.client_role || c?.client_type || '').toLowerCase();
      const isSellerTag = tags.some((t: string) =>
        /매도|보유|소유주|임대인|seller|owner/i.test(t)
      );
      const cType: 'buyer' | 'seller' | 'both' =
        rawType === 'both'
          ? 'both'
          : rawType === 'seller' || rawType === 'owner' || isSellerTag
          ? 'seller'
          : 'buyer';
      const key = normalizeSubKey(c?.phone, c?.email, c?.display_name, c?.id);
      const ts = toSafeEpochMs(c?.created_at);
      if (isBouncedOrComplained) {
        applyConsentState(key, false, ts, isVip, cType);
        const emailKey = normalizeSubKey(undefined, c?.email);
        if (emailKey) applyConsentState(emailKey, false, ts, isVip, cType);
        continue;
      }
      if (isPendingOrUnconfirmedClient) {
        registerUnconfirmedContactKeys(key, c?.phone, c?.email, c?.id);
        applyConsentState(key, false, ts, isVip, cType);
        continue;
      }
      if (!hasExplicitOptIn && !hasExplicitOptOut) continue;
      applyConsentState(key, hasExplicitOptIn && !hasExplicitOptOut, ts, isVip, cType);
    }

    const rawSubData = (subRes as { data?: unknown } | null)?.data;
    const subRows = (Array.isArray(rawSubData) ? rawSubData : []) as Array<Record<string, unknown>>;
    for (const s of subRows) {
      const phoneVal = s?.subscriber_phone ?? s?.phone_e164 ?? s?.phone;
      const emailVal = s?.subscriber_email ?? s?.email;
      const nameVal = s?.subscriber_name ?? s?.name;
      const statusVal = String(s?.status ?? 'active').toLowerCase();
      const deliveryStatus = String(s?.email_delivery_status ?? 'ok').toLowerCase();
      const isBouncedOrComplained =
        deliveryStatus === 'bounced' || deliveryStatus === 'complained';
      const hasConfirmCol =
        Boolean(s) &&
        (Object.prototype.hasOwnProperty.call(s, 'confirm_status') ||
          Object.prototype.hasOwnProperty.call(s, 'consent_status'));
      const confirmStatusVal = String(
        s?.confirm_status ?? s?.consent_status ?? (hasConfirmCol ? 'pending' : '')
      ).toLowerCase();
      const ts = toSafeEpochMs(
        s?.email_bounced_at || s?.unsubscribed_at || s?.updated_at || s?.created_at
      );
      const k = normalizeSubKey(phoneVal, emailVal, nameVal, s?.id);
      const segRaw = String(s?.segment || s?.client_type || '').toLowerCase();
      const cType: 'buyer' | 'seller' | 'both' =
        segRaw === 'seller' || segRaw === 'owner'
          ? 'seller'
          : segRaw === 'both'
          ? 'both'
          : 'buyer';
      if (statusVal === 'unsubscribed' || statusVal === 'inactive' || confirmStatusVal === 'unsubscribed' || isBouncedOrComplained) {
        applyConsentState(k, false, ts, false, cType);
        const telKey = normalizeSubKey(phoneVal);
        const emailKey = normalizeSubKey(undefined, emailVal);
        if (telKey) applyConsentState(telKey, false, ts, false, cType);
        if (emailKey) applyConsentState(emailKey, false, ts, false, cType);
      } else if (
        statusVal === 'active' &&
        confirmStatusVal !== 'pending' &&
        confirmStatusVal !== 'unconfirmed' &&
        k
      ) {
        confirmedSubKeys.add(k);
        const telKey = normalizeSubKey(phoneVal);
        const emailKey = normalizeSubKey(undefined, emailVal);
        if (telKey) confirmedSubKeys.add(telKey);
        if (emailKey) confirmedSubKeys.add(emailKey);
        applyConsentState(k, true, ts, Boolean(s?.is_vip), cType);
      } else if (statusVal === 'active' && (confirmStatusVal === 'pending' || confirmStatusVal === 'unconfirmed')) {
        registerUnconfirmedContactKeys(k, phoneVal, emailVal, s?.id);
      }
    }

    const inboxCustomClients = (getInboxState().customClients || []).filter(
      (c) => Boolean(c.ownerId) && c.ownerId === userId
    );
    for (const c of inboxCustomClients) {
      const key = normalizeSubKey(c.clientPhone, c.clientEmail, c.clientName, c.id);
      const telKey = normalizeSubKey(c.clientPhone);
      const emailKey = normalizeSubKey(undefined, c.clientEmail);
      const ts = toSafeEpochMs(c.createdAt);
      const isVip = c.clientGrade === 'VIP';
      const memMeta = c as { consentStatus?: string; newsletterOptInPending?: boolean };
      const isMemPending =
        memMeta.newsletterOptInPending === true ||
        memMeta.consentStatus === 'pending' ||
        memMeta.consentStatus === 'unconfirmed' ||
        [key, telKey, emailKey, `id:${c.id}`].some(
          (k) => Boolean(k) && pendingOrUnconfirmedKeys.has(k) && !confirmedSubKeys.has(k)
        );
      if (c.newsletterSubscribed === true && !isMemPending) {
        applyConsentState(key, true, ts, isVip, 'buyer');
      } else if (c.newsletterSubscribed === false || isMemPending) {
        applyConsentState(key, false, ts, isVip, 'buyer');
      }
    }

    const rawEventData = (clientEventsRes as { data?: unknown } | null)?.data;
    const eventRows = (
      Array.isArray(rawEventData) ? [...rawEventData] : []
    ) as Array<Record<string, unknown>>;
    eventRows.sort((a, b) => toSafeEpochMs(a?.created_at) - toSafeEpochMs(b?.created_at));

    for (const ev of eventRows) {
      const meta = (
        ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}
      ) as Record<string, unknown>;
      const ts = toSafeEpochMs(ev?.created_at) || Date.now();
      if (ev?.event_type === 'magazine_unsubscribed') {
        const unsubKey = normalizeSubKey(
          meta.subscriber_phone ?? meta.phone,
          meta.subscriber_email ?? meta.email,
          meta.subscriber_name ?? meta.name
        );
        applyConsentState(unsubKey, false, ts, false, 'buyer');
      } else if (ev?.event_type === 'magazine_subscribed') {
        const subKey = normalizeSubKey(
          meta.subscriber_phone ?? meta.phone,
          meta.subscriber_email ?? meta.email,
          meta.subscriber_name ?? meta.name
        );
        applyConsentState(subKey, true, ts, false, 'buyer');
      } else if (ev?.event_type === 'custom_client_deleted') {
        const delKey = normalizeSubKey(
          meta.client_phone ?? meta.phone,
          meta.client_email ?? meta.email,
          meta.client_name ?? meta.name,
          meta.client_id ?? ev.id
        );
        applyConsentState(delKey, false, ts, false, 'buyer');
      } else if (
        ev?.event_type === 'custom_client_upserted' ||
        ev?.event_type === 'newsletter_subscription_toggled'
      ) {
        const key = normalizeSubKey(
          meta.client_phone ?? meta.phone,
          meta.client_email ?? meta.email,
          meta.client_name ?? meta.name,
          meta.client_id ?? meta.thread_id ?? ev.id
        );
        const telKey = normalizeSubKey(meta.client_phone ?? meta.phone);
        const emailKey = normalizeSubKey(undefined, meta.client_email ?? meta.email);
        const rawMetaCid = String(meta.raw_client_id || meta.client_id || meta.thread_id || '').trim();
        const evConsent = String(meta.consent_status || '').trim().toLowerCase();
        const isPendingOrUnconfirmedMeta =
          meta.newsletter_opt_in_pending === true ||
          evConsent === 'pending' ||
          evConsent === 'unconfirmed';
        const isPendingOrUnconfirmedDb = [
          key,
          telKey,
          emailKey,
          rawMetaCid ? `id:${rawMetaCid}` : '',
        ].some((k) => Boolean(k) && pendingOrUnconfirmedKeys.has(k) && !confirmedSubKeys.has(k));

        const rawSub = meta.newsletter_subscribed ?? meta.subscribed;
        const isVip =
          String(meta.client_grade ?? meta.grade ?? meta.tier ?? '').toUpperCase() === 'VIP';
        const rawSeg = String(meta.client_type ?? meta.segment ?? '').toLowerCase();
        const cType: 'buyer' | 'seller' | 'both' =
          rawSeg === 'seller' || rawSeg === 'owner'
            ? 'seller'
            : rawSeg === 'both'
            ? 'both'
            : 'buyer';
        if (rawSub === true && !isPendingOrUnconfirmedMeta && !isPendingOrUnconfirmedDb) {
          applyConsentState(key, true, ts, isVip, cType);
        } else if (rawSub === false || isPendingOrUnconfirmedMeta || isPendingOrUnconfirmedDb) {
          applyConsentState(key, false, ts, isVip, cType);
        }
      }
    }

    const consentedEntries = Array.from(consentMap.values()).filter((e) => e.subscribed);
    if (targetSegment === 'high_interest' || targetSegment === 'vip') {
      recipientCount = consentedEntries.filter((e) => e.isVip).length;
    } else if (targetSegment === 'seller') {
      recipientCount = consentedEntries.filter(
        (e) => e.clientType === 'seller' || e.clientType === 'both'
      ).length;
    } else if (targetSegment === 'buyer') {
      recipientCount = consentedEntries.filter(
        (e) => e.clientType === 'buyer' || e.clientType === 'both'
      ).length;
    } else {
      recipientCount = consentedEntries.length;
    }

    if (isUuid(userId)) {
      // WP-7.3E P2-4: this action only prepares the newsletter share link — nothing is dispatched.
      // The event keeps its legacy type for compatibility but records the honest outcome.
      const { error: magEvErr } = await supabase.from('activity_events').insert({
        actor_id: userId,
        actor_role: 'broker',
        event_type: 'magazine_sent',
        entity_type: 'broker_profiles',
        entity_id: userId,
        metadata: {
          slug: typeof body?.slug === 'string' ? body.slug : undefined,
          headline: typeof body?.headline === 'string' ? body.headline.slice(0, 200) : undefined,
          targetSegment,
          recipientCount,
          eligible_recipient_count: recipientCount,
          sent_count: 0,
          dispatched: false,
          delivery_mode: 'link_share',
          publicUrl: resolvedMagazineUrl,
        },
        created_at: new Date().toISOString(),
      });
      if (magEvErr && !isIgnorableSchemaError(magEvErr)) {
        log.warn('send_magazine audit event insert failed', { code: magEvErr.code ?? null });
      }
    }
  } catch (err) {
    // Fallback to the generic /magazine link, but never hide the failure.
    lookupFailed = true;
    log.error('send_magazine recipient/link resolution failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const recipientRef = threadId || clientId || '';
  const finalMagazineUrl =
    recipientRef && !resolvedMagazineUrl.includes('sid=')
      ? `${resolvedMagazineUrl}${
          resolvedMagazineUrl.includes('?') ? '&' : '?'
        }sid=${encodeURIComponent(recipientRef)}`
      : resolvedMagazineUrl;

  return NextResponse.json({
    ok: true,
    action,
    buildingId: buildingId || undefined,
    shareUrl: finalMagazineUrl,
    targetSegment,
    recipientCount,
    eligibleRecipientCount: recipientCount,
    sentCount: 0,
    dispatched: false,
    deliveryMode: 'link_share',
    ...(lookupFailed
      ? {
          degraded: true,
          warning: '수신자 집계 중 오류가 발생해 기본 뉴스레터 링크만 준비했습니다. 잠시 후 다시 시도해 주세요.',
        }
      : {}),
  });
}
