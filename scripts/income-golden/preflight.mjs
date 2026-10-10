#!/usr/bin/env node
/**
 * Income 골든 E2E 사전점검 — 50분짜리 배치가 환경 문제로 "거짓 실패/거짓 통과" 하지 않도록 먼저 확인한다.
 *
 * 사용: node --env-file=.env.local scripts/income-golden/preflight.mjs [--port 3110] [--skip-llm]
 *  1. 골든 데이터(docs/income-golden-data) 존재
 *  2. E2E 포트가 비어 있음 (다른 세션 dev 서버와 충돌 방지)
 *  3. Supabase service-role 접근
 *  4. OpenAI 크레딧 (max_tokens=1 호출 1회, 429/401 이면 중단 — 폴백 차단 상태에서 생성 실패로 이어짐)
 * 하나라도 실패하면 exit 1.
 */
import fs from 'node:fs';
import net from 'node:net';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1] || process.env.E2E_PORT || 3110);
const skipLlm = args.includes('--skip-llm');
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

// 1. 골든 데이터
const sets = ['ig1-dangsan5ga-11-47', 'ig2-ssangnim-114', 'ig3-changsin-464-6', 'ig4-yangpyeong4ga-117'];
const missing = sets.flatMap((s) => ['corrected', 'as-is'].map((v) => `docs/income-golden-data/${s}/${v}`)).filter((d) => !fs.existsSync(d));
check('golden data', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : '8 variants');

// 2. 포트
const portFree = await new Promise((resolve) => {
  const srv = net.createServer();
  srv.once('error', () => resolve(false));
  srv.once('listening', () => srv.close(() => resolve(true)));
  srv.listen(port, '127.0.0.1');
});
check(`port ${port} free`, portFree, portFree ? '' : '다른 dev 서버가 점유 중 — 종료하거나 E2E_PORT 변경');

// 3. Supabase
try {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { error } = await db.from('building_ssot_lite').select('id', { head: true, count: 'exact' }).limit(1);
  check('supabase service-role', !error, error?.message ?? '');
} catch (e) {
  check('supabase service-role', false, String(e?.message ?? e));
}

// 4. OpenAI 크레딧
if (skipLlm) {
  check('openai credits', true, 'skipped (--skip-llm, replay 모드 전용)');
} else {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === 'mock_key') {
    check('openai credits', false, 'OPENAI_API_KEY 미설정');
  } else {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
        signal: AbortSignal.timeout(20000),
      });
      const body = r.ok ? '' : (await r.text()).slice(0, 160);
      check('openai credits', r.ok, r.ok ? 'ok' : `${r.status} ${body}`);
    } catch (e) {
      check('openai credits', false, String(e?.message ?? e));
    }
  }
}

for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
// process.exit() 은 Windows 에서 열린 fetch 핸들과 충돌(libuv assert) → exitCode 사용
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
