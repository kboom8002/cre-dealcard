import { describe, it, expect } from 'vitest';
import {
  TEXT_LIMITS,
  charsPerLine,
  calcCalloutHeight,
  truncateText,
  enforceTextBudget,
  validateTextBudgets
} from '@/domain/building/mobile-im/pptx/text-budget';

describe('text-budget', () => {
  it('charsPerLine(0) -> 0 or negative (edge)', () => {
    expect(charsPerLine(0)).toBeLessThanOrEqual(0);
  });

  it('charsPerLine(1) -> small positive', () => {
    expect(charsPerLine(1)).toBeGreaterThan(0);
  });

  it('charsPerLine(5) -> reasonable CJK chars per line', () => {
    expect(charsPerLine(5)).toBeGreaterThan(0);
  });

  it('charsPerLine(10) -> wider box', () => {
    expect(charsPerLine(10)).toBeGreaterThan(charsPerLine(5));
  });

  it('calcCalloutHeight(\'\', 5) -> minimum height ~0.55', () => {
    expect(calcCalloutHeight('', 5)).toBeCloseTo(0.55, 1);
  });

  it('calcCalloutHeight taller', () => {
    const text = '가나다라마바사아자차카타파하'.repeat(10);
    expect(calcCalloutHeight(text, 5)).toBeGreaterThan(0.55);
  });

  it('truncateText(\'hello\', 10) -> unchanged', () => {
    expect(truncateText('hello', 10)).toBe('hello');
  });

  it('truncateText(\'hello world test\', 10) -> truncated with ...', () => {
    expect(truncateText('hello world test', 10)).toBe('hello w...');
  });

  it('enforceTextBudget with text < maxLen -> unchanged', () => {
    expect(enforceTextBudget('hello', 10)).toBe('hello');
  });

  it('enforceTextBudget with Korean text > maxLen -> truncates at Korean sentence boundary', () => {
    const longText = '이것은 아주 긴 문장입니다. 그리고 다음 문장입니다. 그런데 또 있습니다. 마지막 문장입니다.';
    const result = enforceTextBudget(longText, 30);
    expect(result.length).toBeLessThan(longText.length);
    expect(result.endsWith('. ')).toBe(false); 
  });

  it('enforceTextBudget with text > maxLen, no sentence boundary -> adds …', () => {
    const longText = '가나다라마바사아자차카타파하'.repeat(10);
    const result = enforceTextBudget(longText, 30);
    expect(result.endsWith('…')).toBe(true);
  });

  it('validateTextBudgets with within-limit text -> empty warnings', () => {
    const result = validateTextBudgets([{ type: 'slideTitle', text: '짧은 제목' }]);
    expect(result).toEqual([]);
  });

  it('validateTextBudgets with exceeded slideTitle -> returns warning', () => {
    const result = validateTextBudgets([{ type: 'slideTitle', text: '가나다라마바사아자차카타파하'.repeat(10) }]);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toContain('slideTitle');
  });

  it('validateTextBudgets with unknown type -> no warning', () => {
    // @ts-ignore
    const result = validateTextBudgets([{ type: 'unknownField', text: '가나다라마바사아자차카타파하'.repeat(10) }]);
    expect(result).toEqual([]);
  });
});
