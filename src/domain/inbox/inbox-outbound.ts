import crypto from 'node:crypto';
import { Resend } from 'resend';
import { createModuleLogger } from '@/lib/logger';
import type { SubscriptionTier } from '@/domain/subscription/tier-gate';

const log = createModuleLogger('inbox-outbound');

export type InboxTransactionalBasis =
  | 'im_request'
  | 'property_inquiry'
  | 'tour_booking'
  | 'broker_manual';

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

export function normalizeTransactionalBasis(raw?: string | null): InboxTransactionalBasis | null {
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
  const phoneLine = input.brokerPhone?.trim() ? `\n문의 연락처: ${input.brokerPhone.trim()}` : '';

  const subject = `[${brokerName} 중개인] ${buildingTitle} ${assetLabel} 전달드립니다`;
  const messageText = [
    `${clientName}님, 안녕하세요. ${brokerName} 중개인입니다.`,
    `요청·상담하신 [${buildingTitle}] ${assetLabel} 자료 링크를 보내드립니다.${headlineLine}`,
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

export interface SendInboxClientEmailInput {
  toEmail: string;
  brokerName: string;
  brokerCompany?: string | null;
  brokerPhone?: string | null;
  clientName: string;
  buildingTitle: string;
  shareUrl: string;
  headline?: string | null;
  assetKind?: 'im' | 'dealcard' | 'magazine';
}

export interface SendInboxClientEmailResult {
  ok: boolean;
  simulated?: boolean;
  messageId?: string | null;
  error?: string;
  subject: string;
  text: string;
}

export async function sendInboxClientEmail(
  input: SendInboxClientEmailInput
): Promise<SendInboxClientEmailResult> {
  const normalizedEmail = normalizeClientEmail(input.toEmail);
  const bundle = buildInboxCopyBundle({
    brokerName: input.brokerName,
    brokerPhone: input.brokerPhone,
    clientName: input.clientName,
    buildingTitle: input.buildingTitle,
    shareUrl: input.shareUrl,
    headline: input.headline,
    assetKind: input.assetKind,
  });

  if (!normalizedEmail) {
    return {
      ok: false,
      error: '수신 가능한 이메일 주소를 올바르게 입력해 주세요.',
      subject: bundle.subject,
      text: bundle.messageText,
    };
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    log.info('[Email STUB] Simulated transactional inbox email', {
      to: normalizedEmail,
      subject: bundle.subject,
    });
    return {
      ok: true,
      simulated: true,
      messageId: `sim-email-${Date.now()}`,
      subject: bundle.subject,
      text: bundle.messageText,
    };
  }

  const safeClient = escapeHtml((input.clientName || '고객').trim());
  const safeBroker = escapeHtml((input.brokerName || '담당 중개인').trim());
  const safeCompany = escapeHtml((input.brokerCompany || '전속 중개법인').trim());
  const safeTitle = escapeHtml((input.buildingTitle || '추천 매물').trim());
  const safeHeadline = input.headline?.trim() ? escapeHtml(input.headline.trim()) : '';
  const safePhone = input.brokerPhone?.trim() ? escapeHtml(input.brokerPhone.trim()) : '';
  const safeUrl = escapeHtml(input.shareUrl);

  const html = `<!doctype html>
<html lang="ko">
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Noto Sans KR',sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;">
    <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#2563eb;">${safeCompany} · ${safeBroker}</p>
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.45;color:#0f172a;">${safeClient}님, [${safeTitle}] 자료를 보내드립니다</h1>
    ${safeHeadline ? `<p style="margin:0 0 16px;padding:12px 14px;background:#f1f5f9;border-radius:10px;font-size:15px;line-height:1.6;color:#1e293b;">${safeHeadline}</p>` : ''}
    <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#334155;">아래 버튼을 누르시면 회원가입이나 별도 앱 설치 없이 모바일·PC에서 바로 확인하실 수 있습니다.</p>
    <div style="margin:0 0 24px;">
      <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:12px;font-size:16px;font-weight:700;">매물 자료 바로 보기 →</a>
    </div>
    <p style="margin:0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:#64748b;">
      발신: ${safeBroker} (${safeCompany})${safePhone ? ` · ${safePhone}` : ''}<br/>
      본 메일은 상담·자료 요청 고객님께 1:1로 전달된 매물 안내 메일입니다.
    </p>
  </div>
</body>
</html>`;

  try {
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from: formatInboxEmailFromHeader(input.brokerName, process.env.EMAIL_FROM),
      to: normalizedEmail,
      subject: bundle.subject,
      html,
      text: bundle.messageText,
    });
    if (error) {
      log.error('Resend inbox email error', { message: error.message });
      return {
        ok: false,
        error: error.message,
        subject: bundle.subject,
        text: bundle.messageText,
      };
    }
    return {
      ok: true,
      simulated: false,
      messageId: data?.id ?? null,
      subject: bundle.subject,
      text: bundle.messageText,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Unexpected error sending inbox email', { message });
    return {
      ok: false,
      error: message,
      subject: bundle.subject,
      text: bundle.messageText,
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
        '카카오 알림톡 원클릭 발송은 Pro 유료 플랜 기능입니다. 무료 플랜에서는 문구·링크 복사 및 이메일 발송을 제한 없이 사용하실 수 있습니다.',
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

  if (!apiKey || !apiSecret || !senderPhone || !pfId) {
    log.info('[Alimtalk STUB] Simulated transactional inbox Alimtalk', {
      to: input.recipientPhone,
      templateId: input.templateId,
      basis: input.transactionalBasis,
    });
    return {
      ok: true,
      simulated: true,
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

    const resJson = (await res.json().catch(() => ({}))) as Record<string, any>;
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
