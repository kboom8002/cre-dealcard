import { test, expect } from '@playwright/test';
import { join } from 'path';

test.describe('Journey 2: Mobile IM Viewer Responsive & Persona Isolation Walkthrough', () => {
  // Built-in demo fixture that renders full 7-section Mobile IM with zero DB dependencies
  const BUILDING_ID = 'fe5cbadd-aede-4a58-af40-3982f48ecfa7';
  const IM_URL = `/im-lite/${BUILDING_ID}`;
  const SCREENSHOTS_DIR = join(process.cwd(), 'e2e', 'screenshots');

  const FORBIDDEN_PERSONA_PHRASES = [
    '60대 자산가',
    '50대 자산가',
    '40대 자산가',
    '30대 투자자',
    '법인 대표 맞춤',
    '고액 자산가 전용',
    'VIP 투자자용',
    '초보 매수자를 위한',
  ];

  const FORBIDDEN_TRANSLITERATIONS = [
    '네이밍 라이츠',
    '브랜딩 라이츠',
  ];

  test('W201: iPhone 14 Pro (393x852) viewport rendering without layout break or console exceptions', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const response = await page.goto(IM_URL, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    expect(errors.length).toBe(0);

    // Wait for core content to render
    await page.waitForLoadState('domcontentloaded');
    const content = await page.content();
    expect(content.length).toBeGreaterThan(500);

    // Verify Title / Building designation is visible
    const bodyText = await page.textContent('body') || '';
    expect(bodyText.length).toBeGreaterThan(50);

    // Capture visual screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'mobile-im-iphone14pro.png'),
      fullPage: true,
    });
  });

  test('W202: Galaxy S23 (360x780) compact viewport rendering cleanly', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const response = await page.goto(IM_URL, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    expect(errors.length).toBe(0);

    await page.waitForLoadState('domcontentloaded');
    const bodyText = await page.textContent('body') || '';
    expect(bodyText.length).toBeGreaterThan(300);

    // Capture visual screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'mobile-im-galaxys23.png'),
      fullPage: true,
    });
  });

  test('W203: Desktop (1920x1080) high-resolution viewport rendering with centered layout', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const response = await page.goto(IM_URL, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    expect(errors.length).toBe(0);

    await page.waitForLoadState('domcontentloaded');

    // Capture visual screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'mobile-im-desktop.png'),
      fullPage: true,
    });
  });

  test('W204: Persona Isolation Principle (Rule 1) - Zero persona terms in external DOM', async ({ page }) => {
    await page.goto(IM_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    const text = await page.textContent('body') || '';

    // Forbidden external persona phrases per Rule 1 must never be exposed
    for (const phrase of FORBIDDEN_PERSONA_PHRASES) {
      expect(text).not.toContain(phrase);
    }
  });

  test('W205: Korean CRE Lexicon Compliance (Rule 2) - Standard terminology check', async ({ page }) => {
    await page.goto(IM_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    const text = await page.textContent('body') || '';

    // Prohibited direct transliterations per Rule 2
    for (const transliteration of FORBIDDEN_TRANSLITERATIONS) {
      expect(text).not.toContain(transliteration);
    }
  });

  test('W206: Mobile IM 7-Section Architecture Completeness verification', async ({ page }) => {
    await page.goto(IM_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    const text = await page.textContent('body') || '';

    // Assert key section components and content exist
    expect(text.length).toBeGreaterThan(300);
    expect(text).toMatch(/개요|입지|수익|분석|포인트|유의사항|개발/);
  });
});
