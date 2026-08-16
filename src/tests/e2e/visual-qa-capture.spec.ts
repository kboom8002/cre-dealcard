import { test, expect } from '@playwright/test';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const CAPTURES_DIR = join(process.cwd(), 'docs', 'test', 'stress', 'e2e-outputs', 'visual-qa', 'captures');
if (!existsSync(CAPTURES_DIR)) mkdirSync(CAPTURES_DIR, { recursive: true });

test.describe('Visual QA: Case 01 서초 메디컬 빌딩 화면 캡처', () => {
  test('IM-01 & IM-03~10: 모바일 IM 뷰어 (iPhone 14 Pro 390x844)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:3000/im-lite/case01_seocho_medical', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // 전체 페이지 스크롤 캡처
    await page.screenshot({
      path: join(CAPTURES_DIR, 'im_mobile_full.png'),
      fullPage: true,
    });

    // 뷰포트 첫 화면 (Hero + Summary)
    await page.screenshot({
      path: join(CAPTURES_DIR, 'im_mobile_viewport1.png'),
    });

    // Hero Card
    const heroCard = page.locator('[data-testid="hero-card"], div.border-amber-500\\/30, .bg-\\[\\#1a1d24\\]').first();
    if (await heroCard.isVisible()) {
      await heroCard.screenshot({ path: join(CAPTURES_DIR, 'im_mobile_hero_card.png') });
    }

    // Photo Gallery
    const gallery = page.locator('section, div').filter({ hasText: '건물 주요 사진' }).first();
    if (await gallery.isVisible()) {
      await gallery.screenshot({ path: join(CAPTURES_DIR, 'im_mobile_gallery.png') });
    }
  });

  test('IM-02: 모바일 IM 뷰어 데스크톱 뷰 (1440x900)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:3000/im-lite/case01_seocho_medical', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: join(CAPTURES_DIR, 'im_desktop_full.png'),
      fullPage: true,
    });
  });

  test('DC-01 & DC-02: 딜카드 뷰어 (모바일 & 데스크톱)', async ({ page }) => {
    // 모바일 딜카드
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:3000/im-lite/case01_seocho_medical', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    await page.screenshot({
      path: join(CAPTURES_DIR, 'dc_mobile_overview.png'),
    });
  });
});
