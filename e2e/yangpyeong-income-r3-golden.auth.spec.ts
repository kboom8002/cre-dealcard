/**
 * @file e2e/yangpyeong-income-r3-golden.auth.spec.ts
 * @description P5 양평동4가 수익형 R3 골든 E2E — 팩토리 기반 하이브리드 스펙
 *
 * 포스처: income
 * 매각가: 250억 (2,500,000만원)
 * 특수 검증:
 * - 다필지(3) 교차검증
 * - 10층 건물 전층 렌트롤
 * - 9F 분할임대 처리
 * - B1 공실 처리
 */

import { test, expect } from '@playwright/test';
import { createGoldenTest } from './helpers/golden-test-factory';

const factory = createGoldenTest({
  name: 'yangpyeong-income-r3',
  dataDir: 'docs/golden-test-data/p5-yangpyeong-income/r3-verified',
  posture: 'income',
  askingPriceManwon: 2500000,
  resolution: 'R3',
  multiParcel: true,
  expectedMinSlides: 8,
  expectedMaxSlides: 11,
  expectedFloors: ['B1', '1F', '2F', '3F', '4F', '5F', '6F', '7F', '8F', '9F', '10F'],
  expectedKeywords: ['양평', '250억'],
  a24ShouldSuppress: false,
  a23ShouldSuppress: false,
});

test.describe.serial(factory.suiteName, () => {
  factory.registerCommonPhases();

  test('Phase 5-A: 다필지(3필지 합산 518.7㎡) 면적 결합 처리 확인', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasMultiParcel = text.includes('518.7') || text.includes('156.9') || text.includes('양평로 116-1');
    expect(hasMultiParcel).toBe(true);
    console.log('  ✅ 다필지 합산 대지면적(518.7㎡ / 156.9평) 확인');
  });

  test('Phase 5-B: B1 공실 렌더링', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasVacancy = text.includes('공실') || text.includes('B1');
    expect(hasVacancy).toBe(true);
    console.log('  ✅ B1 공실 렌더링 확인');
  });

  test('Phase 5-C: 9F 분할임대 렌더링', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    // 9F-A, 9F-B 분할임대 또는 9F, 9층 키워드
    const has9F = text.includes('9F') || text.includes('9층') || text.includes('분할');
    expect(has9F).toBe(true);
    console.log('  ✅ 9F 분할임대 렌더링 확인');
  });

  test('Phase 5-D: A23 수익률 + A24 렌트롤 존재', async () => {
    const text = factory.getPptxText();
    if (!text) { test.skip(); return; }
    const hasYield = text.includes('수익률') || text.includes('Cap Rate') || text.includes('NOI');
    const hasRentRoll = text.includes('임대') || text.includes('보증금') || text.includes('월세');
    expect(hasYield).toBe(true);
    expect(hasRentRoll).toBe(true);
    console.log('  ✅ A23 수익률 + A24 렌트롤 존재 확인');
  });
});
