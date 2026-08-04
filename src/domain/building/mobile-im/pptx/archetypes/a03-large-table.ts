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

export function buildA03LargeTable(input: ArchetypeInput): ArchetypeOutput {
  const slide = input.pres.addSlide({ masterName: 'A3' });
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  const yStart = 1.86;
  const rh = 0.36;
  const rows = input.data.tableRows || [];
  const head = input.data.tableHead || [];
  
  // Table logic
  const tableData = [head, ...rows];
  if (tableData.length > 0) {
    slide.addTable(tableData, { x: M, y: yStart, w: CW, rowH: rh, fontFace: KR, fontSize: 10 });
  }
  
  const tableEnd = yStart + (tableData.length * rh);
  
  // Note
  if (input.data.note) {
    slide.addText(input.data.note, { x: M, y: tableEnd + 0.10, w: CW, h: 0.2, fontFace: KR, fontSize: 9, color: '888888' });
  }
  
  // Callouts
  const callouts = input.data.callouts || [];
  callouts.forEach((co: any, i: number) => {
    if (i > 1) return;
    const x = i === 0 ? M : M + 5.91 + 0.27;
    slide.addShape('rect' as any, { x, y: tableEnd + 0.36, w: 5.91, h: 1.2, fill: { color: 'F0F0F0' } });
    slide.addText(co.title || '', { x: x+0.2, y: tableEnd + 0.36 + 0.2, w: 5.5, h: 0.3, fontFace: KR, fontSize: 12, bold: true });
  });
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
