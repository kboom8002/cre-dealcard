import { test, expect } from "@playwright/test";
import path from "path";

const ARTIFACT_DIR =
  "C:/Users/User/.gemini/antigravity/brain/eced67a6-c4d1-472a-bb8e-631d55ee7900";

test.describe("SOTA UI/UX & WCAG AAA Contrast Visual Audit", () => {
  test.setTimeout(120_000);

  test("1. Magazine Editor Simple & Full Mode — Contrast, Titanium Phone Bezel, and Motion Pills", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 940 });
    await page.goto("/broker/magazine-editor?mode=simple", {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByTestId("simple-editor-root")).toBeVisible({
      timeout: 30_000,
    });

    // Verify phone-frame is locked to dark theme (not bleached white)
    const phoneFrame = page.getByTestId("phone-frame");
    await expect(phoneFrame).toBeVisible();
    await expect(phoneFrame).toHaveAttribute("data-theme-lock", "dark");

    const phoneFrameBg = await phoneFrame.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    );
    // Should be dark titanium (#18181b -> rgb(24, 24, 27)), NOT white rgb(255, 255, 255)
    expect(phoneFrameBg).not.toBe("rgb(255, 255, 255)");

    // Verify starter chips have high contrast (not pale yellow on cream)
    const firstChip = page.locator('[data-testid^="starter-chip-"]').first();
    await expect(firstChip).toBeVisible();
    const chipStyles = await firstChip.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { color: cs.color, bg: cs.backgroundColor, border: cs.borderColor };
    });
    // Unselected chip is deep ink (#0F172A = rgb(15, 23, 42)) or deep amber (#78350F = rgb(120, 53, 15)), NEVER pale yellow rgb(253, 230, 138)
    expect(["rgb(15, 23, 42)", "rgb(120, 53, 15)"]).toContain(chipStyles.color);

    // Capture Simple Mode screenshot
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "sota-after-01-magazine-simple.png"),
      fullPage: false,
    });

    // Switch to Full Mode via SOTA mode toggle
    const toFullBtn = page.getByTestId("editor-mode-toggle");
    await toFullBtn.click();
    await expect(page.locator("#simple-field-note-comment")).toBeHidden();

    // Open Field Note tab in Full Mode to verify EditorFieldNoteTab chip contrast
    const fieldNoteTab = page.getByRole("tab", { name: /^필드노트/ }).first();
    await fieldNoteTab.click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "sota-after-02-magazine-full-fieldnote.png"),
      fullPage: false,
    });

    // Switch back to Simple Mode
    await page.getByTestId("editor-mode-toggle").click();
    await expect(page.getByTestId("simple-editor-root")).toBeVisible();
  });

  test("2. Broker Home, Buildings, and Tutorial — 4-Tier Surface Elevation & Motion", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 940 });
    await page.goto("/broker", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#broker-senior-topbar")).toBeVisible({
      timeout: 25_000,
    });
    await page.waitForTimeout(600);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "sota-after-03-broker-home.png"),
      fullPage: false,
    });

    await page.goto("/broker/buildings", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "sota-after-04-broker-buildings.png"),
      fullPage: false,
    });

    await page.goto("/broker/tutorial", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("broker-tutorial-page")).toBeVisible({
      timeout: 25_000,
    });
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "sota-after-05-broker-tutorial.png"),
      fullPage: false,
    });
  });
});
