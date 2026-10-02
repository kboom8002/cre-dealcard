/**
 * Posture: development
 * Asking Price: 500000 (50억)
 * Purpose: Golden E2E test for development posture in Sutaek area (R2 resolution)
 */
import { test, expect } from '@playwright/test';
import { createGoldenTest } from '../helpers/golden-test-factory';

const factory = createGoldenTest({
  name: 'development-sutaek-r2',
  dataDir: 'docs/golden-test-data/p7-sutaek-dev/r2-standard',
  posture: 'development',
  askingPriceManwon: 500000,
  resolution: 'R2',
  expectedMinSlides: 8,
  expectedMaxSlides: 11,
  expectedFloors: [],
  expectedKeywords: ['수택'],
});

test.describe.serial(factory.suiteName, () => {
  factory.registerAllPhases();

  test('Phase 5: 개발/용적률 키워드 확인', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasDevKeywords = text.includes('개발') || text.includes('용적률');
    expect(hasDevKeywords).toBe(true);
    console.log('  ✅ 개발/용적률 키워드 존재 확인');
  });
});
