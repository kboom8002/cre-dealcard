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
    
    // income_analysis → capital, dcf, sensitivity, loan, tax에도 파생 데이터 제공
    if (sectionType === 'income_analysis') {
      const capitalProps = buildCapitalFromIncome(section.markdown, tables);
      if (!result['capital']) result['capital'] = { title: '자본구조', content: '', tables: [], metrics: {}, ...capitalProps };

      // Pro 전용 파생 슬라이드 데이터 바인딩
      if (!result['dcf']) result['dcf'] = { title: 'DCF 분석', content: '', tables: [], metrics: {}, ...buildDcfFromIncome(section.markdown, tables, doc.body) };
      if (!result['sensitivity']) result['sensitivity'] = { title: '수익률 민감도', content: '', tables: [], metrics: {}, ...buildSensitivityFromDcf(doc.body) };
      if (!result['loan']) result['loan'] = { title: '대출 구조', content: '', tables: [], metrics: {}, ...buildLoanFromIncome(section.markdown, tables, doc.body) };
      if (!result['tax']) result['tax'] = { title: '세금 추정', content: '', tables: [], metrics: {}, ...buildTaxFromIncome(doc.body) };
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
  if (metrics.length === 0) {
    for (const line of lines) {
      if (metrics.length >= 8) break;
      const numMatch = line.match(/(\d[\d,.]*\s*(?:억|만원|원|%|㎡|평|층|호|실|개))/g);
      if (numMatch) {
        const parts = line.split(/[：:||\-]/);
        const label = stripMarkdown(parts[0] || '').slice(0, 14);
        const value = stripMarkdown(numMatch[0]);
        if (label && value) metrics.push({ label, value });
      }
    }
  }
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
  
  // L.rows()는 RowEntry 튜플 [label, value] 형태를 기대
  let rows: [string, string][] = bulletItems.map(b => {
    const parts = (b.title ? `${b.title}: ${b.body}` : b.body).split(/[：:]/);
    return [stripMarkdown(parts[0] || ''), stripMarkdown(parts.slice(1).join(':').trim() || parts[0])] as [string, string];
  });
  
  // 불릿이 없으면 테이블 행에서 추출
  if (rows.length === 0 && tables.length > 0) {
    for (const t of tables) {
      for (const row of t.rows) {
        if (row.length >= 2) {
          rows.push([stripMarkdown(row[0]), stripMarkdown(row[1])]);
        }
      }
    }
  }
  
  // 그래도 없으면 bold key-value에서 추출
  if (rows.length === 0) {
    const boldKVs = extractBoldKeyValues(lines);
    rows = boldKVs.map(bv => [bv.key, bv.value] as [string, string]);
  }
  
  if (rows.length === 0) {
    const locationKeywords = ['주소', '교통', '역', '도보', '차량', '인프라', '학교', '지하철', '버스', '거리', '위치', '접근'];
    for (const line of lines) {
      if (rows.length >= 5) break;
      const stripped = stripMarkdown(line.replace(/^[-•·]\s*/, ''));
      if (locationKeywords.some(kw => stripped.includes(kw))) {
        const parts = stripped.split(/[：:]/);
        if (parts.length >= 2) {
          rows.push([parts[0].trim().slice(0, 20), enforceTextBudget(parts.slice(1).join(':').trim(), 45)] as [string, string]);
        } else {
          rows.push(['입지 정보', enforceTextBudget(stripped, 45)] as [string, string]);
        }
      }
    }
  }
  
  // Truncate row values to prevent text overflow in PPTX
  const truncatedRows = rows.slice(0, 5).map(([label, value]) => 
    [label.slice(0, 20), enforceTextBudget(value, 45)] as [string, string]
  );

  return {
    left: { sub: stripMarkdown(sub), source: '' },
    right: { 
      sub: '', 
      rows: truncatedRows,
      callout: calloutItem ? { kind: 'info', title: '', body: enforceTextBudget(stripMarkdown(calloutItem.replace(/^>\s*/, '')), 120) } : undefined,
    },
  };
}

/** A07 ThreeBlock: blocks[], bottomBar */
function buildA07Props(lines: string[]): Record<string, any> {
  const bullets = extractBulletItems(lines);
  const blocks = bullets.slice(0, 3).map(b => {
    const rawLabel = stripMarkdown(b.title || '');
    const rawValue = extractBoldValue(b.body) || stripMarkdown(b.body).slice(0, 20);
    const rawDesc = stripMarkdown(b.body);
    // Avoid duplicate: if value equals description, clear description
    const desc = (rawValue === rawDesc) ? '' : rawDesc;
    // Remove trailing colon from value (incomplete data)
    const cleanValue = rawValue.replace(/:$/, '').trim();
    return { label: rawLabel, value: cleanValue, description: desc };
  });
  
  if (blocks.length === 0) {
    const boldItems = extractBoldKeyValues(lines);
    boldItems.slice(0, 3).forEach(bv => {
      blocks.push({ label: bv.key, value: bv.value, description: '' });
    });
  }
  
  if (blocks.length === 0) {
    const numbered = lines.filter(l => /^\d+[\.)\s]/.test(l));
    numbered.slice(0, 3).forEach(l => {
      const content = stripMarkdown(l.replace(/^\d+[\.)\s]*/, ''));
      blocks.push({ label: '', value: content.slice(0, 20) || '—', description: content });
    });
  }
  if (blocks.length === 0 && lines.length > 0) {
    // Split narrative text into 3 blocks
    const textLines = lines.filter(l => !l.startsWith('#') && l.length > 5);
    const chunk = Math.max(1, Math.ceil(textLines.length / 3));
    for (let i = 0; i < 3 && i * chunk < textLines.length; i++) {
      const segment = textLines.slice(i * chunk, (i + 1) * chunk).join(' ');
      blocks.push({ label: `항목 ${i + 1}`, value: '—', description: stripMarkdown(segment).slice(0, 120) });
    }
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

  if (metrics.length < 4) {
    for (const line of lines.filter(l => !l.startsWith('|') && !l.startsWith('#'))) {
      if (metrics.length >= 8) break;
      const numMatch = line.match(/(\d[\d,.]*\s*(?:억|만원|원|%|㎡|평|층|호|실|개))/g);
      if (numMatch) {
        const parts = line.split(/[：:||\-]/);
        metrics.push({ label: stripMarkdown(parts[0] || '').slice(0, 14) || '정보', value: stripMarkdown(numMatch[0]) });
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

/**
 * income_analysis → dcf 파생 (10년 DCF 분석 슬라이드용)
 * doc.body.dcf10Year 또는 income 섹션 테이블/메트릭에서 추출
 */
function buildDcfFromIncome(
  markdown: string,
  tables: ParsedTable[],
  body: Record<string, any>,
): Record<string, any> {
  const dcf = body?.dcf10Year ?? {};
  const lines = markdown.split('\n').map(l => l.trim()).filter(Boolean);

  // doc.body.dcf10Year가 있으면 우선 사용
  if (dcf && Object.keys(dcf).length > 0) {
    const rows1: string[][] = [
      ['항목', '값'],
      ...Object.entries(dcf).slice(0, 6).map(([k, v]) => [k, String(v)]),
    ];
    return {
      table1: { sub: 'DCF 10년 분석', rows: rows1 },
      table2: { sub: '', rows: [] },
      callouts: [],
    };
  }

  // 없으면 markdown 테이블에서 DCF 관련 행 추출
  const dcfKeywords = ['현재가치', 'npv', 'irr', '내부수익률', '할인율', 'dcf', '10년', '투자회수'];
  const dcfRows: string[][] = [];
  for (const t of tables) {
    for (const row of t.rows) {
      const txt = row.join(' ').toLowerCase();
      if (dcfKeywords.some(k => txt.includes(k))) {
        dcfRows.push(row.map(stripMarkdown));
      }
    }
  }

  return {
    table1: { sub: 'DCF 분석', rows: dcfRows.length > 0 ? [['항목', '값'], ...dcfRows] : [['항목', '값'], ['데이터 없음', '-']] },
    table2: { sub: '', rows: [] },
    callouts: [],
  };
}

/**
 * dcf → sensitivity 파생 (수익률 민감도 슬라이드용)
 */
function buildSensitivityFromDcf(body: Record<string, any>): Record<string, any> {
  const sens = body?.sensitivityAnalysis ?? body?.sensitivity ?? {};
  
  if (sens && Object.keys(sens).length > 0) {
    const rows: string[][] = Object.entries(sens)
      .slice(0, 8)
      .map(([k, v]) => [k, String(v)]);
    return {
      left: { sub: '수익률 민감도', rows: [['시나리오', '수익률'], ...rows] },
      right: { sub: '', callouts: [] },
    };
  }

  // 시나리오 3개 기본 플레이스홀더 반환
  return {
    left: {
      sub: '수익률 민감도 분석',
      rows: [
        ['시나리오', '수익률'],
        ['보수적 (-10% 임대)', '- %'],
        ['기본', '- %'],
        ['낙관적 (+10% 임대)', '- %'],
      ],
    },
    right: {
      sub: '',
      callouts: [{ kind: 'info', title: '주의', body: '실제 민감도는 Pro IM 상세 정보 입력 후 산출됩니다.' }],
    },
  };
}

/**
 * income_analysis → loan 파생 (대출구조 슬라이드용)
 */
function buildLoanFromIncome(
  markdown: string,
  tables: ParsedTable[],
  body: Record<string, any>,
): Record<string, any> {
  const loan = body?.loanSimulation ?? body?.loan ?? {};
  const lines = markdown.split('\n').map(l => l.trim()).filter(Boolean);

  if (loan && Object.keys(loan).length > 0) {
    const rows: string[][] = [
      ['항목', '값'],
      ...Object.entries(loan).slice(0, 8).map(([k, v]) => [k, String(v)]),
    ];
    return {
      table1: { sub: '대출 구조', rows },
      table2: { sub: '', rows: [] },
      callouts: [],
    };
  }

  const loanKeywords = ['대출', 'ltv', '이자율', '금리', '담보', '대환', '한도', 'dscr'];
  const loanRows: string[][] = [];
  for (const t of tables) {
    for (const row of t.rows) {
      const txt = row.join(' ').toLowerCase();
      if (loanKeywords.some(k => txt.includes(k))) {
        loanRows.push(row.map(stripMarkdown));
      }
    }
  }

  return {
    table1: { sub: '대출 구조', rows: loanRows.length > 0 ? [['항목', '값'], ...loanRows] : [['항목', '값'], ['데이터 없음', '-']] },
    table2: { sub: '', rows: [] },
    callouts: [],
  };
}

/**
 * income_analysis → tax 파생 (세금 슬라이드용 — 취득세 / 양도세 추정)
 */
function buildTaxFromIncome(body: Record<string, any>): Record<string, any> {
  const tax = body?.taxEstimate ?? body?.tax ?? {};

  if (tax && Object.keys(tax).length > 0) {
    const rows: string[][] = Object.entries(tax)
      .slice(0, 8)
      .map(([k, v]) => [k, String(v)]);
    return {
      left: { sub: '세금 추정', rows: [['항목', '금액'], ...rows] },
      right: { sub: '', callouts: [] },
    };
  }

  return {
    left: {
      sub: '세금 추정 (데이터 미입력)',
      rows: [
        ['항목', '금액'],
        ['취득세 (추정)', '-'],
        ['법인 취득세 중과', '-'],
        ['양도소득세 (추정)', '-'],
        ['종합부동산세 (연간 추정)', '-'],
      ],
    },
    right: {
      sub: '',
      callouts: [{ kind: 'warn', title: '주의', body: '세금 추정액은 Pro IM 상세 입력 후 확정됩니다. 반드시 세무사와 협의하세요.' }],
    },
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

/** Markdown 서식 및 SSoT 내부 표기 정제 */
export function stripMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[🏢📍📊💰⚠️🎯📋✨🚇✓★▲●◇]/gu, '')
    // ── 내부 시스템 메시지 제거 ──
    .replace(/>\s*🔍?\s*\*{0,2}건축물대장\s*조회\s*미완료\*{0,2}[^\n]*/g, '')
    .replace(/공공데이터\s*API\s*응답을\s*받지\s*못했습니다[^\n]*/g, '')
    .replace(/추후\s*업데이트\s*시\s*자동\s*반영됩니다\.?/g, '')
    // ── SSoT 내부 표기 정제 ──
    .replace(/\s*\(BSSoT\s*Lite[^)]*\)/gi, '')
    .replace(/\s*\(기재\s*공란\)/g, ' (미확인)')
    .replace(/근린생활시설\s*또는\s*상업용\s*건물로\s*추정\s*/g, '')
    .replace(/건축물대장상\s*확인\s*필요/g, '확인 필요')
    .replace(/(으로|로)\s*추정(되는|됨|)\s*/g, '')
    .replace(/인\s*것으로\s*(보임|판단됨|보여짐)\s*/g, '')
    .replace(/일\s*가능성이\s*있(음|습니다)\s*/g, '')
    .replace(/~?(으로|로)\s*보(임|입니다|여집니다)\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

import { enforceTextBudget } from './text-budget';

/** 텍스트 길이 제한 (PPTX 셀 오버플로 방지) */
export function truncate(text: string, maxLen: number): string {
  const cleaned = stripMarkdown(text);
  return enforceTextBudget(cleaned, maxLen);
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
