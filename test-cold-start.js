const { chromium, request } = require('playwright');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const TARGET_URL = 'http://localhost:3000';
const PROJECT_ID = 'basic-d2acdd2c-d686-435a-9cba-606eafd0860b';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Logging in to localhost...');
  await page.goto(`${TARGET_URL}/login`);
  await page.fill('input[type="email"], #email', process.env.E2E_TEST_EMAIL);
  await page.fill('input[type="password"], #password', process.env.E2E_TEST_PASSWORD);
  await page.click('button:has-text("로그인")');
  await page.waitForURL('**/broker**', { timeout: 30000 });

  const apiContext = await request.newContext({
    baseURL: TARGET_URL,
    storageState: await context.storageState()
  });

  console.log(`\n--- TC-ST12a: Cold Start PPTX 다운로드 (GET ${PROJECT_ID}) ---`);
  const downloadRes = await apiContext.get(`/api/broker/basic-im-studio/${PROJECT_ID}/download`, { timeout: 60000 });
  console.log(`Status: ${downloadRes.status()}`);
  if (downloadRes.ok()) {
    console.log('Success! Recovered from DB.');
  } else {
    console.error(await downloadRes.text());
  }

  await browser.close();
})();
