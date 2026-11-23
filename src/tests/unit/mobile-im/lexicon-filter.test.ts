import { describe, it, expect } from 'vitest';
import { applyLexiconFilter } from '@/domain/building/mobile-im/presentation/cre-lexicon-filter';

describe('CRE Lexicon Filter (PR-B2-02 / Negative-Pair Obligation)', () => {
  it('Positive Pair: Inappropriate transliterations are replaced with standard Korean CRE terms', async () => {
    const raw = '해당 자산은 캡레이트 5.2%에 네이밍 라이츠 획득이 가능합니다.';
    const result = applyLexiconFilter(raw);

    expect(result.filteredText).toContain('연 순수익률 (Cap Rate)');
    expect(result.filteredText).toContain('사옥 단독 명칭 표기(간판 설치권)');
    expect(result.violations.length).toBe(0);
  });

  it('Negative Pair: Hollow exaggerated modifiers trigger explicit lexicon violations', async () => {
    const raw = '압도적 입지의 프라임 빌딩으로 무조건 시세차익 가능';
    const result = applyLexiconFilter(raw);

    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain('공허한 과장 수식어 금지');
  });

  it('Negative Pair (A6-01): Stock dividend jargon ("배당", "배당수익률") triggers violation and normalizes to CRE income copy', () => {
    const first = applyLexiconFilter('월 5,950만원 안정적 배당 소득 및 연 4.5% 배당수익률 기대');
    expect(first.violations.length).toBeGreaterThan(0);
    expect(first.filteredText).not.toContain('배당');
    expect(first.filteredText).toContain('임대수익률');
    expect(first.filteredText).toContain('임대수익');

    // Repeated call stays stateless (no /g lastIndex drift)
    const second = applyLexiconFilter('안정 배당 매물');
    expect(second.violations.length).toBeGreaterThan(0);
    expect(second.filteredText).toBe('안정 임대수익 매물');
  });
});
