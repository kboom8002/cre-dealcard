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

export function buildA09Process(input: ArchetypeInput): ArchetypeOutput {
  const slide = input.pres.addSlide({ masterName: 'A9' });
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  const w = 3.80;
  const gap = 0.34;
  const y = 1.72;
  const h = 2.52;
  
  const steps = input.data.steps || [];
  steps.forEach((s: any, i: number) => {
    if (i > 2) return;
    const x = M + i * (w + gap);
    slide.addShape('rect' as any, { x, y, w, h, fill: { color: 'F4F4F4' } });
    slide.addText(s.stepNum || `STEP ${i+1}`, { x: x+0.24, y: y+0.18, w: w-0.48, h: 0.2, fontFace: NUM, fontSize: 9.5, bold: true });
    slide.addText(s.title || '', { x: x+0.24, y: y+0.46, w: w-0.48, h: 0.4, fontFace: KR, fontSize: 14, bold: true });
    slide.addText(s.description || '', { x: x+0.24, y: y+1.08, w: w-0.48, h: 0.8, fontFace: KR, fontSize: 9.8 });
    if (s.tag) slide.addShape('rect' as any, { x: x+0.24, y: y+2.04, w: 1.45, h: 0.28, fill: { color: 'DDDDDD' } });
  });
  
  if (input.data.bottomInfo) {
    slide.addText(input.data.bottomInfo, { x: M, y: 4.52, w: CW, h: 0.5, fontFace: KR, fontSize: 11 });
  }
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
