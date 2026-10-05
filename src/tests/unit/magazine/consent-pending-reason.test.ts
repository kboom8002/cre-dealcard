/**
 * pendingReason('NO_EMAIL_CONFIRM_CHANNEL') — 이메일 확인 채널이 없는 구독자(카카오 전용/이메일 없음)는
 * pending으로 남고(발송 게이트가 차단) 사유가 정직하게 노출된다. 알림톡 확인 템플릿은 이번에 구현하지 않는다.
 */
import { describe, expect, it } from 'vitest';
import {
  derivePendingReason,
  pendingReasonForInput,
  recordOptIn,
  sendOptInConfirmation,
  issueConfirmToken,
} from '@/domain/magazine/consent-service';
import { validateSubscribeInput, type SubscribeRequest, type ValidatedSubscribeInput } from '@/domain/magazine/subscriber-consent-types';
import { FakeDb } from './consent-fake-db';

const NOW = new Date('2026-10-05T01:00:00.000Z');
const base = { brokerSlug: 'kim-broker', brokerUserId: '11111111-1111-4111-8111-111111111111', ipHash: 'iphash', now: NOW };

function input(over: Partial<SubscribeRequest> = {}): ValidatedSubscribeInput {
  const r = validateSubscribeInput({
    brokerId: 'kim-broker',
    phone: '010-1234-5678',
    channel: 'kakao',
    consent: { privacy: true, marketing: true, age14: true },
    ...over,
  } as SubscribeRequest);
  if (!r.ok) throw new Error(`fixture invalid: ${r.code}`);
  return r.value;
}

describe('pendingReasonForInput / derivePendingReason', () => {
  it('이메일 없음 또는 카카오 전용 → NO_EMAIL_CONFIRM_CHANNEL', () => {
    expect(pendingReasonForInput({ email: null, channel: 'kakao' })).toBe('NO_EMAIL_CONFIRM_CHANNEL');
    expect(pendingReasonForInput({ email: 'a@example.com', channel: 'kakao' })).toBe('NO_EMAIL_CONFIRM_CHANNEL');
    expect(pendingReasonForInput({ email: 'a@example.com', channel: 'email' })).toBeNull();
    expect(pendingReasonForInput({ email: 'a@example.com', channel: 'both' })).toBeNull();
  });

  it('저장된 행 기준: confirmed는 null, pending은 확인 채널 유무로 판단', () => {
    expect(derivePendingReason({ confirm_status: 'confirmed', subscriber_email: null, channel: 'kakao' })).toBeNull();
    expect(derivePendingReason({ confirm_status: 'pending', subscriber_email: null, channel: 'kakao' })).toBe('NO_EMAIL_CONFIRM_CHANNEL');
    expect(derivePendingReason({ confirm_status: 'pending', subscriber_email: 'a@example.com', channel: 'both' })).toBeNull();
    expect(derivePendingReason({ confirm_status: 'pending', subscriber_email: 'a@example.com', channel: 'kakao' })).toBe('NO_EMAIL_CONFIRM_CHANNEL');
    expect(derivePendingReason({})).toBeNull();
  });
});

describe('recordOptIn — pendingReason', () => {
  it('카카오 전용 신규: pending 저장 + pendingReason 반환(확인 메시지 불가)', async () => {
    const db = new FakeDb();
    const res = await recordOptIn(db, { ...base, input: input() });
    expect(res.ok && res.pendingReason).toBe('NO_EMAIL_CONFIRM_CHANNEL');
    expect(db.tables.magazine_subscribers[0]).toMatchObject({ confirm_status: 'pending', channel: 'kakao' });
  });

  it('이메일 채널 신규: pendingReason null', async () => {
    const db = new FakeDb();
    const res = await recordOptIn(db, { ...base, input: input({ channel: 'email', phone: undefined, email: 'a@example.com' }) });
    expect(res.ok && res.pendingReason).toBeNull();
  });

  it('이미 확인된 구독자 재신청: pendingReason null(존재 여부 비노출)', async () => {
    const db = new FakeDb();
    db.seed({
      broker_id: 'kim-broker',
      phone_e164: '+821012345678',
      subscriber_phone: '01012345678',
      status: 'active',
      confirm_status: 'confirmed',
    });
    const res = await recordOptIn(db, { ...base, input: input() });
    expect(res.ok && res.outcome).toBe('already_confirmed');
    expect(res.ok && res.pendingReason).toBeNull();
  });
});

describe('sendOptInConfirmation — 이메일 없는 카카오 전용은 실제로 보내지 않는다', () => {
  it('SEND 활성이어도 CHANNEL_NOT_AVAILABLE (거짓 발송 없음)', async () => {
    const prev = { en: process.env.MAGAZINE_SEND_ENABLED, dry: process.env.MAGAZINE_SEND_DRY_RUN };
    process.env.MAGAZINE_SEND_ENABLED = 'true';
    process.env.MAGAZINE_SEND_DRY_RUN = 'false';
    try {
      let called = 0;
      const r = await sendOptInConfirmation(
        { channel: 'kakao', email: null, brokerSlug: 'kim-broker', token: issueConfirmToken().token },
        { sendEmail: async () => { called++; return { ok: true }; } },
      );
      expect(r).toEqual({ sent: false, reason: 'CHANNEL_NOT_AVAILABLE' });
      expect(called).toBe(0);
    } finally {
      if (prev.en === undefined) delete process.env.MAGAZINE_SEND_ENABLED; else process.env.MAGAZINE_SEND_ENABLED = prev.en;
      if (prev.dry === undefined) delete process.env.MAGAZINE_SEND_DRY_RUN; else process.env.MAGAZINE_SEND_DRY_RUN = prev.dry;
    }
  });
});
