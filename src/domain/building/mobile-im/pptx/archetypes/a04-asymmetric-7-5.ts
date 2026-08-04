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

export function buildA04Asymmetric75(input: ArchetypeInput): ArchetypeOutput {
  const slide = input.pres.addSlide({ masterName: 'A4' });
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  const left = input.data.left || {};
  slide.addText(left.sub || '', { x: M, y: 1.62, w: 7.10, h: 0.3, fontFace: KR, fontSize: 14, color: '333333' });
  
  if (left.rows && left.rows.length > 0) {
    slide.addTable(left.rows, { x: M, y: 1.96, w: 7.10, rowH: 0.35, fontFace: KR, fontSize: 10 });
  }
  
  const right = input.data.right || {};
  const rx = 8.08;
  const rw = 4.63;
  slide.addText(right.sub || '', { x: rx, y: 1.62, w: rw, h: 0.3, fontFace: KR, fontSize: 14, color: '333333' });
  
  let rightY = 1.96;
  if (right.rows && right.rows.length > 0) {
    slide.addTable(right.rows, { x: rx, y: 1.96, w: rw, rowH: 0.35, fontFace: KR, fontSize: 10 });
    rightY += right.rows.length * 0.35;
  }
  
  const rightCallouts = input.data.right?.callouts ?? [];
  let cy = rightY + 0.2;
  rightCallouts.forEach((c: any) => {
    const ch = Math.max(1.2, 0.55 + Math.ceil((c.body?.length ?? 0) / 30) * 0.29);
    L.callout(slide, rx, cy, rw, ch, c.kind ?? 'info', c.title ?? '', c.body ?? '');
    cy += ch + 0.14;
  });
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
