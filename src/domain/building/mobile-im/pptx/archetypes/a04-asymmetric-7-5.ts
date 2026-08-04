import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR } from '../imlib';
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
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  const lw = 7.5;
  const gap = 0.393;
  const rw = 4.2;
  const rx = M + lw + gap;
  
  const left = input.data.left || {};
  if (left.sub) {
    L.sub(slide, M, 1.62, lw, left.sub);
    // Subtitle font size 15 is slightly overriding L.sub standard which is 11, so let's draw it manually or modify L.sub? We'll just draw it:
    slide.addText(left.sub, { x: M, y: 1.62, w: lw, h: 0.3, fontFace: KR, fontSize: 15, bold: true, color: C.ink, margin: 0 });
  }
  
  if (left.rows && left.rows.length > 0) {
    const colCount = Math.max(...left.rows.map((r: any[]) => r.length));
    const colW = Array(colCount).fill(lw / colCount);
    const styledRows = left.rows.map((r: any[]) => r.map((c: any) => typeof c === 'string' ? { t: c } : c));
    L.table(slide, M, 1.96, lw, [], styledRows, colW, { rh: 0.38, bfs: 11 });
  } else if (left.text) {
    slide.addText(left.text, { x: M, y: 1.96, w: lw, h: 4.0, fontFace: KR, fontSize: 11, color: C.body, valign: 'top' });
  }
  
  // Brass divider
  slide.addShape('line' as any, { x: M + lw + gap / 2, y: 1.62, w: 0, h: 5.0, line: { color: C.brass, width: 0.5 } });
  
  const right = input.data.right || {};
  if (right.sub) {
    slide.addText(right.sub, { x: rx, y: 1.62, w: rw, h: 0.3, fontFace: KR, fontSize: 15, bold: true, color: C.ink, margin: 0 });
  }
  
  let rightY = 1.96;
  if (right.rows && right.rows.length > 0) {
    const colCount = Math.max(...right.rows.map((r: any[]) => r.length));
    const colW = Array(colCount).fill(rw / colCount);
    const styledRows = right.rows.map((r: any[]) => r.map((c: any) => typeof c === 'string' ? { t: c } : c));
    rightY = L.table(slide, rx, 1.96, rw, [], styledRows, colW, { rh: 0.38, bfs: 11 });
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
