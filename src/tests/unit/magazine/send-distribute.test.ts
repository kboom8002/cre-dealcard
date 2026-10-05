import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FakeDb, consentedSubscriber, DAYTIME, NIGHT, SUB_ID, SUB_ID_2, BROKER_USER_ID } from './send-fake-db';

const providers = vi.hoisted(() => ({
  hasEmailProvider: vi.fn(() => true),
  hasKakaoProvider: vi.fn(() => true),
  sendEmailProvider: vi.fn(async () => ({ ok: true, messageId: 'm-email' } as { ok: boolean; messageId?: string; error?: string })),
  sendKakaoProvider: vi.fn(async () => ({ ok: true, messageId: null } as { ok: boolean; messageId?: string | null; error?: string })),
}));
vi.mock('@/domain/magazine/send-providers', () => providers);

// B2 렌더러 계약(renderMagazineEmail / renderMagazineKakaoText)의 최소 대역
const renderSpy = vi.hoisted(() => ({ email: vi.fn(), kakao: vi.fn() }));
vi.mock('@/domain/magazine/email-template', () => ({
  renderMagazineEmail: (input: { edition: { title: string }; unsubscribeUrl: string }) => {
    renderSpy.email(input);
    return {
      subject: `(광고) ${input.edition.title}`,
      html: `<p>${input.edition.title}</p><a href="${input.unsubscribeUrl}">수신거부</a>`,
      text: `${input.edition.title}\n수신거부: ${input.unsubscribeUrl}`,
      hasUnsubscribeLink: input.unsubscribeUrl.length > 0,
      hasAdLabel: true,
    };
  },
  renderMagazineKakaoText: (input: { edition: { title: string }; unsubscribeUrl: string }) => {
    renderSpy.kakao(input);
    return {
      text: `(광고) ${input.edition.title}\n수신거부: ${input.unsubscribeUrl}`,
      hasUnsubscribeLink: input.unsubscribeUrl.length > 0,
      hasAdLabel: true,
    };
  },
}));

import { distributeMagazine } from '@/domain/magazine/distribute-magazine';
import { distributeSpecialEdition } from '@/domain/magazine/distribute-special-edition';
import { verifySidToken } from '@/domain/magazine/sid-token';

const ENV_KEYS = ['MAGAZINE_SEND_ENABLED', 'MAGAZINE_SEND_DRY_RUN', 'MAGAZINE_SEND_ALLOWLIST', 'MAGAZINE_DAILY_CAP', 'APP_BASE_URL', 'UNSUBSCRIBE_SECRET'];

const EDITION = { id: 'ed-weekly-1', title: '2026 W41 강남 오피스 분석', date: '2026-10-06', headline: '강남 오피스 거래 증가' };
const FLASH_EDITION = {
  id: 'ed-flash-1',
  title: '[단독 속보] 강남 꼬마빌딩',
  edition_label: 'FLASH-20261006',
  published_at: '2026-10-06T01:00:00.000Z',
} as never;

let db: FakeDb;

function seed(tier: 'free' | 'pro', subs: Record<string, unknown>[] = [consentedSubscriber()], profileName: string | null = '김중개') {
  db = new FakeDb({
    broker_profiles: [{ id: 'bp-1', user_id: BROKER_USER_ID, slug: 'kim-broker', name: '김브로커', contact_email: 'kim@broker.test' }],
    profiles: [{ id: BROKER_USER_ID, display_name: profileName, phone: '010-0000-1111' }],
    user_subscriptions: [{ id: 'us-1', user_id: BROKER_USER_ID, tier, status: 'active' }],
    magazine_subscribers: subs,
    activity_events: [],
  });
  db.clock = DAYTIME;
}

function uuidN(n: number): string {
  return `${String(n).padStart(8, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
}

beforeEach(() => {
  vi.clearAllMocks();
  providers.hasEmailProvider.mockReturnValue(true);
  providers.hasKakaoProvider.mockReturnValue(true);
  providers.sendEmailProvider.mockResolvedValue({ ok: true, messageId: 'm-email' });
  providers.sendKakaoProvider.mockResolvedValue({ ok: true, messageId: null });
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.MAGAZINE_SEND_ENABLED = 'true';
  process.env.APP_BASE_URL = 'https://www.credeal.net';
  process.env.UNSUBSCRIBE_SECRET = 'test-unsubscribe-secret';
  seed('pro');
});
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe('schema-aware 가짜 DB 가드 (구 테스트의 없는 컬럼 mock 방지)', () => {
  it('운영 스키마에 없는 컬럼(email, interest_tags)을 select하면 42703', async () => {
    const r = await db.from('magazine_subscribers').select('id, email, interest_tags');
    expect((r as { error: { code: string } }).error.code).toBe('42703');
  });
});

describe('P0-04 킬스위치', () => {
  it('distributeMagazine: MAGAZINE_SEND_ENABLED 미설정 → SEND_DISABLED, provider·DB 접촉 0회', async () => {
    delete process.env.MAGAZINE_SEND_ENABLED;
    const r = await distributeMagazine(db as never, 'kim-broker', EDITION, { dryRun: false });
    expect(r).toMatchObject({ ok: false, blockedReason: 'SEND_DISABLED', sent: 0, failed: 0, total: 0 });
    expect(r.message).toContain('발송');
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
    expect(providers.sendKakaoProvider).not.toHaveBeenCalled();
    expect(db.fromCalls).toHaveLength(0);
  });

  it('distributeSpecialEdition: 동일하게 차단', async () => {
    delete process.env.MAGAZINE_SEND_ENABLED;
    const r = await distributeSpecialEdition(
      db as never,
      { edition: FLASH_EDITION, buildingId: 'b-1', areaSignal: '강남', assetType: '꼬마빌딩', headline: '속보', brokerId: 'kim-broker' },
      { dryRun: false },
    );
    expect(r).toMatchObject({ ok: false, blockedReason: 'SEND_DISABLED', sent: 0 });
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
    expect(providers.sendKakaoProvider).not.toHaveBeenCalled();
    expect(db.fromCalls).toHaveLength(0);
  });

  it('플래그가 "false"여도 차단', async () => {
    process.env.MAGAZINE_SEND_ENABLED = 'false';
    const r = await distributeMagazine(db as never, 'kim-broker', EDITION);
    expect(r.blockedReason).toBe('SEND_DISABLED');
  });
});

describe('E4 구독자 개인 링크 sid', () => {
  it('이메일·알림톡 매거진 링크에 구독자 서명 sid가 붙고 APP_BASE_URL 기반 절대 URL이다', async () => {
    process.env.MAGAZINE_SID_SECRET = 'sid-secret-abcdefgh';
    try {
      await distributeMagazine(db as never, 'kim-broker', EDITION, { now: DAYTIME, dryRun: true });
      for (const spy of [renderSpy.email, renderSpy.kakao]) {
        const url = new URL((spy.mock.calls[0][0] as { edition: { url: string } }).edition.url);
        expect(url.origin).toBe('https://www.credeal.net');
        expect(url.pathname).toBe('/magazine/kim-broker/2026-10-06');
        const v = verifySidToken(url.searchParams.get('sid'));
        expect(v).toEqual({ ok: true, subscriberId: SUB_ID, brokerKey: 'kim-broker' });
      }
    } finally {
      delete process.env.MAGAZINE_SID_SECRET;
    }
  });

  it('MAGAZINE_SID_SECRET 없으면 sid 없는 익명 링크로 정직하게 degrade (발송은 계속)', async () => {
    delete process.env.MAGAZINE_SID_SECRET;
    const r = await distributeMagazine(db as never, 'kim-broker', EDITION, { now: DAYTIME, dryRun: true });
    expect(r.recorded).toBe(2);
    const url = new URL((renderSpy.email.mock.calls[0][0] as { edition: { url: string } }).edition.url);
    expect(url.searchParams.has('sid')).toBe(false);
  });
});


describe('distributeMagazine — 정직한 집계', () => {
  it('dry-run: sent 0, 원장 dry_run 기록(recorded), provider 호출 0회', async () => {
    const r = await distributeMagazine(db as never, 'kim-broker', EDITION, { now: DAYTIME, dryRun: true });
    expect(r).toMatchObject({ ok: true, dryRun: true, total: 2, sent: 0, failed: 0, recorded: 2 });
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
    expect(providers.sendKakaoProvider).not.toHaveBeenCalled();
    const ledger = db.rows('magazine_dispatch_logs');
    expect(ledger.filter((l) => l.status === 'dry_run').map((l) => l.channel).sort()).toEqual(['email', 'kakao']);
    expect(ledger[0].idempotency_key).toMatch(/^kim-broker:2026-10-06:weekly:/);
  });

  it('실발송(Pro): 이메일·알림톡 각 1건 sent, 렌더 입력에 발신자(display_name)·광고 플래그 전달', async () => {
    const r = await distributeMagazine(db as never, 'kim-broker', EDITION, { now: DAYTIME, dryRun: false });
    expect(r).toMatchObject({ ok: true, dryRun: false, sent: 2, emailSent: 1, kakaoSent: 1, failed: 0, isPaidTier: true, tier: 'pro' });
    expect(providers.sendEmailProvider).toHaveBeenCalledTimes(1);
    expect(providers.sendKakaoProvider).toHaveBeenCalledTimes(1);
    expect(providers.sendEmailProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'hong@example.com',
        subject: '(광고) 2026 W41 강남 오피스 분석',
        headers: expect.objectContaining({ 'List-Unsubscribe': expect.stringContaining('/api/public/magazine/unsubscribe?t=') }),
      }),
    );
    expect(renderSpy.email).toHaveBeenCalledWith(
      expect.objectContaining({ brokerName: '김중개', brokerContact: '010-0000-1111', isAd: true, subscriberName: '홍길동' }),
    );
    // 링크에 localhost/undefined 없음
    const sentArgs = providers.sendEmailProvider.mock.calls[0] as unknown as Array<{ html: string }>;
    expect(sentArgs[0].html).toContain('https://www.credeal.net/api/public/magazine/unsubscribe');
    expect(sentArgs[0].html).not.toMatch(/localhost|undefined/);
  });

  it('Free 티어: 알림톡은 CHANNEL_NOT_AVAILABLE(성공 집계 아님), 이메일만 발송', async () => {
    seed('free');
    const r = await distributeMagazine(db as never, 'kim-broker', EDITION, { now: DAYTIME, dryRun: false });
    expect(r).toMatchObject({ sent: 1, emailSent: 1, kakaoSent: 0, kakaoSkipped: 1, isPaidTier: false, tier: 'free' });
    expect(r.blocked).toEqual({ CHANNEL_NOT_AVAILABLE: 1 });
    expect(providers.sendKakaoProvider).not.toHaveBeenCalled();
  });

  it('같은 에디션을 두 번 distribute → 두 번째는 전원 DUPLICATE, provider 추가 호출 0회', async () => {
    const first = await distributeMagazine(db as never, 'kim-broker', EDITION, { now: DAYTIME, dryRun: false });
    expect(first.sent).toBe(2);
    providers.sendEmailProvider.mockClear();
    providers.sendKakaoProvider.mockClear();
    const second = await distributeMagazine(db as never, 'kim-broker', EDITION, { now: DAYTIME, dryRun: false });
    expect(second).toMatchObject({ sent: 0, failed: 0, total: 2 });
    expect(second.blocked).toEqual({ DUPLICATE: 2 });
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
    expect(providers.sendKakaoProvider).not.toHaveBeenCalled();
  });

  it('야간(22:00 KST) → 전원 QUIET_HOURS, provider 0회', async () => {
    const r = await distributeMagazine(db as never, 'kim-broker', EDITION, { now: NIGHT, dryRun: false });
    expect(r).toMatchObject({ ok: true, sent: 0, total: 2 });
    expect(r.blocked).toEqual({ QUIET_HOURS: 2 });
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
    expect(providers.sendKakaoProvider).not.toHaveBeenCalled();
  });

  it('동의 기록이 없는 기존 구독자는 NO_CONSENT로 차단', async () => {
    seed('pro', [consentedSubscriber({ marketing_consent_at: null, confirm_status: 'pending' })]);
    const r = await distributeMagazine(db as never, 'kim-broker', EDITION, { now: DAYTIME, dryRun: false });
    expect(r.sent).toBe(0);
    expect(r.blocked).toEqual({ NO_CONSENT: 2 });
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
  });

  it('원장 테이블 미존재 → 전원 LEDGER_UNAVAILABLE(발송 0, 가짜 성공 없음)', async () => {
    db.ledgerMissing = true;
    const r = await distributeMagazine(db as never, 'kim-broker', EDITION, { now: DAYTIME, dryRun: false });
    expect(r.sent).toBe(0);
    expect(r.blocked).toEqual({ LEDGER_UNAVAILABLE: 2 });
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
  });

  it('provider 실패는 failed로 집계(blocked 아님)', async () => {
    providers.sendEmailProvider.mockResolvedValueOnce({ ok: false, error: 'resend 500' });
    const r = await distributeMagazine(db as never, 'kim-broker', EDITION, { now: DAYTIME, dryRun: false });
    expect(r).toMatchObject({ sent: 1, failed: 1, emailFailed: 1, kakaoSent: 1 });
  });

  it('발신자명(profiles.display_name) 없음 → MISSING_SENDER, 원장·provider 미접촉', async () => {
    seed('pro', [consentedSubscriber()], null);
    const r = await distributeMagazine(db as never, 'kim-broker', EDITION, { now: DAYTIME, dryRun: false });
    expect(r.blocked).toEqual({ MISSING_SENDER: 2 });
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
    expect(db.rows('magazine_dispatch_logs')).toHaveLength(0);
  });

  it('APP_BASE_URL 미설정 → 해지 링크를 만들 수 없어 MISSING_UNSUB_LINK', async () => {
    delete process.env.APP_BASE_URL;
    const r = await distributeMagazine(db as never, 'kim-broker', EDITION, { now: DAYTIME, dryRun: false });
    expect(r.blocked).toEqual({ MISSING_UNSUB_LINK: 2 });
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
  });

  it('UNSUBSCRIBE_SECRET 미설정 → MISSING_UNSUB_LINK', async () => {
    delete process.env.UNSUBSCRIBE_SECRET;
    const r = await distributeMagazine(db as never, 'kim-broker', EDITION, { now: DAYTIME, dryRun: false });
    expect(r.blocked).toEqual({ MISSING_UNSUB_LINK: 2 });
  });

  it('target 세그먼트(DC-9): seller만 선택하면 investor(=buyer) 구독자는 제외', async () => {
    seed('pro', [
      consentedSubscriber({ id: SUB_ID, segment: 'investor', channel: 'email' }),
      consentedSubscriber({ id: SUB_ID_2, segment: 'seller', channel: 'email', subscriber_email: 'seller@example.com' }),
    ]);
    const r = await distributeMagazine(db as never, 'kim-broker', { ...EDITION, target: 'seller' }, { now: DAYTIME, dryRun: false });
    expect(r).toMatchObject({ sent: 1, total: 1, segmentExcluded: 1 });
    expect(providers.sendEmailProvider).toHaveBeenCalledWith(expect.objectContaining({ to: 'seller@example.com' }));
  });

  it('구독자 select 에러는 삼키지 않고 throw (T2-02b)', async () => {
    const failing = {
      from: (t: string) =>
        t === 'magazine_subscribers'
          ? {
              select: () => ({
                in: () => ({
                  eq: () => Promise.resolve({ data: null, error: { code: '42703', message: 'column magazine_subscribers.x does not exist' } }),
                }),
              }),
            }
          : db.from(t),
    };
    await expect(distributeMagazine(failing as never, 'kim-broker', EDITION, { now: DAYTIME, dryRun: false })).rejects.toThrow(/구독자 조회 실패/);
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
  });

  it('브로커 프로필 없음 → throw', async () => {
    await expect(distributeMagazine(db as never, 'nobody', EDITION, { now: DAYTIME })).rejects.toThrow(/브로커 프로필/);
  });

  it('issueDate 미지정이면 KST 오늘(UTC 자정 직후에도 하루 밀리지 않음)', async () => {
    // 2026-10-05T16:30Z = 2026-10-06 01:30 KST → 야간이라 차단되지만 멱등 키로 날짜 확인
    const lateUtc = new Date('2026-10-05T16:30:00.000Z');
    db.clock = lateUtc;
    await distributeMagazine(db as never, 'kim-broker', { id: 'e', title: 't' }, { now: lateUtc, dryRun: true });
    // 판정 시각이 야간이라 차단 행만 남지만 키 접두의 발행일은 KST(10-06)여야 한다 (UTC slice였다면 10-05)
    const keys = db.rows('magazine_dispatch_logs').map((l) => String(l.idempotency_key));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith('kim-broker:2026-10-06:weekly:'))).toBe(true);
  });
});

describe('distributeSpecialEdition — 태그 매칭·주 2회 상한', () => {
  const baseInput = {
    edition: FLASH_EDITION,
    buildingId: 'b-1',
    areaSignal: '강남',
    assetType: '꼬마빌딩',
    headline: '[단독 속보] 강남 꼬마빌딩',
    brokerId: 'kim-broker',
  };

  function tagged(n: number, tags: Record<string, unknown> | null, over: Record<string, unknown> = {}) {
    return consentedSubscriber({
      id: uuidN(n),
      channel: 'email',
      subscriber_email: `s${n}@example.com`,
      interest_profile: tags ? { tags } : {},
      ...over,
    });
  }

  it('권역·자산이 모두 맞는 구독자만 대상 (강남·꼬마빌딩 발송, 마포·사옥 미발송), 태그 없는 구독자는 기본 제외', async () => {
    seed('pro', [
      tagged(1, { regions: ['강남', '서초'], assetTypes: ['꼬마빌딩'] }),
      tagged(2, { regions: ['마포', '홍대'], assetTypes: ['사옥'] }),
      tagged(3, null), // 태그 없음
      tagged(4, { regions: ['강남'] }), // 자산 태그 없음 → 자산 조건 불일치
    ]);
    const r = await distributeSpecialEdition(db as never, baseInput, { now: DAYTIME, dryRun: true });
    expect(r).toMatchObject({ ok: true, total: 1, recorded: 1, sent: 0 });
    expect(db.rows('magazine_dispatch_logs')[0].idempotency_key).toBe(`kim-broker:2026-10-06:flash:ed-flash-1:${uuidN(1)}:email`);
    expect(db.rows('magazine_dispatch_logs')[0].kind).toBe('flash');
  });

  it('includeUntagged:true를 명시하면 태그 없는 구독자도 포함', async () => {
    seed('pro', [tagged(1, { regions: ['강남'], assetTypes: ['꼬마빌딩'] }), tagged(3, null)]);
    const r = await distributeSpecialEdition(db as never, { ...baseInput, includeUntagged: true }, { now: DAYTIME, dryRun: true });
    expect(r.total).toBe(2);
  });

  it('segment=investor 기본값만으로는 발송되지 않는다(T2-13)', async () => {
    seed('pro', [tagged(5, null, { segment: 'investor' })]);
    const r = await distributeSpecialEdition(db as never, baseInput, { now: DAYTIME, dryRun: false });
    expect(r).toMatchObject({ total: 0, sent: 0 });
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
  });

  it('실발송: 가짜 라벨 없이 입력 제목만 렌더에 사용, 발행일은 KST', async () => {
    seed('pro', [tagged(1, { regions: ['강남'], assetTypes: ['꼬마빌딩'] })]);
    const r = await distributeSpecialEdition(db as never, baseInput, { now: DAYTIME, dryRun: false });
    expect(r).toMatchObject({ sent: 1, emailSent: 1, failed: 0 });
    const input = renderSpy.email.mock.calls[0][0] as { edition: { title: string; marketTemp: string; date: string } };
    expect(input.edition.title).toBe('[단독 속보] 강남 꼬마빌딩');
    expect(input.edition.marketTemp).toBe('');
    expect(input.edition.date).toBe('2026-10-06');
    expect(JSON.stringify(input)).not.toMatch(/적극 매수|급매/);
  });

  it('이번 주 다른 속보 2건이 이미 발송됐다면 전원 DAILY_CAP, provider 0회', async () => {
    seed('pro', [tagged(1, { regions: ['강남'], assetTypes: ['꼬마빌딩'] })]);
    for (const id of ['f-a', 'f-b']) {
      db.rows('magazine_dispatch_logs').push({
        id: `r-${id}`, idempotency_key: `k-${id}`, broker_id: 'kim-broker', kind: 'flash', status: 'sent', edition_id: id,
        created_at: DAYTIME.toISOString(),
      });
    }
    const r = await distributeSpecialEdition(db as never, baseInput, { now: DAYTIME, dryRun: false });
    expect(r.sent).toBe(0);
    expect(r.blocked).toEqual({ DAILY_CAP: 1 });
    expect(providers.sendEmailProvider).not.toHaveBeenCalled();
  });

  it('같은 속보 두 번 → 두 번째 DUPLICATE', async () => {
    seed('pro', [tagged(1, { regions: ['강남'], assetTypes: ['꼬마빌딩'] })]);
    await distributeSpecialEdition(db as never, baseInput, { now: DAYTIME, dryRun: false });
    const second = await distributeSpecialEdition(db as never, baseInput, { now: DAYTIME, dryRun: false });
    expect(second.sent).toBe(0);
    expect(second.blocked).toEqual({ DUPLICATE: 1 });
    expect(providers.sendEmailProvider).toHaveBeenCalledTimes(1);
  });
});
