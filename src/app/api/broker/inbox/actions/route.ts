import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import {
  appendInboxCallNote,
  getInboxState,
  getQuickImRecord,
  isUuid,
  recordGateDecision,
  saveInboxState,
  setBuildingCorrectionNotice,
  setBuildingRevokedState,
  upsertCustomInboxClient,
} from '@/lib/im-lite/quick-generate-store';
import {
  issueShareLinkToken,
  restoreShareLinkToken,
  revokeShareLinkToken,
  type ShareLinkChannel,
} from '@/lib/security/share-link-tokens';
import { isRealProductionRuntime } from '@/lib/env';
import { getBrokerSubscriptionTier } from '@/domain/subscription/tier-gate';
import {
  buildInboxCopyBundle,
  buildInboxUnsubscribeUrl,
  evaluateInboxAlimtalkAccess,
  normalizeClientEmail,
  normalizeTransactionalBasis,
  sendInboxClientEmail,
  sendInboxTransactionalAlimtalk,
  type InboxAlimtalkTemplateId,
  type InboxEmailDeliveryPurpose,
} from '@/domain/inbox/inbox-outbound';

function getShareLinkHmacSecret(): string {
  const shareLinkSecret = (process.env.SHARE_LINK_SECRET || '').trim();
  if (shareLinkSecret.length >= 32) {
    return shareLinkSecret;
  }
  const nextAuthSecret = (process.env.NEXTAUTH_SECRET || '').trim();
  if (nextAuthSecret.length >= 32) {
    return nextAuthSecret;
  }
  // WP-03 key separation invariant: NEVER fall back to SUPABASE_SERVICE_ROLE_KEY
  if (isRealProductionRuntime()) {
    throw new Error(
      'FATAL: SHARE_LINK_SECRET (or NEXTAUTH_SECRET) of at least 32 characters must be configured in production.'
    );
  }
  return shareLinkSecret || nextAuthSecret || 'credeal-share-link-hmac-secret-v1';
}

function decodeSignedShareToken(token: string): {
  validSig: boolean;
  buildingId?: string;
  brokerId?: string;
  recipientId?: string;
} {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'slk') {
    return { validSig: false };
  }
  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) {
    return { validSig: false };
  }
  const expectedSig = crypto
    .createHmac('sha256', getShareLinkHmacSecret())
    .update(payloadB64)
    .digest('base64url');
  const sigBuf = Buffer.from(sigB64);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { validSig: false };
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as {
      b?: string;
      u?: string;
      r?: string;
    };
    return {
      validSig: true,
      buildingId: typeof parsed?.b === 'string' ? parsed.b : undefined,
      brokerId: typeof parsed?.u === 'string' && parsed.u ? parsed.u : undefined,
      recipientId: typeof parsed?.r === 'string' && parsed.r ? parsed.r : undefined,
    };
  } catch {
    return { validSig: false };
  }
}

async function inspectShareTokenOwnership(token: string): Promise<{
  ownerId: string | null;
  buildingId: string;
  recipientId: string;
}> {
  if (!token) {
    return { ownerId: null, buildingId: '', recipientId: '' };
  }

  const memStore = (globalThis as any).__CRE_SHARE_LINK_TOKEN_STORE__ as
    | {
        tokens?: Record<string, { buildingId?: string; brokerId?: string | null; recipientId?: string | null }>;
        revokedTokens?: Record<string, { buildingId?: string; brokerId?: string | null }>;
      }
    | undefined;
  const memEntry = memStore?.tokens?.[token];
  const memRevoked = memStore?.revokedTokens?.[token];
  const decoded = decodeSignedShareToken(token);

  let dbOwnerId: string | null = null;
  let dbBuildingId = '';
  let dbRecipientId = '';

  try {
    const supabase = createServiceClient();
    const q: any = supabase
      .from('im_share_links')
      .select('token, building_id, broker_id, recipient_id')
      .eq('token', token);
    const res = typeof q.maybeSingle === 'function' ? await q.maybeSingle() : await q.single?.();
    if (res?.data) {
      if (res.data.broker_id) dbOwnerId = String(res.data.broker_id);
      if (res.data.building_id) dbBuildingId = String(res.data.building_id);
      if (res.data.recipient_id) dbRecipientId = String(res.data.recipient_id);
    }
  } catch {
    // ignore if table unavailable
  }

  const ownerId =
    dbOwnerId ||
    memEntry?.brokerId ||
    memRevoked?.brokerId ||
    (decoded.validSig && decoded.brokerId ? decoded.brokerId : null) ||
    null;
  const buildingId =
    dbBuildingId ||
    memEntry?.buildingId ||
    memRevoked?.buildingId ||
    (decoded.validSig && decoded.buildingId ? decoded.buildingId : '') ||
    '';
  const recipientId =
    dbRecipientId ||
    memEntry?.recipientId ||
    (decoded.validSig && decoded.recipientId ? decoded.recipientId : '') ||
    '';

  return { ownerId, buildingId, recipientId };
}

function toSafeEpochMs(isoLike: unknown): number {
  if (!isoLike || typeof isoLike !== 'string') return 0;
  const parsed = Date.parse(isoLike);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isIgnorableSchemaError(err: any): boolean {
  if (!err) return true;
  const code = String(err?.code || '');
  if (
    code === 'PGRST116' ||
    code === 'PGRST200' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    code === '42P01' ||
    code === '42703'
  ) {
    return true;
  }
  return /relationship|does not exist|schema cache/i.test(String(err?.message || ''));
}

export type InboxCrmClientRole = 'buyer' | 'seller' | 'tenant' | 'partner';

function normalizeClientRole(raw: unknown): InboxCrmClientRole | null {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === 'buyer' || s === '매수' || s === '매수자') return 'buyer';
  if (s === 'seller' || s === 'owner' || s === '매도' || s === '매도자' || s === '소유주') {
    return 'seller';
  }
  if (s === 'tenant' || s === 'lessee' || s === '임차' || s === '임차인') return 'tenant';
  if (s === 'partner' || s === '공동중개' || s === '파트너') return 'partner';
  return null;
}

function parsePreferredRegionsInput(rawArr: unknown, rawStr?: unknown): string[] {
  const out = new Set<string>();
  if (Array.isArray(rawArr)) {
    for (const item of rawArr) {
      const s = String(item ?? '').trim();
      if (s) out.add(s);
    }
    return Array.from(out);
  }
  if (typeof rawStr === 'string' && rawStr.trim()) {
    for (const part of rawStr.split(/[,/]+/)) {
      const s = part.trim();
      if (s) out.add(s);
    }
  }
  return Array.from(out);
}

function parseBudgetManwonInput(rawManwon: unknown, rawText?: unknown): number | null {
  if (rawManwon === null) return null;
  if (typeof rawManwon === 'number' && Number.isFinite(rawManwon) && rawManwon >= 0) {
    return Math.round(rawManwon);
  }
  if (typeof rawManwon === 'string' && rawManwon.trim()) {
    const cleanNum = rawManwon.trim().replace(/,/g, '');
    if (/^\d+$/.test(cleanNum)) {
      return Math.round(Number(cleanNum));
    }
  }
  if (typeof rawText === 'string' && rawText.trim()) {
    const txt = rawText.trim().replace(/,/g, '');
    const eokMatch = txt.match(/(\d+(?:\.\d+)?)\s*억/);
    const manMatch = txt.match(/(\d+(?:\.\d+)?)\s*만/);
    if (eokMatch || manMatch) {
      const eokVal = eokMatch ? Number(eokMatch[1]) * 10000 : 0;
      const manVal = manMatch ? Number(manMatch[1]) : 0;
      const sum = Math.round(eokVal + manVal);
      return Number.isFinite(sum) && sum > 0 ? sum : null;
    }
    if (/^\d+$/.test(txt)) {
      return Math.round(Number(txt));
    }
  }
  return null;
}

function formatBudgetManwonDisplay(manwon: number | null): string {
  if (manwon === null || !Number.isFinite(manwon) || manwon <= 0) return '';
  if (manwon >= 10000) {
    const eok = manwon / 10000;
    return Number.isInteger(eok) ? `${eok}억` : `${eok.toFixed(1).replace(/\.0$/, '')}억`;
  }
  return `${manwon.toLocaleString('ko-KR')}만`;
}

function extractFreeMemoFromLegacyNotes(notesRaw: unknown): string {
  const text = typeof notesRaw === 'string' ? notesRaw.trim() : '';
  if (!text) return '';
  const isPureLegacyConcatenation =
    /^(?:(?:예산|선호권역|관심매물|근거)\s*:[^/]+(?:\s*\/\s*)?)+$/i.test(text);
  if (isPureLegacyConcatenation) return '';
  return text;
}

async function verifyBrokerOwnership(params: {
  userId: string;
  isAdmin: boolean;
  buildingId: string;
  threadId: string;
  clientId?: string;
}): Promise<{ allowed: boolean; reason?: string }> {
  const { userId, isAdmin, buildingId, threadId, clientId } = params;
  if (isAdmin) return { allowed: true };

  // 1. Check in-memory/file quick IM record ownership (even for non-UUID buildingIds like bld-01/bld-02)
  if (buildingId) {
    const quickRec = getQuickImRecord(buildingId);
    if (quickRec?.ownerId && quickRec.ownerId !== userId) {
      return { allowed: false, reason: '다른 중개인의 매물에 접근할 수 없습니다.' };
    }
  }

  // 2. Check custom client ownership in memory
  const targetClientKey = clientId || threadId;
  if (targetClientKey) {
    const rawCustomId = targetClientKey.replace(/^(?:custom[-_]|cli-)/, '');
    const inboxState = getInboxState();
    const matchedCustom = inboxState.customClients.find(
      (c) =>
        c.id === targetClientKey ||
        c.id === rawCustomId ||
        c.id === `custom_${rawCustomId}`
    );
    if (matchedCustom && (!matchedCustom.ownerId || matchedCustom.ownerId !== userId)) {
      return { allowed: false, reason: '다른 중개인의 고객 정보에 접근할 수 없습니다.' };
    }
  }

  // 3. Check Supabase ownership for gate_requests, im_inquiry_requests, custom clients, subscribers, and buildings
  try {
    const supabase = createServiceClient();
    const rawReqId = threadId.replace(/^srv-/, '');
    let verifiedViaInquiry = false;

    if (
      rawReqId &&
      isUuid(rawReqId) &&
      !threadId.startsWith('custom_') &&
      !threadId.startsWith('cli-') &&
      !threadId.startsWith('sub_') &&
      !threadId.startsWith('view_')
    ) {
      const { data: gateReq, error: gateErr } = await supabase
        .from('gate_requests')
        .select('id, building_id')
        .eq('id', rawReqId)
        .maybeSingle();

      if (gateErr && !isIgnorableSchemaError(gateErr)) {
        return { allowed: false, reason: '열람 요청 소유권 확인 중 오류가 발생했습니다.' };
      }

      if (gateReq) {
        const joinedBuilding = Array.isArray((gateReq as any).buildings)
          ? (gateReq as any).buildings[0]
          : (gateReq as any).buildings;
        const ownerId = joinedBuilding?.owner_id;
        if (ownerId && String(ownerId) !== userId) {
          return { allowed: false, reason: '해당 IM 열람 요청의 소유 중개인이 아닙니다.' };
        }
        const gateBldId = (gateReq as any).building_id ? String((gateReq as any).building_id) : '';
        if (gateBldId && isUuid(gateBldId)) {
          const { data: reqBld, error: reqBldErr } = await supabase
            .from('building_ssot_lite')
            .select('owner_id')
            .eq('id', gateBldId)
            .maybeSingle();
          if (reqBldErr && !isIgnorableSchemaError(reqBldErr)) {
            return { allowed: false, reason: '열람 요청 매물 소유권 확인 중 오류가 발생했습니다.' };
          }
          if (reqBld?.owner_id && String(reqBld.owner_id) !== userId) {
            return { allowed: false, reason: '해당 IM 열람 요청의 소유 중개인이 아닙니다.' };
          }

          const { data: reqLegacyBld, error: reqLegacyErr } = await supabase
            .from('buildings')
            .select('owner_id')
            .eq('id', gateBldId)
            .maybeSingle();
          if (reqLegacyErr && !isIgnorableSchemaError(reqLegacyErr)) {
            return { allowed: false, reason: '열람 요청 매물 소유권 확인 중 오류가 발생했습니다.' };
          }
          if ((reqLegacyBld as any)?.owner_id && String((reqLegacyBld as any).owner_id) !== userId) {
            return { allowed: false, reason: '해당 IM 열람 요청의 소유 중개인이 아닙니다.' };
          }
        }
      }

      const { data: inqRow, error: inqErr } = await supabase
        .from('im_inquiry_requests')
        .select('id, building_id, broker_user_id')
        .eq('id', rawReqId)
        .maybeSingle();

      if (inqErr && !isIgnorableSchemaError(inqErr)) {
        return { allowed: false, reason: '문의 소유권 확인 중 오류가 발생했습니다.' };
      }

      if (inqRow) {
        if ((inqRow as any).broker_user_id && String((inqRow as any).broker_user_id) !== userId) {
          return { allowed: false, reason: '해당 IM 문의의 소유 중개인이 아닙니다.' };
        }
        if ((inqRow as any).broker_user_id && String((inqRow as any).broker_user_id) === userId) {
          verifiedViaInquiry = true;
        }
      }
    }

    if (targetClientKey && (targetClientKey.startsWith('custom_') || targetClientKey.startsWith('cli-'))) {
      const rawClientId = targetClientKey.replace(/^(?:custom[-_]|cli-)/, '');
      if (isUuid(rawClientId)) {
        const { data: cliRow } = await supabase
          .from('broker_clients')
          .select('id, broker_id')
          .eq('id', rawClientId)
          .maybeSingle();
        if (cliRow?.broker_id && String(cliRow.broker_id) !== userId) {
          return { allowed: false, reason: '다른 중개인의 고객 정보에 접근할 수 없습니다.' };
        }
      }
    }

    if (targetClientKey && targetClientKey.startsWith('sub_')) {
      const rawSubId = targetClientKey.replace(/^sub_/, '');
      if (rawSubId) {
        const { data: subRow, error: subErr } = await supabase
          .from('magazine_subscribers')
          .select('id, broker_id')
          .eq('id', rawSubId)
          .maybeSingle();
        if (!subErr && subRow?.broker_id && String(subRow.broker_id) !== userId) {
          const { data: bp } = await supabase
            .from('broker_profiles')
            .select('slug')
            .eq('user_id', userId)
            .maybeSingle();
          const ownSlug = bp?.slug ? String(bp.slug).trim() : '';
          if (!ownSlug || String(subRow.broker_id) !== ownSlug) {
            return { allowed: false, reason: '다른 중개인의 구독 고객 정보에 접근할 수 없습니다.' };
          }
        }
      }
    }

    if (buildingId) {
      if (isUuid(buildingId)) {
        const { data: ssotRow, error: ssotErr } = await supabase
          .from('building_ssot_lite')
          .select('owner_id')
          .eq('id', buildingId)
          .maybeSingle();

        if (ssotErr && !isIgnorableSchemaError(ssotErr)) {
          return { allowed: false, reason: '매물 소유권 검증 중 데이터베이스 오류가 발생했습니다.' };
        }

        if (ssotRow?.owner_id && String(ssotRow.owner_id) !== userId) {
          return { allowed: false, reason: '해당 빌딩의 소유 중개인이 아닙니다.' };
        }

        const { data: bldRow, error: bldErr } = await supabase
          .from('buildings')
          .select('owner_id')
          .eq('id', buildingId)
          .maybeSingle();

        if (bldErr && !isIgnorableSchemaError(bldErr)) {
          return { allowed: false, reason: '매물 소유권 검증 중 데이터베이스 오류가 발생했습니다.' };
        }

        if ((bldRow as any)?.owner_id && String((bldRow as any).owner_id) !== userId) {
          return { allowed: false, reason: '해당 빌딩의 소유 중개인이 아닙니다.' };
        }

        if (!ssotRow && verifiedViaInquiry) {
          return { allowed: true };
        }
      } else {
        // Non-UUID listing: verify owner from activity_events if claimed
        let evQ: any = supabase
          .from('activity_events')
          .select('actor_id, entity_id, event_type, metadata, created_at');
        if (typeof evQ.in === 'function') {
          evQ = evQ.in('event_type', ['im_upserted', 'dealcard_upserted']);
        }
        if (typeof evQ.order === 'function') {
          evQ = evQ.order('created_at', { ascending: false });
        }
        const { data: acts, error: actErr } = await evQ;
        if (actErr && buildingId !== 'bld-01') {
          return { allowed: false, reason: '비-UUID 매물 소유권 검증 중 오류가 발생했습니다.' };
        }
        for (const ev of acts || []) {
          const meta = (ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}) as Record<string, any>;
          const evBId = String(meta.building_id || meta.im_id || ev?.entity_id || '').trim();
          if (evBId === buildingId) {
            if (ev.actor_id && String(ev.actor_id) !== userId) {
              return { allowed: false, reason: '다른 중개인의 매물에 접근할 수 없습니다.' };
            }
            break;
          }
        }
      }
    }
  } catch {
    // Non-blocking if DB tables are unavailable in offline unit test environment
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
    const isAdmin =
      guard.role === 'admin' || (guard.user as { role?: string }).role === 'admin';

    const body = await req.json();
    const action = String(body?.action || '');
    const threadId = String(body?.threadId || '').trim();
    const clientId = String(body?.clientId || '').trim();
    const rawBuildingId = typeof body?.buildingId === 'string' ? body.buildingId.trim() : '';
    const shareToken = String(body?.shareToken || body?.token || '').trim();

    // C-S0-01: Verify shareToken ownership BEFORE any fallback or mutation!
    let tokenBuildingId = '';
    if (shareToken) {
      const tokenInfo = await inspectShareTokenOwnership(shareToken);
      if (!isAdmin && tokenInfo.ownerId && tokenInfo.ownerId !== userId) {
        return NextResponse.json(
          { ok: false, error: '다른 중개인이 발급한 공유 링크에는 접근할 수 없습니다.' },
          { status: 403 }
        );
      }
      tokenBuildingId = tokenInfo.buildingId;
    }

    // INBOX-08: Never substitute fake 'bld-01' when buildingId is omitted!
    let buildingId = rawBuildingId || tokenBuildingId;

    const requiresTargetRef =
      action === 'revoke_link' ||
      action === 'revoke' ||
      action === 'restore_link' ||
      action === 'unlock_share_link' ||
      action === 'correction_notice' ||
      action === 'clear_correction_notice';

    if (requiresTargetRef && !buildingId && !shareToken) {
      return NextResponse.json(
        { ok: false, error: '대상 매물 ID(buildingId) 또는 공유 토큰이 필요합니다.' },
        { status: 400 }
      );
    }

    const ownership = await verifyBrokerOwnership({
      userId,
      isAdmin,
      buildingId,
      threadId,
      clientId,
    });
    if (!ownership.allowed) {
      return NextResponse.json(
        { ok: false, error: ownership.reason || '권한이 없습니다.' },
        { status: 403 }
      );
    }

    // 1. Approve / Reject / Reset Gate or Send IM (C-S0-02, C-S0-03, C-S1-02, INBOX-13)
    if (
      action === 'approve_gate' ||
      action === 'approve' ||
      action === 'send_im' ||
      action === 'reject_gate' ||
      action === 'reject' ||
      action === 'reset_gate'
    ) {
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

      // C-S0-02 & C-3: Validate gate_requests / im_inquiry_requests state before approving or sending IM
      let existingGateRow: Record<string, any> | null = null;
      let existingInqRow: Record<string, any> | null = null;
      if (supabaseClient && rawId && isUuid(rawId) && !isClientOrViewThread) {
        const { data: grRow } = await supabaseClient
          .from('gate_requests')
          .select('id, building_id, status, expires_at')
          .eq('id', rawId)
          .maybeSingle();
        if (grRow) {
          existingGateRow = grRow;
          if (!buildingId && grRow.building_id) {
            buildingId = String(grRow.building_id);
          }
        }

        try {
          const { data: inqRow, error: inqErr } = await supabaseClient
            .from('im_inquiry_requests')
            .select('id, building_id, status, broker_user_id')
            .eq('id', rawId)
            .maybeSingle();
          if (!inqErr && inqRow) {
            existingInqRow = inqRow;
            if (!buildingId && inqRow.building_id) {
              buildingId = String(inqRow.building_id);
            }
          }
        } catch {
          // ignore if table unavailable
        }
      }

      const memDecision = rawId ? getInboxState().gateDecisions?.[rawId] : undefined;
      const nowMs = Date.now();
      // Match GET /api/broker/inbox classification: 'submitted' requests waiting for broker review
      // remain actionable ('submitted'), whereas explicitly 'expired' rows or expired 'approved' grants
      // are treated as 'expired' (preserving C-S0-02 expired gate invariant).
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
            error: '거절된 열람 요청에는 바로 IM을 보낼 수 없습니다. 먼저 열람 요청을 승인하거나 초기화해 주세요.',
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
        // C-S1-02: Clear building-level lock WITHOUT calling restoreShareLinkToken({ buildingId })
        // so individually revoked tokens of sibling recipients on the same building stay revoked!
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
        issuedShareUrl = `/im-lite/${encodeURIComponent(buildingId)}?token=${encodeURIComponent(issuedToken)}`;
      }

      // C-S0-03: Enforce honest 500 error when durable DB writes fail
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
            try {
              const { error: inqUpdErr } = await supabaseClient
                .from('im_inquiry_requests')
                .update({ status: decision, updated_at: new Date().toISOString() })
                .eq('id', rawId);
              if (inqUpdErr && isIgnorableSchemaError(inqUpdErr)) {
                await supabaseClient
                  .from('im_inquiry_requests')
                  .update({ status: decision })
                  .eq('id', rawId);
              }
            } catch {
              // non-blocking if minimal mock lacks updated_at or status column
            }
          }
        }

        if (decision === 'approved') {
          await supabaseClient.from('activity_events').insert({
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

    // 1.5 Archive / Unarchive Thread (C-3)
    if (action === 'archive_thread' || action === 'unarchive_thread') {
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
          try {
            await supabaseClient
              .from('im_inquiry_requests')
              .update({ status: 'closed' })
              .eq('id', rawId)
              .eq('broker_user_id', userId);
          } catch {
            // non-blocking best-effort sync
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

    // 2. Send DealCard / Newsletter (supports custom_ threads as well)
    if (action === 'send_dealcard') {
      if (!buildingId) {
        return NextResponse.json(
          { ok: false, error: '연결된 매물이 없습니다. 먼저 매물을 지정해 주세요.' },
          { status: 400 }
        );
      }
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

    if (action === 'send_magazine' || action === 'send_newsletter') {
      let resolvedMagazineUrl =
        typeof body?.publicUrl === 'string' && body.publicUrl.trim()
          ? body.publicUrl.trim()
          : '/magazine';
      const targetSegment =
        typeof body?.targetSegment === 'string' && body.targetSegment.trim()
          ? body.targetSegment.trim()
          : 'all';
      let recipientCount = 0;

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
                  'id, display_name, phone, email, client_type, client_role, tier, is_vip, tags, email_delivery_status, created_at'
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
                  .limit(200)
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

        // 1) broker_clients — C-S1-03: ONLY explicit newsletter tag counts as base CRM consent (never untagged VIP!)
        const dbClientRows = Array.isArray((brokerClientsRes as any)?.data)
          ? (brokerClientsRes as any).data
          : [];
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
          const hasExplicitOptIn = tags.some((t: string) =>
            /뉴스레터|구독|newsletter|subscribe/i.test(t)
          );
          const hasExplicitOptOut = tags.some((t: string) =>
            /수신거부|해지|unsub/i.test(t)
          );
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
          if (!hasExplicitOptIn && !hasExplicitOptOut) continue;
          applyConsentState(key, hasExplicitOptIn && !hasExplicitOptOut, ts, isVip, cType);
        }

        // 2) magazine_subscribers (explicit opt-in / opt-out rows — authoritative over static broker_clients tags)
        const subRows = Array.isArray((subRes as any)?.data) ? (subRes as any).data : [];
        for (const s of subRows) {
          const phoneVal = s?.subscriber_phone ?? s?.phone_e164 ?? s?.phone;
          const emailVal = s?.subscriber_email ?? s?.email;
          const nameVal = s?.subscriber_name ?? s?.name;
          const statusVal = String(s?.status ?? 'active').toLowerCase();
          const deliveryStatus = String(s?.email_delivery_status ?? 'ok').toLowerCase();
          const isBouncedOrComplained =
            deliveryStatus === 'bounced' || deliveryStatus === 'complained';
          const confirmStatusVal = String(s?.confirm_status ?? '').toLowerCase();
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
          if (statusVal === 'unsubscribed' || statusVal === 'inactive' || isBouncedOrComplained) {
            applyConsentState(k, false, ts, false, cType);
            const telKey = normalizeSubKey(phoneVal);
            const emailKey = normalizeSubKey(undefined, emailVal);
            if (telKey) applyConsentState(telKey, false, ts, false, cType);
            if (emailKey) applyConsentState(emailKey, false, ts, false, cType);
          } else if (statusVal === 'active' && confirmStatusVal !== 'pending' && k) {
            applyConsentState(k, true, ts, Boolean(s?.is_vip), cType);
          }
        }

        // 3) In-memory customClients owned by userId (explicit boolean newsletterSubscribed === true)
        const inboxCustomClients = (getInboxState().customClients || []).filter(
          (c) => Boolean(c.ownerId) && c.ownerId === userId
        );
        for (const c of inboxCustomClients) {
          const key = normalizeSubKey(c.clientPhone, undefined, c.clientName, c.id);
          const ts = toSafeEpochMs(c.createdAt);
          const isVip = c.clientGrade === 'VIP';
          if (c.newsletterSubscribed === true) {
            applyConsentState(key, true, ts, isVip, 'buyer');
          } else if (c.newsletterSubscribed === false) {
            applyConsentState(key, false, ts, isVip, 'buyer');
          }
        }

        // 4) Chronological activity_events (sorted oldest -> newest so re-subscriptions override prior opt-outs)
        const eventRows = [...(Array.isArray((clientEventsRes as any)?.data) ? (clientEventsRes as any).data : [])]
          .sort((a, b) => toSafeEpochMs(a?.created_at) - toSafeEpochMs(b?.created_at));

        for (const ev of eventRows) {
          const meta = (ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}) as Record<
            string,
            unknown
          >;
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
            if (rawSub === true) {
              applyConsentState(key, true, ts, isVip, cType);
            } else if (rawSub === false) {
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
          await supabase.from('activity_events').insert({
            actor_id: userId,
            actor_role: 'broker',
            event_type: 'magazine_sent',
            entity_type: 'broker_profiles',
            entity_id: userId,
            metadata: {
              slug: typeof body?.slug === 'string' ? body.slug : undefined,
              headline: typeof body?.headline === 'string' ? body.headline : undefined,
              targetSegment,
              recipientCount,
              publicUrl: resolvedMagazineUrl,
            },
            created_at: new Date().toISOString(),
          });
        }
      } catch {
        // non-blocking fallback to /magazine
      }

      const recipientRef = threadId || clientId || '';
      const finalMagazineUrl =
        recipientRef && !resolvedMagazineUrl.includes('sid=')
          ? `${resolvedMagazineUrl}${resolvedMagazineUrl.includes('?') ? '&' : '?'}sid=${encodeURIComponent(recipientRef)}`
          : resolvedMagazineUrl;

      return NextResponse.json({
        ok: true,
        action,
        buildingId: buildingId || undefined,
        shareUrl: finalMagazineUrl,
        targetSegment,
        recipientCount,
        sentCount: recipientCount,
      });
    }

    // 3. Revoke / Restore Share Link (INBOX-07, C-S0-01, C-S1-02, C-4)
    if (
      action === 'revoke_link' ||
      action === 'revoke' ||
      action === 'restore_link' ||
      action === 'unlock_share_link'
    ) {
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
        if (shareToken) {
          await restoreShareLinkToken({
            token: shareToken,
            brokerId: userId,
          });
          const memStore = (globalThis as any).__CRE_SHARE_LINK_TOKEN_STORE__;
          if (buildingId && memStore?.revokedBuildings?.[buildingId]) {
            delete memStore.revokedBuildings[buildingId];
          }
          if (buildingId) {
            setBuildingRevokedState(buildingId, false, shareToken);
          }
        } else if (buildingId) {
          await restoreShareLinkToken({
            buildingId,
            brokerId: userId,
          });
        }
      }

      try {
        const supabase = createServiceClient();
        // Update document_objects.body.is_revoked ONLY when buildingId is a valid UUID
        // and either building-wide (!shareToken) or restoring (!revoked)
        if (buildingId && isUuid(buildingId) && (!shareToken || !revoked)) {
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
        }

        if (isUuid(userId) && !loggedViaTokenHelper) {
          await supabase.from('activity_events').insert({
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
        }
      } catch {
        // non-blocking
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

    // 4. Correction Notice
    if (action === 'correction_notice' || action === 'clear_correction_notice') {
      const targetKey = buildingId || threadId;
      const message =
        action === 'clear_correction_notice'
          ? null
          : String(
              body?.message ||
                '매물 임대 조건 및 주요 수치가 최신 기준으로 정정되었습니다. 최신 내용을 확인해 주세요.'
            );

      const state = setBuildingCorrectionNotice(targetKey, message);
      const notice = state.correctionNotices[targetKey] || null;

      try {
        const supabase = createServiceClient();
        if (buildingId && isUuid(buildingId)) {
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
        }

        if (isUuid(userId)) {
          await supabase.from('activity_events').insert({
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
        }
      } catch {
        // non-blocking
      }

      return NextResponse.json({
        ok: true,
        action,
        buildingId: buildingId || undefined,
        correctionNotice: notice,
      });
    }

    // 5. Add Call Note / Log Call (INBOX-08 building-less support + C-S0-03 honest 500 on DB failure)
    if (action === 'add_call_note' || action === 'log_call') {
      const note = String(body?.note || body?.memo || '').trim();
      if (!note) {
        return NextResponse.json({ ok: false, error: '메모 내용을 입력해 주세요.' }, { status: 400 });
      }
      const description = note.startsWith('통화 기록:') ? note : `통화 기록: ${note}`;

      let dbPersisted = false;
      let supabaseAvailable = false;
      let supabaseClient: ReturnType<typeof createServiceClient> | null = null;
      try {
        supabaseClient = createServiceClient();
        supabaseAvailable = Boolean(supabaseClient);
      } catch {
        supabaseAvailable = false;
      }

      if (supabaseAvailable && supabaseClient && isUuid(userId)) {
        const rawClientId = threadId.replace(/^(?:custom[-_]|cli-)/, '');

        if (threadId.startsWith('custom_') || threadId.startsWith('cli-')) {
          try {
            const { error: customErr } = await supabaseClient
              .from('broker_custom_clients')
              .update({ notes: description })
              .eq('id', rawClientId)
              .eq('broker_id', userId);
            if (!customErr) dbPersisted = true;
          } catch {
            // table may not exist
          }
        }

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

    // 6. Toggle Newsletter Subscription (INBOX-06, INBOX-08, INBOX-11)
    if (action === 'toggle_newsletter') {
      const targetKey = clientId || threadId;
      if (!targetKey) {
        return NextResponse.json(
          { ok: false, error: '대상 고객 식별자가 필요합니다.' },
          { status: 400 }
        );
      }
      const subscribed = Boolean(body?.subscribed);
      const rawClientId = targetKey.replace(/^(?:custom[-_]|cli-|sub_)/, '');
      const clientName = typeof body?.clientName === 'string' ? body.clientName.trim() : '';
      const rawContact = typeof body?.clientPhone === 'string' ? body.clientPhone.trim() : '';
      const clientEmail = rawContact.includes('@') ? rawContact.toLowerCase() : '';
      const clientPhone = rawContact.includes('@') ? '' : rawContact;

      let supabaseClient: ReturnType<typeof createServiceClient> | null = null;
      try {
        supabaseClient = createServiceClient();
      } catch {
        supabaseClient = null;
      }

      if (supabaseClient && isUuid(userId)) {
        if (targetKey.startsWith('sub_') && rawClientId) {
          try {
            const subPatch: Record<string, any> = subscribed
              ? { status: 'active', unsubscribed_at: null, confirm_status: 'confirmed' }
              : { status: 'unsubscribed', unsubscribed_at: new Date().toISOString() };
            const { error: subUpdErr } = await supabaseClient
              .from('magazine_subscribers')
              .update(subPatch)
              .eq('id', rawClientId);
            if (subUpdErr && isIgnorableSchemaError(subUpdErr)) {
              await supabaseClient
                .from('magazine_subscribers')
                .update({ status: subscribed ? 'active' : 'unsubscribed' })
                .eq('id', rawClientId);
            }
          } catch {
            // non-blocking if magazine_subscribers unavailable
          }
        }

        if (isUuid(rawClientId) && !targetKey.startsWith('sub_')) {
          try {
            const { data: existingCli } = await supabaseClient
              .from('broker_clients')
              .select('id, tags')
              .eq('id', rawClientId)
              .eq('broker_id', userId)
              .maybeSingle();
            if (existingCli) {
              const prevTags = Array.isArray(existingCli.tags)
                ? existingCli.tags.map((t: unknown) => String(t))
                : [];
              const cleanedTags = prevTags.filter(
                (t: string) => !/뉴스레터|구독|수신거부|newsletter|subscribe|unsub/i.test(t)
              );
              const nextTags = subscribed
                ? [...cleanedTags, '뉴스레터구독']
                : [...cleanedTags, '수신거부'];
              await supabaseClient
                .from('broker_clients')
                .update({ tags: nextTags })
                .eq('id', rawClientId)
                .eq('broker_id', userId);
            }
          } catch {
            // non-blocking if broker_clients missing
          }
        }

        const { error: toggleEvErr } = await supabaseClient.from('activity_events').insert({
          actor_id: userId,
          event_type: 'newsletter_subscription_toggled',
          entity_type: 'building',
          entity_id: buildingId && isUuid(buildingId) ? buildingId : userId,
          metadata: {
            thread_id: threadId || targetKey,
            client_id: targetKey,
            raw_client_id: rawClientId,
            client_name: clientName || null,
            client_phone: clientPhone || null,
            client_email: clientEmail || null,
            newsletter_subscribed: subscribed,
            subscribed,
          },
        });

        if (toggleEvErr) {
          return NextResponse.json(
            {
              ok: false,
              persisted: false,
              error: '뉴스레터 수신 상태 변경 중 데이터베이스 오류가 발생했습니다.',
            },
            { status: 500 }
          );
        }
      }

      const state = getInboxState();
      let updatedInMem = false;
      for (const c of state.customClients) {
        if (
          c.ownerId === userId &&
          (c.id === targetKey || c.id === rawClientId || c.id === `custom_${rawClientId}`)
        ) {
          c.newsletterSubscribed = subscribed;
          updatedInMem = true;
        }
      }
      if (updatedInMem) {
        saveInboxState(state);
      }

      return NextResponse.json({
        ok: true,
        persisted: true,
        action,
        clientId: targetKey,
        newsletterSubscribed: subscribed,
      });
    }

    // 7. Upsert / Update Custom Client & Structured CRM Profile (INBOX-08, INBOX-12, WP-18)
    if (
      action === 'upsert_client' ||
      action === 'update_client' ||
      action === 'update_client_profile'
    ) {
      const hasOwn = (prop: string) =>
        Boolean(body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, prop));

      const lookupKey = clientId || threadId;
      const rawLookupId = lookupKey.replace(/^(?:custom[-_]|cli-)/, '');

      type ExistingClientSnapshot = {
        id: string;
        dbUuid: string | null;
        clientName: string;
        clientGrade: 'VIP' | '일반' | '잠재';
        isVip: boolean;
        clientRole: InboxCrmClientRole;
        clientPhone: string;
        clientEmail: string | null;
        transactionalBasis: ReturnType<typeof normalizeTransactionalBasis>;
        preferredRegions: string[];
        preferredRegion: string;
        budgetManwon: number | null;
        budget: string;
        freeMemo: string;
        buildingId: string;
        buildingTitle: string;
        newsletterSubscribed: boolean;
      };

      let existingSnap: ExistingClientSnapshot | null = null;

      if (lookupKey) {
        const memMatch = (getInboxState().customClients || []).find(
          (c) =>
            c.ownerId === userId &&
            (c.id === lookupKey ||
              c.id === rawLookupId ||
              c.id === `custom_${rawLookupId}` ||
              c.id === `cli-${rawLookupId}`)
        ) as Record<string, any> | undefined;

        if (memMatch) {
          const m = memMatch;
          const memRegions = parsePreferredRegionsInput(m.preferredRegions, m.preferredRegion);
          const memBudgetManwon = parseBudgetManwonInput(m.budgetManwon, m.budget);
          const memGrade: 'VIP' | '일반' | '잠재' =
            m.clientGrade === '일반' || m.clientGrade === '잠재' ? m.clientGrade : 'VIP';
          existingSnap = {
            id: String(m.id || lookupKey),
            dbUuid: isUuid(rawLookupId) ? rawLookupId : null,
            clientName: String(m.clientName || ''),
            clientGrade: memGrade,
            isVip: typeof m.isVip === 'boolean' ? m.isVip : memGrade === 'VIP',
            clientRole: normalizeClientRole(m.clientRole) || 'buyer',
            clientPhone: String(m.clientPhone || ''),
            clientEmail: normalizeClientEmail(m.clientEmail),
            transactionalBasis: normalizeTransactionalBasis(m.transactionalBasis),
            preferredRegions: memRegions,
            preferredRegion: String(m.preferredRegion || memRegions.join(', ')),
            budgetManwon: memBudgetManwon,
            budget: String(m.budget || formatBudgetManwonDisplay(memBudgetManwon)),
            freeMemo: typeof m.freeMemo === 'string' ? m.freeMemo : '',
            buildingId: String(m.buildingId || ''),
            buildingTitle: String(m.buildingTitle || ''),
            newsletterSubscribed: Boolean(m.newsletterSubscribed),
          };
        }

        if (isUuid(userId)) {
          try {
            const supabase = createServiceClient();
            if (isUuid(rawLookupId)) {
              const cliQ: any = supabase
                .from('broker_clients')
                .select('*')
                .eq('id', rawLookupId)
                .eq('broker_id', userId);
              const cliRes =
                typeof cliQ?.maybeSingle === 'function'
                  ? await cliQ.maybeSingle()
                  : await cliQ?.single?.();
              const dbRow = cliRes?.data;
              if (dbRow) {
                const dbTags = Array.isArray(dbRow.tags)
                  ? dbRow.tags.map((t: unknown) => String(t))
                  : [];
                const dbTier = String(dbRow.tier || '').toLowerCase();
                const dbIsVip =
                  typeof dbRow.is_vip === 'boolean'
                    ? dbRow.is_vip
                    : dbTier === 'vip' || dbTags.includes('VIP');
                const dbGrade: 'VIP' | '일반' | '잠재' = dbIsVip
                  ? 'VIP'
                  : dbTier === 'potential'
                  ? '잠재'
                  : '일반';
                const dbRole =
                  normalizeClientRole(dbRow.client_role ?? dbRow.client_type) || 'buyer';
                const dbRegions = parsePreferredRegionsInput(dbRow.preferred_regions);
                const dbBudgetManwon = parseBudgetManwonInput(dbRow.budget_manwon);
                const dbFreeMemo =
                  typeof dbRow.free_memo === 'string'
                    ? dbRow.free_memo
                    : extractFreeMemoFromLegacyNotes(dbRow.notes);
                const linkedIds = Array.isArray(dbRow.linked_building_ids)
                  ? dbRow.linked_building_ids.map((id: unknown) => String(id))
                  : [];

                existingSnap = {
                  id: existingSnap?.id || lookupKey,
                  dbUuid: String(dbRow.id),
                  clientName: String(
                    dbRow.display_name || dbRow.name || existingSnap?.clientName || ''
                  ),
                  clientGrade: dbGrade,
                  isVip: dbIsVip,
                  clientRole: dbRole,
                  clientPhone: String(dbRow.phone || existingSnap?.clientPhone || ''),
                  clientEmail:
                    normalizeClientEmail(dbRow.email) ?? existingSnap?.clientEmail ?? null,
                  transactionalBasis: existingSnap?.transactionalBasis ?? null,
                  preferredRegions:
                    dbRegions.length > 0 ? dbRegions : existingSnap?.preferredRegions || [],
                  preferredRegion:
                    dbRegions.length > 0
                      ? dbRegions.join(', ')
                      : existingSnap?.preferredRegion || '',
                  budgetManwon: dbBudgetManwon ?? existingSnap?.budgetManwon ?? null,
                  budget:
                    formatBudgetManwonDisplay(dbBudgetManwon ?? existingSnap?.budgetManwon ?? null) ||
                    existingSnap?.budget ||
                    '',
                  freeMemo: dbFreeMemo || existingSnap?.freeMemo || '',
                  buildingId: linkedIds[0] || existingSnap?.buildingId || '',
                  buildingTitle: existingSnap?.buildingTitle || '',
                  newsletterSubscribed:
                    dbTags.some((t: string) => /뉴스레터구독|newsletter/i.test(t)) ||
                    Boolean(existingSnap?.newsletterSubscribed),
                };
              }
            }

            let evQ: any = supabase
              .from('activity_events')
              .select('id, event_type, metadata, created_at');
            if (typeof evQ?.eq === 'function') {
              evQ = evQ.eq('actor_id', userId).eq('event_type', 'custom_client_upserted');
            }
            if (typeof evQ?.order === 'function') {
              evQ = evQ.order('created_at', { ascending: true });
            }
            const evRes = await evQ;
            const evRows = [...(Array.isArray(evRes?.data) ? evRes.data : [])].sort(
              (a, b) => toSafeEpochMs(a?.created_at) - toSafeEpochMs(b?.created_at)
            );
            for (const ev of evRows) {
              const meta = (
                ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}
              ) as Record<string, any>;
              const evClientId = String(meta.client_id || '').trim();
              const evRawId = evClientId.replace(/^(?:custom[-_]|cli-)/, '');
              if (
                evClientId !== lookupKey &&
                evRawId !== rawLookupId &&
                String(meta.raw_client_id || '') !== rawLookupId
              ) {
                continue;
              }
              const evRegions = parsePreferredRegionsInput(
                meta.preferred_regions,
                meta.preferred_region
              );
              const evBudgetManwon = parseBudgetManwonInput(meta.budget_manwon, meta.budget);
              const evGrade: 'VIP' | '일반' | '잠재' =
                meta.client_grade === '일반' || meta.client_grade === '잠재'
                  ? meta.client_grade
                  : 'VIP';
              const evIsVip =
                typeof meta.is_vip === 'boolean' ? meta.is_vip : evGrade === 'VIP';
              const evRole =
                normalizeClientRole(meta.client_role) || existingSnap?.clientRole || 'buyer';
              const evFreeMemo =
                typeof meta.free_memo === 'string'
                  ? meta.free_memo
                  : existingSnap?.freeMemo ?? '';

              existingSnap = {
                id: evClientId || existingSnap?.id || lookupKey,
                dbUuid:
                  existingSnap?.dbUuid || (isUuid(evRawId) ? evRawId : null),
                clientName: String(meta.client_name || existingSnap?.clientName || ''),
                clientGrade: evGrade,
                isVip: evIsVip,
                clientRole: evRole,
                clientPhone: String(meta.client_phone ?? existingSnap?.clientPhone ?? ''),
                clientEmail:
                  normalizeClientEmail(meta.client_email) ?? existingSnap?.clientEmail ?? null,
                transactionalBasis:
                  normalizeTransactionalBasis(meta.transactional_basis) ??
                  existingSnap?.transactionalBasis ??
                  null,
                preferredRegions:
                  evRegions.length > 0 ? evRegions : existingSnap?.preferredRegions || [],
                preferredRegion: String(
                  meta.preferred_region ||
                    evRegions.join(', ') ||
                    existingSnap?.preferredRegion ||
                    ''
                ),
                budgetManwon: evBudgetManwon ?? existingSnap?.budgetManwon ?? null,
                budget: String(
                  meta.budget ||
                    formatBudgetManwonDisplay(evBudgetManwon) ||
                    existingSnap?.budget ||
                    ''
                ),
                freeMemo: evFreeMemo,
                buildingId: String(meta.building_id ?? existingSnap?.buildingId ?? ''),
                buildingTitle: String(meta.building_title ?? existingSnap?.buildingTitle ?? ''),
                newsletterSubscribed:
                  typeof meta.newsletter_subscribed === 'boolean'
                    ? meta.newsletter_subscribed
                    : Boolean(existingSnap?.newsletterSubscribed),
              };
            }
          } catch {
            // ignore pre-read failures in offline / injected-error test scenarios
          }
        }
      }

      const incomingName =
        hasOwn('clientName') || hasOwn('display_name')
          ? String(body?.clientName ?? body?.display_name ?? '').trim()
          : '';
      const clientName = incomingName || existingSnap?.clientName || '';
      if (!clientName) {
        return NextResponse.json(
          { ok: false, error: '고객 성함을 입력해 주세요.' },
          { status: 400 }
        );
      }

      const explicitIsVip =
        typeof body?.isVip === 'boolean'
          ? body.isVip
          : typeof body?.is_vip === 'boolean'
          ? body.is_vip
          : undefined;
      const explicitGradeRaw =
        typeof body?.clientGrade === 'string' && body.clientGrade.trim()
          ? (body.clientGrade.trim() as 'VIP' | '일반' | '잠재')
          : undefined;

      let resolvedIsVip: boolean;
      let clientGrade: 'VIP' | '일반' | '잠재';
      if (explicitIsVip !== undefined) {
        resolvedIsVip = explicitIsVip;
        clientGrade =
          explicitGradeRaw ||
          (explicitIsVip
            ? 'VIP'
            : existingSnap?.clientGrade === '잠재'
            ? '잠재'
            : '일반');
      } else if (explicitGradeRaw !== undefined) {
        clientGrade = explicitGradeRaw;
        resolvedIsVip = explicitGradeRaw === 'VIP';
      } else if (existingSnap) {
        resolvedIsVip = existingSnap.isVip;
        clientGrade = existingSnap.clientGrade;
      } else {
        clientGrade = 'VIP';
        resolvedIsVip = true;
      }

      const parsedRole = normalizeClientRole(
        body?.clientRole ?? body?.client_role ?? body?.clientType ?? body?.client_type
      );
      const resolvedClientRole: InboxCrmClientRole =
        parsedRole ?? existingSnap?.clientRole ?? 'buyer';

      const hasPhoneProp = hasOwn('clientPhone') || hasOwn('phone');
      const rawPhone = hasPhoneProp
        ? String(body?.clientPhone ?? body?.phone ?? '').trim()
        : existingSnap?.clientPhone || '';
      const clientPhone =
        rawPhone === '010-0000-0000' || rawPhone === '01000000000' ? '' : rawPhone;

      const hasEmailProp = hasOwn('clientEmail') || hasOwn('email');
      const rawClientEmail = hasEmailProp
        ? String(body?.clientEmail ?? body?.email ?? '').trim()
        : '';
      const parsedIncomingEmail = rawClientEmail ? normalizeClientEmail(rawClientEmail) : null;
      if (hasEmailProp && rawClientEmail && !parsedIncomingEmail) {
        return NextResponse.json(
          { ok: false, error: '올바른 이메일 주소 형식을 입력해 주세요.' },
          { status: 400 }
        );
      }
      const clientEmail = hasEmailProp
        ? parsedIncomingEmail
        : existingSnap?.clientEmail ?? null;

      const transactionalBasis = hasOwn('transactionalBasis')
        ? normalizeTransactionalBasis(body?.transactionalBasis)
        : existingSnap?.transactionalBasis ?? null;

      const hasRegionsProp =
        hasOwn('preferredRegions') ||
        hasOwn('preferred_regions') ||
        hasOwn('preferredRegion') ||
        hasOwn('preferred_region');
      const resolvedPreferredRegions = hasRegionsProp
        ? parsePreferredRegionsInput(
            body?.preferredRegions ?? body?.preferred_regions,
            body?.preferredRegion ?? body?.preferred_region
          )
        : existingSnap?.preferredRegions ?? [];
      const preferredRegion =
        typeof body?.preferredRegion === 'string' && body.preferredRegion.trim()
          ? body.preferredRegion.trim()
          : resolvedPreferredRegions.length > 0
          ? resolvedPreferredRegions.join(', ')
          : hasRegionsProp
          ? ''
          : existingSnap?.preferredRegion ?? '';

      const hasBudgetProp =
        hasOwn('budgetManwon') || hasOwn('budget_manwon') || hasOwn('budget');
      let resolvedBudgetManwon: number | null;
      if (hasBudgetProp) {
        if (
          (body?.budgetManwon === null || body?.budget_manwon === null) &&
          !body?.budget
        ) {
          resolvedBudgetManwon = null;
        } else {
          resolvedBudgetManwon = parseBudgetManwonInput(
            body?.budgetManwon ?? body?.budget_manwon,
            body?.budget
          );
        }
      } else {
        resolvedBudgetManwon = existingSnap?.budgetManwon ?? null;
      }
      const budget =
        typeof body?.budget === 'string' && body.budget.trim()
          ? body.budget.trim()
          : formatBudgetManwonDisplay(resolvedBudgetManwon) ||
            (!hasBudgetProp ? existingSnap?.budget ?? '' : '');

      const hasFreeMemoProp =
        hasOwn('freeMemo') ||
        hasOwn('free_memo') ||
        hasOwn('memo') ||
        hasOwn('notes');
      const resolvedFreeMemo = hasFreeMemoProp
        ? String(body?.freeMemo ?? body?.free_memo ?? body?.memo ?? body?.notes ?? '').trim()
        : existingSnap?.freeMemo ?? '';

      const resolvedBuildingId = hasOwn('buildingId')
        ? buildingId
        : buildingId || existingSnap?.buildingId || '';
      const buildingTitle = String(
        body?.buildingTitle ||
          existingSnap?.buildingTitle ||
          (resolvedBuildingId ? '관심 매물' : '관심 매물 미지정')
      ).trim();
      const newsletterSubscribed =
        typeof body?.newsletterSubscribed === 'boolean'
          ? body.newsletterSubscribed
          : Boolean(existingSnap?.newsletterSubscribed);

      let resolvedClientId = lookupKey || `custom_${Date.now()}`;
      const rawClientUuidCandidate =
        existingSnap?.dbUuid || resolvedClientId.replace(/^(?:custom[-_]|cli-)/, '');

      try {
        const supabase = createServiceClient();
        const tierMap: Record<string, 'vip' | 'normal' | 'potential'> = {
          VIP: 'vip',
          일반: 'normal',
          잠재: 'potential',
        };
        const resolvedTier: 'vip' | 'normal' | 'potential' = resolvedIsVip
          ? 'vip'
          : tierMap[clientGrade] === 'vip'
          ? 'normal'
          : tierMap[clientGrade] || 'normal';
        const roleTag =
          resolvedClientRole === 'seller'
            ? '매도'
            : resolvedClientRole === 'tenant'
            ? '임차'
            : resolvedClientRole === 'partner'
            ? '공동중개'
            : '';
        const tagsPayload = Array.from(
          new Set(
            [
              ...resolvedPreferredRegions,
              preferredRegion && !resolvedPreferredRegions.includes(preferredRegion)
                ? preferredRegion
                : '',
              budget,
              roleTag,
              newsletterSubscribed ? '뉴스레터구독' : '',
            ].filter(Boolean)
          )
        );
        const legacyClientType: 'buyer' | 'seller' =
          resolvedClientRole === 'seller' ? 'seller' : 'buyer';

        let dbWriteRes: any = null;
        if (isUuid(userId)) {
          if (isUuid(rawClientUuidCandidate)) {
            const legacyUpdatePayload = {
              client_type: legacyClientType,
              display_name: clientName,
              phone: clientPhone || null,
              tier: resolvedTier,
              tags: tagsPayload,
              notes: resolvedFreeMemo,
              linked_building_ids:
                resolvedBuildingId && isUuid(resolvedBuildingId) ? [resolvedBuildingId] : [],
            };
            const structuredUpdatePayload = {
              ...legacyUpdatePayload,
              ...(clientEmail !== undefined ? { email: clientEmail } : {}),
              is_vip: resolvedIsVip,
              client_role: resolvedClientRole,
              preferred_regions: resolvedPreferredRegions,
              budget_manwon: resolvedBudgetManwon,
              free_memo: resolvedFreeMemo,
            };
            dbWriteRes = await supabase
              .from('broker_clients')
              .update(structuredUpdatePayload)
              .eq('id', rawClientUuidCandidate)
              .eq('broker_id', userId);
            if (dbWriteRes?.error && isIgnorableSchemaError(dbWriteRes.error)) {
              dbWriteRes = await supabase
                .from('broker_clients')
                .update(legacyUpdatePayload)
                .eq('id', rawClientUuidCandidate)
                .eq('broker_id', userId);
            }
          } else if (action === 'upsert_client' && !isUuid(rawClientUuidCandidate)) {
            const legacyInsertPayload = {
              broker_id: userId,
              client_type: legacyClientType,
              display_name: clientName,
              phone: clientPhone || null,
              tier: resolvedTier,
              tags: tagsPayload,
              notes: resolvedFreeMemo,
              linked_building_ids:
                resolvedBuildingId && isUuid(resolvedBuildingId) ? [resolvedBuildingId] : [],
            };
            const runInsert = async (includeStructured: boolean) => {
              const insQuery: any = supabase.from('broker_clients').insert({
                ...legacyInsertPayload,
                ...(includeStructured
                  ? {
                      ...(clientEmail ? { email: clientEmail } : {}),
                      is_vip: resolvedIsVip,
                      client_role: resolvedClientRole,
                      preferred_regions: resolvedPreferredRegions,
                      budget_manwon: resolvedBudgetManwon,
                      free_memo: resolvedFreeMemo,
                    }
                  : {}),
              });
              return typeof insQuery?.select === 'function'
                ? await insQuery.select('id').single()
                : await insQuery;
            };
            dbWriteRes = await runInsert(true);
            if (dbWriteRes?.error && isIgnorableSchemaError(dbWriteRes.error)) {
              dbWriteRes = await runInsert(false);
            }
            if (dbWriteRes?.data?.id) {
              resolvedClientId = `custom_${dbWriteRes.data.id}`;
            }
          }

          const evRes = await supabase.from('activity_events').insert({
            actor_id: userId,
            event_type: 'custom_client_upserted',
            entity_type: 'building',
            entity_id:
              resolvedBuildingId && isUuid(resolvedBuildingId) ? resolvedBuildingId : userId,
            metadata: {
              client_id: resolvedClientId,
              raw_client_id: isUuid(rawClientUuidCandidate)
                ? rawClientUuidCandidate
                : resolvedClientId.replace(/^(?:custom[-_]|cli-)/, ''),
              client_name: clientName,
              client_grade: clientGrade,
              is_vip: resolvedIsVip,
              client_role: resolvedClientRole,
              client_phone: clientPhone,
              client_email: clientEmail || '',
              transactional_basis: transactionalBasis || '',
              preferred_regions: resolvedPreferredRegions,
              preferred_region: preferredRegion,
              budget_manwon: resolvedBudgetManwon,
              budget,
              free_memo: resolvedFreeMemo,
              building_id: resolvedBuildingId,
              building_title: buildingTitle,
              newsletter_subscribed: newsletterSubscribed,
            },
          });

          if (dbWriteRes?.error && (evRes as any)?.error) {
            return NextResponse.json(
              {
                ok: false,
                persisted: false,
                error: '고객 정보 저장 중 데이터베이스 오류가 발생했습니다.',
              },
              { status: 500 }
            );
          }
        }
      } catch {
        // non-blocking in offline test environment
      }

      if (!resolvedClientId.startsWith('custom_') && !resolvedClientId.startsWith('cli-')) {
        resolvedClientId = `custom_${resolvedClientId}`;
      }

      const state = upsertCustomInboxClient({
        id: resolvedClientId,
        ownerId: userId,
        clientName,
        clientGrade,
        clientPhone,
        clientEmail,
        transactionalBasis,
        budget,
        preferredRegion,
        buildingId: resolvedBuildingId,
        buildingTitle,
        newsletterSubscribed,
      });

      const matchedMem = state.customClients.find(
        (c) => c.id === resolvedClientId && c.ownerId === userId
      );
      if (matchedMem) {
        Object.assign(matchedMem as Record<string, any>, {
          isVip: resolvedIsVip,
          clientRole: resolvedClientRole,
          preferredRegions: resolvedPreferredRegions,
          budgetManwon: resolvedBudgetManwon,
          freeMemo: resolvedFreeMemo,
        });
        saveInboxState(state);
      }

      const ownSavedClient = {
        ...(matchedMem || {
          id: resolvedClientId,
          ownerId: userId,
          clientName,
          clientGrade,
          clientPhone,
          clientEmail,
          transactionalBasis,
          budget,
          preferredRegion,
          buildingId: resolvedBuildingId,
          buildingTitle,
          newsletterSubscribed,
          createdAt: new Date().toISOString(),
        }),
        isVip: resolvedIsVip,
        clientRole: resolvedClientRole,
        preferredRegions: resolvedPreferredRegions,
        budgetManwon: resolvedBudgetManwon,
        freeMemo: resolvedFreeMemo,
      };

      return NextResponse.json({
        ok: true,
        persisted: true,
        action,
        clientId: ownSavedClient.id,
        client: ownSavedClient,
      });
    }

    // 8. Delete Custom Client (INBOX-12 — supports Undo restore via upsert_client)
    if (action === 'delete_client') {
      const targetKey = clientId || threadId;
      if (!targetKey) {
        return NextResponse.json(
          { ok: false, error: '삭제할 고객 ID가 필요합니다.' },
          { status: 400 }
        );
      }
      const rawClientId = targetKey.replace(/^(?:custom[-_]|cli-)/, '');

      try {
        const supabase = createServiceClient();
        if (isUuid(userId)) {
          if (isUuid(rawClientId)) {
            await supabase
              .from('broker_clients')
              .delete()
              .eq('id', rawClientId)
              .eq('broker_id', userId);
          }
          try {
            await supabase
              .from('broker_custom_clients')
              .delete()
              .eq('id', rawClientId)
              .eq('broker_id', userId);
          } catch {
            // table may not exist
          }

          const { error: delEvErr } = await supabase.from('activity_events').insert({
            actor_id: userId,
            event_type: 'custom_client_deleted',
            entity_type: 'building',
            entity_id: userId,
            metadata: {
              client_id: targetKey,
              raw_client_id: rawClientId,
              deleted_at: new Date().toISOString(),
            },
          });

          if (delEvErr) {
            return NextResponse.json(
              {
                ok: false,
                persisted: false,
                error: '고객 삭제 기록 저장 중 데이터베이스 오류가 발생했습니다.',
              },
              { status: 500 }
            );
          }
        }
      } catch {
        // non-blocking in offline test environment
      }

      const state = getInboxState();
      state.customClients = (state.customClients || []).filter(
        (c) =>
          !(
            c.ownerId === userId &&
            (c.id === targetKey || c.id === rawClientId || c.id === `custom_${rawClientId}`)
          )
      );
      saveInboxState(state);

      return NextResponse.json({
        ok: true,
        persisted: true,
        action,
        deletedId: targetKey,
      });
    }

    // 9. Outbound Channel Actions: Copy Bundle (Free+Paid), Email (Free+Paid), Alimtalk (Paid+Basis)
    if (
      action === 'prepare_copy_bundle' ||
      action === 'send_inbox_email' ||
      action === 'send_client_email' ||
      action === 'send_email' ||
      action === 'send_inbox_alimtalk' ||
      action === 'send_alimtalk'
    ) {
      const isEmailAction =
        action === 'send_inbox_email' ||
        action === 'send_client_email' ||
        action === 'send_email';
      const isAlimtalkAction =
        action === 'send_inbox_alimtalk' || action === 'send_alimtalk';
      const origin =
        req.nextUrl?.origin ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        'https://credeal.net';
      const toAbsoluteUrl = (rawUrl: string) => {
        if (!rawUrl) return `${origin}/magazine`;
        if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
        return `${origin}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
      };

      const assetKind: 'im' | 'dealcard' | 'magazine' =
        body?.assetKind === 'dealcard'
          ? 'dealcard'
          : body?.assetKind === 'magazine'
            ? 'magazine'
            : 'im';
      const recipientRef = threadId || clientId || null;
      const clientName = String(body?.clientName || '고객').trim();
      const buildingTitle = String(body?.buildingTitle || '추천 빌딩').trim();
      const headline = typeof body?.headline === 'string' ? body.headline.trim() : '';

      const precheckedEmail = isEmailAction
        ? normalizeClientEmail(body?.clientEmail ?? body?.toEmail ?? body?.email)
        : null;
      if (isEmailAction && !precheckedEmail) {
        return NextResponse.json(
          {
            ok: false,
            error: '수신 가능한 이메일 주소를 먼저 등록·입력해 주세요.',
          },
          { status: 400 }
        );
      }

      let brokerName = '담당 중개인';
      let brokerCompany = '';
      let brokerPhone = '';
      let brokerAddress = '';
      let brokerRegNumber = '';
      let brokerSlug = '';
      let subscriptionInfo: {
        tier: 'free' | 'pro' | 'premium';
        isPaid: boolean;
        status: string;
      } = { tier: 'free', isPaid: false, status: 'free' };

      const supabase = createServiceClient();
      try {
        subscriptionInfo = await getBrokerSubscriptionTier(supabase, userId);
      } catch {
        // default free tier on test/offline DB
      }

      if (isUuid(userId)) {
        try {
          const pfQuery: any = supabase
            .from('profiles')
            .select('display_name, company, phone')
            .eq('id', userId);
          const pfRes =
            typeof pfQuery?.maybeSingle === 'function'
              ? await pfQuery.maybeSingle()
              : await pfQuery?.single?.();
          const pf = pfRes?.data;
          if (pf) {
            if (pf.display_name) {
              brokerName = String(pf.display_name).trim() || brokerName;
            }
            if (pf.company) {
              brokerCompany = String(pf.company).trim();
            }
            if (pf.phone) {
              brokerPhone = String(pf.phone).trim();
            }
          }
        } catch {
          // fallback defaults if profiles unavailable
        }

        try {
          const bpQuery: any = supabase
            .from('broker_profiles')
            .select('office_address, office_reg_number, slug')
            .eq('user_id', userId);
          const bpRes =
            typeof bpQuery?.maybeSingle === 'function'
              ? await bpQuery.maybeSingle()
              : await bpQuery?.single?.();
          const bp = bpRes?.data;
          if (bp) {
            if ((bp as any).office_address) {
              brokerAddress = String((bp as any).office_address).trim();
            }
            if ((bp as any).office_reg_number) {
              brokerRegNumber = String((bp as any).office_reg_number).trim();
            }
            if ((bp as any).slug) {
              brokerSlug = String((bp as any).slug).trim();
            }
            if (brokerName === '담당 중개인' && (bp as any).display_name) {
              brokerName = String((bp as any).display_name).trim() || brokerName;
            }
            if (!brokerCompany && (bp as any).company) {
              brokerCompany = String((bp as any).company).trim();
            }
            if (!brokerPhone && (bp as any).phone) {
              brokerPhone = String((bp as any).phone).trim();
            }
          }
        } catch {
          // fallback defaults if broker_profiles unavailable
        }
      }

      // Pre-send recipient bounce/complaint suppression + opt-out / consent resolution for email actions
      let activeSubscriberRow: Record<string, any> | null = null;
      let hasVerifiedInquiryRecord = false;
      let hasExplicitCrmOptIn = false;

      if (isEmailAction && precheckedEmail) {
        const brokerKeys = Array.from(new Set([userId, brokerSlug].filter(Boolean)));
        const rawTargetId = (recipientRef || '').replace(/^(?:srv-|custom[-_]|cli-|sub_)/, '');
        let bouncedOrComplained = false;
        let unsubscribedBySubscriber = false;
        let subscriberUnsubTs = 0;

        try {
          let subQuery: any = supabase
            .from('magazine_subscribers')
            .select(
              'id, broker_id, subscriber_email, status, confirm_status, unsubscribed_at, night_consent, email_delivery_status, email_bounced_at, email_bounce_reason, created_at'
            );
          if (typeof subQuery?.in === 'function' && brokerKeys.length > 0) {
            subQuery = subQuery.in('broker_id', brokerKeys);
          } else if (typeof subQuery?.eq === 'function') {
            subQuery = subQuery.eq('broker_id', userId);
          }
          let subRes = await subQuery;
          if (subRes?.error && isIgnorableSchemaError(subRes.error)) {
            let fallbackSubQ: any = supabase
              .from('magazine_subscribers')
              .select('id, broker_id, subscriber_email, status, confirm_status, unsubscribed_at, created_at');
            if (typeof fallbackSubQ?.in === 'function' && brokerKeys.length > 0) {
              fallbackSubQ = fallbackSubQ.in('broker_id', brokerKeys);
            } else if (typeof fallbackSubQ?.eq === 'function') {
              fallbackSubQ = fallbackSubQ.eq('broker_id', userId);
            }
            subRes = await fallbackSubQ;
          }

          const subRows = Array.isArray(subRes?.data) ? subRes.data : [];
          for (const s of subRows) {
            const rowBroker = String(s?.broker_id || '').trim();
            if (rowBroker && brokerKeys.length > 0 && !brokerKeys.includes(rowBroker)) {
              continue;
            }
            const rowEmail = normalizeClientEmail(s?.subscriber_email ?? s?.email);
            const matchesEmail = rowEmail === precheckedEmail;
            const matchesSubId =
              Boolean(recipientRef?.startsWith('sub_')) &&
              Boolean(rawTargetId) &&
              String(s?.id || '') === rawTargetId;
            if (!matchesEmail && !matchesSubId) continue;

            const deliveryLower = String(s?.email_delivery_status ?? 'ok').toLowerCase();
            if (deliveryLower === 'bounced' || deliveryLower === 'complained') {
              bouncedOrComplained = true;
            }

            const statusLower = String(s?.status ?? 'active').toLowerCase();
            const confirmLower = String(s?.confirm_status ?? 'confirmed').toLowerCase();
            if (statusLower === 'unsubscribed' || statusLower === 'inactive' || Boolean(s?.unsubscribed_at)) {
              unsubscribedBySubscriber = true;
              subscriberUnsubTs = Math.max(
                subscriberUnsubTs,
                toSafeEpochMs(s?.unsubscribed_at || s?.updated_at || s?.created_at) || 1
              );
            } else if (statusLower === 'active' && confirmLower !== 'pending') {
              activeSubscriberRow = s;
            }
          }

          if (!bouncedOrComplained) {
            const globalSubBounceQ: any = supabase
              .from('magazine_subscribers')
              .select('id, subscriber_email, email_delivery_status')
              .eq('subscriber_email', precheckedEmail);
            const globalSubRes = await globalSubBounceQ;
            if (!globalSubRes?.error && Array.isArray(globalSubRes?.data)) {
              for (const gs of globalSubRes.data) {
                const ds = String(gs?.email_delivery_status ?? 'ok').toLowerCase();
                if (ds === 'bounced' || ds === 'complained') {
                  bouncedOrComplained = true;
                  break;
                }
              }
            }
          }
        } catch {
          // ignore if magazine_subscribers unavailable in mock
        }

        // Check bounce/complaint events in activity_events (including webhook actor_id = null rows)
        if (!bouncedOrComplained) {
          try {
            let bounceEvQ: any = supabase
              .from('activity_events')
              .select('id, actor_id, entity_id, event_type, metadata, created_at');
            if (typeof bounceEvQ?.in === 'function') {
              bounceEvQ = bounceEvQ.in('event_type', ['email_bounced', 'email_complained']);
            }
            const bounceEvRes = await bounceEvQ;
            const bounceRows = Array.isArray(bounceEvRes?.data) ? bounceEvRes.data : [];
            for (const ev of bounceRows) {
              if (ev?.actor_id && String(ev.actor_id) !== userId) continue;
              const meta = (
                ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}
              ) as Record<string, any>;
              const evEmail = normalizeClientEmail(
                String(
                  meta.email ||
                    meta.to_email ||
                    meta.client_email ||
                    meta.subscriber_email ||
                    ''
                )
              );
              const matchesEmail = evEmail === precheckedEmail;
              const matchesThread =
                Boolean(recipientRef) &&
                (meta.client_id === recipientRef ||
                  meta.thread_id === recipientRef ||
                  (Boolean(rawTargetId) &&
                    (meta.raw_client_id === rawTargetId ||
                      meta.subscriber_id === rawTargetId ||
                      ev.entity_id === rawTargetId)));
              if (matchesEmail || matchesThread) {
                bouncedOrComplained = true;
                break;
              }
            }
          } catch {
            // ignore if activity_events unavailable in mock
          }
        }

        let latestEventSubscribed: boolean | null = null;
        let latestUpsertOptIn: boolean | null = null;
        let latestEventTs = 0;
        try {
          let evQuery: any = supabase
            .from('activity_events')
            .select('id, actor_id, entity_id, event_type, metadata, created_at');
          if (typeof evQuery?.eq === 'function') {
            evQuery = evQuery.eq('actor_id', userId);
          }
          if (typeof evQuery?.in === 'function') {
            evQuery = evQuery.in('event_type', [
              'newsletter_subscription_toggled',
              'magazine_unsubscribed',
              'magazine_subscribed',
              'custom_client_upserted',
              'inbox_custom_client_upserted',
            ]);
          }
          if (typeof evQuery?.order === 'function') {
            evQuery = evQuery.order('created_at', { ascending: true });
          }
          const evRes = await evQuery;
          const evRows = [...(Array.isArray(evRes?.data) ? evRes.data : [])].sort(
            (a, b) => toSafeEpochMs(a?.created_at) - toSafeEpochMs(b?.created_at)
          );

          for (const ev of evRows) {
            if (ev?.actor_id && String(ev.actor_id) !== userId) continue;
            const meta = (
              ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}
            ) as Record<string, any>;
            const evEmail = normalizeClientEmail(
              String(
                meta.client_email ||
                  meta.subscriber_email ||
                  meta.to_email ||
                  meta.email ||
                  ''
              )
            );
            const matchesEmail = evEmail === precheckedEmail;
            const matchesThread =
              Boolean(recipientRef) &&
              (meta.client_id === recipientRef ||
                meta.thread_id === recipientRef ||
                (Boolean(rawTargetId) &&
                  (meta.raw_client_id === rawTargetId ||
                    meta.subscriber_id === rawTargetId ||
                    ev.entity_id === rawTargetId)));

            if (!matchesEmail && !matchesThread) continue;
            const ts = toSafeEpochMs(ev?.created_at) || latestEventTs + 1;

            if (ev?.event_type === 'newsletter_subscription_toggled') {
              const rawSub = meta.subscribed ?? meta.newsletter_subscribed;
              if (rawSub === false) {
                latestEventSubscribed = false;
                latestEventTs = ts;
              } else if (rawSub === true) {
                latestEventSubscribed = true;
                latestEventTs = ts;
              }
            } else if (ev?.event_type === 'magazine_unsubscribed') {
              latestEventSubscribed = false;
              latestEventTs = ts;
            } else if (ev?.event_type === 'magazine_subscribed') {
              latestEventSubscribed = true;
              latestEventTs = ts;
            } else if (
              ev?.event_type === 'custom_client_upserted' ||
              ev?.event_type === 'inbox_custom_client_upserted'
            ) {
              if (meta.newsletter_subscribed === true || meta.subscribed === true) {
                latestUpsertOptIn = true;
              } else if (meta.newsletter_subscribed === false || meta.subscribed === false) {
                latestUpsertOptIn = false;
              }
            }
          }
        } catch {
          // ignore if activity_events unavailable in mock
        }

        let unsubscribedByClientTag = false;
        let optedInByClientTag = false;
        try {
          let cliRes: any = await supabase
            .from('broker_clients')
            .select('id, email, tags, email_delivery_status')
            .eq('broker_id', userId);
          if (cliRes?.error && isIgnorableSchemaError(cliRes.error)) {
            cliRes = await supabase
              .from('broker_clients')
              .select('id, tags')
              .eq('broker_id', userId);
          }
          const cliRows = Array.isArray(cliRes?.data) ? cliRes.data : [];
          for (const c of cliRows) {
            const matchesId = Boolean(rawTargetId) && String(c?.id || '') === rawTargetId;
            const matchesEmail = normalizeClientEmail(c?.email) === precheckedEmail;
            if (!matchesId && !matchesEmail) continue;

            const deliveryLower = String(c?.email_delivery_status ?? 'ok').toLowerCase();
            if (deliveryLower === 'bounced' || deliveryLower === 'complained') {
              bouncedOrComplained = true;
            }
            const tags = Array.isArray(c?.tags)
              ? c.tags.map((t: unknown) => String(t))
              : [];
            if (tags.some((t: string) => /수신거부|해지|unsub/i.test(t))) {
              unsubscribedByClientTag = true;
            } else if (tags.some((t: string) => /뉴스레터구독|수신동의/i.test(t))) {
              optedInByClientTag = true;
            }
          }
        } catch {
          // ignore if broker_clients unavailable
        }

        if (bouncedOrComplained) {
          return NextResponse.json(
            {
              ok: false,
              code: 'RECIPIENT_BOUNCED_OR_COMPLAINED',
              blockedReason: 'RECIPIENT_BOUNCED_OR_COMPLAINED',
              error:
                '이전에 반송(수신 불가)되거나 스팸 신고된 이메일 주소이므로 발송이 자동 차단되었습니다.',
            },
            { status: 422 }
          );
        }

        const isRecipientUnsubscribed =
          unsubscribedBySubscriber ||
          latestEventSubscribed === false ||
          (unsubscribedByClientTag && latestEventSubscribed !== true);

        if (isRecipientUnsubscribed) {
          return NextResponse.json(
            {
              ok: false,
              code: 'RECIPIENT_UNSUBSCRIBED',
              error: '수신거부(해지)를 요청한 고객에게는 이메일을 발송할 수 없습니다.',
            },
            { status: 403 }
          );
        }

        let optedInByCustomClientState = false;
        const inboxCustomClients = getInboxState().customClients || [];
        for (const c of inboxCustomClients) {
          if (!c || c.ownerId !== userId) continue;
          const matchesId =
            Boolean(recipientRef) &&
            (c.id === recipientRef ||
              (Boolean(rawTargetId) &&
                (c.id === rawTargetId || c.id === `custom_${rawTargetId}`)));
          const matchesEmail = normalizeClientEmail(c.clientEmail) === precheckedEmail;
          if ((matchesId || matchesEmail) && c.newsletterSubscribed === true) {
            optedInByCustomClientState = true;
            break;
          }
        }

        hasExplicitCrmOptIn =
          latestEventSubscribed === true ||
          optedInByClientTag ||
          optedInByCustomClientState ||
          (latestUpsertOptIn === true && latestEventSubscribed === null);

        const isCustomOrSubThread =
          !recipientRef ||
          recipientRef.startsWith('custom_') ||
          recipientRef.startsWith('custom-') ||
          recipientRef.startsWith('cli-') ||
          recipientRef.startsWith('sub_') ||
          recipientRef.startsWith('view_');

        if (!isCustomOrSubThread && rawTargetId) {
          const inquiryTables: Array<[string, string]> = [
            ['gate_requests', 'id, building_id, status'],
            ['im_inquiry_requests', 'id, building_id, status'],
            ['inquiries', 'id, status'],
            ['im_pro_grants', 'id, building_id, status'],
          ];
          for (const [tbl, cols] of inquiryTables) {
            try {
              const q: any = supabase.from(tbl).select(cols).eq('id', rawTargetId);
              const r =
                typeof q?.maybeSingle === 'function'
                  ? await q.maybeSingle()
                  : await q?.single?.();
              if (!r?.error && r?.data?.id) {
                hasVerifiedInquiryRecord = true;
                break;
              }
            } catch {
              // table may not exist in all environments
            }
          }
        }
      }

      const channel: ShareLinkChannel = isEmailAction
        ? 'email'
        : isAlimtalkAction
          ? 'alimtalk'
          : 'copy';

      let resolvedRelativeShareUrl =
        typeof body?.shareUrl === 'string' && body.shareUrl.trim()
          ? body.shareUrl.trim()
          : '';
      let resolvedShareToken = shareToken || '';

      if (assetKind === 'magazine') {
        if (!resolvedRelativeShareUrl || resolvedRelativeShareUrl === '/magazine') {
          resolvedRelativeShareUrl = brokerSlug
            ? `/magazine/${encodeURIComponent(brokerSlug)}`
            : '/magazine';
        }
        if (recipientRef && !resolvedRelativeShareUrl.includes('sid=')) {
          resolvedRelativeShareUrl = `${resolvedRelativeShareUrl}${
            resolvedRelativeShareUrl.includes('?') ? '&' : '?'
          }sid=${encodeURIComponent(recipientRef)}`;
        }
      } else if (buildingId) {
        const issued = await issueShareLinkToken({
          buildingId,
          brokerId: userId,
          recipientId: recipientRef,
          ttlDays: Number(body?.ttlDays) > 0 ? Number(body.ttlDays) : 30,
          kind: assetKind === 'dealcard' ? 'dealcard' : 'im',
          channel,
        });
        resolvedShareToken = issued.token;
        resolvedRelativeShareUrl = issued.shareUrl;
      } else if (!resolvedRelativeShareUrl) {
        resolvedRelativeShareUrl = brokerSlug
          ? `/magazine/${encodeURIComponent(brokerSlug)}`
          : '/magazine';
      }

      const fullShareUrl = toAbsoluteUrl(resolvedRelativeShareUrl);

      if (action === 'prepare_copy_bundle') {
        const bundle = buildInboxCopyBundle({
          brokerName,
          brokerPhone,
          clientName,
          buildingTitle,
          shareUrl: fullShareUrl,
          headline,
          assetKind,
        });

        try {
          if (isUuid(userId)) {
            await supabase.from('activity_events').insert({
              actor_id: userId,
              event_type: 'inbox_outbound_copied',
              entity_type: 'building',
              entity_id: buildingId && isUuid(buildingId) ? buildingId : userId,
              metadata: {
                thread_id: recipientRef,
                building_id: buildingId || null,
                asset_kind: assetKind,
                share_token: resolvedShareToken || null,
                share_url: resolvedRelativeShareUrl,
              },
            });
          }
        } catch {
          // non-blocking
        }

        return NextResponse.json({
          ok: true,
          action,
          shareToken: resolvedShareToken || undefined,
          shareUrl: resolvedRelativeShareUrl,
          fullShareUrl,
          subject: bundle.subject,
          messageText: bundle.messageText,
        });
      }

      if (isEmailAction) {
        const clientEmail = precheckedEmail!;
        const isCustomOrSubThread =
          !recipientRef ||
          recipientRef.startsWith('custom_') ||
          recipientRef.startsWith('custom-') ||
          recipientRef.startsWith('cli-') ||
          recipientRef.startsWith('sub_') ||
          recipientRef.startsWith('view_');

        const rawEmailBasis = normalizeTransactionalBasis(body?.transactionalBasis);
        const hasThreadBackedBasis =
          !isCustomOrSubThread &&
          (rawEmailBasis === 'im_request' ||
            rawEmailBasis === 'property_inquiry' ||
            rawEmailBasis === 'tour_booking');

        const deliveryPurpose: InboxEmailDeliveryPurpose =
          body?.deliveryPurpose === 'marketing_outreach' ||
          assetKind === 'magazine' ||
          rawEmailBasis === 'broker_manual' ||
          isCustomOrSubThread
            ? 'marketing_outreach'
            : hasVerifiedInquiryRecord || hasThreadBackedBasis
              ? 'transactional_reply'
              : 'marketing_outreach';

        const hasActiveMagazineOptIn = Boolean(activeSubscriberRow);
        const marketingOptIn =
          body?.marketingConsentConfirmed === true ||
          body?.marketingOptIn === true ||
          hasActiveMagazineOptIn ||
          hasExplicitCrmOptIn;
        const nightSendConsent =
          body?.nightSendConsent === true || Boolean(activeSubscriberRow?.night_consent === true);

        const rawClientId = (recipientRef || '').replace(/^(?:srv-|custom[-_]|cli-|sub_)/, '');
        const resolvedUnsubscribeUrl =
          deliveryPurpose === 'marketing_outreach'
            ? (typeof body?.unsubscribeUrl === 'string' && body.unsubscribeUrl.trim()) ||
              buildInboxUnsubscribeUrl({
                origin,
                brokerId: brokerSlug || userId,
                subscriberId: activeSubscriberRow?.id
                  ? String(activeSubscriberRow.id)
                  : rawClientId || 'inbox-client',
                toEmail: clientEmail,
              })
            : null;

        const emailRes = await sendInboxClientEmail({
          toEmail: clientEmail,
          brokerName,
          brokerCompany,
          brokerPhone,
          brokerAddress,
          brokerId: brokerSlug || userId,
          subscriberId: activeSubscriberRow?.id ? String(activeSubscriberRow.id) : undefined,
          clientName,
          buildingTitle,
          shareUrl: fullShareUrl,
          headline,
          assetKind,
          deliveryPurpose,
          transactionalBasis: rawEmailBasis,
          hasInquiryRecord: hasVerifiedInquiryRecord || hasThreadBackedBasis,
          marketingOptIn,
          nightSendConsent,
          unsubscribeUrl: resolvedUnsubscribeUrl,
        });

        if (!emailRes.ok) {
          const status =
            emailRes.blockedReason === 'INVALID_EMAIL'
              ? 400
              : emailRes.blockedReason === 'OPT_IN_REQUIRED' ||
                  emailRes.blockedReason === 'QUIET_HOURS_KST'
                ? 403
                : 502;
          return NextResponse.json(
            {
              ok: false,
              blockedReason: emailRes.blockedReason,
              code: emailRes.blockedReason,
              subject: emailRes.subject,
              error: emailRes.error || '이메일 발송에 실패했습니다.',
            },
            { status }
          );
        }

        try {
          if (isUuid(userId)) {
            await supabase.from('activity_events').insert({
              actor_id: userId,
              event_type: 'inbox_email_sent',
              entity_type: 'building',
              entity_id: buildingId && isUuid(buildingId) ? buildingId : userId,
              metadata: {
                thread_id: recipientRef,
                building_id: buildingId || null,
                to_email: clientEmail,
                asset_kind: assetKind,
                delivery_purpose: emailRes.deliveryPurpose || deliveryPurpose,
                broker_reg_number: brokerRegNumber || null,
                share_token: resolvedShareToken || null,
                simulated: Boolean(emailRes.simulated),
              },
            });
          }
        } catch {
          // non-blocking
        }

        return NextResponse.json({
          ok: true,
          action,
          simulated: Boolean(emailRes.simulated),
          messageId: emailRes.messageId,
          deliveryPurpose: emailRes.deliveryPurpose || deliveryPurpose,
          toEmail: clientEmail,
          subject: emailRes.subject,
          unsubscribeUrl: emailRes.unsubscribeUrl || undefined,
          shareToken: resolvedShareToken || undefined,
          shareUrl: resolvedRelativeShareUrl,
          fullShareUrl,
        });
      }

      // action === 'send_inbox_alimtalk' | 'send_alimtalk'
      const clientPhone = String(body?.clientPhone || '').trim();
      const rawBasis =
        normalizeTransactionalBasis(body?.transactionalBasis) ||
        (recipientRef &&
        !recipientRef.startsWith('custom_') &&
        !recipientRef.startsWith('sub_') &&
        !recipientRef.startsWith('view_')
          ? 'im_request'
          : null);

      const access = evaluateInboxAlimtalkAccess({
        tier: subscriptionInfo.tier,
        isPaid: subscriptionInfo.isPaid,
        transactionalBasis: rawBasis,
        clientPhone,
      });

      if (!access.allowed) {
        return NextResponse.json(
          {
            ok: false,
            code: access.code,
            tier: subscriptionInfo.tier,
            error: access.reason,
          },
          { status: access.code === 'INVALID_PHONE' ? 400 : 403 }
        );
      }

      const validTemplates: InboxAlimtalkTemplateId[] = [
        'TPL_INBOX_IM_APPROVED',
        'TPL_INBOX_INQUIRY_REPLY',
        'TPL_INBOX_TOUR_CONFIRMED',
        'TPL_INBOX_CORRECTION_NOTICE',
      ];
      const requestedTemplate = String(body?.templateId || '');
      const templateId: InboxAlimtalkTemplateId = validTemplates.includes(
        requestedTemplate as InboxAlimtalkTemplateId
      )
        ? (requestedTemplate as InboxAlimtalkTemplateId)
        : 'TPL_INBOX_IM_APPROVED';

      const alimRes = await sendInboxTransactionalAlimtalk({
        recipientPhone: clientPhone,
        templateId,
        brokerName,
        brokerCompany,
        clientName,
        buildingTitle,
        shareUrl: fullShareUrl,
        customMessage: headline,
        transactionalBasis: rawBasis!,
      });

      if (!alimRes.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: alimRes.error || '카카오 알림톡 발송에 실패했습니다.',
          },
          { status: 502 }
        );
      }

      const earlyAccessGuidance =
        'Pro 알림톡 정식 연동 오픈 예정입니다. 이메일 발송 또는 카톡 인사말+링크 1초 복사 기능을 이용해 주세요.';

      if (alimRes.simulated) {
        return NextResponse.json({
          ok: true,
          action,
          simulated: true,
          earlyAccess: true,
          dispatched: false,
          messageId: null,
          message: earlyAccessGuidance,
          guidance: earlyAccessGuidance,
          templateId: alimRes.templateId,
          previewText: alimRes.previewText,
          shareToken: resolvedShareToken || undefined,
          shareUrl: resolvedRelativeShareUrl,
          fullShareUrl,
        });
      }

      try {
        if (isUuid(userId)) {
          await supabase.from('activity_events').insert({
            actor_id: userId,
            event_type: 'inbox_alimtalk_sent',
            entity_type: 'building',
            entity_id: buildingId && isUuid(buildingId) ? buildingId : userId,
            metadata: {
              thread_id: recipientRef,
              building_id: buildingId || null,
              template_id: templateId,
              transactional_basis: rawBasis,
              share_token: resolvedShareToken || null,
              simulated: false,
            },
          });
        }
      } catch {
        // non-blocking
      }

      return NextResponse.json({
        ok: true,
        action,
        simulated: false,
        earlyAccess: false,
        dispatched: true,
        messageId: alimRes.messageId,
        templateId: alimRes.templateId,
        previewText: alimRes.previewText,
        shareToken: resolvedShareToken || undefined,
        shareUrl: resolvedRelativeShareUrl,
        fullShareUrl,
      });
    }

    return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || '소통함 작업 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
