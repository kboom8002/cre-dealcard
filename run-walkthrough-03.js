const { chromium, request } = require('playwright');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

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
    
    await page.goto(`${TARGET_URL}/broker/buildings`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('Finding an existing DealCard to get a Building ID...');
    const firstDealLink = page.locator('a[href*="/deal-card/"]:not([href$="/new"])').first();
    
    if (!(await firstDealLink.isVisible())) {
        throw new Error('No existing deal cards found on /broker/buildings. Cannot proceed with PPTX test.');
    }

    const href = await firstDealLink.getAttribute('href');
    // Extract ID from /deal-card/[id]
    const match = href.match(/\/deal-card\/([a-zA-Z0-9-]+)/);
    if (!match) throw new Error(`Could not parse ID from href: ${href}`);
    
    const buildingId = match[1];
    console.log(`Found buildingId: ${buildingId}`);

    // Create an API context inheriting the browser cookies
    const apiContext = await request.newContext({
      baseURL: TARGET_URL,
      storageState: await context.storageState()
    });

    console.log('--- TC-PP01: Testing Basic PPTX Generation ---');
    const pptxUrl = `/api/public/im-lite/${buildingId}/pptx`;
    console.log(`Requesting ${pptxUrl}...`);
    
    const pptxRes = await apiContext.get(pptxUrl, { timeout: 60000 });
    
    console.log(`Status: ${pptxRes.status()}`);
    const headers = pptxRes.headers();
    
    if (pptxRes.ok()) {
      console.log('Headers:', {
        'content-type': headers['content-type'],
        'content-disposition': headers['content-disposition'],
        'x-slide-count': headers['x-slide-count'],
        'x-file-size': headers['x-file-size']
      });

      const body = await pptxRes.body();
      const savePath = path.join(ARTIFACT_DIR, 'test_download.pptx');
      fs.writeFileSync(savePath, body);
      console.log(`Saved PPTX to ${savePath} (${body.length} bytes)`);
      
      if (body.length < 1000) {
        console.warn('Warning: PPTX file size seems unusually small.');
      }
    } else {
      console.error(`Failed to generate PPTX. Response:`, await pptxRes.text());
    }

    console.log('--- TC-PP15: Testing Translate API ---');
    const translateUrl = `/api/public/im-lite/${buildingId}/translate`;
    console.log(`Requesting ${translateUrl}...`);
    const transRes = await apiContext.post(translateUrl, {
      data: { language: 'en' }
    });
    console.log(`Translate Status: ${transRes.status()}`);
    if (transRes.ok()) {
      const transJson = await transRes.json();
      console.log(`Translation success. Example title:`, transJson.title || transJson);
    } else {
      console.log(`Translation failed:`, await transRes.text());
    }

    console.log('--- TC-PP16: Testing TTS API ---');
    const ttsUrl = `/api/public/im-lite/${buildingId}/tts?language=ko`;
    console.log(`Requesting ${ttsUrl}...`);
    const ttsRes = await apiContext.get(ttsUrl);
    console.log(`TTS Status: ${ttsRes.status()}`);
    if (ttsRes.ok()) {
       console.log(`TTS Headers: X-TTS-Source = ${ttsRes.headers()['x-tts-source']}`);
       const ttsBody = await ttsRes.body();
       fs.writeFileSync(path.join(ARTIFACT_DIR, 'briefing.mp3'), ttsBody);
       console.log(`Saved TTS to briefing.mp3 (${ttsBody.length} bytes)`);
    } else {
       console.log(`TTS failed:`, await ttsRes.text());
    }

    console.log('Success! Test script completed.');
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
})();
