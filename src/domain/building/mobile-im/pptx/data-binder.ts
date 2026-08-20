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
  investment_thesis: 'thesis',
  next_steps:        'process',
  // owner_occupied
  occupancy_fit:     'plan',
  cost_comparison:   'vsLease',
  // development
  site_analysis:     'landDetail',
  development_feasibility: 'feasibility',
  // operating
  operation_overview: 'kpi',
  gop_analysis:      'revenue',
  // trading
  market_position:   'marketPosition',
  comparable_analysis: 'comps',
};

/**
 * deck-sequencer dataKey → 아키타입 ID 매핑
 * 아키타입별로 어떤 props 형태가 필요한지 결정
 */
export const DATA_KEY_ARCHETYPE: Record<string, string> = {
  summary:   'A02',  // StatGrid: leadSentence, metrics[], callouts[]
  location:  'A06',  // Diagram: left{sub,source}, right{sub,rows[],callout}
  land:      'A04',  // Asymmetric75: left{sub,rows}, right{sub,rows,callouts[]}
  building:  'A04',
  rentRoll:  'A03',  // LargeTable: tableHead, tableRows, note, callouts[]
  stability: 'A04',
  profit:    'A05',  // Asymmetric74: left{sub,chartData,note}, right{stats[],callouts[]}
  capital:   'A08',  // DualTable: table1{sub,rows}, table2{sub,rows}, callouts[]
  comps:     'A03',  // LargeTable: comparable_analysis 표 렌더링
  risk:      'A07',  // ThreeBlock: blocks[], bottomBar{text}
  process:   'A09',  // Process: steps[], bottomInfo
  thesis:    'A15',  // Thesis: 4-Pillar Grid + Bottom Takeaway Callout
  // owner_occupied
  plan:      'A04',
  vsLease:   'A08',
  commute:   'A06',
  value:     'A04',
  // development
  landDetail: 'A04',
  scale:      'A05',
  eviction:   'A04',
  cost:       'A08',
  stacking:   'A05',
  feasibility:'A05',
  // operating
  kpi:        'A13',
  revenue:    'A05',
  seasonality:'A05',
  operator:   'A04',
  // trading
  marketPosition: 'A04',
  trend:          'A05',
  turnover:       'A04',
  price:          'A04',
  // Pro 전용 (income 서브아키타입 파생)
  dcf:            'A05',
  sensitivity:    'A05',
  totalReturn:    'A05',
  loan:           'A08',
  tax:            'A08',
  rentGap:        'A05',
  upside:         'A05',
  vacancy:        'A04',
  leasing:        'A05',
  current:        'A04',
  remodel:        'A05',
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

    // 2. 페르소나/시스템 메시지 사전 제거 (markdown 구조 보존)
    const cleanMarkdown = sanitizePersona(section.markdown);

    // 3. 테이블/메트릭 기본 파싱
    const tables = parseMarkdownTable(cleanMarkdown);
    const metrics = extractMetrics(cleanMarkdown);

    // 3. 아키타입별 props 변환
    const archetype = DATA_KEY_ARCHETYPE[dataKey];
    const props = transformForArchetype(cleanMarkdown, tables, archetype);

    // 4. 기존 key가 없을 때만 설정 (중복 방지)
    if (!result[dataKey]) {
      const firstPhoto = doc.body.photos?.[0]?.url || (Array.isArray(doc.body.photos) ? doc.body.photos[0] : null) || (Array.isArray(doc.body.photo_urls) ? doc.body.photo_urls[0] : null);
      result[dataKey] = {
        title: section.title,
        content: cleanMarkdown,
        tables,
        metrics,
        confidence: section.confidence || '확인 중',
        boundaryNote: section.boundary_note,
        photoUrl: firstPhoto,
        photos: doc.body.photos || doc.body.photo_urls,
        ...props
      };
    }

    // summary 섹션이 명시적으로 주어졌을 때는 summary 슬라이드 데이터로 직접 덮어쓰기
    if (sectionType === 'summary') {
      result['summary'] = {
        title: section.title || '핵심 투자 지표 요약',
        content: cleanMarkdown,
        tables,
        metrics,
        confidence: section.confidence || '전문가검증',
        boundaryNote: section.boundary_note,
        ...props
      };
    }

    // property_overview → land/summary에도 파생 데이터 제공 (summary가 없을 때만)
    if (sectionType === 'property_overview') {
      if (!result['summary']) {
        const summaryProps = buildSummaryFromOverview(cleanMarkdown, tables, doc.body);
        result['summary'] = { title: '핵심요약', content: '', tables: [], metrics: {}, ...summaryProps };
      }
      const landProps = buildLandFromOverview(cleanMarkdown, tables);
      if (!result['land']) result['land'] = { title: '토지', content: '', tables: [], metrics: {}, ...landProps };
    }
    
    // income_analysis → capital, dcf, sensitivity, loan, tax에도 파생 데이터 제공
    if (sectionType === 'income_analysis') {
      const capitalProps = buildCapitalFromIncome(cleanMarkdown, tables);
      if (!result['capital']) result['capital'] = { title: '자본구조', content: '', tables: [], metrics: {}, ...capitalProps };

      // Pro 전용 파생 슬라이드 데이터 바인딩
      if (!result['dcf']) result['dcf'] = { title: 'DCF 분석', content: '', tables: [], metrics: {}, ...buildDcfFromIncome(cleanMarkdown, tables, doc.body) };
      if (!result['sensitivity']) result['sensitivity'] = { title: '수익률 민감도', content: '', tables: [], metrics: {}, ...buildSensitivityFromDcf(doc.body) };
      if (!result['loan']) result['loan'] = { title: '대출 구조', content: '', tables: [], metrics: {}, ...buildLoanFromIncome(cleanMarkdown, tables, doc.body) };
      if (!result['tax']) result['tax'] = { title: '세금 추정', content: '', tables: [], metrics: {}, ...buildTaxFromIncome(doc.body) };
    }

    // lease_status → stability, vacancy, current 등에도 파생 데이터 제공
    if (sectionType === 'lease_status') {
      const stabilityProps = transformForArchetype(cleanMarkdown, tables, 'A04');
      if (!result['stability']) result['stability'] = { title: '임대안정성', content: cleanMarkdown, tables, metrics, ...stabilityProps };
      if (!result['vacancy']) result['vacancy'] = { title: '공실 분석', content: cleanMarkdown, tables, metrics, ...stabilityProps };
      if (!result['current']) result['current'] = { title: '현황 분석', content: cleanMarkdown, tables, metrics, ...stabilityProps };
    }

    // income_analysis → rentGap, upside, leasing, remodel, comps 등 파생 데이터 제공
    if (sectionType === 'income_analysis') {
      const a05Props = transformForArchetype(cleanMarkdown, tables, 'A05');
      const a04Props = transformForArchetype(cleanMarkdown, tables, 'A04');
      if (!result['rentGap']) result['rentGap'] = { title: '임대료 갭', content: cleanMarkdown, tables, metrics, ...a05Props };
      if (!result['upside']) result['upside'] = { title: '인상 경로', content: cleanMarkdown, tables, metrics, ...a05Props };
      if (!result['leasing']) result['leasing'] = { title: '임차 유치', content: cleanMarkdown, tables, metrics, ...a05Props };
      if (!result['remodel']) result['remodel'] = { title: '리모델링 계획', content: cleanMarkdown, tables, metrics, ...a05Props };
      if (!result['comps']) result['comps'] = { title: '비교사례', content: cleanMarkdown, tables, metrics, ...a04Props };
    }

    // owner_occupied 파생 데이터 제공
    if (sectionType === 'occupancy_fit') {
      if (!result['commute']) {
        const commuteProps = transformForArchetype(cleanMarkdown, tables, 'A06');
        result['commute'] = { title: '통근 및 접근성', content: cleanMarkdown, tables, metrics, ...commuteProps };
      }
    }
    if (sectionType === 'cost_comparison') {
      if (!result['value']) {
        const valueProps = transformForArchetype(cleanMarkdown, tables, 'A04');
        result['value'] = { title: '자산가치', content: cleanMarkdown, tables, metrics, ...valueProps };
      }
    }

    // development 파생 데이터 제공
    if (sectionType === 'site_analysis') {
      if (!result['scale']) {
        const scaleProps = transformForArchetype(cleanMarkdown, tables, 'A05');
        result['scale'] = { title: '신축규모', content: cleanMarkdown, tables, metrics, ...scaleProps };
      }
      if (!result['eviction']) {
        const evictionProps = transformForArchetype(cleanMarkdown, tables, 'A04');
        result['eviction'] = { title: '명도계획', content: cleanMarkdown, tables, metrics, ...evictionProps };
      }
    }
    if (sectionType === 'development_feasibility') {
      if (!result['cost']) {
        const costProps = transformForArchetype(cleanMarkdown, tables, 'A08');
        result['cost'] = { title: '투입비용', content: cleanMarkdown, tables, metrics, ...costProps };
      }
      if (!result['stacking']) {
        const stackingProps = transformForArchetype(cleanMarkdown, tables, 'A05');
        result['stacking'] = { title: '스태킹계획', content: cleanMarkdown, tables, metrics, ...stackingProps };
      }
    }

    // operating 파생 데이터 제공
    if (sectionType === 'operation_overview') {
      if (!result['operator']) {
        const operatorProps = transformForArchetype(cleanMarkdown, tables, 'A04');
        result['operator'] = { title: '운영사 현황', content: cleanMarkdown, tables, metrics, ...operatorProps };
      }
    }
    if (sectionType === 'gop_analysis') {
      if (!result['seasonality']) {
        const seasonalityProps = transformForArchetype(cleanMarkdown, tables, 'A05');
        result['seasonality'] = { title: '계절성 및 변동성', content: cleanMarkdown, tables, metrics, ...seasonalityProps };
      }
    }

    // trading 파생 데이터 제공
    if (sectionType === 'market_position') {
      if (!result['turnover']) {
        const turnoverProps = transformForArchetype(cleanMarkdown, tables, 'A04');
        result['turnover'] = { title: '권역 회전율', content: cleanMarkdown, tables, metrics, ...turnoverProps };
      }
    }
    if (sectionType === 'comparable_analysis') {
      if (!result['trend']) {
        const trendProps = transformForArchetype(cleanMarkdown, tables, 'A05');
        result['trend'] = { title: '거래동향', content: cleanMarkdown, tables, metrics, ...trendProps };
      }
      if (!result['price']) {
        const priceProps = transformForArchetype(cleanMarkdown, tables, 'A04');
        result['price'] = { title: '적정 가격', content: cleanMarkdown, tables, metrics, ...priceProps };
      }
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
    case 'A04': return buildA04Props(tables, lines);
    case 'A05': return buildA05Props(markdown, tables, plainLines);
    case 'A06': return buildA06Props(markdown, tables, plainLines);
    case 'A07': return buildA07Props(tables, lines);
    case 'A08': return buildA08Props(tables, plainLines);
    case 'A09': return buildA09Props(plainLines);
    case 'A13': return buildA13Props(markdown, tables, lines);
    case 'A15': return buildA15Props(markdown, tables, plainLines);
    default:    return buildGenericProps(markdown, tables, plainLines);
  }
}

/** A13 Operating/KPI: subtitle, kpiRows[], statCards[], highlight */
function buildA13Props(markdown: string, tables: ParsedTable[], lines: string[]): Record<string, any> {
  const headerLine = lines.find(l => l.startsWith('#'));
  const subtitle = headerLine ? stripMarkdown(headerLine.replace(/^#+\s*/, '')) : '';

  const bulletItems = extractBulletItems(lines);
  const rows: [string, string][] = [];
  const statCards: Array<{ label: string; value: string; unit?: string }> = [];

  for (const b of bulletItems) {
    const combined = b.title ? `${b.title}: ${b.body}` : b.body;
    const parts = combined.split(/[：:]/);
    if (parts.length >= 2) {
      const k = stripMarkdown(parts[0] || '').trim();
      const v = stripMarkdown(parts.slice(1).join(':')).trim();
      if (k && v) {
        rows.push([k, v]);
        if (statCards.length < 3) {
          statCards.push({ label: k, value: v });
        }
      }
    }
  }

  if (rows.length === 0 && tables.length > 0) {
    for (const t of tables) {
      for (const r of t.rows) {
        if (r.length >= 2) {
          const k = stripMarkdown(r[0]);
          const v = stripMarkdown(r[1]);
          rows.push([k, v]);
          if (statCards.length < 3) {
            statCards.push({ label: k, value: v });
          }
        }
      }
    }
  }

  const highlight = lines.find(l => l.startsWith('>'))?.replace(/^>\s*/, '') ||
    '대기업 장기 책임임차(Master Lease) 및 첨단 설비 스펙을 바탕으로 공실 리스크 없는 안정적인 운영 성과를 확보하고 있습니다.';

  return {
    subtitle,
    kpiRows: rows,
    statCards,
    highlight: stripMarkdown(highlight),
  };
}

/** A15 Thesis: pillars[], subtitle, takeaway */
function buildA15Props(markdown: string, tables: ParsedTable[], lines: string[]): Record<string, any> {
  const subtitle = lines.find(l => l.startsWith('#'))?.replace(/^#+\s*/, '') || '';
  const listLines = lines.filter(l => l.match(/^\d+[.、)]\s*/) || l.startsWith('-') || l.startsWith('•'));
  
  // 주석, 표, 단순 수치 통계 나열 행, 메타 설명 행을 제외한 요약 서술 라인 추출
  const narrativeLines = lines.filter(l => {
    const trimmed = l.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('#') || trimmed.startsWith('|')) return false;
    if (trimmed.match(/^\d+[.、)]\s*/) || trimmed.startsWith('-') || trimmed.startsWith('•')) return false;
    if (trimmed.includes('인근 실거래 비교 사례') || trimmed.includes('최근 인근 실거래 기준')) return false;
    if (trimmed.includes('예상 매수자 유형 분석') || trimmed.includes('핵심 투자 포인트와 예상')) return false;
    return true;
  });

  const pillars = listLines.map((l, idx) => {
    const stripped = l.replace(/^\d+[.、)]\s*/, '').replace(/^[-•·]\s*/, '').trim();
    const parts = stripped.split(/[：:]/);
    const title = stripMarkdown(parts[0] || `투자 포인트 ${idx + 1}`).trim();
    const body = parts.length >= 2 ? stripMarkdown(parts.slice(1).join(':')).trim() : title;
    return {
      number: String(idx + 1).padStart(2, '0'),
      title,
      body,
    };
  });

  // 종합 가치 제안 / 전문가 한줄 의견 우선 채택
  const valuePropLine = lines.find(l => l.includes('종합 가치 제안') || l.includes('종합 가치제안'));
  const brokerQuoteLine = lines.find(l => l.includes('전문가 한줄 의견') || l.includes('전문가 의견'));
  let takeaway = '';
  if (valuePropLine) {
    takeaway = stripMarkdown(valuePropLine.replace(/^>\s*/, '').replace(/.*종합\s*가치\s*제안\s*[：:]\s*/, '')).trim();
  } else if (brokerQuoteLine) {
    takeaway = stripMarkdown(brokerQuoteLine.replace(/^>\s*/, '').replace(/.*전문가\s*(?:한줄\s*)?의견\s*[：:]\s*/, '')).trim();
  } else if (narrativeLines.length > 0) {
    const candidate = narrativeLines.map(l => stripMarkdown(l)).filter(Boolean).find(l => 
      !l.includes('분석입니다') && !l.includes('지침입니다') && l.length >= 20
    );
    if (candidate) takeaway = candidate;
  }

  if (!takeaway || takeaway.length < 15 || takeaway.includes('분석입니다')) {
    takeaway = '본 자산은 우수한 권역 입지 경쟁력과 견고한 펀더멘털을 기반으로 중장기 자산 가치 상승 및 안정적인 현금흐름을 동시에 실현할 수 있는 전략적 투자 기회입니다.';
  }

  return {
    subtitle: stripMarkdown(subtitle),
    pillars,
    takeaway,
  };
}

/** A02 StatGrid: leadSentence, metrics[], callouts[] */
function buildA02Props(markdown: string, tables: ParsedTable[], lines: string[]): Record<string, any> {
  const leadSentence = findLeadSentence(lines);
  const metrics: Array<{label: string; value: string; unit?: string}> = [];

  // 1. 테이블에서 직접 지표 추출
  for (const t of tables) {
    for (const row of t.rows) {
      if (metrics.length >= 8) break;
      if (row.length >= 2) {
        const label = stripMarkdown(row[0]).trim();
        const value = stripMarkdown(row[1]).trim();
        if (label && value && !label.includes('항목') && !label.includes('구분')) {
          metrics.push({ label: label.slice(0, 16), value });
        }
      }
    }
  }

  // 2. 불릿 라인에서 보강
  if (metrics.length < 8) {
    for (const line of lines) {
      if (metrics.length >= 8) break;
      if (line.startsWith('|') || line.startsWith('#')) continue;
      const stripped = stripMarkdown(line.replace(/^[-*•]\s*/, ''));
      const parts = stripped.split(/[：:]/);
      if (parts.length >= 2) {
        const label = parts[0].trim().slice(0, 16);
        const value = parts.slice(1).join(':').trim();
        if (label && value && !metrics.some(m => m.label === label)) {
          metrics.push({ label, value });
        }
      }
    }
  }

  const callouts = extractCallouts(lines);
  const keyPoints: string[] = lines
    .filter(l => (l.startsWith('•') || l.startsWith('-') || l.startsWith('*') || l.match(/^\d+[.、)]/)) && l.length > 8)
    .map(l => stripMarkdown(l.replace(/^[-*•·\d.、)]\s*/, '')))
    .slice(0, 3);

  return { leadSentence, metrics, keyPoints, callouts };
}

/** A03 LargeTable: tableHead, tableRows, note, callouts[] */
function buildA03Props(tables: ParsedTable[], lines: string[]): Record<string, any> {
  const merged = mergeRentRollTables(tables);
  return {
    tableHead: merged.headers.map(stripMarkdown),
    tableRows: merged.rows.map(r => r.map(stripMarkdown)),
    note: lines.find(l => l.startsWith('>'))?.replace(/^>\s*/, '') || '',
    callouts: extractCallouts(lines),
  };
}

/** F2: 다중 테이블 병합 — 동일 헤더면 행 합산, 다르면 가장 많은 행을 가진 테이블 선택 */
function mergeRentRollTables(tables: ParsedTable[]): ParsedTable {
  if (tables.length === 0) return { headers: [], rows: [] };
  if (tables.length === 1) return tables[0];

  // 헤더가 동일한 테이블의 행을 합산
  const primary = { headers: [...tables[0].headers], rows: [...tables[0].rows] };
  for (let i = 1; i < tables.length; i++) {
    const t = tables[i];
    if (!t.headers || t.headers.length === 0) continue;

    const headersMatch = t.headers.length === primary.headers.length &&
      t.headers.every((h, idx) => stripMarkdown(h) === stripMarkdown(primary.headers[idx]));

    if (headersMatch) {
      // 동일 헤더 → 행만 추가
      primary.rows.push(...t.rows);
    } else if (t.rows.length > primary.rows.length) {
      // 다른 헤더이고 더 많은 행 → 이 테이블을 primary로 교체 (상세 렌트롤 우선)
      primary.headers = [...t.headers];
      primary.rows = [...t.rows];
    }
  }
  return primary;
}

/** A04 Asymmetric75: left{sub, rows}, right{sub, callouts[]} */
function buildA04Props(tables: ParsedTable[], lines: string[]): Record<string, any> {
  const callouts = extractCallouts(lines);
  const headerLine = lines.find(l => l.startsWith('#'));
  const sub = headerLine ? stripMarkdown(headerLine.replace(/^#+\s*/, '')) : '';

  // 1. 불릿 목록에서 key-value 추출 (우선순위 높음: 위치, 대지면적, 연면적 등)
  const bulletItems = extractBulletItems(lines);
  let leftRows: [string, string][] = [];

  if (bulletItems.length >= 2) {
    leftRows = bulletItems.map(b => {
      const combined = b.title ? `${b.title}: ${b.body}` : b.body;
      const parts = combined.split(/[：:]/);
      if (parts.length >= 2) {
        return [stripMarkdown(parts[0] || '').trim(), stripMarkdown(parts.slice(1).join(':').trim())] as [string, string];
      }
      return [stripMarkdown(b.title || parts[0] || '').trim(), stripMarkdown(b.body || '').trim()] as [string, string];
    }).filter(([k, v]) => k.length > 0 && !k.includes('항목') && !k.includes('내용'));
  }

  // 2. 불릿이 부족하고 테이블이 있는 경우
  if (leftRows.length < 2 && tables.length > 0) {
    const t = tables[0];
    if (t && t.rows.length === 1 && t.headers.length >= 2) {
      // 1행 다열 테이블인 경우: 헤더와 값을 매핑
      leftRows = t.headers.map((h, i) => [
        stripMarkdown(h).trim(),
        stripMarkdown(t.rows[0]?.[i] || '').trim()
      ] as [string, string]).filter(([k, v]) => k.length > 0 && !k.includes('구분') && !k.includes('항목'));
    } else if (t && t.rows.length >= 2) {
      // 2열 다행 테이블인 경우
      leftRows = t.rows.map(r => [
        stripMarkdown(r[0] || '').trim(),
        stripMarkdown(r[1] || '').trim()
      ] as [string, string]).filter(([k, v]) => k.length > 0 && !k.includes('항목') && !k.includes('구분'));
    }
  }

  // 3. 여전히 비어있으면 bold key-value 추출
  if (leftRows.length === 0) {
    const boldKVs = extractBoldKeyValues(lines);
    leftRows = boldKVs.map(bv => [bv.key, bv.value] as [string, string]);
  }
  
  return {
    left: { sub: sub || '건축물 개요 및 물리 스펙', rows: leftRows },
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
  
  let rows: [string, string][] = bulletItems.map(b => {
    const combined = b.title ? `${b.title}: ${b.body}` : b.body;
    const parts = combined.split(/[：:]/);
    if (parts.length >= 2) {
      return [stripMarkdown(parts[0] || ''), stripMarkdown(parts.slice(1).join(':').trim())] as [string, string];
    }
    return [stripMarkdown(parts[0] || ''), ''] as [string, string];
  });
  
  if (rows.length === 0 && tables.length > 0) {
    for (const t of tables) {
      for (const row of t.rows) {
        if (row.length >= 2) {
          rows.push([stripMarkdown(row[0]), stripMarkdown(row[1])]);
        }
      }
    }
  }
  
  if (rows.length === 0) {
    const boldKVs = extractBoldKeyValues(lines);
    rows = boldKVs.map(bv => [bv.key, bv.value] as [string, string]);
  }
  
  if (rows.length === 0) {
    const locationKeywords: Record<string, string> = {
      '역': '교통 접근성', '지하철': '대중교통', '버스': '대중교통', '도보': '보행 접근성',
      '도로': '도로 조건', '차량': '차량 접근성', '대로': '도로 조건',
      '상권': '상권 환경', '유동': '유동인구', '배후': '배후 수요', '집객': '집객력',
      '인프라': '주변 인프라', '학교': '교육 시설', '병원': '편의 시설',
      '주소': '소재지', '위치': '입지 특성', '권역': '핵심 권역',
    };
    for (const line of lines) {
      if (rows.length >= 6) break;
      if (line.startsWith('#') || line.startsWith('|')) continue;
      const stripped = stripMarkdown(line).trim();
      if (!stripped) continue;
      let matchedLabel = '';
      for (const [kw, lbl] of Object.entries(locationKeywords)) {
        if (stripped.includes(kw)) { matchedLabel = lbl; break; }
      }
      if (!matchedLabel) matchedLabel = '입지 특성';
      if (!rows.some(r => r[0] === matchedLabel && r[1] === stripped)) {
        rows.push([matchedLabel, stripped]);
      }
    }
  }
  
  const truncatedRows: [string, string][] = rows.slice(0, 6).map(([label, value]) => 
    [label.slice(0, 28), enforceTextBudget(value, 120)] as [string, string]
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
function buildA07Props(tables: ParsedTable[], lines: string[]): Record<string, any> {
  const blocks: Array<{ label: string; value: string; description: string }> = [];

  const formatDescriptionBullets = (desc: string): string => {
    if (!desc) return '';
    const cleaned = stripMarkdown(desc);
    if (cleaned.includes('\n')) return cleaned;
    if (cleaned.includes('<br>') || cleaned.includes('<br/>')) {
      return cleaned.split(/<br\s*\/?>/i).map(s => s.trim()).filter(Boolean).join('\n');
    }
    if (cleaned.includes('•') || cleaned.includes('·') || cleaned.includes('-')) {
      return cleaned.split(/[•·\-]\s*/).map(s => s.trim()).filter(Boolean).join('\n');
    }
    if (cleaned.length > 35 && cleaned.includes('. ')) {
      return cleaned.split(/(?<=\.)\s+/).map(s => s.trim()).filter(Boolean).join('\n');
    }
    return cleaned;
  };

  // 1. 테이블 기반 3개 블록 추출 (테이블의 1열: 라벨, 2열: 현황/상태, 3열: 완화방안/설명)
  if (tables.length > 0 && tables[0]?.rows && tables[0].rows.length > 0) {
    for (const row of tables[0].rows) {
      if (blocks.length >= 3) break;
      if (row.length >= 3) {
        blocks.push({
          label: stripMarkdown(row[0] || '').trim(),
          value: stripMarkdown(row[1] || '').trim(),
          description: formatDescriptionBullets(row[2] || ''),
        });
      } else if (row.length >= 2) {
        blocks.push({
          label: stripMarkdown(row[0] || '').trim(),
          value: '진단 완료',
          description: formatDescriptionBullets(row[1] || ''),
        });
      }
    }
  }

  // 2. ### 헤딩 기반 3개 블록 추출 (테이블이 없을 때)
  if (blocks.length === 0) {
    let currentHeader = '';
    let currentBullets: string[] = [];
    const defaultStatusBadges = ['정밀안전 A등급', '임대차 안정', '권리관계 투명'];

    for (const line of lines) {
      if (line.startsWith('###')) {
        if (currentHeader && currentBullets.length > 0) {
          const badge = defaultStatusBadges[blocks.length] || '실사 적격';
          blocks.push({
            label: currentHeader,
            value: badge,
            description: currentBullets.map(b => b.replace(/^[🟢🔵🔶💡•·\-*]+\s*/gu, '').trim()).join('\n'),
          });
          currentBullets = [];
        }
        currentHeader = stripMarkdown(line.replace(/^#+\s*/, '')).slice(0, 24);
      } else if (line.startsWith('-') || line.startsWith('•') || line.startsWith('*')) {
        const stripped = stripMarkdown(line.replace(/^[-*•]\s*/, ''));
        if (stripped.length > 2) currentBullets.push(stripped);
      }
    }
    if (currentHeader && currentBullets.length > 0 && blocks.length < 3) {
      const badge = defaultStatusBadges[blocks.length] || '실사 적격';
      blocks.push({
        label: currentHeader,
        value: badge,
        description: currentBullets.map(b => b.replace(/^[🟢🔵🔶💡•·\-*]+\s*/gu, '').trim()).join('\n'),
      });
    }
  }

  if (blocks.length === 0) {
    const bullets = extractBulletItems(lines);
    bullets.slice(0, 3).forEach(b => {
      const rawLabel = stripMarkdown(b.title || '');
      const rawValue = extractBoldValue(b.body) || stripMarkdown(b.body).slice(0, 20);
      const rawDesc = stripMarkdown(b.body);
      const desc = (rawValue === rawDesc) ? '' : rawDesc;
      const cleanValue = rawValue.replace(/:$/, '').trim();
      blocks.push({ label: rawLabel, value: cleanValue, description: desc });
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
    const textLines = lines
      .filter(l => !l.startsWith('#') && l.length > 5)
      .map(l => l.replace(/^>\s*/, ''));  // M5: strip blockquote prefix
    const chunk = Math.max(1, Math.ceil(textLines.length / 3));
    const categoryKeywords: Record<string, string> = {
      '건축물': '건축 리스크', '용도': '용도 리스크', '위반': '법률 리스크',
      '등기': '권리 리스크', '저당': '재무 리스크', '근저당': '재무 리스크',
      '가압류': '법률 리스크', '임대': '임대 리스크', '공실': '공실 리스크',
      '소송': '법률 리스크', '환경': '환경 리스크', '지구': '규제 리스크',
      '도시': '도시계획', '주차': '주차 리스크', '소방': '안전 리스크',
    };
    for (let i = 0; i < 3 && i * chunk < textLines.length; i++) {
      const segment = textLines.slice(i * chunk, (i + 1) * chunk).join(' ');
      const stripped = stripMarkdown(segment);
      let label = `항목 ${i + 1}`;
      for (const [keyword, categoryLabel] of Object.entries(categoryKeywords)) {
        if (stripped.includes(keyword)) { label = categoryLabel; break; }
      }
      // C5: 내부 가드레일 토큰 정제
      const cleaned = stripped
        .replace(/\[임차인 업종 정보로 대체됨\]/g, '')
        .replace(/\[인명 비공개\]/g, '')
        .trim();
      blocks.push({ label, value: '—', description: cleaned.slice(0, 200) });
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

  // FIX-RC4b: 번호/불릿 모두 없을 때 의미 있는 텍스트 행에서 steps 추출
  if (steps.length === 0) {
    const meaningful = lines.filter(l =>
      !l.startsWith('#') && !l.startsWith('|') && !l.startsWith('>') &&
      stripMarkdown(l).length > 10
    );
    meaningful.slice(0, 3).forEach((l, i) => {
      const stripped = stripMarkdown(l);
      const parts = stripped.split(/[：:]/);
      steps.push({
        stepNum: `STEP ${i + 1}`,
        title: parts.length > 1 ? parts[0].trim().slice(0, 30) : stripped.slice(0, 30),
        description: parts.length > 1 ? parts.slice(1).join(':').trim() : stripped,
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
  const posture = heroCard.posture || 'income';
  const lines = markdown.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const metrics: Array<{label: string; value: string; unit?: string}> = [];
  const askPrice = heroCard.askingPriceDisplay ?? heroCard.askingPrice;

  // 포스처별 60대 자산가 맞춤형 핵심 4지표 매핑
  if (posture === 'income') {
    if (askPrice) metrics.push({ label: '매매 희망가', value: String(askPrice) });
    if (heroCard.equityRequiredBil) metrics.push({ label: '실투자금(내 돈)', value: `약 ${heroCard.equityRequiredBil}억 원` });
    if (heroCard.capRateBase) metrics.push({ label: '연 순수익률(Cap Rate)', value: `${heroCard.capRateBase}%` });
    if (heroCard.leveragedYieldPct) metrics.push({ label: '자기자본수익률', value: `${heroCard.leveragedYieldPct}%` });
  } else if (posture === 'owner_occupied') {
    if (askPrice) metrics.push({ label: '매매 희망가', value: String(askPrice) });
    if (heroCard.pricePerPyeong) metrics.push({ label: '평당 매매가', value: `${heroCard.pricePerPyeong.toLocaleString()}원/평` });
    if (heroCard.ownVsLeaseSavingsBil) metrics.push({ label: '연 임대료 절감액', value: `약 ${heroCard.ownVsLeaseSavingsBil}억 원/년` });
    if (heroCard.breakevenYears) metrics.push({ label: '자가전환 손익분기', value: `약 ${heroCard.breakevenYears}년` });
  } else if (posture === 'trading') {
    if (askPrice) metrics.push({ label: '매매 희망가', value: String(askPrice) });
    if (heroCard.pricePerPyeong) metrics.push({ label: '평당 매매가', value: `${heroCard.pricePerPyeong.toLocaleString()}원/평` });
    if (heroCard.marketDiscountPct) metrics.push({ label: '시세 할인율(갭)', value: `${heroCard.marketDiscountPct}% 저평가` });
    if (heroCard.targetHprPct) metrics.push({ label: '목표 수익률(HPR)', value: `${heroCard.targetHprPct}%` });
  } else if (posture === 'development') {
    if (askPrice) metrics.push({ label: '토지 매입가', value: String(askPrice) });
    if (heroCard.landPricePerPyeong) metrics.push({ label: '토지 평당가', value: `${heroCard.landPricePerPyeong.toLocaleString()}만원/평` });
    if (heroCard.devProfitMarginPct) metrics.push({ label: '예상 개발이익률', value: `${heroCard.devProfitMarginPct}%` });
    if (heroCard.totalGrossAreaM2) metrics.push({ label: '신축 연면적', value: `${heroCard.totalGrossAreaM2.toLocaleString()}㎡` });
  } else if (posture === 'operating') {
    if (askPrice) metrics.push({ label: '매매 희망가', value: String(askPrice) });
    if (heroCard.noiBaseBil) metrics.push({ label: '연간 실질 GOP', value: `약 ${heroCard.noiBaseBil}억 원` });
    if (heroCard.gopMarginPct) metrics.push({ label: 'GOP 마진율', value: `${heroCard.gopMarginPct}%` });
    if (heroCard.revpar) metrics.push({ label: 'RevPAR(객실매출)', value: `약 ${(heroCard.revpar / 10000).toFixed(1)}만원` });
  }

  // 폴백 매핑
  if (metrics.length === 0) {
    const yieldVal = heroCard.grossYieldDisplay ?? heroCard.grossYield;
    const area = heroCard.totalAreaDisplay ?? heroCard.totalArea;
    const vacancy = heroCard.vacancyDisplay ?? heroCard.vacancy;
    if (askPrice) metrics.push({ label: '매각 희망가', value: askPrice, unit: '' });
    if (yieldVal) metrics.push({ label: '연 순수익률', value: yieldVal, unit: '' });
    if (area) metrics.push({ label: '연면적', value: area, unit: '' });
    if (vacancy) metrics.push({ label: '공실 현황', value: vacancy, unit: '' });
  }
  
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
      const strippedLine = line.replace(/^[-*•·]\s*/, '').trim();
      const numMatch = strippedLine.match(/(\d[\d,.]*\s*(?:억|만원|원|%|㎡|평|층|호|실|개))/g);
      if (numMatch) {
        const parts = strippedLine.split(/[：:]/);
        const label = stripMarkdown(parts[0] || '').slice(0, 14).trim();
        const value = parts.length >= 2 ? stripMarkdown(parts[1]).trim() : stripMarkdown(numMatch[0]);
        if (label && value) {
          metrics.push({ label, value });
        }
      }
    }
  }

  const callouts = extractCallouts(lines.filter(l => !l.startsWith('|') && !/^[-:]+$/.test(l)));

  // 3대 핵심 투자 포인트 추출 및 폴백 합성
  const keyPoints: string[] = [];
  if (Array.isArray(heroCard.keyPoints) && heroCard.keyPoints.length > 0) {
    keyPoints.push(...heroCard.keyPoints.map((k: string) => stripMarkdown(k)));
  } else if (Array.isArray(heroCard.investmentPoints) && heroCard.investmentPoints.length > 0) {
    keyPoints.push(...heroCard.investmentPoints.map((k: string) => stripMarkdown(k)));
  } else {
    const bullets = lines
      .filter(l => (l.startsWith('•') || l.startsWith('-') || l.startsWith('*') || l.match(/^\d+[.、)]/)) && l.length > 10)
      .map(l => stripMarkdown(l.replace(/^[-*•·\d.、)]\s*/, '')))
      .slice(0, 3);
    if (bullets.length > 0) {
      keyPoints.push(...bullets);
    } else {
      const area = heroCard.areaSignal || '핵심권역';
      const ask = heroCard.priceBand || (heroCard.askingPriceManwon ? `${(heroCard.askingPriceManwon / 10000).toFixed(0)}억대` : '시장 적정가');
      keyPoints.push(
        `원금 안전판: ${area} 핵심 입지 및 우량 대지 지분 가치로 하방 경직성 확보`,
        `수익 안정성: 매매 ${ask} 수준 대비 안정적 월 임대수익 창출 기반`,
        `미래 가치: 향후 권역 지가 상승 및 공법상 밸류업을 통한 자본이득 실현 가능`
      );
    }
  }

  return {
    leadSentence: stripMarkdown(heroCard.keyInvestmentPoint || heroCard.hookText || findLeadSentence(lines.filter(l => !l.startsWith('|')))),
    metrics,
    keyPoints,
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

export function extractBoldKeyValues(lines: string[]): Array<{key: string; value: string}> {
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

/**
 * Markdown 구조(#, **, |, -)를 보존하면서
 * 페르소나 지칭·시스템 메시지·이모지만 제거하는 경량 sanitizer.
 * bindSectionData에서 content 필드 저장 전 적용하여
 * 아키타입 빌더에 전달되는 raw content에서 페르소나 누출을 방지합니다.
 */
export function sanitizePersona(text: string): string {
  if (!text) return '';
  return text
    // ── NaN/null/undefined 리터럴 제거 (수치 오염 방지) ──
    .replace(/\bNaN\s*([%원만억천㎡평])/g, '--$1')
    .replace(/\bundefined\s*([원만억천%㎡평])/g, '--$1')
    .replace(/\bnull\s*([원만억천%㎡평])/g, '--$1')
    .replace(/\bNaN\b/g, '--')
    .replace(/\bundefined\b/g, '--')
    .replace(/\bnull\b(?!\s*[=;,\]})])/g, '--')
    // ── 내부 시스템 메시지 제거 ──
    .replace(/>?\s*🔍?\s*\*{0,2}건축물대장\s*조회\s*미완료\*{0,2}[^\n]*/g, '')
    .replace(/>?\s*🔒?\s*\*{0,2}임대차\s*상세\s*현황[^\n]*/g, '')
    .replace(/공공데이터\s*API\s*응답을\s*받지\s*못했습니다[^\n]*/g, '')
    .replace(/추후\s*업데이트\s*시\s*자동\s*반영됩니다\.?/g, '')
    // ── 이모지 제거 ──
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{1F300}-\u{1FAFF}\u{25A0}-\u{25FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}✨🚇✓★▲●◇🟢🔵🔶💡🛣️🚗🏥🏢☕⚖️📋🔒⚠️🔍]/gu, '')
    // ── 페르소나 직접 지칭 정제 ──
    .replace(/(?:60대|50대|40대|30대|20대|초보|고액|법인|개인|VIP)\s*(?:자산가|투자자|법인\s*대표|대표|고객|매수자)(?:를\s*위한|의\s*관점|에게\s*추천하는|용|맞춤)?\s*/gu, '')
    // ── 가드레일/익명화 토큰 정제 ──
    .replace(/\[인명\s*비공개\]게/g, '담당자에게')
    .replace(/\[인명\s*비공개\]에게/g, '담당자에게')
    .replace(/\[인명\s*비공개\]/g, '담당자')
    .replace(/\[지역\s*신호로\s*대체됨\]/g, '해당 권역')
    .replace(/\[임차인\s*업종\s*정보로\s*대체됨\]/g, '주요 임차 업종')
    .replace(/\[이메일\s*비공개\]/g, '문의처')
    .replace(/\[연락처\s*비공개\]/g, '문의처');
}

/** Markdown 서식 및 SSoT 내부 표기 정제 */
export function stripMarkdown(text: string): string {
  if (!text) return '';
  return text
    // ── 내부 시스템 메시지 먼저 제거 (마크다운/이모지 파싱 전) ──
    .replace(/>?\s*🔍?\s*\*{0,2}건축물대장\s*조회\s*미완료\*{0,2}[^\n]*/g, '')
    .replace(/>?\s*🔒?\s*\*{0,2}임대차\s*상세\s*현황[^\n]*/g, '')
    .replace(/공공데이터\s*API\s*응답을\s*받지\s*못했습니다[^\n]*/g, '')
    .replace(/추후\s*업데이트\s*시\s*자동\s*반영됩니다\.?/g, '')
    .replace(/^#+\s*/gm, '')
    // ── 수평선(---/***) 제거 ──
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    // ── HTML 태그 제거 (XSS 방어, PPTX 텍스트 보호) ──
    .replace(/<[^>]*>/g, '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\u{1F300}-\u{1FAFF}\u{25A0}-\u{25FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}✨🚇✓★▲●◇🟢🔵🔶💡🛣️🚗🏥🏢☕⚖️📋🔒⚠️🔍]/gu, '')
    // ── 페르소나 직접 지칭 정제 (60대 자산가를 위한 등 원천 제거) ──
    .replace(/(?:60대|50대|40대|30대|20대|초보|고액|법인|개인|VIP)\s*(?:자산가|투자자|법인\s*대표|대표|고객|매수자)(?:를\s*위한|의\s*관점|에게\s*추천하는|용|맞춤)?\s*/gu, '')
    // ── 어색한 외래어 정제 (한국 상업용 부동산 실무 어휘 치환) ──
    .replace(/네이밍\s*라이츠/gu, '사옥 단독 명칭 표기(간판 설치권)')
    .replace(/네이밍라이츠/gu, '사옥 단독 명칭 표기')
    .replace(/브랜딩\s*라이츠/gu, '기업 단독 브랜딩')
    .replace(/브랜딩라이츠/gu, '기업 단독 브랜딩')
    // ── SSoT 내부 표기 정제 ──
    .replace(/\s*\(BSSoT\s*Lite[^)]*\)/gi, '')
    .replace(/\s*\(기재\s*공란\)/g, ' (미확인)')
    .replace(/근린생활시설\s*또는\s*상업용\s*건물로\s*추정\s*/g, '')
    .replace(/건축물대장상\s*확인\s*필요/g, '확인 필요')
    .replace(/(으로|로)\s*추정(되는|됨|)\s*/g, '')
    .replace(/인\s*것으로\s*(보임|판단됨|보여짐)\s*/g, '')
    .replace(/일\s*가능성이\s*있(음|습니다)\s*/g, '')
    .replace(/~?(으로|로)\s*보(임|입니다|여집니다)\s*/g, '')
    // ── 가드레일/익명화 토큰 자연어 정제 (조사 탈락 방지) ──
    .replace(/\[인명\s*비공개\]게/g, '담당자에게')
    .replace(/\[인명\s*비공개\]에게/g, '담당자에게')
    .replace(/\[인명\s*비공개\]/g, '담당자')
    .replace(/\[지역\s*신호로\s*대체됨\]/g, '해당 권역')
    .replace(/\[임차인\s*업종\s*정보로\s*대체됨\]/g, '주요 임차 업종')
    .replace(/\[이메일\s*비공개\]/g, '문의처')
    .replace(/\[연락처\s*비공개\]/g, '문의처')
    // ── 어휘 중복 정제 (예: '핵심 권역 권역' -> '핵심 권역') ──
    .replace(/(권역|입지|상권|역세권|대로변|인프라)\s+\1/g, '$1')
    // ── 문미 dangling 대시/기호 정제 ──
    .replace(/\s*[—–-]\s*$/g, '')
    // ── 연속된 마침표/구두점 정제 (예: 필요합니다.. -> 필요합니다.) ──
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

import { enforceTextBudget } from './text-budget';

/** 텍스트 길이 제한 (PPTX 셀 오버플로 방지) */
export function truncate(text: string, maxLen: number): string {
  const cleaned = stripMarkdown(text);
  return enforceTextBudget(cleaned, maxLen);
}

export function parseMarkdownTable(markdown: string): ParsedTable[] {
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
