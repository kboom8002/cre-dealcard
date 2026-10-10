#!/usr/bin/env node
/**
 * scripts/income-golden/coverage-matrix.mjs — 원본 IM 대비 커버리지 집계 (계획 E / P4)
 *
 * build-review-kit.mjs --judge 가 만든 <kit>/<세트>/judge/judge.json 의 coverage.elements 를 모아
 * 세트별 커버리지 %, 상태별 건수, 미구현/부분/입력부재 요소 목록(우선순위 입력)을 <kit>/커버리지-매트릭스.md 로 쓴다.
 *   node scripts/income-golden/coverage-matrix.mjs [--kit docs/income-im/검토키트]
 * LLM 판정은 보조 지표(정확한 합격 기준 아님). 요소 분류는 세트마다 LLM 이 정하므로 건수 비교는 추세 용도로만 본다.
 */
import fs from 'node:fs';
import path from 'node:path';

const kit = (() => { const i = process.argv.indexOf('--kit'); return i > 0 ? process.argv[i + 1] : 'docs/income-im/검토키트'; })();
const esc = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ');
const sets = fs.readdirSync(kit, { withFileTypes: true }).filter((d) => d.isDirectory())
  .map((d) => ({ name: d.name, file: path.join(kit, d.name, 'judge', 'judge.json') })).filter((s) => fs.existsSync(s.file));

const rows = [];
const gaps = [];
for (const s of sets) {
  const j = JSON.parse(fs.readFileSync(s.file, 'utf8'));
  const els = j.coverage?.elements ?? [];
  const cnt = { covered: 0, partial: 0, missing: 0, input_gap: 0 };
  for (const e of els) { cnt[e.status] = (cnt[e.status] ?? 0) + 1; if (e.status !== 'covered') gaps.push({ set: s.name, ...e }); }
  rows.push({ name: s.name, total: els.length, pct: j.coverage?.coverage_pct ?? '-', ...cnt });
}

const L = ['# 원본 IM 대비 커버리지 매트릭스 (Basic IM · 수익형)', '',
  `> 생성 ${new Date().toISOString().slice(0, 10)} · LLM 보조 판정(합격 기준 아님) · 근거: 각 세트 \`judge/judge.md\``, '',
  '| 세트 | 요소 수 | 충족 | 부분 | 미구현 | 입력 부재 | 커버리지 |', '|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${r.total} | ${r.covered} | ${r.partial} | ${r.missing} | ${r.input_gap} | ${r.pct}% |`), ''];
for (const status of ['missing', 'input_gap', 'partial']) {
  const label = { missing: '미구현', input_gap: '입력 부재 (생성 파이프라인에 입력 경로 없음)', partial: '부분 충족' }[status];
  const list = gaps.filter((g) => g.status === status);
  L.push(`## ${label} — ${list.length}건`, '', '| 세트 | 원본 면 | 요소 | 생성 근거 / 비고 |', '|---|---|---|---|',
    ...list.map((g) => `| ${g.set} | ${g.original_slide ?? ''} | ${esc(g.element)} | ${esc(g.generated_evidence || g.note || g.value_mismatch)} |`), '');
}
const mism = gaps.filter((g) => g.value_mismatch && String(g.value_mismatch).trim());
L.push(`## 수치 불일치 (원본 vs 생성) — ${mism.length}건`, '', '| 세트 | 요소 | 불일치 | 비고 |', '|---|---|---|---|',
  ...mism.map((g) => `| ${g.set} | ${esc(g.element)} | ${esc(g.value_mismatch)} | ${esc(g.note)} |`), '');
fs.writeFileSync(path.join(kit, '커버리지-매트릭스.md'), L.join('\n'), 'utf8');
console.log('written', path.join(kit, '커버리지-매트릭스.md'), JSON.stringify(rows.map((r) => [r.name, r.pct])));
