// @vitest-environment jsdom
/**
 * @file src/tests/workspace/ux-foundation.test.ts
 * @description 공용 UX 기반: 상대시간 · 정직한 복사 · 카카오 공유 폴백
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatRelativeKo, SAVE_STATE_LABELS } from '@/lib/ux/lexicon';
import { copyText } from '@/lib/ux/clipboard';
import { shareKakaoFeed } from '@/lib/kakao/share';

describe('formatRelativeKo', () => {
  const now = new Date('2026-11-08T12:00:00+09:00').getTime();
  it('renders truthful relative time', () => {
    expect(formatRelativeKo(now - 10_000, now)).toBe('방금');
    expect(formatRelativeKo(now - 5 * 60_000, now)).toBe('5분 전');
    expect(formatRelativeKo(now - 3 * 3_600_000, now)).toBe('3시간 전');
    expect(formatRelativeKo(now - 30 * 3_600_000, now)).toBe('어제');
    expect(formatRelativeKo(now - 4 * 86_400_000, now)).toBe('4일 전');
    expect(formatRelativeKo(null, now)).toBe('');
  });
  it('save labels are plain Korean', () => {
    expect(SAVE_STATE_LABELS.saved).toBe('저장됨 ✓');
    expect(SAVE_STATE_LABELS.error).toContain('다시 시도');
  });
});

describe('copyText (honest)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns true only when clipboard write succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await expect(copyText('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('returns false when both clipboard and execCommand fail', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    await expect(copyText('hello')).resolves.toBe(false);
  });
});

describe('shareKakaoFeed', () => {
  afterEach(() => {
    delete (window as unknown as { Kakao?: unknown }).Kakao;
    vi.unstubAllEnvs();
  });

  it('opens Kakao share when SDK is ready', async () => {
    vi.stubEnv('NEXT_PUBLIC_KAKAO_APP_KEY', 'test-key');
    const sendDefault = vi.fn();
    (window as unknown as { Kakao: unknown }).Kakao = {
      isInitialized: () => true,
      init: vi.fn(),
      Share: { sendDefault },
    };
    const r = await shareKakaoFeed({
      title: '연 4.2% 만실 코너',
      imageUrl: 'https://credeal.net/og.png',
      url: 'https://credeal.net/dc/x',
    });
    expect(r).toBe('kakao');
    const arg = sendDefault.mock.calls[0][0];
    expect(arg.content.title).toBe('연 4.2% 만실 코너');
    expect(arg.content.description).toBe('');
    expect(arg.buttons[0].title).toBe('자세히 보기');
  });

  it('falls back to copying when no app key', async () => {
    vi.stubEnv('NEXT_PUBLIC_KAKAO_APP_KEY', '');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const r = await shareKakaoFeed({ title: 't', imageUrl: 'https://x/i.png', url: 'https://x/dc/1' });
    expect(r).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('t\nhttps://x/dc/1');
  });
});
