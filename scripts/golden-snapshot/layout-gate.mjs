#!/usr/bin/env node
/**
 * scripts/golden-snapshot/layout-gate.mjs — 오프라인 지면 게이트 (계획 D / P3, L2)
 *
 *   npx tsx scripts/golden-snapshot/rerender.ts <income|core>   # 먼저 PPTX 재렌더
 *   node scripts/golden-snapshot/layout-gate.mjs [income|core|all] [--update]
 *
 * e2e/golden-snapshots/out/<name>.pptx 를 layout_structure.py 로 측정하고,
 * e2e/golden-snapshots/layout-baseline.json (승인된 경고 목록) 과 비교한다.
 *  - 기준에 없는 새 경고 → 실패(exit 1)  /  기준에만 있던 경고(해소) → 정보 출력, --update 로 기준 갱신
 * 기준선은 "알려진 수용 경고"만 담는다. 결함은 코드를 고치고 기준선에서 제거한다.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'e2e/golden-snapshots/out';
const BASE = 'e2e/golden-snapshots/layout-baseline.json';
const arg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'all';
const update = process.argv.includes('--update');

const files = fs.readdirSync(OUT).filter(f => f.endsWith('.pptx')).map(f => f.replace(/\.pptx$/, ''))
  .filter(n => arg === 'all' || (arg === 'income' ? n.startsWith('income-ig') : arg === 'core' ? !n.startsWith('income-ig') : n === arg));

const base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')) : {};
const next = { ...base };
let fail = 0, resolved = 0;
for (const n of files) {
  const tmp = path.join(OUT, `${n}.layout.json`);
  execFileSync('python', ['-X', 'utf8', 'scripts/income-golden/layout_structure.py', path.join(OUT, `${n}.pptx`), '--json', tmp], { stdio: 'ignore' });
  const res = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  const cur = res.slides.flatMap(s => s.warnings.map(w => `s${s.slide}: ${w}`));
  const approved = new Set(base[n] ?? base[n.split('__')[0]] ?? []); // 스킨 변형(name__skin)은 기본 골든의 승인 목록을 상속
  const added = cur.filter(w => !approved.has(w));
  const gone = [...approved].filter(w => !cur.includes(w));
  next[n] = cur;
  if (added.length) { fail++; console.log(`❌ ${n}: 새 경고 ${added.length}건`); added.forEach(w => console.log(`     + ${w}`)); }
  else console.log(`✅ ${n}: 경고 ${cur.length}건 (모두 승인됨)`);
  if (gone.length) { resolved += gone.length; gone.forEach(w => console.log(`     - 해소: ${w}`)); }
}
if (update) { fs.writeFileSync(BASE, JSON.stringify(next, null, 2) + '\n'); console.log(`기준선 갱신: ${BASE}`); }
console.log(`LAYOUT_GATE fail=${fail} resolved=${resolved}`);
process.exit(update ? 0 : fail ? 1 : 0);
