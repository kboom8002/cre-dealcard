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

export function buildA12Ownership(input: ArchetypeInput): ArchetypeOutput {
  const slide = input.pres.addSlide({ masterName: 'A12' });
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  slide.addText(input.data.sub ?? input.data.leftSub ?? '', { x: M, y: 1.66, w: 7.10, h: 0.3, fontFace: KR, fontSize: 14 });
  if (input.data.ownershipRows && input.data.ownershipRows.length > 0) {
    slide.addTable(input.data.ownershipRows, { x: M, y: 1.98, w: 7.10, rowH: 0.35, fontFace: KR, fontSize: 10 });
  }
  const tableEnd = 1.98 + (input.data.ownershipRows ? input.data.ownershipRows.length * 0.35 : 0);
  slide.addText(input.data.note ?? '', { x: M, y: tableEnd + 0.07, w: 7.10, h: 0.2, fontFace: KR, fontSize: 9, color: '888888' });
  
  const rx = 8.08;
  const rw = 4.63;
  const callouts = input.data.callouts || [];
  callouts.forEach((co: any, i: number) => {
    if (i > 2) return;
    const cy = 1.98 + i * (1.24 + 0.14);
    slide.addShape('rect' as any, { x: rx, y: cy, w: rw, h: 1.24, fill: { color: 'F0F0F0' } });
    slide.addText(co.title || '', { x: rx+0.2, y: cy+0.2, w: rw-0.4, h: 0.3, fontFace: KR, fontSize: 11, bold: true });
  });
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
