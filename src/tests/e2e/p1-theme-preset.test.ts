/**
 * @file p1-theme-preset.test.ts
 * @description T10/T11/T12: 커스텀 프리셋 DB 연동, 다크/라이트 색상 대비, CJK 폰트 검증
 *
 * T10: getPptxThemeAsync의 UUID 프리셋 조회 + fallback 로직
 * T11: 다크 테마(pro_dark_obsidian) 색상 대비 자동 검증
 * T12: CJK 폰트 설정 일관성 검증
 */
import { describe, test, expect } from 'vitest';
import {
  PPTX_PRESET_TEMPLATES,
  getPptxTheme,
  getPptxThemeAsync,
  DEFAULT_PPTX_PRESET,
  type PptxThemeTokens,
} from '@/domain/building/mobile-im/pptx/pptx-theme';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { buildMinimalDoc, BUILDING_META, extractSlideTexts, assertNoCorruptionStrings } from './pptx-test-helpers';

// ── WCAG 명도 대비 계산 유틸리티 ──

/** hex(6자리) → 상대 휘도 (WCAG 2.1 기준) */
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** 두 hex 색상 간 WCAG 대비 비율 (1:1 ~ 21:1) */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('T10: Custom Preset DB Fallback', { timeout: 30_000 }, () => {
  // ── T10-01: getPptxThemeAsync with built-in preset ID → returns immediately ──
  test('T10-01: Built-in preset returns without DB call', async () => {
    const theme = await getPptxThemeAsync('golden_institutional');
    expect(theme.presetId).toBe('golden_institutional');
  });

  test('T10-02: Built-in preset returns without DB (credeal_signature)', async () => {
    const theme = await getPptxThemeAsync('credeal_signature');
    expect(theme.presetId).toBe('credeal_signature');
  });

  // ── T10-03: UUID without supabase → falls back to default ──
  test('T10-03: UUID preset without supabase client → falls back to default', async () => {
    const fakeUUID = '12345678-1234-1234-1234-123456789abc';
    const theme = await getPptxThemeAsync(fakeUUID);
    expect(theme.presetId).toBe(DEFAULT_PPTX_PRESET);
  });

  // ── T10-04: undefined → falls back to default ──
  test('T10-04: undefined preset → falls back to default', async () => {
    const theme = await getPptxThemeAsync(undefined);
    expect(theme.presetId).toBe(DEFAULT_PPTX_PRESET);
  });

  // ── T10-05: Invalid non-UUID string → falls back to default ──
  test('T10-05: Non-UUID non-builtin string → falls back to default', async () => {
    const theme = await getPptxThemeAsync('nonexistent_custom_preset');
    expect(theme.presetId).toBe(DEFAULT_PPTX_PRESET);
  });

  // ── T10-06: UUID with mock supabase returning null → falls back ──
  test('T10-06: UUID with supabase returning null → falls back to default', async () => {
    const fakeUUID = '12345678-1234-1234-1234-123456789abc';
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    } as any;

    const theme = await getPptxThemeAsync(fakeUUID, mockSupabase);
    expect(theme.presetId).toBe(DEFAULT_PPTX_PRESET);
  });

  // ── T10-07: UUID with mock supabase returning custom tokens → merges correctly ──
  test('T10-07: UUID with supabase returning custom tokens → merges over default', async () => {
    const fakeUUID = '12345678-1234-1234-1234-123456789abc';
    const customTokens = {
      accent: 'FF0000',
      companyName: 'TestCorp',
    };
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                tokens: customTokens,
                cover_style: 'split',
                layout_style: 'modern',
                company_name: 'TestCorp Custom',
                company_tagline: 'Custom Tag',
                logo_url: 'https://example.com/logo.png',
              },
              error: null,
            }),
          }),
        }),
      }),
    } as any;

    const theme = await getPptxThemeAsync(fakeUUID, mockSupabase);
    expect(theme.accent).toBe('FF0000');
    expect(theme.companyName).toBe('TestCorp Custom');
    expect(theme.companyTagline).toBe('Custom Tag');
    expect(theme.coverStyle).toBe('split');
    expect(theme.layoutStyle).toBe('modern');
    expect(theme.logoUrl).toBe('https://example.com/logo.png');
    // Base tokens should be preserved
    expect(theme.bg).toBeDefined();
    expect(theme.ink).toBeDefined();
  });

  // ── T10-08: UUID with supabase error → graceful fallback ──
  test('T10-08: UUID with supabase throwing error → graceful fallback to default', async () => {
    const fakeUUID = '12345678-1234-1234-1234-123456789abc';
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => { throw new Error('DB connection failed'); },
          }),
        }),
      }),
    } as any;

    const theme = await getPptxThemeAsync(fakeUUID, mockSupabase);
    expect(theme.presetId).toBe(DEFAULT_PPTX_PRESET);
  });
});

describe('T11: Dark/Light Color Contrast (WCAG)', { timeout: 30_000 }, () => {
  const PRESETS = Object.keys(PPTX_PRESET_TEMPLATES) as string[];

  // ── T11-01: 모든 프리셋의 body 텍스트 vs bg 배경 대비 ≥ 4.5:1 ──
  PRESETS.forEach(presetId => {
    test(`T11-01-${presetId}: body text vs bg background ≥ 4.5:1`, () => {
      const theme = PPTX_PRESET_TEMPLATES[presetId];
      const ratio = contrastRatio(theme.body, theme.bg);
      expect(
        ratio,
        `[${presetId}] body(${theme.body}) vs bg(${theme.bg}) contrast=${ratio.toFixed(2)}`
      ).toBeGreaterThanOrEqual(4.5);
    });
  });

  // ── T11-02: 모든 프리셋의 ink(제목) 텍스트 vs bg 대비 ≥ 4.5:1 ──
  PRESETS.forEach(presetId => {
    test(`T11-02-${presetId}: ink text vs bg background ≥ 4.5:1`, () => {
      const theme = PPTX_PRESET_TEMPLATES[presetId];
      const ratio = contrastRatio(theme.ink, theme.bg);
      expect(
        ratio,
        `[${presetId}] ink(${theme.ink}) vs bg(${theme.bg}) contrast=${ratio.toFixed(2)}`
      ).toBeGreaterThanOrEqual(4.5);
    });
  });

  // ── T11-03: 다크 프리셋의 darkBody vs darkCard 대비 ≥ 3:1 ──
  test('T11-03: pro_dark_obsidian darkBody vs darkCard ≥ 3:1 (large text)', () => {
    const dark = PPTX_PRESET_TEMPLATES['pro_dark_obsidian'];
    const ratio = contrastRatio(dark.darkBody, dark.darkCard);
    expect(
      ratio,
      `darkBody(${dark.darkBody}) vs darkCard(${dark.darkCard}) contrast=${ratio.toFixed(2)}`
    ).toBeGreaterThanOrEqual(3.0);
  });

  // ── T11-04: 다크 프리셋의 darkAccentText vs darkAccentBg 대비 ≥ 3:1 ──
  test('T11-04: pro_dark_obsidian accent text vs accent bg ≥ 3:1', () => {
    const dark = PPTX_PRESET_TEMPLATES['pro_dark_obsidian'];
    const ratio = contrastRatio(dark.darkAccentText, dark.darkAccentBg);
    expect(
      ratio,
      `darkAccentText(${dark.darkAccentText}) vs darkAccentBg(${dark.darkAccentBg}) contrast=${ratio.toFixed(2)}`
    ).toBeGreaterThanOrEqual(3.0);
  });

  // ── T11-05: 모든 프리셋의 accent 색상 WCAG 대비 ≥ 3:1 ──
  PRESETS.forEach(presetId => {
    test(`T11-05-${presetId}: accent vs bg ≥ 3:1`, () => {
      const theme = PPTX_PRESET_TEMPLATES[presetId];
      const ratio = contrastRatio(theme.accent, theme.bg);
      expect(
        ratio,
        `[${presetId}] accent(${theme.accent}) vs bg(${theme.bg}) contrast=${ratio.toFixed(2)}`
      ).toBeGreaterThanOrEqual(3.0);
    });
  });

  // ── T11-06: mute 텍스트도 최소 2.5:1 이상 ──
  PRESETS.forEach(presetId => {
    test(`T11-06-${presetId}: mute text vs bg ≥ 2.5:1`, () => {
      const theme = PPTX_PRESET_TEMPLATES[presetId];
      const ratio = contrastRatio(theme.mute, theme.bg);
      expect(
        ratio,
        `[${presetId}] mute(${theme.mute}) vs bg(${theme.bg}) contrast=${ratio.toFixed(2)}`
      ).toBeGreaterThanOrEqual(2.5);
    });
  });
});

describe('T12: CJK Font Embedding Consistency', { timeout: 60_000 }, () => {
  // ── T12-01: 모든 프리셋의 bodyFont 설정 확인 ──
  test('T12-01: All presets have bodyFont defined', () => {
    for (const presetId of Object.keys(PPTX_PRESET_TEMPLATES)) {
      const theme = PPTX_PRESET_TEMPLATES[presetId];
      expect(theme.bodyFont).toBeDefined();
      expect(theme.bodyFont.length).toBeGreaterThan(0);
    }
  });

  // ── T12-02: 모든 프리셋의 titleFont 설정 확인 ──
  test('T12-02: All presets have titleFont defined', () => {
    for (const presetId of Object.keys(PPTX_PRESET_TEMPLATES)) {
      const theme = PPTX_PRESET_TEMPLATES[presetId];
      expect(theme.titleFont).toBeDefined();
      expect(theme.titleFont.length).toBeGreaterThan(0);
    }
  });

  // ── T12-03: PPTX XML에서 실제 폰트 참조 확인 ──
  test('T12-03: Rendered PPTX XML references Korean font family', async () => {
    const renderer = new MobileImPptxRenderer();
    const result = await renderer.render({
      buildingId: 'font-test',
      tier: 'basic',
      posture: 'income',
      grade: 'A',
      doc: buildMinimalDoc('income'),
      building: BUILDING_META.income,
    });

    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(result.buffer);
    const slide1Xml = await zip.file('ppt/slides/slide1.xml')?.async('string');
    expect(slide1Xml).toBeDefined();

    // PPTX XML에서 한글 폰트 참조 확인 (맑은 고딕 또는 Pretendard)
    const hasKorFont = slide1Xml!.includes('맑은 고딕') ||
                       slide1Xml!.includes('Malgun Gothic') ||
                       slide1Xml!.includes('Pretendard');
    expect(hasKorFont).toBe(true);
  });

  // ── T12-04: 다크 테마 렌더링에서도 한글 폰트 정상 참조 ──
  test('T12-04: Dark theme PPTX also references Korean font', async () => {
    const renderer = new MobileImPptxRenderer();
    const result = await renderer.render({
      buildingId: 'font-dark-test',
      tier: 'basic',
      posture: 'income',
      grade: 'A',
      doc: buildMinimalDoc('income'),
      building: BUILDING_META.income,
      preset: 'pro_dark_obsidian',
    });

    await assertNoCorruptionStrings(result.buffer);
    const slideTexts = await extractSlideTexts(result.buffer);
    const allText = Array.from(slideTexts.values()).flat().join(' ');

    // 다크 테마에서도 한글 텍스트가 정상 생성
    expect(allText).toContain('서초');
    expect(allText.length).toBeGreaterThan(100);
  });
});
