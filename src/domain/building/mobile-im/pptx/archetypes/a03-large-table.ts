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

export function buildA03LargeTable(input: ArchetypeInput): ArchetypeOutput {
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  let tableHead: string[] = input.data.tableHead || [];
  let tableRows: any[][] = input.data.tableRows || [];
  
  // tableHead가 비어있고 tableRows에 데이터가 있으면 첫 행을 헤더로
  if (tableHead.length === 0 && tableRows.length > 1) {
    tableHead = tableRows[0].map((c: any) => String(c || ''));
    tableRows = tableRows.slice(1);
  }
  
  if (tableHead.length > 0 || tableRows.length > 0) {
    const colCount = Math.max(tableHead.length, ...tableRows.map((r: any[]) => r.length), 1);
    const colW = Array(colCount).fill(CW / colCount);
    
    // CellValue[][] 형태로 변환
    const bodyRows = tableRows.map((r: any[]) =>
      r.map((c: any) => {
        const text = String(c || '');
        return { t: text.replace(/\*\*/g, '') };
      })
    );
    
    L.table(slide, M, 1.86, CW, 
      tableHead.map(h => String(h || '').replace(/\*\*/g, '')),
      bodyRows, colW, { rh: 0.38, bfs: 11, hfs: 10 }
    );
  } else if (input.data.content) {
    // 테이블 없으면 content를 L.rows()로 렌더링
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
      L.rows(slide, M, 1.86, CW, rowEntries.slice(0, 14), { rh: 0.36, fs: 12 });
    }
  }
  
  // Note
  const tableEnd = 1.86 + ((tableRows.length + 1) * 0.38);
  if (input.data.note) {
    L.note(slide, M, tableEnd + 0.10, CW, input.data.note);
  }
  
  // Callouts
  const callouts = input.data.callouts || [];
  callouts.forEach((co: any, i: number) => {
    if (i > 1) return;
    const coGap = 0.20;
    const coW = L.col(2, coGap);
    const x = L.colX(i, coW, coGap);
    L.callout(slide, x, Math.min(tableEnd + 0.40, 5.5), coW, 1.2, co.kind || 'info', co.title || '', co.body || '');
  });
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
