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

export function buildA02StatGrid(input: ArchetypeInput): ArchetypeOutput {
  const slide = input.pres.addSlide({ masterName: 'A2' });
  const warnings: string[] = [];
  
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  // Lead sentence
  slide.addText(input.data.leadSentence || '', { x: M, y: 1.50, w: CW * 0.52, h: 0.5, color: '333333', fontFace: KR, fontSize: 15 });
  
  // Stat grid 4x2
  const metrics = input.data.metrics || [];
  for (let i = 0; i < 8; i++) {
    if (!metrics[i]) continue;
    const row = Math.floor(i / 4);
    const col = i % 4;
    const x = M + col * (2.83 + 0.26);
    const y = row === 0 ? 2.18 : 3.54;
    slide.addShape('rect' as any, { x, y, w: 2.83, h: 1.24, fill: { color: 'F9F9F9' } });
    slide.addText(metrics[i].label, { x: x+0.1, y: y+0.1, w: 2.6, h: 0.3, fontFace: KR, fontSize: 10, color: '666666' });
    slide.addText(metrics[i].value + (metrics[i].unit || ''), { x: x+0.1, y: y+0.4, w: 2.6, h: 0.5, fontFace: NUM, fontSize: 18, color: '000000', bold: true });
  }
  
  // Callouts
  const callouts = input.data.callouts || [];
  callouts.forEach((co: any, i: number) => {
    if (i > 1) return;
    const x = i === 0 ? M : M + 5.91 + 0.27; // CW=12.09, M=0.62 -> 5.91*2 + gap = 12.09
    slide.addShape('rect' as any, { x, y: 5.02, w: 5.91, h: 1.34, fill: { color: 'F0F0F0' } });
    slide.addText(co.title || '', { x: x+0.2, y: 5.02+0.2, w: 5.5, h: 0.3, fontFace: KR, fontSize: 12, bold: true, color: '333333' });
    slide.addText(co.body || '', { x: x+0.2, y: 5.02+0.6, w: 5.5, h: 0.6, fontFace: KR, fontSize: 10, color: '666666' });
  });
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);

  return { slide, warnings };
}
