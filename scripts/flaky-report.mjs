/**
 * H4 — Playwright flaky 추적
 *
 * 사용:
 *   npx playwright test --retries=1 --reporter=json > docs/test/pw-report.json
 *   node scripts/flaky-report.mjs docs/test/pw-report.json [--fail-on-flaky]
 *
 * - Playwright JSON 리포트에서 테스트별 결과를 집계(통과/실패/flaky/skip)한다.
 * - flaky(재시도 후 통과) 및 실패 항목을 docs/test/flaky-history.json 에 누적한다.
 * - 같은 테스트가 누적 flaky 2회 이상이면 "격리 대상"으로 표시한다.
 * - --fail-on-flaky 지정 시 flaky 가 있으면 종료 코드 1.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

const [, , reportPath, ...rest] = process.argv;
if (!reportPath) {
  console.error('usage: node scripts/flaky-report.mjs <playwright-json-report> [--fail-on-flaky]');
  process.exit(2);
}
const failOnFlaky = rest.includes('--fail-on-flaky');

// `playwright --reporter=json > file` 은 앞쪽에 로그가 섞일 수 있어 첫 '{' 부터 파싱
const raw = readFileSync(resolve(reportPath), 'utf8');
const report = JSON.parse(raw.slice(raw.indexOf('{')));

const rows = [];
(function walk(suite, file) {
  const f = suite.file || file;
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const results = t.results ?? [];
      const last = results[results.length - 1];
      rows.push({
        file: f,
        title: spec.title,
        project: t.projectName,
        outcome: t.status, // expected | unexpected | flaky | skipped
        attempts: results.length,
        durationMs: results.reduce((s, r) => s + (r.duration ?? 0), 0),
        lastStatus: last?.status,
      });
    }
  }
  for (const s of suite.suites ?? []) walk(s, f);
})({ suites: report.suites ?? [] }, '');

const count = (o) => rows.filter((r) => r.outcome === o).length;
const flaky = rows.filter((r) => r.outcome === 'flaky');
const failed = rows.filter((r) => r.outcome === 'unexpected');

const histPath = resolve('docs/test/flaky-history.json');
const history = existsSync(histPath) ? JSON.parse(readFileSync(histPath, 'utf8')) : { runs: [] };
history.runs.push({
  at: new Date().toISOString(),
  total: rows.length,
  passed: count('expected'),
  flaky: flaky.map((r) => `${r.file} › ${r.title}`),
  failed: failed.map((r) => `${r.file} › ${r.title}`),
  skipped: count('skipped'),
});
history.runs = history.runs.slice(-200);

const flakyCounts = {};
for (const run of history.runs) for (const k of run.flaky) flakyCounts[k] = (flakyCounts[k] ?? 0) + 1;
const quarantine = Object.entries(flakyCounts).filter(([, n]) => n >= 2).map(([k, n]) => ({ test: k, flakyRuns: n }));
history.quarantineCandidates = quarantine;

mkdirSync(dirname(histPath), { recursive: true });
writeFileSync(histPath, JSON.stringify(history, null, 1));

console.log(`total=${rows.length} passed=${count('expected')} failed=${failed.length} flaky=${flaky.length} skipped=${count('skipped')}`);
for (const r of flaky) console.log(`  FLAKY  ${r.file} › ${r.title} (attempts=${r.attempts})`);
for (const r of failed) console.log(`  FAILED ${r.file} › ${r.title}`);
if (quarantine.length) {
  console.log('격리 후보 (누적 flaky 2회 이상):');
  for (const q of quarantine) console.log(`  - ${q.test} (${q.flakyRuns}회)`);
}
process.exit(failed.length || (failOnFlaky && flaky.length) ? 1 : 0);
