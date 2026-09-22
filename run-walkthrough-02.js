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

    console.log('Logging in...');
    await page.fill('input[type="email"], #email', process.env.E2E_TEST_EMAIL);
    await page.fill('input[type="password"], #password', process.env.E2E_TEST_PASSWORD);
    await page.click('button:has-text("로그인")');

    await page.waitForURL('**/broker**', { timeout: 30000 });
    console.log('Logged in. Navigating to /new...');

    await page.goto(`${TARGET_URL}/broker/deal-card/new`);
    await page.waitForLoadState('networkidle');

    const uniqueId = Date.now();
    const memoText = `매물 접수 E2E-${uniqueId}
당산동5가 11-47
매매가 115억, 연면적 345평
1층 약국 월세 350만, 2층 내과 월세 280만
보증금 총 2.9억, 월세 총 1,946만
만실`;
    
    const memoLocator = page.locator('#broker-memo-input');
    await memoLocator.waitFor({ state: 'visible', timeout: 10000 });
    await memoLocator.fill(memoText);

    const submitBtn = page.locator('#cta-generate-deal-card');
    await submitBtn.click();
    console.log('Memo submitted. Waiting for possible duplicate dialog...');

    // Try to catch the duplicate dialog
    try {
        const forceNewBtn = page.locator('button:has-text("다른 물건이거나 새로운 버전으로 만들기"), button:has-text("새로 만들기"), button:has-text("계속 만들기"), button:has-text("새로운 물건")').first();
        await forceNewBtn.waitFor({ state: 'visible', timeout: 10000 });
        console.log('Duplicate dialog caught. Forcing new...');
        await forceNewBtn.click();
    } catch (e) {
        console.log('No duplicate dialog or timed out. Proceeding...');
    }

    // Wait for the DealCard page to load
    await page.waitForURL('**/broker/deal-card/*', { timeout: 60000 });
    // Wait until it's not the /new page
    await page.waitForFunction(() => !window.location.pathname.endsWith('/new'), { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); 

    console.log('DealCard opened.');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '01-dealcard-ready.png') });

    // Step 2: Open Bottom Sheet
    console.log('Opening Bottom Sheet...');
    
    let basicImBtn = page.locator('#cta-mobile-im-basic');
    if (!(await basicImBtn.isVisible())) {
      basicImBtn = page.locator('#cta-mobile-im-pro');
    }
    if (!(await basicImBtn.isVisible())) {
       basicImBtn = page.locator('button').filter({ hasText: 'IM' }).first();
    }
    
    await basicImBtn.click();
    await page.waitForTimeout(2000); // Wait for drawer animation
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '02-bottomsheet-opened.png') });

    console.log('Interacting with Bottom Sheet form...');
    
    const postureSelect = page.locator('button[role="combobox"]').first();
    if (await postureSelect.isVisible()) {
       await postureSelect.click();
       await page.locator('text=수익형').first().click();
    }

    const fullRoomBtn = page.locator('button:has-text("만실")').first();
    if (await fullRoomBtn.isVisible()) {
      await fullRoomBtn.click();
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '03-bottomsheet-filled.png') });

    console.log('Generating IM...');
    const generateImBtn = page.locator('button:has-text("IM 생성")').last();
    await generateImBtn.scrollIntoViewIfNeeded();
    await generateImBtn.click();

    await page.waitForURL('**/im-lite/*', { timeout: 60000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    console.log('Mobile IM rendered.');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '04-mobile-im-viewer.png') });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '05-mobile-im-full.png'), fullPage: true });

    console.log('Success! Saved screenshots.');
  } catch (error) {
    console.error('Test failed:', error);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'error-screenshot-02.png') }).catch(() => {});
  } finally {
    await browser.close();
  }
})();
