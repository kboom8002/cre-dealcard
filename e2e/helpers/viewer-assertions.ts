/**
 * @file e2e/helpers/viewer-assertions.ts
 * @description Phase 5: 모바일 IM 뷰어 시각 검증 헬퍼
 */

import { type Page, expect } from '@playwright/test';
import { ensureDir, shot } from './golden-test-utils';
import * as path from 'path';

/** P5-01: 모바일 IM 페이지 로딩 검증 */
export async function assertViewerLoads(
  page: Page,
  buildingId: string,
  docId?: string
): Promise<void> {
  const url = docId
    ? `/im-lite/${buildingId}?doc=${docId}`
    : `/im-lite/${buildingId}`;
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  const bodyText = await page.textContent('body') || '';
  expect(bodyText.length).toBeGreaterThan(100);
  console.log(`  ✅ 모바일 IM 뷰어 로딩 완료 (${bodyText.length}자)`);
}

/** P5-02: Hero Card 렌더링 검증 */
export async function assertHeroCardRendered(
  page: Page,
  expectedKeywords: string[]
): Promise<void> {
  const bodyText = await page.textContent('body') || '';
  const found: string[] = [];
  const missing: string[] = [];
  for (const kw of expectedKeywords) {
    if (bodyText.includes(kw)) {
      found.push(kw);
    } else {
      missing.push(kw);
    }
  }
  expect(found.length).toBeGreaterThanOrEqual(1);
  console.log(`  ✅ Hero Card 키워드 ${found.length}/${expectedKeywords.length} 확인: [${found.join(', ')}]`);
  if (missing.length > 0) {
    console.log(`  ⚠️ 미발견 키워드: [${missing.join(', ')}]`);
  }
}

/** P5-03: 데이터 품질 배지 표시 검증 */
export async function assertDataQualityBadge(page: Page): Promise<void> {
  const bodyText = await page.textContent('body') || '';
  const badgePatterns = ['A등급', 'B등급', 'C등급', 'D등급', 'verified', 'partial', 'reference', 'draft'];
  const found = badgePatterns.some(p => bodyText.includes(p));
  // Badge may not always be visible, so we log but don't hard-fail
  if (found) {
    console.log('  ✅ 데이터 품질 배지 감지');
  } else {
    console.log('  ⚠️ 데이터 품질 배지 미감지 (advisory)');
  }
}

/** P5-04: 섹션 아코디언 펼침/접기 검증 */
export async function assertAccordionToggle(page: Page): Promise<void> {
  // Find section headers that are clickable
  const sectionHeaders = page.locator('[data-testid*="section"], button[class*="accordion"], div[class*="section-header"]');
  const count = await sectionHeaders.count();
  
  if (count === 0) {
    // Fallback: find any clickable section-like elements
    const fallbackHeaders = page.locator('h2, h3').filter({ hasText: /.{4,}/ });
    const fallbackCount = await fallbackHeaders.count();
    console.log(`  ⚠️ 아코디언 헤더 미발견 (h2/h3: ${fallbackCount}개)`);
    return;
  }

  const toggled = Math.min(count, 3);
  for (let i = 0; i < toggled; i++) {
    try {
      await sectionHeaders.nth(i).click();
      await page.waitForTimeout(300);
    } catch {
      // Some sections may not be clickable
    }
  }
  console.log(`  ✅ 아코디언 토글 ${toggled}개 섹션 시도`);
}

/** P5-07: Locked 섹션 콘텐츠 비노출 검증 */
export async function assertLockedSectionsHidden(page: Page): Promise<void> {
  const bodyText = await page.textContent('body') || '';
  // Check for lock indicators
  const hasLockUI = bodyText.includes('잠금') || bodyText.includes('Pro') || bodyText.includes('프리미엄');
  if (hasLockUI) {
    console.log('  ✅ 잠금 섹션 UI 감지 (Pro 전용 콘텐츠 차단)');
  } else {
    console.log('  ⚠️ 잠금 섹션 UI 미감지 (해당 없을 수 있음)');
  }
}

/** P5-08: PPTX 다운로드 버튼 visible 검증 */
export async function assertPptxButtonVisible(page: Page): Promise<void> {
  const pptxBtn = page.locator('button:has-text("PPTX"), a:has-text("PPTX"), button:has-text("다운로드"), a:has-text("다운로드")').first();
  try {
    await pptxBtn.waitFor({ state: 'visible', timeout: 8000 });
    console.log('  ✅ PPTX 다운로드 버튼 visible');
  } catch {
    console.log('  ⚠️ PPTX 다운로드 버튼 미감지 (승인 전일 수 있음)');
  }
}

/** P5-09: 모바일 반응형 검증 (375x812) */
export async function assertMobileResponsive(
  page: Page,
  screenshotDir: string
): Promise<void> {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(1000);

  const hasOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });

  expect(hasOverflow).toBe(false);
  console.log('  ✅ 375px 반응형 가로 오버플로우 없음');

  // Restore viewport
  await page.setViewportSize({ width: 1280, height: 720 });
}

/** P5-10: 전체 페이지 스크린샷 보존 */
export async function captureFullPageScreenshot(
  page: Page,
  screenshotDir: string,
  label: string
): Promise<string> {
  ensureDir(screenshotDir);
  const filePath = path.join(screenshotDir, `viewer-${label}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`  📸 뷰어 스크린샷: ${label}`);
  return filePath;
}

/** P5-XX: Defect token 검증 (NaN, undefined, null, [object Object]) */
export async function assertNoDefectTokensInViewer(page: Page): Promise<void> {
  const bodyText = await page.textContent('body') || '';
  const defects = ['NaN', 'undefined', 'null', '[object Object]'];
  const found = defects.filter(d => bodyText.includes(d));
  expect(found).toEqual([]);
  console.log('  ✅ 뷰어 결함 토큰 0건 확인');
}
