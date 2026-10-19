import { test, type Page, type Browser } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const PUBLIC_IMG_DIR = path.resolve(process.cwd(), "public/tutorials/images");
const PUBLIC_VID_DIR = path.resolve(process.cwd(), "public/tutorials/videos");
const DOCS_IMG_DIR = path.resolve(process.cwd(), "docs/tutorial/images");
const DOCS_VID_DIR = path.resolve(process.cwd(), "docs/tutorial/videos");

const YANGPYEONG_BUILDING_ID = "32867a6c-04c0-4ac1-80a0-2242cbc9a1f8";
const YANGPYEONG_DOC_ID = "4a7e0693-2fb5-4071-81e1-7a39248e48c6";

interface AnnotationTarget {
  selector: string;
  badge: string;
  label?: string;
}

async function ensureDirs() {
  for (const d of [PUBLIC_IMG_DIR, PUBLIC_VID_DIR, DOCS_IMG_DIR, DOCS_VID_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

async function ensurePaperMode(page: Page) {
  await page.evaluate(() => {
    try {
      window.localStorage.setItem("credeal-broker-paper-mode", "true");
    } catch {
      // ignore
    }
  });
}

async function showVideoCaption(page: Page, caption: string) {
  await page.evaluate((text) => {
    let el = document.getElementById("tutorial-video-caption-bar");
    if (!el) {
      el = document.createElement("div");
      el.id = "tutorial-video-caption-bar";
      el.style.cssText = [
        "position: fixed",
        "bottom: 22px",
        "left: 50%",
        "transform: translateX(-50%)",
        "z-index: 999998",
        "background: rgba(15, 23, 42, 0.94)",
        "color: #FFFFFF",
        "border: 2px solid #F59E0B",
        "border-radius: 16px",
        "padding: 12px 24px",
        "font-size: 19px",
        "font-weight: 800",
        "font-family: Pretendard, sans-serif",
        "box-shadow: 0 12px 32px rgba(0,0,0,0.35)",
        "pointer-events: none",
        "white-space: nowrap",
      ].join(";");
      document.body.appendChild(el);
    }
    el.textContent = text;
  }, caption);
}

async function clearVideoCaption(page: Page) {
  await page.evaluate(() => {
    document.getElementById("tutorial-video-caption-bar")?.remove();
  });
}

async function annotateElements(page: Page, targets: AnnotationTarget[]) {
  const resolvedBoxes: Array<{
    left: number;
    top: number;
    width: number;
    height: number;
    badge: string;
    label?: string;
  }> = [];

  for (const item of targets) {
    try {
      const loc = page.locator(item.selector);
      const count = await loc.count();
      for (let i = 0; i < count; i++) {
        const nth = loc.nth(i);
        const visible = await nth.isVisible().catch(() => false);
        if (!visible) continue;
        const box = await nth.boundingBox().catch(() => null);
        if (box && box.width > 8 && box.height > 8) {
          resolvedBoxes.push({
            left: box.x,
            top: box.y,
            width: box.width,
            height: box.height,
            badge: item.badge,
            label: item.label,
          });
          break;
        }
      }
    } catch {
      // ignore selector resolution failure
    }
  }

  await page.evaluate((boxes) => {
    // Hide Next.js dev indicator portal during screenshot
    document.querySelectorAll("nextjs-portal").forEach((el) => {
      (el as HTMLElement).style.display = "none";
    });

    document.getElementById("tutorial-annotation-layer")?.remove();
    const layer = document.createElement("div");
    layer.id = "tutorial-annotation-layer";
    layer.style.cssText =
      "position: fixed; inset: 0; pointer-events: none; z-index: 999999;";
    document.body.appendChild(layer);

    const placedBadges: Array<{ left: number; top: number; right: number; bottom: number }> = [];

    for (const rect of boxes) {
      const box = document.createElement("div");
      box.style.cssText = [
        "position: fixed",
        `left: ${Math.max(4, rect.left - 4)}px`,
        `top: ${Math.max(4, rect.top - 4)}px`,
        `width: ${Math.min(window.innerWidth - 8, rect.width + 8)}px`,
        `height: ${rect.height + 8}px`,
        "border: 3.5px solid #E11D48",
        "border-radius: 14px",
        "background: rgba(225, 29, 72, 0.05)",
        "box-shadow: 0 0 0 3px rgba(255,255,255,0.85), 0 6px 18px rgba(225,29,72,0.28)",
      ].join(";");
      layer.appendChild(box);

      const badge = document.createElement("div");
      const text = rect.label ? `${rect.badge} ${rect.label}` : rect.badge;
      const approxWidth = Math.max(90, text.length * 13 + 28);
      const approxHeight = 30;

      let badgeTop =
        rect.top > 38
          ? rect.top - 32
          : Math.min(window.innerHeight - 38, rect.top + rect.height + 6);
      let badgeLeft = Math.max(8, Math.min(window.innerWidth - approxWidth - 8, rect.left));

      // Check collision with previously placed badges
      for (const prev of placedBadges) {
        const horizOverlap = badgeLeft < prev.right + 8 && badgeLeft + approxWidth > prev.left - 8;
        const vertOverlap = Math.abs(badgeTop - prev.top) < approxHeight + 4;
        if (horizOverlap && vertOverlap) {
          // Place below the target box instead of above, or shift right
          const belowTop = Math.min(window.innerHeight - 38, rect.top + rect.height + 8);
          if (Math.abs(belowTop - prev.top) >= approxHeight + 4) {
            badgeTop = belowTop;
          } else {
            badgeLeft = Math.min(window.innerWidth - approxWidth - 8, prev.right + 10);
          }
        }
      }

      placedBadges.push({
        left: badgeLeft,
        top: badgeTop,
        right: badgeLeft + approxWidth,
        bottom: badgeTop + approxHeight,
      });

      badge.style.cssText = [
        "position: fixed",
        `left: ${badgeLeft}px`,
        `top: ${badgeTop}px`,
        "background: #E11D48",
        "color: #FFFFFF",
        "font-family: Pretendard, sans-serif",
        "font-size: 14px",
        "font-weight: 900",
        "padding: 4px 11px",
        "border-radius: 9999px",
        "border: 2px solid #FFFFFF",
        "box-shadow: 0 4px 12px rgba(0,0,0,0.3)",
        "white-space: nowrap",
      ].join(";");
      badge.textContent = text;
      layer.appendChild(badge);
    }
  }, resolvedBoxes);
}

async function clearAnnotations(page: Page) {
  await page.evaluate(() => {
    document.getElementById("tutorial-annotation-layer")?.remove();
  });
}

async function saveDualScreenshot(page: Page, fileName: string, targets: AnnotationTarget[] = []) {
  await clearVideoCaption(page);
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((el) => {
      (el as HTMLElement).style.display = "none";
    });
  });
  if (targets.length > 0) {
    await annotateElements(page, targets);
    await page.waitForTimeout(150);
  }
  const pubPath = path.join(PUBLIC_IMG_DIR, fileName);
  const docPath = path.join(DOCS_IMG_DIR, fileName);
  await page.screenshot({ path: pubPath, fullPage: false });
  fs.copyFileSync(pubPath, docPath);
  if (targets.length > 0) {
    await clearAnnotations(page);
  }
  console.log(`  📸 Saved annotated screenshot: ${fileName}`);
}

async function finalizeVideo(
  contextPage: Page,
  videoFileName: string
) {
  const video = contextPage.video();
  await contextPage.context().close();
  if (video) {
    const rawPath = await video.path();
    if (rawPath && fs.existsSync(rawPath)) {
      const pubVid = path.join(PUBLIC_VID_DIR, videoFileName);
      const docVid = path.join(DOCS_VID_DIR, videoFileName);
      fs.copyFileSync(rawPath, pubVid);
      fs.copyFileSync(rawPath, docVid);
      console.log(`  🎬 Saved workflow video: ${videoFileName}`);
    }
  }
}

async function openRecordedPage(
  browser: Browser,
  viewport = { width: 1440, height: 900 }
): Promise<Page> {
  const authPath = path.resolve(process.cwd(), "e2e/.auth/user.json");
  const context = await browser.newContext({
    storageState: fs.existsSync(authPath) ? authPath : undefined,
    viewport,
    locale: "ko-KR",
    recordVideo: {
      dir: path.resolve(process.cwd(), "e2e/screenshots/tutorial-tmp-videos"),
      size: viewport,
    },
  });
  const page = await context.newPage();
  return page;
}

test.describe.serial("60s Broker Step-by-Step Tutorial Screenshot & Video Suite (SOTA Edition)", () => {
  test.setTimeout(360_000);

  test("1. Video 1 & Modules 0~1: 홈 화면 · 상단/하단 메뉴바 · 큰글씨 밝은 화면 전환 · 설명서 조작법", async ({ browser }) => {
    await ensureDirs();
    const page = await openRecordedPage(browser);

    await page.goto("/broker", { waitUntil: "domcontentloaded" });
    await ensurePaperMode(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);

    await showVideoCaption(
      page,
      "제0장·1장: 상단 4대 고정 메뉴바와 [☀️ 큰글씨 밝은 화면]을 확인합니다"
    );
    await page.waitForTimeout(900);

    // Screenshot 0-1: Top bar & theme toggle
    await saveDualScreenshot(page, "step-00-topbar-and-theme.png", [
      { selector: "#broker-senior-topbar a[href='/broker']", badge: "①", label: "상단 4대 핵심 메뉴바" },
      { selector: "[data-testid='broker-top-tutorial-btn']", badge: "②", label: "쉬운 사용법 안내" },
      { selector: "[data-testid='broker-theme-toggle-btn']", badge: "③", label: "큰글씨 밝은 화면 켜기/끄기" },
    ]);

    // Screenshot 1-1: Quick action 4 cards & 3 KPI cards
    await showVideoCaption(
      page,
      "제1장: 홈 화면 4대 핵심 업무 바로가기 카드와 3대 현황 숫자를 확인합니다"
    );
    await page.waitForTimeout(900);

    await saveDualScreenshot(page, "step-01-home-quick-actions.png", [
      { selector: "#quick-action-new-dealcard", badge: "①", label: "새 물건 등록 (1분)" },
      { selector: "#quick-action-buildings", badge: "②", label: "내 물건 · IM 작성" },
      { selector: "#quick-action-magazine-editor", badge: "③", label: "고객 소식지 발송" },
      { selector: "#quick-action-inbox", badge: "④", label: "고객 문의함" },
    ]);

    // Scroll down to feed & market briefing
    await page.evaluate(() => window.scrollTo({ top: 380, behavior: "smooth" }));
    await page.waitForTimeout(700);
    const briefingBtn = page.locator("button:has-text('시장 브리핑')").first();
    if (await briefingBtn.isVisible().catch(() => false)) {
      await briefingBtn.click();
      await page.waitForTimeout(600);
    }

    await saveDualScreenshot(page, "step-01-home-feed-and-briefing.png", [
      { selector: "button:has-text('시장 브리핑')", badge: "①", label: "시장 브리핑 · 주간 리포트 펼쳐보기" },
      { selector: "#broker-bottom-nav", badge: "②", label: "하단 탐색 바" },
    ]);

    // Open More Menu for Screenshot 0-2
    await showVideoCaption(
      page,
      "제0장: 하단 바 오른쪽 [더보기]를 누르면 고객 명단과 내 프로필 설정이 열립니다"
    );
    const moreBtn = page.locator("button[aria-label='더보기 메뉴']");
    if (await moreBtn.isVisible().catch(() => false)) {
      await moreBtn.click();
      await page.waitForTimeout(700);
    }

    await saveDualScreenshot(page, "step-00-bottom-nav-and-more.png", [
      { selector: "a[href='/broker/clients']", badge: "①", label: "고객 · 구독자 명단" },
      { selector: "a[href='/broker/profile']", badge: "②", label: "내 프로필 · 사무소 정보" },
      { selector: "a[href='/broker/tutorial']", badge: "③", label: "쉬운 이용 안내 (매뉴얼)" },
    ]);

    // Navigate to /broker/tutorial for Screenshot 0-3
    await page.goto("/broker/tutorial", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    await saveDualScreenshot(page, "step-00-tutorial-controls.png", [
      { selector: "[data-testid='tutorial-font-size-toggle']", badge: "①", label: "글자 더 크게 보기 (특대 19px)" },
      { selector: "[data-testid='tutorial-pdf-download-btn']", badge: "②", label: "큰글씨 PDF 매뉴얼 내려받기" },
      { selector: "[data-testid='tutorial-tab-all']", badge: "③", label: "단원별 슬라이딩 선택 탭" },
    ]);

    await finalizeVideo(page, "video-01-home-and-theme.webm");
  });

  test("2. Video 2 & Modules 2~3: 메모로 1분 딜카드 등록 · 6대 탭 · 문구 다듬기 · 카톡 공유", async ({ browser }) => {
    const page = await openRecordedPage(browser);

    await page.goto("/broker/deal-card/new", { waitUntil: "domcontentloaded" });
    await ensurePaperMode(page);
    await page.waitForTimeout(1000);

    await showVideoCaption(
      page,
      "제2장: 새 물건 등록 화면에서 카톡 메모를 붙여넣거나 예시 버튼을 눌러봅니다"
    );
    await page.waitForTimeout(800);

    await saveDualScreenshot(page, "step-02-dealcard-new-empty.png", [
      { selector: "textarea", badge: "①", label: "매물 메모 붙여넣기 입력창" },
      { selector: "button[type='submit'], button:has-text('딜카드')", badge: "②", label: "1분 딜카드 만들기 버튼" },
    ]);

    const memoTextYangpyeong = [
      "양평동4가 117 더레드빌딩 매각 (외 134, 125-2번지 다필지)",
      "매각가 250억 / 보증금 5.37억 / 월 임대료 5,147만",
      "대지면적 518.7㎡ (157평) / 연면적 2,490.88㎡ (753.5평)",
      "준공업지역, 2018년 신축, B1~10F (주차 23대, 승강기 1대)",
      "9호선 선유도역 도보 1분 초역세권 코너, 1층 스타벅스 성업 중",
    ].join("\n");

    const textarea = page.locator("textarea").first();
    await textarea.fill(memoTextYangpyeong);
    await page.waitForTimeout(700);

    await showVideoCaption(
      page,
      "제2장: 양평동 다필지 수익형 빌딩(250억) 메모를 입력하고 [1분 딜카드 만들기]를 누릅니다"
    );
    await page.waitForTimeout(800);

    await saveDualScreenshot(page, "step-02-dealcard-new-filled.png", [
      { selector: "textarea", badge: "①", label: "예시 A: 양평동 다필지 수익형 빌딩 메모 입력" },
      { selector: "button[type='submit'], button:has-text('딜카드')", badge: "②", label: "클릭하여 1분 딜카드 생성" },
    ]);

    // Fill Dangsan memo for Screenshot 2-3
    const memoTextDangsan = [
      "영등포구 당산동5가 11-47 호산당빌딩 매각",
      "매각가 115억 / 보증금 4억 6,000만 / 월세 2,450만 (관리비 별도)",
      "대지 153.3평 (506.8㎡) / 연면적 307.9평 (1,017.85㎡), B1~5F",
      "제2종일반주거지역, 2·9호선 당산역 도보 3분 역세권",
      "1층 약국 및 1~2층 내과 의원 장기 우량 임차 성업 중",
    ].join("\n");
    await textarea.fill(memoTextDangsan);
    await page.waitForTimeout(600);

    await saveDualScreenshot(page, "step-02-dealcard-dangsan-filled.png", [
      { selector: "textarea", badge: "①", label: "예시 B: 당산동 통합계약 수익형 빌딩 메모 입력" },
      { selector: "button[type='submit'], button:has-text('딜카드')", badge: "②", label: "클릭하여 1분 딜카드 생성" },
    ]);

    // Navigate to the verified Yangpyeong deal card detail screen
    await page.goto(`/broker/deal-card/${YANGPYEONG_BUILDING_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1200);

    await showVideoCaption(
      page,
      "제3장: 완성된 1분 딜카드를 확인하고 [✏️ 문구 직접 다듬기]를 열어봅니다"
    );
    await page.waitForTimeout(900);

    await saveDualScreenshot(page, "step-03-dealcard-detail-top.png", [
      { selector: "#cta-generate-im-bottom", badge: "②", label: "다음 단계: 기본 IM 만들기" },
      { selector: "[data-testid='deal-card-edit-toggle']", badge: "①", label: "딜카드 제목 · 문구 직접 다듬기" },
    ]);

    const editToggle = page.locator("[data-testid='deal-card-edit-toggle']");
    if (await editToggle.isVisible().catch(() => false)) {
      await editToggle.click();
      await page.waitForTimeout(600);
    }

    await saveDualScreenshot(page, "step-03-dealcard-editor-open.png", [
      { selector: "[data-testid='deal-card-headline-input']", badge: "①", label: "딜카드 제목 직접 수정" },
      { selector: "[data-testid='deal-card-points-input']", badge: "②", label: "3대 핵심 강점 수정" },
      { selector: "[data-testid='deal-card-save-btn']", badge: "③", label: "변경사항 저장하기" },
    ]);

    if (await editToggle.isVisible().catch(() => false)) {
      await editToggle.click();
      await page.waitForTimeout(400);
    }
    await page.evaluate(() => window.scrollTo({ top: 320, behavior: "smooth" }));
    await page.waitForTimeout(600);

    await saveDualScreenshot(page, "step-03-dealcard-actions-bar.png", [
      { selector: "#cta-share-kakao", badge: "①", label: "카카오톡 공유 / 링크 복사 / 수신자 화면" },
      { selector: "#cta-add-to-magazine", badge: "②", label: "주간 고객 소식지에 바로 넣기" },
      { selector: "#cta-generate-im-bottom", badge: "③", label: "⚡ 기본 IM(PPTX 제안서) 만들기" },
    ]);

    // Scroll down to #deal-card-tabs-container for Screenshot 3-4
    await page.evaluate(() => {
      const el = document.getElementById("deal-card-tabs-container");
      if (el) {
        el.scrollIntoView({ behavior: "instant", block: "start" });
        window.scrollBy(0, -80);
      }
    });
    await page.waitForTimeout(600);

    await saveDualScreenshot(page, "step-03-dealcard-6tabs-comps.png", [
      { selector: "#deal-card-tabs-container button:has-text('딜카드 개요')", badge: "①", label: "🏠 딜카드 개요 탭 (추출 제원 · 보호 항목)" },
      { selector: "#deal-card-tabs-container button:has-text('투자설명서')", badge: "②", label: "📊 투자설명서 (IM) 관리 탭" },
    ]);

    await finalizeVideo(page, "video-02-memo-to-dealcard.webm");

    // Mobile recipient view of public deal card
    const mobilePage = await openRecordedPage(browser, { width: 390, height: 844 });
    await mobilePage.goto(`/d/${YANGPYEONG_BUILDING_ID}`, { waitUntil: "domcontentloaded" });
    await mobilePage.waitForTimeout(1200);
    await saveDualScreenshot(mobilePage, "step-03-public-dealcard-mobile.png", []);
    await mobilePage.context().close();
  });

  test("2b. Video 3-준비 & 준비편: IM 전 자료 준비 · 렌트롤 AI 변환 안내도 · 빈 양식 · 업로드 검산", async ({ browser }) => {
    await ensureDirs();

    // ── (1) 설명 그림 2종: 실제 화면이 아닌 '안내도'이므로 별도(녹화 없는) 컨텍스트에서 HTML로 렌더링 ──
    const figContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
    const fig = await figContext.newPage();
    const FIG_BASE_CSS = `
      @import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css");
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { width: 1440px; background: #F3F2EE; color: #0F172A;
             font-family: Pretendard, "Malgun Gothic", sans-serif; padding: 36px 44px; }
      h1 { font-size: 34px; font-weight: 900; letter-spacing: -0.5px; }
      .sub { font-size: 18px; font-weight: 600; color: #334155; margin-top: 6px; }
      .card { background: #FFFFFF; border: 2px solid #CBD5E1; border-radius: 20px; padding: 20px 22px;
              box-shadow: 0 2px 6px rgba(15,23,42,0.06); }
      .tag { display: inline-block; font-size: 15px; font-weight: 900; padding: 4px 12px; border-radius: 999px; color: #FFFFFF; }
      ul { list-style: none; } li { font-size: 17px; font-weight: 600; line-height: 1.55; padding-left: 22px; position: relative; }
      li::before { content: "•"; position: absolute; left: 6px; font-weight: 900; }
    `;
    const renderFigure = async (fileName: string, html: string) => {
      await fig.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${FIG_BASE_CSS}</style></head><body>${html}</body></html>`, { waitUntil: "load" });
      await fig.evaluate(() => (document as any).fonts?.ready);
      await fig.waitForTimeout(300);
      const contentHeight = await fig.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
      await fig.setViewportSize({ width: 1440, height: Math.max(600, contentHeight) });
      await fig.waitForTimeout(150);
      const pubPath = path.join(PUBLIC_IMG_DIR, fileName);
      await fig.screenshot({ path: pubPath, fullPage: false });
      fs.copyFileSync(pubPath, path.join(DOCS_IMG_DIR, fileName));
      console.log(`  🖼️  Saved explanatory figure: ${fileName}`);
    };

    await renderFigure("step-prep-01-overview.png", `
      <h1>📦 IM 만들기 전 준비물 한눈에 보기</h1>
      <p class="sub">공적장부는 크리딜이 자동으로 가져옵니다. 대표님은 오른쪽 자료만 챙기시면 됩니다.</p>
      <div style="display:grid;grid-template-columns:5fr 7fr;gap:22px;margin-top:22px;">
        <div class="card" style="border-color:#93C5FD;background:#EFF6FF;">
          <span class="tag" style="background:#1D4ED8;">① 🤖 시스템이 자동으로 가져옵니다 (준비 불필요)</span>
          <ul style="margin-top:16px;color:#1E3A8A;">
            <li>건축물대장 — 연면적 · 층수 · 준공연도 · 주차 · 승강기</li>
            <li>토지대장 · 다필지 대지면적 자동 합산</li>
            <li>토지이용계획 — 용도지역 · 지구 · 규제</li>
            <li>개별공시지가 10년 추이</li>
            <li>V-World 연속지적도</li>
            <li>국토부 실거래 사례 (인근 매매)</li>
            <li>가까운 지하철역 · 도보 시간 · 배후 아파트</li>
          </ul>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div class="card" style="border-color:#FCA5A5;background:#FFF1F2;">
            <span class="tag" style="background:#BE123C;">② ✋ 필수 — 이것만 있어도 IM 생성 (렌트롤 등급 R1)</span>
            <ul style="margin-top:10px;color:#881337;">
              <li>매각 희망가 · 정확한 지번</li>
              <li>렌트롤 원본 — 층/호실 · 업종 · 보증금 · 월세 · 계약 만료일 · 임대상태(임대중/공실/자가사용)</li>
            </ul>
          </div>
          <div class="card" style="border-color:#FCD34D;background:#FFFBEB;">
            <span class="tag" style="background:#B45309;">③ 권장 — 제안서 품질이 확 올라갑니다 (R2)</span>
            <ul style="margin-top:10px;color:#78350F;">
              <li>임대면적 · 전용면적 · 관리비 · 적용법령(상가/주택)</li>
              <li>건물 사진 — 외관 정면 1장 + 로비 · 내부 3~5장</li>
              <li>투자 포인트 3줄 (한 줄 60자 이내)</li>
            </ul>
          </div>
          <div class="card" style="border-color:#6EE7B7;background:#ECFDF5;">
            <span class="tag" style="background:#047857;">④ 정밀 — 매수자 실사 수준 (R3)</span>
            <ul style="margin-top:10px;color:#065F46;">
              <li>최초 계약일 · 대항력(사업자등록) · 갱신요구권 행사 · 계약서 원본 확인 여부</li>
              <li>매입 후 전략(공실·자가사용 층 전환 시 보증금·월세) · 인근 매물 3~4건 · 층별 시장 임대료</li>
            </ul>
          </div>
        </div>
      </div>
      <div style="margin-top:20px;background:#4338CA;color:#FFFFFF;border-radius:16px;padding:16px 22px;font-size:20px;font-weight:900;">
        💡 렌트롤 엑셀은 손으로 치지 마세요 — 매도인 자료를 AI 챗봇에 올리고 [변환 지시문]을 붙여넣으면 5분이면 끝납니다 (준비편 3단계)
      </div>
    `);

    const gridCols = "ABCDEFGHIJKLMNOP".split("");
    const miniGrid = `
      <table style="border-collapse:collapse;margin-top:12px;font-size:13px;font-weight:800;">
        <tr><td style="width:30px;"></td>${gridCols.map((c) => `<td style="width:26px;text-align:center;background:#E2E8F0;border:1px solid #94A3B8;">${c}</td>`).join("")}<td style="padding-left:6px;color:#64748B;">Q~ 회색(자동)</td></tr>
        ${[12, 13, 14, 15].map((r) => `<tr><td style="text-align:center;background:#E2E8F0;border:1px solid #94A3B8;">${r}</td>${gridCols.map((c, i) => {
          const isA13 = r === 13 && i === 0;
          const bg = r === 12 ? "#CBD5E1" : r >= 13 ? "#FEF9C3" : "#FFFFFF";
          return `<td style="height:24px;border:${isA13 ? "3px solid #E11D48" : "1px solid #CBD5E1"};background:${bg};"></td>`;
        }).join("")}<td style="background:#E5E7EB;border:1px solid #CBD5E1;width:60px;"></td></tr>`).join("")}
      </table>
      <p style="margin-top:8px;font-size:15px;font-weight:900;color:#BE123C;">▲ 빨간 칸 A13 클릭 → Ctrl + V (노란 칸에만 들어감)</p>
    `;
    await renderFigure("step-prep-03-ai-flow.png", `
      <h1>🤖 렌트롤 엑셀, AI 챗봇으로 5분 만에 표준 양식(v1.5)으로 바꾸기</h1>
      <p class="sub">ChatGPT · Claude · Gemini 무엇이든 됩니다. 크리딜 설명서의 [변환 지시문]만 복사해서 붙여넣으세요.</p>
      <div style="display:grid;grid-template-columns:1fr 40px 1.15fr 40px 1.9fr 40px 1fr;align-items:stretch;margin-top:24px;">
        <div class="card">
          <span class="tag" style="background:#475569;">① 기존 자료</span>
          <ul style="margin-top:14px;">
            <li>매도인 엑셀</li><li>PPT 페이지</li><li>휴대폰 사진 · 화면 캡처</li><li>PDF</li>
          </ul>
          <p style="margin-top:14px;font-size:15px;font-weight:800;color:#9F1239;">🔒 주택 임차인 실명 · 연락처는 미리 지우기</p>
        </div>
        <div style="display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:900;color:#64748B;">▶</div>
        <div class="card" style="border-color:#C4B5FD;background:#F5F3FF;">
          <span class="tag" style="background:#6D28D9;">② AI 챗봇에 올리기</span>
          <ul style="margin-top:14px;color:#4C1D95;">
            <li>📎 클립 버튼으로 자료 첨부</li>
            <li>설명서의 <b>[변환 지시문]</b> 복사</li>
            <li>입력창에 Ctrl + V → 보내기</li>
          </ul>
          <div style="margin-top:14px;background:#FFFFFF;border:2px dashed #8B5CF6;border-radius:12px;padding:10px 12px;font-size:14px;font-weight:700;color:#5B21B6;line-height:1.5;">
            [CREDEAL 렌트롤 변환 요청]<br/>■ 출력 1 머리 정보<br/>■ 출력 2 호실 표 16열<br/>■ 출력 3 검산 합계
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:900;color:#64748B;">▶</div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div class="card" style="border-color:#93C5FD;background:#EFF6FF;padding:16px 18px;">
            <span class="tag" style="background:#1D4ED8;">③-A 권장 · 모든 챗봇 — 16열 표를 빈 양식에 붙여넣기</span>
            ${miniGrid}
          </div>
          <div class="card" style="border-color:#FCD34D;background:#FFFBEB;padding:16px 18px;">
            <span class="tag" style="background:#B45309;">③-B 빠른 방법 · 파일 기능 AI — 빈 양식째 채워 받기</span>
            <p style="margin-top:10px;font-size:16px;font-weight:700;color:#78350F;line-height:1.5;">빈 양식 + 자료를 함께 올리고 [빈 양식 채우기 지시문] → 채워진 .xlsx 내려받기<br/>※ 'v1.5' 표시가 안 뜨면 ③-A로 다시</p>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:900;color:#64748B;">▶</div>
        <div class="card" style="border-color:#6EE7B7;background:#ECFDF5;">
          <span class="tag" style="background:#047857;">④ 크리딜 업로드</span>
          <ul style="margin-top:14px;color:#065F46;">
            <li>[엑셀/CSV 업로드]</li>
            <li>'v1.5 · ㎡/평 입력' 표시 확인</li>
            <li>보증금 · 월세 · 관리비 합계를 원본과 대조</li>
          </ul>
        </div>
      </div>
      <div style="margin-top:22px;background:#9F1239;color:#FFFFFF;border-radius:16px;padding:16px 22px;font-size:19px;font-weight:900;">
        ⚠ AI는 숫자를 잘못 읽을 수 있습니다 (예: 6,000만 → 600만). 업로드 화면의 합계가 원본 합계와 같은지 꼭 확인하세요.
      </div>
    `);
    await figContext.close();

    // ── (2) 실제 화면: IM 입력 시트 렌트롤 상자 & v1.5 업로드 직후 미리보기 ──
    const page = await openRecordedPage(browser);
    page.on("dialog", (d) => d.accept().catch(() => undefined)); // '기존 렌트롤 덮어쓰기' 확인창 자동 승인 (localStorage 초안에만 반영)

    await page.goto(`/broker/deal-card/${YANGPYEONG_BUILDING_ID}`, { waitUntil: "domcontentloaded" });
    await ensurePaperMode(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);

    await showVideoCaption(page, "준비편: [⚡ 기본 IM 만들기]로 입력 시트를 열고 렌트롤 불러오기 상자를 찾습니다");
    const openImBtn = page.locator("#cta-mobile-im-basic, [data-testid='generate-basic-im']").first();
    await openImBtn.waitFor({ state: "visible", timeout: 15000 });
    await openImBtn.click();
    await page.locator("div[role='dialog']").waitFor({ state: "visible", timeout: 15000 });
    await page.waitForTimeout(900);

    const templateBtn = page.locator("[data-testid='rentroll-template-download']").first();
    await templateBtn.waitFor({ state: "visible", timeout: 15000 });
    await templateBtn.evaluate((el) => el.scrollIntoView({ behavior: "instant", block: "center" }));
    await page.waitForTimeout(700);

    await showVideoCaption(page, "준비편: [📥 빈 양식]으로 표준 렌트롤(v1.5)을 내려받아 AI 챗봇 변환에 사용합니다");
    await page.waitForTimeout(900);
    await saveDualScreenshot(page, "step-prep-02-rentroll-importer.png", [
      { selector: "[data-testid='rentroll-template-download']", badge: "①", label: "빈 양식" },
      { selector: "[data-testid='rentroll-upload-btn']", badge: "②", label: "엑셀 업로드" },
      { selector: "[data-testid='rentroll-mode-text']", badge: "③", label: "텍스트 입력" },
    ]);

    await showVideoCaption(page, "준비편: AI로 변환·저장한 표준 렌트롤 엑셀을 [엑셀/CSV 업로드]로 올립니다");
    await page.waitForTimeout(700);
    const fixture = path.resolve(
      process.cwd(),
      "docs/golden-test-data/p5-yangpyeong-income/r3-verified/CREDEAL_rentroll_p5-yangpyeong-income_r3-verified.xlsx"
    );
    await page.locator("[data-testid='rentroll-file-input']").setInputFiles(fixture);
    const preview = page.locator("[data-testid='rentroll-preview']").first();
    await preview.waitFor({ state: "visible", timeout: 20000 });
    await page.locator("[data-testid='rent-roll-version-badge']").first()
      .evaluate((el) => el.scrollIntoView({ behavior: "instant", block: "start" }));
    await page.evaluate(() => {
      const dialog = document.querySelector("div[role='dialog']");
      const scrollArea = dialog?.querySelector("div.overflow-y-auto");
      if (scrollArea) scrollArea.scrollTop -= 90;
    });
    await page.waitForTimeout(800);

    await showVideoCaption(page, "준비편: 'v1.5' 표시와 보증금·월세·관리비 합계를 원본과 대조해 검산합니다");
    await page.waitForTimeout(900);
    await saveDualScreenshot(page, "step-prep-04-upload-preview.png", [
      { selector: "[data-testid='rent-roll-version-badge']", badge: "①", label: "v1.5 양식 · 면적 단위 확인" },
      { selector: "[data-testid='rentroll-preview'] table", badge: "②", label: "호실별 데이터 확인 · 바로 수정" },
    ]);

    await finalizeVideo(page, "video-03p-prep-rentroll.webm");
  });

  test("3. Video 3 & Modules 4~5: 기본 IM(PPTX 제안서) 만들기 & IM 완성 확인", async ({ browser }) => {
    const page = await openRecordedPage(browser);

    await page.goto(`/broker/deal-card/${YANGPYEONG_BUILDING_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await ensurePaperMode(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);

    await showVideoCaption(
      page,
      "제4장: 상단 [⚡ 기본 IM 만들기] 버튼을 눌러 투자설명서 입력 시트를 엽니다"
    );
    const openImBtn = page.locator("#cta-mobile-im-basic, [data-testid='generate-basic-im']").first();
    await openImBtn.waitFor({ state: "visible", timeout: 15000 });
    await openImBtn.click();
    await page.locator("div[role='dialog']").waitFor({ state: "visible", timeout: 15000 });
    await page.waitForTimeout(900);

    await saveDualScreenshot(page, "step-04-bottomsheet-posture-address.png", [
      { selector: "#bs-step-1", badge: "①", label: "1단계: 투자 목적 5종 중 선택 (임대수익 추천)" },
      { selector: "div[role='dialog'] input[placeholder*='동/도로명']", badge: "②", label: "2단계: 정확한 주소 검색 · 대장 자동 연결" },
    ]);

    // Scroll inside bottom sheet dialog to price & yield section
    await page.evaluate(() => {
      const target = document.getElementById("input-asking-price");
      if (target) {
        target.scrollIntoView({ behavior: "instant", block: "center" });
      }
    });
    await page.waitForTimeout(800);

    await showVideoCaption(
      page,
      "제4장: 매각 희망가 빠른 합산 버튼(+100억/+10억)과 수익률 자동 역산을 확인합니다"
    );
    await page.waitForTimeout(800);

    await saveDualScreenshot(page, "step-04-bottomsheet-price-yield.png", [
      { selector: "#bs-step-2", badge: "①", label: "월 임대료 · 보증금 입력 (한글 금액 실시간 표시)" },
      { selector: "#input-asking-price", badge: "②", label: "매각 희망가 (+100억/+10억 빠른 합산 · 수익률 역산)" },
    ]);

    // Scroll further down to photos & generate button
    await page.evaluate(() => {
      const dialog = document.querySelector("div[role='dialog']");
      const scrollArea = dialog?.querySelector("div.overflow-y-auto");
      if (scrollArea) {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    });
    await page.waitForTimeout(800);

    await saveDualScreenshot(page, "step-04-bottomsheet-rentroll-photos.png", [
      { selector: "div[role='dialog'] button:has-text('IM')", badge: "②", label: "⚡ 기본 IM 생성 시작 버튼" },
    ]);

    // Scroll back to top of bottom sheet and click Owner-Use / Development posture for Screenshot 4-4
    await page.evaluate(() => {
      const dialog = document.querySelector("div[role='dialog']");
      const scrollArea = dialog?.querySelector("div.overflow-y-auto");
      if (scrollArea) {
        scrollArea.scrollTop = 0;
      }
    });
    await page.waitForTimeout(500);
    const ownerPostureBtn = page.locator("div[role='dialog'] button:has-text('자가사용')").first();
    if (await ownerPostureBtn.isVisible().catch(() => false)) {
      await ownerPostureBtn.click();
      await page.waitForTimeout(600);
    }

    await saveDualScreenshot(page, "step-04-bottomsheet-owner-dev-mode.png", [
      { selector: "div[role='dialog'] button:has-text('자가사용')", badge: "①", label: "비수익형 사옥(자가사용) 목적 선택" },
      { selector: "div[role='dialog'] button:has-text('신축')", badge: "②", label: "신축 · 리모델링 개발부지 목적 선택" },
    ]);

    // Navigate to IM Approval page for Yangpyeong using YANGPYEONG_DOC_ID
    await showVideoCaption(
      page,
      "제5장: IM 완성 확인 화면에서 [📐 슬라이드 미리보기 · 편집 후 다운로드]와 4대 필수 점검(✅)을 확인합니다"
    );
    await page.goto(
      `/broker/im-approval/${YANGPYEONG_DOC_ID}`,
      { waitUntil: "domcontentloaded" }
    );
    await page.locator("#approval-top-download-pptx").waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(1200);

    await saveDualScreenshot(page, "step-05-im-approval-checklist.png", [
      { selector: "#approval-top-studio-btn", badge: "①", label: "📐 슬라이드 미리보기 · 편집 후 다운로드" },
      { selector: "#approval-top-download-pptx", badge: "②", label: "⚡ PPTX 바로 다운로드" },
      { selector: "h3:has-text('제안서 필수 데이터 자동 점검')", badge: "③", label: "필수 데이터 4항목 자동 점검 완료" },
    ]);

    await page.evaluate(() => window.scrollTo({ top: 680, behavior: "instant" }));
    await page.waitForTimeout(800);

    await showVideoCaption(
      page,
      "제5장: 사진 역할(📌대표/🏢외관/🚫제외)을 지정하고 3대 핵심 투자 포인트를 점검합니다"
    );
    await page.waitForTimeout(900);

    await saveDualScreenshot(page, "step-05-im-approval-narrative-download.png", [
      { selector: "h3:has-text('매물 사진 관리')", badge: "①", label: "사진 역할 지정 (📌대표 · 🏢외관 · 🚫제외)" },
      { selector: "h3:has-text('상단 투자 요약 편집')", badge: "②", label: "표지 제목 · 3대 핵심 투자 포인트 2줄 편집" },
    ]);

    // Navigate to Basic IM Studio (/broker/basic-im-studio/[buildingId])
    await showVideoCaption(
      page,
      "제5장: [📐 슬라이드 미리보기 · 편집 후 다운로드]를 눌러 16:9 슬라이드 스튜디오를 엽니다"
    );
    await page.goto(
      `/broker/basic-im-studio/${YANGPYEONG_BUILDING_ID}`,
      { waitUntil: "domcontentloaded" }
    );
    await page.locator("[data-testid='studio-slide-canvas']").waitFor({ state: "visible", timeout: 25000 });
    await page.waitForTimeout(1000);

    // Click Slide 02 (투자 핵심 요약) so the 16:9 preview shows the rich summary slide & AI polish buttons
    const slide2Btn = page.locator("[data-testid='studio-slide-navigator'] >> text=투자 핵심 요약").first();
    if (await slide2Btn.isVisible().catch(() => false)) {
      await slide2Btn.click();
      await page.waitForTimeout(700);
    }

    await saveDualScreenshot(page, "step-05-studio-slide-editor.png", [
      { selector: "[data-testid='studio-slide-navigator']", badge: "①", label: "10면 슬라이드 목록 (순서·포함/제외)" },
      { selector: "[data-testid='studio-slide-canvas']", badge: "②", label: "16:9 실시간 캔버스 (글자 클릭 시 바로 수정)" },
      { selector: "[data-testid='studio-slide-editor']", badge: "③", label: "슬라이드 편집 & ✨ AI 문구 다듬기" },
    ]);

    // Switch to [🎨 테마·프리셋] tab and select a theme preset
    await showVideoCaption(
      page,
      "제5장: 우측 [🎨 테마·프리셋] 탭에서 10종 색상 테마를 0.1초 실시간 미리보기로 전환합니다"
    );
    const themeTabBtn = page.locator("[data-testid='studio-tab-theme']").first();
    if (await themeTabBtn.isVisible().catch(() => false)) {
      await themeTabBtn.click();
      await page.waitForTimeout(700);
    }
    const presetCard = page.locator("[data-testid='studio-slide-editor'] button:has-text('코퍼레이트 에메랄드')").first();
    if (await presetCard.isVisible().catch(() => false)) {
      await presetCard.click();
      await page.waitForTimeout(600);
    }

    await saveDualScreenshot(page, "step-05-studio-theme-presets.png", [
      { selector: "[data-testid='studio-right-tabs']", badge: "①", label: "편집 · 테마프리셋 · 헤더푸터 탭" },
      { selector: "[data-testid='studio-slide-editor']", badge: "②", label: "10종 프리셋 썸네일 & 브랜드 강조색 선택" },
      { selector: "[data-testid='studio-download-pptx-btn']", badge: "③", label: "📥 편집 반영 PPTX 다운로드" },
    ]);

    await finalizeVideo(page, "video-03-basic-im-generation.webm");
  });

  test("4. Video 4 & Modules 5~6: 매수자용 웹 제안서(/im-lite) & 내 물건 보관함 관리", async ({ browser }) => {
    const page = await openRecordedPage(browser);

    // Create composite PPTX slide showcase image first using existing high-res slide PNGs
    const slide1Path = path.resolve(
      process.cwd(),
      "e2e/screenshots/income-ig1-corrected/slides/slide-01.png"
    );
    const slide2Path = path.resolve(
      process.cwd(),
      "e2e/screenshots/income-ig1-corrected/slides/slide-02.png"
    );
    const slide5Path = path.resolve(
      process.cwd(),
      "e2e/screenshots/development-jamwon-r3/slides/slide-05.png"
    );

    if (fs.existsSync(slide1Path) && fs.existsSync(slide2Path) && fs.existsSync(slide5Path)) {
      const b1 = fs.readFileSync(slide1Path).toString("base64");
      const b2 = fs.readFileSync(slide2Path).toString("base64");
      const b5 = fs.readFileSync(slide5Path).toString("base64");
      await page.setContent(`
        <!DOCTYPE html>
        <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <style>
            body {
              margin: 0;
              padding: 28px;
              background: #F3F2EE;
              font-family: Pretendard, system-ui, sans-serif;
              color: #0F172A;
            }
            h2 {
              margin: 0 0 16px 0;
              font-size: 22px;
              font-weight: 900;
              color: #1E3A8A;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 18px;
            }
            .card {
              background: #FFFFFF;
              border: 2px solid #CBD5E1;
              border-radius: 16px;
              padding: 12px;
              box-shadow: 0 6px 18px rgba(15,23,42,0.08);
            }
            .card img {
              width: 100%;
              border-radius: 8px;
              border: 1px solid #E2E8F0;
              display: block;
            }
            .caption {
              margin-top: 10px;
              font-size: 15px;
              font-weight: 800;
              text-align: center;
              color: #0F172A;
            }
          </style>
        </head>
        <body>
          <h2>📊 [📥 PPTX 제안서 파일 받기]로 저장된 파워포인트 슬라이드 실제 예시</h2>
          <div class="grid">
            <div class="card">
              <img src="data:image/png;base64,${b1}" />
              <div class="caption">① 01 표지 (건물 사진 · 핵심 제원 · 중개법인 명함)</div>
            </div>
            <div class="card">
              <img src="data:image/png;base64,${b2}" />
              <div class="caption">② 02 투자 요약 (매매가 · 수익률 · 3대 핵심 포인트)</div>
            </div>
            <div class="card">
              <img src="data:image/png;base64,${b5}" />
              <div class="caption">③ 05 토지·다필지 정보 (지적도 · 필지별 지번 명세표)</div>
            </div>
          </div>
        </body>
        </html>
      `);
      await page.waitForTimeout(400);
      await saveDualScreenshot(page, "step-05-pptx-slides-showcase.png", []);
    }

    // Open Buyer Mobile IM Viewer (/im-lite)
    await page.goto(`/im-lite/${YANGPYEONG_BUILDING_ID}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800);

    await showVideoCaption(
      page,
      "제5장: 매수 고객이 스마트폰·PC에서 열어보는 웹 투자설명서(/im-lite) 화면입니다"
    );
    await page.waitForTimeout(900);

    await saveDualScreenshot(page, "step-05-mobile-im-viewer-top.png", [
      { selector: "main h1, main h2", badge: "①", label: "매물명 및 매각가 · 평당가(만 원/평)" },
    ]);

    await page.evaluate(() => window.scrollTo({ top: 750, behavior: "smooth" }));
    await page.waitForTimeout(1000);

    await saveDualScreenshot(page, "step-05-mobile-im-viewer-map-rentroll.png", []);

    // Module 6: /broker/buildings
    await page.goto("/broker/buildings", { waitUntil: "domcontentloaded" });
    await ensurePaperMode(page);
    await page.waitForTimeout(1200);

    await showVideoCaption(
      page,
      "제6장: [🏢 내 물건 목록]에서 등록된 딜카드와 IM 제안서를 검색·관리합니다"
    );
    await page.waitForTimeout(900);

    await saveDualScreenshot(page, "step-06-buildings-dealcard-list.png", [
      { selector: "#cta-new-deal-card-from-buildings", badge: "①", label: "+ 새 딜카드 만들기" },
      { selector: "input[placeholder*='검색']", badge: "②", label: "동 이름·용도로 내 물건 검색" },
    ]);

    await page.goto("/broker/buildings?tab=im", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    await saveDualScreenshot(page, "step-06-buildings-im-list.png", []);

    await finalizeVideo(page, "video-04-buyer-im-viewer.webm");
  });

  test("5. Video 5 & Module 7: 주간 고객 소식지(모바일 매거진) 5분 간단 모드 & 8단계 상세 편집", async ({ browser }) => {
    const page = await openRecordedPage(browser);

    await page.goto("/broker/magazine-editor?mode=simple", { waitUntil: "domcontentloaded" });
    await ensurePaperMode(page);
    await page.reload({ waitUntil: "domcontentloaded" });

    const gateOrEditor = page
      .locator("[data-testid='simple-editor-root'], [data-testid='slug-setup-gate'], #simple-field-note-comment")
      .first();
    await gateOrEditor.waitFor({ state: "visible", timeout: 35000 });

    const slugSubmit = page.locator("[data-testid='slug-setup-submit']");
    if (await slugSubmit.isVisible().catch(() => false)) {
      await slugSubmit.click();
      await page.locator("[data-testid='simple-editor-root'], #simple-field-note-comment").first().waitFor({
        state: "visible",
        timeout: 30000,
      });
    }

    try {
      const frame = page.frameLocator("[data-testid='phone-frame'] iframe");
      await frame.locator("h1, h2, main, section").first().waitFor({
        state: "visible",
        timeout: 25000,
      });
    } catch {
      // Fallback if inline mode
    }
    await page.waitForTimeout(1500);

    await showVideoCaption(
      page,
      "제7장: [📰 고객 소식지] 5분 간단 모드에서 시작 문장 버튼을 눌러 이번 주 한마디를 적습니다"
    );
    await page.waitForTimeout(900);

    const starterChip = page.locator("[data-testid^='starter-chip-']").first();
    if (await starterChip.isVisible().catch(() => false)) {
      await starterChip.click();
      await page.waitForTimeout(700);
    }

    await saveDualScreenshot(page, "step-07-magazine-simple-step1.png", [
      { selector: "[data-testid='note-starter-chips']", badge: "①", label: "한마디 시작 문장 추천 버튼" },
      { selector: "#simple-field-note-comment", badge: "②", label: "① 이번 주 한마디 입력창 (1~3문장)" },
      { selector: "[data-testid='phone-frame']", badge: "③", label: "우측 실시간 아이폰 14 Pro 미리보기" },
    ]);

    // Scroll left editor panel down to Step 2, Step 3, and Publish button
    await page.evaluate(() => {
      const panel = document.getElementById("editor-tabpanel");
      if (panel) {
        panel.scrollTop = 520;
      }
      window.scrollTo(0, 480);
    });
    await page.waitForTimeout(800);

    await showVideoCaption(
      page,
      "제7장: 소개할 매물을 체크하고 시장 온도를 확인한 뒤 [🚀 이번 주 매거진 발행하기]를 누릅니다"
    );
    await page.waitForTimeout(900);

    await saveDualScreenshot(page, "step-07-magazine-simple-step2-step3.png", [
      { selector: "[data-testid='simple-deal-picker'], [data-testid='simple-deals-empty']", badge: "①", label: "② 소개할 매물 체크 (최대 3건)" },
      { selector: "[data-testid='simple-market-temp-group']", badge: "②", label: "③ 이번 주 현장 시장 온도 선택" },
      { selector: "[data-testid='simple-publish-button']", badge: "③", label: "🚀 이번 주 매거진 발행하기" },
    ]);

    // Capture reader view from phone frame
    const phoneFrame = page.locator("[data-testid='phone-frame']");
    if (await phoneFrame.isVisible().catch(() => false)) {
      const pubPath = path.join(PUBLIC_IMG_DIR, "step-07-magazine-reader-mobile.png");
      const docPath = path.join(DOCS_IMG_DIR, "step-07-magazine-reader-mobile.png");
      await clearVideoCaption(page);
      await phoneFrame.screenshot({ path: pubPath });
      fs.copyFileSync(pubPath, docPath);
      console.log("  📸 Saved annotated screenshot: step-07-magazine-reader-mobile.png");
    } else {
      await saveDualScreenshot(page, "step-07-magazine-reader-mobile.png", []);
    }

    // Switch to 8-step Full Mode (Field Note tab) for Screenshots 7-3 and 7-4
    await page.evaluate(() => {
      const panel = document.getElementById("editor-tabpanel");
      if (panel) panel.scrollTop = 0;
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(500);
    const fieldNoteTab = page.locator("button[role='tab']:has-text('필드노트')").first();
    if (await fieldNoteTab.isVisible().catch(() => false)) {
      await fieldNoteTab.click();
      await page.waitForTimeout(800);
    }

    await saveDualScreenshot(page, "step-07-magazine-full-mode-tabs.png", [
      { selector: "div[role='tablist']", badge: "①", label: "8개 전문 편집 탭 (커버~성과)" },
      { selector: "[data-testid='editor-mode-bar']", badge: "②", label: "간단 모드 ↔ 상세 편집(8단계) 스위처" },
    ]);

    const publishTab = page.locator("button[role='tab']:has-text('발행설정')").first();
    if (await publishTab.isVisible().catch(() => false)) {
      await publishTab.click();
      await page.waitForTimeout(800);
    }

    await saveDualScreenshot(page, "step-07-magazine-full-publish-analytics.png", [
      { selector: "button[role='tab']:has-text('발행설정')", badge: "①", label: "발행설정 탭 (섹션 포함 · 발송 대상)" },
      { selector: "button[role='tab']:has-text('성과')", badge: "②", label: "성과 탭 (열람·클릭 통계)" },
    ]);

    await finalizeVideo(page, "video-05-weekly-magazine.webm");
  });

  test("6. Video 6 & Modules 8~9 + PDF Export: 고객·문의함 관리, 내 프로필 설정, 큰글씨 PDF 생성", async ({ browser }) => {
    const page = await openRecordedPage(browser);

    // Module 8: Clients list
    await page.goto("/broker/clients", { waitUntil: "domcontentloaded" });
    await ensurePaperMode(page);
    await page.waitForTimeout(1200);

    await showVideoCaption(
      page,
      "제8장: [고객 관리]에서 VIP 매도인·매수인 명단을 검색하고 새 고객을 등록합니다"
    );
    await page.waitForTimeout(800);

    await saveDualScreenshot(page, "step-08-clients-list.png", [
      { selector: "#cta-new-client", badge: "①", label: "+ 신규 고객 등록 버튼" },
      { selector: "#client-search", badge: "②", label: "이름·회사·연락처 검색" },
    ]);

    // Clients new
    await page.goto("/broker/clients/new", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    await saveDualScreenshot(page, "step-08-clients-new.png", []);

    // Inbox
    await page.goto("/broker/inbox", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);

    await showVideoCaption(
      page,
      "제8장: [고객 문의함]에서 상세 주소 열람 요청과 반복 열람(🔥 관심 고객) 알림을 확인합니다"
    );
    await page.waitForTimeout(800);

    await saveDualScreenshot(page, "step-08-inbox-view.png", [
      { selector: "button:has-text('요청/열람')", badge: "①", label: "🔑 요청/열람 탭" },
      { selector: "button:has-text('채팅/반응')", badge: "②", label: "💬 채팅/반응 탭" },
      { selector: "button:has-text('알림')", badge: "③", label: "🔔 시스템 알림 탭" },
    ]);

    // Module 9: Profile
    await page.goto("/broker/profile", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    await showVideoCaption(
      page,
      "제9장: [내 프로필 설정]에서 딜카드·IM 표지·소식지에 인쇄될 필수 3대 명함 정보를 입력합니다"
    );
    await page.waitForTimeout(900);

    await saveDualScreenshot(page, "step-09-profile-top-essential.png", [
      { selector: "[data-testid='profile-where-it-shows-banner']", badge: "①", label: "명함·제안서 인쇄 위치 안내" },
      { selector: "#profile-display-name", badge: "②", label: "성함 · 연락처 · 중개사무소 상호 입력" },
      { selector: "[data-testid='save-profile-top-btn']", badge: "③", label: "💾 변경사항 저장" },
    ]);

    await page.evaluate(() => window.scrollTo({ top: 1350, behavior: "smooth" }));
    await page.waitForTimeout(900);

    await showVideoCaption(
      page,
      "제9장: 전문 지역·자산을 선택하고 [✨ AI로 자기소개 자동 작성하기]를 눌러 저장합니다"
    );
    await page.waitForTimeout(900);

    await saveDualScreenshot(page, "step-09-profile-details-and-bio.png", [
      { selector: "#generate-bio-btn", badge: "①", label: "✨ AI로 자기소개 자동 작성하기" },
      { selector: "#save-profile-btn", badge: "②", label: "💾 내 프로필 · 사무소 정보 저장하기" },
    ]);

    await finalizeVideo(page, "video-06-clients-inbox-profile.webm");

    // Finally: Open /broker/tutorial?print=1 and export the Printable Large-Print PDF Manual!
    const pdfContext = await browser.newContext({
      storageState: fs.existsSync(path.resolve(process.cwd(), "e2e/.auth/user.json"))
        ? path.resolve(process.cwd(), "e2e/.auth/user.json")
        : undefined,
      viewport: { width: 1280, height: 900 },
      locale: "ko-KR",
    });
    const pdfPage = await pdfContext.newPage();
    await pdfPage.goto("/broker/tutorial?print=1", { waitUntil: "domcontentloaded" });
    await pdfPage.waitForTimeout(2000);

    // Ensure all lazy images on the tutorial page are loaded before PDF print
    await pdfPage.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll("img"));
      for (const img of imgs) {
        img.loading = "eager";
        img.scrollIntoView();
        await new Promise((r) => setTimeout(r, 40));
      }
      window.scrollTo(0, 0);
    });
    await pdfPage.waitForTimeout(1000);

    const docsPdfPath = path.resolve(
      process.cwd(),
      "docs/tutorial/CREDEAL_60대_중개인_큰글씨_매뉴얼.pdf"
    );
    const publicPdfPath = path.resolve(
      process.cwd(),
      "public/tutorials/CREDEAL_60대_중개인_큰글씨_매뉴얼.pdf"
    );

    await pdfPage.pdf({
      path: docsPdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
    });
    fs.copyFileSync(docsPdfPath, publicPdfPath);
    console.log(`  📄 Exported Large-Print PDF Manual: ${docsPdfPath}`);

    await pdfContext.close();
  });
});
