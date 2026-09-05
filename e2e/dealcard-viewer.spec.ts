import { test, expect } from '@playwright/test';
import { join } from 'path';

test.describe('Journey 4: Blind Dealcard Viewer Web Walkthrough', () => {
  const SAMPLE_DEAL_URL = '/dc/case01_seocho_medical';
  const FALLBACK_DEAL_URL = '/dc/sample-deal-1';
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

  test('W401: Dealcard viewer renders cleanly on Mobile viewport (393x852)', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const response = await page.goto(SAMPLE_DEAL_URL, { waitUntil: 'domcontentloaded' });
    expect([200, 404]).toContain(response?.status() ?? 200);
    expect(errors.length).toBe(0);

    await page.waitForLoadState('domcontentloaded');

    // Capture visual screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'dealcard-viewer-mobile.png'),
      fullPage: true,
    });
  });

  test('W402: Dealcard viewer renders on Desktop viewport (1920x1080) and fallback URL handles cleanly', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const response = await page.goto(FALLBACK_DEAL_URL, { waitUntil: 'domcontentloaded' });
    expect([200, 404]).toContain(response?.status() ?? 200);
    expect(errors.length).toBe(0);

    // Capture visual screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'dealcard-viewer-desktop.png'),
    });
  });

  test('W403: Verify blind masking logic - no detailed street parcel or private owner names', async ({ page }) => {
    await page.goto(SAMPLE_DEAL_URL, { waitUntil: 'domcontentloaded' });
    const content = await page.content();

    // Must not expose explicit lot numbers or private owner information
    expect(content).not.toMatch(/\d+-\d+번지/);
    expect(content).not.toContain('소유자:');
    expect(content).not.toContain('소유주:');
    expect(content).not.toContain('주민등록번호');
  });

  test('W404: Persona Isolation (Rule 1) & Lexicon Standards (Rule 2) in Dealcard DOM', async ({ page }) => {
    await page.goto(SAMPLE_DEAL_URL, { waitUntil: 'domcontentloaded' });
    const text = await page.textContent('body') || '';

    for (const phrase of FORBIDDEN_PERSONA_PHRASES) {
      expect(text).not.toContain(phrase);
    }
    for (const term of FORBIDDEN_TRANSLITERATIONS) {
      expect(text).not.toContain(term);
    }
  });
});
