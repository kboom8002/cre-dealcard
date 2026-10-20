/**
 * 모바일 매거진 5대 매수자 관심 채널 뉴스 큐레이션 골든 E2E 스펙
 *
 * 검증 항목:
 *  1. [간단 모드] `/broker/magazine-editor?mode=simple` 접속 시 Step 2-B(`simple-news-picker`)가 노출되고,
 *     선택된 뉴스 3건의 채널 배지(🏢 부동산·빌딩 / 📈 경제·금리 / ⚖️ 절세·상속 / 🎨 문화·라이프 / ☕ 상권·트렌드)와 제목이 표시되는지 확인
 *  2. [간단 모드] `✨ 부동산·경제·문화 황금배합 3선 자동 맞춤` 클릭 및 `5대 채널에서 다른 뉴스 고르기` 펼침 탭 전환 동작 확인
 *  3. [상세 모드 - 뉴스 탭] 6개 채널 탭(`전체`, `부동산·빌딩`, `경제·금리`, `절세·상속`, `문화·라이프`, `상권·트렌드`)이 각각 3건 이상의 기사를 보유하고,
 *     영문 토픽 키(`rental`, `market_trend` 등)나 HTML 엔티티(`&quot;`) 노출이 0건인지 확인
 *  4. [상세 모드 - 황금배합 & 직접 기사 추가] `✨ 매수자 관심 황금배합 자동 선별` 클릭 시 5대 채널이 골고루 포함된 6건(`(6/6 선택)`)이 선택되고,
 *     1건 해제 후 `직접 기사 추가` 폼으로 `🎨 문화·예술·라이프` 칼럼을 추가하면 즉시 목록 및 선택(`(6/6 선택)`)에 반영되는지 확인
 *  5. [실시간 미리보기 독자 뷰어] 우측 미리보기 iframe 내 `뉴스 큐레이션` 섹션에 5대 관심 채널 배지(`viewer-news-channel-badge`)와
 *     방금 추가한 문화·예술 칼럼 제목 및 `원문 보기 ↗` 링크가 렌더링되는지 확인
 */
import { test, expect, type Page, type Request } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  deriveFallbackBriefing,
  deriveFallbackHeadline,
} from "../src/lib/magazine/simple-format";

dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true } as any);

const BROKER_SLUG = "test-broker-kim";
const ARTIFACT_DIR = "C:\\Users\\User\\.gemini\\antigravity\\brain\\eced67a6-c4d1-472a-bb8e-631d55ee7900";

interface MockStore {
  edition: any | null;
  meta: any;
  createdDraftId: string | null;
  hadOriginalSettings: boolean;
  originalSettings: Record<string, unknown> | null;
  brokerUserId: string | null;
}

const store: MockStore = {
  edition: null,
  meta: null,
  createdDraftId: null,
  hadOriginalSettings: false,
  originalSettings: null,
  brokerUserId: null,
};

function sbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonBody(req: Request): any {
  try {
    return req.postDataJSON();
  } catch {
    return {};
  }
}

async function installEditorSafetyMocks(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem("cre_magazine_editor_mode");
      window.localStorage.removeItem("magazine_editor_mode");
    } catch {
      /* ignore */
    }
    const add = () => {
      if (document.getElementById("__e2e_hide_dev")) return;
      const s = document.createElement("style");
      s.id = "__e2e_hide_dev";
      s.textContent =
        "nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button] { display: none !important; }";
      (document.head || document.documentElement).appendChild(s);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add);
    else add();
  });

  await page.route("**/api/broker/profile**", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      const resp = await route.fetch();
      const json = await resp.json().catch(() => null);
      if (json && typeof json === "object") {
        const data = (json.data ?? json) as Record<string, any>;
        const settings =
          data.magazine_settings && typeof data.magazine_settings === "object"
            ? { ...data.magazine_settings }
            : {};
        delete settings.editor_mode;
        const patched = json.data
          ? { ...json, data: { ...data, magazine_settings: settings } }
          : { ...data, magazine_settings: settings };
        return route.fulfill({ status: resp.status(), json: patched });
      }
      return route.fulfill({ response: resp });
    }
    const body = jsonBody(req);
    return route.fulfill({
      status: 200,
      json: { ok: true, data: { slug: BROKER_SLUG, ...(body || {}) } },
    });
  });

  await page.route("**/api/magazine/editions/draft", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.continue();
    if (!store.edition) {
      const resp = await route.fetch();
      const j = await resp.json().catch(() => null);
      if (!resp.ok() || !j?.edition) return route.fulfill({ response: resp });
      if (j.created && j.edition?.id) {
        store.createdDraftId = j.edition.id;
      }
      const now = new Date().toISOString();
      store.edition = {
        ...j.edition,
        status: "draft",
        published_at: null,
        title: "이번 주 강남·영등포 빌딩 시장 & 자산가 브리핑",
        market_temp: "선별 매수",
        cover_keywords: ["금리인하", "절세전략", "아트컬렉션"],
        cover_image_url: null,
        field_note: {
          question: "이번 주 현장 분위기",
          comment:
            "금리 인하 기대감 속에 100억~250억대 우량 수익형 빌딩과 가업승계·증여 절세 전략을 함께 문의하시는 자산가분들이 늘었습니다.",
        },
        theme_title: "",
        theme_body_md: "",
        featured_deal_ids: [],
        target_segments: ["all"],
        content: {},
        updated_at: now,
      };
      store.meta = j.meta ?? { sendEnabled: false, subscriberCount: 12 };
    }
    return route.fulfill({
      status: 200,
      json: { edition: store.edition, created: false, meta: store.meta },
    });
  });

  await page.route("**/api/magazine/editions", async (route) => {
    const req = route.request();
    if (req.method() !== "PATCH") return route.continue();
    const body = jsonBody(req) || {};
    const now = new Date().toISOString();
    store.edition = {
      ...(store.edition || {}),
      ...body,
      content: {
        ...((store.edition && store.edition.content) || {}),
        ...(body.content || {}),
      },
      updated_at: now,
    };
    return route.fulfill({ status: 200, json: { edition: store.edition } });
  });

  await page.route("**/api/broker/magazine/simple-summary", async (route) => {
    const body = jsonBody(route.request()) || {};
    const comment = String(body.comment ?? "").trim();
    return route.fulfill({
      status: 200,
      json: {
        ok: true,
        headline: deriveFallbackHeadline(comment, "김중개"),
        briefing: deriveFallbackBriefing({
          comment,
          dealCount: 2,
          newsTitles: Array.isArray(body.newsTitles) ? body.newsTitles : [],
          marketTemp: body.marketTemp ?? "선별 매수",
        }),
        source: "deterministic_fallback",
      },
    });
  });

  await page.route("**/api/broker/magazine/news-channels**", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const body = jsonBody(req) || {};
      if (body.action === "custom") {
        return route.fulfill({
          status: 200,
          json: {
            ok: true,
            item: {
              id: "custom-e2e-arte-1",
              title: String(body.title ?? ""),
              summary: String(body.summary ?? ""),
              source: String(body.source ?? "중개사 추천 브리핑"),
              url: typeof body.url === "string" ? body.url : undefined,
              sentiment: "neutral",
              importance_score: 9,
              topic: "art",
              channel: String(body.channel ?? "culture_lifestyle"),
            },
          },
        });
      }
    }
    return route.continue();
  });
}

test.describe("모바일 매거진 5대 매수자 관심 채널 뉴스 큐레이션 골든 E2E", () => {
  test.beforeAll(async () => {
    const db = sbAdmin();
    if (!db) return;
    // 이전 실행에서 적재된 E2E 테스트용 뉴스 행 정리
    await db.from("external_news").delete().eq("url", "https://www.arte.co.kr");
    const { data: prof } = await db
      .from("broker_profiles")
      .select("user_id, magazine_settings")
      .eq("slug", BROKER_SLUG)
      .maybeSingle();
    if (prof) {
      store.brokerUserId = prof.user_id;
      store.hadOriginalSettings = true;
      store.originalSettings =
        prof.magazine_settings && typeof prof.magazine_settings === "object"
          ? { ...(prof.magazine_settings as Record<string, unknown>) }
          : null;
    }
  });

  test.afterAll(async () => {
    const db = sbAdmin();
    if (!db) return;
    await db.from("external_news").delete().eq("url", "https://www.arte.co.kr");
    if (store.createdDraftId) {
      await db.from("magazine_editions").delete().eq("id", store.createdDraftId);
    }
    if (store.hadOriginalSettings && store.brokerUserId) {
      await db
        .from("broker_profiles")
        .update({ magazine_settings: store.originalSettings })
        .eq("user_id", store.brokerUserId);
    }
  });

  test("간단 모드 3선 뉴스 확인·채널 브라우저 → 상세 모드 5대 채널 탭·황금배합·직접 기사 추가 → 독자 뷰어 채널 배지 검증", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 960 });
    await installEditorSafetyMocks(page);

    // ── 1. 5분 간단 모드 진입 및 Step 2-B 뉴스 큐레이션 검증 ──
    await page.goto("/broker/magazine-editor?mode=simple", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("simple-editor-root")).toBeVisible({ timeout: 45_000 });

    const simpleNewsPicker = page.getByTestId("simple-news-picker");
    await expect(simpleNewsPicker).toBeVisible({ timeout: 20_000 });

    // 기본 선택된 뉴스 미리보기 카드(3건) 노출 확인
    const previewCards = page.getByTestId("simple-selected-news-preview");
    await expect(previewCards).toBeVisible({ timeout: 15_000 });
    await expect(simpleNewsPicker).toContainText("3 / 최대 3건 선택됨");

    // 황금배합 3선 자동 맞춤 버튼 클릭
    const simpleBalancedBtn = page.getByTestId("simple-news-balanced-btn");
    await expect(simpleBalancedBtn).toBeVisible();
    await simpleBalancedBtn.click();
    await expect(simpleNewsPicker).toContainText("3 / 최대 3건 선택됨");

    // 5대 채널에서 다른 뉴스 고르기 펼치기
    const expandBtn = page.getByTestId("simple-news-expand-btn");
    await expandBtn.click();
    const channelBrowser = page.getByTestId("simple-news-channel-browser");
    await expect(channelBrowser).toBeVisible();

    // 간단 모드 내 6개 채널 탭 존재 확인 및 '문화·라이프' 탭 전환
    for (const chId of [
      "all",
      "real_estate",
      "economy_finance",
      "tax_wealth",
      "culture_lifestyle",
      "commercial_trend",
    ]) {
      await expect(page.getByTestId(`simple-news-channel-${chId}`)).toBeVisible();
    }
    await page.getByTestId("simple-news-channel-culture_lifestyle").click();
    await expect(channelBrowser).toContainText("문화·라이프");

    // 다시 접어 깔끔한 3선 요약 상태로 복귀 후 튜토리얼 캡처 저장
    await expandBtn.click();
    await simpleNewsPicker.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);

    const simpleStep2ImgPub = path.resolve(
      process.cwd(),
      "public/tutorials/images/step-07-magazine-simple-step2-step3.png"
    );
    const simpleStep2ImgDocs = path.resolve(
      process.cwd(),
      "docs/tutorial/images/step-07-magazine-simple-step2-step3.png"
    );
    await page.screenshot({ path: simpleStep2ImgPub });
    if (fs.existsSync(path.dirname(simpleStep2ImgDocs))) {
      fs.copyFileSync(simpleStep2ImgPub, simpleStep2ImgDocs);
    }
    if (fs.existsSync(ARTIFACT_DIR)) {
      fs.copyFileSync(
        simpleStep2ImgPub,
        path.join(ARTIFACT_DIR, "step-07-magazine-simple-step2-step3.png")
      );
    }

    // ── 2. 상세 편집 모드 '뉴스' 탭 진입 및 5대 매수자 관심 채널 검증 ──
    await page.getByRole("tab", { name: /^뉴스/ }).click();
    const newsPanel = page.getByTestId("news-curation-panel");
    await expect(newsPanel).toBeVisible({ timeout: 20_000 });

    // 간단 모드에서 맞춘 황금배합 3건(3/6 선택)이 상세 모드 전환 후에도 그대로 보존됨을 확인
    const hdr = newsPanel.getByText(/뉴스 큐레이션 \(\d+\/6 선택\)/);
    await expect(hdr).toBeVisible();
    await expect(hdr).toHaveText(/\(3\/6 선택\)/);

    // 6개 채널 탭 확인 및 각 채널별 기사 수 >= 3 검증
    const expectedTabs: Array<{ id: string; label: string }> = [
      { id: "all", label: "전체" },
      { id: "real_estate", label: "부동산·빌딩" },
      { id: "economy_finance", label: "경제·금리" },
      { id: "tax_wealth", label: "절세·상속" },
      { id: "culture_lifestyle", label: "문화·라이프" },
      { id: "commercial_trend", label: "상권·트렌드" },
    ];

    for (const t of expectedTabs) {
      const tabBtn = page.getByTestId(`news-channel-tab-${t.id}`);
      await expect(tabBtn).toBeVisible();
      await expect(tabBtn).toContainText(t.label);
      await tabBtn.click();
      // 각 채널마다 최소 3개 이상의 뉴스 카드가 표시되어야 함
      const cardCount = await newsPanel.locator("button[aria-pressed]").count();
      expect(cardCount, `채널 ${t.id} 기사 수 부족`).toBeGreaterThanOrEqual(3);
    }

    // 전체 탭으로 복귀 후 영문 토픽 키나 HTML 엔티티 노출 0건 검증
    await page.getByTestId("news-channel-tab-all").click();
    const allCardsText = (await newsPanel.locator("button[aria-pressed]").allInnerTexts()).join("\n");
    expect(allCardsText).not.toMatch(/(&quot;|&amp;|&#39;|&lt;|&gt;)/);
    expect(allCardsText).not.toMatch(
      /\b(rental|policy|market_trend|finance|regulation|investment|general|other)\b/
    );

    // ── 3. 황금배합 자동 선별 버튼 클릭 → 6/6 선택 및 5대 채널 골고루 포함 확인 ──
    const balancedMixBtn = page.getByTestId("news-balanced-mix-btn");
    await balancedMixBtn.click();
    await expect(hdr).toHaveText(/\(6\/6 선택\)/);

    const mixBar = page.getByTestId("selected-channel-mix-bar");
    await expect(mixBar).toBeVisible();
    for (const label of ["부동산·빌딩", "경제·금리", "절세·상속", "문화·라이프", "상권·트렌드"]) {
      await expect(mixBar).toContainText(label);
    }

    // ── 4. 직접 기사 추가(문화·예술·라이프) 동작 및 자동 선택 검증 ──
    // 먼저 1건을 해제하여 (5/6 선택) 상태로 만든 뒤 새 기사를 추가하면 (6/6 선택)으로 자동 포함되는지 확인
    await newsPanel.locator('button[aria-pressed="true"]').last().click();
    await expect(hdr).toHaveText(/\(5\/6 선택\)/);

    await page.getByTestId("news-custom-toggle-btn").click();
    const customForm = page.getByTestId("news-custom-add-form");
    await expect(customForm).toBeVisible();

    const customTitle = "국립현대미술관 가을 건축·현대미술 컬렉터 특별전 개막 안내";
    await customForm.getByLabel("기사·칼럼 제목 (필수)").fill(customTitle);
    await customForm.getByLabel("직접 추가 기사 분류 채널").selectOption("culture_lifestyle");
    await customForm
      .getByLabel("핵심 내용 또는 중개사 한마디 해설 (선택)")
      .fill("핵심 팩트: 가을 시즌 국내외 건축가와 현대미술 거장 특별전이 개최됩니다.");
    await customForm.getByLabel("분류 채널 & 출처 매체명").fill("한경 아르떼 컬처");
    await customForm.getByLabel("원문 링크 URL").fill("https://www.arte.co.kr");

    await page.getByTestId("news-custom-submit-btn").click();

    // 추가 직후 문화·라이프 탭으로 자동 전환되고 6/6 선택 상태가 되며, 추가한 기사가 선택되어 있음
    await expect(hdr).toHaveText(/\(6\/6 선택\)/);
    await expect(newsPanel.getByText(customTitle)).toBeVisible();

    // 전체 탭으로 돌려서 상세 뉴스 큐레이션 화면 스크린샷 캡처
    await page.getByTestId("news-channel-tab-all").click();
    await newsPanel.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);

    const fullNewsImgPub = path.resolve(
      process.cwd(),
      "public/tutorials/images/step-07-magazine-news-channels.png"
    );
    const fullNewsImgDocs = path.resolve(
      process.cwd(),
      "docs/tutorial/images/step-07-magazine-news-channels.png"
    );
    await page.screenshot({ path: fullNewsImgPub });
    if (fs.existsSync(path.dirname(fullNewsImgDocs))) {
      fs.copyFileSync(fullNewsImgPub, fullNewsImgDocs);
    }
    if (fs.existsSync(ARTIFACT_DIR)) {
      fs.copyFileSync(
        fullNewsImgPub,
        path.join(ARTIFACT_DIR, "step-07-magazine-news-channels.png")
      );
    }

    // ── 5. 우측 실시간 미리보기(독자 뷰어 iframe) 내 5대 채널 배지 & 원문 링크 렌더링 검증 ──
    const previewFrame = page.frameLocator('iframe[title="매거진 실시간 미리보기"]');
    const newsSectionHeader = previewFrame.getByRole("button", { name: /뉴스 큐레이션/ }).first();
    await expect(newsSectionHeader).toBeVisible({ timeout: 25_000 });
    const isExpanded = await newsSectionHeader.getAttribute("aria-expanded");
    if (isExpanded === "false") {
      await newsSectionHeader.click();
    }
    await expect(previewFrame.getByText(customTitle).first()).toBeVisible({ timeout: 20_000 });
    await expect(previewFrame.getByTestId("viewer-news-channel-badge").first()).toBeVisible();
    await expect(previewFrame.getByText("원문 보기 ↗").first()).toBeVisible();
  });
});
