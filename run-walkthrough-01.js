const { chromium } = require('playwright');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const ARTIFACT_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\26f684f7-f120-455a-96d6-662c12789f8d';
const TARGET_URL = 'https://credeal.net';

(async () => {
  console.log('Starting Playwright...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR'
  });
  const page = await context.newPage();

  try {
    console.log('Navigating to login...');
    await page.goto(`${TARGET_URL}/login`);
    await page.waitForLoadState('networkidle');

    await page.screenshot({ path: path.join(ARTIFACT_DIR, '01-login-screen.png') });

    console.log('Logging in...');
    await page.fill('input[type="email"], #email', process.env.E2E_TEST_EMAIL);
    await page.fill('input[type="password"], #password', process.env.E2E_TEST_PASSWORD);
    await page.click('button:has-text("로그인")');

    await page.waitForURL('**/broker**', { timeout: 30000 });
    console.log('Logged in. Navigating to /broker/deal-card/new...');
    
    await page.goto(`${TARGET_URL}/broker/deal-card/new`);
    await page.waitForLoadState('networkidle');

    await page.screenshot({ path: path.join(ARTIFACT_DIR, '02-memo-empty.png') });
    
    // Fill TC-M01
    const memoText = `매물 접수
당산동5가 11-47 근생빌딩
매매가 115억, 연면적 345평
1층 약국 월세 350만, 2층 내과 월세 280만
3층 헬스장 월세 250만, 4~5층 사무실 월세 각 200만
보증금 총 2.9억, 월세 총 1,946만
주차 8대, 엘베 1대, 2002년 준공
만실`;
    
    const memoLocator = page.locator('#broker-memo-input');
    await memoLocator.waitFor({ state: 'visible', timeout: 10000 });
    await memoLocator.fill(memoText);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, '03-memo-filled.png') });

    // Click Submit
    const submitBtn = page.locator('#cta-generate-deal-card');
    await submitBtn.click();
    console.log('Memo submitted, waiting for AI routing and creation...');

    // Wait for DealCard page to load
    await page.waitForURL('**/broker/deal-card/*', { timeout: 60000 });
    // Make sure we aren't still on /new
    await page.waitForFunction(() => !window.location.pathname.endsWith('/new'));

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Give it time to load data

    console.log('DealCard generated.');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '04-dealcard-generated.png') });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '05-dealcard-full.png'), fullPage: true });

    // Try to click basic IM button to show bottom sheet
    console.log('Trying to open bottom sheet...');
    const basicImBtn = page.getByRole('button', { name: /기본 IM/ }).first();
    if (await basicImBtn.isVisible()) {
      await basicImBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, '06-bottomsheet-opened.png') });
    }

    console.log('Success! Saved screenshots.');
  } catch (error) {
    console.error('Test failed:', error);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'error-screenshot.png') }).catch(() => {});
  } finally {
    await browser.close();
  }
})();
