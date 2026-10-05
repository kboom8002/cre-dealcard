import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildOgImageUrl,
  buildPrintCopy,
  buildSubscribeUrl,
  buildViewerUrl,
  formatBrokerLabel,
  normalizeBaseUrl,
  resolvePublicBaseUrl,
} from '@/lib/magazine/share-urls';
import {
  buildKakaoFeedPayload,
  clipDescription,
  shareViaKakaoOrCopy,
  type KakaoLike,
} from '@/lib/magazine/kakao-share';

afterEach(() => vi.unstubAllEnvs());

describe('share-urls: 절대 URL (T2-25a, T3-10)', () => {
  it('normalizeBaseUrl: origin 만 남기고 잘못된 값은 null', () => {
    expect(normalizeBaseUrl('https://www.credeal.net/')).toBe('https://www.credeal.net');
    expect(normalizeBaseUrl('https://www.credeal.net/some/path?x=1')).toBe('https://www.credeal.net');
    expect(normalizeBaseUrl('')).toBeNull();
    expect(normalizeBaseUrl(undefined)).toBeNull();
    expect(normalizeBaseUrl('not a url')).toBeNull();
    expect(normalizeBaseUrl('javascript:alert(1)')).toBeNull();
  });

  it('resolvePublicBaseUrl: prop → NEXT_PUBLIC_APP_BASE_URL → NEXT_PUBLIC_SITE_URL, 없으면 null(localhost 폴백 없음)', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_BASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    expect(resolvePublicBaseUrl(undefined)).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://site.example');
    expect(resolvePublicBaseUrl(undefined)).toBe('https://site.example');
    vi.stubEnv('NEXT_PUBLIC_APP_BASE_URL', 'https://app.example');
    expect(resolvePublicBaseUrl(undefined)).toBe('https://app.example');
    expect(resolvePublicBaseUrl('https://prop.example')).toBe('https://prop.example');
  });

  it('구독/뷰어 URL 은 slug 를 인코딩하고 source 를 쿼리로', () => {
    expect(buildSubscribeUrl({ baseUrl: 'https://www.credeal.net', slug: 'test-broker-kim', source: 'qr_card' })).toBe(
      'https://www.credeal.net/magazine/test-broker-kim/subscribe?source=qr_card',
    );
    expect(buildSubscribeUrl({ baseUrl: 'https://www.credeal.net', slug: 'a/../b' })).toBe(
      'https://www.credeal.net/magazine/a%2F..%2Fb/subscribe',
    );
    expect(buildViewerUrl({ baseUrl: 'https://www.credeal.net', slug: 'kim', date: '2026-10-05' })).toBe(
      'https://www.credeal.net/magazine/kim/2026-10-05',
    );
  });

  it('카카오 썸네일은 쿼리형 /api/og/magazine?brokerId=&date= (경로형 404 방지)', () => {
    const u = new URL(buildOgImageUrl({ baseUrl: 'https://www.credeal.net', slug: 'kim', date: '2026-10-05' }));
    expect(u.pathname).toBe('/api/og/magazine');
    expect(u.searchParams.get('brokerId')).toBe('kim');
    expect(u.searchParams.get('date')).toBe('2026-10-05');
  });
});

describe('인쇄 문구 (T1-18b): 이름 중복 제거', () => {
  it('기본 이름("중개사")이나 빈 값이면 "담당 중개사"', () => {
    expect(formatBrokerLabel('중개사')).toBe('담당 중개사');
    expect(formatBrokerLabel('')).toBe('담당 중개사');
    expect(formatBrokerLabel(undefined)).toBe('담당 중개사');
    expect(formatBrokerLabel(' 김중개 ')).toBe('김중개');
  });
  it('"중개사중개사" 같은 중복 없이 요일·이름·채널 변수로 구성', () => {
    const copy = buildPrintCopy({ weekdayLabel: '화요일', brokerName: '중개사', channelLabel: '이메일' });
    expect(copy).not.toMatch(/중개사\s*중개사/);
    expect(copy).toContain('매주 화요일 담당 중개사의');
    expect(copy).toContain('(이메일)');
    expect(buildPrintCopy({ weekdayLabel: '화요일', brokerName: '김중개' })).toBe(
      '스마트폰 카메라로 비추시면, 매주 화요일 김중개의 시장 리포트를 받아보실 수 있습니다.',
    );
  });
});

describe('kakao-share: SDK 실패 시 클립보드 폴백 (U2-26)', () => {
  const input = {
    title: '10월 브리핑',
    description: '설명',
    imageUrl: 'https://www.credeal.net/api/og/magazine?brokerId=kim&date=2026-10-05',
    link: 'https://www.credeal.net/magazine/kim/2026-10-05',
  };

  function fakeKakao(overrides: Partial<KakaoLike> = {}, initialized = true) {
    let inited = initialized;
    const sendDefault = vi.fn();
    const k: KakaoLike = {
      isInitialized: () => inited,
      init: () => {
        inited = true;
      },
      Share: { sendDefault },
      ...overrides,
    };
    return { k, sendDefault };
  }

  it('정상: Kakao.Share.sendDefault 호출, 복사하지 않음', async () => {
    const { k, sendDefault } = fakeKakao();
    const copy = vi.fn(async () => {});
    expect(await shareViaKakaoOrCopy({ kakao: k, input, copy })).toBe('kakao');
    expect(sendDefault).toHaveBeenCalledTimes(1);
    expect(copy).not.toHaveBeenCalled();
    const payload = sendDefault.mock.calls[0][0] as { content: { imageUrl: string } };
    expect(payload.content.imageUrl).toBe(input.imageUrl);
  });

  it('SDK 미로드 → 링크 복사 (copied)', async () => {
    const copy = vi.fn(async () => {});
    expect(await shareViaKakaoOrCopy({ kakao: null, input, copy })).toBe('copied');
    expect(copy).toHaveBeenCalledWith(input.link);
  });

  it('SDK 전송 예외 → 링크 복사 (copied)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { k } = fakeKakao({
      Share: {
        sendDefault: () => {
          throw new Error('sdk fail');
        },
      },
    });
    const copy = vi.fn(async () => {});
    expect(await shareViaKakaoOrCopy({ kakao: k, input, copy })).toBe('copied');
    expect(copy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('SDK 미초기화 + appKey 없음 → 복사 폴백', async () => {
    const { k, sendDefault } = fakeKakao({}, false);
    const copy = vi.fn(async () => {});
    expect(await shareViaKakaoOrCopy({ kakao: k, appKey: undefined, input, copy })).toBe('copied');
    expect(sendDefault).not.toHaveBeenCalled();
  });

  it('SDK 미초기화 + appKey 있음 → init 후 전송', async () => {
    const { k, sendDefault } = fakeKakao({}, false);
    expect(await shareViaKakaoOrCopy({ kakao: k, appKey: 'KEY', input, copy: vi.fn() })).toBe('kakao');
    expect(sendDefault).toHaveBeenCalledTimes(1);
  });

  it('복사까지 실패하면 failed (성공으로 위장하지 않음)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const copy = vi.fn(async () => {
      throw new Error('denied');
    });
    expect(await shareViaKakaoOrCopy({ kakao: null, input, copy })).toBe('failed');
    spy.mockRestore();
  });

  it('feed payload 구조 + 설명 80자 클립', () => {
    const p = buildKakaoFeedPayload(input) as { objectType: string; buttons: { title: string }[] };
    expect(p.objectType).toBe('feed');
    expect(p.buttons[0].title).toBe('매거진 보기');
    expect(clipDescription('가'.repeat(100), 80).length).toBe(80);
    expect(clipDescription('짧은 설명')).toBe('짧은 설명');
  });
});
