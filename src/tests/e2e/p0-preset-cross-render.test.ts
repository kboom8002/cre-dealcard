/**
 * @file p0-preset-cross-render.test.ts
 * @description T09: 5종 내장 프리셋 전수 렌더링 교차 검증
 *
 * golden_institutional, credeal_signature, executive_gold,
 * corporate_clean, pro_dark_obsidian 각각으로 동일 입력을 렌더링하여
 * 색상/폰트가 정상 적용되고, 슬라이드 구조가 동일한지 확인합니다.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import type { MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { PPTX_PRESET_TEMPLATES, getPptxTheme, DEFAULT_PPTX_PRESET } from '@/domain/building/mobile-im/pptx/pptx-theme';
import { buildMinimalDoc, BUILDING_META, extractSlideTexts, extractSlideXmls, assertNoCorruptionStrings } from './pptx-test-helpers';

describe('T09: 5-Preset Cross-Rendering Validation', { timeout: 120_000 }, () => {
  let renderer: MobileImPptxRenderer;

  beforeAll(() => {
    renderer = new MobileImPptxRenderer();
  });

  const PRESET_IDS = [
    'golden_institutional',
    'credeal_signature',
    'executive_gold',
    'corporate_clean',
    'pro_dark_obsidian',
  ] as const;

  // ── Section A: 프리셋 존재 및 구조 검증 ──

  test('T09-A01: All 5 preset templates exist in PPTX_PRESET_TEMPLATES', () => {
    for (const id of PRESET_IDS) {
      expect(PPTX_PRESET_TEMPLATES).toHaveProperty(id);
    }
  });

  test('T09-A02: Default preset is golden_institutional', () => {
    expect(DEFAULT_PPTX_PRESET).toBe('golden_institutional');
  });

  test('T09-A03: Each preset has required color tokens', () => {
    const requiredColorKeys = ['bg', 'ink', 'body', 'line', 'tint'];

    for (const id of PRESET_IDS) {
      const theme = PPTX_PRESET_TEMPLATES[id];
      expect(theme).toBeDefined();
      expect(theme.presetId).toBe(id);

      for (const key of requiredColorKeys) {
        expect(theme).toHaveProperty(key);
      }
    }
  });

  test('T09-A04: Each preset has unique presetName', () => {
    const names = PRESET_IDS.map(id => PPTX_PRESET_TEMPLATES[id].presetName);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(PRESET_IDS.length);
  });

  test('T09-A05: getPptxTheme returns correct preset or default', () => {
    for (const id of PRESET_IDS) {
      const theme = getPptxTheme(id);
      expect(theme.presetId).toBe(id);
    }

    // Unknown preset → fallback to default
    const fallback = getPptxTheme('nonexistent_preset');
    expect(fallback.presetId).toBe(DEFAULT_PPTX_PRESET);

    // undefined → fallback to default
    const noArg = getPptxTheme();
    expect(noArg.presetId).toBe(DEFAULT_PPTX_PRESET);
  });

  // ── Section B: 5종 프리셋 전수 렌더링 ──

  const baseInput: Omit<MobileImPptxInput, 'preset'> = {
    buildingId: 'preset-cross-test',
    posture: 'income',
    grade: 'A',
    doc: buildMinimalDoc('income'),
    building: BUILDING_META.income,
  };

  // 각 프리셋으로 렌더링하고 기본 검증 수행
  PRESET_IDS.forEach(presetId => {
    test(`T09-B-${presetId}: Renders without crash and produces valid PPTX`, async () => {
      const input: MobileImPptxInput = {
        ...baseInput,
        buildingId: `preset-${presetId}`,
        preset: presetId,
      };

      const result = await renderer.render(input);

      // 1. Buffer validity
      expect(result.buffer).toBeDefined();
      expect(result.buffer.length).toBeGreaterThan(5_000);

      // 2. Slide count consistency (same input → same structure, Rule 10: PAGE_HARD_LIMIT=16)
      expect(result.slideCount).toBeGreaterThanOrEqual(7);
      expect(result.slideCount).toBeLessThanOrEqual(16);

      // 3. No XML corruption
      await assertNoCorruptionStrings(result.buffer);

      // 4. Every slide has text content
      const slideTexts = await extractSlideTexts(result.buffer);
      for (const [slideNum, texts] of slideTexts) {
        expect(
          texts.length,
          `[${presetId}] Slide ${slideNum} should have text content`
        ).toBeGreaterThan(0);
      }
    });
  });

  // ── Section C: 프리셋 간 구조 동일성 비교 ──

  test('T09-C01: All presets produce same slide count for identical input', async () => {
    const slideCounts: number[] = [];

    for (const presetId of PRESET_IDS) {
      const input: MobileImPptxInput = {
        ...baseInput,
        buildingId: `preset-count-${presetId}`,
        preset: presetId,
      };
      const result = await renderer.render(input);
      slideCounts.push(result.slideCount);
    }

    // All counts should be identical
    const uniqueCounts = new Set(slideCounts);
    expect(
      uniqueCounts.size,
      `Expected all presets to produce same slide count, got: ${JSON.stringify(slideCounts)}`
    ).toBe(1);
  });

  // ── Section D: 다크 프리셋 특이사항 ──

  test('T09-D01: pro_dark_obsidian renders without NaN or empty text', async () => {
    const input: MobileImPptxInput = {
      ...baseInput,
      buildingId: 'preset-dark-check',
      preset: 'pro_dark_obsidian',
    };

    const result = await renderer.render(input);
    await assertNoCorruptionStrings(result.buffer);

    const slideTexts = await extractSlideTexts(result.buffer);
    const allText = Array.from(slideTexts.values()).flat().join(' ');

    // 다크 테마에서도 핵심 텍스트가 존재
    expect(allText).toContain('서초');
    expect(allText.length).toBeGreaterThan(100);
  });
});
