/**
 * H3 — PPTX 시각 회귀 (슬라이드 PNG 스냅샷 비교)
 *
 * 사용:
 *   npx tsx scripts/visual-regression.ts <pptx> <name> [--update] [--threshold 0.02] [--tolerance 24]
 *
 *   --update     현재 렌더를 기준(baseline)으로 저장 (docs/visual-baselines/<name>/slide-NN.png, 640x360)
 *   --threshold  슬라이드별 허용 diff 비율 (기본 0.02 = 2%)
 *   --tolerance  채널별 허용 오차 0~255 (기본 24)
 *
 * 렌더러: Windows + PowerPoint COM (scripts/render-pptx-png.ps1). 그 외 환경은 지원하지 않음 → 종료 코드 2.
 * 출력: docs/test/visual-diff/<name>/slide-NN.diff.png (실패/차이 슬라이드), summary.json
 * 종료 코드: 0 통과 / 1 회귀 감지 / 2 렌더 불가
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import sharp from 'sharp';
import { diffImages } from '../src/domain/building/mobile-im/quality/image-diff';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string, d: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--update'].includes(args[i - 1])));
const [pptx, name] = positional;

if (!pptx || !name) {
  console.error('usage: npx tsx scripts/visual-regression.ts <pptx> <name> [--update] [--threshold 0.02] [--tolerance 24]');
  process.exit(2);
}

const threshold = parseFloat(opt('--threshold', '0.02'));
const tolerance = parseInt(opt('--tolerance', '24'), 10);
const root = resolve(__dirname, '..');
const baseDir = join(root, 'docs', 'visual-baselines', name);
const diffDir = join(root, 'docs', 'test', 'visual-diff', name);
const renderDir = join(root, 'docs', 'test', 'visual-render', name);

async function main() {
  if (process.platform !== 'win32') {
    console.error('[visual-regression] Windows + PowerPoint COM 전용입니다. (LibreOffice 렌더러는 미구현)');
    process.exit(2);
  }
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'render-pptx-png.ps1'), '-Pptx', resolve(pptx), '-OutDir', renderDir], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('[visual-regression] 렌더 실패:', r.stderr || r.stdout);
    process.exit(2);
  }

  const rendered = readdirSync(renderDir)
    .filter(f => /\.png$/i.test(f))
    .map(f => ({ f, n: parseInt((f.match(/(\d+)\.png$/i) ?? [])[1] ?? '0', 10) }))
    .filter(x => x.n > 0)
    .sort((a, b) => a.n - b.n);
  if (rendered.length === 0) { console.error('[visual-regression] 렌더된 슬라이드 없음'); process.exit(2); }

  const pad = (n: number) => String(n).padStart(2, '0');

  if (flag('--update')) {
    mkdirSync(baseDir, { recursive: true });
    for (const s of rendered) {
      await sharp(join(renderDir, s.f)).resize(640, 360, { fit: 'fill' }).png({ compressionLevel: 9 }).toFile(join(baseDir, `slide-${pad(s.n)}.png`));
    }
    console.log(`[visual-regression] baseline 저장: ${name} (${rendered.length} slides) → ${baseDir}`);
    return;
  }

  if (!existsSync(baseDir)) { console.error(`[visual-regression] baseline 없음: ${baseDir} (--update 로 먼저 생성)`); process.exit(2); }
  mkdirSync(diffDir, { recursive: true });

  const baseFiles = readdirSync(baseDir).filter(f => /^slide-\d+\.png$/.test(f));
  const results: { slide: number; diffRatio: number; status: 'ok' | 'regression' | 'missing' | 'extra'; bbox: unknown }[] = [];

  for (const s of rendered) {
    const bf = join(baseDir, `slide-${pad(s.n)}.png`);
    if (!existsSync(bf)) { results.push({ slide: s.n, diffRatio: 1, status: 'extra', bbox: null }); continue; }
    const d = await diffImages(readFileSync(bf), readFileSync(join(renderDir, s.f)), { channelTolerance: tolerance });
    const bad = d.diffRatio > threshold;
    if (d.diffRatio > 0) writeFileSync(join(diffDir, `slide-${pad(s.n)}.diff.png`), d.diffPng);
    results.push({ slide: s.n, diffRatio: +d.diffRatio.toFixed(5), status: bad ? 'regression' : 'ok', bbox: d.bbox });
  }
  for (const bf of baseFiles) {
    const n = parseInt(bf.match(/(\d+)/)![1], 10);
    if (!rendered.some(s => s.n === n)) results.push({ slide: n, diffRatio: 1, status: 'missing', bbox: null });
  }

  const failed = results.filter(r => r.status !== 'ok');
  writeFileSync(join(diffDir, 'summary.json'), JSON.stringify({ name, threshold, tolerance, results }, null, 2));
  for (const r of results) console.log(`  slide ${pad(r.slide)}  diff=${(r.diffRatio * 100).toFixed(2)}%  ${r.status}`);
  console.log(failed.length ? `[visual-regression] ❌ ${failed.length}개 슬라이드 회귀/불일치 → ${diffDir}` : `[visual-regression] ✅ ${results.length}개 슬라이드 모두 기준 이내 (threshold ${(threshold * 100).toFixed(1)}%)`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
