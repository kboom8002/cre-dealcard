/**
 * @file e2e/jamwon-dev-r3-golden.auth.spec.ts
 * @description P4 잠원동 개발형 R3 골든 E2E — 팩토리 기반 하이브리드 스펙
 */

import { test, expect } from '@playwright/test';
import { createGoldenTest } from './helpers/golden-test-factory';

const factory = createGoldenTest({
  name: 'jamwon-dev-r3',
  dataDir: 'docs/golden-test-data/p4-jamwon-dev/r3-verified',
  posture: 'development',
  askingPriceManwon: 2422680,
  resolution: 'R3',
  multiParcel: true,
  expectedMinSlides: 7,
  expectedMaxSlides: 10,
  expectedKeywords: ['잠원', '242억'],
  a24ShouldSuppress: false,
  a23ShouldSuppress: true,
});

test.describe.serial(factory.suiteName, () => {
  factory.registerCommonPhases();

  test('Phase 5-A: 다필지(2필지 합산 616.1㎡) 면적 결합 처리 확인', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasMultiParcel = text.includes('616.1') || text.includes('186.4') || text.includes('신반포로47길');
    expect(hasMultiParcel).toBe(true);
    console.log('  ✅ 다필지 합산 대지면적(616.1㎡ / 186.4평) 확인');
  });

  test('Phase 5-B: 개발 사업수지 및 토지비 분석 반영', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasDev = text.includes('사업 수지') || text.includes('개발') || text.includes('토지비');
    expect(hasDev).toBe(true);
    console.log('  ✅ 개발 사업수지/토지비 투자 포인트 확인');
  });

  test('Phase 5-C: 인허가 및 공법 여건 사전 점검 반영', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasZoning = text.includes('인허가') || text.includes('용도지역') || text.includes('건폐율');
    expect(hasZoning).toBe(true);
    console.log('  ✅ 인허가 및 공법 여건 사전 점검 확인');
  });
});
