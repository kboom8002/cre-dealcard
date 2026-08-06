import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, W, H, col, colX, KR, NUM, CD } from '../imlib';
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

export function buildA08DualTable(input: ArchetypeInput): ArchetypeOutput {
  const slide = input.pres.addSlide({ masterName: 'A8' });
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  const t1 = input.data.table1 || {};
  if (t1.sub) L.sub(slide, M, 1.66, 7.30, t1.sub);
  let table1End = 1.98;
  if (t1.rows && t1.rows.length > 0) {
    const colCount = t1.rows[0].length || 1;
    const colW = Array(colCount).fill(7.30 / colCount);
    const headRow = t1.rows[0].map((c: any) => String(c?.text ?? c ?? ''));
    const bodyRows = t1.rows.slice(1);
    table1End = L.table(slide, M, 1.98, 7.30, headRow, bodyRows, colW, { rh: 0.35, bfs: 10, hfs: 10 });
  }
  
  const t2 = input.data.table2 || {};
  if (t2.sub) L.sub(slide, M, table1End + 0.13, 7.30, t2.sub);
  if (t2.rows && t2.rows.length > 0) {
    const colCount = t2.rows[0].length || 1;
    const colW = Array(colCount).fill(7.30 / colCount);
    const headRow = t2.rows[0].map((c: any) => String(c?.text ?? c ?? ''));
    const bodyRows = t2.rows.slice(1);
    L.table(slide, M, table1End + 0.13 + 0.32, 7.30, headRow, bodyRows, colW, { rh: 0.35, bfs: 10, hfs: 10 });
  }
  
  const rx = 8.20;
  const rw = 4.51;
  const callouts = input.data.callouts ?? [];
  let cy = 1.98;
  callouts.slice(0, 2).forEach((c: any) => {
    L.callout(slide, rx, cy, rw, 1.90, c.kind ?? 'info', c.title ?? '', c.body ?? '');
    cy += 2.04;
  });
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
