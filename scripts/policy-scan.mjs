#!/usr/bin/env node
/**
 * scripts/policy-scan.mjs — 마이그레이션 RLS 정책 정적 스캔 (G6 RLS 표준, F-02/T-01)
 *
 * 규칙(db_contract "RLS 표준"): write 정책(FOR ALL/INSERT/UPDATE/DELETE)은 `TO service_role` 또는 `TO authenticated` + auth.uid() 조건을
 * 명시해야 한다. PUBLIC(= TO 절 없음) 또는 anon 대상의 `USING (true)` / `WITH CHECK (true)` write 정책은 금지.
 *
 * 기본 범위: 이번 보완 작업의 신규 마이그레이션(prefix >= 20261004000001, `_rollback/` 제외) — 위반 시 exit 1.
 * `--all` 은 레거시 마이그레이션 전체를 스캔해 목록만 출력(exit 0, 정보용).
 * 주의: 롤백 파일은 의도적으로 취약 정책을 복원하므로 스캔 대상이 아니다.
 *
 * 사용: node scripts/policy-scan.mjs [--all] [--json]
 * 종료코드: 0 PASS / 1 위반 / 2 오류
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.cwd(), 'supabase', 'migrations');
const ALL = process.argv.includes('--all');
const AS_JSON = process.argv.includes('--json');
const NEW_FROM = '20261004000001';
const SENSITIVE = /subscriber|poll|referral|analytics|dispatch|settings|cron_runs|rate_limit/i;

if (!fs.existsSync(DIR)) {
  console.error(`ERROR: ${DIR} 가 없습니다.`);
  process.exit(2);
}

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

function scanFile(file) {
  const sql = stripComments(fs.readFileSync(path.join(DIR, file), 'utf8'));
  const findings = [];
  const re = /create\s+policy\s+("[^"]+"|[\w]+)\s+on\s+([\w."]+)([\s\S]*?);/gi;
  let m;
  while ((m = re.exec(sql))) {
    const [, rawName, table, bodyRaw] = m;
    const body = bodyRaw.replace(/\s+/g, ' ').toLowerCase();
    const name = rawName.replace(/"/g, '');
    const cmd = (/\bfor\s+(all|insert|update|delete|select)\b/.exec(body)?.[1] ?? 'all');
    const roleMatch = /\bto\s+([\w",\s]+?)\s+(?:using|with)\b/.exec(body) ?? /\bto\s+([\w",\s]+?)\s*$/.exec(body);
    const roles = roleMatch ? roleMatch[1].split(',').map((r) => r.trim().replace(/"/g, '')) : ['public'];
    const openToAnon = roles.includes('public') || roles.includes('anon');
    const usingTrue = /\busing\s*\(\s*true\s*\)/.test(body);
    const checkTrue = /\bwith\s+check\s*\(\s*true\s*\)/.test(body);
    const isWrite = cmd !== 'select';
    if (isWrite && openToAnon && (usingTrue || checkTrue)) {
      findings.push({ file, policy: name, table, cmd, roles: roles.join(','), level: 'ERROR', reason: 'PUBLIC/anon write 정책이 true 조건' });
    } else if (cmd === 'select' && openToAnon && usingTrue && SENSITIVE.test(table)) {
      findings.push({ file, policy: name, table, cmd, roles: roles.join(','), level: 'WARN', reason: '민감 테이블에 anon SELECT true' });
    }
  }
  return findings;
}

const files = fs.readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .filter((f) => ALL || (/^\d{14}_/.test(f) && f.slice(0, 14) >= NEW_FROM))
  .sort();

const findings = files.flatMap(scanFile);
const errors = findings.filter((f) => f.level === 'ERROR');

if (AS_JSON) {
  console.log(JSON.stringify({ scanned: files.length, scope: ALL ? 'all' : 'new', findings, pass: ALL || errors.length === 0 }, null, 2));
} else {
  console.log(`policy-scan: ${files.length}개 파일 (${ALL ? '전체(정보용)' : `신규 prefix >= ${NEW_FROM}`})`);
  for (const f of findings) console.log(`  [${f.level}] ${f.file} :: ${f.table} "${f.policy}" cmd=${f.cmd} roles=${f.roles} — ${f.reason}`);
  console.log(ALL ? `INFO: 레거시 포함 ERROR ${errors.length}건` : errors.length ? `RESULT: FAIL (${errors.length})` : 'RESULT: PASS');
}
process.exit(!ALL && errors.length ? 1 : 0);
