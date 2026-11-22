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

const QA_ACCESS_KEY = (
  process.env.QA_ACCESS_KEY ||
  process.env.QA_TESTER_ACCESS_KEY ||
  process.env.QA_BROKER_ACCESS_KEY ||
  ""
).trim();

test.describe("T3 Live Production Read-Only Smoke (credeal.net)", () => {
  test.setTimeout(90_000);

  test("[Smoke-01] POST /api/public/qa-workbench auto_probe_all fails closed without auth and returns 4/4 passed with QA key", async ({
    request,
  }) => {
    const unauthRes = await request.post("/api/public/qa-workbench", {
      data: { mode: "auto_probe_all" },
    });
    expect([401, 404]).toContain(unauthRes.status());

    if (!QA_ACCESS_KEY) {
      test.skip(true, "QA_ACCESS_KEY 미설정 — 인증 프로브는 건너뛰고 비인증 fail-closed만 검증합니다.");
      return;
    }

    const res = await request.post("/api/public/qa-workbench", {
      headers: { "x-qa-access-key": QA_ACCESS_KEY },
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

  test("[Smoke-02] /qa-signoff fails closed without key, renders cleanly with key, and runs 1-click Auto-Probe", async ({
    page,
    request,
  }) => {
    const denied = await request.get("/qa-signoff", { maxRedirects: 0 });
    expect(denied.status()).toBe(404);

    if (!QA_ACCESS_KEY) {
      test.skip(true, "QA_ACCESS_KEY 미설정 — /qa-signoff 인증 화면 스모크를 건너뜁니다.");
      return;
    }

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const res = await page.goto(
      `/qa-signoff?qaKey=${encodeURIComponent(QA_ACCESS_KEY)}`,
      { waitUntil: "load" }
    );
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

    if (!QA_ACCESS_KEY) {
      test.skip(
        true,
        "QA_ACCESS_KEY 미설정 — 프로덕션 빌드 QA 핀 오버레이는 검증된 qaKey가 필요합니다."
      );
      return;
    }

    // WP-7.3A: ?qa=1 without qaKey must NOT expose the QA pin overlay in production builds
    await page.goto("/broker/w/dealcards?qa=1", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("qa-pin-fab")).toHaveCount(0);

    const qaQs = `qa=1&qaKey=${encodeURIComponent(QA_ACCESS_KEY)}`;
    const routes = [
      `/broker/w/dealcards?${qaQs}`,
      `/broker/w/im?${qaQs}`,
      `/broker/magazine-editor?${qaQs}`,
      `/broker/w/inbox?${qaQs}`,
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

  test("[Smoke-05] /api/public/qa-workbench?mode=showcase fails closed without auth and returns 22 deliverables with key", async ({
    page,
    request,
  }) => {
    const deniedRes = await request.get("/api/public/qa-workbench?mode=showcase");
    expect([401, 404]).toContain(deniedRes.status());

    if (!QA_ACCESS_KEY) {
      test.skip(true, "QA_ACCESS_KEY 미설정 — /qa-showcase 검증을 건너뜁니다.");
      return;
    }

    const manifestRes = await request.get("/api/public/qa-workbench?mode=showcase", {
      headers: { "x-qa-access-key": QA_ACCESS_KEY },
    });
    expect(manifestRes.status()).toBe(200);
    const manifestJson = await manifestRes.json();
    expect(manifestJson.ok).toBe(true);
    expect(manifestJson.manifest?.totalCount).toBe(22);

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const res = await page.goto(
      `/qa-showcase?tab=im&qaKey=${encodeURIComponent(QA_ACCESS_KEY)}`,
      { waitUntil: "networkidle" }
    );
    expect(res?.status()).toBeLessThan(400);

    await expect(page.getByTestId("showcase-build-stamp-badge")).toBeVisible({
      timeout: 20_000,
    });
    const slide1Img = page.getByTestId("showcase-slide-img-1");
    await expect(slide1Img).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(
        async () =>
          await slide1Img.evaluate((el) => {
            const img = el as HTMLImageElement;
            return img.complete ? img.naturalWidth : 0;
          }),
        { timeout: 20_000, message: "[Smoke-05] slide-01 naturalWidth" }
      )
      .toBeGreaterThan(400);
    expect(pageErrors).toEqual([]);
  });

  test("[Smoke-06] /qa-full-loop-v2 Hold-out Workbench fails closed without key, renders Dangsan XLSX & Jamwon Dev tabs, and serves CDN assets", async ({
    page,
    request,
  }) => {
    const denied = await request.get("/qa-full-loop-v2", { maxRedirects: 0 });
    expect(denied.status()).toBe(404);
    expect((denied.headers()["x-robots-tag"] || "").toLowerCase()).toContain(
      "noindex"
    );

    if (!QA_ACCESS_KEY) {
      test.skip(
        true,
        "QA_ACCESS_KEY 미설정 — /qa-full-loop-v2 인증 화면 및 Hold-out 자산 스모크를 건너뜁니다."
      );
      return;
    }

    const encodedKey = encodeURIComponent(QA_ACCESS_KEY);

    // 1) Hold-out XLSX v1.5 download via CDN-backed sample kit route
    const xlsxRes = await request.get(
      `/api/public/qa-sample-kit?scenario=v2-loop1&format=xlsx&qaKey=${encodedKey}`
    );
    expect(xlsxRes.status()).toBe(200);
    const xlsxBuf = await xlsxRes.body();
    expect(xlsxBuf.length).toBeGreaterThan(50_000);
    expect(xlsxBuf.subarray(0, 2).toString("utf8")).toBe("PK");

    // 2) Hold-out real photo asset via CDN-backed testguide-assets route
    const photoRes = await request.get(
      `/api/public/testguide-assets/images/v2-case04/${encodeURIComponent(
        "01_외관_전면및필로티주차장.jpeg"
      )}?qaKey=${encodedKey}`
    );
    expect(photoRes.status()).toBe(200);
    expect(photoRes.headers()["content-type"] || "").toContain("image/jpeg");

    // 3) Hold-out Live Probe contract
    const probeRes = await request.post("/api/public/qa-workbench", {
      headers: { "x-qa-access-key": QA_ACCESS_KEY },
      data: {
        mode: "probe",
        expectedLoopId: "v2-loop1",
      },
    });
    expect(probeRes.status()).toBe(200);
    const probeJson = await probeRes.json();
    expect(probeJson.ok).toBe(true);

    // 4) Interactive UI smoke on /qa-full-loop-v2
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const res = await page.goto(`/qa-full-loop-v2?qaKey=${encodedKey}`, {
      waitUntil: "domcontentloaded",
    });
    expect(res?.status()).toBe(200);

    await expect(
      page.getByRole("button", { name: /Hold-out 1 · 당산 115억 XLSX/ })
    ).toBeVisible({ timeout: 20_000 });
    const tab2 = page.getByRole("button", {
      name: /Hold-out 2 · 잠원 242억 신축개발/,
    });
    await expect(tab2).toBeVisible();
    await tab2.click();
    await expect(
      page.getByText(/잠원동 26-14외1 두원빌딩/).first()
    ).toBeVisible();

    const signoffTab = page.getByRole("button", { name: /Sign-off \(0\/14\)/ });
    await signoffTab.click();
    await expect(page.getByText("H1-S1").first()).toBeVisible();
    await expect(page.getByText("H2-S7").first()).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(pageErrors).toEqual([]);
  });
});
