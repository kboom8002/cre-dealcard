const { chromium } = require('playwright');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  
  await page.goto('https://credeal.net/login');
  await page.fill('input[type="email"], #email', process.env.E2E_TEST_EMAIL);
  await page.fill('input[type="password"], #password', process.env.E2E_TEST_PASSWORD);
  await page.click('button:has-text("로그인")');
  await page.waitForURL('**/broker**');
  await page.goto('https://credeal.net/broker');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(__dirname, 'dashboard-debug.png') });
  console.log('Saved dashboard-debug.png');
  await browser.close();
})();
