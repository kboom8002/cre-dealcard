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

export function buildA01Cover(input: ArchetypeInput): ArchetypeOutput {
  const slide = input.pres.addSlide({ masterName: 'A1' }); // A1 - dark
  const warnings: string[] = [];
  
  // 3 masses
  slide.addShape('rect' as any, { x: 9.05, y: 0, w: 1.55, h: 4.42, fill: { color: 'FFFFFF', transparency: 93 } });
  slide.addShape('rect' as any, { x: 10.70, y: 0.95, w: 1.25, h: 3.47, fill: { color: 'FFFFFF', transparency: 95 } });
  slide.addShape('rect' as any, { x: 12.05, y: 1.85, w: 1.28, h: 2.57, fill: { color: 'B59A6D', transparency: 80 } });
  
  // Wordmark
  slide.addText([
    { text: 'CRE', options: { color: 'FFFFFF', fontFace: 'Arial', fontSize: 15, bold: true } },
    { text: 'DEAL', options: { color: 'B59A6D', fontFace: 'Arial', fontSize: 15, bold: true } }
  ], { x: M, y: 0.52, w: 3, h: 0.4 });
  
  // Kicker
  slide.addText(input.data.kicker || 'SECTION', { x: M, y: 2.22, w: CW, h: 0.3, color: 'B59A6D', fontFace: 'Arial', fontSize: 10, bold: true, charSpacing: 2.5 });
  
  // Title
  slide.addText(input.data.title || '제목', { x: M, y: 2.52, w: CW, h: 0.80, color: 'FFFFFF', fontFace: KR, fontSize: 40, bold: true });
  
  // Subtitle
  slide.addText(input.data.subtitle || 'Subtitle', { x: M, y: 3.38, w: CW, h: 0.4, color: 'A8B2BC', fontFace: KR, fontSize: 14 });
  
  // Tags
  let tagX = M;
  (input.data.tags || []).forEach((tag: string) => {
    slide.addText(tag, { x: tagX, y: 3.92, w: 1.2, h: 0.34, fill: { color: '333333' }, color: 'FFFFFF', fontFace: KR, fontSize: 10, align: 'center' });
    tagX += 1.3;
  });
  
  // Highlight box
  slide.addShape('rect' as any, { x: M, y: 4.86, w: CW, h: 1.34, fill: { color: '2A1F12' }, line: { color: '5C4620', width: 1 } });
  slide.addText(input.data.priceBand || '', { x: M + 0.2, y: 4.86 + 0.2, w: CW - 0.4, h: 0.94, color: 'FFFFFF', fontFace: KR, fontSize: 16 });
  
  // Issue Info
  const infoText = `${input.data.brokerName || ''} | ${input.data.companyName || ''} | ${input.docno}`;
  slide.addText(infoText, { x: M, y: 6.60, w: CW, h: 0.3, color: '5A6774', fontFace: KR, fontSize: 8.5 });
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, true);
  L.foot(slide, input.slideNum, input.docno, true);

  return { slide, warnings };
}
