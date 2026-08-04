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

export function buildA13Operating(input: ArchetypeInput): ArchetypeOutput {
  const slide = input.pres.addSlide({ masterName: 'A13' });
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  slide.addText(input.data.roomSub ?? '', { x: M, y: 1.66, w: 7.30, h: 0.3, fontFace: KR, fontSize: 14 });
  if (input.data.roomTypes && input.data.roomTypes.length > 0) {
    slide.addTable(input.data.roomTypes, { x: M, y: 1.98, w: 7.30, rowH: 0.34, fontFace: KR, fontSize: 10 });
  }
  
  const table1End = 1.98 + (input.data.roomTypes ? input.data.roomTypes.length * 0.34 : 0);
  const t1Bottom = table1End;
  const opHead = ['ADR', 'OCC', 'RevPAR', 'GOP마진'];
  const opRows = input.data.opMetrics?.rows ?? [];
  if (opRows.length > 0) {
    const t2y = t1Bottom + 0.45;
    L.sub(slide, M, t2y - 0.32, 7.30, input.data.opSub ?? '');
    L.table(slide, M, t2y, 7.30, opHead, opRows, [1.82, 1.82, 1.82, 1.84], { rh: 0.34 });
  }
  
  const rx = 8.20;
  const rw = 4.51;
  slide.addShape('rect' as any, { x: rx, y: 1.98, w: rw, h: 1.12, fill: { color: 'F9F9F9' } });
  slide.addShape('rect' as any, { x: rx, y: 3.22, w: rw, h: 1.44, fill: { color: 'F0F0F0' } });
  slide.addShape('rect' as any, { x: rx, y: 4.80, w: rw, h: 1.18, fill: { color: 'F0F0F0' } });
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
