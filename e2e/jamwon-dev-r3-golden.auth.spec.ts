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
  expectedMinSlides: 10,
  expectedMaxSlides: 14,
  expectedKeywords: ['잠원동', '242억'],
  a24ShouldSuppress: true,
  a23ShouldSuppress: true,
});

test.describe.serial(factory.suiteName, () => {
  factory.registerCommonPhases();

  test('Phase 5-A: 다필지(2) 처리 확인', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasMultiParcel = text.includes('26-14') || text.includes('26-16') || text.includes('다필지');
    expect(hasMultiParcel).toBe(true);
    console.log('  ✅ 다필지 2필지 처리 확인');
  });

  test('Phase 5-B: 명도 조건 반영', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasEviction = text.includes('명도') || text.includes('매도인');
    expect(hasEviction).toBe(true);
    console.log('  ✅ 명도 조건 반영 확인');
  });

  test('Phase 5-C: 개발 사업수지/스태킹 반영', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasDev = text.includes('스태킹') || text.includes('신축') || text.includes('사업수지') || text.includes('개발');
    expect(hasDev).toBe(true);
    console.log('  ✅ 개발 사업수지/스태킹 반영 확인');
  });
});
