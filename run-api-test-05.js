const { request } = require('playwright');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const TARGET_URL = 'http://localhost:3000';
const DEAL_ID = '251b9169-f1dd-4816-8344-638bf6c1f75d'; 
const ASSET_ID = '31516c3d-06b8-44e8-a2cd-af7055efe02b';
const ARTIFACT_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\26f684f7-f120-455a-96d6-662c12789f8d';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const idValid = randomUUID();
const idUnsigned = randomUUID();
const idExpired = randomUUID();
const idMaxdl = randomUUID();
const dummyDocId = randomUUID();

(async () => {
  const apiContext = await request.newContext({ baseURL: TARGET_URL });

  console.log('--- Provisioning Test Grants and Deals ---');
  
  const ASSET_ID = '94872b7d-f499-46d7-8b54-f7a38ee07d57';
  const DEAL_ID = randomUUID();

  // Create Dummy Deal
  const dealRes = await supabase.from('deals').upsert({
    id: DEAL_ID,
    broker_id: 'c2496e34-ed06-43b3-8ec5-3dcb1a67584e',
    asset_id: ASSET_ID,
    asking_price_krw: 1000000000,
    pipeline_stage: 'active',
    mandate_type: 'exclusive'
  });
  if (dealRes.error) console.error('Failed to insert deal:', dealRes.error);

  const grantBase = {
    deal_id: DEAL_ID,
    requester_name: 'Test Buyer',
    requester_phone: '010-1234-5678',
    requester_email: 'test@credeal.co.kr',
    nda_signed_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active'
  };

  const grants = [
    { ...grantBase, id: idValid },
    { ...grantBase, id: idUnsigned, nda_signed_at: null },
    { ...grantBase, id: idExpired, expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
    { ...grantBase, id: idMaxdl }
  ];

  for (const grant of grants) {
    const { error } = await supabase.from('im_pro_grants').upsert(grant);
    if (error) console.error(`Failed to insert ${grant.id}:`, error);
  }

  // Provision 10 activity events for idMaxdl
  const events = [];
  for (let i = 0; i < 10; i++) {
    events.push({
      event_type: 'im_pro_pptx_exported',
      grant_id: idMaxdl,
      actor_name: 'Test Buyer',
      metadata: {}
    });
  }
  await supabase.from('activity_events').insert(events);

  console.log('Test Grants provisioned.');

  console.log('\n--- TC-PR02: Grant 검증 게이트 ---');
  const tests = [
    { id: randomUUID(), name: 'Gate 1 (Not Found)', expect: 404 },
    { id: idUnsigned, name: 'Gate 2 (NDA 미서명)', expect: 403 },
    { id: idExpired, name: 'Gate 4 (만료)', expect: 410 },
    { id: idMaxdl, name: 'Gate 5 (다운로드 초과)', expect: 429 }
  ];

  for (const t of tests) {
    const res = await apiContext.get(`/api/public/im-pro/${t.id}/pptx`);
    console.log(`${t.name}: Status ${res.status()} (Expected ${t.expect})`);
    if (res.status() !== t.expect) {
        console.error('Mismatch!', await res.text());
    }
  }

  console.log('\n--- TC-PR01: Pro PPTX 다운로드 ---');
  const pptxRes = await apiContext.get(`/api/public/im-pro/${idValid}/pptx`, { timeout: 120000 });
  console.log(`Status: ${pptxRes.status()}`);
  if (pptxRes.ok()) {
    const headers = pptxRes.headers();
    console.log('Headers:', {
      'content-type': headers['content-type'],
      'x-slide-count': headers['x-slide-count'],
      'x-file-size': headers['x-file-size']
    });
    const body = await pptxRes.body();
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'pro_im.pptx'), body);
    console.log(`Saved pro_im.pptx (${body.length} bytes)`);
  } else {
    console.error(await pptxRes.text());
  }

  console.log('\n--- TC-PR04: Pro IM HTML Export ---');
  const htmlRes = await apiContext.get(`/api/public/im-pro/${idValid}/export`, { timeout: 60000 });
  console.log(`Status: ${htmlRes.status()}`);
  if (htmlRes.ok()) {
     const body = await htmlRes.body();
     fs.writeFileSync(path.join(ARTIFACT_DIR, 'pro_im.html'), body);
     console.log(`Saved pro_im.html (${body.length} bytes)`);
  } else {
     console.error(await htmlRes.text());
  }

  console.log('\n--- TC-PR05: PPTX Redirect ---');
  const redirectRes = await apiContext.get(`/api/public/im-pro/${idValid}/export?format=pptx`, { maxRedirects: 0 });
  console.log(`Status: ${redirectRes.status()}`);

  await supabase.from('im_pro_grants').delete().in('id', grants.map(g => g.id));
  await supabase.from('activity_events').delete().eq('grant_id', idMaxdl);
  await supabase.from('deals').delete().eq('id', DEAL_ID);
  console.log('\nCleanup complete.');
})();
