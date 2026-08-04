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
  slide.addText(t1.sub || '', { x: M, y: 1.66, w: 7.30, h: 0.3, fontFace: KR, fontSize: 14 });
  if (t1.rows && t1.rows.length > 0) slide.addTable(t1.rows, { x: M, y: 1.98, w: 7.30, rowH: 0.35, fontFace: KR, fontSize: 10 });
  
  const table1End = 1.98 + (t1.rows ? t1.rows.length * 0.35 : 0);
  
  const t2 = input.data.table2 || {};
  slide.addText(t2.sub || '', { x: M, y: table1End + 0.13, w: 7.30, h: 0.3, fontFace: KR, fontSize: 14 });
  if (t2.rows && t2.rows.length > 0) slide.addTable(t2.rows, { x: M, y: table1End + 0.13 + 0.32, w: 7.30, rowH: 0.35, fontFace: KR, fontSize: 10 });
  
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
