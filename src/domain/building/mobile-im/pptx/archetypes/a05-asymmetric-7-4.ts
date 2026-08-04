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

export function buildA05Asymmetric74(input: ArchetypeInput): ArchetypeOutput {
  const slide = input.pres.addSlide({ masterName: 'A5' });
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  const left = input.data.left || {};
  slide.addText(left.sub || '', { x: M, y: 1.66, w: 7.30, h: 0.3, fontFace: KR, fontSize: 14, color: '333333' });
  
  if (left.chartData) {
    slide.addShape('rect' as any, { x: M, y: 2.00, w: 7.30, h: 2.9, fill: { color: 'EBEBEB' } });
    slide.addText('CHART PLACEHOLDER', { x: M, y: 2.00, w: 7.30, h: 2.9, align: 'center', color: '999999' });
    if (left.note) {
      slide.addText(left.note, { x: M, y: 2.00 + 2.9 + 0.08, w: 7.30, h: 0.2, fontFace: KR, fontSize: 9, color: '888888' });
    }
  }
  
  const right = input.data.right || {};
  const rx = 8.20;
  const rw = 4.51;
  const rightStats = input.data.right?.stats ?? [];
  let sy = 1.98;
  rightStats.forEach((s: any) => {
    L.stat(slide, rx, sy, rw, s.label ?? '', s.value ?? '', s.unit ?? '', s.sub ?? '');
    sy += 1.36;
  });
  const rightCallouts = input.data.right?.callouts ?? [];
  rightCallouts.forEach((c: any) => {
    const ch = 1.2;
    L.callout(slide, rx, sy, rw, ch, c.kind ?? 'info', c.title ?? '', c.body ?? '');
    sy += ch + 0.14;
  });
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
