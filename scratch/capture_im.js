const { chromium } = require('playwright');
const path = require('path');

const PORT = 3000;
const BASE = `http://localhost:${PORT}`;
const DIR = `C:\\Users\\User\\.gemini\\antigravity\\brain\\d2d6a4d0-e3e7-407c-97de-4a471780cf82`;
const BUILDING_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();

  // ── Login ──
  const uid = Date.now();
  const email = `im_demo_${uid}@jsrealty.com`;
  const pw = 'demopass1234!';

  console.log('0. Signing up...');
  await page.goto(`${BASE}/signup`);
  await page.waitForLoadState('networkidle');
  await delay(1000);
  await page.fill('input[name="displayName"]', 'IM 데모 중개사');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', pw);
  await page.click('input[name="role"][value="broker"]', { force: true });
  await page.click('button[type="submit"]');
  await page.waitForURL('**/broker', { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  await delay(2000);
  console.log('   ✅ Logged in');

  // ── 1. 딜카드 결과의 "모바일 투자설명서 만들기" 버튼 영역 캡처 ──
  console.log('1. Deal card CTA bar with Mobile IM button...');
  await page.goto(`${BASE}/broker/deal-card/${BUILDING_ID}`);
  await page.waitForLoadState('networkidle');
  await delay(3000);

  // 스크롤 끝까지 내려서 CTA 바 보이게
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await delay(1000);
  await page.screenshot({
    path: path.join(DIR, '06_deal_card_cta_bar.png'),
    fullPage: false,
  });
  console.log('   ✅ Saved 06_deal_card_cta_bar.png');

  // ── 2. IM Studio 대시보드 ──
  console.log('2. IM Studio Dashboard...');
  await page.goto(`${BASE}/broker/buildings/${BUILDING_ID}/studio`);
  await page.waitForLoadState('networkidle');
  await delay(3000);
  await page.screenshot({
    path: path.join(DIR, '07_im_studio_dashboard.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved 07_im_studio_dashboard.png');

  // ── 3. IM Lite Viewer ──
  console.log('3. IM Lite Viewer...');
  await page.goto(`${BASE}/broker/buildings/${BUILDING_ID}/im-lite`);
  await page.waitForLoadState('networkidle');
  await delay(3000);
  await page.screenshot({
    path: path.join(DIR, '08_im_lite_viewer.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved 08_im_lite_viewer.png');

  // ── 4. Building Snapshot ──
  console.log('4. Building Snapshot...');
  await page.goto(`${BASE}/broker/buildings/${BUILDING_ID}/snapshot`);
  await page.waitForLoadState('networkidle');
  await delay(3000);
  await page.screenshot({
    path: path.join(DIR, '09_building_snapshot.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved 09_building_snapshot.png');

  console.log('\n🎉 All IM screenshots captured!');
  await browser.close();
}

run().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
