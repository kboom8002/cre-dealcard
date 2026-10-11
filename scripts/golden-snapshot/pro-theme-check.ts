/**
 * @file scripts/golden-snapshot/pro-theme-check.ts
 * @description Pro 경로(tier=pro)에서 프리셋별 렌더 검증 (오프라인). 골든 스냅샷 1건 × Pro 프리셋 N종.
 *
 *   npx tsx scripts/golden-snapshot/pro-theme-check.ts <golden-name> [preset ...]
 *
 * 프리셋마다: 렌더 성공 여부, 슬라이드 수, 렌더 경고 수, 팔레트 접근성(WCAG) 위반, 지면 구조 경고(layout_structure.py).
 * 출력: e2e/golden-snapshots/out/pro-themes/<name>__<preset>.pptx (+ .layout.json) — Basic 게이트가 스캔하는 out/ 루트와 분리.
 * 결함은 "프리셋 간 차이"로 판단: 슬라이드 수가 기준(credeal_signature)과 다르거나, 경고/접근성 위반이 있으면 FAIL.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { OUT_DIR, hasSnapshot, rerenderSnapshot } from './lib';
import { PPTX_PRESET_TEMPLATES, validatePresetAccessibility } from '../../src/domain/building/mobile-im/pptx/pptx-theme';

const DEFAULT_PRESETS = [
  'credeal_signature', 'golden_institutional', 'executive_gold', 'pro_dark_obsidian', 'corporate_clean', 'minimal_clean',
];

async function main() {
  const [name, ...rest] = process.argv.slice(2);
  if (!name) { console.error('usage: pro-theme-check.ts <golden-name> [preset ...]'); process.exit(2); }
  if (!hasSnapshot(name)) { console.error('스냅샷 없음'); process.exit(2); }
  const presets = rest.length ? rest : DEFAULT_PRESETS;
  let failures = 0;
  const rows: string[] = [];
  let baseSlides = -1;
  let baseLayout = new Set<string>();

  process.env.GOLDEN_TIER = 'pro';
  for (const preset of presets) {
    const theme = PPTX_PRESET_TEMPLATES[preset];
    if (!theme) { rows.push(`| ${preset} | ❌ 테마 정의 없음 |  |  |  |`); failures++; continue; }
    const a11y = validatePresetAccessibility(theme);
    process.env.GOLDEN_VISUAL_PRESET = preset;
    let slideCount = -1, warns = 0, layoutWarns: string[] = [], err = '';
    try {
      const r = await rerenderSnapshot(name);
      slideCount = r.slideCount; warns = r.warnings.length;
      const tmp = r.pptxPath.replace(/\.pptx$/, '.layout.json');
      execFileSync('python', ['-X', 'utf8', 'scripts/income-golden/layout_structure.py', r.pptxPath, '--json', tmp], { stdio: 'ignore' });
      const res = JSON.parse(fs.readFileSync(tmp, 'utf8'));
      layoutWarns = res.slides.flatMap((s: any) => s.warnings.map((w: string) => `s${s.slide}: ${w}`));
    } catch (e: any) { err = String(e?.message ?? e).slice(0, 120); }
    if (baseSlides < 0 && slideCount >= 0) { baseSlides = slideCount; baseLayout = new Set(layoutWarns); }
    const extraLayout = layoutWarns.filter(w => !baseLayout.has(w)); // 기준 프리셋에 없는 경고 = 테마가 유발한 지면 문제
    const bad = err || a11y.length || extraLayout.length || warns || (slideCount !== baseSlides);
    if (bad) failures++;
    rows.push(`| ${preset} | ${err ? '❌ ' + err : slideCount} | ${warns} | ${a11y.length}${a11y.length ? ' (' + a11y.slice(0, 2).join('; ') + ')' : ''} | ${layoutWarns.length} (기준 대비 추가 ${extraLayout.length}${extraLayout.length ? ': ' + extraLayout.slice(0, 3).join('; ') : ''}) |`);
  }
  delete process.env.GOLDEN_TIER; delete process.env.GOLDEN_VISUAL_PRESET;

  console.log(`\n=== Pro 테마 검증: ${name} (기준 슬라이드 ${baseSlides}) ===`);
  console.log('| preset | 슬라이드 | 렌더경고 | 접근성위반 | 지면경고 |\n|:--|:--|:--|:--|:--|');
  rows.forEach(r => console.log(r));
  console.log(`\nPRO_THEME_CHECK ${failures === 0 ? 'PASS' : 'FAIL'} (${failures} presets flagged)`);
  fs.mkdirSync(path.join(OUT_DIR, 'pro-themes'), { recursive: true });
  process.exit(failures > 0 ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
