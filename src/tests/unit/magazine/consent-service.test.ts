/**
 * consent-service 단위테스트 — 동의 기록·pending, COALESCE 병합, 해지자 자동 재활성화 금지, 중복 병합, 확인 토큰, 발송 게이트
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONFIRM_TOKEN_TTL_DAYS,
  buildConfirmUrl,
  canResubscribe,
  computeReconfirmDue,
  confirmOptIn,
  hashConfirmToken,
  isReconfirmNoticeDue,
  isSchemaMissingError,
  issueConfirmToken,
  mergeInterest,
  recordOptIn,
  sendOptInConfirmation,
} from '@/domain/magazine/consent-service';
import { validateSubscribeInput, type SubscribeRequest, type ValidatedSubscribeInput } from '@/domain/magazine/subscriber-consent-types';
import { FakeDb } from './consent-fake-db';

const NOW = new Date('2026-10-05T01:00:00.000Z');
const CONSENT_ALL = { privacy: true, marketing: true, age14: true } as const;

function input(over: Partial<SubscribeRequest> = {}): ValidatedSubscribeInput {
  const r = validateSubscribeInput({
    brokerId: 'kim-broker',
    phone: '010-1234-5678',
    channel: 'kakao',
    consent: { ...CONSENT_ALL },
    ...over,
  } as SubscribeRequest);
  if (!r.ok) throw new Error(`fixture invalid: ${r.code}`);
  return r.value;
}

const base = { brokerSlug: 'kim-broker', brokerUserId: '11111111-1111-4111-8111-111111111111', ipHash: 'iphash', now: NOW };

describe('recordOptIn — 신규 구독', () => {
  it('동의 컬럼을 기록하고 pending/hash 저장, 평문 토큰은 DB에 없다', async () => {
    const db = new FakeDb();
    const res = await recordOptIn(db, { ...base, input: input({ name: '홍길동', tags: ['성수·성동', '꼬마빌딩'], referrer: 'friend', source: 'qr_card' }) });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.outcome).toBe('created');
    expect(res.status).toBe('pending');
    expect(res.confirmToken).toBeTruthy();

    const row = db.tables.magazine_subscribers[0];
    expect(row).toMatchObject({
      broker_id: 'kim-broker',
      broker_user_id: base.brokerUserId,
      subscriber_phone: '01012345678',
      phone_e164: '+821012345678',
      subscriber_name: '홍길동',
      channel: 'kakao',
      source: 'qr_card',
      status: 'active',
      consent_version: 'v1',
      consent_channel: 'web_form',
      night_consent: false,
      age_confirmed: true,
      consent_ip_hash: 'iphash',
      confirm_status: 'pending',
    });
    expect(row.privacy_consent_at).toBe(NOW.toISOString());
    expect(row.marketing_consent_at).toBe(NOW.toISOString());
    expect(row.reconfirm_due_at).toBe('2028-10-05T01:00:00.000Z'); // 동의 + 2년
    expect(row.confirm_token_hash).toBe(hashConfirmToken(res.confirmToken!));
    expect(JSON.stringify(row)).not.toContain(res.confirmToken!);
    // tags/referrer/origin은 interest_profile에 저장 (T2-09a), DC-9 구조
    expect(row.interest_profile).toEqual({
      origin: 'qr_card',
      tags: { regions: ['성수·성동'], assetTypes: ['꼬마빌딩'] },
      referrer: 'friend',
    });
  });

  it('야간 동의(night)는 night_consent=true로 저장', async () => {
    const db = new FakeDb();
    await recordOptIn(db, { ...base, input: input({ consent: { ...CONSENT_ALL, night: true } }) });
    expect(db.tables.magazine_subscribers[0].night_consent).toBe(true);
  });

  it('source CHECK 미확장 DB(23514)에서는 magazine으로 저장하되 origin(qr_card)을 보존', async () => {
    const db = new FakeDb({ sourceCheck: ['manual', 'vibe_card', 'magazine', 'im'] });
    const res = await recordOptIn(db, { ...base, input: input({ source: 'qr_card' }) });
    expect(res.ok).toBe(true);
    const row = db.tables.magazine_subscribers[0];
    expect(row.source).toBe('magazine');
    expect((row.interest_profile as { origin: string }).origin).toBe('qr_card');
  });
});

describe('recordOptIn — 중복·병합 (T2-09b/e, D2-14)', () => {
  it('010-1234-5678 / 01012345678 / 레거시 하이픈 행 → 같은 행 하나', async () => {
    const db = new FakeDb();
    db.seed({ broker_id: 'kim-broker', subscriber_phone: '010-1234-5678', subscriber_email: null, confirm_status: 'pending' });
    const a = await recordOptIn(db, { ...base, input: input({ phone: '01012345678' }) });
    const b = await recordOptIn(db, { ...base, input: input({ phone: '+82 10-1234-5678' }) });
    expect(a.ok && b.ok).toBe(true);
    expect(db.tables.magazine_subscribers).toHaveLength(1);
    expect(db.tables.magazine_subscribers[0]).toMatchObject({ subscriber_phone: '01012345678', phone_e164: '+821012345678' });
  });

  it('이메일 전용 2회(대소문자 다름) → 1행', async () => {
    const db = new FakeDb();
    const i1 = input({ channel: 'email', phone: undefined, email: 'Kim@Example.com' });
    const i2 = input({ channel: 'email', phone: undefined, email: 'kim@example.COM' });
    expect(i1.email).toBe('kim@example.com');
    const a = await recordOptIn(db, { ...base, input: i1 });
    const b = await recordOptIn(db, { ...base, input: i2 });
    expect(a.ok && b.ok).toBe(true);
    expect(db.tables.magazine_subscribers).toHaveLength(1);
    expect(a.ok && a.outcome).toBe('created');
    expect(b.ok && b.outcome).toBe('updated');
  });

  it('COALESCE: 재구독 시 기존 name/email/interest를 null·빈 값으로 덮지 않는다', async () => {
    const db = new FakeDb();
    db.seed({
      broker_id: 'kim-broker',
      phone_e164: '+821012345678',
      subscriber_phone: '01012345678',
      subscriber_name: '기존이름',
      subscriber_email: 'old@example.com',
      confirm_status: 'pending',
      interest_profile: { score: 7, tags: { regions: ['강남·서초'], assetTypes: [] }, origin: 'magazine' },
    });
    const res = await recordOptIn(db, { ...base, input: input({ name: undefined, email: undefined, tags: ['꼬마빌딩'], source: 'qr_card' }) });
    expect(res.ok).toBe(true);
    const row = db.tables.magazine_subscribers[0];
    expect(row.subscriber_name).toBe('기존이름');
    expect(row.subscriber_email).toBe('old@example.com');
    expect(row.interest_profile).toEqual({
      score: 7,
      origin: 'magazine', // 최초 유입 출처 보존
      tags: { regions: ['강남·서초'], assetTypes: ['꼬마빌딩'] }, // 합집합 병합
    });
  });

  it('COALESCE: 새 값이 있으면 갱신', async () => {
    const db = new FakeDb();
    db.seed({ broker_id: 'kim-broker', phone_e164: '+821012345678', subscriber_phone: '01012345678', subscriber_name: '기존', subscriber_email: null, confirm_status: 'pending' });
    await recordOptIn(db, { ...base, input: input({ name: '새이름', channel: 'both', email: 'new@example.com' }) });
    const row = db.tables.magazine_subscribers[0];
    expect(row).toMatchObject({ subscriber_name: '새이름', subscriber_email: 'new@example.com', channel: 'both' });
  });

  it('전화·이메일이 서로 다른 행이면 이메일 unique 충돌을 피하려 이메일을 바꾸지 않는다', async () => {
    const db = new FakeDb();
    const p = db.seed({ broker_id: 'kim-broker', phone_e164: '+821012345678', subscriber_phone: '01012345678', subscriber_email: null, confirm_status: 'pending' });
    db.seed({ broker_id: 'kim-broker', subscriber_email: 'other@example.com', phone_e164: null, confirm_status: 'pending' });
    const res = await recordOptIn(db, { ...base, input: input({ channel: 'both', email: 'other@example.com' }) });
    expect(res.ok).toBe(true);
    expect(db.tables.magazine_subscribers.find((r) => r.id === p.id)?.subscriber_email).toBeNull();
    expect(db.tables.magazine_subscribers).toHaveLength(2);
  });

  it('동시 가입 경합(insert 23505) → 재조회 후 갱신 경로', async () => {
    const db = new FakeDb({
      raceRow: { broker_id: 'kim-broker', phone_e164: '+821012345678', subscriber_phone: '01012345678', confirm_status: 'pending' },
    });
    const res = await recordOptIn(db, { ...base, input: input() });
    expect(res.ok).toBe(true);
    expect(db.tables.magazine_subscribers).toHaveLength(1);
    expect(res.ok && res.outcome).toBe('updated');
  });
});

describe('recordOptIn — 해지자는 자동 재활성화되지 않는다 (§50, S2-07)', () => {
  it('unsubscribed 행: status/unsubscribed_at 유지, 새 동의·pending·새 토큰만 기록', async () => {
    const db = new FakeDb();
    const unsubAt = '2026-09-01T00:00:00.000Z';
    db.seed({
      broker_id: 'kim-broker',
      phone_e164: '+821012345678',
      subscriber_phone: '01012345678',
      status: 'unsubscribed',
      unsubscribed_at: unsubAt,
      confirm_status: 'confirmed',
      confirm_token_hash: null,
    });
    const res = await recordOptIn(db, { ...base, input: input() });
    expect(res.ok && res.outcome).toBe('resubscribe_pending');
    const row = db.tables.magazine_subscribers[0];
    expect(row.status).toBe('unsubscribed'); // 자동 재활성화 금지
    expect(row.unsubscribed_at).toBe(unsubAt);
    expect(row.confirm_status).toBe('pending'); // 발송 대상 아님
    expect(row.confirm_token_hash).toBeTruthy();
    expect(row.marketing_consent_at).toBe(NOW.toISOString());
  });

  it('이미 확인된 활성 구독자의 재신청은 아무것도 바꾸지 않는다(제3자 덮어쓰기 방지)', async () => {
    const db = new FakeDb();
    db.seed({
      broker_id: 'kim-broker',
      phone_e164: '+821012345678',
      subscriber_phone: '01012345678',
      subscriber_name: '본인',
      status: 'active',
      confirm_status: 'confirmed',
      marketing_consent_at: '2026-01-01T00:00:00.000Z',
    });
    const before = JSON.stringify(db.tables.magazine_subscribers[0]);
    const res = await recordOptIn(db, { ...base, input: input({ name: '공격자', channel: 'both', email: 'evil@example.com' }) });
    expect(res.ok && res.outcome).toBe('already_confirmed');
    expect(res.ok && res.confirmToken).toBeNull();
    expect(res.ok && res.status).toBe('pending'); // 존재 여부 비노출: 신규와 같은 응답 상태
    expect(JSON.stringify(db.tables.magazine_subscribers[0])).toBe(before);
    expect(db.calls.some((c) => c.op === 'update' || c.op === 'insert')).toBe(false);
  });
});

describe('recordOptIn — 정직한 실패(가짜 성공 금지)', () => {
  it('42703(컬럼 미적용) → UNAVAILABLE, 행 생성 없음', async () => {
    const db = new FakeDb({ failOn: { select: { code: '42703', message: 'column magazine_subscribers.phone_e164 does not exist' } } });
    const res = await recordOptIn(db, { ...base, input: input() });
    expect(res).toEqual({ ok: false, code: 'UNAVAILABLE' });
    expect(db.tables.magazine_subscribers).toHaveLength(0);
  });

  it('insert 단계 PGRST204도 UNAVAILABLE', async () => {
    const db = new FakeDb({ failOn: { insert: { code: 'PGRST204', message: "Could not find the 'privacy_consent_at' column" } } });
    const res = await recordOptIn(db, { ...base, input: input() });
    expect(res).toEqual({ ok: false, code: 'UNAVAILABLE' });
  });

  it('그 외 DB 오류는 DB_ERROR', async () => {
    const db = new FakeDb({ failOn: { select: { code: '57014', message: 'timeout' } } });
    expect((await recordOptIn(db, { ...base, input: input() })).ok).toBe(false);
  });

  it('isSchemaMissingError 분류', () => {
    expect(isSchemaMissingError({ code: '42P01' })).toBe(true);
    expect(isSchemaMissingError({ message: 'column x does not exist' })).toBe(true);
    expect(isSchemaMissingError({ code: '23505' })).toBe(false);
    expect(isSchemaMissingError(null)).toBe(false);
  });
});

describe('confirmOptIn — 해시 비교·만료·1회용', () => {
  async function pendingRow(db: FakeDb, over: Record<string, unknown> = {}) {
    const res = await recordOptIn(db, { ...base, input: input() });
    if (!res.ok || !res.confirmToken) throw new Error('fixture');
    Object.assign(db.tables.magazine_subscribers[0], over);
    return res.confirmToken;
  }

  it('올바른 토큰 → confirmed (reactivated:false, alreadyConfirmed:false)', async () => {
    const db = new FakeDb();
    const token = await pendingRow(db);
    const r = await confirmOptIn(db, { token, brokerSlug: 'kim-broker', now: new Date(NOW.getTime() + 3600_000) });
    expect(r).toMatchObject({ ok: true, reactivated: false, alreadyConfirmed: false });
    expect(db.tables.magazine_subscribers[0].confirm_status).toBe('confirmed');
  });

  it('멱등: 같은 토큰 재요청은 상태 변경 없이 ok(alreadyConfirmed:true)', async () => {
    const db = new FakeDb();
    const token = await pendingRow(db);
    const t1 = new Date(NOW.getTime() + 3600_000);
    await confirmOptIn(db, { token, brokerSlug: 'kim-broker', now: t1 });
    const before = JSON.stringify(db.tables.magazine_subscribers[0]);
    const again = await confirmOptIn(db, { token, brokerSlug: 'kim-broker', now: new Date(t1.getTime() + 60_000) });
    expect(again).toMatchObject({ ok: true, reactivated: false, alreadyConfirmed: true });
    expect(JSON.stringify(db.tables.magazine_subscribers[0])).toBe(before);
  });

  it('확인 후 해지한 구독자가 오래된 링크를 재사용해도 재활성화되지 않는다(INVALID)', async () => {
    const db = new FakeDb();
    const token = await pendingRow(db);
    await confirmOptIn(db, { token, brokerSlug: 'kim-broker', now: new Date(NOW.getTime() + 3600_000) });
    Object.assign(db.tables.magazine_subscribers[0], { status: 'unsubscribed', unsubscribed_at: '2026-10-06T00:00:00.000Z' });
    const r = await confirmOptIn(db, { token, brokerSlug: 'kim-broker', now: new Date(NOW.getTime() + 7200_000) });
    expect(r).toEqual({ ok: false, reason: 'INVALID' });
    expect(db.tables.magazine_subscribers[0]).toMatchObject({ status: 'unsubscribed' });
  });

  it('재신청(recordOptIn)이 새 토큰으로 교체하면 이전 링크는 무효', async () => {
    const db = new FakeDb();
    const oldToken = await pendingRow(db);
    const res2 = await recordOptIn(db, { ...base, input: input() });
    expect(res2.ok && res2.confirmToken).toBeTruthy();
    expect(await confirmOptIn(db, { token: oldToken, brokerSlug: 'kim-broker', now: NOW })).toEqual({ ok: false, reason: 'INVALID' });
  });


  it('틀린 토큰/다른 broker/형식 오류 → INVALID', async () => {
    const db = new FakeDb();
    const token = await pendingRow(db);
    const wrong = issueConfirmToken().token;
    expect(await confirmOptIn(db, { token: wrong, brokerSlug: 'kim-broker', now: NOW })).toEqual({ ok: false, reason: 'INVALID' });
    expect(await confirmOptIn(db, { token, brokerSlug: 'other-broker', now: NOW })).toEqual({ ok: false, reason: 'INVALID' });
    expect(await confirmOptIn(db, { token: 'short', brokerSlug: 'kim-broker', now: NOW })).toEqual({ ok: false, reason: 'INVALID' });
    expect(await confirmOptIn(db, { token: null, brokerSlug: 'kim-broker', now: NOW })).toEqual({ ok: false, reason: 'INVALID' });
    expect(db.tables.magazine_subscribers[0].confirm_status).toBe('pending');
  });

  it(`${CONFIRM_TOKEN_TTL_DAYS}일 경과 → EXPIRED, 상태 불변`, async () => {
    const db = new FakeDb();
    const token = await pendingRow(db);
    const late = new Date(NOW.getTime() + (CONFIRM_TOKEN_TTL_DAYS * 24 + 1) * 3600_000);
    expect(await confirmOptIn(db, { token, brokerSlug: 'kim-broker', now: late })).toEqual({ ok: false, reason: 'EXPIRED' });
    expect(db.tables.magazine_subscribers[0].confirm_status).toBe('pending');
  });

  it('해지 이력 구독자는 확인 링크를 열었을 때에만 active로 복귀', async () => {
    const db = new FakeDb();
    const token = await pendingRow(db, { status: 'unsubscribed', unsubscribed_at: '2026-09-01T00:00:00.000Z' });
    expect(db.tables.magazine_subscribers[0].status).toBe('unsubscribed');
    const r = await confirmOptIn(db, { token, brokerSlug: 'kim-broker', now: NOW });
    expect(r).toMatchObject({ ok: true, reactivated: true });
    const row = db.tables.magazine_subscribers[0];
    expect(row).toMatchObject({ status: 'active', unsubscribed_at: null, confirm_status: 'confirmed' });
  });

  it('컬럼 미적용이면 UNAVAILABLE', async () => {
    const db = new FakeDb({ failOn: { select: { code: '42703', message: 'column does not exist' } } });
    expect(await confirmOptIn(db, { token: issueConfirmToken().token, brokerSlug: 'kim-broker' })).toEqual({ ok: false, reason: 'UNAVAILABLE' });
  });
});

describe('canResubscribe / 날짜 / 토큰 / 병합 유틸', () => {
  it('canResubscribe: 해지 이력은 본인 확인 후에만', () => {
    expect(canResubscribe({ status: 'active', unsubscribed_at: null })).toBe(true);
    expect(canResubscribe({ status: 'unsubscribed', unsubscribed_at: '2026-01-01T00:00:00Z' })).toBe(false);
    expect(canResubscribe({ status: 'unsubscribed', unsubscribed_at: '2026-01-01T00:00:00Z' }, { confirmed: false })).toBe(false);
    expect(canResubscribe({ status: 'unsubscribed', unsubscribed_at: '2026-01-01T00:00:00Z' }, { confirmed: true })).toBe(true);
    expect(canResubscribe({ status: 'active', unsubscribed_at: '2026-01-01T00:00:00Z' })).toBe(false);
    expect(canResubscribe({ status: 'purged' }, { confirmed: true })).toBe(false);
  });

  it('computeReconfirmDue: +2년, 윤일 보정', () => {
    expect(computeReconfirmDue(new Date('2026-10-05T01:00:00Z')).toISOString()).toBe('2028-10-05T01:00:00.000Z');
    expect(computeReconfirmDue(new Date('2024-02-29T00:00:00Z')).toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(() => computeReconfirmDue('not-a-date')).toThrow();
  });

  it('isReconfirmNoticeDue: 도래 30일 전부터 true', () => {
    const due = '2028-10-05T00:00:00.000Z';
    expect(isReconfirmNoticeDue({ reconfirm_due_at: due }, new Date('2028-09-04T00:00:00Z'))).toBe(false);
    expect(isReconfirmNoticeDue({ reconfirm_due_at: due }, new Date('2028-09-06T00:00:00Z'))).toBe(true);
    expect(isReconfirmNoticeDue({ reconfirm_due_at: null })).toBe(false);
  });

  it('issueConfirmToken: 매번 다르고 해시와 일치, 해시만으로 토큰 복원 불가(길이 다름)', () => {
    const a = issueConfirmToken();
    const b = issueConfirmToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashConfirmToken(a.token));
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('mergeInterest: 빈 값으로 덮지 않고 배열은 합집합', () => {
    expect(mergeInterest({ a: [1], b: 'x' }, { a: [2], b: '', c: null })).toEqual({ a: [1, 2], b: 'x' });
    expect(mergeInterest({ a: 1 }, null)).toEqual({ a: 1 });
  });

  it('buildConfirmUrl: 절대 https, 토큰/브로커 인코딩, localhost 거부', () => {
    const u = buildConfirmUrl('tok_en-1', 'kim-broker', 'https://credeal.net');
    expect(u).toBe('https://credeal.net/api/public/magazine/confirm?t=tok_en-1&b=kim-broker');
    expect(() => buildConfirmUrl('t', 'b', 'http://localhost:3000')).toThrow();
  });
});

describe('sendOptInConfirmation — 발송 게이트', () => {
  const sendEmail = vi.fn(async () => ({ ok: true }));
  const params = {
    channel: 'email' as const,
    email: 'kim@example.com',
    brokerSlug: 'kim-broker',
    brokerName: '김중개',
    token: issueConfirmToken().token,
  };

  beforeEach(() => {
    sendEmail.mockClear();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://credeal.net');
    vi.stubEnv('MAGAZINE_SEND_ENABLED', '');
    vi.stubEnv('MAGAZINE_SEND_DRY_RUN', '');
    vi.stubEnv('MAGAZINE_SEND_ALLOWLIST', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('기본값(발송 꺼짐) → 보내지 않고 SEND_DISABLED', async () => {
    expect(await sendOptInConfirmation(params, { sendEmail })).toEqual({ sent: false, reason: 'SEND_DISABLED' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('활성이어도 dry-run(기본)이면 DRY_RUN, 미발송', async () => {
    vi.stubEnv('MAGAZINE_SEND_ENABLED', 'true');
    expect(await sendOptInConfirmation(params, { sendEmail })).toEqual({ sent: false, reason: 'DRY_RUN' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('활성 + dry-run 해제 → 확인 링크가 담긴 메일 1회 발송, (광고) 접두 없음', async () => {
    vi.stubEnv('MAGAZINE_SEND_ENABLED', 'true');
    vi.stubEnv('MAGAZINE_SEND_DRY_RUN', 'false');
    const r = await sendOptInConfirmation(params, { sendEmail });
    expect(r).toEqual({ sent: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const msg = (sendEmail.mock.calls[0] as unknown as [{ to: string; subject: string; html: string; text: string }])[0];
    expect(msg.to).toBe('kim@example.com');
    expect(msg.text).toContain(`https://credeal.net/api/public/magazine/confirm?t=${params.token}&b=kim-broker`);
    expect(msg.subject.startsWith('(광고)')).toBe(false);
    expect(msg.subject).toContain('김중개');
  });

  it('allowlist(canary) 밖 수신자 → NOT_ALLOWLISTED', async () => {
    vi.stubEnv('MAGAZINE_SEND_ENABLED', 'true');
    vi.stubEnv('MAGAZINE_SEND_DRY_RUN', 'false');
    vi.stubEnv('MAGAZINE_SEND_ALLOWLIST', 'other@example.com');
    expect(await sendOptInConfirmation(params, { sendEmail })).toEqual({ sent: false, reason: 'NOT_ALLOWLISTED' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('카카오 전용은 CHANNEL_NOT_AVAILABLE, localhost 기준 URL은 INVALID_URL, provider 키 없음은 NO_PROVIDER', async () => {
    vi.stubEnv('MAGAZINE_SEND_ENABLED', 'true');
    vi.stubEnv('MAGAZINE_SEND_DRY_RUN', 'false');
    expect(await sendOptInConfirmation({ ...params, channel: 'kakao' }, { sendEmail })).toEqual({ sent: false, reason: 'CHANNEL_NOT_AVAILABLE' });
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    expect(await sendOptInConfirmation(params, { sendEmail })).toEqual({ sent: false, reason: 'INVALID_URL' });
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://credeal.net');
    const noProvider = vi.fn(async () => ({ ok: false, noProvider: true }));
    expect(await sendOptInConfirmation(params, { sendEmail: noProvider })).toEqual({ sent: false, reason: 'NO_PROVIDER' });
  });

  it('발송 실패/예외는 sent:false FAILED (성공 위장 금지)', async () => {
    vi.stubEnv('MAGAZINE_SEND_ENABLED', 'true');
    vi.stubEnv('MAGAZINE_SEND_DRY_RUN', 'false');
    expect(await sendOptInConfirmation(params, { sendEmail: vi.fn(async () => ({ ok: false })) })).toEqual({ sent: false, reason: 'FAILED' });
    expect(await sendOptInConfirmation(params, { sendEmail: vi.fn(async () => { throw new Error('boom'); }) })).toEqual({ sent: false, reason: 'FAILED' });
  });
});
