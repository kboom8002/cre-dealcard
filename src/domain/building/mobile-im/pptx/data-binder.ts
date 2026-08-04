export interface SectionData {
  title: string;
  content: string;
  tables: ParsedTable[];
  metrics: Record<string, string>;
  confidence?: string;
  boundaryNote?: string;
  [key: string]: any;
}

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

/**
 * section_type → deck-sequencer dataKey 매핑
 * 
 * 각 section_type은 하나의 primary dataKey에 매핑.
 * property_overview는 building에 매핑하고, summary/land는 body에서 별도 구성.
 */
const SECTION_TYPE_TO_DATA_KEY: Record<string, string> = {
  property_overview: 'building',
  location_access:   'location',
  lease_status:      'rentRoll',
  income_analysis:   'profit',
  risk_check:        'risk',
  investment_thesis: 'comps',
  next_steps:        'process',
};

/**
 * deck-sequencer dataKey → 아키타입 ID 매핑
 * 아키타입별로 어떤 props 형태가 필요한지 결정
 */
const DATA_KEY_ARCHETYPE: Record<string, string> = {
  summary:   'A02',  // StatGrid: leadSentence, metrics[], callouts[]
  location:  'A06',  // Diagram: left{sub,source}, right{sub,rows[],callout}
  land:      'A04',  // Asymmetric75: left{sub,rows}, right{sub,rows,callouts[]}
  building:  'A04',
  rentRoll:  'A03',  // LargeTable: tableHead, tableRows, note, callouts[]
  stability: 'A04',
  profit:    'A05',  // Asymmetric74: left{sub,chartData,note}, right{stats[],callouts[]}
  capital:   'A08',  // DualTable: table1{sub,rows}, table2{sub,rows}, callouts[]
  comps:     'A04',
  risk:      'A07',  // ThreeBlock: blocks[], bottomBar{text}
  process:   'A09',  // Process: steps[], bottomInfo
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
    // 1. section_type으로 primary dataKey 결정
    const sectionType = (section as any).section_type;
    const dataKey = (sectionType && SECTION_TYPE_TO_DATA_KEY[sectionType])
      ? SECTION_TYPE_TO_DATA_KEY[sectionType]
      : sectionType || section.title.toLowerCase().replace(/\s+/g, '_');

    // 2. 테이블/메트릭 기본 파싱
    const tables = parseMarkdownTable(section.markdown);
    const metrics = extractMetrics(section.markdown);

    // 3. 아키타입별 props 변환
    const archetype = DATA_KEY_ARCHETYPE[dataKey];
    const props = transformForArchetype(section.markdown, tables, archetype);

    // 4. 기존 key가 없을 때만 설정 (중복 방지)
    if (!result[dataKey]) {
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

    // property_overview → land/summary에도 파생 데이터 제공
    if (sectionType === 'property_overview') {
      const summaryProps = buildSummaryFromOverview(section.markdown, tables, doc.body);
      if (!result['summary']) result['summary'] = { title: '핵심요약', content: '', tables: [], metrics: {}, ...summaryProps };
      const landProps = buildLandFromOverview(section.markdown, tables);
      if (!result['land']) result['land'] = { title: '토지', content: '', tables: [], metrics: {}, ...landProps };
    }
    
    // income_analysis → capital에도 파생 데이터 제공
    if (sectionType === 'income_analysis') {
      const capitalProps = buildCapitalFromIncome(section.markdown, tables);
      if (!result['capital']) result['capital'] = { title: '자본구조', content: '', tables: [], metrics: {}, ...capitalProps };
    }

    // lease_status → stability에도 파생 데이터 제공
    if (sectionType === 'lease_status') {
      const stabilityProps = transformForArchetype(section.markdown, tables, 'A04');
      if (!result['stability']) result['stability'] = { title: '임대안정성', content: section.markdown, tables, metrics, ...stabilityProps };
    }
  }

  return result;
}

/**
 * 아키타입별 props 변환기
 */
function transformForArchetype(markdown: string, tables: ParsedTable[], archetype?: string): Record<string, any> {
  const lines = markdown.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const plainLines = lines.filter(l => !l.startsWith('|') && !/^[-:]+$/.test(l));

  switch (archetype) {
    case 'A02': return buildA02Props(markdown, tables, plainLines);
    case 'A03': return buildA03Props(tables, plainLines);
    case 'A04': return buildA04Props(tables, plainLines);
    case 'A05': return buildA05Props(markdown, tables, plainLines);
    case 'A06': return buildA06Props(markdown, tables, plainLines);
    case 'A07': return buildA07Props(plainLines);
    case 'A08': return buildA08Props(tables, plainLines);
    case 'A09': return buildA09Props(plainLines);
    default:    return buildGenericProps(markdown, tables, plainLines);
  }
}

/** A02 StatGrid: leadSentence, metrics[], callouts[] */
function buildA02Props(markdown: string, tables: ParsedTable[], lines: string[]): Record<string, any> {
  const leadSentence = findLeadSentence(lines);
  const metrics = extractStatMetrics(tables, lines);
  const callouts = extractCallouts(lines);
  return { leadSentence, metrics, callouts };
}

/** A03 LargeTable: tableHead, tableRows, note, callouts[] */
function buildA03Props(tables: ParsedTable[], lines: string[]): Record<string, any> {
  const t = tables[0];
  return {
    tableHead: t?.headers?.map(stripMarkdown) || [],
    tableRows: t?.rows?.map(r => r.map(stripMarkdown)) || [],
    note: lines.find(l => l.startsWith('>'))?.replace(/^>\s*/, '') || '',
    callouts: extractCallouts(lines),
  };
}

/** A04 Asymmetric75: left{sub, rows}, right{sub, callouts[]} */
function buildA04Props(tables: ParsedTable[], lines: string[]): Record<string, any> {
  const t = tables[0];
  const leftRows = t ? [t.headers.map(stripMarkdown), ...t.rows.map(r => r.map(stripMarkdown))] : [];
  const callouts = extractCallouts(lines);
  const headerLine = lines.find(l => l.startsWith('#'));
  const sub = headerLine ? stripMarkdown(headerLine.replace(/^#+\s*/, '')) : '';
  
  return {
    left: { sub, rows: leftRows },
    right: { sub: '', callouts },
  };
}

/** A05 Asymmetric74: right{stats[], callouts[]} */
function buildA05Props(markdown: string, tables: ParsedTable[], lines: string[]): Record<string, any> {
  const stats = extractStatMetrics(tables, lines);
  const callouts = extractCallouts(lines);
  const sub = lines.find(l => l.startsWith('#'))?.replace(/^#+\s*/, '') || '';
  
  return {
    left: { sub: stripMarkdown(sub), chartData: null, note: '' },
    right: { stats, callouts },
  };
}

/** A06 Diagram: left{sub, source}, right{sub, rows[], callout} */
function buildA06Props(markdown: string, tables: ParsedTable[], lines: string[]): Record<string, any> {
  const sub = lines.find(l => l.startsWith('#'))?.replace(/^#+\s*/, '') || '';
  const bulletItems = extractBulletItems(lines);
  const calloutItem = lines.find(l => l.startsWith('>'));
  
  const rows = bulletItems.map(b => ({
    label: b.title || b.body.split(/[：:]/)[0] || '',
    value: b.body.split(/[：:]/)[1]?.trim() || b.body,
  }));
  
  return {
    left: { sub: stripMarkdown(sub), source: '' },
    right: { 
      sub: '', 
      rows: rows.slice(0, 8),
      callout: calloutItem ? { kind: 'info', title: '', body: stripMarkdown(calloutItem.replace(/^>\s*/, '')) } : undefined,
    },
  };
}

/** A07 ThreeBlock: blocks[], bottomBar */
function buildA07Props(lines: string[]): Record<string, any> {
  const bullets = extractBulletItems(lines);
  const blocks = bullets.slice(0, 3).map(b => ({
    label: stripMarkdown(b.title || ''),
    value: extractBoldValue(b.body) || stripMarkdown(b.body).slice(0, 20),
    description: stripMarkdown(b.body),
  }));
  
  if (blocks.length === 0) {
    const boldItems = extractBoldKeyValues(lines);
    boldItems.slice(0, 3).forEach(bv => {
      blocks.push({ label: bv.key, value: bv.value, description: '' });
    });
  }
  
  const bottomText = lines.find(l => l.startsWith('>'))?.replace(/^>\s*/, '');
  return {
    blocks,
    bottomBar: bottomText ? { text: stripMarkdown(bottomText) } : undefined,
  };
}

/** A08 DualTable: table1{sub, rows}, table2{sub, rows}, callouts[] */
function buildA08Props(tables: ParsedTable[], lines: string[]): Record<string, any> {
  const t1 = tables[0];
  const t2 = tables[1];
  return {
    table1: { sub: '', rows: t1 ? [t1.headers.map(stripMarkdown), ...t1.rows.map(r => r.map(stripMarkdown))] : [] },
    table2: { sub: '', rows: t2 ? [t2.headers.map(stripMarkdown), ...t2.rows.map(r => r.map(stripMarkdown))] : [] },
    callouts: extractCallouts(lines),
  };
}

/** A09 Process: steps[], bottomInfo */
function buildA09Props(lines: string[]): Record<string, any> {
  const numberedItems = lines.filter(l => /^\d+\./.test(l));
  const steps = numberedItems.slice(0, 3).map((l, i) => {
    const match = l.match(/^(\d+)\.\s*(.*)/);
    const content = match ? match[2] : l;
    const parts = content.split(/[：:]/);
    return {
      stepNum: `STEP ${i + 1}`,
      title: stripMarkdown(parts[0] || ''),
      description: stripMarkdown(parts.slice(1).join(':').trim()),
    };
  });

  if (steps.length === 0) {
    const bullets = extractBulletItems(lines);
    bullets.slice(0, 3).forEach((b, i) => {
      steps.push({
        stepNum: `STEP ${i + 1}`,
        title: stripMarkdown(b.title || b.body.slice(0, 30)),
        description: stripMarkdown(b.body),
      });
    });
  }

  return { steps, bottomInfo: '' };
}

/** 일반 폴백 */
function buildGenericProps(markdown: string, tables: ParsedTable[], lines: string[]): Record<string, any> {
  const t = tables[0];
  const callouts = extractCallouts(lines);
  return {
    leadSentence: findLeadSentence(lines),
    tableHead: t?.headers?.map(stripMarkdown) || [],
    tableRows: t?.rows?.map(r => r.map(stripMarkdown)) || [],
    callouts,
    left: { sub: '', rows: t ? [t.headers.map(stripMarkdown), ...t.rows.map(r => r.map(stripMarkdown))] : [] },
    right: { sub: '', callouts },
  };
}

// ══════════════════════════════════════════════════════
// property_overview 파생 데이터 빌더
// ══════════════════════════════════════════════════════

function buildSummaryFromOverview(markdown: string, tables: ParsedTable[], body: Record<string, any>): Record<string, any> {
  const heroCard = body?.heroCard ?? {};
  const lines = markdown.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const metrics: Array<{label: string; value: string; unit?: string}> = [];
  if (heroCard.askingPrice) metrics.push({ label: '매각 희망가', value: heroCard.askingPrice, unit: '' });
  if (heroCard.grossYield) metrics.push({ label: '총 수익률', value: heroCard.grossYield, unit: '' });
  if (heroCard.totalArea) metrics.push({ label: '연면적', value: heroCard.totalArea, unit: '' });
  if (heroCard.vacancy) metrics.push({ label: '공실', value: heroCard.vacancy, unit: '' });
  
  if (metrics.length < 4 && tables.length > 0) {
    const t = tables[0];
    for (const row of t.rows) {
      if (metrics.length >= 8) break;
      if (row.length >= 2) {
        metrics.push({ label: stripMarkdown(row[0]), value: stripMarkdown(row[1]) });
      }
    }
  }

  const callouts = extractCallouts(lines.filter(l => !l.startsWith('|') && !/^[-:]+$/.test(l)));

  return {
    leadSentence: stripMarkdown(heroCard.hookText || findLeadSentence(lines.filter(l => !l.startsWith('|')))),
    metrics,
    callouts,
  };
}

function buildLandFromOverview(markdown: string, tables: ParsedTable[]): Record<string, any> {
  const landKeywords = ['토지', '대지', '용적률', '건폐율', '용도지역', '지목', 'pnu', '면적'];
  const landRows: string[][] = [];
  
  for (const t of tables) {
    for (const row of t.rows) {
      const rowText = row.join(' ').toLowerCase();
      if (landKeywords.some(kw => rowText.includes(kw))) {
        landRows.push(row.map(stripMarkdown));
      }
    }
  }

  return {
    left: { sub: '토지 현황', rows: landRows.length > 0 ? landRows : [] },
    right: { sub: '', callouts: [] },
  };
}

function buildCapitalFromIncome(markdown: string, tables: ParsedTable[]): Record<string, any> {
  const capitalKeywords = ['대출', '자본', 'ltv', '이자', '원금', '상환', '금리'];
  const rows1: string[][] = [];
  const rows2: string[][] = [];
  
  for (const t of tables) {
    for (const row of t.rows) {
      const rowText = row.join(' ').toLowerCase();
      if (capitalKeywords.some(kw => rowText.includes(kw))) {
        (rows1.length < 5 ? rows1 : rows2).push(row.map(stripMarkdown));
      }
    }
  }
  
  return {
    table1: { sub: '자본구조', rows: rows1 },
    table2: { sub: '', rows: rows2 },
    callouts: [],
  };
}

// ══════════════════════════════════════════════════════
// 유틸리티 함수
// ══════════════════════════════════════════════════════

function findLeadSentence(lines: string[]): string {
  const lead = lines.find(l => 
    !l.startsWith('#') && !l.startsWith('|') && !l.startsWith('-') && 
    !l.startsWith('>') && !/^\d+\./.test(l) && l.length > 10
  );
  return stripMarkdown(lead || '');
}

function extractStatMetrics(tables: ParsedTable[], lines: string[]): Array<{label: string; value: string; unit?: string}> {
  const metrics: Array<{label: string; value: string; unit?: string}> = [];
  
  for (const t of tables) {
    for (const row of t.rows) {
      if (row.length >= 2 && metrics.length < 8) {
        metrics.push({
          label: stripMarkdown(row[0]),
          value: stripMarkdown(row[1]),
          unit: row[2] ? stripMarkdown(row[2]) : undefined,
        });
      }
    }
  }

  if (metrics.length === 0) {
    const boldKVs = extractBoldKeyValues(lines);
    boldKVs.slice(0, 8).forEach(bv => {
      metrics.push({ label: bv.key, value: bv.value });
    });
  }

  return metrics;
}

function extractCallouts(lines: string[]): Array<{kind?: string; title: string; body: string}> {
  const callouts: Array<{kind?: string; title: string; body: string}> = [];
  
  for (const line of lines) {
    if (line.startsWith('>')) {
      const content = line.replace(/^>\s*/, '');
      const stripped = stripMarkdown(content);
      if (stripped.length < 5) continue;
      
      const kind = content.includes('⚠') ? 'warn' : 'info';
      const parts = stripped.split(/[：:]/);
      callouts.push({
        kind,
        title: parts.length > 1 ? parts[0].trim() : '',
        body: parts.length > 1 ? parts.slice(1).join(':').trim() : stripped,
      });
    }
  }

  return callouts.slice(0, 4);
}

function extractBulletItems(lines: string[]): Array<{title: string; body: string}> {
  return lines
    .filter(l => l.startsWith('-') || l.startsWith('•') || l.startsWith('·'))
    .map(l => {
      const content = l.replace(/^[-•·]\s*/, '');
      const stripped = stripMarkdown(content);
      const parts = stripped.split(/[：:]/);
      return {
        title: parts.length > 1 ? parts[0].trim() : '',
        body: parts.length > 1 ? parts.slice(1).join(':').trim() : stripped,
      };
    });
}

function extractBoldKeyValues(lines: string[]): Array<{key: string; value: string}> {
  const results: Array<{key: string; value: string}> = [];
  for (const line of lines) {
    const match = line.match(/\*\*(.*?)\*\*\s*[：:||\-|]\s*(.*)/);
    if (match) {
      results.push({ key: match[1].trim(), value: stripMarkdown(match[2].trim()) });
    }
  }
  return results;
}

function extractBoldValue(text: string): string {
  const match = text.match(/\*\*(.*?)\*\*/);
  return match ? match[1] : '';
}

/** Markdown 서식 제거 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[🏢📍📊💰⚠️🎯📋✨🚇✓★▲●◇]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMarkdownTable(markdown: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const lines = markdown.split('\n');
  let currentTable: ParsedTable | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).filter((_, index, arr) => index > 0 && index < arr.length - 1);
      
      if (cells.every(c => /^[-:]+$/.test(c))) {
        continue;
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
  
  const moneyMatch = markdown.match(/([0-9,]+(?:억|만원|원))/g);
  if (moneyMatch) {
    metrics.money = moneyMatch[0];
  }
  
  const areaMatch = markdown.match(/([0-9,.]+(?:㎡|평))/g);
  if (areaMatch) {
    metrics.area = areaMatch[0];
  }
  
  const ratioMatch = markdown.match(/([0-9.]+[%])/g);
  if (ratioMatch) {
    metrics.ratio = ratioMatch[0];
  }
  
  return metrics;
}
