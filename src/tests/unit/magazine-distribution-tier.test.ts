import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FakeDb, consentedSubscriber, DAYTIME, BROKER_USER_ID } from './magazine/send-fake-db';

// provider는 sendGate 내부에서만 호출된다 — 여기서 spy로 호출 여부를 검증한다.
const providers = vi.hoisted(() => ({
  hasEmailProvider: vi.fn(() => true),
  hasKakaoProvider: vi.fn(() => true),
  sendEmailProvider: vi.fn(async () => ({ ok: true, messageId: 'm-email' } as { ok: boolean; messageId?: string; error?: string })),
  sendKakaoProvider: vi.fn(async () => ({ ok: true, messageId: null } as { ok: boolean; messageId?: string | null; error?: string })),
}));
vi.mock('@/domain/magazine/send-providers', () => providers);

const renderSpy = vi.hoisted(() => ({ email: vi.fn(), kakao: vi.fn() }));
vi.mock('@/domain/magazine/email-template', () => ({
  renderMagazineEmail: (input: { edition: { title: string }; unsubscribeUrl: string }) => {
    renderSpy.email(input);
    return {
      subject: `(광고) ${input.edition.title}`,
      html: `<a href="${input.unsubscribeUrl}">수신거부</a>`,
      text: `수신거부: ${input.unsubscribeUrl}`,
      hasUnsubscribeLink: true,
      hasAdLabel: true,
    };
  },
  renderMagazineKakaoText: (input: { edition: { title: string }; unsubscribeUrl: string }) => {
    renderSpy.kakao(input);
    return { text: `(광고) ${input.edition.title}\n수신거부: ${input.unsubscribeUrl}`, hasUnsubscribeLink: true, hasAdLabel: true };
  },
}));

import { distributeMagazine } from '@/domain/magazine/distribute-magazine';
import { distributeSpecialEdition } from '@/domain/magazine/distribute-special-edition';

const ENV_KEYS = ['MAGAZINE_SEND_ENABLED', 'MAGAZINE_SEND_DRY_RUN', 'MAGAZINE_SEND_ALLOWLIST', 'MAGAZINE_DAILY_CAP', 'APP_BASE_URL', 'UNSUBSCRIBE_SECRET'];

describe('Magazine Distribution Tier Guard (무료 이메일 우선 & Pro 유료 알림톡)', () => {
  let db: FakeDb;

  // 운영 스키마(subscriber_email, interest_profile)와 일치하는 구독자 — 없는 컬럼(email, interest_tags)은 fake DB가 42703으로 거부한다
  function createDb(brokerTier: 'free' | 'pro', subStatus = 'active') {
    db = new FakeDb({
      magazine_subscribers: [
        consentedSubscriber({
          id: '33333333-3333-4333-8333-333333333333',
          subscriber_name: '홍길동',
          subscriber_phone: '010-1234-5678',
          subscriber_email: 'hong@example.com',
          channel: 'both',
          segment: 'investor',
          interest_profile: { tags: { regions: ['성수'], assetTypes: ['꼬마빌딩'] } },
        }),
      ],
      broker_profiles: [{ id: 'bp-1', name: '김브로커', slug: 'kim-broker', user_id: BROKER_USER_ID, contact_email: 'kim@broker.test' }],
      profiles: [{ id: BROKER_USER_ID, display_name: '김중개', phone: '010-0000-1111' }],
      user_subscriptions: [{ id: 'us-1', user_id: BROKER_USER_ID, tier: brokerTier, status: subStatus }],
      activity_events: [],
    });
    db.clock = DAYTIME;
    return db as never;
  }

  const deps = { now: DAYTIME, dryRun: false };

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
  });
  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  describe('주간 매거진 배포 (distributeMagazine)', () => {
    it('Free 티어 브로커: 알림톡은 스킵(CHANNEL_NOT_AVAILABLE)되고 이메일만 우선 발송된다', async () => {
      const result = await distributeMagazine(createDb('free'), 'kim-broker', {
        title: '2026 W39 강남 오피스 분석',
        date: '2026-09-28',
        headline: '강남 오피스 시장 거래 급증',
      }, deps);

      expect(result.isPaidTier).toBe(false);
      expect(result.tier).toBe('free');
      expect(result.emailSent).toBe(1);
      expect(result.kakaoSent).toBe(0);
      expect(result.kakaoSkipped).toBe(1);
      expect(result.blocked).toEqual({ CHANNEL_NOT_AVAILABLE: 1 });

      expect(providers.sendEmailProvider).toHaveBeenCalledTimes(1);
      expect(providers.sendKakaoProvider).not.toHaveBeenCalled();

      expect(providers.sendEmailProvider).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'hong@example.com', subject: expect.stringContaining('(광고)') }),
      );
      // 개인화 링크(매거진 URL)는 렌더 입력으로 전달된다
      expect(renderSpy.email).toHaveBeenCalledWith(
        expect.objectContaining({
          edition: expect.objectContaining({ url: 'https://www.credeal.net/magazine/kim-broker/2026-09-28' }),
        }),
      );
    });

    it('Pro 유료 티어 브로커: 알림톡과 이메일 모두 일괄 발송된다', async () => {
      const result = await distributeMagazine(createDb('pro'), 'kim-broker', {
        title: '2026 W39 강남 오피스 분석',
        date: '2026-09-28',
        headline: '강남 오피스 시장 거래 급증',
      }, deps);

      expect(result.isPaidTier).toBe(true);
      expect(result.tier).toBe('pro');
      expect(result.emailSent).toBe(1);
      expect(result.kakaoSent).toBe(1);
      expect(result.kakaoSkipped).toBe(0);

      expect(providers.sendEmailProvider).toHaveBeenCalledTimes(1);
      expect(providers.sendKakaoProvider).toHaveBeenCalledTimes(1);
      expect(providers.sendKakaoProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '010-1234-5678',
          templateId: 'TPL_MAGAZINE_WEEKLY_ISSUE',
          text: expect.stringContaining('(광고)'),
        }),
      );
      expect(renderSpy.kakao).toHaveBeenCalledWith(
        expect.objectContaining({
          edition: expect.objectContaining({ url: 'https://www.credeal.net/magazine/kim-broker/2026-09-28' }),
        }),
      );
    });
  });

  describe('속보 매거진 배포 (distributeSpecialEdition)', () => {
    const dummyEdition: any = {
      id: 'ed-special-1',
      title: '[단독 속보] 성수동 꼬마빌딩',
      edition_label: 'FLASH-20260928',
      published_at: '2026-09-28T01:00:00Z',
    };
    const input = {
      edition: dummyEdition,
      buildingId: 'bldg-1',
      areaSignal: '성수권역',
      assetType: '꼬마빌딩',
      headline: '[단독 속보] 성수동 꼬마빌딩',
      brokerId: 'kim-broker',
    };

    it('Free 티어 브로커: 속보 알림톡은 스킵되고 이메일만 배포된다', async () => {
      const result = await distributeSpecialEdition(createDb('free'), input, deps);

      expect(result.isPaidTier).toBe(false);
      expect(result.tier).toBe('free');
      expect(result.emailSent).toBe(1);
      expect(result.kakaoSent).toBe(0);
      expect(result.kakaoSkipped).toBe(1);

      expect(providers.sendEmailProvider).toHaveBeenCalledTimes(1);
      expect(providers.sendKakaoProvider).not.toHaveBeenCalled();
    });

    it('Pro 유료 티어 브로커: 속보 알림톡과 이메일 모두 배포된다', async () => {
      const result = await distributeSpecialEdition(createDb('pro'), input, deps);

      expect(result.isPaidTier).toBe(true);
      expect(result.tier).toBe('pro');
      expect(result.emailSent).toBe(1);
      expect(result.kakaoSent).toBe(1);
      expect(result.kakaoSkipped).toBe(0);

      expect(providers.sendEmailProvider).toHaveBeenCalledTimes(1);
      expect(providers.sendKakaoProvider).toHaveBeenCalledTimes(1);
      expect(providers.sendKakaoProvider).toHaveBeenCalledWith(expect.objectContaining({ templateId: 'TPL_MAGAZINE_FLASH_ISSUE' }));
    });
  });
});
