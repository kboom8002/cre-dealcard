import { test, expect } from '@playwright/test';

const SHOWCASE_DC_ID = '5c0ca5e0-0001-4000-8000-000000000001';
const SHOWCASE_IM_ID = '5c0ca5e0-0002-4000-8000-000000000001';
const QA_TESTER_KEY = process.env.QA_TESTER_ACCESS_KEY || 'test-qa-tester-key';
const KAKAO_INAPP_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.0';

test.describe('WP 5-B: Public, QA, Share-Token, Dormant & Kakao WebView Gates', () => {
  test('Dormant public routes return 404 with noindex', async ({ request }) => {
    for (const route of ['/agora', '/services', '/building-radar']) {
      const res = await request.get(route, { maxRedirects: 0 });
      expect(res.status(), `${route} must return 404`).toBe(404);
      const robots = (res.headers()['x-robots-tag'] || '').toLowerCase();
      expect(robots).toContain('noindex');
    }
  });

  test('Internal QA portals fail closed (404) without key and allow (200 + noindex) with valid key', async ({
    request,
  }) => {
    for (const route of [
      '/qa-signoff',
      '/testguide',
      '/qa-showcase',
      '/qa-full-loop',
      '/qa-full-loop-v2',
      '/newsletter-inbox-test',
      '/dealcard-im-test',
    ]) {
      const denied = await request.get(route, { maxRedirects: 0 });
      expect(denied.status(), `${route} without qaKey must return 404`).toBe(404);
      expect((denied.headers()['x-robots-tag'] || '').toLowerCase()).toContain('noindex');
    }

    const allowed = await request.get(`/qa-signoff?qaKey=${encodeURIComponent(QA_TESTER_KEY)}`, {
      maxRedirects: 0,
    });
    expect(allowed.status()).toBe(200);
    expect((allowed.headers()['x-robots-tag'] || '').toLowerCase()).toContain('noindex');

    const allowedHoldoutV2 = await request.get(
      `/qa-full-loop-v2?qaKey=${encodeURIComponent(QA_TESTER_KEY)}`,
      { maxRedirects: 0 }
    );
    expect(allowedHoldoutV2.status()).toBe(200);
    expect((allowedHoldoutV2.headers()['x-robots-tag'] || '').toLowerCase()).toContain('noindex');
  });

  test('Public IM routes fail closed without token or with forged token', async ({
    request,
    page,
  }) => {
    const missingTokenRes = await request.get(`/api/public/im-lite/${SHOWCASE_IM_ID}`);
    expect(missingTokenRes.status()).toBe(403);
    const missingBody = await missingTokenRes.json();
    expect(missingBody.code || missingBody.error?.code).toBe('SHARE_TOKEN_REQUIRED');

    const invalidTokenRes = await request.get(
      `/api/public/im-lite/${SHOWCASE_IM_ID}?token=slk.invalid.tampered`
    );
    expect(invalidTokenRes.status()).toBe(403);
    const invalidBody = await invalidTokenRes.json();
    expect(['INVALID_TOKEN', 'LINK_REVOKED']).toContain(invalidBody.error?.code);

    await page.goto(`/im-lite/${SHOWCASE_IM_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('token-required-im-screen')).toBeVisible({ timeout: 15000 });
  });

  test('KakaoTalk in-app browser UA renders <InAppBrowserBanner /> on /dc/[id]', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: KAKAO_INAPP_UA,
    });
    const page = await context.newPage();
    try {
      await page.goto(`/dc/${SHOWCASE_DC_ID}`, { waitUntil: 'domcontentloaded' });
      const banner = page.getByTestId('inapp-webview-banner');
      await expect(banner).toBeVisible({ timeout: 15000 });
      const openBtn = page.getByTestId('open-external-browser-btn');
      await expect(openBtn).toContainText('외부 브라우저');
      const box = await openBtn.boundingBox();
      expect(box && box.height >= 44).toBe(true);
    } finally {
      await context.close();
    }
  });

  test('Unauthenticated broker workspace & studio routes redirect to /login', async ({
    request,
  }) => {
    for (const path of ['/broker/w/dealcards', '/broker/w/newsletter', '/broker/magazine-editor']) {
      const res = await request.get(path, {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36',
          'x-playwright-test': 'false',
        },
        maxRedirects: 0,
      });
      expect([301, 302, 303, 307, 308]).toContain(res.status());
      expect(res.headers()['location'] || '').toContain('/login');
    }
  });
});
