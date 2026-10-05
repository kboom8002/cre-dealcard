import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FakeDb, consentedSubscriber, DAYTIME, NIGHT, SUB_ID, SUB_ID_2, BROKER_USER_ID } from './send-fake-db';

const providers = vi.hoisted(() => ({
  hasEmailProvider: vi.fn(() => true),
  hasKakaoProvider: vi.fn(() => true),
  sendEmailProvider: vi.fn(async () => ({ ok: true, messageId: 'msg-email-1' } as { ok: boolean; messageId?: string; error?: string })),
  sendKakaoProvider: vi.fn(async () => ({ ok: true, messageId: null } as { ok: boolean; messageId?: string | null; error?: string })),
}));
vi.mock('@/domain/magazine/send-providers', () => providers);

import { sendGate, checkFlashWeeklyCap, normalizeRecipient, type GateInput } from '@/domain/magazine/send-gate';

const ENV_KEYS = ['MAGAZINE_SEND_ENABLED', 'MAGAZINE_SEND_DRY_RUN', 'MAGAZINE_SEND_ALLOWLIST', 'MAGAZINE_DAILY_CAP'];

function emailInput(over: Partial<GateInput> = {}): GateInput {
  return {
    subscriber: consentedSubscriber() as GateInput['subscriber'],
    channel: 'email',
    editionId: 'ed-1',
    editionKey: 'kim-broker:2026-10-06:weekly',
    brokerId: 'kim-broker',
    brokerUserId: BROKER_USER_ID,
    kind: 'weekly',
    rendered: {
      subject: '(광고) 주간 매거진',
      body: '<html>본문</html>',
      text: '본문',
      headers: { 'List-Unsubscribe': '<https://x.test/u?t=1>' },
      hasUnsubscribeLink: true,
      hasAdLabel: true,
      senderName: '김중개',
      senderContact: '010-0000-1111',
    },
    ...over,
  };
}

function kakaoInput(over: Partial<GateInput> = {}): GateInput {
  return emailInput({
    channel: 'kakao',
    rendered: {
      body: '(광고) [김중개] 주간 매거진 발행\n수신거부: https://x.test/u?t=1',
      hasUnsubscribeLink: true,
      hasAdLabel: true,
      senderName: '김중개',
      senderContact: '010-0000-1111',
      kakao: { templateId: 'TPL_MAGAZINE_WEEKLY_ISSUE', variables: {} },
    },
    ...over,
  });
}

let db: FakeDb;
const deps = () => ({ supabase: db as never, now: DAYTIME });

beforeEach(() => {
  vi.clearAllMocks();
  providers.hasEmailProvider.mockReturnValue(true);
  providers.hasKakaoProvider.mockReturnValue(true);
  providers.sendEmailProvider.mockResolvedValue({ ok: true, messageId: 'msg-email-1' });
  providers.sendKakaoProvider.mockResolvedValue({ ok: true, messageId: null });
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.MAGAZINE_SEND_ENABLED = 'true';
  db = new FakeDb();
  db.clock = DAYTIME;
});
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe('sendGate — 차단 사유', () => {
  it('SEND_DISABLED: 플래그 미설정이면 원장·provider 모두 미접촉', async () => {
    delete process.env.MAGAZINE_SEND_ENABLED;
    const r = await sendGate(emailInput(), { ...deps(), dryRun: false });
    expect(r).toEqual({ ok: false, blocked: 'SEND_DISABLED' });
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
    expect(db.fromCalls).toHaveLength(0);
  });

  it('NOT_ALLOWLISTED: allowlist가 있으면 목록 밖 수신자 차단, 목록 안(정규화 비교)은 통과', async () => {
    process.env.MAGAZINE_SEND_ALLOWLIST = 'canary@example.com, 010-9999-0000';
    const blocked = await sendGate(emailInput(), { ...deps(), dryRun: true });
    expect(blocked).toMatchObject({ ok: false, blocked: 'NOT_ALLOWLISTED' });

    const allowedEmail = await sendGate(
      emailInput({ subscriber: consentedSubscriber({ subscriber_email: 'Canary@Example.com' }) as GateInput['subscriber'] }),
      { ...deps(), dryRun: true },
    );
    expect(allowedEmail).toMatchObject({ ok: true, dryRun: true });

    const allowedPhone = await sendGate(
      kakaoInput({ subscriber: consentedSubscriber({ subscriber_phone: '+82 10-9999-0000' }) as GateInput['subscriber'] }),
      { ...deps(), dryRun: true },
    );
    expect(allowedPhone).toMatchObject({ ok: true });
    expect(normalizeRecipient('+82 10-9999-0000')).toBe('01099990000');
  });

  it('UNSUBSCRIBED: status unsubscribed 또는 unsubscribed_at', async () => {
    const a = await sendGate(emailInput({ subscriber: consentedSubscriber({ status: 'unsubscribed' }) as GateInput['subscriber'] }), deps());
    expect(a).toMatchObject({ ok: false, blocked: 'UNSUBSCRIBED' });
    const b = await sendGate(
      emailInput({ subscriber: consentedSubscriber({ unsubscribed_at: '2026-09-30T00:00:00Z' }) as GateInput['subscriber'] }),
      deps(),
    );
    expect(b).toMatchObject({ ok: false, blocked: 'UNSUBSCRIBED' });
  });

  it('NO_CONSENT: marketing_consent_at 없음(기존 구독자) — PENDING_CONFIRM보다 먼저 판정, 차단 행이 원장에 남는다', async () => {
    const r = await sendGate(
      emailInput({
        subscriber: consentedSubscriber({ marketing_consent_at: null, confirm_status: 'pending' }) as GateInput['subscriber'],
      }),
      deps(),
    );
    expect(r).toMatchObject({ ok: false, blocked: 'NO_CONSENT' });
    const ledger = db.rows('magazine_dispatch_logs');
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ status: 'blocked', blocked_reason: 'NO_CONSENT', channel: 'email' });
    // 수신자 평문은 원장에 저장하지 않는다(해시만)
    expect(JSON.stringify(ledger[0])).not.toContain('hong@example.com');
  });

  it('PENDING_CONFIRM: 동의했지만 확인(confirm) 전', async () => {
    const r = await sendGate(
      emailInput({ subscriber: consentedSubscriber({ confirm_status: 'pending' }) as GateInput['subscriber'] }),
      deps(),
    );
    expect(r).toMatchObject({ ok: false, blocked: 'PENDING_CONFIRM' });
  });

  it('CHANNEL_NOT_CONSENTED: 구독자 채널 설정과 불일치', async () => {
    const r = await sendGate(
      kakaoInput({ subscriber: consentedSubscriber({ channel: 'email' }) as GateInput['subscriber'] }),
      deps(),
    );
    expect(r).toMatchObject({ ok: false, blocked: 'CHANNEL_NOT_CONSENTED' });
    const noContact = await sendGate(
      emailInput({ subscriber: consentedSubscriber({ subscriber_email: null }) as GateInput['subscriber'] }),
      deps(),
    );
    expect(noContact).toMatchObject({ ok: false, blocked: 'CHANNEL_NOT_CONSENTED', detail: 'NO_CONTACT' });
  });

  it('QUIET_HOURS: 22:00 KST는 night_consent 없으면 차단, 동의가 있으면 통과', async () => {
    const r = await sendGate(emailInput(), { supabase: db as never, now: NIGHT });
    expect(r).toMatchObject({ ok: false, blocked: 'QUIET_HOURS' });
    db.clock = NIGHT;
    const ok = await sendGate(
      emailInput({ subscriber: consentedSubscriber({ night_consent: true }) as GateInput['subscriber'] }),
      { supabase: db as never, now: NIGHT, dryRun: true },
    );
    expect(ok).toMatchObject({ ok: true });
    // 08:00 직전(07:59 KST)도 야간
    const early = new Date('2026-10-05T22:59:00.000Z');
    const r2 = await sendGate(emailInput({ editionKey: 'k2' }), { supabase: db as never, now: early });
    expect(r2).toMatchObject({ ok: false, blocked: 'QUIET_HOURS' });
  });

  it('MISSING_AD_LABEL: 플래그가 true여도 제목에 (광고)가 없으면 차단', async () => {
    const a = await sendGate(emailInput({ rendered: { ...emailInput().rendered, hasAdLabel: false } }), deps());
    expect(a).toMatchObject({ ok: false, blocked: 'MISSING_AD_LABEL' });
    const b = await sendGate(emailInput({ rendered: { ...emailInput().rendered, subject: '주간 매거진' } }), deps());
    expect(b).toMatchObject({ ok: false, blocked: 'MISSING_AD_LABEL' });
    const c = await sendGate(kakaoInput({ rendered: { ...kakaoInput().rendered, body: '주간 매거진 수신거부 링크' } }), deps());
    expect(c).toMatchObject({ ok: false, blocked: 'MISSING_AD_LABEL' });
  });

  it('MISSING_UNSUB_LINK', async () => {
    const r = await sendGate(emailInput({ rendered: { ...emailInput().rendered, hasUnsubscribeLink: false } }), deps());
    expect(r).toMatchObject({ ok: false, blocked: 'MISSING_UNSUB_LINK' });
  });

  it('MISSING_SENDER: 발신자명 또는 연락처 없음', async () => {
    const a = await sendGate(emailInput({ rendered: { ...emailInput().rendered, senderName: null } }), deps());
    expect(a).toMatchObject({ ok: false, blocked: 'MISSING_SENDER' });
    const b = await sendGate(emailInput({ rendered: { ...emailInput().rendered, senderContact: '' } }), deps());
    expect(b).toMatchObject({ ok: false, blocked: 'MISSING_SENDER' });
  });

  it('NO_PROVIDER: 실발송(dry-run 아님)에서 키가 없으면 차단하고 provider 미호출 — dry-run은 키 없이 통과', async () => {
    providers.hasEmailProvider.mockReturnValue(false);
    providers.hasKakaoProvider.mockReturnValue(false);
    const email = await sendGate(emailInput(), { ...deps(), dryRun: false });
    expect(email).toMatchObject({ ok: false, blocked: 'NO_PROVIDER' });
    const kakao = await sendGate(kakaoInput(), { ...deps(), dryRun: false });
    expect(kakao).toMatchObject({ ok: false, blocked: 'NO_PROVIDER' });
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
    expect(providers.sendKakaoProvider).not.toHaveBeenCalled();
    const dry = await sendGate(emailInput({ editionKey: 'dry' }), { ...deps(), dryRun: true });
    expect(dry).toMatchObject({ ok: true, dryRun: true });
  });

  it('LEDGER_UNAVAILABLE: 원장 테이블이 없으면 발송하지 않는다(fail-closed)', async () => {
    db.ledgerMissing = true;
    const r = await sendGate(emailInput(), { ...deps(), dryRun: false });
    expect(r).toMatchObject({ ok: false, blocked: 'LEDGER_UNAVAILABLE' });
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
  });

  it('DUPLICATE: 같은 edition·구독자·채널 두 번째 호출은 차단, provider는 1회만', async () => {
    const first = await sendGate(emailInput(), { ...deps(), dryRun: false });
    expect(first).toMatchObject({ ok: true, dryRun: false });
    const second = await sendGate(emailInput(), { ...deps(), dryRun: false });
    expect(second).toMatchObject({ ok: false, blocked: 'DUPLICATE' });
    expect(providers.sendEmailProvider).toHaveBeenCalledTimes(1);
    // 같은 구독자의 다른 채널은 별도 키
    const other = await sendGate(kakaoInput(), { ...deps(), dryRun: false });
    expect(other).toMatchObject({ ok: true });
  });

  it('DAILY_CAP: 일일 상한 초과분은 차단되고 원장 행이 blocked로 갱신된다', async () => {
    const cap = (id: string) =>
      sendGate(emailInput({ subscriber: consentedSubscriber({ id }) as GateInput['subscriber'], dailyCap: 1 }), { ...deps(), dryRun: false });
    const a = await cap(SUB_ID);
    const b = await cap(SUB_ID_2);
    expect(a).toMatchObject({ ok: true });
    expect(b).toMatchObject({ ok: false, blocked: 'DAILY_CAP' });
    expect(providers.sendEmailProvider).toHaveBeenCalledTimes(1);
    const rows = db.rows('magazine_dispatch_logs');
    expect(rows.filter((r) => r.status === 'sent')).toHaveLength(1);
    expect(rows.filter((r) => r.status === 'blocked' && r.blocked_reason === 'DAILY_CAP')).toHaveLength(1);
  });

  it('MAGAZINE_DAILY_CAP 환경변수가 입력 상한보다 우선', async () => {
    process.env.MAGAZINE_DAILY_CAP = '0';
    const r = await sendGate(emailInput({ dailyCap: 100 }), { ...deps(), dryRun: true });
    expect(r).toMatchObject({ ok: false, blocked: 'DAILY_CAP' });
  });
});

describe('sendGate — 통과 경로', () => {
  it('dry-run: 원장에 dry_run 기록, provider 호출 0회', async () => {
    const r = await sendGate(emailInput(), { ...deps(), dryRun: true });
    expect(r).toMatchObject({ ok: true, dryRun: true });
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
    expect(providers.sendKakaoProvider).not.toHaveBeenCalled();
    const rows = db.rows('magazine_dispatch_logs');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'dry_run',
      channel: 'email',
      kind: 'weekly',
      broker_id: 'kim-broker',
      idempotency_key: `kim-broker:2026-10-06:weekly:${SUB_ID}:email`,
      subscriber_id: SUB_ID,
    });
  });

  it('실발송 성공: provider 호출 후 원장 sent + provider_msg_id', async () => {
    const r = await sendGate(emailInput(), { ...deps(), dryRun: false });
    expect(r.ok).toBe(true);
    expect(providers.sendEmailProvider).toHaveBeenCalledTimes(1);
    expect(providers.sendEmailProvider).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'hong@example.com', subject: '(광고) 주간 매거진', headers: { 'List-Unsubscribe': '<https://x.test/u?t=1>' } }),
    );
    expect(db.rows('magazine_dispatch_logs')[0]).toMatchObject({ status: 'sent', provider_msg_id: 'msg-email-1' });
  });

  it('알림톡 실발송: 렌더된 본문이 그대로 provider로 전달', async () => {
    const r = await sendGate(kakaoInput(), { ...deps(), dryRun: false });
    expect(r.ok).toBe(true);
    expect(providers.sendKakaoProvider).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '010-1234-5678', templateId: 'TPL_MAGAZINE_WEEKLY_ISSUE', text: expect.stringContaining('(광고)') }),
    );
  });

  it('provider 실패: PROVIDER_FAILED(failed 표시) + 원장 failed', async () => {
    providers.sendEmailProvider.mockResolvedValueOnce({ ok: false, error: 'boom' });
    const r = await sendGate(emailInput(), { ...deps(), dryRun: false });
    expect(r).toMatchObject({ ok: false, blocked: 'PROVIDER_FAILED', failed: true });
    expect(db.rows('magazine_dispatch_logs')[0]).toMatchObject({ status: 'failed', error: 'boom' });
  });

  it('dry-run 기록은 실발송 승격을 막지 않는다(canary 단계) — 같은 키 재점유 후 실발송', async () => {
    await sendGate(emailInput(), { ...deps(), dryRun: true });
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
    const real = await sendGate(emailInput(), { ...deps(), dryRun: false });
    expect(real).toMatchObject({ ok: true, dryRun: false });
    expect(providers.sendEmailProvider).toHaveBeenCalledTimes(1);
    expect(db.rows('magazine_dispatch_logs')).toHaveLength(1);
    expect(db.rows('magazine_dispatch_logs')[0].status).toBe('sent');
    // 실발송 이후에는 DUPLICATE
    const again = await sendGate(emailInput(), { ...deps(), dryRun: false });
    expect(again).toMatchObject({ ok: false, blocked: 'DUPLICATE' });
  });
});

describe('checkFlashWeeklyCap — 속보 주 2회 상한', () => {
  function seedFlash(editionId: string, status = 'sent') {
    db.rows('magazine_dispatch_logs').push({
      id: `r-${editionId}`,
      idempotency_key: `k-${editionId}`,
      broker_id: 'kim-broker',
      kind: 'flash',
      status,
      edition_id: editionId,
      created_at: DAYTIME.toISOString(),
    });
  }

  it('이번 주 다른 속보 에디션이 2건이면 세 번째는 DAILY_CAP', async () => {
    seedFlash('f1');
    seedFlash('f2');
    const r = await checkFlashWeeklyCap(db as never, { brokerId: 'kim-broker', editionId: 'f3' }, { now: DAYTIME, dryRun: false });
    expect(r).toMatchObject({ ok: false, blocked: 'DAILY_CAP' });
  });

  it('같은 에디션 재시도·1건뿐이면 통과', async () => {
    seedFlash('f1');
    const one = await checkFlashWeeklyCap(db as never, { brokerId: 'kim-broker', editionId: 'f2' }, { now: DAYTIME, dryRun: false });
    expect(one.ok).toBe(true);
    seedFlash('f2');
    const retry = await checkFlashWeeklyCap(db as never, { brokerId: 'kim-broker', editionId: 'f2' }, { now: DAYTIME, dryRun: false });
    expect(retry.ok).toBe(true);
  });

  it('지난주 기록은 세지 않는다', async () => {
    db.rows('magazine_dispatch_logs').push({
      id: 'old', idempotency_key: 'old', broker_id: 'kim-broker', kind: 'flash', status: 'sent', edition_id: 'f0',
      created_at: '2026-09-20T01:00:00.000Z',
    });
    seedFlash('f1');
    const r = await checkFlashWeeklyCap(db as never, { brokerId: 'kim-broker', editionId: 'f2' }, { now: DAYTIME, dryRun: false });
    expect(r.ok).toBe(true); // 이번 주는 f1 1건뿐
  });

  it('원장 테이블 미존재는 LEDGER_UNAVAILABLE', async () => {
    db.ledgerMissing = true;
    const r = await checkFlashWeeklyCap(db as never, { brokerId: 'kim-broker', editionId: 'f1' }, { now: DAYTIME, dryRun: false });
    expect(r).toMatchObject({ ok: false, blocked: 'LEDGER_UNAVAILABLE' });
  });
});
