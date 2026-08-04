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

export function buildA05Asymmetric74(input: ArchetypeInput): ArchetypeOutput {
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  const lw = 7.5;
  const gap = 0.393;
  const rw = CW - lw - gap;
  const rx = M + lw + gap;
  
  const left = input.data.left || {};
  
  // 좌측 부제
  if (left.sub) {
    L.sub(slide, M, 1.50, lw, left.sub);
  }
  
  // 좌측: content를 L.rows()로 렌더링 (chart placeholder 대신)
  if (input.data.content) {
    const lines = String(input.data.content).split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 5 && !l.startsWith('#'));
    const rowEntries: [string, string][] = [];
    for (const line of lines) {
      const stripped = line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/[|`\[\]]/g, '').trim();
      if (!stripped) continue;
      const parts = stripped.split(/[：:]/);
      if (parts.length >= 2) {
        rowEntries.push([parts[0].trim(), parts.slice(1).join(':').trim()]);
      } else if (stripped.startsWith('-') || stripped.startsWith('•')) {
        rowEntries.push([stripped.replace(/^[-•·]\s*/, ''), '']);
      }
    }
    if (rowEntries.length > 0) {
      L.rows(slide, M, 1.86, lw, rowEntries.slice(0, 12), { rh: 0.38, fs: 12 });
    }
  }
  
  // Brass 수직 구분선
  slide.addShape('line' as any, {
    x: M + lw + gap / 2, y: 1.50, w: 0, h: 5.2,
    line: { color: C.brass, width: 0.7 },
  });
  
  // 우측: stat 카드
  const rightStats = input.data.right?.stats ?? [];
  let sy = 1.86;
  rightStats.forEach((s: any) => {
    L.stat(slide, rx, sy, rw, s.label ?? '', s.value ?? '', s.unit ?? '', s.sub ?? '', { h: 1.2 });
    sy += 1.36;
  });
  
  // 우측: callouts
  const rightCallouts = input.data.right?.callouts ?? [];
  rightCallouts.forEach((c: any) => {
    const ch = Math.max(1.2, 0.55 + Math.ceil((c.body?.length ?? 0) / 25) * 0.29);
    L.callout(slide, rx, sy, rw, ch, c.kind ?? 'info', c.title ?? '', c.body ?? '');
    sy += ch + 0.18;
  });
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
