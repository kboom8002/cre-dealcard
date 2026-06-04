const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;
const SCREENSHOT_DIR = `C:\\Users\\User\\.gemini\\antigravity\\brain\\d2d6a4d0-e3e7-407c-97de-4a471780cf82`;

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  console.log(`Waiting for local server at ${url}...`);
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 401 || res.status === 200) {
        console.log('Server is UP!');
        return true;
      }
    } catch (e) {
      // Ignored
    }
    await delay(1000);
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms.`);
}

async function run() {
  await waitForServer(BASE_URL);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // Mobile-first view
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  });

  const page = await context.newPage();

  console.log('1. Navigating to Signup Page...');
  await page.goto(`${BASE_URL}/signup`);
  await page.waitForLoadState('networkidle');

  // Fill in signup form with unique credentials
  const uniqueId = Date.now();
  const email = `e2e_broker_${uniqueId}@jsrealty.com`;
  console.log(`Creating test broker account: ${email}`);

  await page.fill('input[name="displayName"]', '홍길동 중개사');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'password1234!');
  
  // Select "Broker" radio option
  await page.click('input[name="role"][value="broker"]', { force: true });

  console.log('Submitting signup form...');
  await page.click('button[type="submit"]');

  // Wait for redirect to /broker
  console.log('Waiting for redirect to dashboard...');
  await page.waitForURL('**/broker', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await delay(2000);

  // Capture Scenario 5: Broker Cockpit Dashboard
  console.log('Taking screenshot for Scenario 5: Broker Cockpit...');
  const cockpitPath = path.join(SCREENSHOT_DIR, '05_broker_cockpit.png');
  await page.screenshot({ path: cockpitPath, fullPage: true });
  console.log(`Saved Cockpit to: ${cockpitPath}`);

  // Capture Scenario 1: 1-Minute Blind Deal Card Creator
  console.log('Navigating to Deal Card Creator...');
  await page.goto(`${BASE_URL}/broker/deal-card/new`);
  await page.waitForLoadState('networkidle');
  await delay(1000);

  console.log('Clicking sample memo button...');
  await page.click('#btn-use-sample');
  await delay(500);

  console.log('Submitting deal card creation...');
  await page.click('#cta-generate-deal-card');

  console.log('Waiting for progressive loading & redirect...');
  // Progressive loading takes around 10-12 seconds
  await page.waitForURL('**/broker/deal-card/*', { timeout: 25000 });
  await page.waitForLoadState('networkidle');
  await delay(3000);

  console.log('Taking screenshot for Scenario 1: Deal Card Created...');
  const dealCardPath = path.join(SCREENSHOT_DIR, '01_deal_card_created.png');
  await page.screenshot({ path: dealCardPath, fullPage: true });
  console.log(`Saved Deal Card to: ${dealCardPath}`);

  // Capture Scenario 2: AI Matching & Buyer Memo
  console.log('Navigating to Buyer Intent Creator...');
  await page.goto(`${BASE_URL}/broker/buyer-intents/new`);
  await page.waitForLoadState('networkidle');
  await delay(1000);

  console.log('Clicking sample buyer memo button...');
  await page.click('#btn-use-sample-buyer');
  await delay(500);

  console.log('Submitting buyer intent creation...');
  await page.click('#cta-normalize-buyer');

  console.log('Waiting for buyer intent creation and redirect...');
  await page.waitForURL('**/broker/buyer-intents/*', { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  await delay(3000);

  console.log('Taking screenshot for Scenario 2: Buyer Memo Created...');
  const buyerMemoPath = path.join(SCREENSHOT_DIR, '02_buyer_memo_created.png');
  await page.screenshot({ path: buyerMemoPath, fullPage: true });
  console.log(`Saved Buyer Memo to: ${buyerMemoPath}`);

  // Capture Scenario 3: Deal Pipeline
  console.log('Navigating to Deal Pipeline...');
  await page.goto(`${BASE_URL}/broker/pipeline`);
  await page.waitForLoadState('networkidle');
  await delay(2000);

  console.log('Taking screenshot for Scenario 3: Deal Pipeline...');
  const pipelinePath = path.join(SCREENSHOT_DIR, '03_deal_pipeline.png');
  await page.screenshot({ path: pipelinePath, fullPage: true });
  console.log(`Saved Pipeline to: ${pipelinePath}`);

  // Capture Scenario 4: CRM Client & Matching
  console.log('Navigating to CRM Clients...');
  await page.goto(`${BASE_URL}/broker/clients`);
  await page.waitForLoadState('networkidle');
  await delay(2000);

  console.log('Taking screenshot for Scenario 4: CRM Clients...');
  const clientsPath = path.join(SCREENSHOT_DIR, '04_crm_clients.png');
  await page.screenshot({ path: clientsPath, fullPage: true });
  console.log(`Saved CRM Clients to: ${clientsPath}`);

  console.log('E2E Walkthrough Completed Successfully!');
  await browser.close();
}

run().catch((err) => {
  console.error('Error during E2E capture:', err);
  process.exit(1);
});
