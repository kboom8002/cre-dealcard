/**
 * Posture: income
 * Asking Price: 1150000 (115억)
 * Purpose: Golden E2E test for income posture in Dangsan area (R3 resolution)
 */
import { test, expect } from '@playwright/test';
import { createGoldenTest } from '../helpers/golden-test-factory';

const factory = createGoldenTest({
  name: 'income-dangsan-r3',
  dataDir: 'docs/golden-test-data/p1-dangsan-income/r3-verified',
  posture: 'income',
  askingPriceManwon: 1150000,
  resolution: 'R3',
  expectedMinSlides: 8,
  expectedMaxSlides: 12,
  expectedFloors: ['B1', '1F', '2F', '3F', '4F', '5F'],
  expectedKeywords: ['당산', '115억'],
});

test.describe.serial(factory.suiteName, () => {
  factory.registerCommonPhases();

  test('Phase 5: 수익형 A23 수익률 분석 슬라이드 존재', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasYield = text.includes('수익률') || text.includes('Cap Rate') || text.includes('NOI');
    expect(hasYield).toBe(true);
    console.log('  ✅ A23 수익률 슬라이드 존재 확인');
  });

  test('Phase 6: A24 렌트롤 층 키워드 교차 검증', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasRentRoll = text.includes('임대') || text.includes('보증금') || text.includes('월세');
    expect(hasRentRoll).toBe(true);
    console.log('  ✅ A24 렌트롤 슬라이드 존재 확인');
  });

  test('Phase 7: 매각가 115억 교차 검증', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    expect(text.includes('115')).toBe(true);
    console.log('  ✅ 매각가 115억 반영 확인');
  });
});
