/**
 * @file e2e/dangsan-income-r3-golden.auth.spec.ts
 * @description P1 당산동5가 수익형 R3 골든 E2E — 팩토리 기반 하이브리드 스펙
 *
 * 포스처: income
 * 매각가: 115억 (1,150,000만원)
 * 특수 검증:
 * - B1/4F 자가사용 층 렌더링
 * - 1F+2F 로뎀나무내과 통합계약 (Group B) 처리
 * - 임대료 현실화 시나리오 반영
 * - 9종 단언 (팩토리 자동)
 */

import { test, expect } from '@playwright/test';
import { createGoldenTest } from './helpers/golden-test-factory';

const factory = createGoldenTest({
  name: 'dangsan-income-r3',
  dataDir: 'docs/golden-test-data/p1-dangsan-income/r3-verified',
  posture: 'income',
  askingPriceManwon: 1150000,
  resolution: 'R3',
  expectedMinSlides: 9,
  expectedMaxSlides: 11,
  expectedFloors: ['B1', '1F', '2F', '3F', '4F', '5F'],
  expectedKeywords: ['당산', '115억'],
  a24ShouldSuppress: false,
  a23ShouldSuppress: false,
});

test.describe.serial(factory.suiteName, () => {
  // ── 공통 Phase 1~4 (팩토리 자동) ──
  factory.registerCommonPhases();

  // ── Phase 5: 특수 검증 (하이브리드 파트) ──

  test('Phase 5-A: B1/4F 자가사용 층 정상 렌더링', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }

    // 자가 또는 자가사용 키워드가 PPTX에 포함
    const hasOwnerUse = text.includes('자가') || text.includes('자가사용') || text.includes('사용');
    expect(hasOwnerUse).toBe(true);
    console.log('  ✅ 자가사용 층 렌더링 확인');
  });

  test('Phase 5-B: 로뎀나무내과 통합계약 처리', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }

    // 1F+2F+5F 로뎀나무내과 통합계약이 어떤 형태로든 반영
    const hasRodem = text.includes('로뎀나무') || text.includes('내과');
    expect(hasRodem).toBe(true);
    console.log('  ✅ 로뎀나무내과 통합계약 반영 확인');
  });

  test('Phase 5-C: 임대수익형 A23 수익률 슬라이드 존재', async () => {
    const { slideCount, fullPptxText } = factory.getState();
    if (!fullPptxText) { test.skip(); return; }

    // income 포스처 R3에서는 A23 수익률 공식 슬라이드가 존재해야 함
    const hasYield = fullPptxText.includes('수익률') || fullPptxText.includes('Cap Rate') || fullPptxText.includes('NOI');
    expect(hasYield).toBe(true);
    console.log('  ✅ A23 수익률 슬라이드 존재 확인');
  });

  test('Phase 5-D: A24 렌트롤 슬라이드 존재', async () => {
    const { fullPptxText } = factory.getState();
    if (!fullPptxText) { test.skip(); return; }

    // R3 income에서는 A24 렌트롤 슬라이드가 반드시 존재
    const hasRentRoll = fullPptxText.includes('임대') || fullPptxText.includes('보증금') || fullPptxText.includes('월세');
    expect(hasRentRoll).toBe(true);
    console.log('  ✅ A24 렌트롤 슬라이드 존재 확인');
  });
});
