import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import {
  renderMagazineImage,
  renderNeutralImage,
} from '@/lib/magazine/og-image-response';
import type { ImageModel } from '@/lib/magazine/og-image-data';
import { loadOgFonts, resetOgFontCache } from '@/lib/magazine/og-fonts';

// 이미지 실측 회귀 보호 + 중립 이미지/캐시 헤더 + 로더 실패 처리 (C-04)

const MODEL: ImageModel = {
  date: '2026-10-05',
  dateLabel: '2026.10.05',
  dateKorean: '2026년 10월 5일 (월)',
  headline: 'Weekly CRE market briefing',
  marketTemp: '관망',
  keywords: ['Gangnam', 'Cap rate'],
  themeTitle: 'Value-add opportunities',
  briefing:
    'Transaction volume in central Seoul rose modestly this week while cap rates stayed flat across major submarkets.',
  brokerName: 'Test Broker',
  company: 'Test Realty',
  phone: '010-1234-5678',
  regions: ['Gangnam'],
  stats: [{ label: 'Active deals', value: '3', accent: 'indigo' }],
  deals: [{ title: 'Yeoksam building', address: '서울 강남구 역삼동' }],
};

async function dims(res: Response) {
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  return { w: meta.width, h: meta.height, format: meta.format, bytes: buf.length };
}

describe('이미지 응답: 크기 실측 (og 1200×630, story 1080×1920, card 1080×1080)', () => {
  it.each([
    ['og', 1200, 630],
    ['story', 1080, 1920],
    ['card', 1080, 1080],
  ] as const)('%s 발행본 이미지 = %d×%d PNG', async (format, w, h) => {
    const res = await renderMagazineImage({
      format,
      brokerId: 'test-broker-kim',
      date: '2026-10-05',
      loadModel: async () => MODEL,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
    const d = await dims(res);
    expect(d).toMatchObject({ w, h, format: 'png' });
  }, 30_000);

  it.each([
    ['og', 1200, 630],
    ['story', 1080, 1920],
    ['card', 1080, 1080],
  ] as const)('%s 중립 이미지도 같은 크기', async (format, w, h) => {
    const res = await renderNeutralImage(format);
    const d = await dims(res);
    expect(d).toMatchObject({ w, h });
  }, 30_000);
});

describe('이미지 응답: Cache-Control (함정 #14)', () => {
  it('발행본 이미지: 5분 브라우저/1시간 CDN/swr 1일, immutable 아님', async () => {
    const res = await renderMagazineImage({
      format: 'og',
      brokerId: 'test-broker-kim',
      date: '2026-10-05',
      loadModel: async () => MODEL,
    });
    const cc = res.headers.get('cache-control') ?? '';
    expect(cc).toBe('public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    expect(cc).not.toContain('immutable');
  }, 30_000);

  it('미발행(null) → 중립 이미지 200 + 짧은 캐시 (가짜 브로커 없음)', async () => {
    const res = await renderMagazineImage({
      format: 'og',
      brokerId: 'test-broker-kim',
      date: '2026-10-05',
      loadModel: async () => null,
    });
    expect(res.status).toBe(200);
    const cc = res.headers.get('cache-control') ?? '';
    expect(cc).toContain('max-age=60');
    expect(cc).not.toContain('immutable');
    expect((await dims(res)).w).toBe(1200);
  }, 30_000);

  it('조회 오류 → 중립 이미지 + no-store (실패를 캐시하지 않음)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await renderMagazineImage({
      format: 'card',
      brokerId: 'test-broker-kim',
      date: '2026-10-05',
      loadModel: async () => {
        throw new Error('db down');
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((await dims(res)).w).toBe(1080);
    spy.mockRestore();
  }, 30_000);

  it('파라미터 오류용 중립 이미지: status 400 + no-store', async () => {
    const res = await renderNeutralImage('story', { status: 400, cacheControl: 'no-store' });
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((await dims(res)).h).toBe(1920);
  }, 30_000);
});

describe('이미지 응답: 한글 데이터도 렌더 실패하지 않음 (폰트 부재 시 영문/숫자만)', () => {
  it('한글 제목·브로커명이 있어도 PNG 를 반환', async () => {
    const res = await renderMagazineImage({
      format: 'story',
      brokerId: 'test-broker-kim',
      date: '2026-10-05',
      loadModel: async () => ({
        ...MODEL,
        headline: '10월 첫째 주 강남 시장 브리핑 CRE',
        brokerName: '김중개',
        briefing: '이번 주 서울 상업용 부동산 거래가 소폭 증가했습니다.',
      }),
    });
    expect(res.status).toBe(200);
    expect(await dims(res)).toMatchObject({ w: 1080, h: 1920, format: 'png' });
  }, 30_000);

  it('번들 폰트(public/fonts)가 있으면 hasKorean=true — 한글이 제거되지 않고 렌더된다', async () => {
    const { existsSync } = await import('fs');
    const nodePath = await import('path');
    const bundled = existsSync(nodePath.join(process.cwd(), 'public', 'fonts', 'NotoSansKR-Regular.woff'));
    delete process.env.MAGAZINE_OG_FONT_PATH;
    resetOgFontCache();
    const loaded = await loadOgFonts();
    if (bundled) {
      expect(loaded.hasKorean).toBe(true);
      expect(loaded.fonts.length).toBeGreaterThanOrEqual(2);
    }
    const res = await renderMagazineImage({
      format: 'og',
      brokerId: 'test-broker-kim',
      date: '2026-09-30',
      loadModel: async () => ({ ...MODEL, headline: '2026년 9월 시장 점검 9.4%', brokerName: '김중개' }),
    });
    expect(res.status).toBe(200);
    expect(await dims(res)).toMatchObject({ w: 1200, h: 630, format: 'png' });
  }, 60_000);
});
