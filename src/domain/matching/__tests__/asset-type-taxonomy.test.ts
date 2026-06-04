import { describe, test, expect } from 'vitest';
import { matchAssetType } from '../asset-type-taxonomy';
import { runHardFilter } from '../matching-engine';

describe('Asset Type Taxonomy Matching (P0-2)', () => {
  test('Scenario 1: "근생 건물" property vs "꼬마빌딩" preferred buyer -> Match (Synonym)', () => {
    const res = matchAssetType('근생 건물', ['꼬마빌딩']);
    expect(res).toBe(true);
  });

  test('Scenario 2: "근린생활시설" property vs "근생 건물" preferred buyer -> Match (Official ↔ Abbreviation)', () => {
    const res = matchAssetType('근린생활시설', ['근생 건물']);
    expect(res).toBe(true);
  });

  test('Scenario 3: "상가주택" property vs "꼬마빌딩" preferred buyer -> Match (Category Inclusion)', () => {
    const res = matchAssetType('상가주택', ['꼬마빌딩']);
    expect(res).toBe(true);
  });

  test('Scenario 4: "오피스빌딩" property vs "꼬마빌딩" preferred buyer -> No Match', () => {
    const res = matchAssetType('오피스빌딩', ['꼬마빌딩']);
    expect(res).toBe(false);
  });

  test('Scenario 5: "근생" property vs "근린생활시설" preferred buyer -> Match (Abbreviation)', () => {
    const res = matchAssetType('근생', ['근린생활시설']);
    expect(res).toBe(true);
  });

  test('Scenario 6: Empty property type vs "꼬마빌딩" preferred buyer -> No Match', () => {
    const res = matchAssetType('', ['꼬마빌딩']);
    expect(res).toBe(false);
  });

  test('Scenario 7: Exact string match with unrecognized type', () => {
    const res = matchAssetType('특수물건', ['특수물건']);
    expect(res).toBe(true);
  });

  test('Scenario 8: Property asset type matches any one of multiple preferred asset types', () => {
    const res = matchAssetType('오피스빌딩', ['꼬마빌딩', '오피스']);
    expect(res).toBe(true);
  });

  // 목적 기반 크로스 카테고리 매칭 (PURPOSE_CROSS_CATEGORIES)
  test('Scenario 9: "사옥" buyer vs "꼬마빌딩" building → Match (사옥은 꼬마빌딩도 가능)', () => {
    const res = matchAssetType('꼬마빌딩', ['사옥']);
    expect(res).toBe(true);
  });

  test('Scenario 10: "임대" buyer vs "꼬마빌딩" building → Match (임대수익 목적)', () => {
    const res = matchAssetType('꼬마빌딩', ['임대']);
    expect(res).toBe(true);
  });

  test('Scenario 11: "임대수익" buyer vs "오피스빌딩" building → Match (임대수익 → 오피스)', () => {
    const res = matchAssetType('오피스빌딩', ['임대수익']);
    expect(res).toBe(true);
  });

  test('Scenario 12: "수익형" buyer vs "상가" building → Match (수익형 → 상가)', () => {
    const res = matchAssetType('상가', ['수익형']);
    expect(res).toBe(true);
  });

  test('Scenario 13: "투자" buyer vs "근생 건물" building → Match (투자 → 꼬마빌딩 카테고리)', () => {
    const res = matchAssetType('근생 건물', ['투자']);
    expect(res).toBe(true);
  });
});

describe('matching-engine runHardFilter asset type integration (P0-2)', () => {
  test('Should pass Asset Type hard filter when property is "근생 건물" and preferred is ["꼬마빌딩"]', () => {
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
        assetTypes: ['꼬마빌딩'],
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

  test('Should fail Asset Type hard filter when property is "오피스빌딩" and preferred is ["꼬마빌딩"]', () => {
    const input = {
      buildingSsotLiteId: 'building-id',
      buyerIntentLiteId: 'intent-id',
      brokerId: 'broker-id',
      building: {
        areaSignal: '성수동',
        assetType: '오피스빌딩',
        priceBand: '80억대',
        vacancySignal: null,
        fitSummary: 'Summary',
        cautionSummary: 'Caution',
      },
      intent: {
        buyerType: 'Individual',
        budgetRange: { min: 7000000000, max: 9000000000, display: '70억~90억' },
        preferredRegions: ['성동구'],
        assetTypes: ['꼬마빌딩'],
        purchasePurpose: 'Investment',
        mustHave: [],
        niceToHave: [],
        riskTolerance: 'medium',
      },
    };

    const res = runHardFilter(input);
    expect(res.passed).toBe(false);
    expect(res.failReasons.some(r => r.includes('자산 유형 불일치'))).toBe(true);
  });
});
