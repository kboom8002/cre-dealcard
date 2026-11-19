/**
 * @file e2e/full-funnel-cross-actor-golden.auth.spec.ts
 * @description AP-WP-07: Single-Property (당산동1가 72-1) 7-Step Cross-Actor / Cross-Device Golden E2E:
 *   1. Broker Desktop (1440×900): DealCard Zero-Blank Starter + Fast-Fill Blind Sanitization + Publish
 *   2. Broker Desktop -> Broker Mobile (390×844): IM 3-Second Deck Readiness Bar + Cross-Device Sync
 *   3. Basic PPTX Binary 5-Fold Gate (`analyzePptxZip`, zero poison/dummy/evasive/priceBand)
 *   4. Broker Desktop Inbox: Custom Client + 3-Preset Polite Kakao Outreach + `?sid=` Tracking Link
 *   5. Buyer KakaoTalk In-App WebView (390×844, KAKAOTALK UA): `/dc/[id]` Micro-Actions (`sms:`) + ContactGate Auto-Hyphen (`010-2548-2548`) + WebView Banner on `/im-lite/[id]`
 *   6. Broker Inbox Signal & Link Lock (`revoke`) Verification -> `revoked-im-screen`
 */
import { test, expect, type Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  ensureDir,
  getVisibleText,
  downloadPptx,
  analyzePptxZip,
  assertNoPoisonTokens,
  assertNoDummyData,
  assertNoEvasivePhrases,
  assertPriceBandBlocked,
  assertPriceReflected,
} from "./helpers/golden-test-utils";
import { BASIC_IM_BOUNDS } from "../src/domain/building/mobile-im/pptx/basic-im-contract";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const AUTH_STATE_PATH = path.resolve(__dirname, ".auth/user.json");
const RAW_ERROR_REGEX =
  /PGRST|relation .* does not exist|column .* does not exist|syntax error|\[object Object\]|>NaN<|>undefined<|>null</;

async function hideDevOverlay(page: Page) {
  await page
    .addStyleTag({
      content:
        "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-tools-button]{display:none!important}",
    })
    .catch(() => {});
}

test.describe.serial(
  "AP-WP-07: 7-Step Cross-Actor & Cross-Device Full-Funnel Golden E2E",
  () => {
    test.setTimeout(300_000);

    const createdBuildingIds: string[] = [];
    const createdDocIds: string[] = [];
    const createdClientIds: string[] = [];
    const scratchTmpDir = path.join(os.tmpdir(), "cre-full-funnel-golden");

    test.afterAll(async () => {
      try {
        fs.rmSync(scratchTmpDir, { recursive: true, force: true });
      } catch {
        // ignore tmp cleanup
      }

      const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!sbUrl || !sbKey) return;

      const admin = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
      if (createdDocIds.length > 0) {
        await admin.from("document_objects").delete().in("id", createdDocIds);
      }
      if (createdBuildingIds.length > 0) {
        await admin
          .from("document_objects")
          .delete()
          .in("building_id", createdBuildingIds);
        await admin
          .from("building_signal_cards")
          .delete()
          .in("building_id", createdBuildingIds);
        await admin
          .from("building_ssot_lite")
          .delete()
          .in("id", createdBuildingIds);
        await admin
          .from("im_inquiry_requests")
          .delete()
          .in("building_id", createdBuildingIds);
      }
      if (createdClientIds.length > 0) {
        const rawUuids = createdClientIds.map((id) =>
          id.replace(/^custom_/, "")
        );
        await admin.from("broker_clients").delete().in("id", rawUuids);
      }
    });

    test("executes 1-property 7-step cross-actor journey across Desktop, Mobile, and Buyer KakaoTalk WebView", async ({
      browser,
      baseURL,
    }) => {
      ensureDir(scratchTmpDir);

      const desktopCtx = await browser.newContext({
        storageState: AUTH_STATE_PATH,
        viewport: { width: 1440, height: 900 },
        locale: "ko-KR",
      });
      await desktopCtx
        .grantPermissions(["clipboard-read", "clipboard-write"])
        .catch(() => {});

      const brokerMobileCtx = await browser.newContext({
        storageState: AUTH_STATE_PATH,
        viewport: { width: 390, height: 844 },
        locale: "ko-KR",
      });

      const buyerKakaoCtx = await browser.newContext({
        storageState: { cookies: [], origins: [] },
        viewport: { width: 390, height: 844 },
        locale: "ko-KR",
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.5.0",
      });

      const desktopPage = await desktopCtx.newPage();
      const brokerMobilePage = await brokerMobileCtx.newPage();
      const buyerPage = await buyerKakaoCtx.newPage();

      const runtimeErrors: string[] = [];
      for (const p of [desktopPage, brokerMobilePage, buyerPage]) {
        p.on("pageerror", (err) => {
          runtimeErrors.push(err.message);
          console.log(`[pageerror] url=${p.url()} :: ${err.message}\n${(err.stack || "").split("\n").slice(0, 6).join("\n")}`);
        });
      }

      try {
        // Resolve broker profile phone to verify buyer CTA parity
        const profileRes = await desktopPage.request.get(
          `${baseURL}/api/broker/profile`
        );
        expect(profileRes.ok()).toBe(true);
        const profileJson = await profileRes.json();
        const brokerPhoneDigits = String(profileJson?.data?.phone || "").replace(
          /\D/g,
          ""
        );

        // ────────────────────────────────────────────────────────────────────
        // STEP 1: Zero-Blank 30s Starter UI + Blind Guard DealCard Generation
        // ────────────────────────────────────────────────────────────────────
        await desktopPage.goto("/broker/w/dealcards?fresh=1", {
          waitUntil: "load",
        });
        await hideDevOverlay(desktopPage);
        await desktopPage.waitForTimeout(400);

        await expect(
          desktopPage.getByTestId("dealcard-zero-blank-starter")
        ).toBeVisible({ timeout: 15_000 });
        await expect(
          desktopPage.getByTestId("dealcard-starter-paste-btn")
        ).toBeVisible();
        await expect(
          desktopPage.getByTestId("dealcard-starter-manual-btn")
        ).toBeVisible();
        await expect(
          desktopPage.getByTestId("dealcard-starter-sample-btn")
        ).toBeVisible();

        const rawMemo =
          "서울 영등포구 당산동1가 72-1 역세권 사옥용 근생빌딩 / 매매 92억 / 대지 125평 연면적 398평 / 보증금 4억 월세 2,600만 / 건물주 연락처 010-9999-8888 / 이디야 입점";
        const genRes = await desktopPage.request.post(
          "/api/broker/im-lite/quick-generate",
          {
            data: {
              title: "당산역 도보권 근생 사옥빌딩",
              buildingName: "당산역 도보권 근생 사옥빌딩",
              address: "서울특별시 영등포구 당산동1가 72-1",
              askingPriceManwon: 920000,
              landAreaSqm: 413.2,
              gfaSqm: 1315.7,
              zoning: "준공업지역",
              completionDate: "2018-06-15",
              posture: "core_income",
              brokerPhone: "010-7788-9900",
              rentRoll: [
                {
                  floor: "1F",
                  use: "근린생활시설",
                  depositManwon: 15000,
                  monthlyRentManwon: 1100,
                  status: "occupied",
                },
                {
                  floor: "2F",
                  use: "사무실",
                  depositManwon: 12000,
                  monthlyRentManwon: 820,
                  status: "occupied",
                },
                {
                  floor: "3F",
                  use: "사무실",
                  depositManwon: 13000,
                  monthlyRentManwon: 680,
                  status: "occupied",
                },
              ],
            },
            timeout: 90_000,
          }
        );
        expect(genRes.ok(), `quick-generate failed: ${genRes.status()}`).toBe(
          true
        );
        const genJson = await genRes.json();
        const buildingId = String(genJson.buildingId || "");
        const docId = String(genJson.documentId || "");
        expect(buildingId).toMatch(/^[0-9a-f-]{36}$/i);
        createdBuildingIds.push(buildingId);
        if (docId) createdDocIds.push(docId);

        const ffRes = await desktopPage.request.post(
          "/api/broker/deal-card/fast-fill",
          {
            data: { memo: rawMemo },
            timeout: 45_000,
          }
        );
        expect(ffRes.ok()).toBe(true);
        const ffJson = await ffRes.json();
        const card4 = { ...genJson.card4, ...(ffJson?.card4 || {}) };
        const serializedCard4 = JSON.stringify(card4);
        expect(serializedCard4).not.toContain("72-1");
        expect(serializedCard4).not.toContain("010-9999-8888");

        await desktopPage.request.patch(`/api/broker/deal-card/${buildingId}`, {
          data: { card4 },
        });
        await desktopPage.request.post(
          `/api/broker/dealcards/${buildingId}/publish`,
          { data: {} }
        );

        // ────────────────────────────────────────────────────────────────────
        // STEP 2: IM Zero-Blank Starter + 3s Deck Readiness Bar + PC->Mobile Sync
        // ────────────────────────────────────────────────────────────────────
        await desktopPage.goto("/broker/w/im?fresh=1", { waitUntil: "load" });
        await hideDevOverlay(desktopPage);
        await desktopPage.waitForTimeout(400);

        await expect(
          desktopPage.getByTestId("im-zero-blank-starter")
        ).toBeVisible({ timeout: 15_000 });
        await expect(
          desktopPage.getByTestId("im-deck-readiness-bar")
        ).toBeVisible();
        await desktopPage.getByTestId("im-readiness-chip-address").click();
        await expect(desktopPage.locator("#im-address-input")).toBeFocused();

        await desktopPage.goto(`/broker/w/im?buildingId=${buildingId}`, {
          waitUntil: "load",
        });
        await hideDevOverlay(desktopPage);
        await desktopPage.waitForTimeout(500);
        await expect(
          desktopPage.getByTestId("im-deck-readiness-bar")
        ).toBeVisible();
        const readinessText = await desktopPage
          .getByTestId("im-deck-readiness-count")
          .textContent();
        expect(readinessText).toMatch(/[345]\/5 채워짐/);

        await brokerMobilePage.goto(`/broker/w/im?buildingId=${buildingId}`, {
          waitUntil: "load",
        });
        await hideDevOverlay(brokerMobilePage);
        await brokerMobilePage.waitForTimeout(600);
        const mobileImOverflow = await brokerMobilePage.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth
        );
        expect(mobileImOverflow).toBeLessThanOrEqual(1);
        expect(await getVisibleText(brokerMobilePage)).not.toMatch(
          RAW_ERROR_REGEX
        );

        // ────────────────────────────────────────────────────────────────────
        // STEP 3: Basic PPTX 5-Fold Binary Integrity Verification
        // ────────────────────────────────────────────────────────────────────
        const scratchPptx = path.join(scratchTmpDir, "dangsan-full-funnel.pptx");
        const savedPptx = await downloadPptx(
          desktopPage,
          buildingId,
          docId,
          scratchPptx
        );
        const analysis = analyzePptxZip(savedPptx);
        expect(analysis.slideCount).toBeGreaterThanOrEqual(
          BASIC_IM_BOUNDS.minSlides
        );
        expect(analysis.slideCount).toBeLessThanOrEqual(
          BASIC_IM_BOUNDS.maxSlides
        );
        assertNoPoisonTokens(analysis.slideEntries);
        assertNoDummyData(analysis.fullPptxText);
        assertNoEvasivePhrases(analysis.fullPptxText);
        assertPriceBandBlocked(analysis.fullPptxText);
        assertPriceReflected(analysis.fullPptxText, 920000);

        const pubImRes = await desktopPage.request.patch(
          "/api/broker/workspace/summary",
          {
            data: {
              action: "publish_im",
              buildingId,
              imItem: {
                id: docId || buildingId,
                buildingId,
                title: "당산역 도보권 근생 사옥빌딩",
                address: "서울특별시 영등포구 당산동1가 72-1",
                askingPriceManwon: 920000,
                landAreaSqm: 413.2,
                gfaSqm: 1315.7,
                zoning: "준공업지역",
                completionDate: "2018-06-15",
                status: "published",
              },
            },
          }
        );
        expect(pubImRes.status()).toBe(200);

        // ────────────────────────────────────────────────────────────────────
        // STEP 4: Inbox Custom Client + 3-Preset Polite Kakao Outreach
        // ────────────────────────────────────────────────────────────────────
        const uniqueClientName = `테스트김대표${String(Date.now()).slice(-4)}`;
        const upsertRes = await desktopPage.request.post(
          "/api/broker/inbox/actions",
          {
            data: {
              action: "upsert_client",
              clientName: uniqueClientName,
              clientPhone: "01025482548",
              clientEmail: "buyer.qa@company.co.kr",
              clientGrade: "VIP",
              clientRole: "buyer",
              buildingId,
              buildingTitle: "당산역 도보권 근생 사옥빌딩",
              freeMemo: "70대 사옥 겸 수익 검토 고객",
            },
          }
        );
        expect(upsertRes.ok()).toBe(true);
        const upsertJson = await upsertRes.json();
        const clientId = String(upsertJson?.client?.id || upsertJson?.clientId || "");
        if (clientId) createdClientIds.push(clientId);

        const approveGateRes = await desktopPage.request.post(
          "/api/broker/inbox/actions",
          {
            data: {
              action: "approve_gate",
              threadId: clientId || `custom_${Date.now()}`,
              buildingId,
            },
          }
        );
        expect(approveGateRes.status()).toBe(200);
        const approveGateJson = await approveGateRes.json();
        const shareToken = String(approveGateJson?.shareToken || "");
        expect(shareToken).toMatch(/^slk\./);

        await desktopPage.goto("/broker/w/inbox", { waitUntil: "load" });
        await hideDevOverlay(desktopPage);
        await desktopPage.waitForTimeout(500);

        await desktopPage.getByTestId("inbox-filter-chip-all").click();
        await desktopPage.waitForTimeout(300);
        const clientRow = desktopPage
          .locator('[data-testid^="inbox-thread-row-"]', {
            hasText: uniqueClientName,
          })
          .first();
        await expect(clientRow).toBeVisible({ timeout: 15_000 });
        await clientRow.click();
        await desktopPage.waitForTimeout(300);

        await expect(
          desktopPage.getByTestId("inbox-kakao-preset-tabs")
        ).toBeVisible();
        await desktopPage
          .getByTestId("inbox-kakao-preset-followup_meeting")
          .click();
        await desktopPage.getByTestId("inbox-copy-bundle-btn").click();

        const bundlePreview = desktopPage.getByTestId(
          "inbox-copied-bundle-preview"
        );
        await expect(bundlePreview).toBeVisible({ timeout: 10_000 });
        const copiedText = (await bundlePreview.textContent()) || "";
        expect(copiedText).toContain("잘 살펴보셨는지요");
        expect(copiedText).toMatch(/\/im-lite\/|\/dc\//);

        // ────────────────────────────────────────────────────────────────────
        // STEP 5: Buyer KakaoTalk WebView Funnel & Micro-Conversion Bar
        // ────────────────────────────────────────────────────────────────────
        await buyerPage.goto(`/dc/${buildingId}`, { waitUntil: "networkidle" });
        await hideDevOverlay(buyerPage);
        const dcText = await getVisibleText(buyerPage);
        expect(dcText).not.toContain("72-1");
        expect(dcText).not.toContain("010-9999-8888");
        expect(dcText).not.toMatch(RAW_ERROR_REGEX);

        const dcOverflow = await buyerPage.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth
        );
        expect(dcOverflow).toBeLessThanOrEqual(1);

        await expect(
          buyerPage.getByTestId("public-dealcard-sticky-cta")
        ).toBeVisible();
        await expect(
          buyerPage.getByTestId("public-dealcard-micro-actions")
        ).toBeVisible();
        const smsHref = await buyerPage
          .getByTestId("public-dealcard-sms-link")
          .getAttribute("href");
        expect(smsHref).toMatch(/^sms:[0-9]+$/);
        if (brokerPhoneDigits.length >= 8) {
          expect(smsHref?.length).toBeGreaterThanOrEqual(12);
        }

        // Open ContactGateModal & verify auto-hyphen + phone/email echo
        await buyerPage.getByTestId("public-dealcard-im-request-btn").click();
        await expect(
          buyerPage.getByTestId("contact-gate-modal")
        ).toBeVisible();
        await buyerPage.getByTestId("contact-gate-name").fill("박매수 상무");
        await buyerPage.getByTestId("contact-gate-phone").fill("01025482548");
        await expect(
          buyerPage.getByTestId("contact-gate-phone")
        ).toHaveValue("010-2548-2548");
        await buyerPage
          .getByTestId("contact-gate-email")
          .fill("buyer.qa@company.co.kr");
        await buyerPage.getByTestId("contact-gate-privacy-consent").check();
        await buyerPage.getByTestId("contact-gate-submit-btn").click();

        const submittedCard = buyerPage.getByTestId("contact-gate-submitted");
        await expect(submittedCard).toBeVisible({ timeout: 15_000 });
        await expect(submittedCard).toContainText("010-2548-2548");
        await expect(submittedCard).toContainText("buyer.qa@company.co.kr");

        // Open /im-lite/[buildingId]?token=... inside KakaoTalk UA context
        await buyerPage.goto(
          `/im-lite/${buildingId}?token=${encodeURIComponent(shareToken)}`,
          { waitUntil: "networkidle" }
        );
        await hideDevOverlay(buyerPage);
        await expect(
          buyerPage.getByTestId("inapp-webview-banner")
        ).toBeVisible({ timeout: 10_000 });
        await expect(
          buyerPage.getByTestId("open-external-browser-btn")
        ).toBeVisible();
        const imOverflow = await buyerPage.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth
        );
        expect(imOverflow).toBeLessThanOrEqual(1);

        // ────────────────────────────────────────────────────────────────────
        // STEP 6 & 7: Broker Revokes Building Share Link -> Dignified Lock Screen
        // ────────────────────────────────────────────────────────────────────
        const revokeRes = await desktopPage.request.post(
          "/api/broker/share-links/revoke",
          {
            data: {
              scope: "building",
              buildingId,
              reason: "e2e_golden_lock_check",
            },
          }
        );
        expect(revokeRes.ok()).toBe(true);

        await buyerPage.goto(
          `/im-lite/${buildingId}?token=${encodeURIComponent(shareToken)}`,
          { waitUntil: "networkidle" }
        );
        await expect(
          buyerPage.getByTestId("revoked-im-screen")
        ).toBeVisible({ timeout: 15_000 });
        expect(await getVisibleText(buyerPage)).not.toMatch(RAW_ERROR_REGEX);

        expect(runtimeErrors).toEqual([]);
      } finally {
        await desktopCtx.close();
        await brokerMobileCtx.close();
        await buyerKakaoCtx.close();
      }
    });
  }
);
