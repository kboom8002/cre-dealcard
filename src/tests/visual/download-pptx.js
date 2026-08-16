const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000/api/public/im-lite';
const OUT_DIR = path.join(__dirname, 'scratch', 'pptx');

const combos = [
  { id: 'fe5cbadd-aede-4a58-af40-3982f48ecfa7', name: 'jamwon', preset: 'golden_institutional' },
  { id: 'fe5cbadd-aede-4a58-af40-3982f48ecfa7', name: 'jamwon', preset: 'pro_dark_obsidian' },
  { id: '36300a3c-f4a7-4277-97d8-ee884cf5ea58', name: 'dangsan', preset: 'golden_institutional' },
  { id: '36300a3c-f4a7-4277-97d8-ee884cf5ea58', name: 'dangsan', preset: 'corporate_clean' },
  { id: 'f2a70b50-0e70-4203-b358-75cc991c1660', name: 'yeonnam', preset: 'golden_institutional' },
  { id: 'f2a70b50-0e70-4203-b358-75cc991c1660', name: 'yeonnam', preset: 'executive_gold' },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

async function downloadAll() {
  for (const c of combos) {
    const fn = `${c.name}_${c.preset}.pptx`;
    const url = `${BASE}/${c.id}/pptx?preset=${c.preset}&tier=basic`;
    console.log(`Downloading: ${fn} ...`);
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) {
        console.log(`  FAIL: ${res.status} ${res.statusText}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(path.join(OUT_DIR, fn), buf);
      console.log(`  OK: ${(buf.length / 1024).toFixed(1)} KB`);
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }
  }
  console.log('\nAll downloads complete.');
}

downloadAll();
