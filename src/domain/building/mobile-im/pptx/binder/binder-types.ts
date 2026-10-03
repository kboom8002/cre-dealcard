/**
 * data-binder 공용 타입 및 매핑 상수 (leaf 모듈 — data-binder.ts를 import하지 않음)
 * data-binder.ts에서 re-export하므로 기존 import 경로는 그대로 유효합니다.
 */
import type { Yield } from '../yield-object';

export interface SectionData {
  title: string;
  content: string;
  tables: ParsedTable[];
  metrics: Record<string, any>;
  confidence?: string;
  boundaryNote?: string;
  kicker?: string;
  subtitle?: string;
  address?: string;
  askingPrice?: string | number;
  documentDate?: string;
  areaSignal?: string;
  assetType?: string;
  priceBand?: string;
  brokerName?: string;
  companyName?: string;
  tags?: string[];
  docno?: string;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  heroCard?: any;
  left?: any;
  right?: any;
  table1?: { title?: string; sub?: string; head?: string[]; rows?: string[][] };
  table2?: { title?: string; sub?: string; head?: string[]; rows?: string[][] };
  tableHead?: string[];
  tableRows?: any;
  priceTable?: any;
  priceTable2?: any;
  blocks?: Array<{ label: string; value: string; description?: string }>;
  checkItems?: string[];
  pillars?: any[];
  photoUrl?: string;
  photos?: import('../../types').PhotoMeta[];
  photoUrls?: string[];
  coordinates?: { lat: number; lng: number } | null;
  mapImageUrl?: string | null;
  cadastralImage?: string | null;
  macroTransitDiagram?: any;
  macroTransitImage?: any;
  poiSpots?: any[];
  stackingPlan?: any[];
  summary?: any;
  stackingSummary?: any;
  totalGrossAreaPy?: number;
  totalExclusiveAreaPy?: number;
  exclusiveRatePct?: number;
  waleYears?: number;
  vacancyRatePct?: number;
  anchorTenantName?: string;
  anchorTenant?: any;
  brokerContact?: any;
  capRateAsIs?: any;
  steps?: any[];
  kpiRows?: any[];
  statCards?: any[];
  equityBreakdown?: any;
  ltvScenarios?: any[];
  ownershipRows?: any[];
  roomTypes?: any[];
  markdown?: string;
  keyPoints?: any[];
  leadSentence?: string;
  callouts?: any[];
  disclaimer?: string;
  footerText?: string;
  badges?: any[];
  layout?: any;
  group?: any;
  annualRent?: number;
  totalDeposit?: number;
  vacancyPct?: number;
  capRateStabilized?: number;
  stabilizedAssumption?: string;
  station_name?: string;
  station_walk_min?: number | string;
  asking_price_manwon?: number | string;
  ssot_summary?: any;
  enrichment?: any;
  _derived?: boolean;
  _source?: string;
  _yield?: Yield;
  _deficiencies?: any;
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
export const SECTION_TYPE_TO_DATA_KEY: Record<string, string> = {
  property_overview: 'building',
  location_access:   'location',
  location_analysis: 'location',
  market_location:   'location',
  market_analysis:   'location',
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
  scale_plan:        'scale',
  eviction_plan:     'eviction',
  cost_plan:         'cost',
  stacking_plan:     'stackingPlan',
  // operating
  operation_overview: 'kpi',
  gop_analysis:      'revenue',
  // trading
  market_position:   'marketPosition',
  comparable_analysis: 'comps',
  // D37 income 15면 확장
  decision_snapshot: 'summary',         // A02 stat-grid
  market_rent_gap:   'rentGap',         // A05
  value_add_plan:    'valueAdd',        // A05 → 기존 카멜케이스 매핑 활용
  stabilized_scenario: 'stability',     // A04
  evidence_status:   'checklist',       // A12
  title_rights:      'titleRights',     // A04 appendix
  ownership:         'titleRights',     // A04 appendix
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
  capital:   'A16',  // InvestmentStructure: equityBreakdown, ltvScenarios, negativeLeverage
  comps:     'A03',  // LargeTable: comparable_analysis 표 렌더링
  risk:      'A07',  // ThreeBlock: blocks[], bottomBar{text}
  process:   'A09',  // Process: steps[], bottomInfo
  thesis:    'A15',  // Thesis: 4-Pillar Grid + Bottom Takeaway Callout
  titleRights: 'A04',  // 권리관계: 등기, 근저당, 압류 등
  checklist:   'A18',  // 체크리스트: 결손 항목 이관 리스트 및 실사 확인사항 (A18 2-column card)
  comparables: 'A03',  // 비교사례: 인근 거래 사례 표
  farUpside:   'A04',  // 용적률 여유: 잔여 용적률 및 증축 잠재력 (R-INC-02)
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
  stacking:   'A17',
  stackingPlan: 'A22',
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
  valueAdd:       'A05',  // D37: value_add_plan
};
