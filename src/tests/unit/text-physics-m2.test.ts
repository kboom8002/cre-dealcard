import { describe, it, expect } from 'vitest';
import {
  getCharWidthInches,
  simulateTextWrap,
  fitTextToBox,
  fitTableCell,
} from '@/domain/building/mobile-im/pptx/layout-physics';

describe('Milestone M2: Precision TextPhysicsEngine & Zero-Overflow Hardening', () => {

  describe('1. CJK vs Latin Typographic Width Calculations (Rule 7 Positive/Negative Pairs)', () => {
    it('Positive Pair: Exactly matches physical inch constants at 72pt (1pt = 1/72 inch)', () => {
      // 72pt font -> 1em = 1.0 inch
      // CJK characters (Hangul syllables, Hanja, fullwidth) = 1.0 * em
      expect(getCharWidthInches('가', 72)).toBeCloseTo(1.0, 4);
      expect(getCharWidthInches('힣', 72)).toBeCloseTo(1.0, 4);
      expect(getCharWidthInches('漢', 72)).toBeCloseTo(1.0, 4);
      expect(getCharWidthInches('（', 72)).toBeCloseTo(1.0, 4);

      // ASCII uppercase = 0.65 * em
      expect(getCharWidthInches('A', 72)).toBeCloseTo(0.65, 4);
      expect(getCharWidthInches('Z', 72)).toBeCloseTo(0.65, 4);

      // ASCII lowercase / digits = 0.55 * em
      expect(getCharWidthInches('a', 72)).toBeCloseTo(0.55, 4);
      expect(getCharWidthInches('z', 72)).toBeCloseTo(0.55, 4);
      expect(getCharWidthInches('0', 72)).toBeCloseTo(0.55, 4);
      expect(getCharWidthInches('9', 72)).toBeCloseTo(0.55, 4);

      // Space = 0.28 * em
      expect(getCharWidthInches(' ', 72)).toBeCloseTo(0.28, 4);

      // Narrow punctuation (,.:;!|'") = 0.35 * em
      expect(getCharWidthInches(',', 72)).toBeCloseTo(0.35, 4);
      expect(getCharWidthInches('.', 72)).toBeCloseTo(0.35, 4);
      expect(getCharWidthInches(':', 72)).toBeCloseTo(0.35, 4);
      expect(getCharWidthInches('!', 72)).toBeCloseTo(0.35, 4);
      expect(getCharWidthInches('|', 72)).toBeCloseTo(0.35, 4);
    });

    it('Negative Pair: Latin characters are strictly narrower than CJK glyphs, and invalid inputs return 0', () => {
      const cjkWidth = getCharWidthInches('한', 12);
      const latinUpper = getCharWidthInches('H', 12);
      const latinLower = getCharWidthInches('h', 12);
      const space = getCharWidthInches(' ', 12);

      expect(latinUpper).toBeLessThan(cjkWidth);
      expect(latinLower).toBeLessThan(latinUpper);
      expect(space).toBeLessThan(latinLower);

      // Zero or negative font sizes / empty strings return 0
      expect(getCharWidthInches('', 12)).toBe(0);
      expect(getCharWidthInches('가', 0)).toBe(0);
      expect(getCharWidthInches('A', -10)).toBe(0);
    });
  });

  describe('2. Word-Boundary Line Wrapping Simulation', () => {
    it('Positive Pair: Korean word boundaries are preserved with spaces across lines', () => {
      const text = '안정적인 임대 수익을 창출하는 핵심 역세권 프라임 오피스 자산';
      // 3.0 inches at 12pt: each CJK char is 12/72 = 0.1667", ~18 chars per line
      const wrapResult = simulateTextWrap(text, 3.0, 12);

      expect(wrapResult.lines.length).toBeGreaterThanOrEqual(2);
      // Verify words are not split mid-word when they fit on the next line
      const words = text.split(' ');
      const reconstructedWords = wrapResult.lines.flatMap(l => l.split(' '));
      expect(reconstructedWords).toEqual(words);

      for (const line of wrapResult.lines) {
        expect(line.trim().length).toBeGreaterThan(0);
      }
    });

    it('Negative Pair: Single word exceeding line width gracefully splits character-by-character without crashing', () => {
      const longSingleWord = '주식회사대한글로벌엔터프라이즈인베스트먼트코리아부동산자산관리신탁';
      // Narrow width (1.5 inches at 12pt can only hold ~9 CJK characters)
      const wrapResult = simulateTextWrap(longSingleWord, 1.5, 12);

      // Must be broken into multiple lines rather than overflowing a single line
      expect(wrapResult.lines.length).toBeGreaterThanOrEqual(4);
      expect(wrapResult.maxLineWidth).toBeLessThanOrEqual(1.5 + 0.01);
      // Rejoining lines without spaces reconstructs the original word exactly
      expect(wrapResult.lines.join('')).toBe(longSingleWord);
    });
  });

  describe('3. Dynamic Font Sizing & Chaining (fitTextToBox)', () => {
    it('Positive Pair: Automatically scales down font size for longer text within box', () => {
      const shortTitle = '투자 하이라이트';
      const longTitle = '강남 테헤란로 핵심 비즈니스 권역 프라임 복합 사옥 매각 투자설명서';

      const shortFit = fitTextToBox(shortTitle, 4.0, 0.44, { minFontSize: 14, maxFontSize: 24, targetLines: 1 });
      const longFit = fitTextToBox(longTitle, 4.0, 0.44, { minFontSize: 14, maxFontSize: 24, targetLines: 1 });

      // Short title stays at max font size
      expect(shortFit.fontSize).toBe(24);
      expect(shortFit.lines.length).toBe(1);
      expect(shortFit.wasTruncated).toBe(false);

      // Long title is dynamically scaled down to fit on 1 line
      expect(longFit.fontSize).toBeLessThan(24);
      expect(longFit.fontSize).toBeGreaterThanOrEqual(14);
      expect(longFit.requiredHeight).toBeLessThanOrEqual(0.44 + 0.01);
    });

    it('Negative Pair: Disallowing truncation causes requiredHeight to exceed boundary when minFontSize is reached', () => {
      const extremelyLongText = '본 자산은 서울특별시 강남구 역삼동 테헤란로 중심권역에 위치한 초우량 오피스 빌딩으로, 유수의 IT 대기업 및 금융기관이 장기 임차 중이며 공실률 0%를 유지하고 있습니다.';

      // Box is only 2.0" wide by 0.35" high (only ~1-2 lines possible)
      // With allowTruncate: false -> wasTruncated must be false, but requiredHeight exceeds box
      const noTrunc = fitTextToBox(extremelyLongText, 2.0, 0.35, {
        minFontSize: 10,
        maxFontSize: 12,
        allowTruncate: false,
      });

      expect(noTrunc.wasTruncated).toBe(false);
      expect(noTrunc.fontSize).toBe(10);
      expect(noTrunc.requiredHeight).toBeGreaterThan(0.35);
      expect(noTrunc.displayText).toBe(extremelyLongText);

      // With allowTruncate: true -> wasTruncated must be true, displayText has '…', and requiredHeight <= 0.35
      const withTrunc = fitTextToBox(extremelyLongText, 2.0, 0.35, {
        minFontSize: 10,
        maxFontSize: 12,
        allowTruncate: true,
      });

      expect(withTrunc.wasTruncated).toBe(true);
      expect(withTrunc.fontSize).toBe(10);
      expect(withTrunc.requiredHeight).toBeLessThanOrEqual(0.35 + 0.01);
      expect(withTrunc.displayText.endsWith('…')).toBe(true);
    });
  });

  describe('4. Table Cell Fitting (fitTableCell) & Row Expansion Prevention', () => {
    it('Positive Pair: Short cell text stays at base font size without truncation', () => {
      const cellResult = fitTableCell('스타벅스', 1.96, 0.24, 8.5);
      expect(cellResult.text).toBe('스타벅스');
      expect(cellResult.fontSize).toBe(8.5);
    });

    it('Negative Pair: Overly long cell text in narrow column scales down to 7.0pt and truncates with ellipsis', () => {
      // 1.10" column at rowH 0.24" can only hold ~8 CJK characters on 1 line
      const longTenant = '주식회사 에이치앤비글로벌파트너스홀딩스';
      const cellResult = fitTableCell(longTenant, 1.10, 0.24, 8.5);

      expect(cellResult.fontSize).toBe(7.0);
      expect(cellResult.text.endsWith('…')).toBe(true);
      expect(cellResult.text.length).toBeLessThan(longTenant.length);

      // Verify that the fitted text physically fits on 1 line within usable width (1.10 - 0.11 = 0.99")
      const sim = simulateTextWrap(cellResult.text, 0.99, cellResult.fontSize);
      expect(sim.lines.length).toBe(1);
    });

    it('Positive Pair: Empty or whitespace cell returns clean empty string', () => {
      const emptyResult = fitTableCell('', 1.5, 0.24, 9.0);
      expect(emptyResult.text).toBe('');
      expect(emptyResult.fontSize).toBe(9.0);
    });
  });

});
