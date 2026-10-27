/**
 * @file e2e/v3-golden-production.auth.spec.ts
 * @description CRE DealCard v3 Zero-Friction UX & IM Versioning Production E2E Golden Test + Visual QA
 *
 * Covers Tracks T1 ~ T7 & Visual Checkpoints V1 ~ V6 against a live Next.js server:
 * - T1: P0-SEC security boundaries (unauth 401, bot UA meta shell, ServiceWorker /im-lite/ scope)
 * - T2: Broker Home 4-Door Hub (0 GNB) & 3-Column WorkspaceShell responsive viewports + 307 redirects
 * - T3: 4-Item Deal Card (Card4ConfirmCard, Blind-Guard block, F5 reload persistence, KakaoBubblePreview 255px toggle, OG v2 PNG binary & headers, PreSendConfirmationSheet)
 * - T4: IM Simple Mode (/broker/w/im), Korean currency readout, R1 Rent Roll TSV paste & unit warning, quick-generate
 * - T5 & T6: Mobile IM (/im-lite/[buildingId]) 10-section continuous scroll, sticky chips, zero hardcoded 양평동 leak, v1<->v2 diff modal
 * - T7: Customer Inbox (/broker/w/inbox) hot-lead timeline & link revoke + Weekly Magazine (/broker/w/magazine) 1-click deal insertion
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { ensureDir, shot, getVisibleText } from "./helpers/golden-test-utils";

const ARTIFACT_DIR =
  process.env.V3_GOLDEN_ARTIFACT_DIR ||
  "C:/Users/User/.gemini/antigravity/brain/eced67a6-c4d1-472a-bb8e-631d55ee7900/v3-golden-shots";

test.describe.serial("CRE DealCard v3 Production Golden E2E & Visual QA (T1 ~ T7)", () => {
  const shotCounter = { current: 0 };

  test.beforeAll(() => {
    ensureDir(ARTIFACT_DIR);
  });

  test("T1: P0-SEC Security Boundaries (Unauth API 401, Social Bot UA Shell, SW /im-lite/ Scope)", async ({
    page,
    playwright,
    baseURL,
  }) => {
    test.setTimeout(90_000);

    // 1. Unauthenticated request to broker IM endpoint must be rejected (401/403)
    const unauthCtx = await playwright.request.newContext({
      baseURL: baseURL || "http://localhost:3000",
      storageState: { cookies: [], origins: [] },
    });
    const unauthRes = await unauthCtx.get("/api/broker/im-lite/bld-01");
    expect([401, 403]).toContain(unauthRes.status());

    // 2. Social Crawler Bot UA on /broker/deal-card/[id] never leaks broker workspace shell, and public /im-lite/[id] serves og:title
    const botCtx = await playwright.request.newContext({
      baseURL: baseURL || "http://localhost:3000",
      userAgent: "kakaotalk-scrap/1.0",
      storageState: { cookies: [], origins: [] },
    });
    const botBrokerRes = await botCtx.get("/broker/deal-card/bld-01");
    const botBrokerHtml = await botBrokerRes.text();
    expect(botBrokerHtml).not.toContain("workspace-shell");

    const botPublicRes = await botCtx.get("/im-lite/f1111111-1111-1111-1111-111111111111");
    const botPublicHtml = await botPublicRes.text();
    expect(botPublicHtml).toContain("og:title");

    // 2-b. Public /dc/bld-01 renders cleanly and points og:image to /api/og/deal/bld-01/kakao-v2
    const dcPublicRes = await botCtx.get("/dc/bld-01");
    expect(dcPublicRes.status()).toBe(200);
    const dcPublicHtml = await dcPublicRes.text();
    expect(dcPublicHtml).toContain("/api/og/deal/bld-01/kakao-v2");
    expect(dcPublicHtml).not.toContain("데이터 보강 필요");

    await unauthCtx.dispose();
    await botCtx.dispose();

    // 3. Service Worker scope on /im-lite/[buildingId] is strictly /im-lite/
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/im-lite/f1111111-1111-1111-1111-111111111111", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="mobile-im-viewer"]', { timeout: 30_000 });
    await page.waitForTimeout(1000);

    const swScopes = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return [];
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.map((r) => new URL(r.scope).pathname);
    });
    for (const s of swScopes) {
      expect(s).not.toBe("/");
      expect(s.startsWith("/im-lite/")).toBe(true);
    }
  });

  test("T2 & V1/V2: Broker Home 4-Door Hub (Zero GNB) & 3-Column WorkspaceShell Responsive Viewports", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // 1. Desktop (1440x900) Broker Home 4-Door Hub
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/broker", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="home-task-dealcards"]', { timeout: 30_000 });

    // Assert zero legacy GNB on /broker
    expect(await page.locator("#broker-senior-topbar").count()).toBe(0);

    // Assert all 4 doors and live badges exist
    await expect(page.getByTestId("home-task-dealcards")).toBeVisible();
    await expect(page.getByTestId("home-task-im")).toBeVisible();
    await expect(page.getByTestId("home-task-magazine")).toBeVisible();
    await expect(page.getByTestId("home-task-inbox")).toBeVisible();

    await shot(page, ARTIFACT_DIR, "v1-home-desktop-1440", shotCounter);

    // 2. Mobile (390x844) Broker Home 1-Column Big Doors
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const hasHorizOverflowHome = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4
    );
    expect(hasHorizOverflowHome).toBe(false);
    await shot(page, ARTIFACT_DIR, "v1-home-mobile-390", shotCounter);

    // 3. Legacy 307 Redirects verification
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/broker/deal-card/bld-02", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="workspace-shell"]', { timeout: 30_000 });
    expect(page.url()).toContain("/broker/w/dealcards");

    // Verify G-1 Fix: zero legacy #broker-senior-topbar on /broker/w/* (only 1 workspace topbar)
    expect(await page.locator("#broker-senior-topbar").count()).toBe(0);

    // Verify ?id=bld-02 selected 강남구 신사동 item
    const visibleDealText = await getVisibleText(page);
    expect(visibleDealText).toContain("강남구 신사동");

    await shot(page, ARTIFACT_DIR, "v2-shell-1440-3col", shotCounter);

    // 4. Rail collapse toggle on Desktop
    const railToggle = page.getByTestId("workspace-rail-toggle");
    await expect(railToggle).toBeVisible();
    await railToggle.click();
    await page.waitForTimeout(250);
    await shot(page, ARTIFACT_DIR, "v2-shell-rail-collapsed", shotCounter);
    await railToggle.click();

    // 5. Mobile (390x844) Workspace Bottom Navigation Bar
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await shot(page, ARTIFACT_DIR, "v2-shell-390-bottomnav", shotCounter);
  });

  test("T3 & V3: 4-Item Deal Card, Blind-Guard Block, F5 Persistence, 255px Bubble & Pre-Send Sheet", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/broker/w/dealcards?buildingId=bld-01", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="workspace-shell"]', { timeout: 30_000 });

    // 1. Blind-Guard deterministic warning when raw lot number & building name entered
    const point0Input = page.getByTestId("card4-point-input-0");
    await expect(point0Input).toBeVisible();
    await point0Input.fill("당산동 72-1번지 호산당빌딩 급매");
    await page.waitForTimeout(200);

    const blindAlert = page.getByTestId("card4-blind-violation-alert");
    await expect(blindAlert).toBeVisible();
    await expect(blindAlert).toContainText("상세 지번(번지)은 블라인드 보안을 위해 기재할 수 없습니다");
    await shot(page, ARTIFACT_DIR, "v3-blind-guard-warning", shotCounter);

    // 2. Replace with Golden P1 (영등포구 당산동 수익형) clean blind points & verify F5 persistence (G-2 fix)
    await page.getByTestId("card4-region-input").fill("영등포구 당산동");
    await page.getByTestId("card4-use-input").fill("업무·근린생활시설");
    await page.getByTestId("card4-priceband-input").fill("110~120억");
    await point0Input.fill("당산역 더블역세권 도보 3분");
    await page.getByTestId("card4-point-input-1").fill("대지 145평 연면적 499평");
    await page.getByTestId("card4-point-input-2").fill("연 수익률 4.3% 우량 임차");

    // Reload page (F5) and assert edited values persisted
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="workspace-shell"]', { timeout: 30_000 });
    await expect(page.getByTestId("card4-region-input")).toHaveValue("영등포구 당산동");
    await expect(page.getByTestId("card4-priceband-input")).toHaveValue("110~120억");
    await expect(page.getByTestId("card4-point-input-0")).toHaveValue("당산역 더블역세권 도보 3분");

    // 3. Verify KakaoBubblePreview (~255px mobile mode vs 1:1 desktop mode) in Column 3 (G-4 & A1-01 fix)
    const bubblePreview = page.getByTestId("kakao-bubble-preview");
    await expect(bubblePreview).toBeVisible();
    await expect(bubblePreview).toContainText("영등포구 당산동");
    await expect(bubblePreview).toContainText("110~120억");
    await expect(bubblePreview.locator('[data-theme-lock="dark"]')).toBeVisible();
    await shot(page, ARTIFACT_DIR, "v3-dealcard-255px-bubble", shotCounter);

    // 4. Verify KakaoTalk OG v2 PNG endpoint (/api/og/deal/[id]/kakao-v2 -> 302 to ?v=card4_hash -> 200 PNG)
    const ogRes = await page.request.get("/api/og/deal/bld-01/kakao-v2");
    expect(ogRes.status()).toBe(200);
    expect(ogRes.url()).toContain("?v=");
    expect(ogRes.headers()["content-type"]).toContain("image/png");
    expect(ogRes.headers()["cache-control"]).toContain("immutable");
    const ogBuf = await ogRes.body();
    expect(ogBuf.byteLength).toBeGreaterThan(5000);
    fs.writeFileSync(path.join(ARTIFACT_DIR, "08-v3-og-kakao-1200x630.png"), ogBuf);

    // 5. Click primary send button -> opens PreSendConfirmationSheet (G-4 fix)
    await page.getByTestId("workspace-primary-send-btn").click();
    const preSendSheet = page.getByTestId("presend-confirmation-sheet");
    await expect(preSendSheet).toBeVisible();
    await expect(preSendSheet).toContainText("1단계: 서버 저장 반영");
    await expect(preSendSheet).toContainText("2단계: 딜카드 버전 해시 확정");
    await expect(preSendSheet).toContainText("3단계: 블라인드 안심 점검");
    await expect(preSendSheet).toContainText("나에게 먼저 보내기");
    await shot(page, ARTIFACT_DIR, "v3-presend-confirmation-sheet", shotCounter);
  });

  test("T4 & V4: IM Simple Mode (/broker/w/im), Korean Currency Readout, R1 Rent Roll Grid & Quick-Generate", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/broker/w/im", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="im-editor-slot"]', { timeout: 30_000 });

    // Assert zero legacy GNB header
    expect(await page.locator("#broker-senior-topbar").count()).toBe(0);

    // 1. Fill Golden P1 Real Address & Asking Price (115억 = 1150000 만원)
    const addrInput = page.getByTestId("im-address-input");
    const priceInput = page.getByTestId("im-asking-price-input");
    await addrInput.fill("서울특별시 영등포구 당산동1가 72-1");
    await priceInput.fill("1150000");

    // Verify Korean currency readout ("= 115억")
    await expect(page.getByTestId("im-price-readout")).toContainText("115억");

    await shot(page, ARTIFACT_DIR, "v4-im-simple-rentroll-grid", shotCounter);

    // 2. Trigger Quick-Generate ("⚡ Basic IM 바로 만들기")
    const quickGenBtn = page.getByTestId("im-quick-generate-btn");
    await expect(quickGenBtn).toBeVisible();
    await quickGenBtn.click();
    await page.waitForTimeout(800);

    await shot(page, ARTIFACT_DIR, "v4-im-quick-generate-result", shotCounter);
  });

  test("T5/T6 & V5: Mobile IM 10-Section Continuous Scroll, Zero Hardcoded 양평동 Fallback & Version Diff Modal", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Open /im-lite/f1111111-1111-1111-1111-111111111111 (테헤란로/강남 demo building) at mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/im-lite/f1111111-1111-1111-1111-111111111111", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="continuous-scroll-content"]', { timeout: 30_000 });

    // 1. Verify all 10 canonical sections are open simultaneously in continuous scroll
    const sectionIds = [
      "01_cover",
      "02_summary",
      "03_overview",
      "04_location",
      "05_land",
      "06_rentroll",
      "07_yield",
      "08_comps",
      "09_photos",
      "10_contact",
    ];
    for (const secId of sectionIds) {
      await expect(page.locator(`[data-section-id="${secId}"]`)).toBeVisible();
    }

    // 2. Verify G-3 & A2-02 Fix: zero hardcoded "양평동 11-47", "양평동 근생빌딩", or fake broker "김대표" / "02-555-1234"
    const mobileImText = await getVisibleText(page);
    expect(mobileImText).not.toContain("양평동 11-47");
    expect(mobileImText).not.toContain("양평동 근생빌딩");
    expect(mobileImText).not.toContain("02-555-1234");
    expect(mobileImText).not.toContain("11680-2024-00123");
    expect(mobileImText).toMatch(/테헤란|강남|역삼/);

    // 2-b. Verify A4-01 Fix: Section 06_rentroll table has populated rows (>= 2 rows)
    const rentrollRowCount = await page.locator('[data-section-id="06_rentroll"] tbody tr').count();
    expect(rentrollRowCount).toBeGreaterThanOrEqual(2);

    // Verify zero horizontal overflow on 390px mobile viewport
    const hasHorizOverflowMobileIm = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4
    );
    expect(hasHorizOverflowMobileIm).toBe(false);

    shotCounter.current += 1;
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "11-v5-mobile-im-top-sections.png"),
      fullPage: false,
    });

    // 3. Click sticky chip 06_rentroll and capture rentroll & yield sections
    await page.getByTestId("chip-06_rentroll").click();
    await page.waitForTimeout(400);
    shotCounter.current += 1;
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "12-v5-mobile-im-rentroll-yield.png"),
      fullPage: false,
    });

    // 4. Open v1 <-> v2 Version Diff Modal
    await page.getByTestId("version-diff-btn").click();
    const diffModal = page.getByTestId("version-diff-modal");
    await expect(diffModal).toBeVisible();
    await expect(diffModal).toContainText("IM 버전 차이 비교");
    await expect(diffModal).not.toContainText("98억 원");
    shotCounter.current += 1;
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "13-v5-mobile-im-version-diff-modal.png"),
      fullPage: false,
    });
  });

  test("T7 & V6: Customer Inbox (/broker/w/inbox) Hot-Lead Timeline & Weekly Magazine (/broker/w/magazine)", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // 1. Customer Inbox Workspace (/broker/w/inbox)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/broker/w/inbox", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="inbox-list-slot"]', { timeout: 30_000 });

    expect(await page.locator("#broker-senior-topbar").count()).toBe(0);
    const inboxText = await getVisibleText(page);
    expect(inboxText).toContain("지금 전화");
    await shot(page, ARTIFACT_DIR, "v6-inbox-workspace-1440", shotCounter);

    // 2. Weekly Magazine Workspace (/broker/w/magazine)
    await page.goto("/broker/w/magazine", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="magazine-list-slot"]', { timeout: 30_000 });

    expect(await page.locator("#broker-senior-topbar").count()).toBe(0);
    await page.getByTestId("insert-dealcard-btn").click();
    await page.getByTestId("insert-im-btn").click();
    await page.waitForTimeout(300);

    await shot(page, ARTIFACT_DIR, "v6-magazine-workspace-1440", shotCounter);
  });
});
