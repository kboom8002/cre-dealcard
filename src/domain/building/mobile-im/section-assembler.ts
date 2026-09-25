/**
 * 섹션 조립 엔진: AI 서사와 결정론적 수치 테이블을 결합
 * 
 * 원칙:
 * 1. 수치 테이블은 항상 결정론적 엔진이 생성 (AI 개입 금지)
 * 2. 서사는 AI 우선, 실패 시 템플릿 폴백
 * 3. 조립 시 서사 → 테이블 순서로 결합
 */
export class SectionAssembler {
  /**
   * 서사와 테이블을 결합하여 최종 마크다운을 생성
   */
  static assemble(narrative: string, tables: string): string {
    const parts: string[] = [];
    if (narrative.trim()) parts.push(narrative.trim());
    if (tables.trim()) parts.push(tables.trim());
    return parts.join('\n\n');
  }

  /**
   * 마크다운에서 서사 부분만 추출 (향후 PPTX/PDF 활용)
   */
  static extractNarrative(markdown: string): string {
    const lines = markdown.split('\n');
    const narrativeLines: string[] = [];
    for (const line of lines) {
      if (line.trimStart().startsWith('|') && line.includes('|', 1)) break;
      narrativeLines.push(line);
    }
    return narrativeLines.join('\n').trim();
  }

  /**
   * 마크다운에서 테이블 부분만 추출
   */
  static extractTables(markdown: string): string {
    const lines = markdown.split('\n');
    const tableLines = lines.filter(l =>
      l.trimStart().startsWith('|') || l.trimStart().startsWith('> ⚠️')
    );
    return tableLines.join('\n').trim();
  }
}
