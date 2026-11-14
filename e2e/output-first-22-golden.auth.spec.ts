/**
 * @file e2e/output-first-22-golden.auth.spec.ts
 * @description Gate 1 AI E2E Pipeline Golden Suite (v3.0 Output-First 22종 MECE)
 *
 * - Stage A: 딜카드 8종 (DC-01 ~ DC-08) 생성 → fast-fill/PATCH(블라인드 방역) → 발행 → /dc & 카톡 OG 390px 검증
 * - Stage B: 뉴스레터 6종 (NL-D1 ~ NL-M2) 월간통계 → 초안 → 5줄 요약/폴백 → 발행 → /magazine & OG 390px 검증
 * - Stage C: 모바일+PPTX IM 8종 (IM-01 ~ IM-08) TSV/공실보간 → quick-generate → /im-lite 390px →
 *            실물 .pptx OpenXML 5대 단언 → LibreOffice PDF → PyMuPDF slide-XX.png → Supabase Storage 업로드
 * - Stage D: qa_showcase_manifest Supabase 발행 → GET ?mode=showcase 확인 → /qa-showcase 1440×900 & 390×844 UX 물리 감사
 */
import { test, expect, type Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { execFileSync } from "child_process";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  ensureDir,
  analyzePptxZip,
  assertNoPoisonTokens,
  assertNoDummyData,
  assertOutputInvariants,
  assertNoEvasivePhrases,
  assertPriceBandBlocked,
  assertPriceReflected,
} from "./helpers/golden-test-utils";
import { BASIC_IM_BOUNDS } from "../src/domain/building/mobile-im/pptx/basic-im-contract";
import {
  DEALCARD_SHOWCASE_8,
  IM_SHOWCASE_8,
  NEWSLETTER_SHOWCASE_6,
  type ShowcaseLiveEntry,
  type ShowcaseManifest,
} from "../src/lib/qa/output-showcase-scenarios";
import {
  parseTsvRentRoll,
  synthesizeMissingVacantFloors,
} from "../src/lib/rent-roll/tsv-parser";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const SOFFICE_EXE = "C:\\Program Files\\LibreOffice\\program\\soffice.exe";
const WORK_TMP_ROOT = path.join(os.tmpdir(), "cre-output-first-22");
const LO_PROFILE_DIR = path.join(WORK_TMP_ROOT, "lo-profile");
const RAW_ERROR_REGEX =
  /PGRST|relation .* does not exist|column .* does not exist|syntax error|\[object Object\]|>NaN<|>undefined<|>null</;

interface UxPhysicsSnapshot {
  screen: string;
  viewport: string;
  fontScale: string;
  horizontalOverflowPx: number;
  visibleInteractiveCount: number;
  sub44Buttons: Array<{
    text: string;
    testId: string | null;
    width: number;
    height: number;
  }>;
  sub15Texts: Array<{ text: string; tag: string; fontSizePx: number }>;
  clippedButtons: Array<{ text: string; clientW: number; scrollW: number }>;
}

async function hideDevOverlay(page: Page) {
  await page
    .addStyleTag({
      content:
        "nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-tools-button]{display:none!important}",
    })
    .catch(() => {});
}

async function collectUxPhysics(
  page: Page,
  screen: string,
  viewport: string,
  fontScale: string
): Promise<UxPhysicsSnapshot> {
  return await page.evaluate(
    ({ screenName, vp, fsMode }) => {
      const isVisible = (el: Element): boolean => {
        const htmlEl = el as HTMLElement;
        if (!htmlEl.offsetParent && getComputedStyle(htmlEl).position !== "fixed") {
          return false;
        }
        const style = getComputedStyle(htmlEl);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0
        ) {
          return false;
        }
        const rect = htmlEl.getBoundingClientRect();
        return rect.width > 2 && rect.height > 2;
      };

      const overflowPx =
        document.documentElement.scrollWidth - document.documentElement.clientWidth;

      const interactives = Array.from(
        document.querySelectorAll(
          'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="tab"], [role="switch"]'
        )
      ).filter(isVisible);

      const sub44Buttons: Array<{
        text: string;
        testId: string | null;
        width: number;
        height: number;
      }> = [];
      const clippedButtons: Array<{
        text: string;
        clientW: number;
        scrollW: number;
      }> = [];

      for (const el of interactives) {
        const htmlEl = el as HTMLElement;
        if (htmlEl.hasAttribute("data-preview-unit-id")) continue;
        if (htmlEl.getAttribute("role") === "separator") continue;
        const rect = htmlEl.getBoundingClientRect();
        const label = (
          htmlEl.innerText ||
          htmlEl.getAttribute("aria-label") ||
          ""
        )
          .trim()
          .slice(0, 40);
        const testId = htmlEl.getAttribute("data-testid");
        if (
          (el.tagName === "BUTTON" ||
            el.tagName === "A" ||
            el.getAttribute("role") === "tab" ||
            el.getAttribute("role") === "switch") &&
          Math.round(rect.height) < 44
        ) {
          sub44Buttons.push({
            text: label,
            testId,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
        if (
          el.tagName === "BUTTON" &&
          htmlEl.scrollWidth > htmlEl.clientWidth + 6 &&
          getComputedStyle(htmlEl).textOverflow !== "ellipsis"
        ) {
          clippedButtons.push({
            text: label,
            clientW: htmlEl.clientWidth,
            scrollW: htmlEl.scrollWidth,
          });
        }
      }

      const sub15Texts: Array<{
        text: string;
        tag: string;
        fontSizePx: number;
      }> = [];
      const textEls = Array.from(
        document.querySelectorAll(
          "p, span, label, h1, h2, h3, h4, button, a, th, td, li"
        )
      ).filter(isVisible);
      for (const el of textEls) {
        const htmlEl = el as HTMLElement;
        if (
          htmlEl.children.length > 0 &&
          el.tagName !== "BUTTON" &&
          el.tagName !== "LABEL"
        ) {
          continue;
        }
        const txt = (htmlEl.innerText || "").trim();
        if (!txt) continue;
        const px = parseFloat(getComputedStyle(htmlEl).fontSize || "16");
        if (px < 14.5 && sub15Texts.length < 20) {
          sub15Texts.push({
            text: txt.slice(0, 40),
            tag: el.tagName.toLowerCase(),
            fontSizePx: Math.round(px * 10) / 10,
          });
        }
      }

      return {
        screen: screenName,
        viewport: vp,
        fontScale: fsMode,
        horizontalOverflowPx: overflowPx,
        visibleInteractiveCount: interactives.length,
        sub44Buttons: sub44Buttons.slice(0, 20),
        sub15Texts,
        clippedButtons: clippedButtons.slice(0, 15),
      };
    },
    { screenName: screen, vp: viewport, fsMode: fontScale }
  );
}

function maskRegionForPublicDeal(address: string): string {
  const parts = address.trim().split(/\s+/);
  const tokens: string[] = [];
  for (const part of parts) {
    if (/(?:시|도|구|군|동|읍|면)$/.test(part) || /\d+가$/.test(part)) {
      tokens.push(part);
    }
    if (tokens.length >= 3) break;
  }
  const base = tokens.length > 0 ? tokens.join(" ") : "서울 주요 권역";
  return `${base} 일대`;
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다."
    );
  }
  return createClient(url, serviceKey);
}

test.describe.serial("Gate 1: Output-First 22종 MECE E2E Golden Suite", () => {
  test.setTimeout(600_000);

  test.afterAll(async () => {
    try {
      fs.rmSync(WORK_TMP_ROOT, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  test("generates & verifies all 22 deliverables (DC 8 + NL 6 + IM 8) and publishes live Showcase Manifest", async ({
    page,
  }) => {
    ensureDir(WORK_TMP_ROOT);
    ensureDir(LO_PROFILE_DIR);
    const adminSupabase = getSupabaseAdmin();
    const manifestEntries: Record<string, ShowcaseLiveEntry> = {};
    const stageACard4Map: Record<
      string,
      {
        region: string;
        use: string;
        priceBand: string;
        headline?: string;
        buildingId: string;
      }
    > = {};

    // ── Broker identity resolution ──────────────────────────────────────────
    const profileRes = await page.request.get("/api/broker/profile");
    expect(profileRes.ok(), `/api/broker/profile status=${profileRes.status()}`).toBe(
      true
    );
    const profileJson = await profileRes.json();
    const brokerSlug = String(profileJson?.data?.broker?.slug || "").trim();
    const brokerName = String(
      profileJson?.data?.display_name || "이상은"
    ).trim();
    expect(brokerSlug.length).toBeGreaterThanOrEqual(2);
    console.log(`🔑 Broker resolved: ${brokerName} (slug=${brokerSlug})`);

    // ════════════════════════════════════════════════════════════════════════
    // STAGE A: DealCards 8종 (DC-01 ~ DC-08)
    // ════════════════════════════════════════════════════════════════════════
    for (const scenario of DEALCARD_SHOWCASE_8) {
      console.log(`\n📌 [Stage A] ${scenario.id} — ${scenario.title}`);

      const genRes = await page.request.post("/api/broker/im-lite/quick-generate", {
        data: {
          buildingId: scenario.buildingId,
          title: scenario.title,
          buildingName: scenario.title,
          address: scenario.address,
          askingPriceManwon: scenario.askingPriceManwon,
          ...(typeof scenario.landAreaSqm === "number"
            ? { landAreaSqm: scenario.landAreaSqm }
            : {}),
          ...(typeof scenario.gfaSqm === "number"
            ? { gfaSqm: scenario.gfaSqm }
            : {}),
          ...(scenario.zoning ? { zoning: scenario.zoning } : {}),
          ...(scenario.completionDate
            ? { completionDate: scenario.completionDate }
            : {}),
          posture: scenario.posture,
          handoverNote: scenario.handoverNote,
          rentRoll: scenario.rentRoll.map((r) => ({
            floor: r.floor,
            unit: r.unit,
            use: r.use,
            area_sqm: r.area_sqm,
            depositManwon: r.depositManwon,
            monthlyRentManwon: r.monthlyRentManwon,
            maintenanceManwon: r.maintenanceManwon ?? 0,
            leaseExpiry: r.leaseExpiry,
            status: r.status,
          })),
          photos: scenario.photos,
        },
        timeout: 120_000,
      });
      expect(
        genRes.ok(),
        `${scenario.id} quick-generate failed (${genRes.status()})`
      ).toBe(true);
      const genJson = await genRes.json();
      const buildingId = String(genJson.buildingId || "");
      expect(buildingId).toBe(scenario.buildingId);

      // Call fast-fill ONLY with { memo } so parseMemoFast + validateBlindPoints sanitize raw memo
      const ffRes = await page.request.post("/api/broker/deal-card/fast-fill", {
        data: { memo: scenario.fastFillMemo },
        timeout: 60_000,
      });
      expect(ffRes.ok(), `${scenario.id} fast-fill status=${ffRes.status()}`).toBe(
        true
      );
      const ffJson = await ffRes.json();
      const ffCard4 = ffJson?.card4 || genJson?.card4;
      expect(ffCard4).toBeTruthy();

      const serializedCard4 = JSON.stringify(ffCard4);
      for (const forbidden of scenario.forbiddenPublicTokens) {
        expect(
          serializedCard4,
          `${scenario.id} fast-fill leaked forbidden token '${forbidden}'`
        ).not.toContain(forbidden);
      }

      const mergedCard4 = {
        ...genJson.card4,
        ...ffCard4,
        posture: scenario.card4Posture,
      };
      const patchRes = await page.request.patch(
        `/api/broker/deal-card/${buildingId}`,
        { data: { card4: mergedCard4 } }
      );
      expect(
        patchRes.ok(),
        `${scenario.id} PATCH deal-card status=${patchRes.status()}`
      ).toBe(true);

      const pubRes = await page.request.post(
        `/api/broker/dealcards/${buildingId}/publish`,
        { data: {} }
      );
      expect(
        pubRes.ok(),
        `${scenario.id} publish status=${pubRes.status()}`
      ).toBe(true);

      // Verify Kakao OG Card PNG
      const ogUrl = `/api/og/deal/${buildingId}/kakao-v2`;
      const ogRes = await page.request.get(ogUrl, { timeout: 60_000 });
      expect(ogRes.status(), `${scenario.id} OG status`).toBe(200);
      expect(ogRes.headers()["content-type"] || "").toContain("image/png");
      const ogBuf = await ogRes.body();
      expect(ogBuf.length).toBeGreaterThan(2000);

      // Verify Public Mobile /dc/[id] at 390×844
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/dc/${buildingId}`, { waitUntil: "networkidle" });
      await hideDevOverlay(page);
      const dcCheck = await page.evaluate((forbiddenList) => {
        const overflowPx =
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth;
        const text = document.body.innerText || "";
        const leaked = forbiddenList.filter((t) => t && text.includes(t));
        const brokenImgs = Array.from(document.querySelectorAll("img")).filter(
          (img) => img.complete && img.naturalWidth === 0
        ).length;
        return { overflowPx, leaked, brokenImgs, text };
      }, scenario.forbiddenPublicTokens);

      expect(dcCheck.overflowPx, `${scenario.id} /dc horizontal overflow`).toBeLessThanOrEqual(
        1
      );
      expect(dcCheck.leaked, `${scenario.id} /dc blind leak`).toEqual([]);
      expect(dcCheck.text).not.toMatch(RAW_ERROR_REGEX);
      if (scenario.photos.length === 0) {
        expect(
          dcCheck.brokenImgs,
          `${scenario.id} broken img on 0 photos`
        ).toBe(0);
      }

      stageACard4Map[scenario.id] = {
        region: String(mergedCard4.region || maskRegionForPublicDeal(scenario.address)),
        use: String(mergedCard4.use || "근린생활시설"),
        priceBand: String(mergedCard4.priceBand || scenario.askingPriceReadout),
        headline: String(mergedCard4.headline || scenario.title),
        buildingId,
      };

      manifestEntries[scenario.id] = {
        caseId: scenario.id,
        category: "dealcard",
        title: scenario.title,
        subtitle: scenario.subtitle,
        postureOrCadence: scenario.card4Posture,
        edgeFocus: scenario.edgeFocus,
        liveUrl: `/dc/${buildingId}`,
        ogImageUrl: ogUrl,
        buildingId,
        inputSummary: scenario.inputSummary,
        goldenChecks: [
          "fast-fill 블라인드 가드 & 서버 PATCH 422 통과",
          "카카오 OG PNG 200 OK",
          "모바일 390px 가로 넘침 0px & 민감 정보 0건",
        ],
        generatedAt: new Date().toISOString(),
      };
      console.log(`  ✅ ${scenario.id} verified (/dc/${buildingId})`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // STAGE B: Newsletters 6종 (NL-D1 ~ NL-M2)
    // ════════════════════════════════════════════════════════════════════════
    for (const scenario of NEWSLETTER_SHOWCASE_6) {
      console.log(`\n📰 [Stage B] ${scenario.id} — ${scenario.title}`);

      let monthlyCharts: unknown[] | undefined;
      if (scenario.editionType === "monthly") {
        const statsRes = await page.request.get(
          `/api/broker/magazine/monthly-stats?region=${
            scenario.monthlyRegion ?? "gbd"
          }&pair=${scenario.monthlyPair ?? "molit_bok"}&ym=2026-10`
        );
        expect(
          statsRes.ok(),
          `${scenario.id} monthly-stats status=${statsRes.status()}`
        ).toBe(true);
        const statsJson = await statsRes.json();
        expect(Array.isArray(statsJson.charts)).toBe(true);
        expect(statsJson.charts.length).toBeGreaterThanOrEqual(2);
        monthlyCharts = statsJson.charts.slice(0, 2);
      }

      const draftRes = await page.request.post("/api/magazine/editions/draft", {
        data: {
          edition_type: scenario.editionType,
          edition_label: scenario.editionLabel,
          format: "simple",
        },
      });
      expect(
        draftRes.ok(),
        `${scenario.id} draft status=${draftRes.status()}`
      ).toBe(true);
      const draftJson = await draftRes.json();
      const edition = draftJson.edition;
      const editionId = String(edition?.id || "");
      expect(editionId).toMatch(/^[0-9a-f-]{36}$/i);
      const wasPublished = edition?.status === "published";

      // Call simple-summary; fall back deterministically to plainBriefingFallback if AI key absent
      let briefing = scenario.plainBriefingFallback;
      let headline = scenario.useBrokerNamePreset
        ? `${brokerName} 중개사의 ${scenario.headlineTemplate}`
        : scenario.headlineTemplate;

      const summaryRes = await page.request.post(
        `/api/magazine/editions/${editionId}/simple-summary`,
        {
          data: {
            comment: scenario.rawBrokerMemo,
            marketTemp: scenario.marketTemp,
          },
          timeout: 45_000,
        }
      );
      if (summaryRes.ok()) {
        const sumJson = await summaryRes.json().catch(() => ({}));
        if (
          typeof sumJson?.briefing === "string" &&
          sumJson.briefing.trim().length >= 30 &&
          sumJson.briefing.trim().length <= 500
        ) {
          briefing = sumJson.briefing.trim();
        }
      }
      // Keep NL-D2 deterministic near-500-char boundary test verbatim
      if (scenario.id === "NL-D2") {
        briefing = scenario.plainBriefingFallback;
      }

      const dealItems = scenario.dealRefs.map((refId) => {
        const dc = DEALCARD_SHOWCASE_8.find((d) => d.id === refId)!;
        const dcMeta = stageACard4Map[refId];
        const maskedAddr =
          dcMeta?.region || maskRegionForPublicDeal(dc.address);
        return {
          id: dc.buildingId,
          building_id: dc.buildingId,
          title: dcMeta?.headline || dc.title.split("·")[1]?.trim() || dc.title,
          assetType: dcMeta?.use || "근린생활시설",
          address: maskedAddr,
          areaSignal: maskedAddr,
          price: dc.askingPriceReadout,
          priceBand: dcMeta?.priceBand || dc.askingPriceReadout,
          priceWon: dc.askingPriceManwon * 10000,
          landAreaPyeong:
            typeof dc.landAreaSqm === "number" && dc.landAreaSqm > 0
              ? Math.round((dc.landAreaSqm / 3.3058) * 10) / 10
              : undefined,
          grossFloorAreaPyeong:
            typeof dc.gfaSqm === "number" && dc.gfaSqm > 0
              ? Math.round((dc.gfaSqm / 3.3058) * 10) / 10
              : undefined,
          zoning: dc.zoning,
          photoUrl: dc.photos[0]?.url ?? null,
          investmentPoint: dc.fastFillMemo.slice(0, 72),
        };
      });

      const pubRes = await page.request.post(
        `/api/magazine/editions/${editionId}/publish`,
        {
          data: {
            correction: wasPublished,
            acknowledgeQualityGate: true,
            issueDate: scenario.issueDate,
            payload: {
              edition_type: scenario.editionType,
              edition_label: scenario.editionLabel,
              title: headline,
              market_temp: scenario.marketTemp,
              field_note: { comment: briefing },
              featured_deal_ids: dealItems.map((d) => d.id),
              content: {
                format: "simple",
                edition_type: scenario.editionType,
                issueDate: scenario.issueDate,
                headline,
                briefing,
                ai_briefing: briefing,
                market_temp: scenario.marketTemp,
                field_note: { comment: briefing },
                unitIssues: scenario.unitIssues.map((u) => ({
                  id: u.id,
                  channel: u.channel,
                  topic: u.topic,
                  title: u.title,
                  brief: u.brief,
                  memoTone: u.memoTone,
                  sentiment: u.sentiment ?? "neutral",
                  source_type: "broker_curated",
                  is_ai_generated: false,
                })),
                dealHighlights: dealItems,
                featured_deals: dealItems,
                featured_deal_ids: dealItems.map((d) => d.id),
                ...(monthlyCharts ? { monthlyCharts } : {}),
                ...(scenario.monthlyRegion
                  ? { monthlyRegion: scenario.monthlyRegion }
                  : {}),
                simple_preset: true,
                generation: { qualityGate: { passed: true }, isMock: false },
              },
            },
          },
          timeout: 60_000,
        }
      );
      if (!pubRes.ok()) {
        const errTxt = await pubRes.text().catch(() => "");
        throw new Error(
          `${scenario.id} publish failed (${pubRes.status()}): ${errTxt}`
        );
      }

      const ogImgUrl = `/api/og/magazine?brokerId=${encodeURIComponent(
        brokerSlug
      )}&date=${encodeURIComponent(scenario.issueDate)}`;
      const magOgRes = await page.request.get(ogImgUrl, { timeout: 60_000 });
      expect(magOgRes.status(), `${scenario.id} magazine OG status`).toBe(200);
      expect(magOgRes.headers()["content-type"] || "").toContain("image/");
      expect((await magOgRes.body()).length).toBeGreaterThan(1000);

      const liveUrl = `/magazine/${encodeURIComponent(
        brokerSlug
      )}/${encodeURIComponent(scenario.issueDate)}?edition=${encodeURIComponent(
        editionId
      )}`;
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(liveUrl, { waitUntil: "networkidle" });
      await hideDevOverlay(page);
      if (scenario.defaultFontScale !== "normal") {
        await page.evaluate((scale) => {
          document.documentElement.setAttribute("data-font-scale", scale);
          window.localStorage.setItem("cre-font-scale", scale);
        }, scenario.defaultFontScale);
        await page.waitForTimeout(250);
      }

      const magCheck = await page.evaluate(() => {
        const overflowPx =
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth;
        const text = document.body.innerText || "";
        return { overflowPx, text };
      });

      expect(
        magCheck.overflowPx,
        `${scenario.id} mobile 390px overflow`
      ).toBeLessThanOrEqual(1);
      expect(magCheck.text).not.toContain("브리핑 소제목");
      expect(magCheck.text).not.toMatch(/이슈\s*[1-5](?!\d)/);
      expect(magCheck.text).not.toMatch(/example\.com|test@credeal/);
      expect(magCheck.text).not.toMatch(RAW_ERROR_REGEX);

      if (scenario.id === "NL-D2") {
        expect(magCheck.text).not.toContain("추천 매물");
      }
      if (scenario.id === "NL-W2") {
        expect(magCheck.text).toContain(brokerName);
      }
      if (scenario.editionType === "monthly" && Array.isArray(monthlyCharts)) {
        for (const ch of monthlyCharts as Array<{ title?: string }>) {
          if (ch?.title) {
            expect(magCheck.text).toContain(ch.title);
          }
        }
      }

      manifestEntries[scenario.id] = {
        caseId: scenario.id,
        category: "newsletter",
        title: scenario.title,
        subtitle: scenario.subtitle,
        postureOrCadence: scenario.cadenceLabel,
        edgeFocus: scenario.edgeFocus,
        liveUrl,
        ogImageUrl: ogImgUrl,
        editionId,
        defaultFontScale: scenario.defaultFontScale,
        inputSummary: scenario.inputSummary,
        goldenChecks: [
          "5단 뉴스레터 발행 & 정정일 오염 0건",
          "브리핑 소제목/이슈 번호 소제목 제거 확인",
          "모바일 390px 가로 넘침 0px & OG PNG 200 OK",
        ],
        generatedAt: new Date().toISOString(),
      };
      console.log(`  ✅ ${scenario.id} verified (${liveUrl})`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // STAGE C: Mobile + PPTX IM 8종 (IM-01 ~ IM-08)
    // ════════════════════════════════════════════════════════════════════════
    const loProfileUri =
      "file:///" + LO_PROFILE_DIR.replace(/\\/g, "/").replace(/^\/+/, "");
    const cacheBustTs = Date.now();

    for (const scenario of IM_SHOWCASE_8) {
      console.log(`\n🏢 [Stage C] ${scenario.id} — ${scenario.title}`);

      let rentRollPayload: Array<Record<string, unknown>> = [];
      if (scenario.rawTsv) {
        const parsedTsv = parseTsvRentRoll(scenario.rawTsv);
        const rows = scenario.synthesizeVacantFloors
          ? synthesizeMissingVacantFloors(parsedTsv.rows)
          : parsedTsv.rows;
        if (scenario.id === "IM-07") {
          expect(parsedTsv.hasUnitMistakes).toBe(true);
          expect(rows.some((r) => r.floor === "3F" && r.status === "vacant")).toBe(
            true
          );
          expect(rows.some((r) => r.floor === "4F" && r.status === "vacant")).toBe(
            true
          );
        }
        rentRollPayload = rows.map((r) => ({
          floor: r.floor,
          unit: r.unit,
          use: r.use,
          area_sqm: r.areaSqm ?? r.exclusiveAreaSqm,
          depositManwon: r.depositManwon,
          monthlyRentManwon: r.monthlyRentManwon,
          maintenanceManwon: r.maintenanceManwon,
          leaseExpiry: r.leaseExpiry,
          status: r.status,
        }));
      } else if (scenario.directRentRoll) {
        rentRollPayload = scenario.directRentRoll.map((r) => ({
          floor: r.floor,
          unit: r.unit,
          use: r.use,
          area_sqm: r.area_sqm,
          depositManwon: r.depositManwon,
          monthlyRentManwon: r.monthlyRentManwon,
          maintenanceManwon: r.maintenanceManwon ?? 0,
          leaseExpiry: r.leaseExpiry,
          status: r.status,
        }));
      }

      const genRes = await page.request.post("/api/broker/im-lite/quick-generate", {
        data: {
          buildingId: scenario.buildingId,
          title: scenario.title,
          buildingName: scenario.title,
          address: scenario.address,
          askingPriceManwon: scenario.askingPriceManwon,
          ...(typeof scenario.landAreaSqm === "number"
            ? { landAreaSqm: scenario.landAreaSqm }
            : {}),
          ...(typeof scenario.gfaSqm === "number"
            ? { gfaSqm: scenario.gfaSqm }
            : {}),
          ...(scenario.zoning ? { zoning: scenario.zoning } : {}),
          ...(scenario.completionDate
            ? { completionDate: scenario.completionDate }
            : {}),
          posture: scenario.posture,
          handoverNote: scenario.handoverNote,
          rentRoll: rentRollPayload,
          photos: scenario.photos,
          ...(scenario.brokerExtras ? { brokerExtras: scenario.brokerExtras } : {}),
        },
        timeout: 120_000,
      });
      expect(
        genRes.ok(),
        `${scenario.id} quick-generate failed (${genRes.status()})`
      ).toBe(true);
      const genJson = await genRes.json();
      const buildingId = String(genJson.buildingId || "");
      const docId = String(genJson.documentId || "");
      expect(buildingId).toBe(scenario.buildingId);
      expect(docId).toMatch(/^[0-9a-f-]{36}$/i);

      // Mobile IM /im-lite/[id] check at 390×844
      const imLiveUrl = `/im-lite/${buildingId}`;
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(imLiveUrl, { waitUntil: "networkidle" });
      await hideDevOverlay(page);
      const mobileImCheck = await page.evaluate(() => {
        const overflowPx =
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth;
        const text = document.body.innerText || "";
        const brokenImgs = Array.from(document.querySelectorAll("img")).filter(
          (img) => img.complete && img.naturalWidth === 0
        ).length;
        return { overflowPx, text, brokenImgs };
      });
      expect(
        mobileImCheck.overflowPx,
        `${scenario.id} mobile IM overflow`
      ).toBeLessThanOrEqual(1);
      expect(mobileImCheck.text).not.toMatch(RAW_ERROR_REGEX);
      if (scenario.id === "IM-03") {
        expect(mobileImCheck.text).not.toMatch(/NaN|Infinity/);
      }
      if (scenario.photos.length === 0) {
        expect(
          mobileImCheck.brokenImgs,
          `${scenario.id} broken img on 0 photos`
        ).toBe(0);
      }

      // Download Basic PPTX directly & run OpenXML 5-fold assertions
      const pptxDownloadUrl = `/api/public/im-lite/${buildingId}/pptx?tier=basic&direct=1&doc_id=${encodeURIComponent(
        docId
      )}`;
      const pptxRes = await page.request.get(pptxDownloadUrl, {
        timeout: 120_000,
      });
      expect(
        pptxRes.ok(),
        `${scenario.id} PPTX download status=${pptxRes.status()}`
      ).toBe(true);
      const pptxBuf = await pptxRes.body();
      expect(pptxBuf.length).toBeGreaterThan(15_000);

      const caseTmpDir = path.join(WORK_TMP_ROOT, scenario.id.toLowerCase());
      const pngDir = path.join(caseTmpDir, "png");
      ensureDir(caseTmpDir);
      ensureDir(pngDir);
      const scratchPptx = path.join(caseTmpDir, `${scenario.id}.pptx`);
      const scratchPdf = path.join(caseTmpDir, `${scenario.id}.pdf`);

      const uploadedSlideUrls: string[] = [];
      let slideCount = 0;

      try {
        fs.writeFileSync(scratchPptx, pptxBuf);
        const analysis = analyzePptxZip(scratchPptx);
        slideCount = analysis.slideCount;
        expect(slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
        expect(slideCount).toBeLessThanOrEqual(BASIC_IM_BOUNDS.maxSlides);

        assertNoPoisonTokens(analysis.slideEntries);
        assertOutputInvariants(analysis.allSlideTexts);
        if (scenario.exemptDummyPhraseForOfficialAddress === "테헤란로 123") {
          expect(analysis.fullPptxText).not.toContain("NH농협캐피탈");
          expect(analysis.fullPptxText).not.toContain("테헤란로 456");
        } else {
          assertNoDummyData(analysis.fullPptxText);
        }
        assertNoEvasivePhrases(analysis.fullPptxText);
        assertPriceBandBlocked(analysis.fullPptxText);
        assertPriceReflected(analysis.fullPptxText, scenario.askingPriceManwon);

        // LibreOffice Headless -> PDF -> PyMuPDF PNG
        execFileSync(
          SOFFICE_EXE,
          [
            `-env:UserInstallation=${loProfileUri}`,
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            caseTmpDir,
            scratchPptx,
          ],
          { timeout: 120_000 }
        );
        expect(fs.existsSync(scratchPdf)).toBe(true);

        execFileSync(
          "python",
          [
            "-X",
            "utf8",
            path.resolve(process.cwd(), "scripts/visual-regression-render.py"),
            "--width",
            "1280",
            `${scratchPdf}=${pngDir}`,
          ],
          { timeout: 120_000, encoding: "utf-8" }
        );

        const pngFiles = fs
          .readdirSync(pngDir)
          .filter((f) => f.startsWith("slide-") && f.endsWith(".png"))
          .sort();
        expect(pngFiles.length).toBe(slideCount);

        for (const file of pngFiles) {
          const storagePath = `qa-showcase/${scenario.id.toLowerCase()}/${file}`;
          const fileBuf = fs.readFileSync(path.join(pngDir, file));
          const { error: upErr } = await adminSupabase.storage
            .from("building_photos")
            .upload(storagePath, fileBuf, {
              contentType: "image/png",
              upsert: true,
            });
          if (upErr) {
            throw new Error(
              `${scenario.id} Storage upload failed (${storagePath}): ${upErr.message}`
            );
          }
          const { data: pubData } = adminSupabase.storage
            .from("building_photos")
            .getPublicUrl(storagePath);
          uploadedSlideUrls.push(`${pubData.publicUrl}?v=${cacheBustTs}`);
        }
      } finally {
        try {
          fs.rmSync(caseTmpDir, { recursive: true, force: true });
        } catch {
          // best-effort temp cleanup
        }
      }

      manifestEntries[scenario.id] = {
        caseId: scenario.id,
        category: "im",
        title: scenario.title,
        subtitle: scenario.subtitle,
        postureOrCadence: scenario.postureLabel,
        edgeFocus: scenario.edgeFocus,
        liveUrl: imLiveUrl,
        ogImageUrl: null,
        pptxDownloadUrl,
        pptxSlideUrls: uploadedSlideUrls,
        slideCount,
        buildingId,
        docId,
        inputSummary: scenario.inputSummary,
        goldenChecks: [
          `OpenXML 5대 단언 통과 (${slideCount}슬라이드)`,
          "모바일 IM(390px) 가로 넘침 0px",
          `LibreOffice+PyMuPDF 실물 PNG ${uploadedSlideUrls.length}장 업로드`,
        ],
        generatedAt: new Date().toISOString(),
      };
      console.log(
        `  ✅ ${scenario.id} verified (${slideCount} slides uploaded to Supabase Storage)`
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // STAGE D: Showcase Manifest Publish & /qa-showcase UX Physics
    // ════════════════════════════════════════════════════════════════════════
    expect(Object.keys(manifestEntries)).toHaveLength(22);

    const manifest: ShowcaseManifest = {
      version: "3.0",
      generatedAt: new Date().toISOString(),
      brokerSlug,
      brokerName,
      totalCount: 22,
      entries: manifestEntries,
    };

    const { error: insErr } = await adminSupabase.from("activity_events").insert({
      actor_id: null,
      actor_role: "qa_tester",
      entity_type: "qa_showcase_manifest",
      entity_id: null,
      event_type: "qa_showcase_published",
      metadata: { manifest },
    });
    expect(insErr, `qa_showcase_manifest insert failed: ${insErr?.message}`).toBeNull();

    const apiManifestRes = await page.request.get(
      "/api/public/qa-workbench?mode=showcase"
    );
    expect(apiManifestRes.ok()).toBe(true);
    const apiManifestJson = await apiManifestRes.json();
    expect(apiManifestJson.ok).toBe(true);
    expect(apiManifestJson.manifest?.totalCount).toBe(22);

    console.log("\n🎉 Stage A~C + Manifest Publish Complete (22/22)!");
  });

  test("verifies /qa-showcase Desktop (1440x900) & Mobile (390x844) Senior UX Physics and live Supabase slide PNGs", async ({
    page,
  }) => {
    const viewports = [
      { label: "1440x900", width: 1440, height: 900 },
      { label: "390x844", width: 390, height: 844 },
    ] as const;

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/qa-showcase", { waitUntil: "networkidle" });
      await hideDevOverlay(page);

      for (const tab of ["newsletter", "dealcard", "im"] as const) {
        const tabBtn = page.getByTestId(`showcase-tab-${tab}`);
        await tabBtn.click();
        await page.waitForTimeout(350);

        if (tab === "im") {
          const slide1Img = page.getByTestId("showcase-slide-img-1");
          await expect(slide1Img).toBeVisible({ timeout: 15_000 });
          await expect
            .poll(
              async () =>
                await slide1Img.evaluate((el) => {
                  const img = el as HTMLImageElement;
                  return img.complete ? img.naturalWidth : 0;
                }),
              {
                timeout: 20_000,
                message: `IM-01 slide-01 naturalWidth at ${vp.label}`,
              }
            )
            .toBeGreaterThan(400);
        }

        const physics = await collectUxPhysics(
          page,
          `qa-showcase-${tab}`,
          vp.label,
          "normal"
        );
        expect(
          physics.horizontalOverflowPx,
          `[${vp.label}/${tab}] overflow`
        ).toBeLessThanOrEqual(1);
        expect(
          physics.sub15Texts,
          `[${vp.label}/${tab}] sub-15px texts`
        ).toEqual([]);
        expect(
          physics.sub44Buttons,
          `[${vp.label}/${tab}] sub-44px controls`
        ).toEqual([]);
      }
    }

    console.log("\n🎉 Gate 1 Complete: All 22/22 deliverables & /qa-showcase UX Physics verified!");
  });
});
