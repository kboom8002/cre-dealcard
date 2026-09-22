const { chromium } = require('playwright');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('https://credeal.net/login');
  await page.fill('input[type="email"], #email', process.env.E2E_TEST_EMAIL);
  await page.fill('input[type="password"], #password', process.env.E2E_TEST_PASSWORD);
  await page.click('button:has-text("로그인")');
  await page.waitForURL('**/broker**');
  
  await page.goto('https://credeal.net/broker/buildings');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  
  const ids = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="/deal-card/"]'))
      .map(a => a.href)
      .filter(h => !h.endsWith('/new'))
      .map(h => {
         const m = h.match(/\/deal-card\/([a-zA-Z0-9-]+)/);
         return m ? m[1] : null;
      })
      .filter(Boolean);
  });
  
  console.log('Found Building IDs:', Array.from(new Set(ids)));
  await browser.close();
})();
