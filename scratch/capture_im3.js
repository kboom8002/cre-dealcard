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
  console.log(`   [Supabase] ${method} ${path} → ${res.status}: ${text.substring(0, 200)}`);
  if (!res.ok) throw new Error(`Supabase error: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  // ── Sign up ──
  const uid = Date.now();
  const email = `im_v3_${uid}@jsrealty.com`;
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

  // Get user ID via admin API
  const adminRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    }
  });
  const adminData = await adminRes.json();
  const users = adminData.users || adminData;
  const found = users.find(u => u.email === email);
  const userId = found?.id;
  console.log(`   User ID: ${userId}`);

  if (!userId) {
    console.error('   ❌ Could not find user');
    await browser.close();
    return;
  }

  // ── Create profile (INSERT, not PATCH — trigger doesn't exist) ──
  console.log('   Creating profile with broker role...');
  try {
    await sbFetch('POST', 'profiles', { id: userId, role: 'broker', display_name: 'IM 데모' });
  } catch (e) {
    console.log('   Profile INSERT failed, trying PATCH...');
    try {
      await sbFetch('PATCH', `profiles?id=eq.${userId}`, { role: 'broker' });
    } catch (e2) {
      console.log('   PATCH also failed:', e2.message);
    }
  }
  
  // Verify profile exists
  const profiles = await sbFetch('GET', `profiles?id=eq.${userId}&select=id,role`);
  console.log(`   Profile verify:`, JSON.stringify(profiles));

  if (!profiles || profiles.length === 0) {
    console.error('   ❌ Profile still not created. Cannot proceed.');
    await browser.close();
    return;
  }

  // ── Update building owner_id ──
  console.log('   Setting building owner_id...');
  try {
    await sbFetch('PATCH', `building_ssot_lite?id=eq.${BUILDING_ID}`, { owner_id: userId });
    await sbFetch('PATCH', `document_objects?building_id=eq.${BUILDING_ID}`, { owner_id: userId });
  } catch (e) {
    console.log('   Owner update failed:', e.message);
  }

  // Wait for server to pick up changes
  await delay(2000);

  // ── Force page reload to refresh cookies ──
  console.log('   Reloading session...');
  await page.goto(`${BASE}/broker`);
  await page.waitForLoadState('networkidle');
  await delay(2000);

  // ── 1. IM Studio Dashboard ──
  console.log('1. IM Studio Dashboard...');
  await page.goto(`${BASE}/broker/buildings/${BUILDING_ID}/studio`);
  await page.waitForLoadState('networkidle');
  await delay(5000);
  await page.screenshot({
    path: path.join(DIR, '07_im_studio_dashboard.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved');

  // ── 2. IM Lite Viewer ──
  console.log('2. IM Lite Viewer...');
  await page.goto(`${BASE}/broker/buildings/${BUILDING_ID}/im-lite`);
  await page.waitForLoadState('networkidle');
  await delay(5000);
  await page.screenshot({
    path: path.join(DIR, '08_im_lite_viewer.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved');

  // ── 3. Building Snapshot ──
  console.log('3. Building Snapshot...');
  await page.goto(`${BASE}/broker/buildings/${BUILDING_ID}/snapshot`);
  await page.waitForLoadState('networkidle');
  await delay(5000);
  await page.screenshot({
    path: path.join(DIR, '09_building_snapshot.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved');

  console.log('\n🎉 Done!');
  await browser.close();
}

run().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
