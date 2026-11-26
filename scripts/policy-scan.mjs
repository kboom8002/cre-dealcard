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
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(process.cwd(), 'supabase', 'migrations');
const ALL = process.argv.includes('--all');
const AS_JSON = process.argv.includes('--json');
export const NEW_FROM = '20261004000001';
export const STRICT_RLS_FROM = '20261126000001';
const SENSITIVE = /subscriber|poll|referral|analytics|dispatch|settings|cron_runs|rate_limit/i;

/**
 * Public reference / market / read-only tables explicitly permitted to carry
 * `FOR SELECT ... USING (true)` in migrations >= STRICT_RLS_FROM (20261126000001).
 */
export const PUBLIC_READ_ALLOWLIST = new Set([
  'location_hierarchy',
  'zoning_ordinance',
  'official_land_prices',
  'land_use_plans',
  'commercial_district',
  'external_transactions',
  'external_news',
  'external_reports',
  'rental_market_data',
  'rental_trend_data',
  'auction_listings',
  'energy_ratings',
  'retrofit_products',
  'im_terminology_rules',
  'market_sentiment_polls',
  'social_sentiment',
  'youtube_trends',
  'poc_surveys',
  'vendor_reviews',
  'share_pages',
  'teaser_configs',
]);

export function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

function normalizeTableName(rawTable) {
  return rawTable.replace(/^"?public"?\./i, '').replace(/"/g, '').trim().toLowerCase();
}

export function scanSql(rawSql, file) {
  const sql = stripComments(rawSql);
  const findings = [];
  const isStrictRls = /^\d{14}_/.test(file) && file.slice(0, 14) >= STRICT_RLS_FROM;

  // 1. Policy scan
  const re = /create\s+policy\s+("[^"]+"|[\w]+)\s+on\s+([\w."]+)([\s\S]*?);/gi;
  let m;
  while ((m = re.exec(sql))) {
    const [, rawName, table, bodyRaw] = m;
    const cleanTable = normalizeTableName(table);
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
    } else if (isStrictRls && cmd === 'select' && openToAnon && usingTrue && !PUBLIC_READ_ALLOWLIST.has(cleanTable)) {
      findings.push({
        file,
        policy: name,
        table,
        cmd,
        roles: roles.join(','),
        level: 'ERROR',
        reason: '비허용(non-allowlisted) 테이블에 PUBLIC/anon USING (true) 정책 금지 (>= 20261126000001)',
      });
    } else if (!PUBLIC_READ_ALLOWLIST.has(cleanTable) && cmd === 'select' && openToAnon && usingTrue && SENSITIVE.test(table)) {
      findings.push({ file, policy: name, table, cmd, roles: roles.join(','), level: 'WARN', reason: '민감 테이블에 anon SELECT true' });
    }
  }

  // 2. Strict CREATE TABLE -> ENABLE ROW LEVEL SECURITY gate for migrations >= 20261126000001
  if (isStrictRls) {
    const createTableRe = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-zA-Z_][\w]*)"?\s*(?:\(|partition\s+by\b)/gi;
    const seenTables = new Set();
    let tm;
    while ((tm = createTableRe.exec(sql))) {
      const tbl = tm[1].toLowerCase();
      if (seenTables.has(tbl)) continue;
      seenTables.add(tbl);
      const escaped = tbl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rlsRe = new RegExp(
        `\\balter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(?:"?public"?\\.)?"?${escaped}"?\\s+enable\\s+row\\s+level\\s+security\\b`,
        'i',
      );
      if (!rlsRe.test(sql)) {
        findings.push({
          file,
          policy: '(missing_rls)',
          table: tbl,
          cmd: 'create_table',
          roles: 'public',
          level: 'ERROR',
          reason: 'CREATE TABLE 에 ENABLE ROW LEVEL SECURITY 누락 (>= 20261126000001)',
        });
      }
    }
  }

  return findings;
}

export function scanFile(file) {
  return scanSql(fs.readFileSync(path.join(DIR, file), 'utf8'), file);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (!fs.existsSync(DIR)) {
    console.error(`ERROR: ${DIR} 가 없습니다.`);
    process.exit(2);
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
}
