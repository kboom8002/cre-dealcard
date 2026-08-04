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
  const rw = CW - lw - gap;
  const rx = M + lw + gap;
  
  const left = input.data.left || {};
  
  // 좌측: 부제
  if (left.sub) {
    L.sub(slide, M, 1.50, lw, left.sub);
  }
  
  // 좌측: rows → L.rows() (key-value 쌍)
  if (left.rows && left.rows.length > 0) {
    // left.rows는 2D array: [['label', 'value'], ...] → RowEntry 튜플로 변환
    const rowEntries: [string, string][] = left.rows.map((r: any[]) => {
      if (Array.isArray(r) && r.length >= 2) {
        return [String(r[0] || ''), String(r[1] || '')] as [string, string];
      }
      return [String(r[0] || ''), ''] as [string, string];
    });
    L.rows(slide, M, 1.86, lw, rowEntries, { rh: 0.38, fs: 12 });
  } else if (input.data.content) {
    // 테이블 데이터 없으면 content에서 추출하여 rows로 렌더링
    const lines = String(input.data.content).split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0 && !l.startsWith('#') && !l.startsWith('|'));
    const contentRows: [string, string][] = [];
    for (const line of lines) {
      const stripped = line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/[`\[\]]/g, '');
      const parts = stripped.split(/[：:]/);
      if (parts.length >= 2) {
        contentRows.push([parts[0].trim(), parts.slice(1).join(':').trim()]);
      } else if (stripped.startsWith('-') || stripped.startsWith('•')) {
        contentRows.push([stripped.replace(/^[-•·]\s*/, ''), '']);
      }
    }
    if (contentRows.length > 0) {
      L.rows(slide, M, 1.86, lw, contentRows.slice(0, 12), { rh: 0.38, fs: 12 });
    }
  }
  
  // Brass 수직 구분선
  slide.addShape('line' as any, {
    x: M + lw + gap / 2, y: 1.50, w: 0, h: 5.2,
    line: { color: C.brass, width: 0.7 },
  });
  
  // 우측: 부제
  const right = input.data.right || {};
  if (right.sub) {
    L.sub(slide, rx, 1.50, rw, right.sub);
  }
  
  // 우측: callouts
  let cy = 1.86;
  const rightCallouts = input.data.right?.callouts ?? [];
  if (rightCallouts.length > 0) {
    rightCallouts.forEach((c: any) => {
      const ch = Math.max(1.2, 0.55 + Math.ceil((c.body?.length ?? 0) / 25) * 0.29);
      L.callout(slide, rx, cy, rw, ch, c.kind ?? 'info', c.title ?? '', c.body ?? '');
      cy += ch + 0.18;
    });
  } else if (right.rows && right.rows.length > 0) {
    // callout 없으면 right.rows 렌더링
    const rowEntries: [string, string][] = right.rows.map((r: any[]) => {
      if (Array.isArray(r) && r.length >= 2) {
        return [String(r[0] || ''), String(r[1] || '')] as [string, string];
      }
      return [String(r[0] || ''), ''] as [string, string];
    });
    L.rows(slide, rx, cy, rw, rowEntries.slice(0, 8), { rh: 0.38, fs: 11 });
  }
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
