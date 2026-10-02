/**
 * Posture: owner_occupied
 * Asking Price: 2300000 (230억)
 * Purpose: Golden E2E test for owner_occupied posture in Seocho area (R3 resolution)
 */
import { test, expect } from '@playwright/test';
import { createGoldenTest } from '../helpers/golden-test-factory';

const factory = createGoldenTest({
  name: 'owner-seocho-r3',
  dataDir: 'docs/golden-test-data/p3-seocho-owner/r3-verified',
  posture: 'owner_occupied',
  askingPriceManwon: 2300000,
  resolution: 'R3',
  expectedMinSlides: 8,
  expectedMaxSlides: 10,
  expectedFloors: [],
  expectedKeywords: ['서초', '230억'],
});

test.describe.serial(factory.suiteName, () => {
  factory.registerAllPhases();

  test('Phase 5: 자가/사옥/전환 키워드 확인', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasOwnerKeywords = text.includes('자가') || text.includes('사옥') || text.includes('전환');
    expect(hasOwnerKeywords).toBe(true);
    console.log('  ✅ 자가/사옥/전환 키워드 존재 확인');
  });

  test('Phase 6: 손익분기/절감 키워드 확인', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasFinancialKeywords = text.includes('손익분기') || text.includes('절감');
    expect(hasFinancialKeywords).toBe(true);
    console.log('  ✅ 손익분기/절감 키워드 존재 확인');
  });
});
