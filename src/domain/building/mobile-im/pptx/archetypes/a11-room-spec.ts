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

export function buildA11RoomSpec(input: ArchetypeInput): ArchetypeOutput {
  const slide = input.pres.addSlide({ masterName: 'A11' });
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  const subText = input.data.sub ?? input.data.leftSub ?? '';
  if (subText) L.sub(slide, M, 1.66, 7.10, subText);
  let tableEnd = 1.98;
  if (input.data.roomTypes && input.data.roomTypes.length > 0) {
    const colCount = input.data.roomTypes[0].length || 1;
    const colW = Array(colCount).fill(7.10 / colCount);
    const headRow = input.data.roomTypes[0].map((c: any) => String(c?.text ?? c ?? ''));
    const bodyRows = input.data.roomTypes.slice(1);
    tableEnd = L.table(slide, M, 1.98, 7.10, headRow, bodyRows, colW, { rh: 0.33, bfs: 10, hfs: 10 });
  }
  if (input.data.note) L.note(slide, M, tableEnd + 0.07, 7.10, input.data.note);
  
  const rx = 8.08;
  const rw = 4.63;
  // stats
  slide.addShape('rect' as any, { x: rx, y: 1.98, w: 2.24, h: 1.06, fill: { color: 'F9F9F9' } });
  slide.addShape('rect' as any, { x: rx+2.24+0.15, y: 1.98, w: 2.24, h: 1.06, fill: { color: 'F9F9F9' } });
  slide.addShape('rect' as any, { x: rx, y: 1.98+1.06+0.15, w: 2.24, h: 1.06, fill: { color: 'F9F9F9' } });
  slide.addShape('rect' as any, { x: rx+2.24+0.15, y: 1.98+1.06+0.15, w: 2.24, h: 1.06, fill: { color: 'F9F9F9' } });
  
  if (input.data.violationNote) {
    slide.addShape('rect' as any, { x: rx, y: 4.30, w: rw, h: 1.20, fill: { color: 'FFF3F3' } });
    slide.addText(input.data.violationNote, { x: rx+0.1, y: 4.40, w: rw-0.2, h: 1.0, fontFace: KR, fontSize: 10 });
  }
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
