import { describe, it, expect } from 'vitest';
import { applyLexiconFilter } from '@/domain/building/mobile-im/presentation/cre-lexicon-filter';

describe('CRE Lexicon Filter (PR-B2-02 / Negative-Pair Obligation)', () => {
  it('Positive Pair: Inappropriate transliterations are replaced with standard Korean CRE terms', () => {
    const raw = '해당 자산은 캡레이트 5.2%에 네이밍 라이츠 획득이 가능합니다.';
    const result = applyLexiconFilter(raw);

    expect(result.filteredText).toContain('연 순수익률 (Cap Rate)');
    expect(result.filteredText).toContain('사옥 단독 명칭 표기(간판 설치권)');
    expect(result.violations.length).toBe(0);
  });

  it('Negative Pair: Hollow exaggerated modifiers trigger explicit lexicon violations', () => {
    const raw = '압도적 입지의 프라임 빌딩으로 무조건 시세차익 가능';
    const result = applyLexiconFilter(raw);

    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain('공허한 과장 수식어 금지');
  });
});
