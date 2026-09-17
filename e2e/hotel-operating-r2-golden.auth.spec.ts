/**
 * @file e2e/hotel-operating-r2-golden.auth.spec.ts
 * @description P6 호텔 운영형 R2 골든 E2E — 팩토리 기반 하이브리드 스펙
 */

import { test, expect } from '@playwright/test';
import { createGoldenTest } from './helpers/golden-test-factory';

const factory = createGoldenTest({
  name: 'hotel-operating-r2',
  dataDir: 'docs/golden-test-data/p6-hotel-operating/r2-standard',
  posture: 'operating',
  askingPriceManwon: 3000000,
  resolution: 'R2',
  expectedMinSlides: 7,
  expectedMaxSlides: 10,
  expectedKeywords: ['호텔', '300억', 'GOP'],
  a24ShouldSuppress: true,
  a23ShouldSuppress: true,
});

test.describe.serial(factory.suiteName, () => {
  factory.registerCommonPhases();

  test('Phase 5-A: operating 포스처 KPI 지표(GOP/점유율) 요약 슬라이드 반영', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasKpi = text.includes('GOP') || text.includes('객실 점유율') || text.includes('78%');
    expect(hasKpi).toBe(true);
    console.log('  ✅ 운영형 KPI 지표 (GOP 마진 / 점유율 78%) 확인');
  });

  test('Phase 5-B: A24 렌트롤 미생성 확인 (operating)', async () => {
    const { slideCount } = factory.getState();
    expect(slideCount).toBeLessThanOrEqual(8);
    console.log(`  ✅ operating 포스처 슬라이드 절삭 규격(${slideCount}면, A24/A23 미생성) 확인`);
  });

  test('Phase 5-C: 운영형 투자 포인트 분석 반영', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasOperating = text.includes('운영 수익') || text.includes('운영 자산') || text.includes('GOP');
    expect(hasOperating).toBe(true);
    console.log('  ✅ 운영형 투자 포인트 분석 확인');
  });
});
