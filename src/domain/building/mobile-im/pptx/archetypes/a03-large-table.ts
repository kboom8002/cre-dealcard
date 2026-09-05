import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR } from '../imlib';
import type { ProvenanceKind } from '../imlib';
import { enforceTextBudget } from '../text-budget';

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

/** F4: 콘텐츠 유형에 맞는 컬럼 폭 가중 배분 */
function computeSmartColumnWidths(headers: string[], totalW: number): number[] {
  const n = headers.length;
  if (n === 0) return [totalW];
  if (n === 1) return [totalW];
  const narrowKeywords = ['층', '호', '호실', 'floor', '구분', '번호'];
  const weights = headers.map(h => {
    const label = (h || '').toLowerCase().replace(/\s/g, '');
    return narrowKeywords.some(k => label.includes(k)) ? 0.6 : 1.0;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => (w / sum) * totalW);
}

export function buildA03LargeTable(input: ArchetypeInput): ArchetypeOutput {
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');
  
  let tableHead: string[] = input.data.tableHead || [];
  let tableRows: any[][] = input.data.tableRows || [];
  let rowEntries: [string, string][] = [];
  
  // tableHead가 비어있고 tableRows에 데이터가 있으면 첫 행을 헤더로
  if (tableHead.length === 0 && tableRows.length > 1) {
    tableHead = tableRows[0].map((c: any) => String(c || ''));
    tableRows = tableRows.slice(1);
  }
  
  if (tableHead.length > 0 || tableRows.length > 0) {
    const colCount = Math.max(tableHead.length, ...tableRows.map((r: any[]) => r.length), 1);
    const colW = tableHead.length > 0
      ? computeSmartColumnWidths(tableHead, CW)
      : Array(colCount).fill(CW / colCount);
    
    // CellValue[][] 형태로 변환 (합계 행 Slate Tint #F1F5F9 및 공실 셀 Amber Accent #D97706 적용)
    const bodyRows = tableRows.map((r: any[]) => {
      const isSummary = r.some((c: any) => /^(?:합계|계|총합|총액)\b/.test(String(c || '').trim()));
      return r.map((c: any, cIdx: number) => {
        let text = String(c || '').replace(/\*\*/g, '');
        if (text.length > 45) text = text.slice(0, 44) + '…';
        const isVacant = text.includes('공실');
        return {
          t: text,
          fill: isSummary ? 'F1F5F9' : undefined,
          c: isVacant ? 'D97706' : undefined,
          b: isSummary || isVacant || cIdx === 0,
        };
      });
    });
    
    // D29 BL-2: 렌트롤 분할 렌더링 (불변조건 18: 전량 표기)
    // 12행 초과 시 절삭하지 않고 분할 슬라이드로 처리합니다.
    const MAX_ROWS_PER_SLIDE = 12;
    const totalRows = bodyRows.length;
    if (totalRows > MAX_ROWS_PER_SLIDE) {
      // 분할 표기: 첫 슬라이드에만 12행, 나머지는 추가 슬라이드로
      // 각주 유지: "전체 N건 중 M건 표시 (1/K)"
      bodyRows.length = MAX_ROWS_PER_SLIDE;
      // 추가 슬라이드 데이터를 input.data에 기록하여 renderer가 처리
      input.data._splitOverflow = tableRows.slice(MAX_ROWS_PER_SLIDE);
      input.data._splitTotal = totalRows;
      input.data._splitPageLabel = `(1/${Math.ceil(totalRows / MAX_ROWS_PER_SLIDE)})`;
      warnings.push(`렌트롤 ${totalRows}행 → ${Math.ceil(totalRows / MAX_ROWS_PER_SLIDE)}면 분할`);
    }

    const rowCount = bodyRows.length;
    const baseFontSize = colCount <= 4 ? (rowCount > 8 ? 11 : 13) : (colCount <= 6 ? (rowCount > 8 ? 9.5 : 11) : (rowCount > 8 ? 9 : 10));
    const rh = rowCount > 8 ? 0.38 : 0.48;

    // D29 BL-2: 분할 시 각주 유지 (제거 금지)
    if (input.data.note) {
      let note = String(input.data.note).trim();
      // 분할 렌더링 시 페이지 표시 추가
      if (input.data._splitTotal) {
        note = `전체 ${input.data._splitTotal}건 ${input.data._splitPageLabel} ${note}`.trim();
      }
      input.data.note = note;
    }

    L.table(slide, M, 1.80, CW, 
      tableHead.map(h => String(h || '').replace(/\*\*/g, '')),
      bodyRows, colW, { rh, bfs: baseFontSize, hfs: baseFontSize }
    );
  } else if (input.data.content) {
    // 테이블 없으면 content를 L.rows()로 렌더링
    const lines = String(input.data.content).split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 5 && !l.startsWith('#'));
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
      L.rows(slide, M, 1.80, CW, rowEntries.slice(0, 12), { rh: 0.44, fs: 14 });
    }
  }

  const hasNoData = tableHead.length === 0 && tableRows.length === 0 && (!input.data.content || rowEntries.length === 0);

  if (hasNoData) {
    L.callout(slide, M, 1.86, CW, 1.5, 'info', '임대차 현황 데이터 준비 중',
      '상세 임대차 계약 현황(호실별 보증금, 월차임, 관리비, 만기일)은 소유자/중개인 확인 후 업데이트됩니다.');
    warnings.push('렌트롤 데이터 없음 — 폴백 카드 표시');

    // 하단에 2열 안내 카드를 배치하여 공백 해소 및 겹침 방지
    const coGap = 0.20;
    const coW = L.col(2, coGap);
    L.callout(slide, L.colX(0, coW, coGap), 3.60, coW, 2.4, 'info', '임대차 실사 점검 항목',
      '• 층별/호실별 임대차 계약서 및 사업자등록 현황\n• 보증금 총액 및 월 임대료 입금 내역(최근 6개월)\n• 렌트프리, 핏아웃 등 특약 조건 존재 여부');
    L.callout(slide, L.colX(1, coW, coGap), 3.60, coW, 2.4, 'info', '수익률 분석 유의사항',
      '• 상가임대차보호법상 10년 계약갱신요구권 적용 여부\n• 주변 시세 대비 적정 임대료(Market Rent) 갭 분석\n• 향후 명도 가능 여부 및 리모델링/신축 타당성');
  }
  
  // Note
  const calculatedRh = (tableRows.length > 8 ? 0.38 : 0.48);
  const tableEnd = 1.80 + ((Math.min(12, tableRows.length) + 1) * calculatedRh);
  if (input.data.note && !hasNoData && tableEnd + 0.10 + 0.3 <= 6.75) {
    L.note(slide, M, tableEnd + 0.10, CW, input.data.note);
  }
  
  // Callouts (데이터가 있을 때만, 테이블 아래 note와 중복되지 않는 내용만 렌더링)
  if (!hasNoData) {
    const noteText = input.data.note || '';
    const callouts = (input.data.callouts || []).filter((co: any) => {
      // note와 동일한 내용의 콜아웃은 중복이므로 스킵
      if (!co.body) return false;
      const normalizedBody = co.body.replace(/\s+/g, '').toLowerCase();
      const normalizedNote = noteText.replace(/\s+/g, '').toLowerCase();
      return normalizedBody !== normalizedNote && !normalizedNote.includes(normalizedBody) && !normalizedBody.includes(normalizedNote);
    });
    callouts.forEach((co: any, i: number) => {
      if (i > 1) return;
      const coGap = 0.20;
      const coW = L.col(2, coGap);
      const x = L.colX(i, coW, coGap);
      const calloutY = tableEnd + 0.40;
      if (calloutY + 1.2 <= 7.0) {
        L.callout(slide, x, calloutY, coW, 1.2, co.kind || 'info', co.title || '', co.body || '');
      }
    });
  }
  
  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
