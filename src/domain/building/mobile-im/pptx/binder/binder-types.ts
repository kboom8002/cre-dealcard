/**
 * data-binder 공용 타입 및 매핑 상수 (leaf 모듈 — data-binder.ts를 import하지 않음)
 * data-binder.ts에서 re-export하므로 기존 import 경로는 그대로 유효합니다.
 */
import type { PhotoMeta, StackingPlanFloor, StackingPlanSummary } from '../../types';
import type { Yield } from '../yield-object';

export interface SectionMetricItem {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
}

export interface SectionMetricsRecord {
  length?: number;
  [key: string]: unknown;
}

export interface SectionMetricsArrayMeta {
  money?: string;
  area?: string;
  ratio?: string;
  footTraffic?: unknown;
  catchmentHousehold?: unknown;
  askingPrice?: unknown;
  capRate?: unknown;
  noi?: unknown;
  waleRent?: unknown;
  waleArea?: unknown;
  atRisk12m?: unknown;
}

export type SectionMetrics =
  | (Array<SectionMetricItem | null> & SectionMetricsArrayMeta)
  | SectionMetricsRecord;

export interface SectionCallout {
  kind?: string;
  title?: string;
  body?: string;
  text?: string;
  [key: string]: unknown;
}

export interface SectionLeftPanel {
  sub?: string;
  rows?: string[][];
  source?: string;
  chartData?: unknown;
  note?: string;
  mapImageUrl?: string | null;
  [key: string]: unknown;
}

export interface SectionRightPanel {
  sub?: string;
  rows?: [string, string][];
  stats?: SectionMetricItem[];
  callouts?: Array<SectionCallout | string>;
  callout?: SectionCallout;
  locationGrades?: unknown;
  _hasAutoLocationSummary?: boolean;
  [key: string]: unknown;
}

export interface SectionHeroCard {
  hookText?: string;
  keyInvestmentPoint?: string;
  askingPrice?: string | number;
  askingPriceDisplay?: string;
  askingPriceKrw?: number;
  askingPriceManwon?: number;
  stats?: SectionMetricItem[];
  keyPoints?: string[];
  investmentPoints?: string[];
  [key: string]: unknown;
}

export interface SectionPriceBadge {
  label: string;
  value: string;
  [key: string]: unknown;
}

export interface SectionPillar {
  num?: string;
  number?: string;
  title: string;
  body?: string;
  summary?: string;
  [key: string]: unknown;
}

export interface SectionPoiSpot {
  name?: string;
  category?: string;
  lat?: number;
  lng?: number;
  distanceM?: number;
  walkMinutes?: number;
  [key: string]: unknown;
}

export interface SectionStackingFloorItem {
  floor: string;
  usage?: string;
  use?: string;
  area?: string;
  tenant?: string;
  [key: string]: unknown;
}

export interface SectionBrokerContact {
  name?: string;
  representativeName?: string;
  phone?: string;
  email?: string;
  company?: string;
  registrationNo?: string;
  officeAddress?: string;
  [key: string]: unknown;
}

export interface SectionProcessStep {
  stepNum?: string;
  step?: string | number;
  title: string;
  description?: string;
  body?: string;
  [key: string]: unknown;
}

export interface SectionEquityBreakdown {
  price?: number;
  askingKrw?: number;
  acquisitionTax?: number;
  brokerFee?: number;
  legalFee?: number;
  otherCost?: number;
  totalAcquisitionCost?: number;
  deposit?: number;
  loan?: number;
  equity?: number;
  [key: string]: unknown;
}

export interface SectionLtvScenario {
  ltvPct: number;
  equityBil: string;
  yieldPct: string | number;
  note: string;
  [key: string]: unknown;
}

export interface SectionWaleSummary {
  waleByRentYears: number;
  waleByAreaYears: number;
  atRiskRentPct12m: number;
  [key: string]: unknown;
}

// Transitional non-nullable read compatibility for 5 legacy test fields accessed without `?.` / `!`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NonNullReadCompat<T> = T & any;

export interface SectionProvenanceBadge {
  label: string;
  description?: string;
  score?: string | number;
  [key: string]: unknown;
}

export interface SectionData {
  title: string;
  content: string;
  tables: ParsedTable[];
  metrics: SectionMetrics;
  confidence?: string;
  boundaryNote?: string;
  kicker?: string;
  subtitle?: string;
  address?: string;
  askingPrice?: string | number;
  documentDate?: string;
  areaSignal?: string;
  assetType?: string | null;
  priceBand?: string;
  brokerName?: string;
  representativeName?: string;
  companyName?: string;
  brokerPhone?: string;
  brokerEmail?: string;
  registrationNo?: string;
  officeAddress?: string;
  tags?: string[];
  docno?: string;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  heroCard?: SectionHeroCard;
  left?: SectionLeftPanel;
  right?: NonNullReadCompat<SectionRightPanel>;
  table1?: { title?: string; sub?: string; head?: string[]; rows?: string[][] };
  table2?: { title?: string; sub?: string; head?: string[]; rows?: string[][] };
  tableHead?: string[];
  tableRows?: NonNullReadCompat<string[][]>;
  priceTable?: SectionPriceBadge;
  priceTable2?: SectionPriceBadge;
  blocks?: Array<{ label: string; value: string; description?: string }>;
  checkItems?: string[];
  pillars?: SectionPillar[];
  photoUrl?: string | null;
  photos?: Array<PhotoMeta | string>;
  photoUrls?: string[];
  candidatePhotoUrls?: string[];
  allowMapFallbackPhoto?: boolean;
  photoCaption?: string;
  coordinates?: { lat: number; lng: number } | null;
  mapImageUrl?: string | null;
  cadastralImage?: string | null;
  macroTransitDiagram?: Record<string, unknown> | string | null;
  macroTransitImage?: Record<string, unknown> | string | null;
  poiSpots?: SectionPoiSpot[];
  poiCandidates?: unknown[] | null;
  stackingPlan?: Array<StackingPlanFloor | SectionStackingFloorItem>;
  summary?: StackingPlanSummary | Record<string, unknown> | string | null;
  stackingSummary?: StackingPlanSummary | Record<string, unknown> | string | null;
  totalGrossAreaPy?: number;
  totalExclusiveAreaPy?: number;
  exclusiveRatePct?: number;
  waleYears?: number;
  vacancyRatePct?: number;
  anchorTenantName?: string;
  anchorTenant?: { name?: string; [key: string]: unknown } | string | null;
  brokerContact?: SectionBrokerContact;
  capRateAsIs?: number | string | null;
  steps?: SectionProcessStep[];
  kpiRows?: Array<[string, string] | string[] | Record<string, unknown>>;
  statCards?: SectionMetricItem[];
  equityBreakdown?: NonNullReadCompat<SectionEquityBreakdown>;
  ltvScenarios?: SectionLtvScenario[];
  wale?: NonNullReadCompat<SectionWaleSummary>;
  callout?: NonNullReadCompat<SectionCallout>;
  ownershipRows?: string[][];
  roomTypes?: Array<string[] | Record<string, unknown>>;
  markdown?: string;
  keyPoints?: string[];
  leadSentence?: string;
  callouts?: Array<SectionCallout | string>;
  disclaimer?: string;
  footerText?: string;
  badges?: SectionProvenanceBadge[];
  layout?: string | Record<string, unknown>;
  group?: string | Record<string, unknown>;
  annualRent?: number;
  totalDeposit?: number;
  vacancyPct?: number;
  capRateStabilized?: number;
  stabilizedAssumption?: string;
  station_name?: string;
  station_walk_min?: number | string;
  asking_price_manwon?: number | string;
  ssot_summary?: Record<string, unknown> | null;
  enrichment?: Record<string, unknown> | null;
  overviewRows?: Array<[string, string] | string[]>;
  landUseConfirm?: unknown;
  agendaItems?: unknown[];
  romanNumeral?: string | number | null;
  suppressOnEmpty?: boolean;
  _derived?: boolean;
  _source?: string;
  _yield?: Yield | null;
  _deficiencies?: string[] | Record<string, unknown>;
  [key: string]: unknown;
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
