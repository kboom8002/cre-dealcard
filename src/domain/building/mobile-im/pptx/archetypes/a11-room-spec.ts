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
  
  slide.addText(input.data.sub ?? input.data.leftSub ?? '', { x: M, y: 1.66, w: 7.10, h: 0.3, fontFace: KR, fontSize: 14 });
  if (input.data.roomTypes && input.data.roomTypes.length > 0) {
    slide.addTable(input.data.roomTypes, { x: M, y: 1.98, w: 7.10, rowH: 0.33, fontFace: KR, fontSize: 10 });
  }
  const tableEnd = 1.98 + (input.data.roomTypes ? input.data.roomTypes.length * 0.33 : 0);
  slide.addText(input.data.note ?? '', { x: M, y: tableEnd + 0.07, w: 7.10, h: 0.2, fontFace: KR, fontSize: 9, color: '888888' });
  
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
