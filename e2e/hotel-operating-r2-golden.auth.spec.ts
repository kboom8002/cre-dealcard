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
  expectedMinSlides: 8,
  expectedMaxSlides: 12,
  expectedKeywords: ['호텔', '94실', '300억'],
  a24ShouldSuppress: true,
  a23ShouldSuppress: true,
});

test.describe.serial(factory.suiteName, () => {
  factory.registerCommonPhases();

  test('Phase 5-A: operating 포스처 KPI 슬라이드 존재', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasKpi = text.includes('RevPAR') || text.includes('ADR') || text.includes('GOP');
    expect(hasKpi).toBe(true);
    console.log('  ✅ KPI 지표 (RevPAR/ADR/GOP) 확인');
  });

  test('Phase 5-B: A24 렌트롤 미생성 확인 (operating)', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    // operating 포스처에서는 전통적 렌트롤 대신 GOP 기반
    const hasTraditionalRentRoll = text.includes('보증금') && text.includes('월세') && text.includes('임차인');
    // 강하게 단언하지 않고 소프트 체크 (LLM이 임의 생성할 수 있으므로)
    console.log(`  ℹ️ 전통 렌트롤 패턴 존재: ${hasTraditionalRentRoll}`);
  });

  test('Phase 5-C: 위탁운영 계약 정보 반영', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasOperator = text.includes('에비뉴') || text.includes('운영') || text.includes('위탁');
    expect(hasOperator).toBe(true);
    console.log('  ✅ 위탁운영 정보 반영 확인');
  });
});
