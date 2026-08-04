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
    slide.addText(leadSentence, {
      x: M, y: 1.30, w: CW, h: 0.5,
      color: C.ink, fontFace: KR, fontSize: 15, bold: true,
    });
    // Brass 강조선
    slide.addShape('line' as any, {
      x: M, y: 1.85, w: CW, h: 0,
      line: { color: C.brass, width: 1.5 },
    });
  }
  
  // Stat grid
  let metrics = input.data.metrics || [];
  
  // metrics가 비어있으면 tables/content에서 추출
  if (metrics.length === 0 && input.data.tables && input.data.tables.length > 0) {
    const t = input.data.tables[0];
    for (const row of (t.rows || [])) {
      if (row.length >= 2 && metrics.length < 8) {
        const label = String(row[0] || '').replace(/\*\*/g, '');
        const value = String(row[1] || '').replace(/\*\*/g, '');
        if (label && value) metrics.push({ label, value, unit: row[2] || '' });
      }
    }
  }
  
  // 그래도 없으면 content에서 key:value 패턴 추출
  if (metrics.length === 0 && input.data.content) {
    const lines = String(input.data.content).split('\n');
    for (const line of lines) {
      const match = line.match(/\*\*(.*?)\*\*\s*[：:|]\s*(.*)/);
      if (match && metrics.length < 8) {
        metrics.push({ label: match[1].trim(), value: match[2].trim(), unit: '' });
      }
    }
  }
  
  const startY = leadSentence ? 2.15 : 1.50;
  
  if (metrics.length > 0) {
    // Stat cards
    const gap = 0.20;
    const cols = Math.min(4, metrics.length);
    const cardW = L.col(cols, gap);
    const cardH = 1.4;
    
    for (let i = 0; i < Math.min(8, metrics.length); i++) {
      const m = metrics[i];
      if (!m) continue;
      const row = Math.floor(i / cols);
      const colIdx = i % cols;
      const x = L.colX(colIdx, cardW, gap);
      const y = startY + row * (cardH + gap);
      
      L.stat(slide, x, y, cardW,
        String(m.label || ''),
        String(m.value || ''),
        String(m.unit || ''),
        String(m.sub || ''),
        { h: cardH, vs: 20 }
      );
    }
  } else {
    // metrics도 없으면 content를 L.rows()로 렌더링
    if (input.data.content) {
      const lines = String(input.data.content).split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 5 && !l.startsWith('#') && !l.startsWith('|'));
      const rowEntries: [string, string][] = lines.slice(0, 10).map((l: string) => {
        const stripped = l.replace(/\*\*(.*?)\*\*/g, '$1').replace(/[`\[\]]/g, '');
        return [stripped, ''] as [string, string];
      });
      if (rowEntries.length > 0) {
        L.rows(slide, M, startY, CW, rowEntries, { rh: 0.36, fs: 12 });
      }
    }
  }
  
  // Callouts
  const callouts = input.data.callouts || [];
  const calloutY = metrics.length > 4 ? 5.4 : (metrics.length > 0 ? startY + 1.8 : 4.5);
  callouts.forEach((co: any, i: number) => {
    if (i > 1) return;
    const coGap = 0.20;
    const coW = L.col(2, coGap);
    const x = L.colX(i, coW, coGap);
    L.callout(slide, x, calloutY, coW, 1.2, co.kind || 'info', co.title || '', co.body || '');
  });
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);

  return { slide, warnings };
}
