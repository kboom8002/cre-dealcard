/**
 * P0-02 (S2-02) — proxy 소셜봇 예외 축소 E2E (비인증, request 호출만)
 *
 * 실행은 조율자: `npx playwright test e2e/magazine-proxy-bot.spec.ts --project=default`
 * 주의: playwright.config 의 extraHTTPHeaders 에 `x-playwright-test: true` 가 있어 비프로덕션에서는 proxy 의
 *       E2E 예외가 로그인 보호를 우회한다. 이 스펙은 요청마다 해당 헤더를 'false' 로 덮어써 예외를 비활성화한다.
 *       (proxy 는 값이 정확히 'true' 일 때만 예외 + UA 에 'playwright' 가 없어야 함 → UA 를 명시)
 * `curl -A facebookexternalhit/1.1 .../broker/dashboard` 상당.
 */
import { test, expect } from '@playwright/test';

const FB_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const headers = { 'user-agent': FB_UA, 'x-playwright-test': 'false' };
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

function isLoginRedirect(status: number, location: string | undefined): boolean {
  return [301, 302, 303, 307, 308].includes(status) && !!location && location.includes('/login');
}

test.describe('proxy 소셜봇 예외 축소 (P0-02)', () => {
  for (const p of [
    '/broker/dashboard',
    '/broker',
    '/broker/magazine-editor',
    '/broker/deal-card/abc/edit',
    '/broker/deal-card/new',
    '/broker/clients/new',
  ]) {
    test(`UA 위조로 ${p} → 로그인 리다이렉트`, async ({ request }) => {
      const res = await request.get(p, { headers, maxRedirects: 0 });
      expect(isLoginRedirect(res.status(), res.headers()['location']), `status=${res.status()}`).toBe(true);
      expect(res.headers()['location']).toContain(`redirectTo=${encodeURIComponent(p)}`);
    });
  }

  test('봇 UA 로 /admin/* → 로그인 리다이렉트', async ({ request }) => {
    const res = await request.get('/admin/users', { headers, maxRedirects: 0 });
    expect(isLoginRedirect(res.status(), res.headers()['location'])).toBe(true);
  });

  for (const p of [`/broker/deal-card/${NIL_UUID}`, `/broker/leasing/${NIL_UUID}`]) {
    test(`허용 경로 ${p} → 로그인 리다이렉트가 아님(OG 크롤 허용)`, async ({ request }) => {
      const res = await request.get(p, { headers, maxRedirects: 0 });
      // 존재하지 않는 id 이므로 404(notFound)가 정상. 핵심은 /login 으로 보내지 않는 것.
      expect(isLoginRedirect(res.status(), res.headers()['location'])).toBe(false);
      expect([200, 404]).toContain(res.status());
    });
  }

  test('일반 브라우저 UA 로 허용 경로 접근 → 로그인 리다이렉트(봇 예외 비대상)', async ({ request }) => {
    const res = await request.get(`/broker/deal-card/${NIL_UUID}`, {
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36', 'x-playwright-test': 'false' },
      maxRedirects: 0,
    });
    expect(isLoginRedirect(res.status(), res.headers()['location'])).toBe(true);
  });

  // 발행된 딜카드 id 를 알려주면(E2E_PUBLISHED_DEAL_ID) og:title 존재까지 확인.
  // KNOWN GAP(보고서 참조): 현재 page.tsx 는 봇에게도 본문 전체를 렌더 → 본문 미포함 단언은 페이지 수정(별도 Task) 후 추가.
  test('발행 딜카드 + 봇 UA → 200 + og:title', async ({ request }) => {
    const id = process.env.E2E_PUBLISHED_DEAL_ID;
    test.skip(!id, 'E2E_PUBLISHED_DEAL_ID 미설정');
    const res = await request.get(`/broker/deal-card/${id}`, { headers, maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(await res.text()).toMatch(/<meta[^>]+property="og:title"/);
  });
});
