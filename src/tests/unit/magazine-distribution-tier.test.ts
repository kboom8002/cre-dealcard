import { describe, it, expect, vi, beforeEach } from 'vitest';
import { distributeMagazine } from '@/domain/magazine/distribute-magazine';
import { distributeSpecialEdition } from '@/domain/magazine/distribute-special-edition';
import { sendKakaoAlimtalk } from '@/lib/notification/notification-service';
import { sendMagazineEmail } from '@/lib/notification/email-service';

vi.mock('@/lib/notification/notification-service', () => ({
  sendKakaoAlimtalk: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/notification/email-service', () => ({
  sendMagazineEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/domain/magazine/rail/dispatcher', () => ({
  dispatchEdition: vi.fn().mockResolvedValue({ success: true }),
}));

describe('Magazine Distribution Tier Guard (무료 이메일 우선 & Pro 유료 알림톡)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createMockSupabase(brokerTier: 'free' | 'pro', subStatus = 'active') {
    const mockSubscribers = [
      {
        id: 'sub-1',
        subscriber_name: '홍길동',
        subscriber_phone: '010-1234-5678',
        subscriber_email: 'hong@example.com',
        email: 'hong@example.com',
        channel: 'both',
        segment: 'investor',
        interest_tags: { assetTypes: ['all'] },
      },
    ];

    const mockBrokerProfile = {
      name: '김브로커',
      slug: 'kim-broker',
      user_id: 'user-broker-123',
    };

    return {
      from: vi.fn((table: string) => {
        if (table === 'magazine_subscribers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ data: mockSubscribers, error: null }),
          };
        }
        if (table === 'broker_profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockBrokerProfile, error: null }),
          };
        }
        if (table === 'user_subscriptions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { tier: brokerTier, status: subStatus },
              error: null,
            }),
          };
        }
        if (table === 'activity_events') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'broker_clients') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    } as any;
  }

  describe('주간 매거진 배포 (distributeMagazine)', () => {
    it('Free 티어 브로커: 알림톡은 스킵되고 이메일만 우선 발송된다', async () => {
      const mockSupabase = createMockSupabase('free');

      const result = await distributeMagazine(mockSupabase, 'kim-broker', {
        title: '2026 W39 강남 오피스 분석',
        date: '2026-09-28',
        headline: '강남 오피스 시장 거래 급증',
      });

      // 1. 결과 검증
      expect(result.isPaidTier).toBe(false);
      expect(result.tier).toBe('free');
      expect(result.emailSent).toBe(1);
      expect(result.kakaoSent).toBe(0);
      expect(result.kakaoSkipped).toBe(1);

      // 2. 서비스 호출 검증: 이메일은 발송되고 알림톡은 호출되지 않아야 함
      expect(sendMagazineEmail).toHaveBeenCalledTimes(1);
      expect(sendKakaoAlimtalk).not.toHaveBeenCalled();

      // 3. 발송된 이메일 페이로드에 개인화 링크가 포함되어 있는지 확인
      expect(sendMagazineEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'hong@example.com',
          magazineUrl: 'https://www.credeal.net/magazine/kim-broker/2026-09-28',
        })
      );
    });

    it('Pro 유료 티어 브로커: 알림톡과 이메일 모두 일괄 발송된다', async () => {
      const mockSupabase = createMockSupabase('pro');

      const result = await distributeMagazine(mockSupabase, 'kim-broker', {
        title: '2026 W39 강남 오피스 분석',
        date: '2026-09-28',
        headline: '강남 오피스 시장 거래 급증',
      });

      // 1. 결과 검증
      expect(result.isPaidTier).toBe(true);
      expect(result.tier).toBe('pro');
      expect(result.emailSent).toBe(1);
      expect(result.kakaoSent).toBe(1);
      expect(result.kakaoSkipped).toBe(0);

      // 2. 서비스 호출 검증: 이메일과 알림톡 모두 호출됨
      expect(sendMagazineEmail).toHaveBeenCalledTimes(1);
      expect(sendKakaoAlimtalk).toHaveBeenCalledTimes(1);
      expect(sendKakaoAlimtalk).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientPhone: '010-1234-5678',
          templateId: 'TPL_MAGAZINE_NEW_ISSUE',
          variables: expect.objectContaining({
            '#{magazineUrl}': 'https://www.credeal.net/magazine/kim-broker/2026-09-28',
          }),
        })
      );
    });
  });

  describe('속보 매거진 배포 (distributeSpecialEdition)', () => {
    const dummyEdition: any = {
      id: 'ed-special-1',
      title: '[단독 속보] 성수동 꼬마빌딩 급매',
      edition_label: 'FLASH-20260928',
      published_at: '2026-09-28T09:00:00Z',
    };

    it('Free 티어 브로커: 속보 알림톡은 스킵되고 이메일만 배포된다', async () => {
      const mockSupabase = createMockSupabase('free');

      const result = await distributeSpecialEdition(mockSupabase, {
        edition: dummyEdition,
        buildingId: 'bldg-1',
        areaSignal: '성수권역',
        assetType: '꼬마빌딩',
        headline: '[단독 속보] 성수동 꼬마빌딩 급매',
        brokerId: 'kim-broker',
      });

      expect(result.isPaidTier).toBe(false);
      expect(result.tier).toBe('free');
      expect(result.emailSent).toBe(1);
      expect(result.kakaoSent).toBe(0);
      expect(result.kakaoSkipped).toBe(1);

      expect(sendMagazineEmail).toHaveBeenCalledTimes(1);
      expect(sendKakaoAlimtalk).not.toHaveBeenCalled();
    });

    it('Pro 유료 티어 브로커: 속보 알림톡과 이메일 모두 배포된다', async () => {
      const mockSupabase = createMockSupabase('pro');

      const result = await distributeSpecialEdition(mockSupabase, {
        edition: dummyEdition,
        buildingId: 'bldg-1',
        areaSignal: '성수권역',
        assetType: '꼬마빌딩',
        headline: '[단독 속보] 성수동 꼬마빌딩 급매',
        brokerId: 'kim-broker',
      });

      expect(result.isPaidTier).toBe(true);
      expect(result.tier).toBe('pro');
      expect(result.emailSent).toBe(1);
      expect(result.kakaoSent).toBe(1);
      expect(result.kakaoSkipped).toBe(0);

      expect(sendMagazineEmail).toHaveBeenCalledTimes(1);
      expect(sendKakaoAlimtalk).toHaveBeenCalledTimes(1);
    });
  });
});
