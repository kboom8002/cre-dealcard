import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const PROD_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function main() {
  // Step 1: Login as demo-broker
  const anonClient = createClient(PROD_URL, ANON_KEY);
  const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
    email: 'demo-broker@credeal.net',
    password: 'DemoBroker2026!',
  });
  
  if (loginErr) {
    console.error('Login failed:', loginErr.message);
    return;
  }
  
  const token = loginData.session.access_token;
  const userId = loginData.user.id;
  console.log('✅ Login OK. User ID:', userId);
  
  // Step 2: Simulate what verifyAuth does with the bearer token
  console.log('\n=== Simulating verifyAuth flow ===');
  
  // Method 1: Bearer token auth (same as auth-guard.ts line 37-45)
  const supabaseWithToken = createClient(PROD_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
  
  const { data: userData, error: authErr } = await supabaseWithToken.auth.getUser(token);
  if (authErr) {
    console.log('❌ getUser(token) failed:', authErr.message);
  } else {
    console.log('✅ getUser(token) OK:', userData.user.id, userData.user.email);
  }
  
  // Step 3: Simulate profile lookup with SERVICE_ROLE_KEY (same as auth-guard.ts line 80-90)
  console.log('\n=== Profile lookup with service client ===');
  
  // Check if SERVICE_KEY is defined
  console.log('SERVICE_KEY defined:', !!SERVICE_KEY);
  console.log('SERVICE_KEY prefix:', SERVICE_KEY?.substring(0, 20) + '...');
  
  const serviceSupabase = createClient(PROD_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  
  const { data: profile, error: profileErr } = await serviceSupabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', userId)
    .single();
    
  if (profileErr) {
    console.log('❌ Profile query failed:', profileErr.message, profileErr.code);
  } else {
    console.log('✅ Profile:', profile);
  }
  
  // Step 4: Check what process.env.SUPABASE_SERVICE_ROLE_KEY looks like in the DEPLOYED app
  // The deployed app might have a DIFFERENT service role key or it might be missing!
  console.log('\n=== Checking DEPLOYED env vars ===');
  console.log('The local SERVICE_ROLE_KEY works for profile lookup.');
  console.log('But the DEPLOYED site might not have SUPABASE_SERVICE_ROLE_KEY set.');
  console.log('Or it might have an incorrect one.');
  
  // Step 5: Test the from-memo endpoint locally
  console.log('\n=== Testing LOCAL API (if running on localhost:3000) ===');
  try {
    const localRes = await fetch('http://localhost:3000/api/broker/deal-card/from-memo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        memo: '성수동 꼬마빌딩, 대지 150평, 연면적 280평, 4층, 리모델링, 78억, 임차',
        visibilityPreference: 'blind',
      }),
    });
    console.log('Local API status:', localRes.status);
    const localText = await localRes.text();
    console.log('Local API response:', localText.substring(0, 500));
  } catch {
    console.log('Local server not running (expected)');
  }
}

main().catch(console.error);
