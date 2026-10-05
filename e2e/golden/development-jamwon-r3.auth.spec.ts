/**
 * Posture: development
 * Asking Price: 1200000 (120억)
 * Purpose: Golden E2E test for development posture in Jamwon area (R3 resolution)
 */
import { test, expect } from '@playwright/test';
import { createGoldenTest } from '../helpers/golden-test-factory';

const factory = createGoldenTest({
  name: 'development-jamwon-r3',
  dataDir: 'docs/golden-test-data/p4-jamwon-dev/r3-verified',
  posture: 'development',
  askingPriceManwon: 2422680,
  resolution: 'R3',
  multiParcel: true,
  expectedMinSlides: 6,
  expectedMaxSlides: 11,
  expectedFloors: [],
  expectedKeywords: ['잠원'],
});

test.describe.serial(factory.suiteName, () => {
  factory.registerAllPhases();

  test('Phase 5: 개발/용적률/건폐율 키워드 확인', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasDevKeywords = text.includes('개발') || text.includes('용적률') || text.includes('건폐율');
    expect(hasDevKeywords).toBe(true);
    console.log('  ✅ 개발/용적률/건폐율 키워드 존재 확인');
  });
});
