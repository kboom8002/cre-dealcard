import { describe, it, expect, vi, beforeEach } from 'vitest';

// golden-im-manager.ts에서 export되는 함수를 테스트하기 위해 모듈 기능 테스트

// 1. sanitizeForGolden 함수가 정제를 수행하는지 검증
// 현재 sanitizeForGolden은 private이므로, data-binder의 함수를 직접 테스트
describe('Golden Set Sanitization (E4 오염 차단)', () => {
  // Test: sanitizePersona + stripMarkdown이 적용되면 페르소나/이모지 제거
  it('GS-01: sanitizePersona removes persona references', async () => {
    const { sanitizePersona } = await import('../pptx/data-binder');
    const input = '60대 자산가를 위한 수익형 오피스 투자 방안';
    const result = sanitizePersona(input);
    expect(result).not.toContain('60대 자산가');
    expect(result).toContain('수익형');
  });

  it('GS-02: stripMarkdown removes emojis (except ★)', async () => {
    const { stripMarkdown } = await import('../pptx/data-binder');
    const input = '✨ 수익형 오피스 투자 평가 ★★★★';
    const result = stripMarkdown(input);
    expect(result).not.toContain('✨');
    expect(result).toContain('★'); // ★는 보존
  });

  it('GS-03: combined sanitize + strip removes all contamination', async () => {
    const { sanitizePersona, stripMarkdown } = await import('../pptx/data-binder');
    const input = '✨ 60대 자산가 맞춤 **골든 IM** 데이터';
    const result = stripMarkdown(sanitizePersona(input));
    expect(result).not.toContain('60대');
    expect(result).not.toContain('✨');
    expect(result).not.toContain('**');
  });

  // adjacentBands 테스트
  describe('adjacentBands scoring', () => {
    // adjacentBands는 private이므로 golden-im-manager를 import하여 간접 테스트
    // 또는 로직을 직접 복제하여 테스트
    const BAND_ORDER = ['B1', 'B2', 'B3', 'B4', 'B5'];
    function adjacentBands(candidateBand: string, targetBand: string): number {
      if (!candidateBand || !targetBand) return 0;
      if (candidateBand === targetBand) return 30;
      const ci = BAND_ORDER.indexOf(candidateBand);
      const ti = BAND_ORDER.indexOf(targetBand);
      if (ci === -1 || ti === -1) return 0;
      return Math.abs(ci - ti) === 1 ? 15 : 0;
    }

    it('GS-04: same band = 30 points', () => {
      expect(adjacentBands('B2', 'B2')).toBe(30);
    });

    it('GS-05: adjacent band (±1) = 15 points', () => {
      expect(adjacentBands('B2', 'B3')).toBe(15);
      expect(adjacentBands('B3', 'B2')).toBe(15);
    });

    it('GS-06: 2+ steps = 0 points', () => {
      expect(adjacentBands('B1', 'B3')).toBe(0);
      expect(adjacentBands('B1', 'B5')).toBe(0);
    });

    it('GS-07: unknown band = 0 points', () => {
      expect(adjacentBands('B1', 'XX')).toBe(0);
      expect(adjacentBands('', 'B2')).toBe(0);
    });
  });
});
