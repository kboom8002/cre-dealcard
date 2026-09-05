/**
 * @file p1-theme-preset.test.ts
 * @description Unit tests for Institutional Slate Theme Preset (#2B2F3E, #E8DEC8, open_frame layout)
 *
 * Verifies:
 * - Registration in PPTX_PRESET_TEMPLATES and CORE_PRIME_TEMPLATES
 * - Token schema completeness and CMF color values
 * - WCAG AA contrast ratios (white ink >= 13.0:1, body >= 4.5:1, accent >= 3.0:1)
 * - Accessibility validation via validatePresetAccessibility
 * - Open-frame layoutStyle handling in imlib
 * - Web CSS parity in globals.css
 * - Mandatory negative pairs for every positive assertion (Rule 7)
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  PPTX_PRESET_TEMPLATES,
  PRIME_TEMPLATE_ALIASES,
  CORE_PRIME_TEMPLATES,
  DEFAULT_PPTX_PRESET,
  INSTITUTIONAL_SLATE_PRESET,
  getPptxTheme,
  validatePresetAccessibility,
  type PptxThemeTokens,
} from '@/domain/building/mobile-im/pptx/pptx-theme';
import {
  setActiveTheme,
  card,
  head,
  headD,
  foot,
  withThemeIsolation,
} from '@/domain/building/mobile-im/pptx/imlib';
import {
  CORE_PRIME_PRESETS,
  LAYOUT_STYLE_PRESETS,
} from '@/components/broker/pptx-editor/token-editor-panel';

// ── WCAG 2.1 Relative Luminance & Contrast Calculation ──

function relativeLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
  const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
  const b = parseInt(cleanHex.slice(4, 6), 16) / 255;

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Institutional Slate Theme Preset (#2B2F3E, #E8DEC8, open_frame)', () => {
  const slateTheme = PPTX_PRESET_TEMPLATES.institutional_slate;

  // ══════════════════════════════════════════════════════════════════
  // Suite 1: Registration, Prime List & Aliases
  // ══════════════════════════════════════════════════════════════════
  describe('Suite 1: Registration, Prime List & Aliases', () => {
    it('P1-01: institutional_slate is registered in PPTX_PRESET_TEMPLATES', () => {
      // Positive assertion
      expect(slateTheme).toBeDefined();
      expect(slateTheme.presetId).toBe('institutional_slate');
      expect(slateTheme.presetName).toContain('기관투자자 슬레이트');

      // Negative pair: Non-existent preset is undefined in map
      expect(PPTX_PRESET_TEMPLATES['institutional_magenta_neon']).toBeUndefined();
    });

    it('P1-02: institutional_slate is included in CORE_PRIME_TEMPLATES and constant export', () => {
      // Positive assertion
      expect(CORE_PRIME_TEMPLATES).toContain('institutional_slate');
      expect(INSTITUTIONAL_SLATE_PRESET).toBe('institutional_slate');

      // Negative pair: Random unregistered IDs are not in CORE_PRIME_TEMPLATES
      expect(CORE_PRIME_TEMPLATES).not.toContain('random_theme_preset_xyz');
    });

    it('P1-03: getPptxTheme resolves institutional_slate directly and via aliases', () => {
      // Positive direct lookup
      const themeDirect = getPptxTheme('institutional_slate');
      expect(themeDirect.presetId).toBe('institutional_slate');
      expect(themeDirect.bg).toBe('2B2F3E');
      expect(themeDirect.accent).toBe('E8DEC8');

      // Positive alias lookups
      const themeAlias1 = getPptxTheme('institutional_slate_gold');
      expect(themeAlias1.presetId).toBe('institutional_slate');
      const themeAlias2 = getPptxTheme('slate_institutional');
      expect(themeAlias2.presetId).toBe('institutional_slate');

      // Negative pair: Unknown preset falls back to DEFAULT_PPTX_PRESET, not institutional_slate
      const unknownTheme = getPptxTheme('completely_unknown_preset_123');
      expect(unknownTheme.presetId).toBe(DEFAULT_PPTX_PRESET);
      expect(unknownTheme.presetId).not.toBe('institutional_slate');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // Suite 2: Token Schema Completeness & CMF Values
  // ══════════════════════════════════════════════════════════════════
  describe('Suite 2: Token Schema Completeness & CMF Values', () => {
    it('P2-01: Contains all required tokens with non-empty string values', () => {
      const requiredKeys: (keyof PptxThemeTokens)[] = [
        'presetId', 'presetName',
        'ink', 'ink2', 'ink3', 'slate', 'body', 'mute', 'mute2', 'line', 'line2', 'bg', 'tint',
        'accent', 'accentD', 'accentL', 'accentT',
        'green', 'greenL', 'red', 'redL', 'amber', 'amberL', 'blue', 'blueL', 'violet', 'violetL',
        'darkCard', 'darkBlock', 'darkBorder', 'darkBody', 'darkMute', 'darkFaint', 'darkAccentBg', 'darkAccentBorder', 'darkAccentText',
        'titleFont', 'bodyFont', 'coverStyle', 'layoutStyle', 'companyName', 'companyTagline',
      ];

      for (const key of requiredKeys) {
        expect(slateTheme[key]).toBeDefined();
        expect(typeof slateTheme[key]).toBe('string');
        expect((slateTheme[key] as string).length).toBeGreaterThan(0);
      }

      // Negative pair: Check that no unexpected undefined properties exist
      expect((slateTheme as any).unknownTokenProperty).toBeUndefined();
    });

    it('P2-02: Exact CMF color hex codes match institutional slate specifications', () => {
      // Background & Tint
      expect(slateTheme.bg).toBe('2B2F3E');
      expect(slateTheme.tint).toBe('232733');

      // Champagne Gold Accent Palette
      expect(slateTheme.accent).toBe('E8DEC8');
      expect(slateTheme.accentD).toBe('C4B598');
      expect(slateTheme.accentL).toBe('F5F0E6');
      expect(slateTheme.accentT).toBe('1A1813');

      // Neutrals
      expect(slateTheme.ink).toBe('FFFFFF');
      expect(slateTheme.ink2).toBe('F1F5F9');
      expect(slateTheme.ink3).toBe('E2E8F0');
      expect(slateTheme.slate).toBe('94A3B8');
      expect(slateTheme.body).toBe('CBD5E1');
      expect(slateTheme.mute).toBe('64748B');
      expect(slateTheme.mute2).toBe('475569');
      expect(slateTheme.line).toBe('3D4356');
      expect(slateTheme.line2).toBe('4A5268');

      // Dark dedicated cards & blocks
      expect(slateTheme.darkCard).toBe('232733');
      expect(slateTheme.darkBlock).toBe('1E222D');
      expect(slateTheme.darkBorder).toBe('3D4356');
      expect(slateTheme.darkBody).toBe('E2E8F0');
      expect(slateTheme.darkAccentText).toBe('E8DEC8');

      // Typography & Layout
      expect(slateTheme.titleFont).toBe('Pretendard');
      expect(slateTheme.bodyFont).toBe('Pretendard');
      expect(slateTheme.layoutStyle).toBe('open_frame');
      expect(slateTheme.coverStyle).toBe('institutional_masses');

      // Negative pair: Hex codes do NOT have '#' and are valid 6-char hex
      const hexFields: (keyof PptxThemeTokens)[] = [
        'bg', 'tint', 'accent', 'accentD', 'accentL', 'accentT',
        'ink', 'ink2', 'ink3', 'slate', 'body', 'mute', 'mute2', 'line', 'line2',
        'darkCard', 'darkBlock', 'darkBorder', 'darkBody',
      ];
      for (const field of hexFields) {
        const val = slateTheme[field] as string;
        expect(val).not.toContain('#');
        expect(val).toMatch(/^[0-9A-Fa-f]{6}$/);
      }
    });

    it('P2-03: Dark background invariant (luminance < 0.05 vs light theme luminance > 0.8)', () => {
      // Positive assertion: Slate theme has deep charcoal background
      const slateLum = relativeLuminance(slateTheme.bg);
      expect(slateLum).toBeLessThan(0.05);

      // Negative pair: Standard light theme (institutional_dark_gold) background is light
      const lightTheme = PPTX_PRESET_TEMPLATES.institutional_dark_gold;
      const lightLum = relativeLuminance(lightTheme.bg);
      expect(lightLum).toBeGreaterThan(0.80);
      expect(slateLum).not.toBe(lightLum);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // Suite 3: WCAG AA Contrast Compliance & Mathematical Validation
  // ══════════════════════════════════════════════════════════════════
  describe('Suite 3: WCAG AA Contrast Compliance & Mathematical Validation', () => {
    it('P3-01: Pure white ink (#FFFFFF) on slate (#2B2F3E) achieves high contrast >= 13.0:1', () => {
      const ratio = contrastRatio(slateTheme.ink, slateTheme.bg);
      // Measured: ~13.14:1
      expect(ratio).toBeGreaterThanOrEqual(13.0);

      // Negative pair: Inverted or low-contrast text (#333333) fails AA
      const badRatio = contrastRatio('333333', slateTheme.bg);
      expect(badRatio).toBeLessThan(4.5);
    });

    it('P3-02: Body text (#CBD5E1) on slate (#2B2F3E) satisfies WCAG AA >= 4.5:1 (achieving ~8.9:1)', () => {
      const ratio = contrastRatio(slateTheme.body, slateTheme.bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeGreaterThan(8.0);

      // Negative pair: Muted dark gray body text (#475569) fails WCAG AA on slate
      const darkBodyRatio = contrastRatio('475569', slateTheme.bg);
      expect(darkBodyRatio).toBeLessThan(4.5);
    });

    it('P3-03: Champagne gold accent (#E8DEC8) on slate (#2B2F3E) satisfies graphical contrast >= 3.0:1 (achieving ~9.8:1)', () => {
      const ratio = contrastRatio(slateTheme.accent, slateTheme.bg);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
      expect(ratio).toBeGreaterThan(9.0);

      // Negative pair: Dark gold (#3D3A2A) fails graphical contrast
      const darkGoldRatio = contrastRatio('3D3A2A', slateTheme.bg);
      expect(darkGoldRatio).toBeLessThan(3.0);
    });

    it('P3-04: Mute text (#64748B) on slate (#2B2F3E) satisfies minimum readable threshold >= 2.5:1', () => {
      const ratio = contrastRatio(slateTheme.mute, slateTheme.bg);
      expect(ratio).toBeGreaterThanOrEqual(2.5);

      // Negative pair: Even darker mute (#3D4356) fails minimum threshold
      const tooDarkMuteRatio = contrastRatio('3D4356', slateTheme.bg);
      expect(tooDarkMuteRatio).toBeLessThan(2.5);
    });

    it('P3-05: DarkCard body (#E2E8F0) on darkCard (#232733) achieves high contrast >= 10.0:1', () => {
      const ratio = contrastRatio(slateTheme.darkBody, slateTheme.darkCard);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
      expect(ratio).toBeGreaterThan(10.0);

      // Negative pair: Low contrast card text (#333A48) fails
      const badCardTextRatio = contrastRatio('333A48', slateTheme.darkCard);
      expect(badCardTextRatio).toBeLessThan(3.0);
    });

    it('P3-06: validatePresetAccessibility reports 0 violations for institutional_slate', () => {
      // Positive assertion: 0 issues
      const issues = validatePresetAccessibility(slateTheme);
      expect(issues).toEqual([]);
      expect(issues.length).toBe(0);

      // Negative pair: Synthetic theme with poor body contrast produces violations
      const defectiveTheme: PptxThemeTokens = {
        ...slateTheme,
        presetId: 'defective_slate_test',
        body: '3D4356', // Very dark body on 2B2F3E bg
      };
      const defectiveIssues = validatePresetAccessibility(defectiveTheme);
      expect(defectiveIssues.length).toBeGreaterThan(0);
      expect(defectiveIssues.some(i => i.includes('body'))).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // Suite 4: Open Frame Layout Style & Imlib Integration
  // ══════════════════════════════════════════════════════════════════
  describe('Suite 4: Open Frame Layout Style & Imlib Integration', () => {
    it('P4-01: imlib.card renders geometric open frame shape with 0.5pt line without error', async () => {
      const shapes: any[] = [];
      const mockSlide: any = {
        addShape: (type: string, opts: any) => {
          shapes.push({ type, opts });
        },
        addText: () => {},
      };

      await withThemeIsolation(slateTheme, async () => {
        card(mockSlide, 0.8, 1.5, 5.0, 3.0, { fill: '232733', lineCol: '3D4356', onDark: true });
      });

      // Positive assertion: Exactly 1 rect shape created with 0.5pt line width
      expect(shapes.length).toBe(1);
      expect(shapes[0].type).toBe('rect');
      expect(shapes[0].opts.x).toBe(0.8);
      expect(shapes[0].opts.y).toBe(1.5);
      expect(shapes[0].opts.w).toBe(5.0);
      expect(shapes[0].opts.h).toBe(3.0);
      expect(shapes[0].opts.line.width).toBe(0.5);

      // Negative pair: In modern/dramatic styles, multiple shapes (accent bar + rect) are created
      const modernShapes: any[] = [];
      const mockSlideModern: any = {
        addShape: (type: string, opts: any) => {
          modernShapes.push({ type, opts });
        },
        addText: () => {},
      };
      const modernTheme = { ...slateTheme, layoutStyle: 'modern' as const };
      await withThemeIsolation(modernTheme, async () => {
        card(mockSlideModern, 0.8, 1.5, 5.0, 3.0);
      });
      expect(modernShapes.length).toBe(2);
      expect(modernShapes.length).not.toBe(shapes.length);
    });

    it('P4-02: imlib.head and headD render open_frame header lines with brass accent', async () => {
      const items: any[] = [];
      const mockSlide: any = {
        addShape: (type: string, opts: any) => {
          items.push({ kind: 'shape', type, opts });
        },
        addText: (text: any, opts: any) => {
          items.push({ kind: 'text', text, opts });
        },
      };

      await withThemeIsolation(slateTheme, async () => {
        headD(mockSlide, 1, 'INVESTMENT HIGHLIGHTS', '핵심 투자 포인트', '상세 투자 개요');
      });

      // Positive assertion: Rect for slide number, line divider for open_frame, texts added
      const lineShapes = items.filter(i => i.kind === 'shape' && i.type === 'line');
      expect(lineShapes.length).toBeGreaterThan(0);
      expect(lineShapes[0].opts.line.width).toBe(0.5);

      const titleTexts = items.filter(i => i.kind === 'text' && i.text === '핵심 투자 포인트');
      expect(titleTexts.length).toBe(1);

      // Negative pair: No NaN or undefined in any options
      for (const item of items) {
        expect(item.opts.x).not.toBeNaN();
        expect(item.opts.y).not.toBeNaN();
        expect(item.opts.w).not.toBeNaN();
        expect(item.opts.h).not.toBeNaN();
      }
    });

    it('P4-03: imlib.foot renders open_frame bottom line divider', async () => {
      const items: any[] = [];
      const mockSlide: any = {
        addShape: (type: string, opts: any) => {
          items.push({ kind: 'shape', type, opts });
        },
        addText: (text: any, opts: any) => {
          items.push({ kind: 'text', text, opts });
        },
      };

      await withThemeIsolation(slateTheme, async () => {
        foot(mockSlide, 3, 'IM-SLATE-2026-001', true);
      });

      // Positive assertion: Thin line divider across slide content width
      const lines = items.filter(i => i.kind === 'shape' && i.type === 'line');
      expect(lines.length).toBe(1);
      expect(lines[0].opts.line.width).toBe(0.5);

      const pageTexts = items.filter(i => i.kind === 'text' && i.text === '3');
      expect(pageTexts.length).toBe(1);

      // Negative pair: Minimal layout style does not render line
      const minimalItems: any[] = [];
      const mockSlideMinimal: any = {
        addShape: (type: string, opts: any) => {
          minimalItems.push({ kind: 'shape', type, opts });
        },
        addText: (text: any, opts: any) => {
          minimalItems.push({ kind: 'text', text, opts });
        },
      };
      const minimalTheme = { ...slateTheme, layoutStyle: 'minimal' as const };
      await withThemeIsolation(minimalTheme, async () => {
        foot(mockSlideMinimal, 3, 'IM-MINIMAL-001');
      });
      const minimalLines = minimalItems.filter(i => i.kind === 'shape' && i.type === 'line');
      expect(minimalLines.length).toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // Suite 5: Studio UI Presets & Web CSS Parity
  // ══════════════════════════════════════════════════════════════════
  describe('Suite 5: Studio UI Presets & Web CSS Parity', () => {
    it('P5-01: token-editor-panel exports institutional_slate in CORE_PRIME_PRESETS and open_frame in LAYOUT_STYLE_PRESETS', () => {
      // Positive assertion: CORE_PRIME_PRESETS contains institutional_slate
      const slatePreset = CORE_PRIME_PRESETS.find(p => p.id === 'institutional_slate');
      expect(slatePreset).toBeDefined();
      expect(slatePreset!.label).toContain('기관투자자 슬레이트');
      expect(slatePreset!.badge).toBe('Institutional');

      // Positive assertion: LAYOUT_STYLE_PRESETS contains open_frame
      const openFrameStyle = LAYOUT_STYLE_PRESETS.find(s => s.id === 'open_frame');
      expect(openFrameStyle).toBeDefined();
      expect(openFrameStyle!.label).toContain('오픈 프레임');

      // Negative pair: Random ID does not exist in presets
      expect(CORE_PRIME_PRESETS.find(p => p.id === 'non_existent_preset_id')).toBeUndefined();
      expect(LAYOUT_STYLE_PRESETS.find(s => s.id === 'non_existent_layout_style')).toBeUndefined();
    });

    it('P5-02: globals.css defines [data-theme="institutional_slate"] with exact slate and gold variables', () => {
      const globalsCssPath = path.resolve(process.cwd(), 'src/app/globals.css');
      const cssContent = fs.readFileSync(globalsCssPath, 'utf-8');

      // Positive assertions
      expect(cssContent).toContain('[data-theme="institutional_slate"]');
      expect(cssContent).toContain('--background: #2B2F3E');
      expect(cssContent).toContain('--primary: #E8DEC8');
      expect(cssContent).toContain('--card: #232733');
      expect(cssContent).toContain('--border: #3D4356');
      expect(cssContent).toContain('--slate-bg: #2B2F3E');
      expect(cssContent).toContain('--slate-gold: #E8DEC8');

      // Negative pair: Ensure institutional_slate is not mistakenly configured with light background
      expect(cssContent).not.toMatch(/\[data-theme="institutional_slate"\][^{]*\{[^}]*--background:\s*#FFFFFF/);
    });
  });
});
