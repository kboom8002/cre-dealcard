/**
 * @file src/tests/golden/fact-oracle.test.ts
 * @description 사실 오라클 — 스냅샷을 오프라인 재렌더(in-process, 서버/Playwright/LLM/실 API 없음)한 뒤
 *              docs/golden-test-data/<fixture>/expected_facts.json 과 대조한다.
 *
 *   npx vitest run src/tests/golden/fact-oracle.test.ts        (= npm run test:oracle)
 *   ORACLE_STRICT=1 npm run test:oracle                        # pending 태그도 실패로 처리
 *
 * - PASS: 사실 확인됨 / PENDING: 알려진 미해결(W1·W2·W3) 로 태그된 실패 / FAIL: 태그 없는 실패 → 테스트 실패
 * - 스냅샷 갱신: npx tsx scripts/golden-snapshot/capture.ts core  (README-oracle.md)
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { CORE_GOLDEN_NAMES, OUT_DIR, hasSnapshot, installOfflineGuard, loadExpectedFacts, rerenderSnapshot } from '../../../scripts/golden-snapshot/lib';
import { evaluateOracle, renderSummary, renderTable, summarize, type FactResult } from './oracle-engine';

const STRICT = process.env.ORACLE_STRICT === '1';
const all: FactResult[] = [];
const times: Record<string, number> = {};
let blockedTotal = 0;

describe(`fact-oracle (offline re-render, strict=${STRICT})`, () => {
  beforeAll(async () => { await installOfflineGuard(); });

  for (const name of CORE_GOLDEN_NAMES) {
    const facts = loadExpectedFacts(name);
    const present = !!facts && hasSnapshot(name);
    (present ? it : it.skip)(`${name}`, async () => {
      const r = await rerenderSnapshot(name);
      times[name] = r.ms;
      blockedTotal += r.network.blocked.length;
      const res = evaluateOracle(facts, { slides: r.slides, pptxText: r.pptxText, viewerText: r.viewerText }, { strict: STRICT });
      all.push(...res);
      const failures = res.filter(x => x.status === 'FAIL').map(x => `[${x.kind}] ${x.label} (${x.where}${x.source ? `, src=${x.source}` : ''}) — ${x.detail}`);
      expect(failures, `${name}: 태그 없는 사실 불일치 ${failures.length}건 (pending 은 expected-fail 로 보고만)`).toEqual([]);
      // 오프라인 보장: 렌더 중 외부 호출 시도가 있었다면 가드가 막았고 여기서 기록 — 시도 자체도 보고 (실패시키진 않음)
    }, 90_000);
  }

  afterAll(() => {
    const s = summarize(all);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'oracle-report.md'),
      `# Oracle report (strict=${STRICT})\n\nPASS ${s.pass} / FAIL ${s.fail} / PENDING ${s.pending} (stale pending tags: ${s.stale})\n\n${renderSummary(all)}\n\n${renderTable(all)}\n`, 'utf8');
    fs.writeFileSync(path.join(OUT_DIR, 'oracle-report.json'), JSON.stringify(all, null, 1), 'utf8');
    // eslint-disable-next-line no-console
    console.log(`\n===== FACT ORACLE (strict=${STRICT}) =====\n${renderSummary(all)}\n\n[FAIL / PENDING]\n${renderTable(all, { onlyNonPass: true })}\n\n` +
      `TOTAL PASS ${s.pass} / FAIL ${s.fail} / PENDING ${s.pending} | stale pending ${s.stale} | re-render ms ${JSON.stringify(times)} | blocked network attempts ${blockedTotal}\n` +
      `전체 표: e2e/golden-snapshots/out/oracle-report.md`);
  });
});
