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

export function buildA10Closing(input: ArchetypeInput): ArchetypeOutput {
  const slide = input.pres.addSlide({ masterName: 'A10' });
  const warnings: string[] = [];
  L.headD(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  slide.addText(input.data.sub || '', { x: M, y: 1.66, w: 6.0, h: 0.3, fontFace: KR, fontSize: 14, color: 'FFFFFF' });
  
  const badges = input.data.badges || [];
  badges.forEach((b: any, i: number) => {
    const by = 2.02 + i * 0.62;
    slide.addShape('roundRect' as any, { x: M, y: by, w: 1.55, h: 0.32, fill: { color: '232F3C' } });
    slide.addText(b.label || '', { x: M, y: by, w: 1.55, h: 0.32, align: 'center', fontFace: KR, fontSize: 10, color: 'FFFFFF' });
    slide.addText(b.description || '', { x: M+1.72, y: by-0.06, w: 3.90, h: 0.44, fontFace: KR, fontSize: 10, color: 'CCCCCC' });
    slide.addText(b.score || '', { x: M+5.66, y: by, w: 1.0, h: 0.32, align: 'right', fontFace: NUM, fontSize: 12, color: 'FFFFFF' });
  });
  
  const rx = 7.10;
  const rw = 5.61;
  slide.addShape('rect' as any, { x: rx, y: 2.02, w: rw, h: 2.86, fill: { color: '333333' } });
  if (input.data.disclaimer) {
    slide.addText(input.data.disclaimer, { x: rx+0.2, y: 2.22, w: rw-0.4, h: 2.4, fontFace: KR, fontSize: 9, color: 'AAAAAA' });
  }
  
  slide.addShape('rect' as any, { x: M, y: 5.72, w: CW, h: 0.70, fill: { color: '2A1F12' } });
  if (input.data.footerText) {
    slide.addText(input.data.footerText, { x: M+0.2, y: 5.82, w: CW-0.4, h: 0.5, fontFace: KR, fontSize: 10, color: 'FFFFFF' });
  }
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, true);
  L.foot(slide, input.slideNum, input.docno, true);
  return { slide, warnings };
}
