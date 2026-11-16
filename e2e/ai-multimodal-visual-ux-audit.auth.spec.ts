/**
 * @file e2e/ai-multimodal-visual-ux-audit.auth.spec.ts
 * @description AP-WP-08 & AP-WP-09:
 *   1. Verifies `/api/public/qa-workbench?mode=showcase` returns 22 live deliverables (AP-WP-09).
 *   2. Audits core workspace, public buyer, and QA dual-portal screens across
 *      Desktop (1440×900 normal), Mobile (390×844 normal), and Mobile Senior XLarge (390×844 21px).
 *   3. Captures PNG screenshots in artifact scratch dir for Multimodal AI Vision review
 *      and asserts horizontalOverflowPx <= 1, 0 uncaught pageerrors, and 0 poison tokens.
 */
import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const AUDIT_OUT_DIR =
  "C:/Users/User/.gemini/antigravity/brain/ab2d6630-6d53-432f-b049-2749817d2eec/scratch/visual_audit_v6";

const RAW_ERROR_REGEX =
  /PGRST|relation .* does not exist|column .* does not exist|syntax error|\[object Object\]|>NaN<|>undefined<|>null</;

interface RouteSpec {
  id: string;
  url: string;
  captureXlargePng?: boolean;
}

interface ViewAuditResult {
  id: string;
  url: string;
  viewport: string;
  fontScale: "normal" | "xlarge";
  status: number | null;
  horizontalOverflowPx: number;
  pageErrors: string[];
  hasPoisonText: boolean;
  screenshotPath?: string;
}

async function hideDevOverlay(page: Page) {
  await page
    .addStyleTag({
      content:
        "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-tools-button]{display:none!important}",
    })
    .catch(() => {});
}

async function applyFontScale(page: Page, scale: "normal" | "xlarge") {
  await page.evaluate((s) => {
    document.documentElement.setAttribute("data-font-scale", s);
    window.localStorage.setItem("credeal-font-scale", s);
    window.localStorage.setItem("cre-font-scale", s);
  }, scale);
  await page.waitForTimeout(300);
}

test.describe("AP-WP-08 & AP-WP-09: Multimodal Visual & UX Physics Audit", () => {
  test.setTimeout(300_000);

  test("verifies 22 showcase deliverables and audits routes across 1440 normal, 390 normal, and 390 xlarge (21px)", async ({
    page,
  }) => {
    fs.mkdirSync(AUDIT_OUT_DIR, { recursive: true });

    // AP-WP-09: Verify 22-Deliverable Showcase Manifest
    const manifestRes = await page.request.get(
      "/api/public/qa-workbench?mode=showcase"
    );
    expect(manifestRes.ok()).toBe(true);
    const manifestJson = await manifestRes.json();
    expect(manifestJson.ok).toBe(true);
    const entries = (manifestJson.manifest?.entries || {}) as Record<
      string,
      { liveUrl?: string }
    >;
    expect(Object.keys(entries).length).toBeGreaterThanOrEqual(22);

    const dcLiveUrl = entries["DC-01"]?.liveUrl || "/dc/sample";
    const imLiveUrl = entries["IM-01"]?.liveUrl || "/im-lite/sample";
    const nlLiveUrl = entries["NL-M1"]?.liveUrl || "/magazine";

    const testerKey = (process.env.QA_TESTER_ACCESS_KEY || "").trim();
    const brokerKey = (process.env.QA_BROKER_ACCESS_KEY || "").trim();
    const testerQs = testerKey ? `?key=${encodeURIComponent(testerKey)}` : "";
    const brokerQs = brokerKey ? `?key=${encodeURIComponent(brokerKey)}` : "";

    const routes: RouteSpec[] = [
      { id: "01_home", url: "/" },
      { id: "02_login", url: "/login" },
      { id: "03_broker_home", url: "/broker" },
      { id: "04_broker_profile", url: "/broker/profile" },
      { id: "05_broker_tutorial", url: "/broker/tutorial" },
      {
        id: "06_dealcards",
        url: "/broker/w/dealcards?fresh=1",
        captureXlargePng: true,
      },
      { id: "07_im", url: "/broker/w/im?fresh=1", captureXlargePng: true },
      {
        id: "08_magazine_editor",
        url: "/broker/magazine-editor",
        captureXlargePng: true,
      },
      { id: "09_inbox", url: "/broker/w/inbox", captureXlargePng: true },
      { id: "10_public_dc", url: dcLiveUrl, captureXlargePng: true },
      { id: "11_public_im", url: imLiveUrl, captureXlargePng: true },
      { id: "12_public_magazine", url: nlLiveUrl },
      { id: "13_qa_tester_showcase", url: `/qa-tester/showcase${testerQs}` },
      {
        id: "14_qa_tester_signoff",
        url: `/qa-tester/signoff${testerQs}`,
        captureXlargePng: true,
      },
      { id: "15_qa_broker_showcase", url: `/qa-broker/showcase${brokerQs}` },
      {
        id: "16_qa_broker_signoff",
        url: `/qa-broker/signoff${brokerQs}`,
        captureXlargePng: true,
      },
    ];

    const profiles = [
      {
        label: "1440x900",
        width: 1440,
        height: 900,
        fontScale: "normal" as const,
      },
      {
        label: "390x844",
        width: 390,
        height: 844,
        fontScale: "normal" as const,
      },
      {
        label: "390x844",
        width: 390,
        height: 844,
        fontScale: "xlarge" as const,
      },
    ];

    const results: ViewAuditResult[] = [];

    for (const profile of profiles) {
      await page.setViewportSize({
        width: profile.width,
        height: profile.height,
      });

      for (const route of routes) {
        const pageErrors: string[] = [];
        const onError = (err: Error) => pageErrors.push(err.message);
        page.on("pageerror", onError);

        const navRes = await page.goto(route.url, { waitUntil: "load" });
        await hideDevOverlay(page);
        await page.waitForTimeout(450);
        await applyFontScale(page, profile.fontScale);

        const metrics = await page.evaluate(() => {
          const overflowPx =
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth;
          const text = document.body.innerText || "";
          return { overflowPx, text };
        });

        page.off("pageerror", onError);

        let screenshotPath: string | undefined;
        if (profile.fontScale === "xlarge" && route.captureXlargePng) {
          screenshotPath = path.join(
            AUDIT_OUT_DIR,
            `${route.id}_390_xlarge.png`
          );
          await page.screenshot({
            path: screenshotPath,
            fullPage: false,
          });
        }

        const hasPoisonText = RAW_ERROR_REGEX.test(metrics.text);
        results.push({
          id: route.id,
          url: route.url,
          viewport: profile.label,
          fontScale: profile.fontScale,
          status: navRes?.status() ?? null,
          horizontalOverflowPx: metrics.overflowPx,
          pageErrors,
          hasPoisonText,
          ...(screenshotPath ? { screenshotPath } : {}),
        });

        expect(
          navRes?.status() ?? 500,
          `${route.id} (${profile.label} ${profile.fontScale}) HTTP status`
        ).toBeLessThan(400);
        expect(
          metrics.overflowPx,
          `${route.id} (${profile.label} ${profile.fontScale}) horizontal overflow`
        ).toBeLessThanOrEqual(1);
        expect(
          pageErrors,
          `${route.id} (${profile.label} ${profile.fontScale}) uncaught pageerror`
        ).toEqual([]);
        expect(
          hasPoisonText,
          `${route.id} (${profile.label} ${profile.fontScale}) poison token leaked`
        ).toBe(false);
      }
    }

    fs.writeFileSync(
      path.join(AUDIT_OUT_DIR, "visual_audit_summary.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          totalViewsAudited: results.length,
          showcaseTotalCount: manifestJson.manifest?.totalCount ?? 0,
          results,
        },
        null,
        2
      ),
      "utf-8"
    );
  });
});
