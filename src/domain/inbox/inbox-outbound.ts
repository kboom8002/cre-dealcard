import crypto from 'node:crypto';
import { Resend } from 'resend';
import { createModuleLogger } from '@/lib/logger';
import { isQuietHoursKst } from '@/lib/magazine/kst';
import { maskEmail, maskPhone } from '@/lib/magazine/pii';
import { isUuid } from '@/lib/magazine/slug';
import { hashEmailForSuppression } from '@/lib/legal/email-suppression';
import {
  buildListUnsubscribeHeaders,
  buildUnsubscribeUrl,
  issueUnsubToken,
} from '@/domain/magazine/unsub-token';
import type { SubscriptionTier } from '@/domain/subscription/tier-gate';

const log = createModuleLogger('inbox-outbound');

export type InboxTransactionalBasis =
  | 'im_request'
  | 'property_inquiry'
  | 'tour_booking'
  | 'broker_manual';

export type InboxEmailDeliveryPurpose = 'transactional_reply' | 'marketing_outreach';

export type InboxEmailBlockedReason =
  | 'INVALID_EMAIL'
  | 'OPT_IN_REQUIRED'
  | 'QUIET_HOURS_KST'
  | 'UNSUBSCRIBE_LINK_UNAVAILABLE';

export const TRANSACTIONAL_BASIS_LABELS: Record<InboxTransactionalBasis, string> = {
  im_request: '고객 IM 열람 요청',
  property_inquiry: '고객 매물 문의 접수',
  tour_booking: '고객 임장/미팅 예약',
  broker_manual: '기존 상담 고객 1:1 안내',
};

export type InboxAlimtalkTemplateId =
  | 'TPL_INBOX_IM_APPROVED'
  | 'TPL_INBOX_INQUIRY_REPLY'
  | 'TPL_INBOX_TOUR_CONFIRMED'
  | 'TPL_INBOX_CORRECTION_NOTICE';

export const INBOX_ALIMTALK_TEMPLATE_LABELS: Record<InboxAlimtalkTemplateId, string> = {
  TPL_INBOX_IM_APPROVED: 'IM 열람 승인 안내',
  TPL_INBOX_INQUIRY_REPLY: '매물 문의 답변 안내',
  TPL_INBOX_TOUR_CONFIRMED: '임장·미팅 일정 안내',
  TPL_INBOX_CORRECTION_NOTICE: '수정 정정 안내',
};

const VALID_EMAIL_REGEX = /^[^\s@<>()[\]\\,;:\s]+@[^\s@<>()[\]\\,;:\s]+\.[^\s@<>()[\]\\,;:\s]{2,}$/;

export function normalizeClientEmail(raw?: string | null): string | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed || trimmed.length > 254 || /[\r\n]/.test(trimmed)) {
    return null;
  }
  if (!VALID_EMAIL_REGEX.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase();
}

export function normalizeTransactionalBasis(raw?: unknown): InboxTransactionalBasis | null {
  if (
    raw === 'im_request' ||
    raw === 'property_inquiry' ||
    raw === 'tour_booking' ||
    raw === 'broker_manual'
  ) {
    return raw;
  }
  return null;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatInboxEmailFromHeader(brokerName: string, rawFrom?: string): string {
  const base = (rawFrom || '').trim() || 'CRE Deal <noreply@credeal.net>';
  const addrMatch = base.match(/<([^>]+)>/);
  const addr = addrMatch ? addrMatch[1].trim() : base;
  const safeBroker = brokerName.replace(/["<>\r\n]/g, '').trim() || '담당 중개인';
  return `"${safeBroker} · CRE Deal" <${addr}>`;
}

export interface InboxCopyBundleInput {
  brokerName: string;
  brokerPhone?: string | null;
  clientName: string;
  buildingTitle: string;
  shareUrl: string;
  headline?: string | null;
  brief?: string | null;
  assetKind?: 'im' | 'dealcard' | 'magazine';
}

export interface InboxCopyBundleResult {
  subject: string;
  messageText: string;
  shareUrl: string;
}

export function buildInboxCopyBundle(input: InboxCopyBundleInput): InboxCopyBundleResult {
  const clientName = (input.clientName || '고객').trim();
  const brokerName = (input.brokerName || '담당 중개인').trim();
  const buildingTitle = (input.buildingTitle || '추천 빌딩').trim();
  const assetLabel =
    input.assetKind === 'dealcard'
      ? '블라인드 매물 요약(딜카드)'
      : input.assetKind === 'magazine'
        ? '빌딩 시장 뉴스레터'
        : '매물 상세 브리핑(IM)';
  const headlineLine = input.headline?.trim() ? `\n핵심 요약: ${input.headline.trim()}` : '';
  const briefParagraph = input.brief?.trim() ? input.brief.trim() : '';
  const phoneLine = input.brokerPhone?.trim() ? `\n문의 연락처: ${input.brokerPhone.trim()}` : '';

  const subject = `[${brokerName} 중개인] ${buildingTitle} ${assetLabel} 전달드립니다`;
  const messageText = [
    `${clientName}님, 안녕하세요. ${brokerName} 중개인입니다.`,
    `요청·상담하신 [${buildingTitle}] ${assetLabel} 자료 링크를 보내드립니다.${headlineLine}`,
    ...(briefParagraph ? ['', briefParagraph] : []),
    '',
    `▶ 자료 바로 보기: ${input.shareUrl}`,
    '',
    `모바일에서도 로그인 없이 바로 열람 가능하며, 궁금하신 점은 편하게 회신해 주세요.${phoneLine}`,
  ].join('\n');

  return {
    subject,
    messageText,
    shareUrl: input.shareUrl,
  };
}

export function resolveInboxEmailDeliveryPurpose(input: {
  deliveryPurpose?: InboxEmailDeliveryPurpose | null;
  transactionalBasis?: InboxTransactionalBasis | string | null;
  hasInquiryRecord?: boolean;
}): InboxEmailDeliveryPurpose {
  if (
    input.deliveryPurpose === 'transactional_reply' ||
    input.deliveryPurpose === 'marketing_outreach'
  ) {
    return input.deliveryPurpose;
  }
  if (input.hasInquiryRecord === true) {
    return 'transactional_reply';
  }
  const basis = normalizeTransactionalBasis(input.transactionalBasis);
  if (
    basis === 'im_request' ||
    basis === 'property_inquiry' ||
    basis === 'tour_booking'
  ) {
    return 'transactional_reply';
  }
  return 'marketing_outreach';
}

export function buildInboxUnsubscribeUrl(params: {
  origin?: string | null;
  brokerId?: string | null;
  subscriberId?: string | null;
  toEmail: string;
}): string {
  if (!process.env.UNSUBSCRIBE_SECRET) {
    return '';
  }

  const baseOrigin = (
    params.origin?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    'https://credeal.net'
  ).replace(/\/+$/, '');

  const rawInputSub = (params.subscriberId || '').trim();
  const strippedSub = rawInputSub.replace(/^(?:srv-|custom[-_]|cli[-_]|sub_)/, '');

  let targetId = '';
  if (rawInputSub && rawInputSub !== 'inbox-client') {
    if (isUuid(strippedSub)) {
      targetId =
        rawInputSub.startsWith('sub_') || rawInputSub.startsWith('cli-')
          ? rawInputSub.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 100)
          : strippedSub;
    } else if (/^(?:sub_[A-Za-z0-9_-]{1,96}|emh_[0-9a-f]{64})$/i.test(rawInputSub)) {
      targetId = rawInputSub;
    }
  }

  if (!targetId) {
    const emailHash = hashEmailForSuppression(params.toEmail);
    if (!emailHash) return '';
    targetId = `emh_${emailHash}`;
  }

  const brokerKey =
    (params.brokerId || 'broker')
      .trim()
      .replace(/[^A-Za-z0-9_-]/g, '-')
      .slice(0, 100) || 'broker';

  try {
    const token = issueUnsubToken({ subscriberId: targetId, brokerId: brokerKey });
    if (!token || token === 'NO_SECRET') {
      return '';
    }
    return buildUnsubscribeUrl(baseOrigin, token);
  } catch {
    return '';
  }
}

const UNSUBSCRIBE_PATH = '/api/public/magazine/unsubscribe';

/**
 * WP-7.3E P1-2: only a server-built unsubscribe URL (http(s), our unsubscribe endpoint, single `t`
 * token, no header-injection characters) may flow into List-Unsubscribe / the footer.
 * Anything else is discarded and the URL is regenerated server-side.
 */
export function isTrustedInboxUnsubscribeUrl(raw?: string | null): boolean {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value || value.length > 2048 || /[\s<>"'\\]/.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (url.username || url.password) return false;
    if (url.pathname !== UNSUBSCRIBE_PATH) return false;
    const tokens = url.searchParams.getAll('t');
    if (tokens.length !== 1 || !tokens[0] || tokens[0].length > 600) return false;
    return Array.from(url.searchParams.keys()).every((k) => k === 't');
  } catch {
    return false;
  }
}

export interface SendInboxClientEmailInput {
  toEmail: string;
  brokerName: string;
  brokerCompany?: string | null;
  brokerPhone?: string | null;
  brokerAddress?: string | null;
  brokerEmail?: string | null;
  brokerId?: string | null;
  subscriberId?: string | null;
  clientName: string;
  buildingTitle: string;
  shareUrl: string;
  headline?: string | null;
  brief?: string | null;
  assetKind?: 'im' | 'dealcard' | 'magazine';
  deliveryPurpose?: InboxEmailDeliveryPurpose;
  transactionalBasis?: InboxTransactionalBasis | string | null;
  hasInquiryRecord?: boolean;
  marketingOptIn?: boolean;
  nightSendConsent?: boolean;
  unsubscribeUrl?: string | null;
  now?: Date;
}

export interface SendInboxClientEmailResult {
  ok: boolean;
  simulated?: boolean;
  messageId?: string | null;
  blockedReason?: InboxEmailBlockedReason;
  deliveryPurpose?: InboxEmailDeliveryPurpose;
  headers?: Record<string, string>;
  html?: string;
  unsubscribeUrl?: string | null;
  error?: string;
  subject: string;
  text: string;
}

export async function sendInboxClientEmail(
  input: SendInboxClientEmailInput
): Promise<SendInboxClientEmailResult> {
  const normalizedEmail = normalizeClientEmail(input.toEmail);
  const deliveryPurpose = resolveInboxEmailDeliveryPurpose({
    deliveryPurpose: input.deliveryPurpose,
    transactionalBasis: input.transactionalBasis,
    hasInquiryRecord: input.hasInquiryRecord,
  });

  const bundle = buildInboxCopyBundle({
    brokerName: input.brokerName,
    brokerPhone: input.brokerPhone,
    clientName: input.clientName,
    buildingTitle: input.buildingTitle,
    shareUrl: input.shareUrl,
    headline: input.headline,
    brief: input.brief,
    assetKind: input.assetKind,
  });

  const baseSubject = bundle.subject.trim();
  const subject =
    deliveryPurpose === 'marketing_outreach'
      ? baseSubject.startsWith('(광고)')
        ? baseSubject
        : `(광고) ${baseSubject}`
      : baseSubject;

  if (!normalizedEmail) {
    return {
      ok: false,
      blockedReason: 'INVALID_EMAIL',
      deliveryPurpose,
      error: '수신 가능한 이메일 주소를 올바르게 입력해 주세요.',
      subject,
      text: bundle.messageText,
    };
  }

  const brokerNameClean = (input.brokerName || '담당 중개인').trim();
  const brokerCompanyClean = (input.brokerCompany || '').trim();
  const brokerPhoneClean = (input.brokerPhone || '').trim();
  const brokerAddressClean = (input.brokerAddress || '').trim();
  const brokerEmailClean = (input.brokerEmail || '').trim();
  const senderIdentity = brokerCompanyClean || brokerNameClean;

  let shareOrigin: string | null = null;
  try {
    if (/^https?:\/\//i.test(input.shareUrl)) {
      shareOrigin = new URL(input.shareUrl).origin;
    }
  } catch {
    shareOrigin = null;
  }

  const callerUnsubscribeUrl = input.unsubscribeUrl?.trim() || '';
  if (callerUnsubscribeUrl && !isTrustedInboxUnsubscribeUrl(callerUnsubscribeUrl)) {
    log.warn('Discarding untrusted unsubscribeUrl; regenerating server-side', {
      deliveryPurpose,
    });
  }
  const resolvedUnsubscribeUrl =
    deliveryPurpose === 'marketing_outreach'
      ? (isTrustedInboxUnsubscribeUrl(callerUnsubscribeUrl) ? callerUnsubscribeUrl : '') ||
        buildInboxUnsubscribeUrl({
          origin: shareOrigin,
          brokerId: input.brokerId,
          subscriberId: input.subscriberId,
          toEmail: normalizedEmail,
        }) ||
        null
      : null;

  const text =
    deliveryPurpose === 'marketing_outreach'
      ? [
          bundle.messageText,
          '',
          '---',
          `발신자: ${senderIdentity}`,
          ...(brokerPhoneClean ? [`연락처: ${brokerPhoneClean}`] : []),
          ...(brokerAddressClean ? [`소재지: ${brokerAddressClean}`] : []),
          ...(brokerEmailClean ? [`전자우편: ${brokerEmailClean}`] : []),
          '본 메일은 정보통신망법에 따라 수신에 동의하신 고객님께 발송된 안내 메일입니다.',
          ...(resolvedUnsubscribeUrl
            ? [`무료 수신거부: ${resolvedUnsubscribeUrl}`]
            : ['무료 수신거부: 회신으로 수신거부를 요청하시면 즉시 처리됩니다.']),
        ].join('\n')
      : bundle.messageText;

  if (deliveryPurpose === 'marketing_outreach') {
    if (input.marketingOptIn === false) {
      return {
        ok: false,
        blockedReason: 'OPT_IN_REQUIRED',
        deliveryPurpose,
        error:
          '수신 동의가 확인되지 않은 직접 등록 고객에게는 광고성 이메일 일괄/즉시 발송이 제한됩니다. 요청 답변 건이거나 수신 동의 확인 후 발송해주세요.',
        subject,
        text,
      };
    }

    const effectiveNow = input.now ?? new Date();
    if (isQuietHoursKst(effectiveNow) && input.nightSendConsent !== true) {
      return {
        ok: false,
        blockedReason: 'QUIET_HOURS_KST',
        deliveryPurpose,
        error:
          '야간 시간대(21:00~08:00)에는 정보통신망법에 따라 별도 야간 수신 동의가 없는 고객에게 광고성 이메일을 발송할 수 없습니다. 오전 8시 이후 발송하거나 1:1 안내 문구 복사를 이용해주세요.',
        subject,
        text,
      };
    }

    if (input.marketingOptIn !== true) {
      return {
        ok: false,
        blockedReason: 'OPT_IN_REQUIRED',
        deliveryPurpose,
        error:
          '수신 동의가 확인되지 않은 직접 등록 고객에게는 광고성 이메일 일괄/즉시 발송이 제한됩니다. 요청 답변 건이거나 수신 동의 확인 후 발송해주세요.',
        subject,
        text,
      };
    }

    // WP-7.3E P2-8: 정보통신망법 제50조 — a marketing email must carry a working one-click
    // unsubscribe link. If it cannot be signed (e.g. UNSUBSCRIBE_SECRET missing), fail closed.
    if (!resolvedUnsubscribeUrl) {
      log.error('Blocking marketing inbox email: unsubscribe link unavailable', {
        to: maskEmail(normalizedEmail),
      });
      return {
        ok: false,
        blockedReason: 'UNSUBSCRIBE_LINK_UNAVAILABLE',
        deliveryPurpose,
        error:
          '수신거부 링크를 생성할 수 없어 광고성 이메일 발송을 보류했습니다. 관리자에게 문의하시거나 1:1 안내 문구 복사를 이용해 주세요.',
        subject,
        text,
      };
    }
  }

  const headers =
    deliveryPurpose === 'marketing_outreach' && resolvedUnsubscribeUrl
      ? buildListUnsubscribeHeaders(resolvedUnsubscribeUrl)
      : undefined;

  const safeClient = escapeHtml((input.clientName || '고객').trim());
  const safeBroker = escapeHtml(brokerNameClean);
  const safeCompany = brokerCompanyClean ? escapeHtml(brokerCompanyClean) : '';
  const safeSenderIdentity = escapeHtml(senderIdentity);
  const safeTitle = escapeHtml((input.buildingTitle || '추천 매물').trim());
  const safeHeadline = input.headline?.trim() ? escapeHtml(input.headline.trim()) : '';
  const safeBriefHtml = input.brief?.trim()
    ? escapeHtml(input.brief.trim()).replace(/\r?\n/g, '<br/>')
    : '';
  const safePhone = brokerPhoneClean ? escapeHtml(brokerPhoneClean) : '';
  const safeAddress = brokerAddressClean ? escapeHtml(brokerAddressClean) : '';
  const safeBrokerEmail = brokerEmailClean ? escapeHtml(brokerEmailClean) : '';
  const safeUrl = escapeHtml(input.shareUrl);
  const safeUnsubUrl = resolvedUnsubscribeUrl ? escapeHtml(resolvedUnsubscribeUrl) : '';
  const headerBrandLine = safeCompany ? `${safeCompany} · ${safeBroker}` : safeBroker;

  const footerHtml =
    deliveryPurpose === 'marketing_outreach'
      ? `<div style="margin:0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.7;color:#64748b;">
      <p style="margin:0 0 6px;">
        발신자: ${safeSenderIdentity}${safePhone ? ` · 연락처: ${safePhone}` : ''}${safeAddress ? ` · 소재지: ${safeAddress}` : ''}${safeBrokerEmail ? ` · 전자우편: ${safeBrokerEmail}` : ''}
      </p>
      <p style="margin:0;">
        본 메일은 정보통신망법에 따라 수신에 동의하신 고객님께 발송된 광고성 안내 메일입니다.${
          safeUnsubUrl
            ? `<br/><a href="${safeUnsubUrl}" style="color:#2563eb;font-weight:700;text-decoration:underline;">무료 수신거부 (1클릭 해지)</a>`
            : ''
        }
      </p>
    </div>`
      : `<p style="margin:0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:#64748b;">
      발신: ${safeBroker}${safeCompany ? ` (${safeCompany})` : ''}${safePhone ? ` · ${safePhone}` : ''}${safeAddress ? ` · ${safeAddress}` : ''}${safeBrokerEmail ? ` · ${safeBrokerEmail}` : ''}<br/>
      본 메일은 상담·자료 요청 고객님께 1:1로 전달된 매물 안내 메일입니다.
    </p>`;

  const html = `<!doctype html>
<html lang="ko">
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans KR',sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;">
    <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#2563eb;">${headerBrandLine}</p>
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.45;color:#0f172a;">${safeClient}님, [${safeTitle}] 자료를 보내드립니다</h1>
    ${safeHeadline ? `<p style="margin:0 0 16px;padding:12px 14px;background:#f1f5f9;border-radius:10px;font-size:15px;line-height:1.6;color:#1e293b;">${safeHeadline}</p>` : ''}
    ${safeBriefHtml ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#1e293b;">${safeBriefHtml}</p>` : ''}
    <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#334155;">아래 버튼을 누르시면 회원가입이나 별도 앱 설치 없이 모바일·PC에서 바로 확인하실 수 있습니다.</p>
    <div style="margin:0 0 24px;">
      <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:12px;font-size:16px;font-weight:700;">매물 자료 바로 보기 →</a>
    </div>
    ${footerHtml}
  </div>
</body>
</html>`;

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    log.info('[Email STUB] Simulated inbox email', {
      to: maskEmail(normalizedEmail),
      subject,
      deliveryPurpose,
    });
    return {
      ok: true,
      simulated: true,
      messageId: `sim-email-${Date.now()}`,
      deliveryPurpose,
      headers,
      html,
      unsubscribeUrl: resolvedUnsubscribeUrl,
      subject,
      text,
    };
  }

  try {
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from: formatInboxEmailFromHeader(input.brokerName, process.env.EMAIL_FROM),
      to: normalizedEmail,
      subject,
      html,
      text,
      ...(headers ? { headers } : {}),
    });
    if (error) {
      log.error('Resend inbox email error', { message: error.message });
      return {
        ok: false,
        deliveryPurpose,
        headers,
        html,
        unsubscribeUrl: resolvedUnsubscribeUrl,
        error: error.message,
        subject,
        text,
      };
    }
    return {
      ok: true,
      simulated: false,
      messageId: data?.id ?? null,
      deliveryPurpose,
      headers,
      html,
      unsubscribeUrl: resolvedUnsubscribeUrl,
      subject,
      text,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Unexpected error sending inbox email', { message });
    return {
      ok: false,
      deliveryPurpose,
      headers,
      html,
      unsubscribeUrl: resolvedUnsubscribeUrl,
      error: message,
      subject,
      text,
    };
  }
}

export function buildAlimtalkTemplateBody(params: {
  templateId: InboxAlimtalkTemplateId;
  brokerName: string;
  brokerCompany?: string | null;
  clientName: string;
  buildingTitle: string;
  shareUrl: string;
  customMessage?: string | null;
  transactionalBasis: InboxTransactionalBasis;
}): string {
  const brokerHeader = params.brokerCompany?.trim()
    ? `${params.brokerCompany.trim()} (${params.brokerName.trim()})`
    : `${params.brokerName.trim()} 중개인`;
  const basisNote = TRANSACTIONAL_BASIS_LABELS[params.transactionalBasis];
  const noteBlock = params.customMessage?.trim()
    ? `\n안내 메모: ${params.customMessage.trim()}`
    : '';

  const leadByTemplate: Record<InboxAlimtalkTemplateId, string> = {
    TPL_INBOX_IM_APPROVED: `요청하신 [${params.buildingTitle}] 상세 검토 자료(IM) 열람이 승인되어 전달드립니다.`,
    TPL_INBOX_INQUIRY_REPLY: `문의하신 [${params.buildingTitle}] 매물에 대한 담당 중개인의 검토 답변을 전달드립니다.`,
    TPL_INBOX_TOUR_CONFIRMED: `요청하신 [${params.buildingTitle}] 현장 임장·미팅 일정을 안내드립니다.`,
    TPL_INBOX_CORRECTION_NOTICE: `앞서 안내드린 [${params.buildingTitle}] 자료의 최신 업데이트 내역을 안내드립니다.`,
  };

  return [
    `[CRE Deal] ${brokerHeader} 안내`,
    `${params.clientName}님, 안녕하세요.`,
    leadByTemplate[params.templateId] + noteBlock,
    '',
    `▶ 자료 확인: ${params.shareUrl}`,
    `※ 본 알림은 ${basisNote}에 따른 1:1 정보성 안내입니다.`,
  ].join('\n');
}

export interface AlimtalkAccessEvaluation {
  allowed: boolean;
  code?: 'PLAN_UPGRADE_REQUIRED' | 'TRANSACTIONAL_BASIS_REQUIRED' | 'INVALID_PHONE';
  reason?: string;
}

export function evaluateInboxAlimtalkAccess(params: {
  tier: SubscriptionTier;
  isPaid?: boolean;
  transactionalBasis?: string | null;
  clientPhone?: string | null;
}): AlimtalkAccessEvaluation {
  const paid = Boolean(params.isPaid || params.tier === 'pro' || params.tier === 'premium');
  if (!paid) {
    return {
      allowed: false,
      code: 'PLAN_UPGRADE_REQUIRED',
      reason:
        'Pro 오픈 예정 · 이메일 발송 또는 카톡 인사말+링크 1초 복사 기능을 바로 이용하실 수 있습니다',
    };
  }

  const validBasis = normalizeTransactionalBasis(params.transactionalBasis);
  if (!validBasis) {
    return {
      allowed: false,
      code: 'TRANSACTIONAL_BASIS_REQUIRED',
      reason:
        '정보성 카카오 알림톡은 고객의 자료 요청·문의·임장 예약 등 거래 근거가 확인된 경우에만 발송할 수 있습니다.',
    };
  }

  const digits = String(params.clientPhone || '').replace(/[^0-9]/g, '');
  if (!/^01[0-9]{8,9}$/.test(digits)) {
    return {
      allowed: false,
      code: 'INVALID_PHONE',
      reason: '수신 가능한 휴대폰 번호(010 등 10~11자리)를 먼저 등록해 주세요.',
    };
  }

  return { allowed: true };
}

/**
 * WP-7.3E P1-6 (D4): inbox AlimTalk never goes live merely because SOLAPI credentials exist.
 * Live dispatch requires ALL of:
 *   - `INBOX_ALIMTALK_LIVE === '1'` (explicit operator switch, default off → dry-run)
 *   - SOLAPI credentials
 *   - recipient phone listed in `INBOX_ALIMTALK_ALLOWLIST` (comma-separated digits; `*` = everyone)
 * Otherwise the send is an honest `simulated` dry-run.
 */
export function resolveInboxAlimtalkLiveMode(recipientPhone: string): {
  live: boolean;
  reason: 'LIVE' | 'LIVE_FLAG_OFF' | 'MISSING_CREDENTIALS' | 'NOT_ALLOWLISTED';
} {
  const flagOn = String(process.env.INBOX_ALIMTALK_LIVE || '').trim() === '1';
  if (!flagOn) return { live: false, reason: 'LIVE_FLAG_OFF' };
  const hasCreds = Boolean(
    process.env.SOLAPI_API_KEY &&
      process.env.SOLAPI_API_SECRET &&
      (process.env.SOLAPI_SENDER_PHONE || process.env.SOLAPI_SENDER_NUMBER) &&
      process.env.SOLAPI_PFID
  );
  if (!hasCreds) return { live: false, reason: 'MISSING_CREDENTIALS' };
  const allowlist = new Set(
    String(process.env.INBOX_ALIMTALK_ALLOWLIST || '')
      .split(',')
      .map((s) => (s.trim() === '*' ? '*' : s.replace(/[^0-9]/g, '')))
      .filter(Boolean)
  );
  const digits = String(recipientPhone || '').replace(/[^0-9]/g, '');
  if (!allowlist.has('*') && !(digits && allowlist.has(digits))) {
    return { live: false, reason: 'NOT_ALLOWLISTED' };
  }
  return { live: true, reason: 'LIVE' };
}

export async function sendInboxTransactionalAlimtalk(input: {
  recipientPhone: string;
  templateId: InboxAlimtalkTemplateId;
  brokerName: string;
  brokerCompany?: string | null;
  clientName: string;
  buildingTitle: string;
  shareUrl: string;
  customMessage?: string | null;
  transactionalBasis: InboxTransactionalBasis;
}): Promise<{
  ok: boolean;
  simulated?: boolean;
  simulatedReason?: string;
  messageId?: string | null;
  templateId: InboxAlimtalkTemplateId;
  previewText: string;
  error?: string;
}> {
  const previewText = buildAlimtalkTemplateBody(input);
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const senderPhone = process.env.SOLAPI_SENDER_PHONE || process.env.SOLAPI_SENDER_NUMBER;
  const pfId = process.env.SOLAPI_PFID;
  const liveMode = resolveInboxAlimtalkLiveMode(input.recipientPhone);

  if (!liveMode.live || !apiKey || !apiSecret || !senderPhone || !pfId) {
    log.info('[Alimtalk STUB] Simulated transactional inbox Alimtalk', {
      to: maskPhone(input.recipientPhone),
      templateId: input.templateId,
      basis: input.transactionalBasis,
      reason: liveMode.reason,
    });
    return {
      ok: true,
      simulated: true,
      simulatedReason: liveMode.reason,
      messageId: `sim-ata-${Date.now()}`,
      templateId: input.templateId,
      previewText,
    };
  }

  try {
    const dateTime = new Date().toISOString();
    const salt = crypto.randomBytes(16).toString('hex');
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(dateTime + salt)
      .digest('hex');
    const authHeader = `HMAC-SHA256 apiKey=${apiKey}, date=${dateTime}, salt=${salt}, signature=${signature}`;

    const message = {
      to: input.recipientPhone.replace(/[^0-9]/g, ''),
      from: senderPhone.replace(/[^0-9]/g, ''),
      type: 'ATA',
      templateId: input.templateId,
      pfId,
      country: '82',
      disableSms: true,
      text: previewText,
      kakaoOptions: {
        pfId,
        templateId: input.templateId,
        disableSms: true,
        variables: {
          '#{brokerName}': input.brokerName,
          '#{brokerCompany}': input.brokerCompany || '전속 중개법인',
          '#{clientName}': input.clientName,
          '#{buildingTitle}': input.buildingTitle,
          '#{shareUrl}': input.shareUrl,
        },
      },
    };

    const res = await fetch('https://api.solapi.com/messages/v4/send-many', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ messages: [message] }),
    });

    if (!res.ok) {
      const errText = await res.text();
      log.error('Solapi inbox Alimtalk error', { status: res.status, errText });
      return {
        ok: false,
        templateId: input.templateId,
        previewText,
        error: `알림톡 발송 실패 (${res.status})`,
      };
    }

    const resJson = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      ok: true,
      simulated: false,
      messageId: String(resJson?.groupId || resJson?.messageId || `ata-${Date.now()}`),
      templateId: input.templateId,
      previewText,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Unexpected error sending inbox Alimtalk', { message });
    return {
      ok: false,
      templateId: input.templateId,
      previewText,
      error: message,
    };
  }
}
