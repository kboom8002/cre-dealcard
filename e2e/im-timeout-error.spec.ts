import { test, expect } from '@playwright/test';

test.describe('Scenario B: Timeout & Error Handling', () => {
  const PAGE_URL = '/broker/deal-card/new';

  test('Test 1: IM Generation Timeout', async ({ page }) => {
    await page.clock.install({ time: new Date() });

    // Mock API to hang indefinitely
    await page.route('**/api/broker/deal-card/from-memo', async () => {
      // Intentionally do not fulfill the route so it hangs
    });

    await page.goto(PAGE_URL);

    // Type memo
    await page.fill('#broker-memo-input', '테스트용 메모 115억 근생');

    // Trigger generation
    await page.click('#cta-generate-deal-card');

    // Fast forward 181 seconds to trigger the 180s client timeout
    await page.clock.fastForward(181000);

    // Verify error state or timeout message
    await expect(page.getByText(/생성 시간이 초과되었습니다/i)).toBeVisible();
    
    // The UI should show the cancel button if still loading, but after timeout it sets isLoading to false
    // So the submit button should be visible again
    await expect(page.locator('#cta-generate-deal-card')).toBeVisible();
  });

  test('Test 2: API Error Response', async ({ page }) => {
    await page.route('**/api/broker/deal-card/from-memo', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Internal Server Error' })
      });
    });

    await page.goto(PAGE_URL);

    // Type memo
    await page.fill('#broker-memo-input', '테스트용 메모 115억 근생');

    // Trigger generation
    await page.click('#cta-generate-deal-card');

    // Verify error message
    await expect(page.getByText(/Internal Server Error/i)).toBeVisible();
  });

  test('Test 3: Network Failure (502 Gateway Error)', async ({ page }) => {
    await page.route('**/api/broker/deal-card/from-memo', async (route) => {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: '서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.' })
      });
    });

    await page.goto(PAGE_URL);

    // Type memo
    await page.fill('#broker-memo-input', '테스트용 메모 115억 근생');

    // Trigger generation
    await page.click('#cta-generate-deal-card');

    // Verify graceful error handling - should show the error from the 502 response
    await expect(page.getByText(/서버 오류가 발생했습니다/i).or(page.getByText(/서버 연결에 실패/i))).toBeVisible();
  });
});
