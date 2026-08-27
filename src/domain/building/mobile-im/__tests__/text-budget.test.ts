import { describe, test, expect, vi } from 'vitest';
import { 
  enforceTextBudget, 
  enforceTextBudgetWithMeta, 
  validateTextBudgets, 
  TEXT_LIMITS 
} from '../pptx/text-budget';

describe('text-budget', () => {
  describe('enforceTextBudget', () => {
    test('제한을 초과하는 텍스트를 "..." 또는 "…"으로 자른다', () => {
      const text = '이 문장은 매우 길어서 텍스트 예산 제한을 초과하게 됩니다. 따라서 중간에 잘리게 됩니다.';
      const maxLen = 20;
      const result = enforceTextBudget(text, maxLen);
      expect(result.length).toBeLessThanOrEqual(maxLen + 3); // ... 포함 고려
      expect(result.endsWith('…') || result.endsWith('...')).toBe(true);
    });

    test('제한 이내의 텍스트는 그대로 유지한다', () => {
      const text = '짧은 문장입니다.';
      const result = enforceTextBudget(text, 50);
      expect(result).toBe(text);
    });
  });

  describe('enforceTextBudgetWithMeta', () => {
    test('정확한 TextBudgetResult(wasTruncated, originalLength, truncatedLength)를 반환한다', () => {
      const text = '이 문장은 잘려야 하는 긴 문장입니다. 확실히 잘리도록 아주 길게 작성합니다.';
      const result = enforceTextBudgetWithMeta(text, 10);
      
      expect(result.wasTruncated).toBe(true);
      expect(result.originalLength).toBe(text.length);
      expect(result.truncatedLength).toBe(result.text.length);
      expect(result.text).not.toBe(text);
    });

    test('잘리지 않는 경우 wasTruncated가 false이다', () => {
      const text = '짧은 문장';
      const result = enforceTextBudgetWithMeta(text, 100);
      
      expect(result.wasTruncated).toBe(false);
      expect(result.originalLength).toBe(text.length);
      expect(result.text).toBe(text);
    });
  });

  describe('TEXT_LIMITS', () => {
    test('각 TEXT_LIMITS 키는 정의된 제한값을 가진다', () => {
      expect(TEXT_LIMITS).toHaveProperty('slideTitle');
      expect(TEXT_LIMITS).toHaveProperty('subTitle');
      expect(TEXT_LIMITS).toHaveProperty('leadSentence');
      expect(typeof TEXT_LIMITS.slideTitle).toBe('number');
      expect(TEXT_LIMITS.slideTitle).toBeGreaterThan(0);
    });
  });

  describe('validateTextBudgets', () => {
    test('제한을 초과하는 필드에 대해 경고를 반환한다', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const inputs = [
        { type: 'slideTitle', text: '이 제목은 스물네 글자를 훌쩍 넘어 삼십이 글자도 넘도록 아주 길게 길게 작성되었습니다.' },
        { type: 'statValue', text: '정상값' }
      ];
      
      const warnings = validateTextBudgets(inputs);
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('budget exceeded for slideTitle');
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
});
