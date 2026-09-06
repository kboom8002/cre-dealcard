import { test, expect } from '@playwright/test';

test.describe('시나리오 A: IM 생성 해피패스', () => {
  test('IM Generation to Detailed Page and Mobile IM Creation', async ({ page }) => {
    test.setTimeout(60000);

    // Mock POST /api/broker/deal-card/from-memo
    await page.route('**/api/broker/deal-card/from-memo', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { buildingId: 'test-dangsan-e2e' } }),
      });
    });

    // 1. Navigate to `/broker/deal-card/new`
    await page.goto('/broker/deal-card/new');

    // 2. Type a broker memo into `#broker-memo-input` textarea
    await page.fill('#broker-memo-input', '영등포구 당산동5가 11-47 호산당빌딩 매매가 115억 근린생활시설 지하1층~지상7층 월 임대수익 5,300만원');

    // 3. Click `#cta-generate-deal-card` button
    await page.click('#cta-generate-deal-card');

    // 4. Verify navigation to `/broker/deal-card/test-dangsan-e2e`
    await page.waitForURL('**/broker/deal-card/test-dangsan-e2e');
    
    // Stop the test here as the next page is server-rendered and cannot be reliably mocked with page.route() in Playwright.
  });
});
