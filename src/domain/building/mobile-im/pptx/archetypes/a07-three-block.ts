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

export function buildA07ThreeBlock(input: ArchetypeInput): ArchetypeOutput {
  const slide = input.pres.addSlide({ masterName: input.data.onDark ? 'A7_Dark' : 'A7' });
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  const w = input.data.onDark ? 3.80 : 3.83;
  const gap = input.data.onDark ? 0.34 : 0.30;
  
  const blocks = input.data.blocks || [];
  blocks.forEach((b: any, i: number) => {
    if (i > 2) return;
    const x = M + i * (w + gap);
    slide.addShape('rect' as any, { x, y: 1.72, w, h: 3.0, fill: { color: input.data.onDark ? '333333' : 'F9F9F9' } });
    slide.addText(b.label || '', { x: x+0.2, y: 1.9, w: w-0.4, h: 0.3, fontFace: KR, fontSize: 9.5 });
    slide.addText(b.value || '', { x: x+0.2, y: 2.3, w: w-0.4, h: 0.5, fontFace: NUM, fontSize: 18, bold: true });
    slide.addText(b.description || '', { x: x+0.2, y: 3.0, w: w-0.4, h: 1.0, fontFace: KR, fontSize: 9.5 });
  });
  
  if (input.data.bottomBar) {
    slide.addShape('rect' as any, { x: M, y: 5.44, w: CW, h: 0.98, fill: { color: 'EBEBEB' } });
    slide.addText(input.data.bottomBar.text || '', { x: M+0.2, y: 5.44+0.2, w: CW-0.4, h: 0.58, fontFace: KR, fontSize: 12 });
  }
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
