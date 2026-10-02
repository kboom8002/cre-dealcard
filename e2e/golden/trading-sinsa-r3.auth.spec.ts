/**
 * Posture: trading
 * Asking Price: 850000 (85억)
 * Purpose: Golden E2E test for trading posture in Sinsa area (R3 resolution)
 */
import { test, expect } from '@playwright/test';
import { createGoldenTest } from '../helpers/golden-test-factory';

const factory = createGoldenTest({
  name: 'trading-sinsa-r3',
  dataDir: 'docs/golden-test-data/p2-sinsa-trading/r3-verified',
  posture: 'trading',
  askingPriceManwon: 7600000,
  resolution: 'R3',
  expectedMinSlides: 6,
  expectedMaxSlides: 12,
  expectedFloors: [],
  expectedKeywords: ['신사', '760억'],
});

test.describe.serial(factory.suiteName, () => {
  factory.registerAllPhases();

  test('Phase 5: 시세/매매/양도 키워드 확인', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasTradingKeywords = text.includes('시세') || text.includes('매매') || text.includes('양도');
    expect(hasTradingKeywords).toBe(true);
    console.log('  ✅ 시세/매매/양도 키워드 존재 확인');
  });

  test('Phase 6: A24 렌트롤 슬라이드 미존재 확인', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasRentRoll = text.includes('렌트롤') || text.includes('임대차 명세'); // Assuming standard keywords
    // We expect the rent roll to be suppressed for trading
    expect(hasRentRoll).toBe(false);
    console.log('  ✅ A24 렌트롤 슬라이드 미존재 확인');
  });
});
