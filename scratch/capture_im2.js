const { chromium } = require('playwright');
const path = require('path');

const PORT = 3000;
const BASE = `http://localhost:${PORT}`;
const DIR = `C:\\Users\\User\\.gemini\\antigravity\\brain\\d2d6a4d0-e3e7-407c-97de-4a471780cf82`;
const BUILDING_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

// Supabase credentials from .env.local
const SUPABASE_URL = 'https://vwbmaulavgjwezffbxgi.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3Ym1hdWxhdmdqd2V6ZmZieGdpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM3NDgzNSwiZXhwIjoyMDkzOTUwODM1fQ.icKlLmN0DsEEQbxAR7F-MN8OVlnBp4L-ONntWcGKks8';

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function supabaseRest(method, table, body, query = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'PATCH' ? 'return=minimal' : 'return=representation',
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${table}: ${res.status} ${text}`);
  }
  if (method === 'PATCH') return null;
  return res.json();
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();

  // ── Step 0: Sign up ──
  const uid = Date.now();
  const email = `im_v2_${uid}@jsrealty.com`;
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

  // Get user ID from browser session
  const userId = await page.evaluate(async () => {
    // Try to get from supabase session stored in cookies or localStorage
    // The app uses cookie-based auth so we need to call the auth API
    const res = await fetch('/api/auth/session');
    if (res.ok) {
      const data = await res.json();
      return data?.user?.id;
    }
    return null;
  });
  console.log(`   User ID from session: ${userId || 'N/A - will try alternate method'}`);

  // If we couldn't get user ID from session API, get it from Supabase auth
  let actualUserId = userId;
  if (!actualUserId) {
    // List users via Supabase Admin API to find the one we just created
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      }
    });
    if (res.ok) {
      const data = await res.json();
      const users = data.users || data;
      const found = users.find(u => u.email === email);
      if (found) {
        actualUserId = found.id;
        console.log(`   Found user ID via admin API: ${actualUserId}`);
      }
    }
  }

  if (actualUserId) {
    // First ensure profile exists with broker role
    console.log('   Ensuring profile exists...');
    // Try upsert profile via POST with on_conflict
    try {
      const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ id: actualUserId, role: 'broker', display_name: 'IM 데모 중개사' }),
      });
      if (!profileRes.ok) {
        // If upsert fails, try PATCH
        await supabaseRest('PATCH', 'profiles', { role: 'broker' }, `?id=eq.${actualUserId}`);
      }
    } catch (e) {
      console.log('   Profile upsert warning:', e.message);
      await supabaseRest('PATCH', 'profiles', { role: 'broker' }, `?id=eq.${actualUserId}`);
    }
    console.log('   ✅ Profile ready');

    // Now update building owner_id
    console.log('   Updating building owner_id...');
    await supabaseRest('PATCH', 'building_ssot_lite',
      { owner_id: actualUserId },
      `?id=eq.${BUILDING_ID}`
    );
    // Also update document_objects
    await supabaseRest('PATCH', 'document_objects',
      { owner_id: actualUserId },
      `?building_id=eq.${BUILDING_ID}`
    );
    console.log('   ✅ Owner data updated');
  } else {
    console.log('   ⚠️ Could not find user ID - studio pages may fail');
  }

  // ── 1. IM Studio 대시보드 ──
  console.log('1. IM Studio Dashboard...');
  await page.goto(`${BASE}/broker/buildings/${BUILDING_ID}/studio`);
  await page.waitForLoadState('networkidle');
  await delay(4000);
  await page.screenshot({
    path: path.join(DIR, '07_im_studio_dashboard.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved 07_im_studio_dashboard.png');

  // ── 2. IM Lite Viewer ──
  console.log('2. IM Lite Viewer...');
  await page.goto(`${BASE}/broker/buildings/${BUILDING_ID}/im-lite`);
  await page.waitForLoadState('networkidle');
  await delay(4000);
  await page.screenshot({
    path: path.join(DIR, '08_im_lite_viewer.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved 08_im_lite_viewer.png');

  // ── 3. Building Snapshot ──
  console.log('3. Building Snapshot...');
  await page.goto(`${BASE}/broker/buildings/${BUILDING_ID}/snapshot`);
  await page.waitForLoadState('networkidle');
  await delay(4000);
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
