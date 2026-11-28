/**
 * @file src/tests/golden/wcag-contrast-and-theme-ratchet.test.ts
 * @description G-UX-02 Golden Guard: Computed WCAG 2.1 Contrast, Migrated Surface Zero-Dark-Class Gate,
 *   Untouched Sub-Route Legacy Dark Class Ratchet, and `globals.css` `.broker-paper-theme` `!important` Ratchet.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  parseCssColor,
  compositeRgba,
  relativeLuminance,
  getContrastRatio,
} from "@/lib/ux/wcag-contrast";

const ROOT = process.cwd();

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsx(fullPath, out);
    } else if (entry.name.endsWith(".tsx")) {
      out.push(fullPath.replace(/\\/g, "/"));
    }
  }
  return out;
}

/**
 * Matches legacy dark surface/background classes (`bg-[#0b0f19]`, `bg-[#0d1424]`,
 * `bg-[#0f172a]`, `bg-neutral-950`, `bg-neutral-900`, `dark:bg-zinc-950`,
 * `dark:bg-zinc-900`, `bg-slate-900/*`, `bg-zinc-900`).
 */
const LEGACY_DARK_SURFACE_RE =
  /(?<![A-Za-z0-9_-])(?:bg-\[#0b0f19\]|bg-\[#0d1424\](?:\/[0-9]+)?|bg-\[#0f172a\](?:\/[0-9]+)?|bg-neutral-950(?:\/[0-9]+)?|bg-neutral-900(?:\/[0-9]+)?|dark:bg-zinc-950|dark:bg-zinc-900(?:\/[0-9]+)?|bg-slate-900\/(?:[0-9]+|\[[^\]]+\])|bg-zinc-900)(?=$|[\s"'`}])/g;

interface DarkMatch {
  line: number;
  token: string;
}

function findLegacyDarkSurfaceMatches(content: string): DarkMatch[] {
  const lines = content.split("\n");
  const matches: DarkMatch[] = [];
  let lockDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Ignore lines or regions explicitly marked data-theme-lock="dark"
    if (line.includes('data-theme-lock="dark"')) {
      const opens = (line.match(/<[A-Za-z]/g) || []).length;
      const closes = (line.match(/<\/[A-Za-z]/g) || []).length + (line.match(/\/>/g) || []).length;
      if (opens > closes) {
        lockDepth += opens - closes;
      }
      continue;
    }
    if (lockDepth > 0) {
      const opens = (line.match(/<[A-Za-z]/g) || []).length;
      const closes = (line.match(/<\/[A-Za-z]/g) || []).length + (line.match(/\/>/g) || []).length;
      lockDepth = Math.max(0, lockDepth + opens - closes);
      continue;
    }

    let match: RegExpExecArray | null;
    LEGACY_DARK_SURFACE_RE.lastIndex = 0;
    while ((match = LEGACY_DARK_SURFACE_RE.exec(line)) !== null) {
      const token = match[0];
      // Ignore ultra-light alpha tints like bg-slate-900/[0.04]
      if (/^bg-slate-900\/\[0\.0/.test(token)) continue;
      // Ignore modal backdrops (bg-slate-900/45..80 with inset-0 or backdrop-blur)
      if (
        /^bg-slate-900\/(?:45|50|60|70|75|80)$/.test(token) &&
        (line.includes("inset-0") || line.includes("backdrop-blur"))
      ) {
        continue;
      }
      matches.push({ line: i + 1, token });
    }
  }

  return matches;
}

const STRICT_ZERO_BROKER_FILES = new Set([
  "src/app/(broker)/broker/page.tsx",
  "src/app/(broker)/broker/map-capture/page.tsx",
  "src/app/(broker)/broker/circles/page.tsx",
  "src/app/(broker)/broker/matching/page.tsx",
  "src/app/(broker)/broker/tenant-intents/page.tsx",
  "src/app/(broker)/broker/leasing/page.tsx",
  "src/app/(broker)/broker/lease-card/page.tsx",
  "src/app/(broker)/broker/pipeline/page.tsx",
]);

function isStrictZeroBrokerFile(relPath: string): boolean {
  return (
    STRICT_ZERO_BROKER_FILES.has(relPath) ||
    relPath.startsWith("src/app/(broker)/broker/w/") ||
    relPath.startsWith("src/app/(broker)/broker/magazine-editor/") ||
    relPath.startsWith("src/app/(broker)/broker/_components/")
  );
}

/**
 * Exact reduced ceiling for `!important` occurrences inside `.broker-paper-theme`
 * in `src/app/globals.css` after Wave 4 dead-selector & dead-rule cleanup (83 -> 82).
 */
const MAX_BROKER_PAPER_IMPORTANT_COUNT = 82;

/**
 * Exact current count of legacy dark surface class occurrences across the remaining
 * untouched secondary sub-routes under `src/app/(broker)`. Future cleanup waves
 * may only ratchet this ceiling downward.
 */
const MAX_LEGACY_SUBROUTE_DARK_CLASS_COUNT = 50;

describe("G-UX-02: Computed WCAG 2.1 Contrast & Theme Ratchet Golden", () => {
  describe("1. Computed WCAG 2.1 Contrast Utility & Cupertino Daylight Glass Tokens", () => {
    it("parses hex/rgba colors, composites translucent glass over backdrop, and computes relative luminance", () => {
      expect(parseCssColor("#1D1D1F")).toEqual({ r: 29, g: 29, b: 31, a: 1 });
      expect(parseCssColor("rgba(255, 255, 255, 0.72)")).toEqual({
        r: 255,
        g: 255,
        b: 255,
        a: 0.72,
      });

      const composited = compositeRgba(
        parseCssColor("rgba(255, 255, 255, 0.72)"),
        parseCssColor("#F5F5F7")
      );
      expect(composited.a).toBeCloseTo(1, 5);
      expect(composited.r).toBeCloseTo(252.2, 1);

      expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
      expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 6);
    });

    it("enforces WCAG AAA (>= 7.0) for primary & tertiary Cupertino ink on canvas and frosted glass", () => {
      // #1D1D1F on #F5F5F7 canvas
      expect(getContrastRatio("#1D1D1F", "#F5F5F7")).toBeGreaterThanOrEqual(7.0);
      // #1D1D1F on rgba(255,255,255,0.72) frosted glass over #F5F5F7 backdrop
      expect(
        getContrastRatio("#1D1D1F", "rgba(255, 255, 255, 0.72)", "#F5F5F7")
      ).toBeGreaterThanOrEqual(7.0);
      // #515154 secondary/tertiary label on #F5F5F7 canvas
      expect(getContrastRatio("#515154", "#F5F5F7")).toBeGreaterThanOrEqual(7.0);
    });

    it("enforces WCAG AA (>= 4.5) for interactive blue links, 4-door white-text active pills, and control borders on #FFFFFF", () => {
      expect(getContrastRatio("#0055D4", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio("#1D4ED8", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio("#047857", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio("#B45309", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio("#BE185D", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio("#64748B", "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    });

    it("enforces WCAG AAA (>= 7.0) for dark-locked header ink (#FFFFFF, #93C5FD, #CBD5E1) on #0F172A", () => {
      expect(getContrastRatio("#FFFFFF", "#0F172A")).toBeGreaterThanOrEqual(7.0);
      expect(getContrastRatio("#93C5FD", "#0F172A")).toBeGreaterThanOrEqual(7.0);
      expect(getContrastRatio("#CBD5E1", "#0F172A")).toBeGreaterThanOrEqual(7.0);
    });
  });

  describe("2. Migrated Broker Surfaces & Sub-Route Legacy Dark Class Ratchet", () => {
    const brokerRoot = path.resolve(ROOT, "src/app/(broker)");
    const allBrokerTsx = walkTsx(brokerRoot).map((abs) =>
      path.relative(ROOT, abs).replace(/\\/g, "/")
    );

    it("asserts 0 occurrences of legacy dark surface classes across main workspaces, hub, magazine-editor, and Wave 4 pages", () => {
      const violations: Array<{ file: string; matches: DarkMatch[] }> = [];

      for (const relPath of allBrokerTsx) {
        if (!isStrictZeroBrokerFile(relPath)) continue;
        const content = fs.readFileSync(path.resolve(ROOT, relPath), "utf8");
        const matches = findLegacyDarkSurfaceMatches(content);
        if (matches.length > 0) {
          violations.push({ file: relPath, matches });
        }
      }

      expect(
        violations,
        `Legacy dark surface classes found on migrated broker surfaces:\n${JSON.stringify(violations, null, 2)}`
      ).toEqual([]);
    });

    it(`enforces legacy dark class ratchet ceiling (<= ${MAX_LEGACY_SUBROUTE_DARK_CLASS_COUNT}) on untouched secondary sub-routes`, () => {
      let totalUntouchedCount = 0;

      for (const relPath of allBrokerTsx) {
        if (isStrictZeroBrokerFile(relPath)) continue;
        const content = fs.readFileSync(path.resolve(ROOT, relPath), "utf8");
        totalUntouchedCount += findLegacyDarkSurfaceMatches(content).length;
      }

      expect(totalUntouchedCount).toBeLessThanOrEqual(MAX_LEGACY_SUBROUTE_DARK_CLASS_COUNT);
    });
  });

  describe("3. globals.css .broker-paper-theme !important Ratchet", () => {
    it(`asserts .broker-paper-theme !important count <= ${MAX_BROKER_PAPER_IMPORTANT_COUNT}`, () => {
      const globalsCss = fs.readFileSync(
        path.resolve(ROOT, "src/app/globals.css"),
        "utf8"
      );
      const start = globalsCss.indexOf(".broker-paper-theme {");
      const end = globalsCss.indexOf("/* 9. Apple iOS Spatial Glass");
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);

      const themeBlock = globalsCss.slice(start, end);
      const importantCount = (themeBlock.match(/!important/g) || []).length;

      expect(importantCount).toBeLessThanOrEqual(MAX_BROKER_PAPER_IMPORTANT_COUNT);
    });
  });
});
