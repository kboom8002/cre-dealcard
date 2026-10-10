#!/usr/bin/env node
/**
 * Income 골든 E2E 리셋 — 다음 실행이 반드시 "새 딜카드"로 진행되도록 이전 빌딩 레코드와 id 파일을 제거한다.
 *
 * 사용: node --env-file=.env.local scripts/income-golden/reset-building.mjs <set>-<variant> [...]
 *   예) node --env-file=.env.local scripts/income-golden/reset-building.mjs ig1-corrected ig2-as-is
 *       node --env-file=.env.local scripts/income-golden/reset-building.mjs --all
 *
 * 실패(삭제 0건이 아닌 오류) 시 exit 1 — 데이터 계층 수정이 재사용 레코드로 "거짓 통과"하는 것을 막는다.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const SETS = ['ig1', 'ig2', 'ig3', 'ig4'];
const VARIANTS = ['corrected', 'as-is'];
const args = process.argv.slice(2);
const targets = args.includes('--all')
  ? SETS.flatMap((s) => VARIANTS.map((v) => `${s}-${v}`))
  : args;

if (targets.length === 0) {
  console.error('usage: reset-building.mjs <ig1-corrected|...> | --all');
  process.exit(2);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정 (--env-file=.env.local 확인)');
  process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false } });

let failed = false;
for (const t of targets) {
  const dir = path.join('e2e', 'screenshots', `income-${t}`);
  const idFile = path.join(dir, 'building-id.txt');
  const id = fs.existsSync(idFile) ? fs.readFileSync(idFile, 'utf8').trim() : '';
  if (id) {
    const { error, count } = await db
      .from('building_ssot_lite')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) {
      console.error(`✗ ${t}: building ${id} 삭제 실패 — ${error.message}`);
      failed = true;
      continue;
    }
    console.log(`✓ ${t}: building ${id} 삭제 ${count ?? 0}건`);
  } else {
    console.log(`· ${t}: building-id.txt 없음 (이미 신규 상태)`);
  }
  for (const f of ['building-id.txt', 'doc-id.txt']) fs.rmSync(path.join(dir, f), { force: true });
}
// process.exit() 은 Windows 에서 열린 fetch 핸들과 충돌(libuv UV_HANDLE_CLOSING assert) → exitCode 사용
process.exitCode = failed ? 1 : 0;
