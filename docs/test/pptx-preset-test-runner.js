const fs = require('fs');
const path = require('path');

const PRESETS = [
  'credeal_signature', 
  'golden_institutional', 
  'executive_gold', 
  'corporate_clean', 
  'pro_dark_obsidian'
];
const TIERS = ['basic', 'pro'];
const BASE_URL = 'http://localhost:3000';
const RESULT_DIR = path.join(__dirname, 'pptx-results');
const UAT_RESULTS_DIR = path.join(__dirname, '../uat02/results');

const BUILDINGS = ['jamwon', 'dangsan', 'sutaek', 'yangpyeong', 'hotel', 'yeonnam'];
const buildingIds = {};

// Load UUIDs
for (const b of BUILDINGS) {
  const p = path.join(UAT_RESULTS_DIR, `dealcard_${b}.json`);
  if (fs.existsSync(p)) {
    const json = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (json.data && json.data.buildingId) {
      buildingIds[b] = json.data.buildingId;
    }
  }
}

async function runTests() {
  if (!fs.existsSync(RESULT_DIR)) fs.mkdirSync(RESULT_DIR, { recursive: true });
  
  const results = [];
  
  console.log(`Starting Phase 1 Matrix Test (${PRESETS.length * TIERS.length * BUILDINGS.length} files)`);

  for (const preset of PRESETS) {
    for (const tier of TIERS) {
      for (const name of BUILDINGS) {
        const id = buildingIds[name];
        if (!id) {
          console.error(`Skipping ${name} - No UUID found`);
          continue;
        }

        const url = `${BASE_URL}/api/public/im-lite/${id}/pptx?tier=${tier}&preset=${preset}`;
        const filename = `${preset}_${name}_${tier}.pptx`;
        const filepath = path.join(RESULT_DIR, filename);
        
        try {
          process.stdout.write(`Fetching ${filename}... `);
          const res = await fetch(url);
          const status = res.status;
          const buffer = Buffer.from(await res.arrayBuffer());
          
          // PK magic byte check
          const isPptx = buffer[0] === 0x50 && buffer[1] === 0x4B;
          
          if (status === 200 && isPptx) {
            fs.writeFileSync(filepath, buffer);
          }
          
          const pass = (status === 200 || (name === 'hotel' && status === 403)) && (isPptx || name === 'hotel') && (buffer.length > 10000 || name === 'hotel');
          
          results.push({
            preset, tier, building: name,
            status,
            sizeBytes: buffer.length,
            isPptx,
            filename,
            pass
          });

          console.log(pass ? '✅ PASS' : `❌ FAIL (Status: ${status}, Size: ${buffer.length}, isPptx: ${isPptx})`);
        } catch (err) {
          results.push({
            preset, tier, building: name,
            status: 'ERROR',
            error: err.message,
            pass: false,
          });
          console.log(`❌ ERROR (${err.message})`);
        }
      }
    }
  }
  
  // CSV 저장
  const csv = ['preset,tier,building,status,sizeBytes,isPptx,pass']
    .concat(results.map(r => `${r.preset},${r.tier},${r.building},${r.status},${r.sizeBytes||0},${r.isPptx||false},${r.pass}`))
    .join('\n');
  fs.writeFileSync(path.join(RESULT_DIR, 'test_results.csv'), csv);
  
  const passed = results.filter(r => r.pass).length;
  console.log(`\n총 ${results.length}건 중 ${passed}건 PASS (${(passed/results.length*100).toFixed(1)}%)`);
}

runTests().catch(console.error);
