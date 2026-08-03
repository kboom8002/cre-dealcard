/**
 * message-adapter.ts — 표준 메시지 발송 어댑터
 * Spec: DISTRIBUTION_AND_IDENTITY.md §10
 * 
 * 기존 Solapi 알림톡 서비스를 MessageAdapter 인터페이스로 래핑합니다.
 * 채널 폴백, idempotencyKey 중복 방지, E.164 검증 포함.
 */

import { sendKakaoAlimtalk } from './notification-service';

export interface MessageAdapter {
  send(msg: {
    to: string;                       // E.164 format
    channel: 'alimtalk' | 'lms' | 'email';
    templateId?: string;              // Required for alimtalk
    vars: Record<string, string>;
    idempotencyKey: string;
  }): Promise<{ receiptId: string }>;
}

// 중복 발송 방지 캐시 (인메모리 — 프로덕션에서는 Redis 권장)
const sentKeys = new Set<string>();
const MAX_CACHE_SIZE = 10000;

/**
 * Solapi 기반 MessageAdapter 구현체
 */
export class SolapiMessageAdapter implements MessageAdapter {
  async send(msg: {
    to: string;
    channel: 'alimtalk' | 'lms' | 'email';
    templateId?: string;
    vars: Record<string, string>;
    idempotencyKey: string;
  }): Promise<{ receiptId: string }> {
    // 1. Idempotency check
    if (sentKeys.has(msg.idempotencyKey)) {
      return { receiptId: `dup-${msg.idempotencyKey}` };
    }

    // 2. E.164 validation
    if (!isValidE164(msg.to)) {
      throw new Error(`Invalid E.164 phone number: ${msg.to}`);
    }

    // 3. Channel-specific sending
    let success = false;
    let receiptId = '';

    switch (msg.channel) {
      case 'alimtalk': {
        if (!msg.templateId) throw new Error('templateId required for alimtalk');
        success = await sendKakaoAlimtalk({
          recipientPhone: msg.to,
          templateId: msg.templateId,
          variables: msg.vars,
        });
        receiptId = `ata-${Date.now()}`;

        // 알림톡 실패 시 LMS 폴백
        if (!success) {
          console.log('[MessageAdapter] Alimtalk failed, falling back to LMS');
          success = await this.sendLms(msg.to, msg.vars);
          receiptId = `lms-fallback-${Date.now()}`;
        }
        break;
      }
      case 'lms': {
        success = await this.sendLms(msg.to, msg.vars);
        receiptId = `lms-${Date.now()}`;
        break;
      }
      case 'email': {
        // Email sending stub — 향후 구현
        console.log(`[MessageAdapter STUB] Email to ${msg.to}:`, msg.vars);
        success = true;
        receiptId = `email-${Date.now()}`;
        break;
      }
    }

    if (!success) {
      throw new Error(`Failed to send ${msg.channel} message`);
    }

    // 4. Record idempotency key
    if (sentKeys.size >= MAX_CACHE_SIZE) sentKeys.clear();
    sentKeys.add(msg.idempotencyKey);

    return { receiptId };
  }

  private async sendLms(to: string, vars: Record<string, string>): Promise<boolean> {
    // LMS 전송은 알림톡과 동일 Solapi API, type만 다름
    return sendKakaoAlimtalk({
      recipientPhone: to,
      templateId: '',  // LMS는 templateId 불필요
      variables: vars,
      fallbackSms: Object.values(vars).join(' '),
    });
  }
}

function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

/** Singleton 인스턴스 */
export const messageAdapter: MessageAdapter = new SolapiMessageAdapter();
