import { describe, test, expect } from 'vitest';
import { 
  TEXT_LIMITS, 
  charsPerLine, 
  calcCalloutHeight, 
  truncateText, 
  enforceTextBudget, 
  validateTextBudgets 
} from '@/domain/building/mobile-im/pptx/text-budget';

describe('T05: Text Budget Overflow', () => {

  describe('Section A: TEXT_LIMITS contract', () => {
    test('T05-A01: TEXT_LIMITS has all required keys', () => {
      expect(TEXT_LIMITS).toHaveProperty('slideTitle');
      expect(TEXT_LIMITS).toHaveProperty('kicker');
      expect(TEXT_LIMITS).toHaveProperty('subTitle');
      expect(TEXT_LIMITS).toHaveProperty('leadSentence');
      expect(TEXT_LIMITS).toHaveProperty('subHeading');
      expect(TEXT_LIMITS).toHaveProperty('statLabel');
      expect(TEXT_LIMITS).toHaveProperty('statValue');
      expect(TEXT_LIMITS).toHaveProperty('statSub');
      expect(TEXT_LIMITS).toHaveProperty('calloutTitle');
      expect(TEXT_LIMITS).toHaveProperty('tableHeader');
      expect(TEXT_LIMITS).toHaveProperty('tableCell');
      expect(TEXT_LIMITS).toHaveProperty('note');
    });

    test('T05-A02: All limits are positive integers', () => {
      Object.values(TEXT_LIMITS).forEach(limit => {
        expect(Number.isInteger(limit)).toBe(true);
        expect(limit).toBeGreaterThan(0);
      });
    });
  });

  describe('Section B: charsPerLine', () => {
    test('T05-B01: Standard CW=12.093 -> returns reasonable value (around 61)', () => {
      const chars = charsPerLine(12.093);
      expect(chars).toBeGreaterThanOrEqual(60);
      expect(chars).toBeLessThanOrEqual(65);
    });

    test('T05-B02: Very narrow box (1.0 inch) -> returns positive value >= 3', () => {
      const chars = charsPerLine(1.0);
      expect(chars).toBeGreaterThanOrEqual(3);
    });

    test('T05-B03: Zero-width box (0.36 inch = margins only) -> returns 0 or positive', () => {
      const chars = charsPerLine(0.36);
      expect(chars).toBeGreaterThanOrEqual(0);
    });

    test('T05-B04: Wide box (20 inches) -> returns proportionally larger value', () => {
      const chars = charsPerLine(20);
      expect(chars).toBeGreaterThan(100);
    });
  });

  describe('Section C: calcCalloutHeight', () => {
    test('T05-C01: Short text (10 chars), standard width -> returns base height ~0.84', () => {
      const height = calcCalloutHeight('가나다라마바사아자차', 12.093);
      expect(height).toBeCloseTo(0.84);
    });

    test('T05-C02: Long text (500 chars), standard width -> returns proportionally larger height', () => {
      const height = calcCalloutHeight('가'.repeat(500), 12.093);
      expect(height).toBeGreaterThan(2.0);
    });

    test('T05-C03: Empty text -> returns base height (0 lines = 0.55)', () => {
      const height = calcCalloutHeight('', 12.093);
      // empty text → Math.ceil(0 / charsPerLine) = 0 lines → 0.55 + 0 * 0.29 = 0.55
      expect(height).toBeCloseTo(0.55);
    });
  });

  describe('Section D: truncateText', () => {
    test('T05-D01: Text within limit -> returns unchanged', () => {
      expect(truncateText('Hello', 10)).toBe('Hello');
    });

    test('T05-D02: Text exceeding limit -> truncated with "..."', () => {
      expect(truncateText('Hello World', 8)).toBe('Hello...');
    });

    test('T05-D03: Text exactly at limit -> returns unchanged', () => {
      expect(truncateText('Hello', 5)).toBe('Hello');
    });

    test('T05-D04: Text at limit+1 -> truncated', () => {
      expect(truncateText('Hello!', 5)).toBe('He...');
    });
  });

  describe('Section E: enforceTextBudget (Korean sentence boundary)', () => {
    test('T05-E01: Text within budget -> returns unchanged', () => {
      expect(enforceTextBudget('안녕하세요.', 20)).toBe('안녕하세요.');
    });

    test('T05-E02: Korean text exceeding budget, no sentence break after 60% -> ellipsis fallback', () => {
      // "다. " is at index ~3 which is < 60% of 20=12, so lastPeriod check fails → trim + "…"
      const text = '그렇다. 그리고 여기서부터 문장이 아주 길어집니다.';
      const res = enforceTextBudget(text, 20);
      // slice(0,20).trimEnd() + "…"
      expect(res.endsWith('…')).toBe(true);
      expect(res.length).toBeLessThanOrEqual(21); // 20 chars + ellipsis
    });

    test('T05-E03: Korean text exceeding budget, has sentence break after 60% -> cuts at boundary', () => {
      // Build a text where the sentence break ("다. ") appears after the 60% point of maxLen
      const text = '이것은 매우 훌륭하고 투자가치가 높은 건물입니다. 하지만 리스크도 있습니다.';
      // len=37, maxLen=35, 60%=21, "입니다. " is at ~25 (> 21) → should cut there
      const res = enforceTextBudget(text, 35);
      // Either cuts at sentence boundary or falls back to ellipsis
      expect(res.length).toBeLessThanOrEqual(36);
      expect(res).not.toContain('리스크도 있습니다');
    });

    test('T05-E04: Korean text with "요. " ending -> handles correctly', () => {
      const text = '이 건물은 입지가 매우 좋아요. 추가로 매수를 강력히 추천합니다.';
      // len=31, maxLen=28, 60%=16.8, "좋아요. " is at ~14 (< 16.8) → ellipsis fallback
      const res = enforceTextBudget(text, 28);
      expect(res.length).toBeLessThanOrEqual(29);
      expect(res.endsWith('…') || res.endsWith('.')).toBe(true);
    });

    test('T05-E05: Korean text with "음. " ending -> handles correctly', () => {
      const text = '수익률이 매우 높음. 따라서 빠르게 매수해야 합니다.';
      // len=25, maxLen=20, 60%=12, "높음. " is at ~9 (< 12) → ellipsis fallback  
      const res = enforceTextBudget(text, 20);
      expect(res.length).toBeLessThanOrEqual(21);
      expect(res.endsWith('…') || res.endsWith('.')).toBe(true);
    });

    test('T05-E06: Empty text -> returns empty', () => {
      expect(enforceTextBudget('', 10)).toBe('');
    });

    test('T05-E07: undefined/null input -> returns as-is (falsy check)', () => {
      expect(enforceTextBudget(undefined as any, 10)).toBeUndefined();
      expect(enforceTextBudget(null as any, 10)).toBeNull();
    });
  });

  describe('Section F: validateTextBudgets', () => {
    test('T05-F01: All texts within limits -> returns empty warnings array', () => {
      const warnings = validateTextBudgets([
        { type: 'slideTitle', text: 'Short Title' },
        { type: 'kicker', text: 'Short Kicker' }
      ]);
      expect(warnings).toHaveLength(0);
    });

    test('T05-F02: slideTitle exceeding 32 chars -> returns warning', () => {
      const texts = [{ type: 'slideTitle', text: '이것은 아주 긴 슬라이드 제목입니다. 서른 두 글자를 훌쩍 넘어가도록 작성해보겠습니다.' }];
      const warnings = validateTextBudgets(texts);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/Text budget exceeded for slideTitle/);
    });

    test('T05-F03: statValue exceeding 10 chars -> returns warning', () => {
      const warnings = validateTextBudgets([
        { type: 'statValue', text: '12345678901' }
      ]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/Text budget exceeded for statValue/);
    });

    test('T05-F04: Unknown type key -> no warning (no limit defined)', () => {
      const warnings = validateTextBudgets([
        { type: 'unknownKey', text: 'A very long text that would exceed normal limits ' + 'a'.repeat(100) }
      ]);
      expect(warnings).toHaveLength(0);
    });

    test('T05-F05: Multiple exceeded items -> returns multiple warnings', () => {
      const warnings = validateTextBudgets([
        { type: 'statValue', text: '12345678901' },
        { type: 'slideTitle', text: '이것은 아주 긴 슬라이드 제목입니다. 서른 두 글자를 훌쩍 넘어가도록 작성해보겠습니다.' }
      ]);
      expect(warnings).toHaveLength(2);
    });
  });
});
