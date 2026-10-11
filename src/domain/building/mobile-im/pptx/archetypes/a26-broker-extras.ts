/**
 * @file a26-broker-extras.ts
 * @description A26 — 중개인 제공 추가 정보 면 (Basic IM 선택 면 3종: 투자 포인트·제안 / 규제·계획 / 인근 시세 비교)
 *
 * 왜 신규 아키타입인가 (A04 재사용 불가 사유)
 *  - A04 좌측은 '라벨-값' 한 줄 행(L.rows)이라 최대 60~100자 서술 원문을 말줄임 없이 담을 수 없고(D7),
 *    우측은 사진/자산 하이라이트 폴백(일반론 문구)이 끼어든다 (Rule 34).
 *  - A24 표 빌더는 렌트롤 10열 전용이다. 시세 비교는 5열 표 + 요약 카드(결정론 통계) + 산식 각주가 필요하다.
 *  → 3개 모드(points | regulation | comps)를 하나의 아키타입으로 묶고, 데이터는 broker-extras-slides.ts 가 만든다.
 *  → 4번째 모드 'eviction' = Pro·개발형 명도 분석(추정). 데이터는 binder/pro-eviction.ts (원천 analyzeEviction). 중개인 입력이 아니므로 출처 칩 없음.
 *
 * 규칙: 문자열은 원문 그대로(재작성·요약 금지), 출처 칩 '● 중개인입력' + '중개인 제공 · 미검증' 표기 (eviction 모드 제외).
 */
import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR } from '../imlib';
import type { ProvenanceKind } from '../imlib';
import type { RegulationCard } from '../broker-extras-slides';

export interface ArchetypeInput {
  pres: PptxGenJS;
  slideNum: number;
  docno: string;
  watermarkText?: string;
  data: Record<string, any>;
  grade: 'A' | 'B' | 'C';
  provenance: Record<string, ProvenanceKind>;
}

export interface ArchetypeOutput {
  slide: ReturnType<PptxGenJS['addSlide']>;
  warnings: string[];
  suppress?: boolean;
}

type Slide = ReturnType<PptxGenJS['addSlide']>;

const TOP = 1.62;          // 본문 시작 (제목 영역 아래)
const BODY_BOTTOM = 6.30;  // 출처 칩(6.45) 위
const CHIP_Y = 6.45;

/** 출처 칩 + 미검증 태그 (모든 모드 공통 하단 표기) */
function addSourceFooter(slide: Slide, data: Record<string, any>): void {
  L.chip(slide, M, CHIP_Y, 'broker');
  slide.addText(String(data.unverifiedTag || '중개인 제공 · 미검증'), {
    x: M + 1.12, y: CHIP_Y, w: 4.0, h: 0.21,
    fontFace: KR, fontSize: 9, color: C.mute2, valign: 'middle', margin: 0,
  });
}

/** 고정 폰트에서 텍스트가 차지하는 높이(인치) — 줄바꿈 시뮬레이션 기반 */
function textHeight(text: string, widthIn: number, fontPt: number): number {
  if (!text) return 0;
  const fit = L.fitTextToBox(text, widthIn, 99, { minFontSize: fontPt, maxFontSize: fontPt, allowTruncate: false, lineSpacingMultiple: 1.2 });
  return fit.requiredHeight;
}

// ── 모드 1: 투자 포인트·제안 ──────────────────────────────────────
function renderPoints(slide: Slide, data: Record<string, any>): void {
  const points: string[] = Array.isArray(data.points) ? data.points : [];
  const closing = String(data.closingLine || '').trim();
  const lw = closing ? 7.5 : CW;
  const gap = 0.393;
  const rx = M + lw + gap;
  const rw = CW - lw - gap;

  L.sub(slide, M, 1.50, lw, '투자 포인트');

  const y0 = 1.90;
  const avail = BODY_BOTTOM - y0;
  const n = Math.max(1, points.length);
  const rowH = Math.min(0.88, avail / n);
  const numD = 0.36;
  const textX = M + numD + 0.22;
  const textW = lw - numD - 0.30;

  points.forEach((p, i) => {
    const y = y0 + i * rowH;
    slide.addShape('ellipse', { x: M, y: y + (rowH - numD) / 2 - 0.02, w: numD, h: numD, fill: { color: C.brass }, line: { color: C.brass, width: 0 } });
    slide.addText(String(i + 1), {
      x: M, y: y + (rowH - numD) / 2 - 0.02, w: numD, h: numD,
      fontFace: KR, fontSize: 12, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0,
    });
    const fit = L.fitTextToBox(p, textW, rowH - 0.12, { minFontSize: 10.5, maxFontSize: 15, allowTruncate: false, lineSpacingMultiple: 1.2 });
    slide.addText(p, {
      x: textX, y, w: textW, h: rowH - 0.04,
      fontFace: KR, fontSize: fit.fontSize, color: C.ink, valign: 'middle', margin: 0,
    });
    if (i < points.length - 1) {
      slide.addShape('line', { x: M, y: y + rowH - 0.02, w: lw, h: 0, line: { color: C.line, width: 0.5 } });
    }
  });

  if (closing) {
    slide.addShape('line', { x: M + lw + gap / 2, y: 1.50, w: 0, h: BODY_BOTTOM - 1.50, line: { color: C.brass, width: 0.7 } });
    const boxH = Math.min(3.2, avail);
    slide.addShape('roundRect', { x: rx, y: y0, w: rw, h: boxH, rectRadius: 0.05, fill: { color: C.brassT }, line: { color: C.brassS, width: 0.75 } });
    slide.addShape('rect', { x: rx, y: y0 + 0.10, w: 0.05, h: boxH - 0.20, fill: { color: C.brass }, line: { color: C.brass, width: 0 } });
    slide.addText('마무리 제안', {
      x: rx + 0.22, y: y0 + 0.16, w: rw - 0.40, h: 0.26,
      fontFace: KR, fontSize: 11, bold: true, color: C.brassD || '8A6A1F', margin: 0, valign: 'middle',
    });
    const fit = L.fitTextToBox(closing, rw - 0.50, boxH - 0.80, { minFontSize: 12, maxFontSize: 20, allowTruncate: false, lineSpacingMultiple: 1.25 });
    slide.addText(closing, {
      x: rx + 0.22, y: y0 + 0.55, w: rw - 0.44, h: boxH - 0.75,
      fontFace: KR, fontSize: fit.fontSize, bold: true, color: C.ink, valign: 'top', margin: 0, lineSpacingMultiple: 1.2,
    });
  }
}

// ── 모드 2: 규제·계획 (적응형 카드 그리드, 개발행위허가제한 = 경고색) ─────────────────
// 노트 수·글자 수에 따라 본문 폰트를 [REG_FONT_FLOOR, REG_FONT_MAX_*] 안에서 키우고, 남는 높이는 카드 높이로
// 분배한다. 폰트 11pt 이상으로 들어가면 '규제·계획 항목' 요약 스트립(종류별 건수)을 얹는다 — 건수는 제공된 노트에서만 센다.
// 너무 빽빽하면 스트립을 생략하고 폰트 하한(9.5pt)까지 줄여 카드 넘침을 막는다.

const REG_FONT_MAX_SINGLE = 20;  // 노트 1건: 한 장을 채우도록 크게
const REG_FONT_MAX_MULTI = 17;
const REG_FONT_FLOOR = 9.5;      // 노트가 매우 많거나 길 때의 절대 하한
const REG_FONT_COMFORT = 11;     // 요약 스트립을 유지하는 조건(이 폰트 이상으로 들어갈 때만)
const REG_CARD_MIN_H = 1.0;
const REG_GAP = 0.25;
const REG_STRIP_H = 0.72;
const REG_STRIP_GAP = 0.22;

export interface RegulationFonts { detail: number; line: number; head: number }

/** 본문 폰트 기준 → 근거/제한행위/기한 줄·제목 폰트 (비례) */
export function regulationFonts(detail: number): RegulationFonts {
  return {
    detail,
    line: Math.min(16, Math.max(9, detail - 1.5)),
    head: Math.min(17, Math.max(10.5, detail + 1.5)),
  };
}

export interface RegulationSummaryItem { kind: string; label: string; count: number; tone: 'warn' | 'info' }
export interface RegulationSummary { total: number; items: RegulationSummaryItem[] }

/** 요약 스트립 데이터: 카드(=제공된 노트) 종류별 건수. 노트에 없는 값은 만들지 않는다. */
export function summarizeRegulationCards(cards: readonly RegulationCard[]): RegulationSummary {
  const items: RegulationSummaryItem[] = [];
  for (const c of cards) {
    const hit = items.find(i => i.kind === c.kind);
    if (hit) hit.count += 1;
    else items.push({ kind: c.kind, label: c.kindLabel, count: 1, tone: c.tone });
  }
  return { total: cards.length, items };
}

function cardNeed(card: RegulationCard, w: number, f: RegulationFonts): number {
  const innerW = w - 0.40;
  const headH = Math.max(0.28, (f.head * 1.45) / 72);
  let h = 0.12 + headH + 0.06; // 상단 패딩 + 제목줄 + 제목-본문 간격
  h += textHeight(card.detail, innerW, f.detail);
  card.lines.forEach((ln, i) => {
    h += textHeight(`${ln.label} · ${ln.value}`, innerW, f.line) + (i === 0 ? 0.09 : 0.04);
  });
  return h + 0.14;
}

/**
 * 가용 높이 안에 들어가는 가장 큰 폰트(≥ minFont)와 행별 필요 높이를 고른다.
 * minFont 에서도 안 들어가면 fits=false 로 minFont 기준 계획을 돌려준다(호출측이 스트립 생략 등 대안 선택).
 */
function planRegulation(
  cards: RegulationCard[], cols: number, cw: number, availH: number, minFont: number,
): { fonts: RegulationFonts; needs: number[]; fits: boolean } {
  const rows = Math.ceil(cards.length / cols);
  const fontMax = cards.length === 1 ? REG_FONT_MAX_SINGLE : REG_FONT_MAX_MULTI;
  const needsFor = (f: RegulationFonts): number[] => {
    const out: number[] = [];
    for (let r = 0; r < rows; r++) {
      const rowCards = cards.slice(r * cols, r * cols + cols);
      out.push(Math.max(REG_CARD_MIN_H, ...rowCards.map(c => cardNeed(c, cw, f))));
    }
    return out;
  };
  for (let d = fontMax; d >= minFont; d -= 0.5) {
    const f = regulationFonts(d);
    const nd = needsFor(f);
    if (nd.reduce((a, b) => a + b, 0) <= availH) return { fonts: f, needs: nd, fits: true };
  }
  const fonts = regulationFonts(minFont);
  return { fonts, needs: needsFor(fonts), fits: false };
}

function renderRegulationStrip(slide: Slide, y: number, summary: RegulationSummary): void {
  const tiles: Array<{ label: string; value: string; tone: 'total' | 'warn' | 'info' }> = [
    { label: '규제·계획 항목', value: `${summary.total}건`, tone: 'total' },
    ...summary.items.map(i => ({ label: i.label, value: `${i.count}건`, tone: i.tone })),
  ];
  const gap = 0.18;
  const tw = Math.min(2.6, (CW - gap * (tiles.length - 1)) / tiles.length);
  tiles.forEach((t, i) => {
    const x = M + i * (tw + gap);
    const fill = t.tone === 'warn' ? C.amberL : t.tone === 'total' ? C.brassT : C.blueL;
    const edge = t.tone === 'warn' ? C.amber : t.tone === 'total' ? C.brassS : C.blue;
    const ink = t.tone === 'warn' ? C.amber : t.tone === 'total' ? (C.brassD || '8A6A1F') : C.blue;
    slide.addShape('roundRect', { x, y, w: tw, h: REG_STRIP_H, rectRadius: 0.05, fill: { color: fill }, line: { color: edge, width: 0.75 } });
    const lf = L.fitTextToBox(t.label, tw - 0.28, 0.22, { minFontSize: 9, maxFontSize: 10.5, targetLines: 1, allowTruncate: false });
    slide.addText(t.label, { x: x + 0.14, y: y + 0.07, w: tw - 0.28, h: 0.22, fontFace: KR, fontSize: lf.fontSize, bold: true, color: C.mute2, margin: 0, valign: 'middle' });
    slide.addText(t.value, { x: x + 0.14, y: y + 0.30, w: tw - 0.28, h: 0.34, fontFace: KR, fontSize: 18, bold: true, color: ink, margin: 0, valign: 'middle' });
  });
}

function renderRegulation(slide: Slide, data: Record<string, any>): void {
  const cards: RegulationCard[] = Array.isArray(data.cards) ? data.cards : [];
  const n = cards.length;
  if (n === 0) return;
  const cols = n === 1 ? 1 : 2;
  const rows = Math.ceil(n / cols);
  const cw = (CW - REG_GAP * (cols - 1)) / cols;

  // 1순위: 요약 스트립 + 본문 폰트 ≥ REG_FONT_COMFORT.  안 들어가면 스트립을 생략해 높이를 돌려받고 폰트 하한까지 허용.
  const stripBlock = REG_STRIP_H + REG_STRIP_GAP;
  const availWithStrip = BODY_BOTTOM - (TOP + stripBlock) - REG_GAP * (rows - 1);
  let showStrip = true;
  let plan = planRegulation(cards, cols, cw, availWithStrip, REG_FONT_COMFORT);
  if (!plan.fits) {
    showStrip = false;
    plan = planRegulation(cards, cols, cw, BODY_BOTTOM - TOP - REG_GAP * (rows - 1), REG_FONT_FLOOR);
  }
  const { fonts, needs } = plan;
  let top = TOP;
  if (showStrip) {
    renderRegulationStrip(slide, top, summarizeRegulationCards(cards));
    top += stripBlock;
  }
  const avail = BODY_BOTTOM - top - REG_GAP * (rows - 1);

  // 남는 높이는 행별로 분배(과도하게 늘려 빈 카드가 되는 것을 방지: 노트 1건은 60%, 여러 건은 40%까지)
  const stretchCap = n === 1 ? 0.6 : 0.4;
  const extra = Math.max(0, avail - needs.reduce((a, b) => a + b, 0));
  const heights = needs.map(h => h + Math.min(extra / rows, h * stretchCap));
  // 넘침 방어(최후): 합이 가용 높이를 넘으면 비례 축소
  const sum = heights.reduce((a, b) => a + b, 0);
  const scale = sum > avail ? avail / sum : 1;

  let y = top;
  for (let r = 0; r < rows; r++) {
    const h = heights[r] * scale;
    cards.slice(r * cols, r * cols + cols).forEach((card, ci) => {
      const x = M + ci * (cw + REG_GAP);
      const warn = card.tone === 'warn';
      const bg = warn ? C.amberL : C.blueL;
      const bar = warn ? C.amber : C.blue;
      const headH = Math.max(0.28, (fonts.head * 1.45) / 72);
      slide.addShape('roundRect', { x, y, w: cw, h, rectRadius: 0.06, fill: { color: bg } });
      slide.addShape('rect', { x, y: y + 0.06, w: 0.05, h: h - 0.12, fill: { color: bar }, line: { color: bar, width: 0 } });
      const headText = card.title && card.title !== card.kindLabel ? `${card.kindLabel} · ${card.title}` : card.kindLabel;
      const headFit = L.fitTextToBox(headText, cw - 0.40, headH, { minFontSize: 10, maxFontSize: fonts.head, targetLines: 1, allowTruncate: false });
      slide.addText(headText, {
        x: x + 0.20, y: y + 0.12, w: cw - 0.36, h: headH,
        fontFace: KR, fontSize: headFit.fontSize, bold: true, color: bar, margin: 0, valign: 'middle',
      });
      const runs: Array<{ text: string; options: Record<string, any> }> = [
        { text: card.detail, options: { fontSize: fonts.detail, color: C.ink, breakLine: card.lines.length > 0, margin: 0 } },
      ];
      card.lines.forEach((ln, i) => {
        runs.push({ text: `${ln.label} · `, options: { fontSize: fonts.line, bold: true, color: bar, paraSpaceBefore: i === 0 ? 6 : 2 } });
        runs.push({ text: ln.value, options: { fontSize: fonts.line, color: C.body, breakLine: i < card.lines.length - 1 } });
      });
      const bodyY = y + 0.12 + headH + 0.06;
      slide.addText(runs as any, {
        x: x + 0.20, y: bodyY, w: cw - 0.36, h: Math.max(0.3, y + h - 0.08 - bodyY),
        fontFace: KR, valign: 'top', margin: 0, lineSpacingMultiple: 1.1,
      });
    });
    y += h + REG_GAP;
  }
}

// ── 모드 3: 인근 시세 비교 (표 + 결정론 요약 카드 + 산식 각주) ─────────────────────
function renderComps(slide: Slide, data: Record<string, any>): void {
  const head: string[] = data.tableHead ?? ['구분', '소재지', '가격(억)', '토지평당가(만원)', '비고'];
  const rows: string[][] = Array.isArray(data.tableRows) ? data.tableRows : [];
  // 비고 열이 생략되면(전 행 미기입) 남는 폭은 소재지 열에 준다 — 열 수 = 셀 수 유지 (rule 68)
  const hasNoteCol = head.length >= 5;
  const colW = hasNoteCol
    ? [0.85, 4.10, 1.40, 1.90, CW - (0.85 + 4.10 + 1.40 + 1.90)]
    : [0.85, CW - (0.85 + 1.40 + 1.90), 1.40, 1.90];
  const rh = 0.42;
  const bottom = L.styledTable(slide, M, TOP, CW, head, rows, colW, {
    rh, bfs: 10, hfs: 10, autoPage: false,
    colAlign: hasNoteCol ? ['center', 'left', 'right', 'right', 'left'] : ['center', 'left', 'right', 'right'],
  });

  const cards: Array<{ label: string; value: string; sub: string }> = Array.isArray(data.summaryCards) ? data.summaryCards : [];
  let y = bottom + 0.20;
  if (cards.length > 0) {
    const gap = 0.18;
    const cwid = (CW - gap * (cards.length - 1)) / cards.length;
    const ch = 0.88;
    cards.forEach((c, i) => {
      const x = M + i * (cwid + gap);
      const isGap = c.label === '괴리율';
      slide.addShape('roundRect', {
        x, y, w: cwid, h: ch, rectRadius: 0.05,
        fill: { color: isGap ? C.brassT : 'F3F6F7' },
        line: { color: isGap ? C.brassS : 'E2E8EC', width: 0.75 },
      });
      slide.addText(c.label, { x: x + 0.14, y: y + 0.06, w: cwid - 0.28, h: 0.22, fontFace: KR, fontSize: 10, bold: true, color: C.mute2, margin: 0, valign: 'middle' });
      const vf = L.fitTextToBox(c.value, cwid - 0.28, 0.34, { minFontSize: 12, maxFontSize: 20, targetLines: 1, allowTruncate: false });
      slide.addText(c.value, { x: x + 0.14, y: y + 0.28, w: cwid - 0.28, h: 0.34, fontFace: KR, fontSize: vf.fontSize, bold: true, color: isGap ? (C.brassD || '8A6A1F') : C.ink, margin: 0, valign: 'middle' });
      slide.addText(c.sub, { x: x + 0.14, y: y + 0.62, w: cwid - 0.28, h: 0.20, fontFace: KR, fontSize: 9, color: C.mute2, margin: 0, valign: 'middle' });
    });
    y += ch + 0.12;
  }

  const notes: string[] = Array.isArray(data.footnotes) ? data.footnotes : [];
  notes.forEach((t, i) => {
    slide.addText(t, { x: M, y: y + i * 0.20, w: CW, h: 0.20, fontFace: KR, fontSize: 9, color: C.mute2, margin: 0, valign: 'middle' });
  });
}

// ── 모드 4: 명도 분석 (Pro·개발형 전용 — 데이터는 binder/pro-eviction.ts, 원천 = analyzeEviction) ─────
// 중개인 입력이 아니므로 '중개인 제공 · 미검증' 출처 칩 대신 '추정 · 평가 기준일' 칩을 쓴다.
function renderEviction(slide: Slide, data: Record<string, any>): void {
  const stats: Array<{ label: string; value: string; sub: string }> = Array.isArray(data.statCards) ? data.statCards : [];
  if (stats.length === 0) return;

  // 추정·기준일 칩
  const chipText = String(data.basisLabel || '추정');
  const chipW = Math.min(5.2, 0.5 + chipText.length * 0.13);
  slide.addShape('roundRect', { x: M, y: TOP, w: chipW, h: 0.32, rectRadius: 0.16, fill: { color: C.brassT }, line: { color: C.brassS, width: 0.75 } });
  slide.addText(chipText, {
    x: M + 0.16, y: TOP, w: chipW - 0.32, h: 0.32,
    fontFace: KR, fontSize: 10.5, bold: true, color: C.brassD || '8A6A1F', margin: 0, valign: 'middle',
  });

  // 요약 카드 행
  const cy = TOP + 0.55;
  const ch = 1.62;
  const gap = 0.18;
  const cwid = (CW - gap * (stats.length - 1)) / stats.length;
  stats.forEach((s, i) => {
    const x = M + i * (cwid + gap);
    slide.addShape('roundRect', { x, y: cy, w: cwid, h: ch, rectRadius: 0.05, fill: { color: 'F3F6F7' }, line: { color: 'E2E8EC', width: 0.75 } });
    slide.addText(s.label, {
      x: x + 0.14, y: cy + 0.10, w: cwid - 0.28, h: 0.40,
      fontFace: KR, fontSize: 10, bold: true, color: C.mute2, margin: 0, valign: 'top',
    });
    const vf = L.fitTextToBox(s.value, cwid - 0.28, 0.46, { minFontSize: 11, maxFontSize: 20, targetLines: 1, allowTruncate: false });
    slide.addText(s.value, {
      x: x + 0.14, y: cy + 0.55, w: cwid - 0.28, h: 0.46,
      fontFace: KR, fontSize: vf.fontSize, bold: true, color: C.ink, margin: 0, valign: 'middle',
    });
    slide.addText(s.sub, {
      x: x + 0.14, y: cy + 1.08, w: cwid - 0.28, h: 0.42,
      fontFace: KR, fontSize: 9, color: C.mute2, margin: 0, valign: 'top',
    });
  });

  // 산정 기준·유의사항 (결정론 문구 — 가정 수치는 lease-adapter 와 동일)
  const notes: string[] = Array.isArray(data.assumptions) ? data.assumptions : [];
  if (notes.length > 0) {
    const by = cy + ch + 0.32;
    const lineH = 0.34;
    const boxH = Math.min(BODY_BOTTOM - by, 0.62 + notes.length * lineH);
    slide.addShape('roundRect', { x: M, y: by, w: CW, h: boxH, rectRadius: 0.05, fill: { color: C.amberL }, line: { color: C.amber, width: 0.75 } });
    slide.addShape('rect', { x: M, y: by + 0.08, w: 0.05, h: boxH - 0.16, fill: { color: C.amber }, line: { color: C.amber, width: 0 } });
    slide.addText('산정 기준 및 유의사항', {
      x: M + 0.22, y: by + 0.12, w: CW - 0.44, h: 0.26,
      fontFace: KR, fontSize: 11.5, bold: true, color: C.amber, margin: 0, valign: 'middle',
    });
    notes.forEach((t, i) => {
      const ly = by + 0.46 + i * lineH;
      slide.addShape('rect', { x: M + 0.24, y: ly + lineH / 2 - 0.03, w: 0.06, h: 0.06, fill: { color: C.amber }, line: { color: C.amber, width: 0 } });
      const f = L.fitTextToBox(t, CW - 0.80, lineH, { minFontSize: 9.5, maxFontSize: 11.5, targetLines: 1, allowTruncate: false });
      slide.addText(t, {
        x: M + 0.40, y: ly, w: CW - 0.62, h: lineH,
        fontFace: KR, fontSize: f.fontSize, color: C.ink, margin: 0, valign: 'middle',
      });
    });
  }
}

export function buildA26BrokerExtras(input: ArchetypeInput): ArchetypeOutput {
  const warnings: string[] = [];
  const data = input.data || {};
  const slide = L.light(input.pres);
  L.head(slide, input.slideNum, data.kicker || 'SECTION', data.title || '중개인 제공 정보');

  switch (data.mode) {
    case 'points': renderPoints(slide, data); break;
    case 'regulation': renderRegulation(slide, data); break;
    case 'comps': renderComps(slide, data); break;
    case 'eviction': renderEviction(slide, data); break;
    default:
      warnings.push(`[A26] 알 수 없는 mode(${String(data.mode)}) — 슬라이드 억제`);
      return { slide, warnings, suppress: true };
  }

  // 명도 분석은 중개인 입력이 아니다 → 중개인 출처 칩/미검증 태그를 달지 않는다 (본문의 '추정·기준일' 칩이 출처 표기)
  if (data.mode !== 'eviction') addSourceFooter(slide, data);
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
