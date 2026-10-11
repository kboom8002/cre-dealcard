/**
 * Basic IM slide-image approval gate (visual:check / visual:approve).
 *
 *   npm run visual:check                          # all decks (core + income + 3 goldens x 5 skins)
 *   npm run visual:check -- core                  # scope: all | core | income | skins
 *   npm run visual:check -- income-yangpyeong-r3 income-yangpyeong-r3:warm_beige
 *   npm run visual:approve -- income-yangpyeong-r3 income-yangpyeong-r3:warm_beige
 *   npx tsx scripts/visual-regression-gate.ts --approve <golden>[:<skin>] ...     (same thing)
 *
 * Flow: rerender PPTX offline (scripts/golden-snapshot/lib.ts, GOLDEN_VISUAL_PRESET for skins)
 *       -> LibreOffice (soffice --headless --convert-to pdf, isolated profile)
 *       -> PyMuPDF (scripts/visual-regression-render.py) 960px slide PNGs
 *       -> palette-normalised PNG -> diffImages vs baseline (light blur first: anti-aliasing)
 *       -> PASS / CHANGED(slide, ratio, side-by-side diff PNG) / NO_BASELINE.
 * Baselines: e2e/golden-snapshots/visual-baseline/<deck>/{slide-NN.png,manifest.json}  (deck = golden or golden__skin)
 * Scratch (gitignored under e2e/golden-snapshots/out/): visual-pdf, visual-current, visual-diff, visual-report.json
 *
 * Options: --threshold 0.02  --tolerance 24  --width 960  --no-rerender (reuse out/<deck>.pptx)
 *          --from-last (reuse last rendered PNGs, no render)  --allow-missing-baseline  --skin-goldens a,b,c  --list
 * Exit: 0 pass / 1 CHANGED or NO_BASELINE (unless --allow-missing-baseline) / 2 usage or render failure.
 * Console output is ASCII/English on purpose (Windows console mangles Hangul; see rule 72).
 * Environment variables: SOFFICE_PATH, VISUAL_PYTHON.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { diffImages } from '../src/domain/building/mobile-im/quality/image-diff';
import {
  BASE_SKIN, DEFAULT_CHANNEL_TOLERANCE, DEFAULT_RENDER_WIDTH, DEFAULT_SKIN_GOLDENS, DEFAULT_SLIDE_THRESHOLD,
  buildDeckMatrix, checkManifestIntegrity, deckName, evaluateDeck, findOrphanBaselines, formatDeckReport,
  formatGateSummary, gateExitCode, parseSlideFileName, selectTargets, slideFileName,
  type DeckTarget, type DeckVerdict, type RenderFingerprint, type SlideDiffMeasure,
} from '../src/domain/building/mobile-im/quality/visual-gate';
import { CORE_GOLDEN_NAMES, GOLDENS, INCOME_IG_NAMES, OUT_DIR, ROOT, hasSnapshot, rerenderSnapshot } from './golden-snapshot/lib';
import { BASIC_SKIN_IDS } from '../src/domain/building/mobile-im/pptx/pptx-theme';

const BASELINE_DIR = path.join(ROOT, 'e2e', 'golden-snapshots', 'visual-baseline');
const PDF_DIR = path.join(OUT_DIR, 'visual-pdf');
const CUR_DIR = path.join(OUT_DIR, 'visual-current');
const DIFF_DIR = path.join(OUT_DIR, 'visual-diff');
const PROFILE_DIR = path.join(OUT_DIR, 'visual-lo-profile');
const REPORT_FILE = path.join(OUT_DIR, 'visual-report.json');
const MANIFEST = 'manifest.json';
const PY_SCRIPT = path.join(ROOT, 'scripts', 'visual-regression-render.py');
const BLUR_SIGMA = 1.0;

interface Args {
  approve: boolean; targets: string[]; threshold: number; tolerance: number; width: number;
  noRerender: boolean; fromLast: boolean; allowMissingBaseline: boolean; skinGoldens: string[]; list: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    approve: false, targets: [], threshold: DEFAULT_SLIDE_THRESHOLD, tolerance: DEFAULT_CHANNEL_TOLERANCE,
    width: DEFAULT_RENDER_WIDTH, noRerender: false, fromLast: false, allowMissingBaseline: false,
    skinGoldens: [...DEFAULT_SKIN_GOLDENS], list: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${t} needs a value`); return v; };
    if (t === '--approve') a.approve = true;
    else if (t === '--threshold') a.threshold = parseFloat(val());
    else if (t === '--tolerance') a.tolerance = parseInt(val(), 10);
    else if (t === '--width') a.width = parseInt(val(), 10);
    else if (t === '--no-rerender') a.noRerender = true;
    else if (t === '--from-last') a.fromLast = true;
    else if (t === '--allow-missing-baseline') a.allowMissingBaseline = true;
    else if (t === '--skin-goldens') a.skinGoldens = val().split(',').map(s => s.trim()).filter(Boolean);
    else if (t === '--list') a.list = true;
    else if (t.startsWith('--')) throw new Error(`unknown option ${t}`);
    else a.targets.push(t);
  }
  if (!(a.threshold >= 0 && a.threshold <= 1)) throw new Error('--threshold must be 0..1');
  if (!(a.tolerance >= 0 && a.tolerance <= 255)) throw new Error('--tolerance must be 0..255');
  return a;
}

// --- tooling ---------------------------------------------------------------

function findSoffice(): string {
  const cands = [process.env.SOFFICE_PATH, 'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe', '/usr/bin/soffice', '/usr/local/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice'].filter(Boolean) as string[];
  for (const c of cands) if (fs.existsSync(c)) return c;
  return 'soffice';
}
const profileArg = () => `-env:UserInstallation=file:///${PROFILE_DIR.replace(/\\/g, '/').replace(/^\//, '')}`;

/**
 * `soffice --version` hangs on Windows (GUI launcher never exits), so read bootstrap.ini / version.ini next to the binary;
 * fall back to a short-timeout `--version` (Linux/macOS), then to "unknown".
 */
function sofficeVersion(soffice: string): string {
  const dir = path.dirname(soffice);
  try {
    const boot = fs.readFileSync(path.join(dir, 'bootstrap.ini'), 'utf8');
    const key = /^ProductKey=(.+)$/m.exec(boot)?.[1]?.trim();
    const ver = fs.existsSync(path.join(dir, 'version.ini')) ? fs.readFileSync(path.join(dir, 'version.ini'), 'utf8') : '';
    const build = /^buildid=([0-9a-f]{7,})/m.exec(ver)?.[1]?.slice(0, 9);
    if (key) return build ? `${key} (${build})` : key;
  } catch { /* fall through */ }
  const r = spawnSync(soffice, ['--version'], { encoding: 'utf8', timeout: 20000 });
  const m = /LibreOffice\s+([\d.]+)/i.exec(`${r.stdout ?? ''}`);
  if (m) return `LibreOffice ${m[1]}`;
  if (r.error && (r.error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`LibreOffice not found (${soffice}) - install it or set SOFFICE_PATH`);
  return 'LibreOffice (unknown version)';
}

function pdfOf(deck: string): string { return path.join(PDF_DIR, `${deck}.pdf`); }

function convertToPdf(soffice: string, pptxs: string[]): void {
  fs.mkdirSync(PDF_DIR, { recursive: true });
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const CHUNK = 6;
  for (let i = 0; i < pptxs.length; i += CHUNK) {
    const chunk = pptxs.slice(i, i + CHUNK);
    for (const p of chunk) fs.rmSync(pdfOf(path.basename(p, '.pptx')), { force: true });
    const r = spawnSync(soffice, [profileArg(), '--headless', '--convert-to', 'pdf', '--outdir', PDF_DIR, ...chunk],
      { encoding: 'utf8', timeout: 300000 * chunk.length });
    for (const p of chunk) {
      const deck = path.basename(p, '.pptx');
      if (!fs.existsSync(pdfOf(deck))) throw new Error(`soffice produced no PDF for ${deck}: ${r.error?.message ?? ''} ${r.stderr ?? ''}`.trim());
    }
  }
}

interface PyDeck { pdf: string; outdir: string; pages: number; fonts: string[] }
function pdfToPngs(decks: string[], width: number): { pymupdf: string; byDeck: Record<string, PyDeck> } {
  const python = process.env.VISUAL_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
  const jobs = decks.map(d => `${pdfOf(d)}=${path.join(CUR_DIR, d)}`);
  const r = spawnSync(python, ['-X', 'utf8', PY_SCRIPT, '--width', String(width), ...jobs], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`PDF -> PNG failed (needs python + PyMuPDF: pip install pymupdf): ${r.stderr || r.error?.message}`);
  const j = JSON.parse(r.stdout) as { pymupdf: string; decks: PyDeck[] };
  const byDeck: Record<string, PyDeck> = {};
  for (const d of j.decks) byDeck[path.basename(d.outdir)] = d;
  return { pymupdf: j.pymupdf, byDeck };
}

/** Deterministic palette PNG: same pipeline for baseline and current, small files. */
const normalizePng = (buf: Buffer) => sharp(buf).png({ palette: true, quality: 100, colours: 128, effort: 10, dither: 0 }).toBuffer();

// --- slide files -------------------------------------------------------------

const slideNumbers = (dir: string): number[] => !fs.existsSync(dir) ? [] :
  fs.readdirSync(dir).map(parseSlideFileName).filter((n): n is number => n !== null).sort((a, b) => a - b);

interface BaselineManifest { version: 1; name: string; approvedAt: string; fingerprint: RenderFingerprint; slides: number[]; }
const readJson = <T>(f: string): T | null => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) as T : null;

async function sideBySide(basePng: Buffer, curPng: Buffer, diffPng: Buffer, outFile: string): Promise<void> {
  const PW = 640;
  const panels = await Promise.all([basePng, curPng, diffPng].map(b => sharp(b).resize(PW).png().toBuffer()));
  const ph = (await sharp(panels[0]).metadata()).height ?? 360;
  const GAP = 6;
  await sharp({ create: { width: PW * 3 + GAP * 2, height: ph, channels: 3, background: { r: 40, g: 40, b: 40 } } })
    .composite(panels.map((input, i) => ({ input, left: i * (PW + GAP), top: 0 })))
    .png({ palette: true, quality: 90 }).toFile(outFile);
}

// --- main --------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const skins = [...BASIC_SKIN_IDS] as string[];
  const matrix = buildDeckMatrix({ coreNames: CORE_GOLDEN_NAMES, incomeNames: INCOME_IG_NAMES, skinGoldens: args.skinGoldens, skins });

  if (args.list) {
    for (const t of matrix) console.log(`${t.group.padEnd(6)} ${t.name}${hasSnapshot(t.golden) ? '' : '  (no snapshot - skipped)'}${fs.existsSync(path.join(BASELINE_DIR, t.name, MANIFEST)) ? '  [baseline]' : ''}`);
    return;
  }
  if (args.approve && args.targets.length === 0) throw new Error('--approve needs explicit targets: <golden>[:<skin>] ... (or core | income | skins | all)');

  let targets = selectTargets(matrix, args.targets);
  const explicit = new Set(args.targets.filter(t => !['all', 'core', 'income', 'skins'].includes(t)).map(t => { const [g, s] = t.split(':'); return deckName(g, s ?? null); }));
  const skipped: string[] = [];
  targets = targets.filter(t => {
    if (hasSnapshot(t.golden)) return true;
    if (explicit.has(t.name)) throw new Error(`no golden snapshot for "${t.golden}" (capture it first)`);
    skipped.push(t.name); return false;
  });
  if (targets.length === 0) throw new Error('no decks selected');
  for (const s of new Set(targets.filter(t => t.skin).map(t => t.skin as string))) {
    if (!skins.includes(s)) throw new Error(`unknown skin "${s}" (known: ${skins.join(', ')})`);
  }
  if (skipped.length) console.log(`SKIP (no snapshot): ${skipped.join(', ')}`);

  const names = targets.map(t => t.name);
  let fingerprints: Record<string, RenderFingerprint> = {};

  if (args.fromLast) {
    for (const n of names) {
      const fp = readJson<RenderFingerprint>(path.join(CUR_DIR, n, 'fingerprint.json'));
      if (!fp || slideNumbers(path.join(CUR_DIR, n)).length === 0) throw new Error(`--from-last: no previous render for ${n}`);
      fingerprints[n] = fp;
    }
  } else {
    fingerprints = await renderDecks(targets, args);
  }

  if (args.approve) { approve(names, fingerprints); return; }
  await check(targets, fingerprints, args);
}

async function renderDecks(targets: DeckTarget[], args: Args): Promise<Record<string, RenderFingerprint>> {
  const soffice = findSoffice();
  const renderer = sofficeVersion(soffice);
  const pptxs: string[] = [];
  delete process.env.GOLDEN_TIER;
  for (const t of targets) {
    const pptx = path.join(OUT_DIR, `${t.name}.pptx`);
    if (args.noRerender) {
      if (!fs.existsSync(pptx)) throw new Error(`--no-rerender: ${pptx} missing`);
    } else {
      if (t.skin) process.env.GOLDEN_VISUAL_PRESET = t.skin; else delete process.env.GOLDEN_VISUAL_PRESET;
      const r = await rerenderSnapshot(t.golden);
      if (path.resolve(r.pptxPath) !== path.resolve(pptx)) throw new Error(`unexpected pptx path ${r.pptxPath}`);
      console.log(`rendered pptx ${t.name} (${r.slideCount} slides, ${r.ms}ms)`);
    }
    pptxs.push(pptx);
  }
  delete process.env.GOLDEN_VISUAL_PRESET;

  console.log(`converting ${pptxs.length} deck(s) with ${renderer} ...`);
  convertToPdf(soffice, pptxs);
  const { pymupdf, byDeck } = pdfToPngs(targets.map(t => t.name), args.width);

  const fps: Record<string, RenderFingerprint> = {};
  for (const t of targets) {
    const d = byDeck[t.name];
    if (!d || d.pages === 0) throw new Error(`no pages rendered for ${t.name}`);
    const dir = path.join(CUR_DIR, t.name);
    for (const n of slideNumbers(dir)) {
      const f = path.join(dir, slideFileName(n));
      fs.writeFileSync(f, await normalizePng(fs.readFileSync(f)));
    }
    fps[t.name] = { renderer, pdfEngine: `PyMuPDF ${pymupdf}`, os: process.platform, width: args.width, fonts: d.fonts };
    fs.writeFileSync(path.join(dir, 'fingerprint.json'), JSON.stringify(fps[t.name], null, 2) + '\n');
  }
  return fps;
}

async function check(targets: DeckTarget[], fps: Record<string, RenderFingerprint>, args: Args) {
  const verdicts: DeckVerdict[] = [];
  for (const t of targets) {
    const baseDir = path.join(BASELINE_DIR, t.name);
    const curDir = path.join(CUR_DIR, t.name);
    const diffDir = path.join(DIFF_DIR, t.name);
    fs.rmSync(diffDir, { recursive: true, force: true });
    const manifest = readJson<BaselineManifest>(path.join(baseDir, MANIFEST));
    const baseSlides = manifest ? manifest.slides : [];
    const curSlides = slideNumbers(curDir);
    const measures: Record<number, SlideDiffMeasure> = {};
    if (manifest) {
      for (const n of baseSlides.filter(s => curSlides.includes(s))) {
        const bf = path.join(baseDir, slideFileName(n));
        if (!fs.existsSync(bf)) { baseSlides.splice(baseSlides.indexOf(n), 1); continue; } // reported via integrity below
        const bBuf = fs.readFileSync(bf), cBuf = fs.readFileSync(path.join(curDir, slideFileName(n)));
        const meta = await sharp(bBuf).metadata();
        const soft = (b: Buffer) => sharp(b).blur(BLUR_SIGMA).png().toBuffer();
        const d = await diffImages(await soft(bBuf), await soft(cBuf), { channelTolerance: args.tolerance, width: meta.width, height: meta.height });
        let diffPath: string | undefined;
        if (d.diffRatio > args.threshold) {
          fs.mkdirSync(diffDir, { recursive: true });
          diffPath = path.join(diffDir, slideFileName(n));
          await sideBySide(bBuf, cBuf, d.diffPng, diffPath);
        }
        measures[n] = { diffRatio: d.diffRatio, bbox: d.bbox, diffPath: diffPath ? path.relative(ROOT, diffPath) : undefined };
      }
    }
    verdicts.push(evaluateDeck({
      name: t.name, baselineSlides: baseSlides, currentSlides: curSlides, measures,
      threshold: args.threshold, baselineFingerprint: manifest?.fingerprint ?? null, currentFingerprint: fps[t.name],
    }));
  }

  for (const v of verdicts) for (const l of formatDeckReport(v)) console.log(l);

  // stale detection (layout-gate "gone" analogue)
  const allPossible = GOLDENS.flatMap(g => [g.name, ...BASIC_SKIN_IDS.filter(s => s !== BASE_SKIN).map(s => deckName(g.name, s))]);
  const existing = fs.existsSync(BASELINE_DIR) ? fs.readdirSync(BASELINE_DIR, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) : [];
  const orphans = findOrphanBaselines(existing, allPossible);
  const integrity: string[] = [];
  for (const t of targets) {
    const m = readJson<BaselineManifest>(path.join(BASELINE_DIR, t.name, MANIFEST));
    if (m) for (const p of checkManifestIntegrity(m.slides, slideNumbers(path.join(BASELINE_DIR, t.name)))) integrity.push(`${t.name}: ${p}`);
  }
  for (const l of formatGateSummary(verdicts, { orphans, integrity })) console.log(l);
  if (verdicts.some(v => v.status === 'CHANGED')) console.log(`Review: ${path.relative(ROOT, DIFF_DIR).replace(/\\/g, '/')}/<deck>/slide-NN.png (baseline | current | diff). Accept with: npm run visual:approve -- <golden>[:<skin>] --from-last`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), threshold: args.threshold, tolerance: args.tolerance, verdicts, orphans, integrity }, null, 2) + '\n');
  process.exitCode = gateExitCode(verdicts, { allowMissingBaseline: args.allowMissingBaseline });
}

function approve(names: string[], fps: Record<string, RenderFingerprint>) {
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  let totalBytes = 0;
  for (const n of names) {
    const src = path.join(CUR_DIR, n);
    const dst = path.join(BASELINE_DIR, n);
    const slides = slideNumbers(src);
    if (slides.length === 0) throw new Error(`nothing rendered for ${n}`);
    const prev = readJson<BaselineManifest>(path.join(dst, MANIFEST));
    fs.rmSync(dst, { recursive: true, force: true });
    fs.mkdirSync(dst, { recursive: true });
    let bytes = 0;
    for (const s of slides) {
      fs.copyFileSync(path.join(src, slideFileName(s)), path.join(dst, slideFileName(s)));
      bytes += fs.statSync(path.join(dst, slideFileName(s))).size;
    }
    const manifest: BaselineManifest = { version: 1, name: n, approvedAt: new Date().toISOString(), fingerprint: fps[n], slides };
    fs.writeFileSync(path.join(dst, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
    totalBytes += bytes;
    console.log(`APPROVED ${n}: ${slides.length} slides${prev ? ` (was ${prev.slides.length})` : ' (new baseline)'}, ${(bytes / 1024).toFixed(0)} KB -> ${path.relative(ROOT, dst)}`);
  }
  console.log(`VISUAL_APPROVE decks=${names.length} size=${(totalBytes / 1024).toFixed(0)}KB (baselines are NOT committed by this tool; git add them deliberately)`);
}

main().catch(e => { console.error(`[visual-gate] ${e?.message ?? e}`); process.exitCode = 2; });
