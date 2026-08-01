/**
 * PPTX HTML 파싱 유틸리티
 * js-im의 stripHtml / parseHtmlTable 이식
 */

/** HTML 태그를 제거하고 순수 텍스트로 변환 */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<li>/gi, '\u2022 ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** HTML 테이블을 2D 문자열 배열로 파싱 */
export function parseHtmlTable(html: string): string[][] {
  const rows: string[][] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const cells: string[] = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      cells.push(stripHtml(cellMatch[1]));
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

/** 마크다운 테이블을 2D 문자열 배열로 파싱 */
export function parseMarkdownTable(markdown: string): string[][] {
  const lines = markdown.split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 2) return [];

  return lines
    .filter((_, i) => i !== 1) // separator 행 제거 (---|----|---)
    .map(line =>
      line
        .split('|')
        .filter(cell => cell.trim() !== '')
        .map(cell => cell.trim())
    )
    .filter(row => row.length > 0);
}

/** 숫자를 한국식 포맷 (억/만) 으로 변환 */
export function formatKrwCompact(manwon: number): string {
  if (manwon >= 10000) {
    const eok = Math.floor(manwon / 10000);
    const remainder = manwon % 10000;
    if (remainder === 0) return eok + '\uc5b5';
    return eok + '\uc5b5 ' + remainder.toLocaleString() + '\ub9cc';
  }
  return manwon.toLocaleString() + '\ub9cc\uc6d0';
}
