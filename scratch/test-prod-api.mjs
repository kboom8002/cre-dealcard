import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const PROD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SITE_URL = 'https://www.credeal.net';

async function main() {
  console.log('=== Production API Test (post-deploy) ===');
  console.log('Time:', new Date().toISOString());

  // Step 1: Login
  const supabase = createClient(PROD_URL, ANON_KEY);
  const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
    email: 'demo-broker@credeal.net',
    password: 'DemoBroker2026!',
  });

  if (loginErr) {
    console.error('❌ Login failed:', loginErr.message);
    return;
  }
  console.log('✅ Login OK. User:', loginData.user.id);

  const token = loginData.session.access_token;

  // Step 2: Test deal card API
  console.log('\n=== POST /api/broker/deal-card/from-memo ===');
  const memo = '성수동 꼬마빌딩, 대지 150평, 연면적 280평, 지상 4층\n1층 카페 임차 중 (보증 5천/월세 400), 2~4층 사무실 공실\n엘리베이터 없음, 2018년 전면 리모델링, 주차 3대\n매도인 양도세 이슈로 급히 팔고 싶어 함\n호가 78억, 협의 가능. 주소는 블라인드 처리 원함';

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
    const text = await res.text();
    
    try {
      const json = JSON.parse(text);
      if (json.ok) {
        console.log('✅ SUCCESS! Deal card created.');
        console.log('Building ID:', json.data?.buildingId);
        console.log('Signal Card ID:', json.data?.signalCardId);
      } else {
        console.log('❌ API returned ok=false');
        console.log('Error:', JSON.stringify(json.error || json.message, null, 2));
        console.log('Full response:', JSON.stringify(json, null, 2).substring(0, 500));
      }
    } catch {
      console.log('Raw response:', text.substring(0, 500));
    }
  } catch (err) {
    console.log('Fetch error:', err.message);
  }
}

main().catch(console.error);
