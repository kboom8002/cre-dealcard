/**
 * @file pptx-markdown-fallback.ts
 * @description Markdown parsing and fallback slide content generator for PPTX renderer (P1-2)
 */

import { stripMarkdown } from './data-binder';
import { CW, KR, C } from './imlib';

export function parseInlineMarkdown(line: string): Array<{ text: string; options?: { bold?: boolean; italic?: boolean } }> {
  const runs: Array<{ text: string; options?: { bold?: boolean; italic?: boolean } }> = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    if (match[2]) runs.push({ text: match[2], options: { bold: true } });
    else if (match[3]) runs.push({ text: match[3], options: { italic: true } });
    else if (match[4]) runs.push({ text: match[4] });
  }
  return runs.length ? runs : [{ text: stripMarkdown(line) }];
}

/**
 * 아키타입 빌더가 본문을 렌더링하지 못한 경우의 고품질 폴백.
 * 
 * markdown을 파싱하여:
 * - 테이블 → PptxGenJS addTable로 렌더링
 * - 불릿 리스트 → 구조화된 텍스트 블록
 * - 일반 텍스트 → 정돈된 단락
 */
// D33 BL-F G42: 폴백 중복 추적 — 같은 content가 다른 슬라이드에서 폴백으로 재사용되면 차단
const _fallbackContentHashes = new Set<string>();
export function resetFallbackTracker() {
  _fallbackContentHashes.clear();
}

export function addFallbackContent(
  slide: any,
  data: any,
  _theme: any,
  meta?: { archetype?: string; slideIndex?: number; warnings?: string[] }
): boolean {
  // data.content가 없으면 fallback 불필요
  if (!data.content) return true;

  // D33 BL-F G42: 동일 content 중복 폴백 차단
  const contentHash = typeof data.content === 'string' ? data.content.trim().slice(0, 200) : '';
  if (contentHash.length > 0 && _fallbackContentHashes.has(contentHash)) {
    const dupMsg = `[BL-F G42] 폴백 중복 차단: ${meta?.archetype ?? '?'}#${meta?.slideIndex ?? '?'} — 동일 content가 이전 슬라이드에서 이미 폴백 사용됨`;
    console.warn(dupMsg);
    if (meta?.warnings) meta.warnings.push(dupMsg);
    return false;
  }

  const shapes = slide._slideObjects || slide._shapes || [];
  // F1: PptxGenJS addTable()은 _slideObjects에 { _type: 'table' } 형태로 저장되며,
  // h 속성 없이 rowH만 가짐. 테이블 존재 여부를 별도로 감지.
  const hasTable = shapes.some((s: any) =>
    s?._type === 'table' || s?.options?._type === 'table' || s?.arrTabRows != null
  );
  // y >= 1.7 기준: L.head()가 y~1.4~1.65에 추가하는 kicker/title 텍스트를
  // body shape으로 오인하지 않도록 임계값을 높임.
  // w가 슬라이드 너비(>8) 이상인 shape은 배경 rect이므로 제외.
  const hasBodyShapes = hasTable || shapes.some((s: any) => {
    const y = s?.options?.y ?? s?.y ?? 0;
    const h = s?.options?.h ?? s?.h ?? 0;
    const w = s?.options?.w ?? s?.w ?? 0;
    const rH = s?.options?.rowH ?? s?.rowH ?? 0;
    return y >= 1.7 && y < 6.5 && (h > 0.1 || rH > 0) && w < 12;
  });

  if (hasBodyShapes) return true;

  // D32 BL-5: 폴백 발동 기록 — 표가 있어야 할 자리에 불릿이 들어가는 것은 결손
  const archetype = meta?.archetype ?? 'unknown';
  const slideIdx = meta?.slideIndex ?? -1;
  const fallbackMsg = `[BL-5] 폴백 발동: ${archetype} 슬라이드 #${slideIdx} — 아키타입이 본문을 렌더링하지 못해 마크다운 폴백 사용`;
  console.warn(fallbackMsg);
  if (meta?.warnings) {
    meta.warnings.push(fallbackMsg);
    // D37 P0-6: 모든 아키타입 폴백 차단 (빈 면 금지 07 §15.3)
    meta.warnings.push(`[P0-6 BLOCK] ${archetype} 폴백 차단: 아키타입이 본문을 렌더링하지 못함`);
    return false; // 슬라이드 제거 신호
  }

  // D33 BL-F G42: 이 content를 폴백으로 사용했음을 기록
  if (contentHash.length > 0) _fallbackContentHashes.add(contentHash);

  const markdown: string = stripMarkdown(data.content);
  const lines = markdown.split('\n');
  let curY = 1.62;
  const maxY = 6.8;
  const bodyW = CW;
  const bodyX = 0.8;

  // 1차 패스: 테이블 블록과 텍스트 블록으로 그룹화
  const blocks: Array<{ type: 'table'; headers: string[]; rows: string[][] } | { type: 'text'; lines: string[] }> = [];
  let tableHeaders: string[] | null = null;
  let tableRows: string[][] = [];
  let textBuf: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (textBuf.length > 0) {
        blocks.push({ type: 'text', lines: textBuf });
        textBuf = [];
      }
      continue;
    }

    // 마크다운 테이블 행 판별
    if (line.startsWith('|') && line.endsWith('|')) {
      if (textBuf.length > 0) {
        blocks.push({ type: 'text', lines: textBuf });
        textBuf = [];
      }
      const cells = line.slice(1, -1).split('|').map(c => c.trim());
      // 구분선 행 (|---|---|) 스킵
      if (cells.every(c => /^[-:]+$/.test(c))) continue;

      if (!tableHeaders) {
        tableHeaders = cells;
      } else {
        tableRows.push(cells);
      }
    } else {
      if (tableHeaders) {
        blocks.push({ type: 'table', headers: tableHeaders, rows: tableRows });
        tableHeaders = null;
        tableRows = [];
      }
      textBuf.push(line);
    }
  }
  // 잔여 플러시
  if (tableHeaders) blocks.push({ type: 'table', headers: tableHeaders, rows: tableRows });
  if (textBuf.length > 0) blocks.push({ type: 'text', lines: textBuf });

  for (const block of blocks) {
    if (curY >= maxY) break;

    if (block.type === 'table') {
      const tableData = [
        block.headers.map(h => stripMarkdown(h)),
        ...block.rows.map(r => r.map(c => stripMarkdown(c)))
      ];
      // 3-D: 헤더 행 및 요약/공실 행 스마트 테마 적용
      const styledData = tableData.map((row, rowIdx) => {
        const isHeader = rowIdx === 0;
        const isSummary = !isHeader && row.some(c => /^(?:합계|계|총합|총액)\b/.test(c.trim()));
        return row.map(cell => {
          if (isHeader) {
            return { text: cell, options: { fill: { color: C.brassL }, bold: true, color: C.brassD, fontSize: 10 } };
          }
          if (isSummary) {
            return { text: cell, options: { fill: { color: 'F1F5F9' }, bold: true, color: C.ink, fontSize: 9.5 } };
          }
          const isVacant = cell.includes('공실');
          return {
            text: cell,
            options: {
              color: isVacant ? 'D97706' : C.ink,
              bold: isVacant,
              fontSize: 9.5,
            },
          };
        });
      });
      const rowH = 0.32;
      let tableH = styledData.length * rowH;
      const colCount = tableData[0]?.length || 1;

      // W-PPTX-2: 테이블 높이가 안전 영역 초과 시 행 절삭
      if (curY + tableH > maxY && styledData.length > 2) {
        const availableH = maxY - curY;
        const maxRows = Math.max(2, Math.floor(availableH / rowH));
        styledData.splice(maxRows);
        tableH = styledData.length * rowH;
      }

      slide.addTable(styledData as any, {
        x: bodyX, y: curY, w: bodyW,
        rowH,
        colW: Array(colCount).fill(bodyW / colCount),
        border: { type: 'solid', color: C.line, pt: 0.5 },
        margin: [4, 6, 4, 6],
      });
      curY += tableH + 0.15;
    } else {
      // 텍스트 블록 렌더링
      for (const line of block.lines) {
        if (curY >= maxY) break;

        // 헤딩 (###, ##, #)
        const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const text = stripMarkdown(headingMatch[2]);
          const fontSize = level <= 2 ? 14 : 12;
          slide.addText(text, {
            x: bodyX, y: curY, w: bodyW, h: 0.36,
            fontFace: KR, fontSize, bold: true, color: C.ink,
            margin: 0,
          });
          curY += 0.40;
          continue;
        }

        // 불릿 아이템
        if (line.startsWith('-') || line.startsWith('•') || line.startsWith('·')) {
          const text = stripMarkdown(line.replace(/^[-•·]\s*/, ''));
          if (!text) continue;
          const lineH = Math.max(0.28, Math.ceil(text.length / 50) * 0.22);
          slide.addText(text, {
            x: bodyX + 0.3, y: curY, w: bodyW - 0.3, h: lineH,
            fontFace: KR, fontSize: 10, color: C.body,
            bullet: { char: '•' },
            margin: 0, valign: 'top',
          });
          curY += lineH + 0.04;
          continue;
        }

        // blockquote (> ...)
        if (line.startsWith('>')) {
          const text = stripMarkdown(line.replace(/^>\s*/, ''));
          if (!text) continue;
          const lineH = Math.max(0.36, Math.ceil(text.length / 42) * 0.22);
          slide.addShape('rect' as any, {
            x: bodyX, y: curY, w: bodyW, h: lineH + 0.12,
            fill: { color: C.brassT }, 
          });
          slide.addShape('rect' as any, {
            x: bodyX, y: curY, w: 0.05, h: lineH + 0.12,
            fill: { color: C.brass },
          });
          slide.addText(text, {
            x: bodyX + 0.2, y: curY + 0.06, w: bodyW - 0.4, h: lineH,
            fontFace: KR, fontSize: 10, color: C.ink3,
            margin: 0, valign: 'top',
          });
          curY += lineH + 0.20;
          continue;
        }

        // 일반 텍스트
        const text = stripMarkdown(line);
        if (!text || text.length < 3) continue;
        const lineH = Math.max(0.26, Math.ceil(text.length / 50) * 0.20);
        const runs = parseInlineMarkdown(text);
        slide.addText(runs.map(r => ({ text: r.text, options: { ...r.options, fontFace: KR, fontSize: 10, color: C.body } })), {
          x: bodyX, y: curY, w: bodyW, h: lineH,
          margin: 0, valign: 'top',
        });
        curY += lineH + 0.06;
      }
    }
  }
  return true; // W-PPTX-1: 폴백 렌더링 성공
}
