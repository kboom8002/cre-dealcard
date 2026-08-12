const fs = require('fs');
const path = require('path');

const { createClient } = require('@supabase/supabase-js');

const BASE_URL = 'http://localhost:3000';
const RESULTS_DIR = path.join(__dirname, 'results');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

let TEST_TOKEN = "";

async function getTestToken() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const email = 'uat-agent-test@credeal.com';
  const password = 'testpassword123';
  
  let { data, error } = await supabase.auth.signInWithPassword({ email, password });
  
  if (error && error.message.includes('Invalid login credentials')) {
    const res = await supabase.auth.signUp({ email, password });
    data = res.data;
    error = res.error;
  }
  
  if (error) {
    console.error("Auth error:", error.message);
    process.exit(1);
  }
  
  return data.session.access_token;
}

const MEMOS = {
  dangsan: {
    posture: "income",
    type: "nbhd_building",
    text: `[2025-05 현장]

당산역(2호선/9호선) 도보 5분. 배후에 아파트 단지가 밀집해 있어 상권 배후가 두껍다.
국회대로·올림픽대로 접근이 좋고, 영등포구청·국회의사당 권역이라 유동도 안정적이다.

2002년 준공인데 관리 상태가 깨끗하다. 로비·복도·EV 다 손볼 데가 없다.
자주식 8대 주차에 전면 도로도 넉넉하다.

임차 구성이 이 물건의 핵심이다. 로뎀나무내과가 1F·2F·5F를 쓰고, 1F에 고은약국이
붙어 있다. 병원+약국 조합이라 공실 리스크가 낮고 회전이 없다.
3F 헬쓰장, 4F 국제와인. B1은 데이르 카페인데 소유주 자가 사용이고, 4F 일부도 자가다.

문제는 임대료다. 약국·내과는 11년째 인상이 없었다. 현재 월세 총 1,946만원인데
기준층(3F) 단가 62.4천원/평에 맞춰 재산정하면 2,867만원까지 올라간다. 47% 차이다.

자가 사용분 두 곳(B1 전체, 4F 일부)을 임대로 돌리는 것만으로도 상당 부분 채워진다.
매입 후 임대료 현실화를 전제로 보면 기대 수익률 연 3.1%.

토지 평당 75백만원. 인근 조사해보니 입지·부지 양호한 건 130~160백만원,
불리한 건 85~100백만원 선이다. 우리 물건은 그 아래다. 가격 경쟁력이 확실하다.

준공업지역인데 서울시가 2024년 10월에 제도개선 방안을 냈다. 지구단위계획 수립 시
주거용도 용적률 400%까지, 준주거/3종일반주거로 용도지역 변경도 추진 중이다.
현 용적률이 221.8%(지상 기준)라 여유가 크다.

등기가 층별구분등기다. 소유주가 형제 두 분인데 전체 매각에 두 분 다 동의하셨다.`
  },
  jamwon: {
    posture: "development",
    type: "nbhd_building",
    text: `[2026-04-12 현장]\n\n강남대로 바로 이면. 신사역 4분, 논현역 7분 걸어서 재봤고 실제로 그 정도 나온다.\n간장게장 골목이 바로 옆이라 주말에도 사람이 끊이지 않는 자리. 업무·상업·주거가\n섞여 있어서 주 7일 상권이라고 봐도 된다.\n\n이면 교차 골목 코너부고 바로 앞에 싸리재 소공원(약 377평)이 있다.\n\n건물은 1990년 준공이라 많이 낡았다. → 리모델링보다 신축이 맞는 물건.\n\n임차인이 여럿 있는데 매도인이 명도해서 넘기는 조건이라 매수자가 신축 부담 없이 들어올 수 있다.\n\n가격은 토지 평당 1.3억. 매각 희망가 약 242억.`
  },
  sutaek: {
    posture: "development",
    type: "bare_land",
    text: `[현장]\n\n경기도 구리시 수택동 419-19, 419-12, 419-96. 세 필지 합쳐 651.2㎡(196.98평).\n현재 나대지다. 건물이 없으니 바로 개발 들어갈 수 있다.\n\n구리역까지 380m, 걸어서 5분.\n매매가 89억, 평당 4,500만원.\n용적률 1,260%까지 받으면 2,500평 규모가 나온다.`
  },
  yangpyeong: {
    posture: "income",
    type: "office_building",
    text: `[현장]\n\n영등포구 양평동4가 117, 134, 125-2번지. 3필지 합쳐 518.7㎡.\n선유도역 9호선 4번출구에서 도보 1분. 대로변이고 초역세권이다.\n\n2018년 9월 준공. 지하 1층에 지상 10층, 업무시설.\n보증금 5억 3,500만원, 월 임대료 5,017만원.\n매매가 250억.`
  },
  hotel: {
    posture: "operating",
    type: "hotel",
    text: `[티저 수준]\n\n이대역 도보 3분, 신촌 대학가 호텔. 94실, 매각 300억.\n객실당 3.19억이다. 더 이상 확인된 게 없다.`
  },
  yeonnam: {
    posture: "income",
    type: "mixed_shop_house",
    text: `[현장 · 임대차 확인]\n\n마포구 연남동 000-12, 000-13. 두 필지 합쳐 283.0㎡.\n000-13에 도시계획도로가 6.2㎡ 걸린다. 유효 대지는 276.8㎡.\n\n2003년 5월 준공, 지하 1층에 지상 4층. 1·2층은 근생이고 3·4층은 주택이다.\n매각 희망가 42억.\n\n임대차는 다섯 호실. 1층 카페, 2층 학원, 3층 주택 전세, 4층 주택 월세, 지하는 창고인데 비어 있다.\n1·2층은 상가임대차보호법인데 3·4층은 주택임대차보호법이다.`
  }
};

let passCount = 0;
let failCount = 0;
let warnCount = 0;

function logStatus(type, msg) {
  if (type === 'pass') { passCount++; console.log(`  ✅ ${msg}`); }
  else if (type === 'fail') { failCount++; console.log(`  ❌ ${msg}`); }
  else if (type === 'warn') { warnCount++; console.log(`  ⚠️ ${msg}`); }
  else { console.log(`  ℹ️ ${msg}`); }
}

async function runTests() {
  console.log("Starting UAT Agent E2E Tests...\n");
  TEST_TOKEN = await getTestToken();
  
  // Wait for server health
  let healthy = false;
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) { healthy = true; break; }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 2000));
  }
  if (!healthy) {
    console.error("Server may not be fully healthy. Attempting to continue...");
  }
  
  const buildingIds = {};
  
  // Phase 1: Parse Memo & Phase 2: Dealcard
  for (const [name, data] of Object.entries(MEMOS)) {
    console.log(`\n=== Testing ${name} ===`);
    
    // Parse
    let res = await fetch(`${BASE_URL}/api/broker/im-lite/parse-memo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_TOKEN}` },
      body: JSON.stringify({ memo_text: data.text, investmentPosture: data.posture })
    });
    
    let json = await res.json();
    fs.writeFileSync(path.join(RESULTS_DIR, `parse_${name}.json`), JSON.stringify(json, null, 2));
    
    logStatus(json.ok ? 'pass' : 'fail', `Parse V1: ok=${json.ok}`);
    const extracted = json.data?.memo_result?.extracted?.length || 0;
    logStatus(extracted > 0 ? 'pass' : 'fail', `Parse V2: extracted=${extracted}`);
    const errCode = json.error?.code || 'none';
    logStatus(errCode === 'none' ? 'pass' : 'fail', `Parse V3: error=${errCode}`);
    
    // Dealcard
    res = await fetch(`${BASE_URL}/api/broker/deal-card/from-memo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_TOKEN}` },
      body: JSON.stringify({ memo: data.text, asset_type: data.type, investment_posture: data.posture })
    });
    
    json = await res.json();
    fs.writeFileSync(path.join(RESULTS_DIR, `dealcard_${name}.json`), JSON.stringify(json, null, 2));
    
    const bid = json.data?.buildingId || null;
    buildingIds[name] = bid;
    logStatus(bid ? 'pass' : 'fail', `Dealcard V1: building_id=${bid}`);
    
    const price = json.data?.askingPriceKrw || null;
    logStatus(price ? 'pass' : 'warn', `Dealcard V2: price=${price}`);
    
    const arch = json.archetype_code || 'none';
    logStatus(arch === 'none' ? 'pass' : 'fail', `Dealcard V3: archetype hidden`);
  }
  
  // Phase 3: IM Generate Async
  for (const name of Object.keys(MEMOS)) {
    console.log(`\n=== Generating IM Async: ${name} ===`);
    const bid = buildingIds[name];
    if (!bid) {
      logStatus('fail', 'Skipping, no building_id');
      continue;
    }
    
    const res = await fetch(`${BASE_URL}/api/broker/im-lite/generate-async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_TOKEN}` },
      body: JSON.stringify({ building_id: bid, tier: 'basic', investment_posture: MEMOS[name].posture })
    });
    
    const json = await res.json();
    fs.writeFileSync(path.join(RESULTS_DIR, `generate_${name}.json`), JSON.stringify(json, null, 2));
    
    const jobId = json.jobId;
    if (!jobId) {
      logStatus('fail', `Generation failed: ${json.error?.message || 'unknown'}`);
      continue;
    }
    
    let completed = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const sRes = await fetch(`${BASE_URL}/api/broker/im-lite/job-status?jobId=${jobId}`, {
        headers: { 'Authorization': `Bearer ${TEST_TOKEN}` }
      });
      const sJson = await sRes.json();
      if (sJson.status === 'completed' || sJson.status === 'done') {
        completed = true;
        break;
      }
      if (sJson.status === 'error' || sJson.status === 'failed') {
        console.log(`    Status: ${sJson.status}, error: ${JSON.stringify(sJson.result?.error || sJson.result || {})}`);
        break;
      }
    }
    logStatus(completed ? 'pass' : 'fail', `Async job completed: ${completed}`);
  }
  
  // Basic IM Verify
  for (const name of Object.keys(MEMOS)) {
    if (name === 'hotel') {
      console.log(`\n=== Verify Blocked Hotel ===`);
      const res = await fetch(`${BASE_URL}/api/public/im-lite/${buildingIds[name]}`);
      const json = await res.json();
      fs.writeFileSync(path.join(RESULTS_DIR, `basic_im_hotel_blocked.json`), JSON.stringify(json, null, 2));
      const ok = json.ok;
      logStatus(!ok ? 'pass' : 'fail', `Hotel blocked properly`);
      continue;
    }
    
    console.log(`\n=== Verify Basic IM: ${name} ===`);
    const res = await fetch(`${BASE_URL}/api/public/im-lite/${buildingIds[name]}`);
    const json = await res.json();
    fs.writeFileSync(path.join(RESULTS_DIR, `basic_im_${name}.json`), JSON.stringify(json, null, 2));
    
    logStatus(json.ok ? 'pass' : 'fail', `Basic V1: API ok=${json.ok}`);
    
    const sections = json.data?.sections?.length || 0;
    logStatus(sections > 0 ? 'pass' : 'fail', `Basic V2: ${sections} sections`);
    
    const blind = json.data?.blindName || 'none';
    logStatus(blind !== 'none' ? 'pass' : 'warn', `Basic V4: blindName=${blind}`);
    
    const allMd = (json.data?.sections || []).map(s => s.content || s.markdown || '').join(' ');
    
    logStatus(allMd.includes('실투자') ? 'pass' : 'warn', `Basic V5: 실투자금 found`);
    
    if (MEMOS[name].posture === 'development') {
      logStatus(allMd.includes('◇') || allMd.includes('가정') || allMd.includes('시나리오') ? 'pass' : 'warn', `Basic V6: C22 marker found`);
    }
    
    // Content Rules
    logStatus(allMd.match(/\\d+\\.\\d+%/) ? 'pass' : 'warn', `Content R1: dual FAR found`);
    const broken = (allMd.match(/(?<!\\*)\\*\\*(?!\\*)/g) || []).length;
    logStatus(broken === 0 ? 'pass' : 'warn', `Content R2: no broken markdown`);
    logStatus(!allMd.match(/ignore.*previous|<script/i) ? 'pass' : 'fail', `Content R3: no injection`);
    
    const tenants = ['로뎀나무내과', '고은약국', '스타벅스', '커피명가', '연남어학원'];
    let exposed = 0;
    tenants.forEach(t => { if (allMd.includes(t)) exposed++; });
    logStatus(exposed === 0 ? 'pass' : 'fail', `Content R4: no tenants exposed`);
    
    if (name === 'yeonnam') {
      logStatus(allMd.match(/상가임대차|주택임대차|상임법|주임법/i) ? 'pass' : 'warn', 'V04-1: lease law distinction');
      logStatus(allMd.match(/8[.,]4|840/) ? 'pass' : 'warn', 'V04-2: grouped collateral amount (C32)');
      logStatus(allMd.includes('680') ? 'pass' : 'warn', 'V04-3: total area (C19)');
    }
  }
  
  // Phase 4: PPTX Basic Download
  for (const name of Object.keys(MEMOS)) {
    console.log(`\n=== Verify PPTX Download: ${name} ===`);
    const res = await fetch(`${BASE_URL}/api/public/im-lite/${buildingIds[name]}/pptx?tier=basic`);
    const status = res.status;
    if (name === 'hotel') {
      logStatus(status !== 200 ? 'pass' : 'fail', `Hotel PPTX blocked (HTTP ${status})`);
    } else {
      logStatus(status === 200 ? 'pass' : 'fail', `PPTX HTTP ${status}`);
      if (status === 200) {
        const buffer = await res.arrayBuffer();
        fs.writeFileSync(path.join(RESULTS_DIR, `pptx_${name}_basic.pptx`), Buffer.from(buffer));
        logStatus(buffer.byteLength > 10240 ? 'pass' : 'fail', `PPTX size=${buffer.byteLength}`);
      }
    }
  }

  const summary = `# UAT-02 Agent E2E Test Results
- Date: ${new Date().toISOString()}
- Result: ${passCount} Pass, ${warnCount} Warn, ${failCount} Fail
`;
  fs.writeFileSync(path.join(RESULTS_DIR, 'UAT_RESULT_SUMMARY.md'), summary);
  
  console.log(`\n✅ Agent Tests completed! PASS: ${passCount}, FAIL: ${failCount}, WARN: ${warnCount}`);
  process.exit(failCount > 0 ? 1 : 0);
}

runTests();
