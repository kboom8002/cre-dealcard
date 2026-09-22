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
    console.log('Logged in. Navigating to Dashboard...');
    
    await page.goto(`${TARGET_URL}/broker`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('Finding an existing DealCard...');
    // Safely find a deal card
    const firstDealLink = page.locator('a[href^="/broker/deal-card/"]:not([href$="/new"])').first();
    
    if (await firstDealLink.isVisible()) {
        await firstDealLink.click();
    } else {
        throw new Error('No existing deal cards found on dashboard');
    }

    await page.waitForURL('**/broker/deal-card/*', { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); 

    console.log('DealCard opened.');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '01-dealcard-ready.png') });

    console.log('Opening Bottom Sheet...');
    
    // Find the button using the NEW data-testid
    const basicImBtn = page.getByTestId('generate-basic-im');
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
    // Use the NEW data-testid for the bottom sheet generate button
    const generateImBtn = page.getByTestId('bottom-sheet-generate-btn');
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
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'error-screenshot-02-fixed.png') }).catch(() => {});
  } finally {
    await browser.close();
  }
})();
