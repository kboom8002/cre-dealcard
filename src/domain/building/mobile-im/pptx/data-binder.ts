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

const SECTION_TYPE_TO_DATA_KEYS: Record<string, string[]> = {
  property_overview: ['building', 'summary', 'land'],
  location_access: ['location'],
  lease_status: ['rentRoll', 'stability'],
  income_analysis: ['profit', 'capital'],
  risk_check: ['risk'],
  investment_thesis: ['comps'],
  next_steps: ['process']
};

export function bindSectionData(
  doc: { title?: string; body: Record<string, any>; sections?: Array<{title: string; markdown: string; confidence?: string; boundary_note?: string; section_type?: string}> },
  building?: { area_signal?: string; asset_type?: string; price_band?: string },
): Record<string, SectionData> {
  const result: Record<string, SectionData> = {};

  if (!doc.sections) {
    return result;
  }

  for (const section of doc.sections) {
    let dataKeys: string[] = [];
    if (section.section_type && SECTION_TYPE_TO_DATA_KEYS[section.section_type]) {
      dataKeys = SECTION_TYPE_TO_DATA_KEYS[section.section_type];
    } else {
      dataKeys = [section.title.toLowerCase().replace(/\s+/g, '_')];
    }
    
    // 테이블 파싱
    const tables = parseMarkdownTable(section.markdown);
    
    // 메트릭 추출
    const metrics = extractMetrics(section.markdown);

    // Markdown props 추출
    const props = extractMarkdownProps(section.markdown, tables);
    
    for (const dataKey of dataKeys) {
      result[dataKey] = {
        title: section.title,
        content: section.markdown,
        tables,
        metrics,
        confidence: section.confidence || '확인 중',
        boundaryNote: section.boundary_note,
        ...props
      };
    }
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

function extractMarkdownProps(markdown: string, tables: ParsedTable[]): Record<string, any> {
  const lines = markdown.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // 첫 단락: 헤더(#), 테이블(|), 리스트(-, 1.)가 아닌 첫 번째 줄
  const leadSentence = lines.find(l => !l.startsWith('#') && !l.startsWith('|') && !l.startsWith('-') && !/^\d+\./.test(l)) || '';
  
  // Callouts: '- 제목: 내용' 또는 '- 내용' 형태
  const callouts = lines
    .filter(l => l.startsWith('-'))
    .map(l => {
      const content = l.substring(1).trim();
      const parts = content.split(':');
      if (parts.length > 1) {
        return { title: parts[0].trim(), body: parts.slice(1).join(':').trim() };
      }
      return { title: '', body: content };
    });
    
  // Steps: '1. 제목: 내용' 형태
  const steps = lines
    .filter(l => /^\d+\./.test(l))
    .map(l => {
      const match = l.match(/^(\d+)\.\s*(.*)/);
      if (match) {
        const stepNum = match[1];
        const content = match[2];
        const parts = content.split(':');
        if (parts.length > 1) {
          return { stepNum, title: parts[0].trim(), description: parts.slice(1).join(':').trim() };
        }
        return { stepNum, title: content, description: '' };
      }
      return null;
    })
    .filter(Boolean);
    
  // Blocks: '**Key**: Value' 형태
  const blocks = lines
    .filter(l => l.includes('**'))
    .map(l => {
      const match = l.match(/\*\*(.*?)\*\*\s*[:-]?\s*(.*)/);
      if (match) {
        return { label: match[1].trim(), value: match[2].trim(), description: '' };
      }
      return null;
    })
    .filter(Boolean);
    
  // Table head/rows
  let tableHead: string[] = [];
  let tableRows: string[][] = [];
  if (tables.length > 0) {
    tableHead = tables[0].headers;
    tableRows = tables[0].rows;
  }
  
  // A04/A05/A06 left/right split
  // 심플하게 테이블을 왼쪽, 텍스트/콜아웃을 오른쪽으로 배치
  const left = { sub: '', rows: tableRows };
  const right = { sub: '', callouts };
  
  return {
    leadSentence,
    tableHead,
    tableRows,
    callouts,
    steps,
    blocks,
    left,
    right
  };
}
