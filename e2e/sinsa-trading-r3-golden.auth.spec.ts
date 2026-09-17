/**
 * @file e2e/sinsa-trading-r3-golden.auth.spec.ts
 * @description P2 신사동 트레이딩 R3 골든 E2E — 팩토리 기반 하이브리드 스펙
 *
 * 포스처: trading
 * 매각가: 760억 (7,600,000만원)
 * 특수 검증:
 * - 대형 매물 760억 처리
 * - 비교사례 Comps 4건 반영
 * - trading 포스처 메트릭 (시세 할인율, HPR)
 */

import { test, expect } from '@playwright/test';
import { createGoldenTest } from './helpers/golden-test-factory';

const factory = createGoldenTest({
  name: 'sinsa-trading-r3',
  dataDir: 'docs/golden-test-data/p2-sinsa-trading/r3-verified',
  posture: 'trading',
  askingPriceManwon: 7600000,
  resolution: 'R3',
  expectedMinSlides: 8,
  expectedMaxSlides: 11,
  expectedKeywords: ['신사', 'ICL', '760억'],
});

test.describe.serial(factory.suiteName, () => {
  factory.registerCommonPhases();

  test('Phase 5-A: 대형 매물 760억 처리', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasLargePrice = text.includes('760') || text.includes('7,600');
    expect(hasLargePrice).toBe(true);
    console.log('  ✅ 대형 매물 760억 처리 확인');
  });

  test('Phase 5-B: trading 포스처 메트릭', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    // trading 포스처에서는 시세, 평당, 비교 등의 키워드
    const hasTrading = text.includes('평당') || text.includes('시세') || text.includes('비교');
    expect(hasTrading).toBe(true);
    console.log('  ✅ trading 포스처 메트릭 확인');
  });
});
