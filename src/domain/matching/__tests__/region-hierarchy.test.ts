import { describe, test, expect } from 'vitest';
import { matchRegion } from '../region-hierarchy';
import { runHardFilter } from '../matching-engine';

describe('Region Hierarchy Matching (P0-1)', () => {
  test('Scenario 1: "성수동" property vs "성동구" preferred buyer -> Match (Dong ⊂ Gu)', () => {
    const res = matchRegion('성수동', ['성동구']);
    expect(res.matched).toBe(true);
    expect(res.matchedRegion).toBe('성동구');
    expect(res.matchType).toBe('hierarchy');
  });

  test('Scenario 2: "강남구" property vs "서울" preferred buyer -> Match (Gu ⊂ City)', () => {
    const res = matchRegion('강남구', ['서울']);
    expect(res.matched).toBe(true);
    expect(res.matchedRegion).toBe('서울');
    expect(res.matchType).toBe('hierarchy');
  });

  test('Scenario 3: "성수동" property vs "강남구" preferred buyer -> No Match', () => {
    const res = matchRegion('성수동', ['강남구']);
    expect(res.matched).toBe(false);
  });

  test('Scenario 4: "성수" property vs "성수동" preferred buyer -> Match (Fuzzy/Partial)', () => {
    const res = matchRegion('성수', ['성수동']);
    expect(res.matched).toBe(true);
    expect(res.matchedRegion).toBe('성수동');
    expect(res.matchType).toBe('fuzzy');
  });

  test('Scenario 5: "서울특별시 성동구 성수동" property vs "성동" preferred buyer -> Match (Token match)', () => {
    const res = matchRegion('서울특별시 성동구 성수동', ['성동']);
    expect(res.matched).toBe(true);
    expect(res.matchedRegion).toBe('성동');
    expect(res.matchType).toBe('exact');
  });

  test('Scenario 6: "마포구" property vs "마포" preferred buyer -> Match (Abbreviation exact)', () => {
    const res = matchRegion('마포구', ['마포']);
    expect(res.matched).toBe(true);
    expect(res.matchedRegion).toBe('마포');
    expect(res.matchType).toBe('exact');
  });

  test('Scenario 7: Empty preferred regions vs any property area -> No Match', () => {
    const res = matchRegion('성수동', []);
    expect(res.matched).toBe(false);
  });

  test('Scenario 8: Property area matches any one of multiple preferred regions -> Match', () => {
    const res1 = matchRegion('성수동', ['강남구', '성동구']);
    expect(res1.matched).toBe(true);
    expect(res1.matchedRegion).toBe('성동구');

    const res2 = matchRegion('역삼동', ['강남구', '성동구']);
    expect(res2.matched).toBe(true);
    expect(res2.matchedRegion).toBe('강남구');
  });

  test('Scenario 8.5: Complex full address match against a list of regions', () => {
    const res = matchRegion('서울특별시 마포구 서교동 360-1', ['마포구', '용산구']);
    expect(res.matched).toBe(true);
    expect(res.matchedRegion).toBe('마포구');
  });
});

describe('matching-engine runHardFilter integration (P0-1)', () => {

  test('Should pass Region hard filter when property is "성수동" and preferred is "성동구"', () => {
    const input = {
      buildingSsotLiteId: 'building-id',
      buyerIntentLiteId: 'intent-id',
      brokerId: 'broker-id',
      building: {
        areaSignal: '성수동',
        assetType: '근생 건물',
        priceBand: '80억대',
        vacancySignal: null,
        fitSummary: 'Summary',
        cautionSummary: 'Caution',
      },
      intent: {
        buyerType: 'Individual',
        budgetRange: { min: 7000000000, max: 9000000000, display: '70억~90억' },
        preferredRegions: ['성동구'],
        assetTypes: [], // ignore asset types for this test
        purchasePurpose: 'Investment',
        mustHave: [],
        niceToHave: [],
        riskTolerance: 'medium',
      },
    };

    const res = runHardFilter(input);
    expect(res.passed).toBe(true);
    expect(res.failReasons.length).toBe(0);
  });

  test('Should fail Region hard filter when property is "성수동" and preferred is "강남구"', () => {
    const input = {
      buildingSsotLiteId: 'building-id',
      buyerIntentLiteId: 'intent-id',
      brokerId: 'broker-id',
      building: {
        areaSignal: '성수동',
        assetType: '근생 건물',
        priceBand: '80억대',
        vacancySignal: null,
        fitSummary: 'Summary',
        cautionSummary: 'Caution',
      },
      intent: {
        buyerType: 'Individual',
        budgetRange: { min: 7000000000, max: 9000000000, display: '70억~90억' },
        preferredRegions: ['강남구'],
        assetTypes: [],
        purchasePurpose: 'Investment',
        mustHave: [],
        niceToHave: [],
        riskTolerance: 'medium',
      },
    };

    const res = runHardFilter(input);
    expect(res.passed).toBe(false);
    expect(res.failReasons.some(r => r.includes('지역 불일치'))).toBe(true);
  });
});

