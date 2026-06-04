import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const PROD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const supabase = createClient(PROD_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const DEMO_BROKER_ID = '702b8438-5dbc-4006-a0d0-909cfb00c36f';
  const NEW_PASSWORD = 'DemoBroker2026!';

  // Step 1: Reset password for demo-broker
  console.log('Resetting password for demo-broker@credeal.net...');
  const { data, error } = await supabase.auth.admin.updateUserById(DEMO_BROKER_ID, {
    password: NEW_PASSWORD,
  });

  if (error) {
    console.error('Password reset failed:', error.message);
    return;
  }
  console.log('✅ Password reset successful for:', data.user.email);

  // Step 2: Verify login works
  const anonClient = createClient(PROD_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
    email: 'demo-broker@credeal.net',
    password: NEW_PASSWORD,
  });

  if (loginErr) {
    console.error('❌ Login verification failed:', loginErr.message);
    return;
  }
  console.log('✅ Login verified! Access token obtained.');

  // Step 3: Check the profile role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', DEMO_BROKER_ID)
    .single();
  console.log('Profile:', profile);

  // Step 4: Test deal card API with the valid token
  console.log('\n=== Testing Deal Card API ===');
  const memo = '성수동 꼬마빌딩, 대지 150평, 연면적 280평, 지상 4층\n1층 카페 임차 중, 2~4층 사무실 공실\n호가 78억, 리모델링 완료';

  const SITE_URL = 'https://www.credeal.net';
  const res = await fetch(`${SITE_URL}/api/broker/deal-card/from-memo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${loginData.session.access_token}`,
    },
    body: JSON.stringify({ memo, visibilityPreference: 'blind' }),
  });

  console.log('HTTP Status:', res.status);
  const body = await res.text();
  console.log('Response:', body.substring(0, 1000));
}

main().catch(console.error);
