import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR } from '../imlib';
import type { ProvenanceKind, RowEntry } from '../imlib';

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

export function buildA06Diagram(input: ArchetypeInput): ArchetypeOutput {
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  const left = input.data.left || {};
  const right = input.data.right || {};
  
  let y = 1.62;
  
  const subText = left.sub || right.sub;
  if (subText) {
    L.sub(slide, M, y, CW, subText);
    y += 0.35;
  }
  
  const rightRows = right.rows ?? [];
  if (rightRows.length > 0) {
    // Render full width L.rows
    y = L.rows(slide, M, y, CW, rightRows as RowEntry[], { rh: 0.38, fs: 11 });
    y += 0.3;
  }
  
  if (right.callout) {
    const c = right.callout;
    L.callout(slide, M, y, CW, 1.4, c.kind ?? 'info', c.title ?? '', c.body ?? '');
    y += 1.5;
  }
  
  if (left.source) {
    L.note(slide, M, y + 0.1, CW, left.source);
  }
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
