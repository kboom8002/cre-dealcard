/**
 * @file a26-broker-extras.ts
 * @description A26 — 중개인 제공 추가 정보 면 (Basic IM 선택 면 3종: 투자 포인트·제안 / 규제·계획 / 인근 시세 비교)
 *
 * 왜 신규 아키타입인가 (A04 재사용 불가 사유)
 *  - A04 좌측은 '라벨-값' 한 줄 행(L.rows)이라 최대 60~100자 서술 원문을 말줄임 없이 담을 수 없고(D7),
 *    우측은 사진/자산 하이라이트 폴백(일반론 문구)이 끼어든다 (Rule 34).
 *  - A24 표 빌더는 렌트롤 10열 전용이다. 시세 비교는 5열 표 + 요약 카드(결정론 통계) + 산식 각주가 필요하다.
 *  → 3개 모드(points | regulation | comps)를 하나의 아키타입으로 묶고, 데이터는 broker-extras-slides.ts 가 만든다.
 *
 * 규칙: 문자열은 원문 그대로(재작성·요약 금지), 출처 칩 '● 중개인입력' + '중개인 제공 · 미검증' 표기.
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
    slide.addShape('ellipse', { x: M, y: y + (rowH - numD) / 2 - 0.02, w: numD, h: numD, fill: { color: 'B8860B' }, line: { color: 'B8860B', width: 0 } });
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
    slide.addShape('roundRect', { x: rx, y: y0, w: rw, h: boxH, rectRadius: 0.05, fill: { color: 'F6F1E4' }, line: { color: 'D4C89A', width: 0.75 } });
    slide.addShape('rect', { x: rx, y: y0 + 0.10, w: 0.05, h: boxH - 0.20, fill: { color: 'B8860B' }, line: { color: 'B8860B', width: 0 } });
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

// ── 모드 2: 규제·계획 (카드 그리드, 개발행위허가제한 = 경고색) ──────────────────
function cardNeed(card: RegulationCard, w: number): number {
  const innerW = w - 0.40;
  let h = 0.14 + 0.30; // 상하 패딩 + 제목줄
  h += textHeight(card.detail, innerW, 11) + 0.06;
  for (const ln of card.lines) h += textHeight(`${ln.label} · ${ln.value}`, innerW, 10) + 0.04;
  return h + 0.12;
}

function renderRegulation(slide: Slide, data: Record<string, any>): void {
  const cards: RegulationCard[] = Array.isArray(data.cards) ? data.cards : [];
  const n = cards.length;
  if (n === 0) return;
  const cols = n === 1 ? 1 : 2;
  const rows = Math.ceil(n / cols);
  const gap = 0.25;
  const cw = (CW - gap * (cols - 1)) / cols;
  const avail = BODY_BOTTOM - TOP - gap * (rows - 1);

  // 행별 필요 높이 → 가용 높이 안에서 균등 상한
  const needs: number[] = [];
  for (let r = 0; r < rows; r++) {
    const rowCards = cards.slice(r * cols, r * cols + cols);
    needs.push(Math.max(...rowCards.map(c => cardNeed(c, cw))));
  }
  const maxPerRow = avail / rows;
  const heights = needs.map(h => Math.min(Math.max(h, 1.2), maxPerRow));

  let y = TOP;
  for (let r = 0; r < rows; r++) {
    const h = heights[r];
    cards.slice(r * cols, r * cols + cols).forEach((card, ci) => {
      const x = M + ci * (cw + gap);
      const warn = card.tone === 'warn';
      const bg = warn ? C.amberL : C.blueL;
      const bar = warn ? C.amber : C.blue;
      slide.addShape('roundRect', { x, y, w: cw, h, rectRadius: 0.06, fill: { color: bg } });
      slide.addShape('rect', { x, y: y + 0.06, w: 0.05, h: h - 0.12, fill: { color: bar }, line: { color: bar, width: 0 } });
      const headText = card.title ? `${card.kindLabel} · ${card.title}` : card.kindLabel;
      const headFit = L.fitTextToBox(headText, cw - 0.40, 0.28, { minFontSize: 10, maxFontSize: 12.5, targetLines: 1, allowTruncate: false });
      slide.addText(headText, {
        x: x + 0.20, y: y + 0.10, w: cw - 0.36, h: 0.28,
        fontFace: KR, fontSize: headFit.fontSize, bold: true, color: bar, margin: 0, valign: 'middle',
      });
      const runs: Array<{ text: string; options: Record<string, any> }> = [
        { text: card.detail, options: { fontSize: 11, color: C.ink, breakLine: card.lines.length > 0, margin: 0 } },
      ];
      card.lines.forEach((ln, i) => {
        runs.push({ text: `${ln.label} · `, options: { fontSize: 10, bold: true, color: bar, paraSpaceBefore: i === 0 ? 5 : 2 } });
        runs.push({ text: ln.value, options: { fontSize: 10, color: C.body, breakLine: i < card.lines.length - 1 } });
      });
      slide.addText(runs as any, {
        x: x + 0.20, y: y + 0.42, w: cw - 0.36, h: h - 0.50,
        fontFace: KR, valign: 'top', margin: 0, lineSpacingMultiple: 1.1,
      });
    });
    y += h + gap;
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
        fill: { color: isGap ? 'F6F1E4' : 'F3F6F7' },
        line: { color: isGap ? 'D4C89A' : 'E2E8EC', width: 0.75 },
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

export function buildA26BrokerExtras(input: ArchetypeInput): ArchetypeOutput {
  const warnings: string[] = [];
  const data = input.data || {};
  const slide = L.light(input.pres);
  L.head(slide, input.slideNum, data.kicker || 'SECTION', data.title || '중개인 제공 정보');

  switch (data.mode) {
    case 'points': renderPoints(slide, data); break;
    case 'regulation': renderRegulation(slide, data); break;
    case 'comps': renderComps(slide, data); break;
    default:
      warnings.push(`[A26] 알 수 없는 mode(${String(data.mode)}) — 슬라이드 억제`);
      return { slide, warnings, suppress: true };
  }

  addSourceFooter(slide, data);
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
