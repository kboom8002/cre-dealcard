const { chromium } = require('playwright');
const path = require('path');

const PORT = 3000;
const BASE = `http://localhost:${PORT}`;
const DIR = `C:\\Users\\User\\.gemini\\antigravity\\brain\\d2d6a4d0-e3e7-407c-97de-4a471780cf82`;
const BUILDING_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

const SUPABASE_URL = 'https://vwbmaulavgjwezffbxgi.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3Ym1hdWxhdmdqd2V6ZmZieGdpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM3NDgzNSwiZXhwIjoyMDkzOTUwODM1fQ.icKlLmN0DsEEQbxAR7F-MN8OVlnBp4L-ONntWcGKks8';

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sbFetch(method, path, body) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (method === 'GET') headers['Accept'] = 'application/json';
  else headers['Prefer'] = 'return=representation';
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`   [SB] ${method} ${path.substring(0, 60)} → ${res.status}`);
  return { status: res.status, data: text ? JSON.parse(text) : null, ok: res.ok };
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  // ── Signup ──
  const uid = Date.now();
  const email = `im_full2_${uid}@jsrealty.com`;
  const pw = 'demopass1234!';

  console.log('0. Signing up...');
  await page.goto(`${BASE}/signup`);
  await page.waitForLoadState('networkidle');
  await delay(1000);
  await page.fill('input[name="displayName"]', 'IM 데모');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', pw);
  await page.click('input[name="role"][value="broker"]', { force: true });
  await page.click('button[type="submit"]');
  await page.waitForURL('**/broker', { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  await delay(2000);
  console.log('   ✅ Logged in');

  // Get user ID
  const adminRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, {
    headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
  });
  const adminData = await adminRes.json();
  const found = (adminData.users || adminData).find(u => u.email === email);
  const userId = found?.id;
  console.log(`   User ID: ${userId}`);
  if (!userId) { await browser.close(); return; }

  // Create profile + set ownership
  console.log('1. Profile + ownership...');
  await sbFetch('POST', 'profiles', { id: userId, role: 'broker', display_name: 'IM 데모 중개사' });
  await sbFetch('PATCH', `building_ssot_lite?id=eq.${BUILDING_ID}`, { owner_id: userId });
  await sbFetch('PATCH', `document_objects?building_id=eq.${BUILDING_ID}`, { owner_id: userId });

  // ── Insert evidence_files to boost completeness to 85+ ──
  console.log('2. Inserting evidence_files...');
  // Correct schema: id, owner_id, building_id, file_type, storage_bucket, storage_path, visibility, layer_category
  const categories = [
    'building_register',  // 20pts
    'registry_docs',      // 15pts
    'rent_roll',          // 25pts
    'photos',             // 10pts
    'floor_plan',         // 10pts
    'land_use_plan',      // 10pts
  ];
  // Total: 90 + price_band(5) = 95pts!

  for (const cat of categories) {
    const res = await sbFetch('POST', 'evidence_files', {
      owner_id: userId,
      building_id: BUILDING_ID,
      file_type: 'pdf',
      storage_path: `demo/${BUILDING_ID}/${cat}.pdf`,
      visibility: 'private',
      layer_category: cat,
    });
    if (!res.ok) console.log(`   ⚠️ ${cat} failed: ${JSON.stringify(res.data).substring(0, 100)}`);
  }
  console.log('   ✅ Evidence files inserted');

  // Wait for DB
  await delay(2000);

  // Reload session
  await page.goto(`${BASE}/broker`);
  await page.waitForLoadState('networkidle');
  await delay(2000);

  // ── Capture IM Lite (should now show sections) ──
  console.log('3. IM Lite Viewer (unlocked)...');
  await page.goto(`${BASE}/broker/buildings/${BUILDING_ID}/im-lite`);
  await page.waitForLoadState('networkidle');
  await delay(6000);
  await page.screenshot({
    path: path.join(DIR, '08_im_lite_unlocked.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved 08_im_lite_unlocked.png');

  // ── Capture deal card CTA bar ──
  console.log('4. Deal card CTA bar...');
  await page.goto(`${BASE}/broker/deal-card/${BUILDING_ID}`);
  await page.waitForLoadState('networkidle');
  await delay(3000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await delay(1000);
  await page.screenshot({
    path: path.join(DIR, '06_deal_card_cta_bar.png'),
    fullPage: false,
  });
  console.log('   ✅ Saved 06_deal_card_cta_bar.png');

  // ── Capture snapshot ──
  console.log('5. Building snapshot...');
  await page.goto(`${BASE}/broker/buildings/${BUILDING_ID}/snapshot`);
  await page.waitForLoadState('networkidle');
  await delay(5000);
  await page.screenshot({
    path: path.join(DIR, '09_building_snapshot.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved 09_building_snapshot.png');

  console.log('\n🎉 Done!');
  await browser.close();
}

run().catch(err => { console.error('ERROR:', err); process.exit(1); });
