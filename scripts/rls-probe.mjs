#!/usr/bin/env node
/**
 * scripts/rls-probe.mjs — 매거진 RLS 잠금 검증 (P0-01, 읽기 전용·비파괴)
 *
 * anon 키(.env.local 의 NEXT_PUBLIC_SUPABASE_ANON_KEY)로 PostgREST 를 호출해 아래를 확인한다.
 *   (a) magazine_issues / editions / analytics_events / subscribers 에 대해 select 가
 *       PII·미발행 행을 반환하지 않는다.
 *         - analytics_events, subscribers : 0행이어야 함 (anon 정책 0개)
 *         - editions                       : 반환되는 모든 행이 status='published'
 *         - issues                         : status 컬럼이 없으면 0행, 있으면 모두 published
 *         - 응답 행에 subscriber_phone / subscriber_email / phone / email 키가 있으면 FAIL
 *   (b) `PATCH ... where id = 00000000-0000-0000-0000-000000000000` 가 권한 거부(401/403, 42501)인지.
 *         존재하지 않는 uuid 대상이라 어떤 행도 바뀌지 않는다. 단, RLS 가 "열려 있는데 행이 없는" 경우
 *         PostgREST 는 200/204 + 0행을 돌려주므로 (b)만으로는 열림/닫힘을 구분할 수 없다 → INCONCLUSIVE 로 표기하고
 *         (a) 결과로 판정한다.
 *   (c) [옵트인 --with-insert-probe] NOT NULL 필수 컬럼을 일부러 비운 빈 INSERT({}) 를 보낸다.
 *         RLS 가 열려 있으면 23502(not_null_violation), 닫혀 있으면 42501. 어느 경우에도 행이 생성되지 않는다.
 *         (기본 OFF — 운영에는 필요할 때만 실행)
 *
 * 종료코드: 0 = PASS, 1 = FAIL, 2 = 환경/네트워크 오류
 * 사용: node scripts/rls-probe.mjs [--with-insert-probe] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const WITH_INSERT = process.argv.includes('--with-insert-probe');
const AS_JSON = process.argv.includes('--json');

function loadEnvLocal() {
  const p = path.resolve(process.cwd(), '.env.local');
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = { ...loadEnvLocal(), ...process.env };
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_BASE || !ANON) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 .env.local 에 없습니다.');
  process.exit(2);
}

const headers = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' };

const TABLES = [
  { name: 'magazine_issues', kind: 'issues', patchBody: { content: {} } },
  { name: 'magazine_editions', kind: 'editions', patchBody: { title: 'rls-probe' } },
  { name: 'magazine_analytics_events', kind: 'zero', patchBody: { section_id: 'rls-probe' } },
  { name: 'magazine_subscribers', kind: 'zero', patchBody: { status: 'active' } },
];
const PII_KEYS = ['subscriber_phone', 'subscriber_email', 'subscriber_name', 'phone', 'email', 'phone_e164'];

async function http(method, pathAndQuery, body, extra = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${pathAndQuery}`, {
    method,
    headers: { ...headers, ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, json, text };
}

const results = [];
function record(table, check, verdict, detail) {
  results.push({ table, check, verdict, detail });
}

async function probeSelect(t) {
  // select=* 로 컬럼 존재(status)·PII 키를 함께 확인. 행 수는 최대 50.
  const r = await http('GET', `${t.name}?select=*&limit=50`);
  if (r.status === 401 || r.status === 403) return record(t.name, 'select', 'PASS', `거부됨 HTTP ${r.status}`);
  if (r.status >= 500 || r.status === 0) return record(t.name, 'select', 'ERROR', `HTTP ${r.status} ${r.text.slice(0, 120)}`);
  if (!Array.isArray(r.json)) {
    // 42501 등 에러 객체
    const code = r.json?.code;
    if (code === '42501') return record(t.name, 'select', 'PASS', '42501 권한 거부');
    return record(t.name, 'select', 'ERROR', `예상 외 응답 HTTP ${r.status} ${r.text.slice(0, 120)}`);
  }
  const rows = r.json;
  const piiHit = rows.length ? PII_KEYS.filter((k) => k in rows[0]) : [];
  if (piiHit.length) return record(t.name, 'select', 'FAIL', `anon select 응답에 PII 컬럼 노출: ${piiHit.join(',')} (${rows.length}행)`);
  if (t.kind === 'zero') {
    return rows.length === 0
      ? record(t.name, 'select', 'PASS', '0행')
      : record(t.name, 'select', 'FAIL', `anon 이 ${rows.length}행(최대 50) 읽음 — anon 정책 0개여야 함`);
  }
  if (t.kind === 'editions') {
    const bad = rows.filter((x) => x.status !== 'published').length;
    return bad === 0
      ? record(t.name, 'select', 'PASS', `${rows.length}행 모두 published`)
      : record(t.name, 'select', 'FAIL', `미발행 ${bad}행 노출`);
  }
  // issues
  if (rows.length === 0) return record(t.name, 'select', 'PASS', '0행');
  if (!('status' in rows[0])) return record(t.name, 'select', 'FAIL', `status 컬럼이 없는데 anon 이 ${rows.length}행 읽음(서버 경유 전용이어야 함)`);
  const bad = rows.filter((x) => x.status !== 'published').length;
  return bad === 0
    ? record(t.name, 'select', 'PASS', `${rows.length}행 모두 published`)
    : record(t.name, 'select', 'FAIL', `미발행 ${bad}행 노출`);
}

async function probePatch(t) {
  const r = await http('PATCH', `${t.name}?id=eq.${NIL_UUID}`, t.patchBody, { Prefer: 'return=minimal' });
  const code = r.json?.code;
  if (r.status === 401 || r.status === 403 || code === '42501') return record(t.name, 'patch(nil-uuid)', 'PASS', `거부 HTTP ${r.status} ${code ?? ''}`.trim());
  if (r.status === 200 || r.status === 204) return record(t.name, 'patch(nil-uuid)', 'INCONCLUSIVE', `HTTP ${r.status}, 0행 — 열림/닫힘 구분 불가(--with-insert-probe 로 확정 가능)`);
  if (code === '23502') return record(t.name, 'patch(nil-uuid)', 'FAIL', '23502 — RLS 통과(쓰기 가능)');
  return record(t.name, 'patch(nil-uuid)', 'INCONCLUSIVE', `HTTP ${r.status} ${code ?? ''} ${r.text.slice(0, 100)}`);
}

async function probeInsertEmpty(t) {
  // 필수 NOT NULL 컬럼(broker_id/visitor_id 등)이 비어 있어 RLS 가 열려 있어도 반드시 23502 로 실패 → 행 생성 불가
  const r = await http('POST', t.name, {}, { Prefer: 'return=minimal' });
  const code = r.json?.code;
  if (code === '42501' || r.status === 401 || r.status === 403) return record(t.name, 'insert-empty', 'PASS', `거부 HTTP ${r.status} ${code ?? ''}`.trim());
  if (code === '23502') return record(t.name, 'insert-empty', 'FAIL', '23502 — RLS 가 INSERT 를 통과시킴(anon INSERT 가능)');
  if (r.status === 201) return record(t.name, 'insert-empty', 'FAIL', '201 — 행이 생성됨! 즉시 확인 필요');
  return record(t.name, 'insert-empty', 'INCONCLUSIVE', `HTTP ${r.status} ${code ?? ''} ${r.text.slice(0, 100)}`);
}

try {
  for (const t of TABLES) {
    await probeSelect(t);
    await probePatch(t);
    if (WITH_INSERT) await probeInsertEmpty(t);
  }
} catch (e) {
  console.error('ERROR: 네트워크/실행 오류:', e instanceof Error ? e.message : String(e));
  process.exit(2);
}

const failed = results.filter((r) => r.verdict === 'FAIL');
const errored = results.filter((r) => r.verdict === 'ERROR');

const outIdx = process.argv.indexOf('--out');
const OUT_FILE = outIdx > -1 ? process.argv[outIdx + 1] : null;
const lines = [];
if (AS_JSON) {
  lines.push(JSON.stringify({ at: new Date().toISOString(), withInsertProbe: WITH_INSERT, results, pass: failed.length === 0 && errored.length === 0 }, null, 2));
} else {
  lines.push(`RLS probe (anon) — ${new Date().toISOString()}  insert-probe=${WITH_INSERT ? 'ON' : 'OFF'}`);
  for (const r of results) lines.push(`  [${r.verdict.padEnd(12)}] ${r.table.padEnd(28)} ${r.check.padEnd(16)} ${r.detail}`);
  lines.push(failed.length === 0 && errored.length === 0 ? 'RESULT: PASS' : `RESULT: FAIL (fail=${failed.length}, error=${errored.length})`);
}
console.log(lines.join('\n'));
// --out <file> : UTF-8 로 저장 (PowerShell 리다이렉션은 한글을 깨뜨리므로 스크립트가 직접 기록)
if (OUT_FILE) fs.writeFileSync(path.resolve(process.cwd(), OUT_FILE), lines.join('\n') + '\n', 'utf8');
process.exit(errored.length ? 2 : failed.length ? 1 : 0);
