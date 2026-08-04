import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR, NUM } from '../imlib';
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
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  // Lead sentence
  const leadSentence = input.data.leadSentence || '';
  if (leadSentence) {
    slide.addText(leadSentence, { x: M, y: 1.30, w: CW, h: 0.5, color: C.ink, fontFace: KR, fontSize: 15, bold: true });
    slide.addShape('line' as any, { x: M, y: 1.85, w: CW, h: 0, line: { color: C.brass, width: 1.5 } });
  }
  
  // Stat grid 4x2
  const metrics = input.data.metrics || [];
  const startY = leadSentence ? 2.15 : 1.50;
  
  const gap = 0.20;
  const cardW = L.col(4, gap);
  const cardH = 1.4;
  
  for (let i = 0; i < 8; i++) {
    if (!metrics[i]) continue;
    const row = Math.floor(i / 4);
    const colIdx = i % 4;
    const x = L.colX(colIdx, cardW, gap);
    const y = startY + row * (cardH + gap);
    
    L.stat(slide, x, y, cardW, metrics[i].label, metrics[i].value, metrics[i].unit || '', metrics[i].sub || '', {
      h: cardH, vs: 20
    });
  }
  
  // Callouts
  const callouts = input.data.callouts || [];
  callouts.forEach((co: any, i: number) => {
    if (i > 1) return;
    const coGap = 0.20;
    const coW = L.col(2, coGap);
    const x = L.colX(i, coW, coGap);
    L.callout(slide, x, 5.5, coW, 1.2, co.kind || 'info', co.title || '', co.body || '');
  });
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);

  return { slide, warnings };
}
