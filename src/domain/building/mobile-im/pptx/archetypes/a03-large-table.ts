import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR } from '../imlib';
import type { ProvenanceKind, RowEntry, CellValue } from '../imlib';

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

export function buildA03LargeTable(input: ArchetypeInput): ArchetypeOutput {
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  const yStart = 1.86;
  const rows = input.data.tableRows || [];
  const head = input.data.tableHead || [];
  
  let tableEnd = yStart;
  
  // Table logic
  if (head.length > 0 || rows.length > 0) {
    if (head.length > 0) {
      // Use L.table
      const colCount = Math.max(head.length, ...rows.map((r: any[]) => r.length));
      const colW = Array(colCount).fill(CW / colCount);
      
      // Override header colors based on requirements
      const styledHead = head;
      const styledRows = rows.map((r: any[]) => r.map((c: any) => typeof c === 'string' ? { t: c } : c));
      
      tableEnd = L.table(slide, M, yStart, CW, styledHead, styledRows, colW, {
        rh: 0.38, bfs: 11, hfs: 11
      });
    } else {
      // If no tableHead but tableRows exists, maybe it's meant for L.rows
      // Assuming rows are [label, value, badge?]
      tableEnd = L.rows(slide, M, yStart, CW, rows as RowEntry[], { rh: 0.38, fs: 11 });
    }
  } else if (input.data.rows && input.data.rows.length > 0) {
    tableEnd = L.rows(slide, M, yStart, CW, input.data.rows as RowEntry[], { rh: 0.38, fs: 11 });
  }
  
  // Note
  if (input.data.note) {
    L.note(slide, M, tableEnd + 0.10, CW, input.data.note);
    tableEnd += 0.52; // roughly height of note + gap
  } else {
    tableEnd += 0.2;
  }
  
  // Callouts
  const callouts = input.data.callouts || [];
  callouts.forEach((co: any, i: number) => {
    if (i > 1) return;
    const coGap = 0.20;
    const coW = L.col(2, coGap);
    const x = L.colX(i, coW, coGap);
    L.callout(slide, x, tableEnd, coW, 1.2, co.kind || 'info', co.title || '', co.body || '');
  });
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
