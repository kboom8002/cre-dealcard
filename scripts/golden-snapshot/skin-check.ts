/**
 * @file scripts/golden-snapshot/skin-check.ts
 * @description Basic IM 시각 스킨 3종(credeal_basic / minimal_clean / corporate_clean) × 골든 검증 (오프라인).
 *
 *   npx tsx scripts/golden-snapshot/skin-check.ts <golden-name> [...]
 *
 * 스킨은 색상 팔레트만 바꾼다는 계약을 단언한다:
 *   1) 사실 오라클: 3종 모두 FAIL 0
 *   2) 슬라이드 수·슬라이드 텍스트가 3종 모두 동일 (스킨이 내용을 바꾸면 안 됨)
 *   3) 팔레트 적용: 스킨별 액센트 hex 가 슬라이드 XML 에 실제로 쓰였고, 다른 스킨의 액센트 hex 는 쓰이지 않음
 *   4) 접근성(WCAG 대비) 위반 0
 *   5) 렌더 경고(LAYOUT_GATE 등) 수가 기본 스킨 이하
 * 출력: e2e/golden-snapshots/out/<name>__<skin>.pptx (+ slides.json)
 */
import fs from 'fs';
import path from 'path';
import { OUT_DIR, hasSnapshot, loadExpectedFacts, rerenderSnapshot } from './lib';
import { evaluateOracle, summarize } from '../../src/tests/golden/oracle-engine';
import { PPTX_PRESET_TEMPLATES, applyBasicSkin, validatePresetAccessibility, BASIC_SKIN_IDS } from '../../src/domain/building/mobile-im/pptx/pptx-theme';

const SKINS = [...BASIC_SKIN_IDS];

function slideXml(buf: Buffer): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AdmZip = require('adm-zip');
  const z = new AdmZip(buf);
  return (z.getEntries() as any[]).filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName)).map(e => e.getData().toString('utf8')).join('\n');
}

async function main() {
  const names = process.argv.slice(2);
  if (names.length === 0) { console.error('usage: skin-check.ts <golden-name> [...]'); process.exit(2); }
  let failures = 0;
  const fail = (m: string) => { failures++; console.log(`  ❌ ${m}`); };
  const ok = (m: string) => console.log(`  ✅ ${m}`);

  // 접근성 (스킨 적용 후 팔레트 기준)
  console.log('[접근성] 스킨 적용 팔레트 WCAG 대비');
  const base = PPTX_PRESET_TEMPLATES.credeal_basic;
  for (const s of SKINS) {
    const v = validatePresetAccessibility(applyBasicSkin(base, s));
    if (v.length) { fail(`${s}: ${v.length}건 — ${v.slice(0, 4).join(' | ')}`); } else ok(`${s}: 위반 0`);
  }

  for (const name of names) {
    console.log(`\n=== ${name} ===`);
    if (!hasSnapshot(name)) { fail('스냅샷 없음'); continue; }
    const facts = loadExpectedFacts(name);
    const results: Record<string, Awaited<ReturnType<typeof rerenderSnapshot>> & { xml: string }> = {};
    for (const skin of SKINS) {
      process.env.GOLDEN_VISUAL_PRESET = skin;
      const r = await rerenderSnapshot(name);
      const buf = fs.readFileSync(r.pptxPath);
      results[skin] = Object.assign(r, { xml: slideXml(buf) });
      const warn = r.warnings.length;
      let line = `${skin}: ${r.slideCount}슬라이드, 경고 ${warn}`;
      if (facts) {
        const s = summarize(evaluateOracle(facts, { slides: r.slides, pptxText: r.pptxText, viewerText: r.viewerText }, { strict: false }));
        line += `, 오라클 PASS ${s.pass}/FAIL ${s.fail}/PENDING ${s.pending}`;
        if (s.fail > 0) fail(`${skin} 오라클 FAIL ${s.fail}`);
      }
      console.log('  ' + line);
    }
    delete process.env.GOLDEN_VISUAL_PRESET;

    const b = results.credeal_basic;
    for (const skin of SKINS.slice(1)) {
      const r = results[skin];
      if (r.slideCount !== b.slideCount) fail(`${skin}: 슬라이드 수 ${r.slideCount} ≠ 기본 ${b.slideCount}`);
      else ok(`${skin}: 슬라이드 수 동일 (${r.slideCount})`);
      const diff = r.slides.findIndex((t, i) => t !== b.slides[i]);
      if (diff >= 0) fail(`${skin}: 슬라이드 ${diff + 1} 텍스트가 기본과 다름`);
      else ok(`${skin}: 모든 슬라이드 텍스트 동일`);
      if (r.warnings.length > b.warnings.length) fail(`${skin}: 경고 ${r.warnings.length} > 기본 ${b.warnings.length}`);
    }
    // 팔레트 적용 단언
    for (const skin of SKINS) {
      const acc = PPTX_PRESET_TEMPLATES[skin].accent.toUpperCase();
      const xml = results[skin].xml.toUpperCase();
      const used = (xml.match(new RegExp(`SRGBCLR VAL="${acc}"`, 'g')) ?? []).length;
      if (used === 0) fail(`${skin}: 액센트 ${acc} 가 슬라이드에 쓰이지 않음`);
      else ok(`${skin}: 액센트 ${acc} ${used}회 사용`);
      for (const other of SKINS.filter(s => s !== skin)) {
        const oacc = PPTX_PRESET_TEMPLATES[other].accent.toUpperCase();
        if (oacc === acc) continue;
        const leak = (xml.match(new RegExp(`SRGBCLR VAL="${oacc}"`, 'g')) ?? []).length;
        if (leak > 0) fail(`${skin}: 다른 스킨(${other}) 액센트 ${oacc} 가 ${leak}회 섞임 — 하드코딩 색 의심`);
      }
    }
  }
  console.log(`\nSKIN_CHECK ${failures === 0 ? 'PASS' : 'FAIL'} (${failures} failures)`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  process.exit(failures > 0 ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
