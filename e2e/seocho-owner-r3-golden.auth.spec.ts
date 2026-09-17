/**
 * @file e2e/seocho-owner-r3-golden.auth.spec.ts
 * @description P3 서초동 사옥형 R3 골든 E2E — 팩토리 기반 하이브리드 스펙
 */

import { test, expect } from '@playwright/test';
import { createGoldenTest } from './helpers/golden-test-factory';

const factory = createGoldenTest({
  name: 'seocho-owner-r3',
  dataDir: 'docs/golden-test-data/p3-seocho-owner/r3-verified',
  posture: 'owner_occupied',
  askingPriceManwon: 2300000,
  resolution: 'R3',
  expectedMinSlides: 7,
  expectedMaxSlides: 10,
  expectedKeywords: ['서초', '230억'],
});

test.describe.serial(factory.suiteName, () => {
  factory.registerCommonPhases();

  test('Phase 5-A: 고공실 사옥전환 분석 존재', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasOwnerAnalysis = text.includes('사옥') || text.includes('자가') || text.includes('공실');
    expect(hasOwnerAnalysis).toBe(true);
    console.log('  ✅ 사옥전환/공실 분석 확인');
  });

  test('Phase 5-B: owner_occupied 포스처 메트릭 확인', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasMetrics = text.includes('실투자금') || text.includes('사옥 가치') || text.includes('기업 브랜딩');
    expect(hasMetrics).toBe(true);
    console.log('  ✅ owner_occupied 메트릭(실투자금/사옥 가치/브랜딩) 확인');
  });
});
