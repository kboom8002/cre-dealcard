/**
 * @file scripts/golden-snapshot/oracle.ts
 * @description 오프라인 재렌더 + 사실 오라클 평가 CLI (vitest 없이 표 출력).
 *
 *   npx tsx scripts/golden-snapshot/oracle.ts [name|core]      # ORACLE_STRICT=1 이면 pending 도 실패
 *   → e2e/golden-snapshots/out/oracle-report.{json,md}
 */
import fs from 'fs';
import path from 'path';
import { CORE_GOLDEN_NAMES, OUT_DIR, hasSnapshot, loadExpectedFacts, rerenderSnapshot } from './lib';
import { evaluateOracle, renderSummary, renderTable, summarize, type FactResult } from '../../src/tests/golden/oracle-engine';

async function main() {
  const target = process.argv[2] ?? 'core';
  const names = target === 'core' || target === 'all' ? CORE_GOLDEN_NAMES : [target];
  const strict = process.env.ORACLE_STRICT === '1';
  const all: FactResult[] = [];
  for (const n of names) {
    const facts = loadExpectedFacts(n);
    if (!facts || !hasSnapshot(n)) { console.log(`⏭  ${n}: expected_facts.json 또는 스냅샷 없음`); continue; }
    const r = await rerenderSnapshot(n);
    const res = evaluateOracle(facts, { slides: r.slides, pptxText: r.pptxText, viewerText: r.viewerText }, { strict });
    all.push(...res);
    const s = summarize(res);
    console.log(`${n}: PASS ${s.pass} / FAIL ${s.fail} / PENDING ${s.pending} (${r.ms}ms, 네트워크 차단 ${r.network.blocked.length}건)`);
  }
  const table = renderTable(all);
  const s = summarize(all);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'oracle-report.md'), `# Oracle report (strict=${strict})\n\nPASS ${s.pass} / FAIL ${s.fail} / PENDING ${s.pending} (stale pending tags: ${s.stale})\n\n${renderSummary(all)}\n\n${table}\n`, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'oracle-report.json'), JSON.stringify(all, null, 1), 'utf8');
  console.log('\n' + renderSummary(all));
  console.log('\n[FAIL / PENDING 상세]\n' + renderTable(all, { onlyNonPass: true }));
  console.log(`\nTOTAL PASS ${s.pass} / FAIL ${s.fail} / PENDING ${s.pending} (stale pending: ${s.stale}) — 전체 표: e2e/golden-snapshots/out/oracle-report.md`);
  process.exit(s.fail > 0 ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
