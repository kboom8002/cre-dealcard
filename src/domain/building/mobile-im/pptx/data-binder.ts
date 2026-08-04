export interface SectionData {
  title: string;
  content: string;
  tables: ParsedTable[];
  metrics: Record<string, string>;
  confidence?: string;
  boundaryNote?: string;
}

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

export function bindSectionData(
  doc: { title?: string; body: Record<string, any>; sections?: Array<{title: string; markdown: string; confidence?: string; boundary_note?: string}> },
  building?: { area_signal?: string; asset_type?: string; price_band?: string },
): Record<string, SectionData> {
  const result: Record<string, SectionData> = {};

  if (!doc.sections) {
    return result;
  }

  for (const section of doc.sections) {
    const dataKey = section.title.toLowerCase().replace(/\s+/g, '_');
    
    // 테이블 파싱
    const tables = parseMarkdownTable(section.markdown);
    
    // 메트릭 추출
    const metrics = extractMetrics(section.markdown);
    
    result[dataKey] = {
      title: section.title,
      content: section.markdown,
      tables,
      metrics,
      confidence: section.confidence || '확인 중',
      boundaryNote: section.boundary_note
    };
  }

  return result;
}

function parseMarkdownTable(markdown: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const lines = markdown.split('\n');
  let currentTable: ParsedTable | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).filter((_, index, arr) => index > 0 && index < arr.length - 1);
      
      // 구분선 라인(|---|) 확인
      if (cells.every(c => /^[-:]+$/.test(c))) {
        continue; // 헤더 바로 밑의 구분선
      }
      
      if (!currentTable) {
        currentTable = { headers: cells, rows: [] };
      } else {
        currentTable.rows.push(cells);
      }
    } else {
      if (currentTable) {
        tables.push(currentTable);
        currentTable = null;
      }
    }
  }
  
  if (currentTable) {
    tables.push(currentTable);
  }
  
  return tables;
}

function extractMetrics(markdown: string): Record<string, string> {
  const metrics: Record<string, string> = {};
  
  // 금액 (예: 100억, 5,000만원)
  const moneyMatch = markdown.match(/([0-9,]+(?:억|만원|원))/g);
  if (moneyMatch) {
    metrics.money = moneyMatch[0];
  }
  
  // 면적 (예: 100㎡, 50평)
  const areaMatch = markdown.match(/([0-9,.]+(?:㎡|평))/g);
  if (areaMatch) {
    metrics.area = areaMatch[0];
  }
  
  // 비율 (예: 5%, 3.5%)
  const ratioMatch = markdown.match(/([0-9.]+[%])/g);
  if (ratioMatch) {
    metrics.ratio = ratioMatch[0];
  }
  
  return metrics;
}
