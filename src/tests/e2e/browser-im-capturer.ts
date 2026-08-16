/**
 * @file browser-im-capturer.ts
 * @description Playwright 기반 모바일 IM 웹 뷰어 화면 캡처 유틸리티
 */

import { chromium, type Browser, type Page } from 'playwright';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

export interface BrowserCaptureResult {
  fullPageMobile: string;
  viewport1Mobile: string;
  heroCardMobile?: string;
  galleryMobile?: string;
  sectionsMobile: Array<{ sectionIndex: number; title: string; imagePath: string }>;
  floatingActionBarMobile?: string;
  fullPageDesktop: string;
}

export async function captureMobileImViewer(
  targetUrl: string,
  outputDir: string,
  caseId: string
): Promise<BrowserCaptureResult> {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const browser: Browser = await chromium.launch({ headless: true });
  const result: BrowserCaptureResult = {
    fullPageMobile: '',
    viewport1Mobile: '',
    sectionsMobile: [],
    fullPageDesktop: '',
  };

  try {
    // ── 1. 모바일 뷰포트 (iPhone 14 Pro: 390 × 844) ──
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      deviceScaleFactor: 2,
    });
    const mobilePage: Page = await mobileContext.newPage();
    
    console.log(`[Playwright] Navigating to mobile IM viewer: ${targetUrl}`);
    await mobilePage.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await mobilePage.waitForTimeout(1000);

    // 전체 페이지 스크롤 캡처
    result.fullPageMobile = join(outputDir, `${caseId}_im_mobile_full.png`);
    await mobilePage.screenshot({ path: result.fullPageMobile, fullPage: true });

    // 뷰포트 첫 화면 (Hero + Header)
    result.viewport1Mobile = join(outputDir, `${caseId}_im_mobile_viewport1.png`);
    await mobilePage.screenshot({ path: result.viewport1Mobile });

    // Hero Card 캡처
    const heroCard = mobilePage.locator('[data-testid="hero-card"], div.border-amber-500\\/30, .bg-\\[\\#1a1d24\\], div.rounded-2xl.border').first();
    if (await heroCard.isVisible()) {
      result.heroCardMobile = join(outputDir, `${caseId}_im_mobile_hero_card.png`);
      await heroCard.screenshot({ path: result.heroCardMobile });
    }

    // Photo Gallery 캡처
    const gallery = mobilePage.locator('section, div').filter({ hasText: '건물 주요 사진' }).first();
    if (await gallery.isVisible()) {
      result.galleryMobile = join(outputDir, `${caseId}_im_mobile_gallery.png`);
      await gallery.screenshot({ path: result.galleryMobile });
    }

    // 섹션 아코디언들 (1~7) 캡처
    const sectionCards = mobilePage.locator('div.border.border-neutral-800, div.rounded-2xl');
    const count = await sectionCards.count();
    for (let i = 0; i < Math.min(count, 10); i++) {
      const card = sectionCards.nth(i);
      if (await card.isVisible()) {
        const text = (await card.innerText()).slice(0, 30).replace(/\n/g, ' ');
        const sectionPath = join(outputDir, `${caseId}_im_mobile_section_${i + 1}.png`);
        await card.screenshot({ path: sectionPath });
        result.sectionsMobile.push({
          sectionIndex: i + 1,
          title: text,
          imagePath: sectionPath,
        });
      }
    }

    // Floating Action Bar 캡처
    const actionBar = mobilePage.locator('div.fixed.bottom-0').first();
    if (await actionBar.isVisible()) {
      result.floatingActionBarMobile = join(outputDir, `${caseId}_im_mobile_action_bar.png`);
      await actionBar.screenshot({ path: result.floatingActionBarMobile });
    }

    await mobileContext.close();

    // ── 2. 데스크톱 뷰포트 (1440 × 900) ──
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const desktopPage: Page = await desktopContext.newPage();
    await desktopPage.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await desktopPage.waitForTimeout(500);

    result.fullPageDesktop = join(outputDir, `${caseId}_im_desktop_full.png`);
    await desktopPage.screenshot({ path: result.fullPageDesktop, fullPage: true });

    await desktopContext.close();
  } finally {
    await browser.close();
  }

  return result;
}
