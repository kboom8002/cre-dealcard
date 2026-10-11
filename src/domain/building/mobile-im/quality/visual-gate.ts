/**
 * @file visual-gate.ts
 * @description Basic IM 슬라이드 이미지 승인 게이트(visual:check / visual:approve)의 순수 로직.
 *
 * I/O 없음 (fs / sharp / soffice 호출은 scripts/visual-regression-gate.ts 담당). 여기서는
 *  - 덱 매트릭스(코어 골든 + income 골든 + 대표 골든 x 스킨) 구성 / 타깃 스펙 파싱
 *  - 렌더 환경 지문(fingerprint) 비교 -> 불일치는 FAIL 이 아니라 WARN
 *  - 슬라이드별 판정 (ok / changed / missing / extra) + 덱 판정 (PASS / CHANGED / NO_BASELINE)
 *  - stale 기준선(더 이상 매트릭스에 없는 폴더, 매니페스트-파일 불일치) 탐지
 *  - 리포트 문자열 / 종료 코드
 * 를 담당한다. layout-gate.mjs(승인 목록 + stale 탐지 + 스킨 변형 상속)의 이미지 버전.
 */

/** 스킨 미지정(기본) 프리셋. 기본 골든 덱과 동일한 렌더이므로 기본 골든의 기준선을 상속한다. */
export const BASE_SKIN = 'credeal_basic';

/** 슬라이드별 허용 diff 비율 (0.02 = 2%). diffImages 의 channelTolerance 와 함께 쓰인다. */
export const DEFAULT_SLIDE_THRESHOLD = 0.02;
/** 채널별 허용 오차 (안티앨리어싱/서브픽셀 흡수). */
export const DEFAULT_CHANNEL_TOLERANCE = 24;
/** 기준선/현재 PNG 폭(px). 16:9 -> 960x540. */
export const DEFAULT_RENDER_WIDTH = 960;
/** 스킨 변형을 검증할 대표 골든 3종 (income x2 + owner). */
export const DEFAULT_SKIN_GOLDENS = ['income-yangpyeong-r3', 'income-dangsan-r3', 'owner-seocho-r3'] as const;

export interface DeckTarget {
  /** 기준선 폴더명 (스킨이면 `<golden>__<skin>`) */
  name: string;
  golden: string;
  /** null = 기본 프리셋(credeal_basic) */
  skin: string | null;
  group: 'core' | 'income' | 'skin';
}

export function deckName(golden: string, skin: string | null | undefined): string {
  return skin && skin !== BASE_SKIN ? `${golden}__${skin}` : golden;
}

/** `<golden>[:<skin>]` -> 골든/스킨. credeal_basic 은 기본 골든으로 접힌다 (기준선 상속). */
export function parseTargetSpec(spec: string): { golden: string; skin: string | null } {
  const s = spec.trim();
  if (!s) throw new Error('empty target spec');
  const idx = s.indexOf(':');
  if (idx < 0) return { golden: s, skin: null };
  const golden = s.slice(0, idx).trim();
  const skin = s.slice(idx + 1).trim();
  if (!golden || !skin) throw new Error(`invalid target spec "${spec}" (expected <golden>[:<skin>])`);
  return { golden, skin: skin === BASE_SKIN ? null : skin };
}

export interface MatrixInput {
  coreNames: readonly string[];
  incomeNames: readonly string[];
  skinGoldens: readonly string[];
  /** 전체 스킨 ID (BASIC_SKIN_IDS). BASE_SKIN 은 기본 골든과 같은 덱이라 제외된다. */
  skins: readonly string[];
}

/** 전체 덱 매트릭스: 코어 + income + (대표 골든 x 비기본 스킨). 이름 중복 없음. */
export function buildDeckMatrix(m: MatrixInput): DeckTarget[] {
  const out: DeckTarget[] = [];
  const seen = new Set<string>();
  const push = (t: DeckTarget) => { if (!seen.has(t.name)) { seen.add(t.name); out.push(t); } };
  for (const g of m.coreNames) push({ name: g, golden: g, skin: null, group: 'core' });
  for (const g of m.incomeNames) push({ name: g, golden: g, skin: null, group: 'income' });
  for (const g of m.skinGoldens) {
    for (const s of m.skins) {
      if (s === BASE_SKIN) continue;
      push({ name: deckName(g, s), golden: g, skin: s, group: 'skin' });
    }
  }
  return out;
}

/**
 * 스코프/스펙 선택. 스코프: all | core | income | skins. 그 외는 `<golden>[:<skin>]` 스펙.
 * 매트릭스에 없는 스펙(예: 비대표 골든 x 스킨)도 허용한다 (사용자가 명시한 임의 덱).
 */
export function selectTargets(matrix: readonly DeckTarget[], args: readonly string[]): DeckTarget[] {
  if (args.length === 0) return [...matrix];
  const out: DeckTarget[] = [];
  const seen = new Set<string>();
  const push = (t: DeckTarget) => { if (!seen.has(t.name)) { seen.add(t.name); out.push(t); } };
  for (const a of args) {
    if (a === 'all') matrix.forEach(push);
    else if (a === 'core') matrix.filter(t => t.group === 'core').forEach(push);
    else if (a === 'income') matrix.filter(t => t.group === 'income').forEach(push);
    else if (a === 'skins') matrix.filter(t => t.group === 'skin').forEach(push);
    else {
      const { golden, skin } = parseTargetSpec(a);
      const name = deckName(golden, skin);
      const hit = matrix.find(t => t.name === name);
      push(hit ?? { name, golden, skin, group: skin ? 'skin' : 'core' });
    }
  }
  return out;
}

// --- 환경 지문 --------------------------------------------------------------

export interface RenderFingerprint {
  renderer: string;          // e.g. "LibreOffice 24.8.3.2"
  pdfEngine: string;         // e.g. "PyMuPDF 1.26.1"
  os: string;                // e.g. "win32"
  width: number;             // 렌더 폭(px)
  /** PDF 에 실제 임베드된 폰트 패밀리 (서브셋 접두사 제거, 정렬). 폰트 대체/누락 감지용 */
  fonts: string[];
}

export interface FingerprintComparison {
  match: boolean;
  /** 사람이 읽을 불일치 설명 (WARN 용). match=true 면 빈 배열 */
  diffs: string[];
}

/** 기준선 지문이 없으면(구버전/수동 복사) 불일치가 아니라 정보 부족 -> 경고 1건. */
export function compareFingerprints(base: RenderFingerprint | null | undefined, cur: RenderFingerprint): FingerprintComparison {
  if (!base) return { match: false, diffs: ['baseline has no fingerprint (re-approve to record one)'] };
  const diffs: string[] = [];
  if (base.renderer !== cur.renderer) diffs.push(`renderer: ${base.renderer} -> ${cur.renderer}`);
  if (base.pdfEngine !== cur.pdfEngine) diffs.push(`pdfEngine: ${base.pdfEngine} -> ${cur.pdfEngine}`);
  if (base.os !== cur.os) diffs.push(`os: ${base.os} -> ${cur.os}`);
  if (base.width !== cur.width) diffs.push(`width: ${base.width} -> ${cur.width}`);
  const bf = new Set(base.fonts), cf = new Set(cur.fonts);
  const removed = [...bf].filter(f => !cf.has(f)).sort();
  const added = [...cf].filter(f => !bf.has(f)).sort();
  if (removed.length || added.length) {
    diffs.push(`fonts: ${removed.length ? `-[${removed.join(', ')}] ` : ''}${added.length ? `+[${added.join(', ')}]` : ''}`.trim());
  }
  return { match: diffs.length === 0, diffs };
}

// --- 슬라이드 / 덱 판정 ------------------------------------------------------

export interface SlideDiffMeasure {
  diffRatio: number;
  bbox?: { x: number; y: number; w: number; h: number } | null;
  /** changed 슬라이드의 좌우 비교(기준|현재|diff) PNG 경로 */
  diffPath?: string;
}

export type SlideStatus = 'ok' | 'changed' | 'missing' | 'extra';

export interface SlideVerdict {
  slide: number;
  status: SlideStatus;
  /** missing/extra 는 null */
  diffRatio: number | null;
  bbox?: SlideDiffMeasure['bbox'];
  diffPath?: string;
}

export type DeckStatus = 'PASS' | 'CHANGED' | 'NO_BASELINE';

export interface DeckVerdict {
  name: string;
  status: DeckStatus;
  slides: SlideVerdict[];
  changed: number[];
  /** 기준선에는 있으나 현재 렌더에 없는 슬라이드 */
  missing: number[];
  /** 현재 렌더에만 있는 슬라이드 */
  extra: number[];
  maxRatio: number;
  threshold: number;
  fingerprintWarnings: string[];
  baselineSlideCount: number;
  currentSlideCount: number;
}

export interface EvaluateDeckInput {
  name: string;
  /** 기준선 슬라이드 번호들. null/빈 배열 = 기준선 없음 */
  baselineSlides: readonly number[] | null | undefined;
  currentSlides: readonly number[];
  /** 양쪽에 모두 있는 슬라이드의 diff 측정치 (슬라이드 번호 -> 측정) */
  measures: Readonly<Record<number, SlideDiffMeasure>>;
  threshold?: number;
  baselineFingerprint?: RenderFingerprint | null;
  currentFingerprint: RenderFingerprint;
}

const uniqSorted = (xs: readonly number[]) => [...new Set(xs)].sort((a, b) => a - b);

export function evaluateDeck(input: EvaluateDeckInput): DeckVerdict {
  const threshold = input.threshold ?? DEFAULT_SLIDE_THRESHOLD;
  const cur = uniqSorted(input.currentSlides);
  const base = uniqSorted(input.baselineSlides ?? []);
  const common = {
    name: input.name, threshold, baselineSlideCount: base.length, currentSlideCount: cur.length,
    fingerprintWarnings: [] as string[],
  };
  if (base.length === 0) {
    return { ...common, status: 'NO_BASELINE', slides: [], changed: [], missing: [], extra: [], maxRatio: 0 };
  }

  const baseSet = new Set(base), curSet = new Set(cur);
  const slides: SlideVerdict[] = [];
  let maxRatio = 0;
  for (const n of uniqSorted([...base, ...cur])) {
    if (!curSet.has(n)) { slides.push({ slide: n, status: 'missing', diffRatio: null }); continue; }
    if (!baseSet.has(n)) { slides.push({ slide: n, status: 'extra', diffRatio: null }); continue; }
    const m = input.measures[n];
    if (!m) throw new Error(`evaluateDeck(${input.name}): no diff measure for slide ${n} present in both sets`);
    if (m.diffRatio > maxRatio) maxRatio = m.diffRatio;
    slides.push({
      slide: n, status: m.diffRatio > threshold ? 'changed' : 'ok',
      diffRatio: m.diffRatio, bbox: m.bbox ?? null, diffPath: m.diffPath,
    });
  }
  const changed = slides.filter(s => s.status === 'changed').map(s => s.slide);
  const missing = slides.filter(s => s.status === 'missing').map(s => s.slide);
  const extra = slides.filter(s => s.status === 'extra').map(s => s.slide);
  const fp = compareFingerprints(input.baselineFingerprint, input.currentFingerprint);
  return {
    ...common,
    status: changed.length || missing.length || extra.length ? 'CHANGED' : 'PASS',
    slides, changed, missing, extra, maxRatio,
    fingerprintWarnings: fp.diffs,
  };
}

// --- stale 탐지 --------------------------------------------------------------

/** 기준선 폴더 중 더 이상 기대 덱 이름에 없는 것 (골든 삭제/스킨 제거/이름 변경). */
export function findOrphanBaselines(existingDirs: readonly string[], expectedNames: readonly string[]): string[] {
  const exp = new Set(expectedNames);
  return existingDirs.filter(d => !exp.has(d)).sort();
}

/** 매니페스트의 슬라이드 목록과 디스크의 slide-NN.png 목록 불일치 (부분 복사/수동 편집). */
export function checkManifestIntegrity(manifestSlides: readonly number[], filesOnDisk: readonly number[]): string[] {
  const m = new Set(manifestSlides), d = new Set(filesOnDisk);
  const problems: string[] = [];
  for (const n of uniqSorted(manifestSlides)) if (!d.has(n)) problems.push(`manifest lists slide ${n} but ${slideFileName(n)} is missing`);
  for (const n of uniqSorted(filesOnDisk)) if (!m.has(n)) problems.push(`${slideFileName(n)} exists but is not in manifest`);
  return problems;
}

export function slideFileName(n: number): string {
  return `slide-${String(n).padStart(2, '0')}.png`;
}

/** `slide-NN.png` -> NN (아니면 null) */
export function parseSlideFileName(f: string): number | null {
  const m = /^slide-(\d+)\.png$/.exec(f);
  return m ? parseInt(m[1], 10) : null;
}

// --- 리포트 -------------------------------------------------------------------

const pct = (r: number) => `${(r * 100).toFixed(2)}%`;
const list = (xs: readonly number[]) => xs.map(n => String(n).padStart(2, '0')).join(',');

/** 덱 1건 -> 콘솔 라인들 (첫 줄이 요약, 이후는 changed/missing/extra 상세 + 경고). */
export function formatDeckReport(v: DeckVerdict): string[] {
  const lines: string[] = [];
  if (v.status === 'NO_BASELINE') {
    lines.push(`NO_BASELINE  ${v.name}  (${v.currentSlideCount} slides; approve with: npm run visual:approve -- ${approveSpecOf(v.name)})`);
  } else if (v.status === 'PASS') {
    lines.push(`PASS         ${v.name}  (${v.currentSlideCount} slides, max diff ${pct(v.maxRatio)} <= ${pct(v.threshold)})`);
  } else {
    lines.push(`CHANGED      ${v.name}  (changed ${v.changed.length}, missing ${v.missing.length}, extra ${v.extra.length}; baseline ${v.baselineSlideCount} -> current ${v.currentSlideCount} slides)`);
    for (const s of v.slides) {
      if (s.status === 'changed') {
        const box = s.bbox ? ` bbox=${s.bbox.x},${s.bbox.y} ${s.bbox.w}x${s.bbox.h}` : '';
        lines.push(`  slide ${String(s.slide).padStart(2, '0')}  ratio=${pct(s.diffRatio ?? 0)} > ${pct(v.threshold)}${box}  diff=${s.diffPath ?? '(none)'}`);
      } else if (s.status === 'missing') lines.push(`  slide ${String(s.slide).padStart(2, '0')}  MISSING in current render (baseline has it)`);
      else if (s.status === 'extra') lines.push(`  slide ${String(s.slide).padStart(2, '0')}  EXTRA in current render (not in baseline)`);
    }
  }
  if (v.fingerprintWarnings.length) {
    lines.push(`  WARN environment fingerprint differs from baseline (results may be font/renderer noise, not a regression):`);
    for (const w of v.fingerprintWarnings) lines.push(`    - ${w}`);
  }
  return lines;
}

/** `<golden>__<skin>` -> `<golden>:<skin>` (approve 스펙) */
export function approveSpecOf(name: string): string {
  const i = name.indexOf('__');
  return i < 0 ? name : `${name.slice(0, i)}:${name.slice(i + 2)}`;
}

export interface GateSummary {
  total: number; pass: number; changed: number; noBaseline: number;
  /** 변경된 슬라이드(덱 합) */
  changedSlides: number;
}

export function summarizeGate(vs: readonly DeckVerdict[]): GateSummary {
  return {
    total: vs.length,
    pass: vs.filter(v => v.status === 'PASS').length,
    changed: vs.filter(v => v.status === 'CHANGED').length,
    noBaseline: vs.filter(v => v.status === 'NO_BASELINE').length,
    changedSlides: vs.reduce((a, v) => a + v.changed.length + v.missing.length + v.extra.length, 0),
  };
}

/**
 * 종료 코드: CHANGED 있으면 1. 기준선 없는 덱은 기본적으로 1 (미승인 = 게이트 미통과), allowMissingBaseline 이면 통과.
 * 지문 불일치 / stale 은 종료 코드에 영향을 주지 않는다 (경고).
 */
export function gateExitCode(vs: readonly DeckVerdict[], opts: { allowMissingBaseline?: boolean } = {}): 0 | 1 {
  const s = summarizeGate(vs);
  if (s.changed > 0) return 1;
  if (s.noBaseline > 0 && !opts.allowMissingBaseline) return 1;
  return 0;
}

export function formatGateSummary(vs: readonly DeckVerdict[], extra: { orphans?: readonly string[]; integrity?: readonly string[] } = {}): string[] {
  const s = summarizeGate(vs);
  const lines: string[] = [];
  for (const o of extra.orphans ?? []) lines.push(`STALE baseline dir (no longer in deck matrix): ${o} -> delete or re-approve`);
  for (const p of extra.integrity ?? []) lines.push(`STALE baseline manifest: ${p}`);
  lines.push(`VISUAL_GATE decks=${s.total} pass=${s.pass} changed=${s.changed} no_baseline=${s.noBaseline} changed_slides=${s.changedSlides}`);
  return lines;
}

/** 변경 슬라이드 번호 목록(예: "03,07") — 리포트/테스트 편의 */
export function changedSlideList(v: DeckVerdict): string {
  return list([...v.changed, ...v.missing, ...v.extra].sort((a, b) => a - b));
}
