import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limiter';
import { createModuleLogger } from '@/lib/logger';
import { inspectShareTokenOwnership, verifyBrokerOwnership } from '@/lib/inbox/inbox-ownership';
import {
  handleArchiveThreadAction,
  handleGateDecisionAction,
  handleSendDealcardOrMagazineAction,
} from '@/lib/inbox/inbox-actions-leads';
import {
  handleCallNoteAction,
  handleCorrectionNoticeAction,
  handleLinkRevokeAction,
} from '@/lib/inbox/inbox-actions-governance';
import {
  handleDeleteClientAction,
  handleToggleNewsletterAction,
  handleUpsertClientAction,
} from '@/lib/inbox/inbox-actions-clients';
import { handleOutboundChannelAction } from '@/lib/inbox/inbox-actions-outbound';
import { getCanonicalSiteUrl } from '@/lib/site-url';

const GATE_ACTIONS = new Set(['approve_gate', 'approve', 'send_im', 'reject_gate', 'reject', 'reset_gate']);
const REVOKE_ACTIONS = new Set(['revoke_link', 'revoke', 'restore_link', 'unlock_share_link']);
const CORRECTION_ACTIONS = new Set(['correction_notice', 'clear_correction_notice']);
const CLIENT_UPSERT_ACTIONS = new Set(['upsert_client', 'update_client', 'update_client_profile']);
const OUTBOUND_ACTIONS = new Set([
  'prepare_copy_bundle',
  'send_inbox_email',
  'send_client_email',
  'send_email',
  'send_inbox_alimtalk',
  'send_alimtalk',
]);

/** Actions that dispatch a message to a recipient (stricter per-broker bucket). */
const SEND_ACTIONS = new Set([
  'send_inbox_email',
  'send_client_email',
  'send_email',
  'send_inbox_alimtalk',
  'send_alimtalk',
  'send_magazine',
  'send_newsletter',
]);

/** WP-7.3E P1-8: per-broker rate limits (same helper as inbox-import). */
const INBOX_ACTIONS_RATE_LIMIT = { max: 120, windowMs: 60_000 } as const;
const INBOX_SEND_RATE_LIMIT = { max: 30, windowMs: 60_000 } as const;

const log = createModuleLogger('broker-inbox-actions');

function rateLimitedResponse() {
  return NextResponse.json(
    { ok: false, code: 'RATE_LIMITED', error: '요청이 너무 많습니다. 1분 후 다시 시도해 주세요.' },
    { status: 429, headers: { 'Retry-After': '60' } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireBroker(req);
    if (guard.error || !guard.user?.id) {
      return (
        guard.error ||
        NextResponse.json({ ok: false, error: '인증이 필요합니다. 다시 로그인해 주세요.' }, { status: 401 })
      );
    }

    const userId = guard.user.id;
    const isAdmin = guard.role === 'admin' || (guard.user as { role?: string }).role === 'admin';
    let body: Record<string, unknown>;
    try {
      const parsedBody: unknown = await req.json();
      if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
        return NextResponse.json({ ok: false, error: '올바른 JSON 요청 본문이 필요합니다.' }, { status: 400 });
      }
      body = parsedBody as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: '요청 본문 JSON 형식이 올바르지 않습니다.' }, { status: 400 });
    }
    const action = String(body?.action || '');

    const generalAllowed = await checkRateLimit(
      userId,
      'broker_inbox_actions',
      INBOX_ACTIONS_RATE_LIMIT.max,
      INBOX_ACTIONS_RATE_LIMIT.windowMs
    );
    if (!generalAllowed) return rateLimitedResponse();
    if (SEND_ACTIONS.has(action)) {
      const sendAllowed = await checkRateLimit(
        userId,
        'broker_inbox_send',
        INBOX_SEND_RATE_LIMIT.max,
        INBOX_SEND_RATE_LIMIT.windowMs
      );
      if (!sendAllowed) return rateLimitedResponse();
    }

    const threadId = String(body?.threadId || body?.gateRequestId || body?.requestId || '').trim();
    const clientId = String(body?.clientId || '').trim();
    const rawBuildingId = typeof body?.buildingId === 'string' ? body.buildingId.trim() : '';
    const shareToken = String(body?.shareToken || body?.token || '').trim();

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

    const buildingId = rawBuildingId || tokenBuildingId;
    if ((REVOKE_ACTIONS.has(action) || CORRECTION_ACTIONS.has(action)) && !buildingId && !shareToken) {
      return NextResponse.json({ ok: false, error: '대상 매물 ID(buildingId) 또는 공유 토큰이 필요합니다.' }, { status: 400 });
    }

    const ownership = await verifyBrokerOwnership({ userId, isAdmin, buildingId, threadId, clientId, action });
    if (!ownership.allowed) {
      return NextResponse.json(
        { ok: false, error: ownership.reason || '권한이 없습니다.' },
        { status: ownership.status || 403 }
      );
    }

    if (GATE_ACTIONS.has(action)) {
      return handleGateDecisionAction({ action, userId, buildingId, threadId, shareToken, body });
    }
    if (action === 'archive_thread' || action === 'unarchive_thread') {
      return handleArchiveThreadAction({ action, userId, buildingId, threadId });
    }
    if (REVOKE_ACTIONS.has(action)) {
      return handleLinkRevokeAction({ action, userId, isAdmin, threadId, shareToken, body, buildingId });
    }
    if (CORRECTION_ACTIONS.has(action)) {
      return handleCorrectionNoticeAction({ action, userId, isAdmin, buildingId, threadId, body });
    }
    if (action === 'add_call_note' || action === 'log_call') {
      return handleCallNoteAction({ action, userId, buildingId, threadId, body });
    }
    if (action === 'toggle_newsletter' || action === 'toggle_newsletter_subscription') {
      return handleToggleNewsletterAction({ action, userId, buildingId, threadId, clientId, body });
    }
    if (CLIENT_UPSERT_ACTIONS.has(action)) {
      return handleUpsertClientAction({ action, userId, buildingId, threadId, clientId, body });
    }
    if (action === 'delete_client') {
      return handleDeleteClientAction({ action, userId, threadId, clientId });
    }
    if (action === 'send_dealcard' || action === 'send_magazine' || action === 'send_newsletter') {
      return handleSendDealcardOrMagazineAction({ action, userId, buildingId, threadId, clientId, body });
    }
    if (OUTBOUND_ACTIONS.has(action)) {
      const origin = req.nextUrl?.origin || getCanonicalSiteUrl();
      return handleOutboundChannelAction({ action, userId, buildingId, threadId, clientId, shareToken, origin, body });
    }

    return NextResponse.json({ ok: false, error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    // WP-7.3E P2-5: never leak raw error messages to the client; log details server-side.
    log.error('POST /api/broker/inbox/actions failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: '소통함 작업 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    );
  }
}
