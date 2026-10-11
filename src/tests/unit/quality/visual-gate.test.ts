import { describe, it, expect } from 'vitest';
import {
  BASE_SKIN, DEFAULT_SLIDE_THRESHOLD, approveSpecOf, buildDeckMatrix, changedSlideList, checkManifestIntegrity,
  compareFingerprints, deckName, evaluateDeck, findOrphanBaselines, formatDeckReport, formatGateSummary,
  gateExitCode, parseSlideFileName, parseTargetSpec, selectTargets, slideFileName, summarizeGate,
  type RenderFingerprint, type SlideDiffMeasure,
} from '@/domain/building/mobile-im/quality/visual-gate';

const fp = (over: Partial<RenderFingerprint> = {}): RenderFingerprint => ({
  renderer: 'LibreOffice 24.8.3.2', pdfEngine: 'PyMuPDF 1.26.1', os: 'win32', width: 960,
  fonts: ['MalgunGothic', 'ArialMT'], ...over,
});
const m = (diffRatio: number, extra: Partial<SlideDiffMeasure> = {}): SlideDiffMeasure => ({ diffRatio, ...extra });

describe('visual-gate: target specs / matrix', () => {
  it('parseTargetSpec: golden, golden:skin, credeal_basic folds into the base golden', () => {
    expect(parseTargetSpec('income-yangpyeong-r3')).toEqual({ golden: 'income-yangpyeong-r3', skin: null });
    expect(parseTargetSpec('income-yangpyeong-r3:warm_beige')).toEqual({ golden: 'income-yangpyeong-r3', skin: 'warm_beige' });
    expect(parseTargetSpec(`income-yangpyeong-r3:${BASE_SKIN}`)).toEqual({ golden: 'income-yangpyeong-r3', skin: null });
    expect(() => parseTargetSpec('')).toThrow();
    expect(() => parseTargetSpec('abc:')).toThrow();
  });

  it('deckName / approveSpecOf roundtrip', () => {
    expect(deckName('g', 'warm_beige')).toBe('g__warm_beige');
    expect(deckName('g', null)).toBe('g');
    expect(deckName('g', BASE_SKIN)).toBe('g');
    expect(approveSpecOf('g__warm_beige')).toBe('g:warm_beige');
    expect(approveSpecOf('g')).toBe('g');
  });

  const skins = [BASE_SKIN, 'minimal_clean', 'corporate_clean', 'mono_contrast', 'warm_beige', 'wine_burgundy'];
  const matrix = buildDeckMatrix({ coreNames: ['a', 'b'], incomeNames: ['i1'], skinGoldens: ['a', 'i1', 'b'], skins });

  it('buildDeckMatrix: core + income + 3 goldens x 5 non-base skins, no duplicates', () => {
    expect(matrix.filter(t => t.group === 'core').map(t => t.name)).toEqual(['a', 'b']);
    expect(matrix.filter(t => t.group === 'income').map(t => t.name)).toEqual(['i1']);
    expect(matrix.filter(t => t.group === 'skin')).toHaveLength(15);
    expect(matrix.some(t => t.name.endsWith(`__${BASE_SKIN}`))).toBe(false); // base skin inherits the golden's baseline
    expect(new Set(matrix.map(t => t.name)).size).toBe(matrix.length);
  });

  it('selectTargets: scopes, specs, base-skin fold, ad-hoc deck outside the matrix', () => {
    expect(selectTargets(matrix, [])).toHaveLength(matrix.length);
    expect(selectTargets(matrix, ['core']).map(t => t.name)).toEqual(['a', 'b']);
    expect(selectTargets(matrix, ['skins'])).toHaveLength(15);
    expect(selectTargets(matrix, ['a', `a:${BASE_SKIN}`, 'a:warm_beige']).map(t => t.name)).toEqual(['a', 'a__warm_beige']);
    const adhoc = selectTargets(matrix, ['zzz:warm_beige']);
    expect(adhoc).toEqual([{ name: 'zzz__warm_beige', golden: 'zzz', skin: 'warm_beige', group: 'skin' }]);
  });
});

describe('visual-gate: fingerprint', () => {
  it('identical -> match', () => {
    expect(compareFingerprints(fp(), fp())).toEqual({ match: true, diffs: [] });
  });
  it('renderer/os/width/pdfEngine changes are listed', () => {
    const r = compareFingerprints(fp(), fp({ renderer: 'LibreOffice 25.2.0.1', os: 'linux', width: 800, pdfEngine: 'PyMuPDF 1.27' }));
    expect(r.match).toBe(false);
    expect(r.diffs.join('|')).toMatch(/renderer: .*25\.2/);
    expect(r.diffs.join('|')).toMatch(/os: win32 -> linux/);
    expect(r.diffs.join('|')).toMatch(/width: 960 -> 800/);
    expect(r.diffs.join('|')).toMatch(/pdfEngine/);
  });
  it('font substitution is reported (removed + added), order-insensitive', () => {
    expect(compareFingerprints(fp({ fonts: ['A', 'B'] }), fp({ fonts: ['B', 'A'] })).match).toBe(true);
    const r = compareFingerprints(fp({ fonts: ['MalgunGothic'] }), fp({ fonts: ['NotoSansCJKkr-Regular'] }));
    expect(r.diffs[0]).toContain('-[MalgunGothic]');
    expect(r.diffs[0]).toContain('+[NotoSansCJKkr-Regular]');
  });
  it('baseline without fingerprint -> single warning, not a crash', () => {
    expect(compareFingerprints(null, fp()).diffs).toHaveLength(1);
  });
});

describe('visual-gate: evaluateDeck', () => {
  const base = (over: Partial<Parameters<typeof evaluateDeck>[0]> = {}) => evaluateDeck({
    name: 'deck', baselineSlides: [1, 2, 3], currentSlides: [1, 2, 3],
    measures: { 1: m(0), 2: m(0.001), 3: m(0.005) }, baselineFingerprint: fp(), currentFingerprint: fp(), ...over,
  });

  it('all slides within threshold -> PASS, maxRatio tracked', () => {
    const v = base();
    expect(v.status).toBe('PASS');
    expect(v.changed).toEqual([]);
    expect(v.maxRatio).toBe(0.005);
    expect(v.threshold).toBe(DEFAULT_SLIDE_THRESHOLD);
    expect(v.fingerprintWarnings).toEqual([]);
  });

  it('threshold is exclusive: ratio == threshold passes, > threshold changes', () => {
    expect(base({ threshold: 0.02, measures: { 1: m(0), 2: m(0.02), 3: m(0) } }).status).toBe('PASS');
    const v = base({ threshold: 0.02, measures: { 1: m(0), 2: m(0.0201), 3: m(0) } });
    expect(v.status).toBe('CHANGED');
    expect(v.changed).toEqual([2]);
  });

  it('changed slides list with ratio, bbox and diff path', () => {
    const v = base({ measures: { 1: m(0.2, { bbox: { x: 1, y: 2, w: 3, h: 4 }, diffPath: 'out/d/slide-01.png' }), 2: m(0), 3: m(0.5, { diffPath: 'out/d/slide-03.png' }) } });
    expect(v.status).toBe('CHANGED');
    expect(v.changed).toEqual([1, 3]);
    const lines = formatDeckReport(v);
    expect(lines[0]).toMatch(/^CHANGED\s+deck/);
    expect(lines.join('\n')).toMatch(/slide 01\s+ratio=20\.00%.*bbox=1,2 3x4.*diff=out\/d\/slide-01\.png/);
    expect(lines.join('\n')).toMatch(/slide 03\s+ratio=50\.00%.*diff=out\/d\/slide-03\.png/);
    expect(changedSlideList(v)).toBe('01,03');
  });

  it('missing slide (in baseline, not rendered) and extra slide (rendered, not in baseline) -> CHANGED', () => {
    const v = base({ baselineSlides: [1, 2, 3], currentSlides: [1, 2, 4], measures: { 1: m(0), 2: m(0) } });
    expect(v.status).toBe('CHANGED');
    expect(v.missing).toEqual([3]);
    expect(v.extra).toEqual([4]);
    expect(v.changed).toEqual([]);
    expect(v.slides.map(s => `${s.slide}:${s.status}`)).toEqual(['1:ok', '2:ok', '3:missing', '4:extra']);
    expect(v.baselineSlideCount).toBe(3);
    expect(v.currentSlideCount).toBe(3);
    const text = formatDeckReport(v).join('\n');
    expect(text).toMatch(/slide 03\s+MISSING/);
    expect(text).toMatch(/slide 04\s+EXTRA/);
    expect(changedSlideList(v)).toBe('03,04');
  });

  it('deck got longer: trailing extra slides are not silently accepted', () => {
    const v = base({ currentSlides: [1, 2, 3, 4, 5], measures: { 1: m(0), 2: m(0), 3: m(0) } });
    expect(v.extra).toEqual([4, 5]);
    expect(v.status).toBe('CHANGED');
  });

  it('no baseline (null or empty) -> NO_BASELINE with approve hint', () => {
    for (const b of [null, undefined, []]) {
      const v = base({ baselineSlides: b as number[] | null | undefined, measures: {} });
      expect(v.status).toBe('NO_BASELINE');
      expect(v.slides).toEqual([]);
      expect(formatDeckReport(v)[0]).toContain('npm run visual:approve -- deck');
    }
    expect(formatDeckReport(base({ name: 'g__warm_beige', baselineSlides: null, measures: {} }))[0]).toContain('visual:approve -- g:warm_beige');
  });

  it('fingerprint mismatch only warns: PASS stays PASS, CHANGED stays CHANGED, exit code unaffected', () => {
    const warn = fp({ fonts: ['NotoSansCJKkr-Regular'] });
    const pass = base({ currentFingerprint: warn });
    expect(pass.status).toBe('PASS');
    expect(pass.fingerprintWarnings.length).toBeGreaterThan(0);
    expect(formatDeckReport(pass).join('\n')).toMatch(/WARN environment fingerprint differs/);
    expect(gateExitCode([pass])).toBe(0);
    const changed = base({ currentFingerprint: warn, measures: { 1: m(0.9), 2: m(0), 3: m(0) } });
    expect(changed.status).toBe('CHANGED');
    expect(changed.fingerprintWarnings.length).toBeGreaterThan(0);
    expect(gateExitCode([changed])).toBe(1);
  });

  it('missing diff measure for a slide present in both sets is a programming error', () => {
    expect(() => base({ measures: { 1: m(0), 2: m(0) } })).toThrow(/no diff measure for slide 3/);
  });

  it('unsorted / duplicate input slide numbers are normalised', () => {
    const v = base({ baselineSlides: [3, 1, 2, 2], currentSlides: [2, 3, 1], measures: { 1: m(0), 2: m(0), 3: m(0) } });
    expect(v.slides.map(s => s.slide)).toEqual([1, 2, 3]);
    expect(v.status).toBe('PASS');
  });
});

describe('visual-gate: summary / exit code', () => {
  const mk = (status: 'PASS' | 'CHANGED' | 'NO_BASELINE', name = status) => {
    if (status === 'PASS') return evaluateDeck({ name, baselineSlides: [1], currentSlides: [1], measures: { 1: m(0) }, baselineFingerprint: fp(), currentFingerprint: fp() });
    if (status === 'CHANGED') return evaluateDeck({ name, baselineSlides: [1], currentSlides: [1], measures: { 1: m(0.5) }, baselineFingerprint: fp(), currentFingerprint: fp() });
    return evaluateDeck({ name, baselineSlides: null, currentSlides: [1], measures: {}, currentFingerprint: fp() });
  };

  it('counts and exit codes', () => {
    const vs = [mk('PASS'), mk('CHANGED'), mk('NO_BASELINE')];
    expect(summarizeGate(vs)).toEqual({ total: 3, pass: 1, changed: 1, noBaseline: 1, changedSlides: 1 });
    expect(gateExitCode([mk('PASS')])).toBe(0);
    expect(gateExitCode([mk('PASS'), mk('CHANGED')])).toBe(1);
    expect(gateExitCode([mk('PASS'), mk('NO_BASELINE')])).toBe(1);
    expect(gateExitCode([mk('PASS'), mk('NO_BASELINE')], { allowMissingBaseline: true })).toBe(0);
    expect(gateExitCode([mk('CHANGED'), mk('NO_BASELINE')], { allowMissingBaseline: true })).toBe(1);
  });

  it('formatGateSummary lists stale dirs/manifests and a final VISUAL_GATE line', () => {
    const lines = formatGateSummary([mk('PASS')], { orphans: ['old-golden'], integrity: ['x: manifest lists slide 2 but slide-02.png is missing'] });
    expect(lines[0]).toContain('old-golden');
    expect(lines[1]).toContain('STALE baseline manifest');
    expect(lines[lines.length - 1]).toBe('VISUAL_GATE decks=1 pass=1 changed=0 no_baseline=0 changed_slides=0');
  });
});

describe('visual-gate: stale baselines', () => {
  it('findOrphanBaselines: dirs that can no longer be rendered', () => {
    expect(findOrphanBaselines(['a', 'b', 'gone', 'a__gone_skin'], ['a', 'b', 'a__warm_beige'])).toEqual(['a__gone_skin', 'gone']);
    expect(findOrphanBaselines([], ['a'])).toEqual([]);
  });
  it('checkManifestIntegrity: manifest vs files on disk', () => {
    expect(checkManifestIntegrity([1, 2], [1, 2])).toEqual([]);
    const p = checkManifestIntegrity([1, 2, 3], [1, 3, 4]);
    expect(p).toEqual(['manifest lists slide 2 but slide-02.png is missing', 'slide-04.png exists but is not in manifest']);
  });
  it('slide file names', () => {
    expect(slideFileName(3)).toBe('slide-03.png');
    expect(slideFileName(12)).toBe('slide-12.png');
    expect(parseSlideFileName('slide-07.png')).toBe(7);
    expect(parseSlideFileName('manifest.json')).toBeNull();
    expect(parseSlideFileName('slide-07.diff.png')).toBeNull();
  });
});
