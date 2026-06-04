import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const PROD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = 'https://www.credeal.net';

async function main() {
  const admin = createClient(PROD_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Step 1: Reset password back to original
  const DEMO_BROKER_ID = '702b8438-5dbc-4006-a0d0-909cfb00c36f';
  const ORIGINAL_PASSWORD = 'Demo2026!Broker';

  console.log('1. Resetting password to original: Demo2026!Broker');
  const { error: resetErr } = await admin.auth.admin.updateUserById(DEMO_BROKER_ID, {
    password: ORIGINAL_PASSWORD,
  });
  if (resetErr) {
    console.error('❌ Reset failed:', resetErr.message);
    return;
  }
  console.log('✅ Password reset to Demo2026!Broker');

  // Step 2: Verify login
  const anonClient = createClient(PROD_URL, ANON_KEY);
  const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
    email: 'demo-broker@credeal.net',
    password: ORIGINAL_PASSWORD,
  });
  if (loginErr) {
    console.error('❌ Login failed:', loginErr.message);
    return;
  }
  console.log('✅ Login verified!');
  const token = loginData.session.access_token;

  // Step 3: Test deal card API on production
  console.log('\n=== Test: POST /api/broker/deal-card/from-memo ===');
  const memo = '성수동 꼬마빌딩, 대지 150평, 연면적 280평, 지상 4층\n1층 카페 임차 중 (보증 5천/월세 400), 2~4층 사무실 공실\n호가 78억, 리모델링 완료';

  try {
    const res = await fetch(`${SITE_URL}/api/broker/deal-card/from-memo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ memo, visibilityPreference: 'blind' }),
    });
    console.log('HTTP Status:', res.status);
    const json = await res.json();
    if (json.ok) {
      console.log('✅ Deal card SUCCESS! Building ID:', json.data?.buildingId);
    } else {
      console.log('❌ Deal card FAILED:', JSON.stringify(json, null, 2).substring(0, 500));
    }
  } catch (err) {
    console.log('Fetch error:', err.message);
  }

  // Step 4: Test buyer intent API
  console.log('\n=== Test: POST /api/broker/buyer-intents/from-memo ===');
  const buyerMemo = '강남 GBD 오피스 매수 희망, 예산 100~150억, 공실률 5% 이하 우선';
  try {
    const res2 = await fetch(`${SITE_URL}/api/broker/buyer-intents/from-memo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ memo: buyerMemo }),
    });
    console.log('HTTP Status:', res2.status);
    const json2 = await res2.json();
    if (json2.ok) {
      console.log('✅ Buyer intent SUCCESS!');
    } else {
      console.log('❌ Buyer intent FAILED:', JSON.stringify(json2, null, 2).substring(0, 500));
    }
  } catch (err) {
    console.log('Fetch error:', err.message);
  }
}

main().catch(console.error);
