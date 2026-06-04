const { chromium } = require('playwright');
const path = require('path');

const PORT = 3000;
const BASE = `http://localhost:${PORT}`;
const DIR = `C:\\Users\\User\\.gemini\\antigravity\\brain\\d2d6a4d0-e3e7-407c-97de-4a471780cf82`;
const BUILDING_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

const SUPABASE_URL = 'https://vwbmaulavgjwezffbxgi.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3Ym1hdWxhdmdqd2V6ZmZieGdpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM3NDgzNSwiZXhwIjoyMDkzOTUwODM1fQ.icKlLmN0DsEEQbxAR7F-MN8OVlnBp4L-ONntWcGKks8';

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Mock data for intercepted APIs
const MOCK_STUDIO = {
  ok: true,
  buildingId: BUILDING_ID,
  completenessScore: 95,
  layerScores: {
    building_register: 20, registry_docs: 15, land_use_plan: 10,
    rent_roll: 25, photos: 10, floor_plan: 10,
    repair_history: 0, vacancy_docs: 0, asking_price: 5, disclosure_policy: 0, total: 95,
  },
  checklist: {
    buildingRegister: true, registry: true, landUsePlan: true,
    rentRoll: true, photos: true, floorPlan: true,
    repairHistory: false, vacancyStatus: false, askingPrice: true, disclosurePolicy: false,
  },
  eligibleOutputs: ['deal_curiosity_report', 'blind_teaser', 'building_snapshot_draft', 'im_lite'],
  disclosurePrefs: {},
  leaseSummary: {
    tenants: [
      { name: '카페 블루보틀', floor: '1F', area_pyeong: 45, monthly_rent_krw: 4000000 },
      { name: '디자인 스튜디오', floor: '2F', area_pyeong: 40, monthly_rent_krw: 3200000 },
    ],
    total_monthly_rent: 7200000,
  },
};

const MOCK_SNAPSHOT = {
  id: BUILDING_ID,
  status: 'completed',
  created_at: new Date().toISOString(),
  body: {
    headline: '성수동 연무장길 메인 F&B 및 오피스 사옥용 리모델링 꼬마빌딩',
    area_signal: '성동구 성수동2가 (성수역 도보 5분)',
    asset_type: '근린생활시설 및 업무시설',
    size_signal: '대지 120.5평 / 연면적 318.4평 (지하 1층 ~ 지상 5층)',
    price_band: '125억 ~ 130억 원',
    current_use_summary: '지상 1~2층은 성수동 유망 F&B 플래그십 스토어가 임차 중(보증금 1억/월세 1,200만원)이며, 지상 3~5층은 업무시설로 현재 리모델링 밸류업을 위해 명도 완료된 상태입니다. 저층 F&B 집객과 상부층 트렌디 오피스의 최적화 조합입니다.',
    deal_thesis: '1. 성수역 및 연무장길 핵심 F&B 상권과 IT 클러스터가 접하는 요충지로 풍부한 직장인 및 유동인구 배후 확보\n2. 전면 폭 15m 도로 코너 입지로 가시성과 노출도가 뛰어나며, 리모델링 및 증축을 통한 자산가치 극대화 가능\n3. 명도 완료된 상부층은 성수동 권역 소형 오피스 사옥 수요 대상 통임대 유치에 최적화 (예상 안정화 Cap Rate 4.2%)\n4. 성수동 권역의 지속적인 지가 상승세 및 유동성 집중으로 안정적인 중장기 자본 이득(Capital Gain) 실현 기대',
    buyer_fit_types: [
      '성수동 내 브랜드 플래그십 스토어를 겸한 IT·엔터테인먼트 사옥 매수자',
      '리모델링 및 증축을 통해 고부가가치 임차를 구성하려는 밸류업 전문 투자사',
      '장기적인 자산 가치 상승과 안정적인 F&B 임대수익을 노리는 고액 자산가'
    ],
    financial_snapshot: {
      vacancy_rate_note: '현재 공실률 약 60.5% (상부층 리모델링 및 사옥 임차 대상 명도가 선제적으로 완료된 상태)',
      walt_note: '평균 잔여 임대기간(WALT) 1.5년 (1~2층 우량 F&B 브랜드와의 연장 계약 및 명도 완료 계약 혼재)',
      income_note: '현재 월 임대료 약 1,200만 원 (상부층 리모델링 통임대 완료 시 예상 월 임대료 3,500만 원 이상)'
    },
    risk_summary: '준공 28년 경과로 승강기 신설, 외관 커튼월 마감 및 주요 구조부 탄소섬유 보강 등 리모델링 비용(약 8억 원 내외)이 수반됩니다. 지하층의 미세 누수 보수가 필요하며, 리모델링 인허가 및 용도 변경 과정에서의 소요 일정 준수가 요구됩니다.',
    missing_data_note: '지하 정밀 구조진단 보고서 및 토지이용규제 법률 검토서 일부 미확보 상태',
    boundary_disclaimer: '본 스냅샷은 중개사 기초 진단 및 AI 분석 자료를 참고용으로 요약한 것이며 실제 매매계약 체결 시 법적 보증 문서로 사용될 수 없습니다. 실제 투자 결정 전 정밀 법률 및 물리적 실사가 필요합니다.'
  }
};

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  // ── Signup ──
  const uid = Date.now();
  const email = `im_mock_${uid}@jsrealty.com`;
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

  // Get user ID + setup profile
  const adminRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, {
    headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
  });
  const adminData = await adminRes.json();
  const found = (adminData.users || adminData).find(u => u.email === email);
  const userId = found?.id;
  console.log(`   User ID: ${userId}`);
  if (!userId) { await browser.close(); return; }

  // Create profile
  await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST', headers: {
      'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'return=representation',
    }, body: JSON.stringify({ id: userId, role: 'broker', display_name: 'IM 데모 중개사' }),
  });
  // Set building owner
  await fetch(`${SUPABASE_URL}/rest/v1/building_ssot_lite?id=eq.${BUILDING_ID}`, {
    method: 'PATCH', headers: {
      'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'return=representation',
    }, body: JSON.stringify({ owner_id: userId }),
  });
  console.log('   ✅ Profile + ownership set');

  // ── Intercept API calls with mock data ──
  console.log('1. Setting up API intercepts...');

  await page.route(`**/api/broker/buildings/${BUILDING_ID}/studio`, async route => {
    console.log('   [MOCK] Intercepted studio API');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_STUDIO),
    });
  });

  await page.route(`**/api/public/buildings/${BUILDING_ID}/snapshot`, async route => {
    console.log('   [MOCK] Intercepted snapshot API');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SNAPSHOT),
    });
  });

  // ── Capture IM Lite (fully unlocked with mock 95 score) ──
  console.log('2. IM Lite Viewer (unlocked)...');
  await page.goto(`${BASE}/broker/buildings/${BUILDING_ID}/im-lite`);
  await page.waitForLoadState('networkidle');
  await delay(6000);
  await page.screenshot({
    path: path.join(DIR, '10_im_lite_unlocked.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved 10_im_lite_unlocked.png');

  // ── Capture Snapshot with actual content ──
  console.log('3. Building snapshot (with content)...');
  await page.goto(`${BASE}/broker/buildings/${BUILDING_ID}/snapshot`);
  await page.waitForLoadState('networkidle');
  await delay(6000);
  await page.screenshot({
    path: path.join(DIR, '11_snapshot_content.png'),
    fullPage: true,
  });
  console.log('   ✅ Saved 11_snapshot_content.png');

  // ── Capture Deal Card CTA (bottom) ──
  console.log('4. Deal card CTA...');
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

  console.log('\n🎉 Done!');
  await browser.close();
}

run().catch(err => { console.error('ERROR:', err); process.exit(1); });
