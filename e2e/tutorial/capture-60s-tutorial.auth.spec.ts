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
      "제5장: IM 완성 확인 화면에서 [📥 PPTX 제안서 파일 받기]와 4대 필수 점검(✅)을 확인합니다"
    );
    await page.goto(
      `/broker/im-approval/${YANGPYEONG_DOC_ID}`,
      { waitUntil: "domcontentloaded" }
    );
    await page.locator("#approval-top-download-pptx").waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(1200);

    await saveDualScreenshot(page, "step-05-im-approval-checklist.png", [
      { selector: "#approval-top-download-pptx", badge: "①", label: "📥 PPTX 제안서 파일 바로 받기" },
      { selector: "button:has-text('웹 화면 열기')", badge: "②", label: "🖥️ 매수자용 웹 화면 열기" },
      { selector: "h3:has-text('제안서 필수 데이터 자동 점검')", badge: "③", label: "필수 데이터 4항목 자동 점검 완료" },
    ]);

    await page.evaluate(() => window.scrollTo({ top: 680, behavior: "instant" }));
    await page.waitForTimeout(800);

    await showVideoCaption(
      page,
      "제5장: 사진 역할(📌대표/🏢외관/🚫제외)을 지정하고 3대 핵심 투자 포인트를 다듬습니다"
    );
    await page.waitForTimeout(900);

    await saveDualScreenshot(page, "step-05-im-approval-narrative-download.png", [
      { selector: "h3:has-text('매물 사진 관리')", badge: "①", label: "사진 역할 지정 (📌대표 · 🏢외관 · 🚫제외)" },
      { selector: "h3:has-text('상단 투자 요약 편집')", badge: "②", label: "표지 제목 · 3대 핵심 투자 포인트 2줄 편집" },
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
