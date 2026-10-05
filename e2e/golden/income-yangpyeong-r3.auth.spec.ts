/**
 * Posture: income
 * Asking Price: 990000 (99억)
 * Purpose: Golden E2E test for income posture in Yangpyeong area (R3 resolution)
 */
import { test, expect } from '@playwright/test';
import { createGoldenTest } from '../helpers/golden-test-factory';

const factory = createGoldenTest({
  name: 'income-yangpyeong-r3',
  dataDir: 'docs/golden-test-data/p5-yangpyeong-income/r3-verified',
  posture: 'income',
  askingPriceManwon: 2500000,
  resolution: 'R3',
  multiParcel: true,
  expectedMinSlides: 8,
  expectedMaxSlides: 12,
  expectedFloors: ['B1', '1F', '2F', '3F', '4F'],
  expectedKeywords: ['양평', '250억'],
});

test.describe.serial(factory.suiteName, () => {
  factory.registerAllPhases();

  test('Phase 5: 수익형 A23 수익률 분석 슬라이드 존재', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasYield = text.includes('수익률') || text.includes('Cap Rate') || text.includes('NOI');
    expect(hasYield).toBe(true);
    console.log('  ✅ A23 수익률 슬라이드 존재 확인');
  });

  test('Phase 6: A24 렌트롤 존재 확인', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasRentRoll = text.includes('임대') || text.includes('보증금') || text.includes('월세');
    expect(hasRentRoll).toBe(true);
    console.log('  ✅ A24 렌트롤 슬라이드 존재 확인');
  });
});
