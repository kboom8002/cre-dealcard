import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, KR } from '../imlib';
import type { ProvenanceKind } from '../imlib';

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
}

export function buildA12Ownership(input: ArchetypeInput): ArchetypeOutput {
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');

  const { left, right } = L.split2Col('60_40', 1.98, 4.5);

  const subText = input.data.sub ?? input.data.leftSub ?? '';
  if (subText) {
    L.sub(slide, left.x, 1.66, left.w, subText);
  }

  let tableEnd = 1.98;
  if (input.data.ownershipRows && input.data.ownershipRows.length > 0) {
    const rawRows = input.data.ownershipRows || [];
    const colCount = rawRows[0]?.length || 3;
    let headRow: string[];
    let bodyRows: any[][];

    const firstRowIsHeader = rawRows[0]?.some((c: any) => /^(?:구분|항목|권리|내용|비고)$/.test(String(c?.text ?? c ?? '').trim()));
    if (firstRowIsHeader) {
      headRow = rawRows[0].map((c: any) => String(c?.text ?? c ?? ''));
      bodyRows = rawRows.slice(1, 11);
    } else if (input.data.headers && Array.isArray(input.data.headers)) {
      headRow = input.data.headers.map((c: any) => String(c?.text ?? c ?? ''));
      bodyRows = rawRows.slice(0, 10);
    } else {
      headRow = colCount === 3
        ? ['구분', '권리 내용', '비고']
        : colCount === 2
          ? ['구분', '권리 내용']
          : Array(colCount).fill(0).map((_, idx) => `항목 ${idx + 1}`);
      bodyRows = rawRows.slice(0, 10);
    }

    const colW = colCount === 3
      ? [1.60, 2.30, Math.round((left.w - 1.60 - 2.30) * 1000) / 1000]
      : Array(colCount).fill(left.w / colCount);

    tableEnd = L.table(slide, left.x, 1.98, left.w, headRow, bodyRows, colW, {
      rh: 0.35,
      bfs: 10,
      hfs: 10,
    });
  }

  if (input.data.note) {
    L.note(slide, left.x, tableEnd + 0.07, left.w, input.data.note);
  }

  const callouts = input.data.callouts || [];
  callouts.forEach((co: any, i: number) => {
    if (i > 2) return;
    const cy = 1.98 + i * (1.24 + 0.14);
    L.card(slide, right.x, cy, right.w, 1.24, { fill: C.tint });
    slide.addText(co.title || '', {
      x: right.x + 0.2, y: cy + 0.15, w: right.w - 0.4, h: 0.3,
      fontFace: KR, fontSize: 11, bold: true, color: C.ink,
    });
    slide.addText(co.body || '', {
      x: right.x + 0.2, y: cy + 0.45, w: right.w - 0.4, h: 0.65,
      fontFace: KR, fontSize: 9, color: C.body, valign: 'top',
    });
  });

  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}

