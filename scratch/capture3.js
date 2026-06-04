const { chromium } = require('playwright');
const path = require('path');

const PORT = 3000;
const BASE = `http://localhost:${PORT}`;
const DIR = `C:\\Users\\User\\.gemini\\antigravity\\brain\\d2d6a4d0-e3e7-407c-97de-4a471780cf82`;

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();

  // ── Step 0: 먼저 회원가입으로 세션 확보 ──
  const uid = Date.now();
  const email = `demo_${uid}@jsrealty.com`;
  const pw = 'demopass1234!';

  console.log('0. Signing up to get auth session...');
  await page.goto(`${BASE}/signup`);
  await page.waitForLoadState('networkidle');
  await delay(1000);

  await page.fill('input[name="displayName"]', 'JS 데모 중개사');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', pw);
  await page.click('input[name="role"][value="broker"]', { force: true });
  await page.click('button[type="submit"]');

  // 가입 성공 → /broker 리다이렉트 대기
  await page.waitForURL('**/broker', { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  await delay(2000);
  console.log('   ✅ Logged in as broker');

  // ── Step 1: 코크핏 대시보드 ──
  console.log('1. Capturing Cockpit Dashboard...');
  await page.screenshot({
    path: path.join(DIR, '05_cockpit.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved 05_cockpit.png');

  // ── Step 2: 딜카드 입력 폼 (예시 메모 채움) ──
  console.log('2. Capturing Deal Card Input Form...');
  await page.goto(`${BASE}/broker/deal-card/new`);
  await page.waitForLoadState('networkidle');
  await delay(1000);
  await page.click('#btn-use-sample');
  await delay(500);
  await page.screenshot({
    path: path.join(DIR, '01_deal_card_input.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved 01_deal_card_input.png');

  // ── Step 3: 시드된 완성 딜카드 결과 페이지 ──
  console.log('3. Capturing Completed Deal Card Result...');
  await page.goto(`${BASE}/broker/deal-card/aaaaaaaa-0000-0000-0000-000000000001`);
  await page.waitForLoadState('networkidle');
  await delay(3000);
  await page.screenshot({
    path: path.join(DIR, '01_deal_card_result_full.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved 01_deal_card_result_full.png (full page)');

  // 뷰포트만 (첫 화면)
  await page.screenshot({
    path: path.join(DIR, '01_deal_card_result_top.png'),
    fullPage: false,
  });
  console.log('   ✅ Saved 01_deal_card_result_top.png (viewport)');

  // ── Step 4: 매수자 의향서 입력 폼 ──
  console.log('4. Capturing Buyer Intent Input Form...');
  await page.goto(`${BASE}/broker/buyer-intents/new`);
  await page.waitForLoadState('networkidle');
  await delay(1000);
  await page.click('#btn-use-sample-buyer');
  await delay(500);
  await page.screenshot({
    path: path.join(DIR, '02_buyer_intent_input.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved 02_buyer_intent_input.png');

  // ── Step 5: 매수자 의향서 목록 ──
  console.log('5. Capturing Buyer Intents List...');
  await page.goto(`${BASE}/broker/buyer-intents`);
  await page.waitForLoadState('networkidle');
  await delay(2000);
  await page.screenshot({
    path: path.join(DIR, '02_buyer_intents_list.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved 02_buyer_intents_list.png');

  // ── Step 6: 매칭 결과 ──
  console.log('6. Capturing Matching Results...');
  await page.goto(`${BASE}/broker/matching`);
  await page.waitForLoadState('networkidle');
  await delay(2000);
  await page.screenshot({
    path: path.join(DIR, '02_matching_results.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved 02_matching_results.png');

  // ── Step 7: 파이프라인 ──
  console.log('7. Capturing Pipeline...');
  await page.goto(`${BASE}/broker/pipeline`);
  await page.waitForLoadState('networkidle');
  await delay(2000);
  await page.screenshot({
    path: path.join(DIR, '03_pipeline.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved 03_pipeline.png');

  // ── Step 8: CRM 고객 ──
  console.log('8. Capturing CRM Clients...');
  await page.goto(`${BASE}/broker/clients`);
  await page.waitForLoadState('networkidle');
  await delay(2000);
  await page.screenshot({
    path: path.join(DIR, '04_clients.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved 04_clients.png');

  console.log('\n🎉 All 8 screenshots captured successfully!');
  await browser.close();
}

run().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
