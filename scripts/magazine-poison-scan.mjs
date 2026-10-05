#!/usr/bin/env node
/**
 * 매거진 poison-scan (T-01, T2-25)
 *
 * 매거진 소스에서 "가짜 데이터/위험 패턴" 을 정규식으로 스캔한다.
 * - 파일별·규칙별 건수를 `scripts/magazine-poison-baseline.json` 과 비교해 **증가분만 실패** 처리한다.
 *   (기존 위반이 정리되면 `--update-baseline` 으로 기준선을 낮춘다. 증가는 절대 허용하지 않음.)
 * - 주석 줄(//, *, /*)은 스캔 대상에서 제외한다.
 *
 * 사용:
 *   node scripts/magazine-poison-scan.mjs                   # 검사 (증가 시 exit 1)
 *   node scripts/magazine-poison-scan.mjs --update-baseline # 기준선 갱신
 *   node scripts/magazine-poison-scan.mjs --report          # 전체 위반 목록 출력 (exit 0)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RULES = [
  { id: 'social-proof-floor', re: /Math\.max\(\s*5\s*,|Math\.max\([^()]*,\s*5\s*\)/, desc: '구독자 수 최소 5 보정(가짜 사회적 증거)' },
  { id: 'fake-62-100', re: /\b62\s*\/\s*100\b/, desc: '62/100 하드코딩 점수' },
  { id: 'fake-supervisor', re: /감수\s*(?:완료|:|함)|감수자/, desc: '가짜 "감수" 문구' },
  { id: 'dummy-phone', re: /010-0000-0000/, desc: '더미 전화번호' },
  { id: 'cre-dummy', re: /cre-dummy/, desc: 'cre-dummy 자리표시자' },
  { id: 'fallback-secret', re: /fallback_secret/, desc: '하드코딩 시크릿 폴백' },
  { id: 'demo-slug-fallback', re: /(?:\|\||\?\?)\s*['"]demo['"]/, desc: '"demo" 슬러그 폴백' },
  { id: 'fake-broker-name', re: /JS\s*부동산/, desc: '가짜 중개사 이름 폴백' },
  { id: 'utc-date-slice', re: /toISOString\(\)\s*\.slice\(\s*0\s*,\s*10\s*\)/, desc: 'UTC 날짜 slice (KST 아님)' },
];

const TEST_RE = /(\.test\.|\.spec\.|[\\/]tests?[\\/]|__tests__)/;
const EXT_RE = /\.(ts|tsx|js|jsx|mjs)$/;

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

/** 순수 함수: 한 파일 내용을 스캔해 {ruleId: [{line, text}]} 반환 */
export function scanContent(text) {
  const hits = {};
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        (hits[rule.id] ??= []).push({ line: i + 1, text: line.trim().slice(0, 140) });
      }
    }
  });
  return hits;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.next') continue;
      walk(p, out);
    } else if (EXT_RE.test(ent.name)) out.push(p);
  }
  return out;
}

export function listTargetFiles(root) {
  const files = [
    ...walk(path.join(root, 'src', 'domain', 'magazine')),
    ...walk(path.join(root, 'src', 'lib', 'magazine')),
    ...walk(path.join(root, 'src', 'app')).filter((f) => /magazine/i.test(path.relative(root, f))),
    ...fs
      .readdirSync(path.join(root, 'src', 'components'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('magazine'))
      .flatMap((d) => walk(path.join(root, 'src', 'components', d.name))),
  ];
  return [...new Set(files)].filter((f) => !TEST_RE.test(path.relative(root, f)));
}

/** 파일×규칙 → 건수 맵 ("rel/path::ruleId": n) */
export function scanFiles(root, files = listTargetFiles(root)) {
  const counts = {};
  const details = [];
  for (const f of files) {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    const hits = scanContent(fs.readFileSync(f, 'utf-8'));
    for (const [rule, arr] of Object.entries(hits)) {
      counts[`${rel}::${rule}`] = arr.length;
      for (const h of arr) details.push({ file: rel, rule, ...h });
    }
  }
  return { counts, details };
}

/** 기준선 대비 증가분: [{key, baseline, current}] */
export function diffAgainstBaseline(current, baseline) {
  const regress = [];
  for (const [key, n] of Object.entries(current)) {
    const b = baseline[key] ?? 0;
    if (n > b) regress.push({ key, baseline: b, current: n });
  }
  return regress;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const baselineFile = path.join(root, 'scripts', 'magazine-poison-baseline.json');
  const args = new Set(process.argv.slice(2));
  const { counts, details } = scanFiles(root);

  if (args.has('--report')) {
    for (const d of details) console.log(`${d.file}:${d.line} [${d.rule}] ${d.text}`);
    console.log(`\n총 ${details.length}건 / ${Object.keys(counts).length}개 파일·규칙`);
    return;
  }
  if (args.has('--update-baseline')) {
    const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(baselineFile, JSON.stringify(sorted, null, 2) + '\n');
    console.log(`기준선 갱신: ${Object.keys(sorted).length}개 항목 → ${path.relative(root, baselineFile)}`);
    return;
  }
  const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf-8')) : {};
  const regress = diffAgainstBaseline(counts, baseline);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (regress.length) {
    console.error('매거진 poison-scan 실패: 기준선 대비 위반 증가');
    for (const r of regress) console.error(`  ${r.key}  ${r.baseline} → ${r.current}`);
    for (const d of details.filter((x) => regress.some((r) => r.key === `${x.file}::${x.rule}`))) {
      console.error(`  ${d.file}:${d.line} [${d.rule}] ${d.text}`);
    }
    process.exit(1);
  }
  const fixed = Object.keys(baseline).filter((k) => (counts[k] ?? 0) < baseline[k]).length;
  console.log(`매거진 poison-scan 통과 (현재 ${total}건, 기준선 개선 가능 ${fixed}건)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
