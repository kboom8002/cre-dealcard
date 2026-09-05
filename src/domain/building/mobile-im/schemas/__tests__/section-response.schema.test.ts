import { describe, it, expect } from 'vitest';
import { safeParseSectionResponse, safeParseDealCardFacts } from '../index';
import { isOk, isErr } from '@/domain/shared/result';

describe('mobile-im schemas (P2-1)', () => {
  describe('safeParseSectionResponse', () => {
    it('successfully parses valid section output with defaults', () => {
      const raw = {
        title: '물건 개요',
        markdown: '# 물건 개요\n본건은 강남역 도보 3분 거리입니다.',
        confidence: 'confirmed',
        keyFacts: ['연면적 1,000평'],
      };
      const res = safeParseSectionResponse(raw);
      expect(isOk(res)).toBe(true);
      if (isOk(res)) {
        expect(res.value.title).toBe('물건 개요');
        expect(res.value.confidence).toBe('confirmed');
        expect(res.value.metrics).toEqual({});
        expect(res.value.minTier).toBe('public');
      }
    });

    it('fails when markdown is empty or invalid (negative pair)', () => {
      const emptyMarkdown = {
        title: '빈 섹션',
        markdown: '',
      };
      const resEmpty = safeParseSectionResponse(emptyMarkdown);
      expect(isErr(resEmpty)).toBe(true);
      if (isErr(resEmpty)) {
        expect(resEmpty.error).toContain('cannot be empty');
      }

      const nonObject = 'invalid string input';
      const resNonObj = safeParseSectionResponse(nonObject);
      expect(isErr(resNonObj)).toBe(true);
    });

    it('rejects invalid confidence levels (negative pair)', () => {
      const invalidConf = {
        markdown: '일반 텍스트',
        confidence: 'super_high_invalid',
      };
      const res = safeParseSectionResponse(invalidConf);
      expect(isErr(res)).toBe(true);
    });
  });

  describe('safeParseDealCardFacts', () => {
    it('successfully parses valid building facts', () => {
      const raw = {
        buildingName: '테스트 타워',
        askingPriceKrw: 10_000_000_000,
        totalAreaSqm: 2500,
        capRatePct: 4.5,
        majorTenants: ['스타벅스', '신한은행'],
      };
      const res = safeParseDealCardFacts(raw);
      expect(isOk(res)).toBe(true);
      if (isOk(res)) {
        expect(res.value.buildingName).toBe('테스트 타워');
        expect(res.value.majorTenants).toHaveLength(2);
        expect(res.value.hospitalitySignals).toEqual([]);
      }
    });

    it('rejects negative asking price and out of bound cap rates (negative pair)', () => {
      const invalidFacts = {
        askingPriceKrw: -500,
        capRatePct: 150, // exceeds max 100
      };
      const res = safeParseDealCardFacts(invalidFacts);
      expect(isErr(res)).toBe(true);
      if (isErr(res)) {
        expect(res.error).toMatch(/askingPriceKrw|capRatePct/);
      }
    });
  });
});
