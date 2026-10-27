/**
 * @file src/tests/workspace/design-tokens-guard.test.ts
 * @description Milestone 3 Test Suite: Static AST & Senior Design Tokens Guard
 *
 * Requirements:
 * 1. Zero <14px Text Classes:
 *    - Scans all components under `src/components/workspace/**`.
 *    - Strictly asserts 0 occurrences of sub-14px Tailwind classes:
 *      `text-xs`, `text-[10px]`, `text-[11px]`, `text-[12px]`, `text-[13px]`, `text-[9px]`.
 * 2. Senior Typography & Scale Tokens:
 *    - Validates `src/components/workspace/tokens.ts`:
 *      - 3-tier root font scale: normal (17px), large (19px), xlarge (21px).
 *      - Minimum caption size: 14px (banned <= 13px).
 *      - Form input text: 18px (prevents iOS auto-zoom).
 * 3. Contrast & Accessibility Tokens:
 *    - Control border: `#64748B` with 4.8:1 contrast ratio against white.
 *    - Touch targets: minimum 48x48px interactive target, primary button 56px.
 *    - Global CSS `--control-border` token integrity in `src/app/globals.css`.
 *
 * Authoritative Sources:
 * - docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §3.1, WP-P2-01
 * - PROJECT.md (Milestone 3, Feature 26)
 * - TEST_INFRA.md (§ Feature Inventory #8)
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  SENIOR_FONT_SCALE,
  SENIOR_TYPOGRAPHY,
  WORKSPACE_TOUCH_TARGETS,
  WORKSPACE_COLORS,
  getSeniorFontSize,
  enforceMinCaptionSize,
} from '@/components/workspace/tokens';

describe('M3 Workspace: Design Tokens & Accessibility Guard (WP-P2-01)', () => {
  describe('Part 1: Static AST / Source Scan for Zero <14px Text Classes', () => {
    const workspaceDir = path.resolve(process.cwd(), 'src/components/workspace');

    it('scans all workspace components and verifies 0 instances of <14px text classes', () => {
      expect(fs.existsSync(workspaceDir)).toBe(true);

      const files = fs.readdirSync(workspaceDir);
      const violations: Array<{ file: string; match: string }> = [];

      // Regex matching banned sub-14px classes: text-xs or text-[<14px]
      const bannedTextRegex = /\btext-(?:xs|\[(?:9|10|11|12|13)px\])\b/g;

      files.forEach((file) => {
        if (!file.endsWith('.tsx') && !file.endsWith('.ts')) return;
        const filePath = path.join(workspaceDir, file);
        const content = fs.readFileSync(filePath, 'utf8');

        let match: RegExpExecArray | null;
        while ((match = bannedTextRegex.exec(content)) !== null) {
          violations.push({
            file,
            match: match[0],
          });
        }
      });

      expect(
        violations,
        `Accessibility violation: Found text classes smaller than 14px in src/components/workspace:\n${JSON.stringify(violations, null, 2)}`
      ).toEqual([]);
    });
  });

  describe('Part 2: Senior Font Scale & Typography Invariants', () => {
    it('enforces 3-tier senior body font scale (17px, 19px, 21px)', () => {
      expect(SENIOR_FONT_SCALE.normal).toBe(17);
      expect(SENIOR_FONT_SCALE.large).toBe(19);
      expect(SENIOR_FONT_SCALE.xlarge).toBe(21);

      expect(getSeniorFontSize('normal')).toBe('17px');
      expect(getSeniorFontSize('large')).toBe('19px');
      expect(getSeniorFontSize('xlarge')).toBe('21px');
    });

    it('enforces minimum caption limit of 14px', () => {
      expect(SENIOR_TYPOGRAPHY.captionMin).toBe('14px');
      expect(enforceMinCaptionSize(11)).toBe(14);
      expect(enforceMinCaptionSize(12)).toBe(14);
      expect(enforceMinCaptionSize(13)).toBe(14);
      expect(enforceMinCaptionSize(14)).toBe(14);
      expect(enforceMinCaptionSize(17)).toBe(17);
    });

    it('enforces 18px form input font to eliminate iOS auto-zoom', () => {
      expect(SENIOR_TYPOGRAPHY.input).toBe('18px');
    });

    it('enforces prominent tabular key numbers (28px - 32px)', () => {
      expect(SENIOR_TYPOGRAPHY.keyNumber).toBe('28px');
      expect(SENIOR_TYPOGRAPHY.keyNumberLarge).toBe('32px');
    });
  });

  describe('Part 3: Contrast & Touch Target Tokens', () => {
    it('enforces high-contrast control border token (#64748B)', () => {
      expect(WORKSPACE_COLORS.controlBorder.toUpperCase()).toBe('#64748B');
    });

    it('verifies globals.css defines --control-border token with #64748B', () => {
      const globalsCssPath = path.resolve(process.cwd(), 'src/app/globals.css');
      expect(fs.existsSync(globalsCssPath)).toBe(true);

      const cssContent = fs.readFileSync(globalsCssPath, 'utf8');
      expect(cssContent).toMatch(/--control-border:\s*#64748B/i);
    });

    it('enforces minimum 48px touch targets for interactive elements', () => {
      expect(WORKSPACE_TOUCH_TARGETS.min).toBe(48);
      expect(WORKSPACE_TOUCH_TARGETS.minPx).toBe('48px');
      expect(WORKSPACE_TOUCH_TARGETS.primaryAction).toBe(56);
      expect(WORKSPACE_TOUCH_TARGETS.primaryActionPx).toBe('56px');
      expect(WORKSPACE_TOUCH_TARGETS.topbar).toBe(56);
      expect(WORKSPACE_TOUCH_TARGETS.bottomNav).toBe(64);
    });
  });
});
