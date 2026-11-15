// @vitest-environment jsdom
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import {
  FontScaleToggle,
  FONT_SCALE_STORAGE_KEY,
  LEGACY_FONT_SCALE_STORAGE_KEY,
  FONT_SCALE_EVENT,
} from "@/components/workspace/FontScaleToggle";
import { ReaderFontScaleToggle } from "@/components/ui/ReaderFontScaleToggle";

const ROOT = process.cwd();

function readProjectFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf-8");
}

describe("Wave 5 WP-15 — 4-Step rem Font Scale Engine, Pre-Paint FOUC Script, Reader Toggle & px->rem Conversion", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.fontScale;
  });

  describe("1. globals.css rem root scaling, iOS safe floor & reduced motion", () => {
    const css = readProjectFile("src/app/globals.css");

    it("anchors html root to --font-scale-normal (17px) and body / .broker-paper-theme to 1rem", () => {
      expect(css).toContain("--font-scale-normal: 17px;");
      expect(css).toMatch(/html\s*\{[\s\S]*?font-size:\s*var\(--font-scale-normal,\s*17px\);/);
      expect(css).toMatch(/body\s*\{[\s\S]*?font-size:\s*1rem;/);
      expect(css).not.toMatch(/body\s*\{[^}]*font-size:\s*17px;/);
      expect(css).toMatch(/\.broker-paper-theme\s*\{[\s\S]*?font-size:\s*1rem;/);
    });

    it("defines all 4 [data-font-scale] steps (15px, 17px, 19px, 21px)", () => {
      expect(css).toMatch(/\[data-font-scale="compact"\]\s*\{[\s\S]*?font-size:\s*15px;/);
      expect(css).toMatch(/\[data-font-scale="normal"\]\s*\{[\s\S]*?font-size:\s*17px;/);
      expect(css).toMatch(/\[data-font-scale="large"\]\s*\{[\s\S]*?font-size:\s*19px;/);
      expect(css).toMatch(/\[data-font-scale="xlarge"\]\s*\{[\s\S]*?font-size:\s*21px;/);
    });

    it("prevents caption double-shrinking below 13px and enforces >= 16px input floor in compact mode", () => {
      expect(css).toContain("--text-xs: max(13px, 0.8125rem);");
      expect(css).toMatch(
        /\[data-font-scale="compact"\]\s+select\s*\{\s*font-size:\s*max\(16px,\s*1rem\)\s*!important;/
      );
      expect(css).not.toMatch(
        /\[data-font-scale="compact"\]\s+select\s*\{\s*font-size:\s*15px\s*!important;/
      );
      expect(css).toMatch(/\.ws-caption-min\s*\{[\s\S]*?font-size:\s*max\(13px,\s*0\.8235rem\);/);
    });

    it("includes @media (prefers-reduced-motion: reduce) accessibility guard", () => {
      expect(css).toContain("@media (prefers-reduced-motion: reduce)");
      expect(css).toContain("animation-duration: 0.01ms !important;");
      expect(css).toContain("animation-iteration-count: 1 !important;");
      expect(css).toContain("transition-duration: 0.01ms !important;");
      expect(css).toContain("scroll-behavior: auto !important;");
    });
  });

  describe("2. layout.tsx pre-paint zero-FOUC bootstrap", () => {
    const layoutSrc = readProjectFile("src/app/layout.tsx");

    it("sets data-font-scale='normal' and suppressHydrationWarning on <html> with synchronous <script>", () => {
      expect(layoutSrc).toContain('data-font-scale="normal"');
      expect(layoutSrc).toContain("suppressHydrationWarning");
      expect(layoutSrc).toContain("credeal-workspace-font-scale-v1");
      expect(layoutSrc).toContain("cre-font-scale");
      expect(layoutSrc).toContain("dangerouslySetInnerHTML={{ __html: FONT_SCALE_INIT_SCRIPT }}");
    });

    it("executes pre-paint bootstrap logic accurately for valid and invalid stored values", () => {
      const match = layoutSrc.match(/const FONT_SCALE_INIT_SCRIPT\s*=\s*`([^`]+)`;/);
      expect(match).not.toBeNull();
      const scriptBody = match![1];

      // Legacy key fallback syncs both keys & dataset
      window.localStorage.setItem(LEGACY_FONT_SCALE_STORAGE_KEY, "xlarge");
      new Function(scriptBody)();
      expect(document.documentElement.dataset.fontScale).toBe("xlarge");
      expect(window.localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe("xlarge");
      expect(window.localStorage.getItem(LEGACY_FONT_SCALE_STORAGE_KEY)).toBe("xlarge");

      // Invalid value does not corrupt dataset
      document.documentElement.dataset.fontScale = "normal";
      window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, "malicious-script");
      new Function(scriptBody)();
      expect(document.documentElement.dataset.fontScale).toBe("normal");
    });
  });

  describe("3. FontScaleToggle 4-step workspace control", () => {
    it("renders all 4 buttons with min-h-[44px], updates html[data-font-scale], and syncs both storage keys", async () => {
      const events: string[] = [];
      const handler = (e: Event) => events.push((e as CustomEvent<string>).detail);
      window.addEventListener(FONT_SCALE_EVENT, handler);

      const { getByTestId } = render(<FontScaleToggle />);

      const compactBtn = getByTestId("workspace-font-scale-compact");
      const normalBtn = getByTestId("workspace-font-scale-normal");
      const largeBtn = getByTestId("workspace-font-scale-large");
      const xlargeBtn = getByTestId("workspace-font-scale-xlarge");

      expect(compactBtn.textContent).toBe("표준 글씨");
      expect(normalBtn.textContent).toBe("큰글씨");
      expect(largeBtn.textContent).toBe("더 크게");
      expect(xlargeBtn.textContent).toBe("아주 크게");

      for (const btn of [compactBtn, normalBtn, largeBtn, xlargeBtn]) {
        expect(btn.className).toContain("min-h-[44px]");
      }

      await act(async () => {
        fireEvent.click(largeBtn);
      });
      expect(document.documentElement.dataset.fontScale).toBe("large");
      expect(window.localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe("large");
      expect(window.localStorage.getItem(LEGACY_FONT_SCALE_STORAGE_KEY)).toBe("large");

      await act(async () => {
        fireEvent.click(xlargeBtn);
      });
      expect(document.documentElement.dataset.fontScale).toBe("xlarge");
      expect(window.localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe("xlarge");
      expect(window.localStorage.getItem(LEGACY_FONT_SCALE_STORAGE_KEY)).toBe("xlarge");

      await act(async () => {
        fireEvent.click(compactBtn);
      });
      expect(document.documentElement.dataset.fontScale).toBe("compact");
      expect(window.localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe("compact");
      expect(window.localStorage.getItem(LEGACY_FONT_SCALE_STORAGE_KEY)).toBe("compact");

      expect(events).toEqual(["large", "xlarge", "compact"]);
      window.removeEventListener(FONT_SCALE_EVENT, handler);
    });
  });

  describe("4. ReaderFontScaleToggle senior buyer control & public viewer mounting", () => {
    it("cycles 표준 -> 크게 -> 아주 크게 -> 표준 with min-h-[44px] and persists to localStorage", async () => {
      const { getByTestId } = render(<ReaderFontScaleToggle variant="light" />);
      const toggle = getByTestId("reader-font-scale-toggle");
      const label = getByTestId("reader-font-scale-label");

      expect(toggle.className).toContain("min-h-[44px]");
      expect(toggle.textContent).toContain("가+ 글자 크기");
      expect(toggle.getAttribute("aria-expanded")).toBeNull();
      expect(label.textContent).toBe("표준");

      await act(async () => {
        fireEvent.click(toggle);
      });
      expect(document.documentElement.dataset.fontScale).toBe("large");
      expect(label.textContent).toBe("크게");
      expect(window.localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe("large");

      await act(async () => {
        fireEvent.click(toggle);
      });
      expect(document.documentElement.dataset.fontScale).toBe("xlarge");
      expect(label.textContent).toBe("아주 크게");
      expect(window.localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe("xlarge");

      await act(async () => {
        fireEvent.click(toggle);
      });
      expect(document.documentElement.dataset.fontScale).toBe("normal");
      expect(label.textContent).toBe("표준");
      expect(window.localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe("normal");
    });

    it("mounts ReaderFontScaleToggle in /dc/[id]/page.tsx and mobile-im-viewer.tsx with WCAG contrast", () => {
      const dcPage = readProjectFile("src/app/(public)/dc/[id]/page.tsx");
      const mobileIm = readProjectFile("src/app/(public)/im-lite/[buildingId]/mobile-im-viewer.tsx");

      expect(dcPage).toContain("ReaderFontScaleToggle");
      expect(dcPage).not.toContain("text-stone-400");
      expect(dcPage).not.toContain("text-slate-400");
      expect(mobileIm).toContain("ReaderFontScaleToggle");
    });
  });

  describe("5. Zero hardcoded micro-pixel font classes in remediated components", () => {
    const targetFiles = [
      "src/components/teaser/CuriosityLock.tsx",
      "src/components/workspace/MobileRentRollCards.tsx",
      "src/components/help/ContextualHelpDrawer.tsx",
      "src/components/ui/toast-provider.tsx",
      "src/app/(public)/im-lite/[buildingId]/mobile-im-viewer.tsx",
      "src/app/(broker)/broker/profile/page.tsx",
    ];

    it.each(targetFiles)("contains zero text-[10px]~text-[15px] classes in %s", (relPath) => {
      const src = readProjectFile(relPath);
      expect(src).not.toMatch(/text-\[(?:10|10\.5|11|12|13|14|15)px\]/);
    });

    it("uses rem fontSize in toast-provider.tsx instead of hardcoded 14px", () => {
      const toastSrc = readProjectFile("src/components/ui/toast-provider.tsx");
      expect(toastSrc).toContain("fontSize: '0.875rem'");
      expect(toastSrc).not.toContain("fontSize: '14px'");
    });
  });
});
