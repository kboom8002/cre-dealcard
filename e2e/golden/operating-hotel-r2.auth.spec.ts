/**
 * Posture: operating
 * Asking Price: 3500000 (350억)
 * Purpose: Golden E2E test for operating posture for hotel (R2 resolution)
 */
import { test, expect } from '@playwright/test';
import { createGoldenTest } from '../helpers/golden-test-factory';

const factory = createGoldenTest({
  name: 'operating-hotel-r2',
  dataDir: 'docs/golden-test-data/p6-hotel-operating/r2-standard',
  posture: 'operating',
  askingPriceManwon: 3500000,
  resolution: 'R2',
  expectedMinSlides: 8,
  expectedMaxSlides: 10,
  expectedFloors: [],
  expectedKeywords: [],
});

test.describe.serial(factory.suiteName, () => {
  factory.registerAllPhases();

  test('Phase 5: GOP/RevPAR/객실/운영 키워드 확인', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasOpsKeywords = text.includes('GOP') || text.includes('RevPAR') || text.includes('객실') || text.includes('운영');
    expect(hasOpsKeywords).toBe(true);
    console.log('  ✅ GOP/RevPAR/객실/운영 키워드 존재 확인');
  });

  test('Phase 6: 가동률/점유율/OCC 키워드 확인', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasOccKeywords = text.includes('가동률') || text.includes('점유율') || text.includes('OCC');
    expect(hasOccKeywords).toBe(true);
    console.log('  ✅ 가동률/점유율/OCC 키워드 존재 확인');
  });
});
