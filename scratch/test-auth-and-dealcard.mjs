import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const PROD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SITE_URL = 'https://www.credeal.net';

// Known demo broker credentials
const DEMO_ACCOUNTS = [
  { email: 'demo-broker@credeal.net', password: 'broker1234!' },
  { email: 'demo-broker1@credeal.net', password: 'DemoBroker1!' },
  { email: 'broker1@js-building.com', password: 'broker1234!' },
];

async function main() {
  console.log('=== Auth & Deal Card Debug ===');
  console.log('Supabase URL:', PROD_URL);
  console.log('Site URL:', SITE_URL);
  console.log('');

  const supabase = createClient(PROD_URL, ANON_KEY);

  // Step 1: Try each demo account
  let session = null;
  for (const cred of DEMO_ACCOUNTS) {
    console.log(`Trying login: ${cred.email}...`);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cred.email,
      password: cred.password,
    });
    if (error) {
      console.log(`  ❌ Failed: ${error.message}`);
    } else {
      console.log(`  ✅ Success! User ID: ${data.user.id}`);
      session = data.session;
      break;
    }
  }

  if (!session) {
    console.log('\n❌ No demo account could log in. Listing all auth users...');
    
    // Try with service role to list users
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (SERVICE_KEY) {
      const adminClient = createClient(PROD_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
      });
      const { data: users } = await adminClient.auth.admin.listUsers({ perPage: 20 });
      console.log('\nAuth users:');
      users?.users?.forEach(u => {
        console.log(`  ${u.email} | ID: ${u.id} | Created: ${u.created_at}`);
      });
    }
    return;
  }

  // Step 2: Check profile/role for this user
  console.log('\n=== Profile Check ===');
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name, company')
    .eq('id', session.user.id)
    .single();
  console.log('Profile:', profile);

  // Step 3: Test the API endpoint directly with token
  console.log('\n=== API Test: /api/broker/deal-card/from-memo ===');
  const memo = '성수동 꼬마빌딩, 대지 150평, 연면적 280평, 지상 4층\n1층 카페 임차 중 (보증 5천/월세 400), 2~4층 사무실 공실\n엘리베이터 없음, 2018년 전면 리모델링, 주차 3대\n매도인 양도세 이슈로 급히 팔고 싶어 함\n호가 78억, 협의 가능. 주소는 블라인드 처리 원함';

  try {
    const res = await fetch(`${SITE_URL}/api/broker/deal-card/from-memo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        memo: memo,
        visibilityPreference: 'blind',
      }),
    });

    console.log('Response status:', res.status);
    console.log('Response headers:', Object.fromEntries(res.headers.entries()));
    
    const text = await res.text();
    console.log('Response body (raw):', text.substring(0, 500));
    
    try {
      const json = JSON.parse(text);
      console.log('\nParsed JSON:', JSON.stringify(json, null, 2).substring(0, 1000));
    } catch {
      console.log('Could not parse as JSON');
    }
  } catch (err) {
    console.log('Fetch error:', err.message);
  }

  // Step 4: Also test without auth to see the exact error
  console.log('\n=== API Test WITHOUT auth ===');
  try {
    const res2 = await fetch(`${SITE_URL}/api/broker/deal-card/from-memo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memo: memo, visibilityPreference: 'blind' }),
    });
    console.log('Status:', res2.status);
    const text2 = await res2.text();
    console.log('Body:', text2.substring(0, 500));
  } catch (err) {
    console.log('Error:', err.message);
  }
}

main().catch(console.error);
