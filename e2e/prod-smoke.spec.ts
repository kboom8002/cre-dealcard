/**
 * @file e2e/prod-smoke.spec.ts
 * @description T3 Live Production Smoke Suite (`credeal.net` 등 실제 배포 사이트 대상 읽기 위주 점검).
 *   실행: `npm run test:prod-smoke` (PROD_SMOKE=1)
 *   주의: 확정된 채널 정책에 따라 알림톡(send_inbox_alimtalk) 실발송을 절대 호출하지 않는다.
 */
import { test, expect } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

test.describe("T3 Live Production Read-Only Smoke (credeal.net)", () => {
  test.setTimeout(90_000);

  test("[Smoke-01] POST /api/public/qa-workbench auto_probe_all returns 4/4 passed + buildStamp", async ({
    request,
  }) => {
    const res = await request.post("/api/public/qa-workbench", {
      data: { mode: "auto_probe_all" },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.totalCount).toBe(4);
    expect(json.passedCount).toBe(4);
    if (json.buildStamp) {
      console.log(
        `🔎 [Prod Smoke] Build Stamp: #${json.buildStamp.shortSha} (${json.buildStamp.env})`
      );
    }
  });

  test("[Smoke-02] /qa-signoff renders cleanly, has zero pageerrors, and runs 1-click Auto-Probe", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const res = await page.goto("/qa-signoff", { waitUntil: "load" });
    expect(res?.status()).toBeLessThan(400);
    await page.waitForTimeout(500);

    await expect(page.getByTestId("signoff-verdict-badge")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("hub-build-stamp-badge")).toBeVisible();
    await expect(page.getByTestId("hub-channel-policy-badge")).toBeVisible();

    const probeBtn = page.getByTestId("run-auto-probe-all-btn");
    await probeBtn.click();
    await page.waitForTimeout(1500);
    const resultsText =
      (await page.getByTestId("auto-probe-results").textContent()) || "";
    if (resultsText.includes("오른쪽 위")) {
      await probeBtn.click();
    }
    await expect(page.getByTestId("auto-probe-results")).toContainText(
      "4/4 자동 통과",
      { timeout: 20_000 }
    );

    expect(pageErrors).toEqual([]);
  });

  test("[Smoke-03] Authenticated 4 workspaces open cleanly with ?qa=1 pin widget (and magazine-editor hides legacy 브리핑 소제목)", async ({
    page,
  }) => {
    const email = (
      process.env.PROD_SMOKE_EMAIL ||
      process.env.E2E_TEST_EMAIL ||
      ""
    ).trim();
    const password = (
      process.env.PROD_SMOKE_PASSWORD ||
      process.env.E2E_TEST_PASSWORD ||
      ""
    ).trim();

    if (!email || !password) {
      test.skip(
        true,
        "PROD_SMOKE_EMAIL/E2E_TEST_EMAIL 미설정 — 공개 스모크만 수행합니다."
      );
      return;
    }

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator("#email").waitFor({ state: "visible", timeout: 30_000 });
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "로그인" }).click();

    await page.waitForURL("**/broker**", { timeout: 45_000 });

    const routes = [
      "/broker/w/dealcards?qa=1",
      "/broker/w/im?qa=1",
      "/broker/magazine-editor?qa=1",
      "/broker/w/inbox?qa=1",
    ];

    for (const route of routes) {
      const resp = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(resp?.status(), `Route ${route} failed`).toBeLessThan(400);
      await expect(page.getByTestId("qa-pin-fab")).toBeVisible({
        timeout: 25_000,
      });
      await expect(page.getByTestId("qa-build-stamp-badge")).toBeVisible();

      if (route.includes("/broker/magazine-editor")) {
        await expect(page.getByText("브리핑 소제목")).toHaveCount(0);
      }
    }

    // Cleanup QA overlay flag so test browser storage remains clean
    await page.getByTestId("qa-pin-fab").click();
    await page.getByTestId("qa-pin-disable-btn").click();
    expect(pageErrors).toEqual([]);
  });

  test("[Smoke-04] Public login & newsletter/OG C-04 health routes respond cleanly", async ({
    request,
  }) => {
    const loginRes = await request.get("/login");
    expect(loginRes.status()).toBeLessThan(400);

    // C-04 contract: missing brokerId returns 400 with neutral image/png (no-store)
    const bareOgRes = await request.get("/api/og/magazine");
    expect(bareOgRes.status()).toBe(400);
    expect(bareOgRes.headers()["content-type"] || "").toContain("image/png");

    // Valid brokerId format renders 200 image/png cleanly via Node OG renderer
    const validOgRes = await request.get(
      "/api/og/magazine?brokerId=smoke-check-broker"
    );
    expect(validOgRes.status()).toBe(200);
    expect(validOgRes.headers()["content-type"] || "").toContain("image/png");
  });
});
