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

  // ── 1. 시드된 딜카드 결과 페이지 직접 접근 ──
  console.log('1. Navigating to seeded deal card result page...');
  await page.goto(`${BASE}/broker/deal-card/aaaaaaaa-0000-0000-0000-000000000001`);
  await page.waitForLoadState('networkidle');
  await delay(3000);

  // 전체 페이지 풀 캡처
  const dealCardFullPath = path.join(DIR, '01_deal_card_full.png');
  await page.screenshot({ path: dealCardFullPath, fullPage: true });
  console.log(`Saved: ${dealCardFullPath}`);

  // 상단 뷰포트만 (첫 화면)
  const dealCardTopPath = path.join(DIR, '01_deal_card_top.png');
  await page.screenshot({ path: dealCardTopPath, fullPage: false });
  console.log(`Saved: ${dealCardTopPath}`);

  // ── 2. 매칭 결과 페이지 ──
  console.log('2. Navigating to matching page...');
  await page.goto(`${BASE}/broker/matching`);
  await page.waitForLoadState('networkidle');
  await delay(2000);

  const matchingPath = path.join(DIR, '02_matching_results.png');
  await page.screenshot({ path: matchingPath, fullPage: true });
  console.log(`Saved: ${matchingPath}`);

  // ── 3. 매수자 의향서 목록 ──
  console.log('3. Navigating to buyer intents list...');
  await page.goto(`${BASE}/broker/buyer-intents`);
  await page.waitForLoadState('networkidle');
  await delay(2000);

  const buyerListPath = path.join(DIR, '02_buyer_intents_list.png');
  await page.screenshot({ path: buyerListPath, fullPage: true });
  console.log(`Saved: ${buyerListPath}`);

  // ── 4. 파이프라인 ──
  console.log('4. Navigating to pipeline...');
  await page.goto(`${BASE}/broker/pipeline`);
  await page.waitForLoadState('networkidle');
  await delay(2000);

  const pipelinePath = path.join(DIR, '03_pipeline.png');
  await page.screenshot({ path: pipelinePath, fullPage: true });
  console.log(`Saved: ${pipelinePath}`);

  // ── 5. CRM 고객 관리 ──
  console.log('5. Navigating to clients...');
  await page.goto(`${BASE}/broker/clients`);
  await page.waitForLoadState('networkidle');
  await delay(2000);

  const clientsPath = path.join(DIR, '04_clients.png');
  await page.screenshot({ path: clientsPath, fullPage: true });
  console.log(`Saved: ${clientsPath}`);

  // ── 6. 코크핏 대시보드 ──
  console.log('6. Navigating to cockpit...');
  await page.goto(`${BASE}/broker`);
  await page.waitForLoadState('networkidle');
  await delay(2000);

  const cockpitPath = path.join(DIR, '05_cockpit.png');
  await page.screenshot({ path: cockpitPath, fullPage: true });
  console.log(`Saved: ${cockpitPath}`);

  // ── 7. 딜카드 새로 만들기 (입력 폼 화면) ──
  console.log('7. Navigating to deal card new (input form)...');
  await page.goto(`${BASE}/broker/deal-card/new`);
  await page.waitForLoadState('networkidle');
  await delay(1000);
  // 예시 메모 채우기
  await page.click('#btn-use-sample');
  await delay(500);

  const dealCardNewPath = path.join(DIR, '01_deal_card_input.png');
  await page.screenshot({ path: dealCardNewPath, fullPage: true });
  console.log(`Saved: ${dealCardNewPath}`);

  // ── 8. 매수자 의향 입력 폼 ──
  console.log('8. Navigating to buyer intent new...');
  await page.goto(`${BASE}/broker/buyer-intents/new`);
  await page.waitForLoadState('networkidle');
  await delay(1000);
  await page.click('#btn-use-sample-buyer');
  await delay(500);

  const buyerNewPath = path.join(DIR, '02_buyer_intent_input.png');
  await page.screenshot({ path: buyerNewPath, fullPage: true });
  console.log(`Saved: ${buyerNewPath}`);

  console.log('\n✅ All screenshots captured successfully!');
  await browser.close();
}

run().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
