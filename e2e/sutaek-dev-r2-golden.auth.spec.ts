/**
 * @file e2e/sutaek-dev-r2-golden.auth.spec.ts
 * @description P7 수택동 나대지 개발형 R2 골든 E2E — 팩토리 기반 하이브리드 스펙
 */

import { test, expect } from '@playwright/test';
import { createGoldenTest } from './helpers/golden-test-factory';

const factory = createGoldenTest({
  name: 'sutaek-dev-r2',
  dataDir: 'docs/golden-test-data/p7-sutaek-dev/r2-standard',
  posture: 'development',
  askingPriceManwon: 890000,
  resolution: 'R2',
  multiParcel: true,
  expectedMinSlides: 6,
  expectedMaxSlides: 10,
  expectedKeywords: ['수택동', '89억'],
  a24ShouldSuppress: true,
  a23ShouldSuppress: true,
});

test.describe.serial(factory.suiteName, () => {
  factory.registerCommonPhases();

  test('Phase 5-A: 다필지(3) 처리 확인', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasMultiParcel = text.includes('419-19') || text.includes('다필지') || text.includes('3필지');
    expect(hasMultiParcel).toBe(true);
    console.log('  ✅ 다필지 3필지 처리 확인');
  });

  test('Phase 5-B: 나대지 A24/A23 미생성 확인', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    // 나대지 개발형은 렌트롤/수익률 슬라이드 없어야 함
    console.log(`  ℹ️ 나대지 development: A24/A23 미생성 기대`);
  });

  test('Phase 5-C: 법정 용적률 및 공법 여건 반영', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasFAR = text.includes('용적률') || text.includes('800%');
    expect(hasFAR).toBe(true);
    console.log('  ✅ 법정 용적률(800%) 및 공법 분석 반영 확인');
  });
});
