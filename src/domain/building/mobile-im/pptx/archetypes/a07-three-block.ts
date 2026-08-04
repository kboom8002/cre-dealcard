import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR, NUM, CD } from '../imlib';
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
  const onDark = input.data.onDark === true;
  const slide = onDark ? L.dark(input.pres) : L.light(input.pres);
  const warnings: string[] = [];
  
  if (onDark) {
    L.headD(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  } else {
    L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  }
  
  const gap = 0.30;
  const w = L.col(3, gap);
  const h = 3.5;
  const y = 1.72;
  
  const labelColor = onDark ? CD.mute : C.mute;
  const valColor = onDark ? 'FFFFFF' : C.ink;
  const descColor = onDark ? CD.body : C.body;
  
  const blocks = input.data.blocks || [];
  blocks.forEach((b: any, i: number) => {
    if (i > 2) return;
    const x = L.colX(i, w, gap);
    
    L.card(slide, x, y, w, h, { onDark });
    
    // Brass top border (3px approx 0.04 inch)
    slide.addShape('rect' as any, { x, y, w, h: 0.04, fill: { color: C.brass } });
    
    slide.addText(b.label || '', { x: x+0.2, y: y+0.2, w: w-0.4, h: 0.3, fontFace: KR, fontSize: 11, color: labelColor });
    slide.addText(b.value || '', { x: x+0.2, y: y+0.6, w: w-0.4, h: 0.5, fontFace: NUM, fontSize: 22, bold: true, color: valColor });
    slide.addText(b.description || '', { x: x+0.2, y: y+1.3, w: w-0.4, h: h-1.5, fontFace: KR, fontSize: 11, color: descColor, valign: 'top' });
  });
  
  if (input.data.bottomBar) {
    const barY = y + h + 0.3;
    const barBg = onDark ? CD.block : C.tint;
    const barFg = onDark ? 'FFFFFF' : C.ink;
    L.card(slide, M, barY, CW, 0.98, { fill: barBg, onDark });
    slide.addText(input.data.bottomBar.text || '', { x: M+0.2, y: barY+0.2, w: CW-0.4, h: 0.58, fontFace: KR, fontSize: 12, color: barFg, valign: 'middle' });
  }
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, onDark);
  L.foot(slide, input.slideNum, input.docno, onDark);
  return { slide, warnings };
}
