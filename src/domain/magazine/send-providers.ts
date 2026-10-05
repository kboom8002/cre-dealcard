/**
 * @module send-providers
 * @description 매거진 발송 provider 어댑터 (P0-04 / G-03).
 *
 * - 공유 `email-service.sendMagazineEmail` 은 (1) 키가 없으면 STUB이 `true`를 반환하고
 *   (2) 자체 템플릿을 다시 렌더해서 sendGate가 검증한 본문·List-Unsubscribe 헤더를 실을 수 없다.
 *   → 이메일은 Resend SDK를 직접 호출한다(공유 파일은 수정하지 않는다).
 * - 알림톡은 기존 `sendKakaoAlimtalk`을 그대로 쓰되, **키 존재를 호출 전에 검사**한다(STUB true 방지).
 *
 * 이 모듈의 함수는 sendGate 안에서만 호출한다. 키가 없으면 호출하지 말고 `NO_PROVIDER`로 차단할 것.
 */
import { Resend } from 'resend';
import { sendKakaoAlimtalk } from '@/lib/notification/notification-service';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('magazine-send-providers');

/** 이메일 provider(Resend) 키 존재 여부. 런타임 조회. */
export function hasEmailProvider(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/**
 * 알림톡 provider(Solapi) 키 존재 여부.
 * notification-service는 API 키/시크릿만 있으면 발송을 시도하므로, 발신번호·pfId까지 모두 요구한다.
 */
export function hasKakaoProvider(): boolean {
  return !!(
    process.env.SOLAPI_API_KEY &&
    process.env.SOLAPI_API_SECRET &&
    process.env.SOLAPI_SENDER_PHONE &&
    process.env.SOLAPI_PFID
  );
}

export interface EmailSendInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}

export interface ProviderResult {
  ok: boolean;
  messageId?: string | null;
  error?: string;
}

export async function sendEmailProvider(input: EmailSendInput): Promise<ProviderResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'NO_PROVIDER: RESEND_API_KEY missing' };
  try {
    const resend = new Resend(key);
    const from = process.env.EMAIL_FROM || 'CRE Magazine <magazine@credeal.net>';
    const { data, error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(input.headers ? { headers: input.headers } : {}),
    });
    if (error) {
      log.error('Resend error sending magazine email', { message: error.message });
      return { ok: false, error: error.message };
    }
    return { ok: true, messageId: data?.id ?? null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error('Unexpected error sending magazine email', { message });
    return { ok: false, error: message };
  }
}

export interface KakaoSendInput {
  phone: string;
  templateId: string;
  variables: Record<string, string>;
  /** 템플릿 매핑이 없는 templateId는 notification-service가 이 문구를 본문으로 쓴다 */
  text: string;
}

export async function sendKakaoProvider(input: KakaoSendInput): Promise<ProviderResult> {
  if (!hasKakaoProvider()) return { ok: false, error: 'NO_PROVIDER: SOLAPI keys missing' };
  try {
    const ok = await sendKakaoAlimtalk({
      recipientPhone: input.phone,
      templateId: input.templateId,
      variables: input.variables,
      fallbackSms: input.text,
    });
    return ok ? { ok: true, messageId: null } : { ok: false, error: 'SOLAPI send returned false' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
