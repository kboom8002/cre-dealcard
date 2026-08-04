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

export function buildA06Diagram(input: ArchetypeInput): ArchetypeOutput {
  const slide = input.pres.addSlide({ masterName: 'A6' });
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  const left = input.data.left || {};
  slide.addText(left.sub || '', { x: M, y: 1.62, w: 5.70, h: 0.3, fontFace: KR, fontSize: 14 });
  slide.addShape('rect' as any, { x: M+0.15, y: 2.15, w: 5.70, h: 3.0, fill: { color: 'F4F4F4' } });
  if (left.source) slide.addText(left.source, { x: M, y: 5.88, w: 5.70, h: 0.2, fontFace: KR, fontSize: 9 });
  
  const right = input.data.right || {};
  const rx = 7.00;
  const rw = 5.71;
  const rightRows = input.data.right?.rows ?? [];
  let ry = 2.02;
  if (rightRows.length > 0) {
    L.sub(slide, rx, 1.62, rw, input.data.right?.sub ?? '');
    ry = L.rows(slide, rx, ry, rw, rightRows);
  }
  if (input.data.right?.callout) {
    const c = input.data.right.callout;
    L.callout(slide, rx, ry + 0.14, rw, 1.2, c.kind ?? 'info', c.title ?? '', c.body ?? '');
  }
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
