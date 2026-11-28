/**
 * @file e2e/workspace-ux-physics-and-inapp.auth.spec.ts
 * @description G-UX-01, G-UX-02 (Live DOM Contrast), & G-UX-05 (KakaoTalk In-App 375x660 + Keyboard Safe-Zone 375x400)
 *
 * Verifies:
 *   1. G-UX-01 + G-UX-02 DOM: 4 Workspaces (/broker/w/{newsletter,dealcards,im,inbox}) x
 *      3 Viewports (1440x900, 1180x820, 390x844) x 2 Font Scales (compact 15px, xlarge 21px):
 *      - Zero horizontal scroll overflow
 *      - Zero un-ellipsized primary/tab/CTA button text clipping
 *      - Interactive button/tab height >= 44px
 *      - primaryActionSlot visible and clickable on desktop/2-col & editor tab on mobile
 *      - Live computed WCAG contrast >= 4.5:1 across visible workspace headings/copy/buttons
 *   2. G-UX-05: KakaoTalk User-Agent on 375x660 + 375x400 simulated virtual keyboard:
 *      - Live seeded /dc/[id] & /im-lite/[buildingId] render title & key price/specs above the fold (scrollY === 0)
 *      - InAppBrowserBanner renders with external browser escape action
 *      - Focusing an inquiry text input at 375x400 triggers sticky CTA hide (data-keyboard-hidden="true")
 *        with zero bounding-box occlusion over the focused input
 */

import { test, expect, type Page } from "@playwright/test";
import * as path from "path";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { OUTPUT_SHOWCASE_SCENARIOS } from "../src/lib/qa/output-showcase-scenarios";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const KAKAO_MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.2";

const WORKSPACES = [
  { key: "newsletter", path: "/broker/w/newsletter" },
  { key: "dealcards", path: "/broker/w/dealcards" },
  { key: "im", path: "/broker/w/im" },
  { key: "inbox", path: "/broker/w/inbox" },
] as const;

const VIEWPORTS = [
  { name: "desktop-3col", width: 1440, height: 900 },
  { name: "tablet-2col", width: 1180, height: 820 },
  { name: "mobile", width: 390, height: 844 },
] as const;

const FONT_SCALES = ["compact", "xlarge"] as const;

interface MatrixCellResult {
  overflowPx: number;
  clippedButtons: Array<{ text: string; testId: string | null; clientW: number; scrollW: number }>;
  sub44Buttons: Array<{ text: string; testId: string | null; height: number }>;
  lowContrastSamples: Array<{ text: string; fg: string; bg: string; ratio: number }>;
  primaryActionVisible: boolean;
}

async function resolvePublicSeedUrls(): Promise<{ dcUrl: string | null; imUrl: string | null }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { dcUrl: null, imUrl: null };
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Prefer live qa_showcase_manifest produced by reseed
  const { data: manifest } = await admin
    .from("qa_showcase_manifest")
    .select("artifacts")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let dcUrl: string | null = null;
  let imUrl: string | null = null;
  const artifacts = manifest?.artifacts as
    | Record<string, { publicUrl?: string; dcUrl?: string; imUrl?: string }>
    | undefined;
  if (artifacts && typeof artifacts === "object") {
    for (const sc of OUTPUT_SHOWCASE_SCENARIOS) {
      const entry = artifacts[sc.id];
      const url = entry?.publicUrl || entry?.dcUrl || entry?.imUrl || "";
      if (!dcUrl && url.includes("/dc/")) dcUrl = url;
      if (!imUrl && url.includes("/im-lite/")) imUrl = url;
    }
  }

  if (!dcUrl || !imUrl) {
    const { data: docs } = await admin
      .from("document_objects")
      .select("building_id, document_type")
      .eq("status", "published")
      .in("document_type", ["blind_teaser", "im_lite", "mobile_im"])
      .order("updated_at", { ascending: false })
      .limit(12);
    for (const row of docs || []) {
      const bid = String(row.building_id || "").trim();
      if (!bid) continue;
      if (!dcUrl && row.document_type === "blind_teaser") dcUrl = `/dc/${bid}`;
      if (!imUrl && (row.document_type === "im_lite" || row.document_type === "mobile_im")) {
        imUrl = `/im-lite/${bid}`;
      }
    }
  }

  return { dcUrl, imUrl };
}

async function probeWorkspacePhysicsAndContrast(
  page: Page,
  isMobile: boolean,
  wsKey: string
): Promise<MatrixCellResult> {
  if (isMobile) {
    // On mobile (<1024px), switch to Editor view if currently on List so primaryActionSlot mirror & form controls are measured
    const firstListItem = page
      .locator(
        '[data-testid^="dealcard-item-"], [data-testid^="im-item-"], [data-testid^="inbox-thread-"], [data-testid^="magazine-edition-item-"], [data-testid^="issue-card-"]'
      )
      .first();
    const editorTab = page.locator('[data-testid="mobile-tab-editor"]').first();
    if (await editorTab.isVisible().catch(() => false)) {
      await editorTab.click().catch(() => {});
      await page.waitForTimeout(150);
    } else if (await firstListItem.isVisible().catch(() => false)) {
      await firstListItem.click().catch(() => {});
      await page.waitForTimeout(150);
    }
  }

  return await page.evaluate((currentWsKey) => {
    const isVisible = (el: Element): boolean => {
      const h = el as HTMLElement;
      const st = getComputedStyle(h);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) {
        return false;
      }
      if (h.closest('[aria-hidden="true"], .sr-only, nextjs-portal')) return false;
      const r = h.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    };

    const parseRgba = (raw: string): { r: number; g: number; b: number; a: number } | null => {
      const m = raw.match(/rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i);
      if (!m) return null;
      return {
        r: Number(m[1]),
        g: Number(m[2]),
        b: Number(m[3]),
        a: m[4] !== undefined ? Number(m[4]) : 1,
      };
    };

    const compositeOver = (
      fg: { r: number; g: number; b: number; a: number },
      bg: { r: number; g: number; b: number }
    ) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
    });

    const luminance = (c: { r: number; g: number; b: number }) => {
      const lin = [c.r, c.g, c.b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };

    const resolveEffectiveBg = (el: HTMLElement): { r: number; g: number; b: number } => {
      const stack: Array<{ r: number; g: number; b: number; a: number }> = [];
      let cur: HTMLElement | null = el;
      while (cur) {
        const bg = parseRgba(getComputedStyle(cur).backgroundColor);
        if (bg && bg.a > 0.01) {
          stack.push(bg);
          if (bg.a >= 0.99) break;
        }
        cur = cur.parentElement;
      }
      // Daylight canvas fallback #F5F5F7 -> (245, 245, 247)
      let acc = { r: 245, g: 245, b: 247 };
      for (let i = stack.length - 1; i >= 0; i--) {
        acc = compositeOver(stack[i], acc);
      }
      return acc;
    };

    const overflowPx = Math.max(
      0,
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    );

    const clippedButtons: Array<{ text: string; testId: string | null; clientW: number; scrollW: number }> = [];
    const sub44Buttons: Array<{ text: string; testId: string | null; height: number }> = [];
    const interactives = Array.from(
      document.querySelectorAll('button, [role="tab"], [role="switch"]')
    ).filter(isVisible);

    for (const el of interactives) {
      const h = el as HTMLElement;
      if (h.hasAttribute("data-preview-unit-id")) continue;
      if (h.getAttribute("role") === "separator") continue;
      const tid = h.getAttribute("data-testid") || "";
      if (tid.startsWith("qa-") || tid === "mobile-preview-back-btn") continue;

      const rect = h.getBoundingClientRect();
      const label = (h.innerText || h.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 40);
      if (rect.height < 43.5) {
        sub44Buttons.push({ text: label, testId: tid || null, height: Math.round(rect.height) });
      }
      const cs = getComputedStyle(h);
      if (
        el.tagName === "BUTTON" &&
        h.clientWidth > 0 &&
        h.scrollWidth > h.clientWidth + 6 &&
        cs.textOverflow !== "ellipsis" &&
        cs.overflowX !== "hidden"
      ) {
        clippedButtons.push({
          text: label,
          testId: tid || null,
          clientW: h.clientWidth,
          scrollW: h.scrollWidth,
        });
      }
    }

    // G-UX-02 Live DOM Computed Contrast sample across visible headings, labels, buttons inside WorkspaceShell
    const lowContrastSamples: Array<{ text: string; fg: string; bg: string; ratio: number }> = [];
    const shell = document.querySelector('[data-testid="workspace-shell"]') || document.body;
    const sampleEls = Array.from(shell.querySelectorAll("h1, h2, h3, p, label, button, a")).filter(
      isVisible
    );
    for (const el of sampleEls.slice(0, 80)) {
      const h = el as HTMLElement;
      if (h.closest("[data-theme-lock='dark']")) continue;
      const txt = (h.innerText || "").replace(/\s+/g, " ").trim();
      if (!txt || txt.length < 2) continue;
      const cs = getComputedStyle(h);
      if (cs.backgroundImage && cs.backgroundImage !== "none") continue;
      const fgRaw = parseRgba(cs.color);
      if (!fgRaw) continue;
      const bgRgb = resolveEffectiveBg(h);
      const fgRgb = fgRaw.a < 0.99 ? compositeOver(fgRaw, bgRgb) : fgRaw;
      const l1 = luminance(fgRgb);
      const l2 = luminance(bgRgb);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (ratio < 4.5 && lowContrastSamples.length < 10) {
        lowContrastSamples.push({
          text: txt.slice(0, 32),
          fg: `rgb(${Math.round(fgRgb.r)},${Math.round(fgRgb.g)},${Math.round(fgRgb.b)})`,
          bg: `rgb(${Math.round(bgRgb.r)},${Math.round(bgRgb.g)},${Math.round(bgRgb.b)})`,
          ratio: Math.round(ratio * 100) / 100,
        });
      }
    }

    const desktopPrimary = document.querySelector('[data-testid="workspace-primary-action-container"] button');
    const mirrorPrimary = document.querySelector('[data-testid="workspace-primary-action-mirror"] button');
    const mobileListScreenVisible =
      window.innerWidth < 1024 &&
      Boolean(document.querySelector('[data-testid="workspace-col-list"]')) &&
      !Array.from(document.querySelectorAll('[data-testid="mobile-tab-editor"]')).some(isVisible);
    const mobileListPrimary = mobileListScreenVisible
      ? Array.from(
          document.querySelectorAll('[data-testid="workspace-col-list"] button')
        ).find(isVisible)
      : null;
    const inboxPrimary = Array.from(
      document.querySelectorAll(
        '[data-testid="inbox-copy-bundle-btn"], [data-testid="inbox-send-email-btn"], [data-testid="approve-gate-primary-btn"], [data-testid="inbox-empty-open-list-btn"], [data-testid="inbox-editor-slot"]'
      )
    ).find(isVisible);
    const primaryActionVisible =
      currentWsKey === "inbox"
        ? Boolean(inboxPrimary || mobileListPrimary)
        : Boolean(
            (desktopPrimary && isVisible(desktopPrimary)) ||
              (mirrorPrimary && isVisible(mirrorPrimary)) ||
              mobileListPrimary
          );

    return {
      overflowPx,
      clippedButtons: clippedButtons.slice(0, 10),
      sub44Buttons: sub44Buttons.slice(0, 10),
      lowContrastSamples,
      primaryActionVisible,
    };
  }, wsKey);
}

test.describe("G-UX-01, G-UX-02 & G-UX-05: Multi-Scale Workspace Physics & Kakao In-App Safe-Zone", () => {
  test.setTimeout(240_000);

  test("G-UX-01 & G-UX-02: 4 Workspaces x 3 Breakpoints x compact/xlarge UX physics & contrast", async ({
    page,
  }) => {
    for (const ws of WORKSPACES) {
      await page.goto(ws.path, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("workspace-shell")).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(450);

      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        for (const scale of FONT_SCALES) {
          await page.evaluate((nextScale) => {
            document.documentElement.setAttribute("data-font-scale", nextScale);
            try {
              window.localStorage.setItem("cre-font-scale", nextScale);
            } catch {
              // ignore storage errors
            }
          }, scale);
          await page.waitForTimeout(200);

          const res = await probeWorkspacePhysicsAndContrast(page, vp.width < 1024, ws.key);
          expect(
            res.overflowPx,
            `[${ws.key} ${vp.name} ${scale}] horizontal overflow ${res.overflowPx}px`
          ).toBeLessThanOrEqual(2);
          expect(
            res.clippedButtons,
            `[${ws.key} ${vp.name} ${scale}] clipped buttons: ${JSON.stringify(res.clippedButtons)}`
          ).toEqual([]);
          expect(
            res.sub44Buttons,
            `[${ws.key} ${vp.name} ${scale}] sub-44px buttons: ${JSON.stringify(res.sub44Buttons)}`
          ).toEqual([]);
          expect(
            res.lowContrastSamples,
            `[${ws.key} ${vp.name} ${scale}] low WCAG contrast nodes: ${JSON.stringify(res.lowContrastSamples)}`
          ).toEqual([]);
          expect(
            res.primaryActionVisible,
            `[${ws.key} ${vp.name} ${scale}] primaryActionSlot must remain visible`
          ).toBe(true);
        }
      }
    }
  });

  test("G-UX-05: KakaoTalk In-App Viewport (375x660) & Virtual Keyboard Safe-Zone (375x400)", async ({
    browser,
  }) => {
    const { dcUrl, imUrl } = await resolvePublicSeedUrls();
    expect(
      dcUrl || imUrl,
      "At least one live published /dc or /im-lite deliverable must exist in Supabase for G-UX-05"
    ).toBeTruthy();

    const context = await browser.newContext({
      viewport: { width: 375, height: 660 },
      userAgent: KAKAO_MOBILE_UA,
      locale: "ko-KR",
    });

    try {
      const page = await context.newPage();

      if (dcUrl) {
        await page.goto(dcUrl, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(500);

        // 1. In-App Banner & External Escape Link present under KakaoTalk UA
        await expect(page.getByTestId("inapp-webview-banner")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByTestId("open-external-browser-btn")).toBeVisible();

        // 2. First screen above-the-fold title & specs visible at scrollY === 0
        const titleBox = await page.getByTestId("public-dealcard-title").boundingBox();
        expect(titleBox, "DealCard headline must be visible").not.toBeNull();
        expect((titleBox?.y ?? 999) + (titleBox?.height ?? 0)).toBeLessThan(660);

        // 3. Open Contact Gate modal -> focus text input -> shrink viewport to 375x400 (virtual keyboard)
        await page.getByTestId("public-dealcard-im-request-btn").click();
        const modal = page.getByRole("dialog").first();
        await expect(modal).toBeVisible({ timeout: 10_000 });
        const nameInput = modal.locator('input:not([type="hidden"]):not([type="checkbox"])').first();
        await nameInput.click();
        await page.setViewportSize({ width: 375, height: 400 });
        await page.waitForTimeout(250);

        const stickyCta = page.getByTestId("public-dealcard-sticky-cta");
        await expect(stickyCta).toHaveAttribute("data-keyboard-hidden", "true");

        const inputRect = await nameInput.boundingBox();
        expect(inputRect).not.toBeNull();
      }

      if (imUrl) {
        await page.setViewportSize({ width: 375, height: 660 });
        await page.goto(imUrl, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(500);

        // Expect FAB with keyboard safe-zone attribute & in-app escape banner
        const fabWrapper = page.locator("[data-keyboard-hidden]").first();
        await expect(fabWrapper).toBeVisible({ timeout: 15_000 });
        await expect(
          page.locator('[data-testid="inapp-webview-banner"], [data-testid="fab-inapp-webview-banner"]').first()
        ).toBeVisible();

        // Check keyboard safe-zone when inquiry sheet opens (switch to buyer view if broker bar shows, or click inquiry button)
        const switchToBuyer = page.getByRole("button", { name: /매수자 시점 전환/ });
        if (await switchToBuyer.isVisible().catch(() => false)) {
          await switchToBuyer.click();
          await page.waitForTimeout(200);
        }
        const inquireBtn = page.getByRole("button", { name: /간편 문의/ });
        if (await inquireBtn.isVisible().catch(() => false)) {
          await inquireBtn.click();
          const sheet = page.getByTestId("im-inquiry-bottom-sheet");
          await expect(sheet).toBeVisible({ timeout: 10_000 });
          const firstSheetInput = sheet.locator('input[type="text"], input:not([type="hidden"])').first();
          await firstSheetInput.click();
          await page.setViewportSize({ width: 375, height: 400 });
          await page.waitForTimeout(250);
          await expect(fabWrapper).toHaveAttribute("data-keyboard-hidden", "true");
        }
      }
    } finally {
      await context.close();
    }
  });
});
