import { describe, it, expect } from 'vitest';
import {
  formatPriceRange,
  formatPriceRangeTooltip,
  formatKrw,
  parseLegacyBand,
} from '@/lib/deal-card/price-band';

describe('WP-P1-01: Price Band & Currency SSOT', () => {
  describe('formatPriceRange', () => {
    it('formats 95억 strictly as "90~100억" (spec §2 Edge Case 4)', () => {
      const result = formatPriceRange(95 * 1_0000_0000);
      expect(result).toBe('90~100억');
    });

    it('tooltip for 95억 reads "90억 이상 100억 미만"', () => {
      const tooltip = formatPriceRangeTooltip(95 * 1_0000_0000);
      expect(tooltip).toBe('90억 이상 100억 미만');
    });

    it('bans decimal eok: never outputs decimal like "1.5억"', () => {
      // 1.5억 = 1억 5000만
      const formatted = formatKrw(1_5000_0000);
      expect(formatted).not.toContain('1.5억');
      expect(formatted).toBe('1억 5,000만');
    });

    it('handles under 30억 with 5억 bandwidth', () => {
      // 23억 -> 20~25억
      expect(formatPriceRange(23 * 1_0000_0000)).toBe('20~25억');
      expect(formatPriceRange(7 * 1_0000_0000)).toBe('5~10억');
    });

    it('handles 100~300억 with 20억 bandwidth', () => {
      // 150억 -> 140~160억
      expect(formatPriceRange(150 * 1_0000_0000)).toBe('140~160억');
      // 110억 -> 100~120억
      expect(formatPriceRange(110 * 1_0000_0000)).toBe('100~120억');
    });

    it('handles 300억+ with 50억 bandwidth', () => {
      // 320억 -> 300~350억
      expect(formatPriceRange(320 * 1_0000_0000)).toBe('300~350억');
    });

    it('handles coarse bandwidth when requested', () => {
      // 75억 in coarse -> 20억 bandwidth -> 60~80억
      expect(formatPriceRange(75 * 1_0000_0000, 'coarse')).toBe('60~80억');
    });

    it('returns "가격 협의" for 0, negative, NaN or missing amounts', () => {
      expect(formatPriceRange(0)).toBe('가격 협의');
      expect(formatPriceRange(-5000)).toBe('가격 협의');
      expect(formatPriceRange(NaN)).toBe('가격 협의');
    });
  });

  describe('formatKrw', () => {
    it('formats exact numbers with 억 and 만 units and zero omission', () => {
      expect(formatKrw(100 * 1_0000_0000)).toBe('100억');
      expect(formatKrw(105 * 1_0000_0000)).toBe('105억');
      expect(formatKrw(5000_0000)).toBe('5,000만');
      expect(formatKrw(0)).toBe('0원');
    });

    it('formats composite amounts with 억 and 만 correctly', () => {
      // 12억 3,400만
      expect(formatKrw(12_3400_0000)).toBe('12억 3,400만');
    });

    it('handles negative amounts', () => {
      expect(formatKrw(-5000_0000)).toBe('-5,000만');
    });
  });

  describe('parseLegacyBand', () => {
    it('parses "90억대" correctly into [90억, 100억] range (spec §2 Edge Case 5)', () => {
      const parsed = parseLegacyBand('90억대');
      expect(parsed.minKrw).toBe(90 * 1_0000_0000);
      expect(parsed.maxKrw).toBe(100 * 1_0000_0000);
      expect(parsed.label).toBe('90~100억');
    });

    it('parses range strings like "50~60억원대" and "50~60억"', () => {
      const parsed1 = parseLegacyBand('50~60억원대');
      expect(parsed1.minKrw).toBe(50 * 1_0000_0000);
      expect(parsed1.maxKrw).toBe(60 * 1_0000_0000);
      expect(parsed1.label).toBe('50~60억');

      const parsed2 = parseLegacyBand('50-60억');
      expect(parsed2.minKrw).toBe(50 * 1_0000_0000);
      expect(parsed2.maxKrw).toBe(60 * 1_0000_0000);
    });

    it('parses "100억 이상"', () => {
      const parsed = parseLegacyBand('100억 이상');
      expect(parsed.minKrw).toBe(100 * 1_0000_0000);
      expect(parsed.label).toBe('100억 이상');
    });

    it('parses "30억 미만"', () => {
      const parsed = parseLegacyBand('30억 미만');
      expect(parsed.minKrw).toBe(0);
      expect(parsed.maxKrw).toBe(30 * 1_0000_0000);
      expect(parsed.label).toBe('30억 미만');
    });

    it('never throws runtime error on unparseable or empty input', () => {
      expect(() => parseLegacyBand('')).not.toThrow();
      expect(() => parseLegacyBand(null)).not.toThrow();
      expect(() => parseLegacyBand(undefined)).not.toThrow();
      expect(() => parseLegacyBand('가격 협의')).not.toThrow();
      expect(() => parseLegacyBand('특수물건 상담요망')).not.toThrow();

      const empty = parseLegacyBand('');
      expect(empty.label).toBe('가격 협의');
      expect(empty.minKrw).toBe(0);
    });
  });
});
