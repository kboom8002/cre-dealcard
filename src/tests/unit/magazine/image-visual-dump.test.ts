import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { renderMagazineImage, renderNeutralImage } from '@/lib/magazine/og-image-response';
import { resetOgFontCache, loadOgFonts } from '@/lib/magazine/og-fonts';

/**
 * 시각 확인용 덤프 (기본 skip).
 *   $env:MAGAZINE_RENDER_DUMP_DIR='<dir>'; $env:MAGAZINE_OG_FONT_PATH='<ttf>'; npx vitest run src/tests/unit/magazine/image-visual-dump
 * 폰트 번들 전/후 한글 렌더 결과를 사람이 눈으로 확인할 때 쓴다.
 */
const DIR = process.env.MAGAZINE_RENDER_DUMP_DIR;

describe.runIf(!!DIR)('이미지 시각 덤프', () => {
  it('og/story/card + 중립 이미지를 PNG 로 저장', async () => {
    resetOgFontCache();
    const fonts = await loadOgFonts();
    mkdirSync(DIR!, { recursive: true });
    const model = {
      date: '2026-10-05',
      dateLabel: '2026.10.05',
      dateKorean: '2026년 10월 5일 (월)',
      headline: '10월 첫째 주 강남 꼬마빌딩 시장 브리핑',
      marketTemp: '관망' as const,
      keywords: ['강남', '캡레이트', '금리'],
      themeTitle: '역세권 밸류애드 기회',
      briefing:
        '이번 주 서울 상업용 부동산 거래가 소폭 증가했습니다. 강남권 꼬마빌딩 문의가 늘었고 금리는 보합권을 유지했습니다.',
      brokerName: '김중개',
      company: '테스트부동산',
      phone: '010-1234-5678',
      regions: ['강남'],
      stats: [{ label: '활성 매물', value: '3건', accent: 'indigo' }],
      deals: [{ title: '역삼 꼬마빌딩', address: '서울 강남구 역삼동' }],
    };
    for (const format of ['og', 'story', 'card'] as const) {
      const res = await renderMagazineImage({
        format,
        brokerId: 'test-broker-kim',
        date: '2026-10-05',
        loadModel: async () => model,
      });
      writeFileSync(path.join(DIR!, `${format}-${fonts.hasKorean ? 'ko' : 'latin'}.png`), Buffer.from(await res.arrayBuffer()));
      const neutral = await renderNeutralImage(format);
      writeFileSync(path.join(DIR!, `${format}-neutral.png`), Buffer.from(await neutral.arrayBuffer()));
    }
    expect(fonts.fonts.length).toBeGreaterThanOrEqual(0);
  }, 120_000);
});
