import { describe, it, expect } from 'vitest';
import { stripLegacyNameMask } from '@/domain/building/mobile-im/guardrails';

describe('D5 stripLegacyNameMask', () => {
  it('레거시 [건물명 비공개] 를 본 자산으로 치환 (모든 발생)', () => {
    expect(stripLegacyNameMask('[건물명 비공개]은 역세권이며 [건물명 비공개]의 규모는'))
      .toBe('본 자산은 역세권이며 본 자산의 규모는');
  });
  it('토큰이 없으면 원문 유지, 빈값은 빈 문자열', () => {
    expect(stripLegacyNameMask('서초동 FM빌딩')).toBe('서초동 FM빌딩');
    expect(stripLegacyNameMask('')).toBe('');
    expect(stripLegacyNameMask(undefined)).toBe('');
    expect(stripLegacyNameMask(null)).toBe('');
  });
  it('다른 가드레일 토큰은 건드리지 않음', () => {
    expect(stripLegacyNameMask('[인명 비공개] 문의')).toBe('[인명 비공개] 문의');
  });
});
