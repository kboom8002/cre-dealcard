import {
  normalizeStationName,
  findLeadSentence,
  extractStatMetrics,
  extractCallouts,
  extractBulletItems,
  extractBoldKeyValues,
  extractBoldValue,
  sanitizePersona,
  stripMarkdown,
  truncate,
  parseMarkdownTable,
  extractMetrics
} from './binder/binder-utils';
import {
  buildCapitalFromIncome,
  buildFarUpsideProps,
  buildDcfFromIncome,
  buildSensitivityFromDcf,
  buildLoanFromIncome,
  buildTaxFromIncome,
  buildOwnerOccupiedPlanProps,
  buildOwnerOccupiedVsLeaseProps,
  buildOwnerOccupiedCommuteProps,
  buildOwnerOccupiedValueProps,
  buildDevelopmentLandDetailProps,
  buildDevelopmentScaleProps,
  buildDevelopmentEvictionProps,
  buildDevelopmentCostProps,
  buildDevelopmentFeasibilityProps,
  buildOperatingKpiProps,
  buildOperatingRevenueProps,
  buildOperatingSeasonalityProps,
  buildOperatingOperatorProps
} from './binder/posture-builders';
import {
  bindInstitutionalTemplateData,
  bindCorporateTemplateData,
  bindCommercialTemplateData,
  bindDevelopmentTemplateData,
  bindSpecializedTemplateData
} from './binder/premium-binders';
import {
  bindFromIMCore,
  bindFromExternalData,
  bindFromClaimRegistry
} from './binder/core-binders';
import {
  transformForArchetype,
  buildA13Props,
  buildA15Props,
  buildA17Props,
  buildA22Props,
  buildA11Props,
  buildA12Props,
  buildA18Props,
  buildA02Props,
  buildA03Props,
  mergeRentRollTables,
  buildA04Props,
  buildA05Props,
  buildA06Props,
  buildA07Props,
  buildA08Props,
  buildA09Props,
  buildGenericProps,
  buildSummaryFromOverview,
  buildLandFromOverview,
  buildA16Props
} from './binder/archetype-builders';
import { formatPyeong } from '@/lib/utils/area-conversion';

export {
  normalizeStationName,
  findLeadSentence,
  extractStatMetrics,
  extractCallouts,
  extractBulletItems,
  extractBoldKeyValues,
  extractBoldValue,
  sanitizePersona,
  stripMarkdown,
  truncate,
  parseMarkdownTable,
  extractMetrics
};
export {
  buildCapitalFromIncome,
  buildFarUpsideProps,
  buildDcfFromIncome,
  buildSensitivityFromDcf,
  buildLoanFromIncome,
  buildTaxFromIncome,
  buildOwnerOccupiedPlanProps,
  buildOwnerOccupiedVsLeaseProps,
  buildOwnerOccupiedCommuteProps,
  buildOwnerOccupiedValueProps,
  buildDevelopmentLandDetailProps,
  buildDevelopmentScaleProps,
  buildDevelopmentEvictionProps,
  buildDevelopmentCostProps,
  buildDevelopmentFeasibilityProps
};
export {
  bindInstitutionalTemplateData,
  bindCorporateTemplateData,
  bindCommercialTemplateData,
  bindDevelopmentTemplateData,
  bindSpecializedTemplateData
};
export {
  bindFromIMCore,
  bindFromExternalData,
  bindFromClaimRegistry
};
export {
  transformForArchetype,
  buildA13Props,
  buildA15Props,
  buildA17Props,
  buildA22Props,
  buildA11Props,
  buildA12Props,
  buildA18Props,
  buildA02Props,
  buildA03Props,
  mergeRentRollTables,
  buildA04Props,
  buildA05Props,
  buildA06Props,
  buildA07Props,
  buildA08Props,
  buildA09Props,
  buildGenericProps,
  buildSummaryFromOverview,
  buildLandFromOverview,
  buildA16Props
};

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
  photos?: import('../types').PhotoMeta[];
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

import { buildYieldFromHeroCard, buildYieldFromIMCore, yieldLabel, type Yield } from './yield-object';
import type { ClaimRegistry } from '@/domain/building/im-core/claim-registry';
import type { PermitZoneResult } from '@/domain/building/im-core/permit-zone';
import type { ConvertedDepositResult, EffectiveRentResult } from '@/domain/building/im-core/lease-calc';
import type { KoreanLegalFields } from '@/domain/building/im-core/korean-legal';
import { calculateWALE, type LeaseUnit, type WaleResult } from '../wale-calculator';
import { PRIME_TEMPLATE_ALIASES } from './pptx-theme';
import { calculateSetbackRatio, inferTenantCategory } from './archetypes/a22-stacking-plan';
import type { StackingPlanFloor, StackingPlanSummary } from '../types';
/**
 * section_type → deck-sequencer dataKey 매핑
 * 
 * 각 section_type은 하나의 primary dataKey에 매핑.
 * property_overview는 building에 매핑하고, summary/land는 body에서 별도 구성.
 */
const SECTION_TYPE_TO_DATA_KEY: Record<string, string> = {
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

export function bindSectionData(
  doc: { title?: string; body: Record<string, any>; sections?: Array<{title: string; markdown: string; confidence?: string; boundary_note?: string; section_type?: string}> },
  building?: { area_signal?: string; asset_type?: string; price_band?: string },
  templateId?: string,
): Record<string, SectionData> {
  const result: Record<string, SectionData> = {};
  const posture = doc.body?.investment_posture
    || doc.body?.identity?.investmentPosture
    || doc.body?.posture
    || 'income';
  // D32 BL-6: 결손 문구 수집 배열 (체크리스트 이관용)
  const collectedDeficiencies: string[] = [];

  if (!doc.sections || doc.sections.length === 0) {
    return result;
  }

  for (const section of doc.sections) {
    // 1. section_type으로 primary dataKey 결정 (다양한 section 객체 스키마 지원)
    const sec = section as Record<string, any>;
    const sectionType = sec.section_type
      || sec.type
      || sec.sectionType
      || sec.sectionId
      || (
        section.title?.includes('사옥으로') ? 'occupancy_fit' :
        section.title?.includes('임차 유지') ? 'cost_comparison' :
        section.title?.includes('왜 지금') ? 'investment_thesis' :
        section.title?.includes('어떤 자산') ? 'property_overview' :
        section.title?.includes('입지') ? 'location_access' :
        section.title?.includes('권리관계') ? 'title_rights' :
        section.title?.includes('체크리스트') ? 'checklist' :
        section.title?.includes('다음 단계') ? 'next_steps' :
        section.title?.includes('리스크') ? 'risk_check' : undefined
      );
    const dataKey = (sectionType && SECTION_TYPE_TO_DATA_KEY[sectionType])
      ? SECTION_TYPE_TO_DATA_KEY[sectionType]
      : sectionType || section.title.toLowerCase().replace(/\s+/g, '_');

    // 2. D32 BL-6: 결손 문구 추출 → 삭제 대신 체크리스트로 이관
    const deficiencyPatterns = [
      /건축물대장\s*조회\s*미완료/,
      /임대차\s*상세\s*현황.*미확보/,
      /공공데이터\s*API\s*응답을\s*받지\s*못했습니다/,
      /조회\s*미완료/,
      /확인\s*필요/,
      /미확보/,
      /자료\s*없음/,
    ];
    const deficiencyItems: string[] = [];
    // D38 BL-1: 내부 dataKey → 한국어 섹션 라벨 매핑 (Rule 2 CRE 용어 준수)
    const SECTION_LABELS: Record<string, string> = {
      building: '자산 개요', location: '입지 분석', rentRoll: '임대차',
      profit: '수익 분석', risk: '리스크', thesis: '투자 논거',
      process: '거래 절차', checklist: '체크리스트',
    };
    const sectionLabel = SECTION_LABELS[dataKey] || dataKey;
    const mdLines = (section.markdown || '').split('\n');
    for (const line of mdLines) {
      const trimmed = line.replace(/^[>\s*#\-•·]+/, '').trim();
      if (trimmed && deficiencyPatterns.some(p => p.test(trimmed))) {
        // 테이블 행이면 파이프 분리 후 의미 있는 셀만 추출
        let cleanItem: string;
        if (trimmed.includes('|')) {
          const cells = trimmed.split('|').map(c => c.trim()).filter(Boolean);
          cleanItem = stripMarkdown(cells.join(' · '));
        } else {
          cleanItem = stripMarkdown(trimmed);
          // 긴 문단이면 결손 패턴이 매칭된 단일 문장만 추출
          if (cleanItem.length > 60) {
            const sentences = cleanItem.split(/(?<=[.?!])\s+/);
            const matched = sentences.find(s => deficiencyPatterns.some(p => p.test(s)));
            cleanItem = matched ? matched.trim() : cleanItem;
          }
        }
        if (cleanItem.length > 60) {
          cleanItem = cleanItem.slice(0, 57) + '...';
        }
        deficiencyItems.push(`[${sectionLabel}] ${cleanItem}`);
      }
    }
    if (deficiencyItems.length > 0) {
      collectedDeficiencies.push(...deficiencyItems);
    }

    // 페르소나/시스템 메시지 사전 제거 (markdown 구조 보존)
    const cleanMarkdown = sanitizePersona(section.markdown);

    // 3. 테이블/메트릭 기본 파싱
    const tables = parseMarkdownTable(cleanMarkdown);
    const metrics = extractMetrics(cleanMarkdown);

    // 3. 아키타입별 props 변환
    const archetype = DATA_KEY_ARCHETYPE[dataKey];
    const props = transformForArchetype(cleanMarkdown, tables, archetype, doc.body);

    // 4. 기존 key가 없거나, 기존 key가 파생 폴백(_derived)인 경우 명시적 섹션으로 덮어씀 (중복 방지 및 명시적 섹션 우선)
    if (!result[dataKey] || result[dataKey]._derived) {
      const resolvePhotoUrl = (p: any): string | null => {
        if (!p) return null;
        if (typeof p === 'string') return p;
        if (typeof p === 'object' && p.url) return String(p.url);
        if (typeof p === 'object' && p.path) return String(p.path);
        return null;
      };
      const firstPhoto = resolvePhotoUrl(doc.body.photos_v2?.[0])
        ?? resolvePhotoUrl(doc.body.photos?.[0])
        ?? (Array.isArray(doc.body.photo_urls) ? doc.body.photo_urls[0] : null);
      result[dataKey] = {
        title: section.title,
        content: cleanMarkdown,
        tables,
        metrics,
        confidence: section.confidence || '확인 중',
        boundaryNote: section.boundary_note,
        photoUrl: firstPhoto,
        photos: doc.body.photos_v2 || doc.body.photos || doc.body.photo_urls,
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
        confidence: section.confidence || '미확인',
        boundaryNote: section.boundary_note,
        ...props
      };
    }

    // property_overview → land/summary에도 파생 데이터 제공 (summary가 없을 때만)
    if (sectionType === 'property_overview') {
      if (!result['summary']) {
        const summaryProps = buildSummaryFromOverview(cleanMarkdown, tables, doc.body);
        result['summary'] = { title: '핵심요약', content: '', tables: [], metrics: {}, _derived: true, ...summaryProps };
        // D33 BL-C: Yield 단일 객체를 dataMap 최상위에 주입 — 전 슬라이드 공유
        if (summaryProps._yield) {
          result._yield = summaryProps._yield;
        }
      }
      // V-World 데이터(_source 있음)가 없을 때만 마크다운 파싱 폴백
      const landProps = buildLandFromOverview(cleanMarkdown, tables);
      if (!result['land'] || !result['land']._source) {
        result['land'] = { title: '토지', content: '', tables: [], metrics: {}, _derived: true, ...landProps };
      }
    }
    
    // income_analysis → capital, dcf, sensitivity, loan, tax에도 파생 데이터 제공
    if (sectionType === 'income_analysis') {
      const capitalProps = buildCapitalFromIncome(cleanMarkdown, tables, doc.body, building);
      if (!result['capital'] || result['capital']._derived) result['capital'] = { title: '자본구조', content: '', tables: [], metrics: {}, _derived: true, ...capitalProps };

      // Pro 전용 파생 슬라이드 데이터 바인딩
      if (!result['dcf'] || result['dcf']._derived) result['dcf'] = { title: 'DCF 분석', content: '', tables: [], metrics: {}, _derived: true, ...buildDcfFromIncome(cleanMarkdown, tables, doc.body) };
      if (!result['sensitivity'] || result['sensitivity']._derived) result['sensitivity'] = { title: '수익률 민감도', content: '', tables: [], metrics: {}, _derived: true, ...buildSensitivityFromDcf(doc.body) };
      if (!result['loan'] || result['loan']._derived) result['loan'] = { title: '대출 구조', content: '', tables: [], metrics: {}, _derived: true, ...buildLoanFromIncome(cleanMarkdown, tables, doc.body) };
      if (!result['tax'] || result['tax']._derived) result['tax'] = { title: '세금 추정', content: '', tables: [], metrics: {}, _derived: true, ...buildTaxFromIncome(doc.body) };
    }

    // lease_status / stacking_plan → stability, vacancy, current, stackingPlan 등에도 파생 데이터 제공
    if (sectionType === 'lease_status' || sectionType === 'stacking_plan') {
      const stabilityProps = transformForArchetype(cleanMarkdown, tables, 'A04');

      // D41 A4: floor_leases 기반 공실률/임대료 직접 계산
      const leases: any[] = doc.body?.floor_leases ?? [];
      if (leases.length > 0) {
        const totalSpaces = leases.length;
        const vacantSpaces = leases.filter((l: any) => l.is_vacant === true).length;
        const occupiedSpaces = totalSpaces - vacantSpaces;
        const vacancyRate = totalSpaces > 0 ? ((vacantSpaces / totalSpaces) * 100).toFixed(1) : '0.0';
        const monthlyRent = leases.reduce((sum: number, l: any) => sum + (l.rent_manwon ?? 0), 0);
        const annualRent = monthlyRent * 12;

        // stability rows에 계산된 수치 주입
        const computedRows: [string, string][] = [
          ['공실 현황', vacantSpaces === 0 ? `공실 없음 (${totalSpaces}구획 중 ${occupiedSpaces}구획 임대중)` : `${vacantSpaces}구획 공실 (공실률 ${vacancyRate}%)`],
          ['월 임대료 합계', `${monthlyRent.toLocaleString()}만 원/월`],
          ['연 임대 수입', `약 ${(annualRent / 10000).toFixed(1)}억 원/년`],
          ['임차인 구성', leases.filter((l: any) => l.tenant_name && (l.rent_manwon ?? 0) > 0).map((l: any) => `${l.floor} ${l.tenant_name}`).join(', ')],
        ];

        if (stabilityProps.left) {
          stabilityProps.left.rows = computedRows;
        } else {
          stabilityProps.left = { sub: '임대 안정성 지표 (렌트롤 기반)', rows: computedRows };
        }
        // 우측에 "비공개 처리" 안내 제거 — 빈 callout 대신 업종 분포 표시
        const typeDistribution = leases.filter((l: any) => l.tenant_type).reduce((acc: Record<string, number>, l: any) => {
          acc[l.tenant_type] = (acc[l.tenant_type] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const distStr = Object.entries(typeDistribution).map(([type, cnt]) => `${type}: ${cnt}구획`).join(', ');
        stabilityProps.right = {
          sub: '업종 분포',
          callouts: [
            { kind: 'good', title: '임차인 구성 안정성', body: distStr || '임차인 업종 정보 없음' },
          ],
        };
      }

      if (!result['stability'] || result['stability']._derived) result['stability'] = { title: '임대안정성', content: cleanMarkdown, tables, metrics, _derived: true, ...stabilityProps };
      if (!result['vacancy'] || result['vacancy']._derived) result['vacancy'] = { title: '공실 분석', content: cleanMarkdown, tables, metrics, _derived: true, ...stabilityProps };
      if (!result['current'] || result['current']._derived) result['current'] = { title: '현황 분석', content: cleanMarkdown, tables, metrics, _derived: true, ...stabilityProps };

      const a22Props = buildA22Props(cleanMarkdown, tables, cleanMarkdown.split('\n'), doc.body);
      if (!result['stackingPlan'] || result['stackingPlan']._derived) {
        result['stackingPlan'] = {
          title: section.title || '스태킹 플랜',
          content: cleanMarkdown,
          tables,
          metrics,
          _derived: true,
          ...a22Props,
        };
      }

      // ─── A24 rentRoll: floor_leases 기반 층별 상세 테이블 직접 빌드 (ssot_summary 합성보다 우선) ───
      const floorLeases: any[] = doc.body?.floor_leases ?? [];
      if (floorLeases.length > 0 && result['rentRoll']) {
        const isBasicPreset = doc.body?.preset === 'credeal_basic';
        const rrHeaders = isBasicPreset
          ? ['층수', '임차인', '면적(평)', '보증금', '월세', '계약종료']
          : ['호실', '업종', '면적', '보증금', '월세', '관리비', '만기일'];
        const rrRows = floorLeases.map((l: any) => {
          const floor = l.floor || l.unit_label || '-';
          const areaPyeong = l.area_sqm ? `${formatPyeong(Number(l.area_sqm), 0)}평` : (l.area_pyeong ? `${l.area_pyeong}평` : '-');
          const tenant = l.tenant_name || l.tenant_type || (l.is_vacant ? '공실' : '-');
          const deposit = l.deposit_manwon ? `${Number(l.deposit_manwon).toLocaleString()}만` : '-';
          const rent = l.rent_manwon ? `${Number(l.rent_manwon).toLocaleString()}만` : (l.is_vacant ? '-' : '-');
          const mgmt = l.mgmt_fee_manwon ? `${Number(l.mgmt_fee_manwon).toLocaleString()}만` : '-';
          const expiry = l.lease_end || l.contract_end || '-';
          return isBasicPreset
            ? [floor, tenant, areaPyeong, deposit, rent, expiry]
            : [floor, tenant, areaPyeong, deposit, rent, mgmt, expiry];
        });
        result['rentRoll'].tableHead = rrHeaders;
        result['rentRoll'].tableRows = rrRows;
        result['rentRoll'].tables = [{ headers: rrHeaders, rows: rrRows }];
      }

      // ─── A24 rentRoll fallback: floor_leases 미영속 + 마크다운 테이블 미생성 시 ssot_summary 기반 합성 ───
      // LLM이 서술형 텍스트만 생성하고 마크다운 테이블을 포함하지 않은 경우,
      // A24가 suppress되지 않도록 ssot_summary와 텍스트에서 최소한의 임대차 요약 테이블을 동적으로 합성합니다.
      // Rule 34: 특정 매물 데이터 하드코딩 금지 — 모든 수치는 ssot_summary에서 동적 산출
      if (result['rentRoll'] && !(result['rentRoll'].tableRows?.length > 0)) {
        const ssot = doc.body?.ssot_summary ?? {};
        const monthlyRentKrw = ssot.monthly_rent_total_krw;
        const depositManwon = ssot.total_deposit_manwon ?? (doc.body?.total_deposit_manwon);
        const askingManwon = ssot.asking_price_manwon ?? doc.body?.asking_price_manwon;
        const vacancySignal = ssot.vacancy_signal || ssot.vacancy_status;

        // ssot에 월세 또는 보증금 데이터가 있으면 합성 가능
        if (monthlyRentKrw || depositManwon) {
          const monthlyRentManwon = monthlyRentKrw ? Math.round(monthlyRentKrw / 10000) : 0;
          const annualRentEok = monthlyRentManwon > 0 ? (monthlyRentManwon * 12 / 10000).toFixed(1) : '-';
          const depositEok = depositManwon ? (depositManwon / 10000).toFixed(1) : '-';

          // 마크다운 서술에서 공실 층수 추출 (예: "2층·4층·5층 등 총 3개 층 공실")
          const vacantMatch = cleanMarkdown.match(/(\d+)\s*개?\s*층?\s*공실/);
          const vacantCount = vacantMatch ? parseInt(vacantMatch[1]) : 0;

          const summaryRows: string[][] = [
            ['월 임대료 합계', `${monthlyRentManwon.toLocaleString()}만 원`, '연간', `약 ${annualRentEok}억 원`],
            ['보증금 합계', depositManwon ? `${depositEok}억 원` : '미확인', '공실 현황', vacancySignal || `${vacantCount}개 층 공실`],
          ];
          if (askingManwon) {
            summaryRows.push(['매각 희망가', `${(askingManwon / 10000).toFixed(0)}억 원`, '총보증금 대비', depositManwon && askingManwon ? `${((depositManwon / askingManwon) * 100).toFixed(1)}%` : '-']);
          }

          result['rentRoll'].tableRows = summaryRows;
          result['rentRoll'].tableHead = ['항목', '금액', '항목', '금액'];
          // tables 배열에도 동기화 (A24 fallback 경로용)
          if (!result['rentRoll'].tables?.length) {
            result['rentRoll'].tables = [{ headers: ['항목', '금액', '항목', '금액'], rows: summaryRows }];
          }
        }
      }
    }

    // income_analysis → rentGap, upside, leasing, remodel, comps 등 파생 데이터 제공
    if (sectionType === 'income_analysis') {
      const subsections = cleanMarkdown.split(/(?=^#{2,3}\s)/m).filter(Boolean);
      
      const mdRentGap = subsections[0] || cleanMarkdown;
      const mdUpside = subsections[1] || subsections[0] || cleanMarkdown;
      const mdLeasing = subsections[2] || subsections[0] || cleanMarkdown;
      const mdRemodel = subsections[3] || subsections[0] || cleanMarkdown;

      const pRentGap = transformForArchetype(mdRentGap, tables, 'A05');
      const pUpside = transformForArchetype(mdUpside, tables, 'A05');
      const pLeasing = transformForArchetype(mdLeasing, tables, 'A05');
      const pRemodel = transformForArchetype(mdRemodel, tables, 'A05');
      const a03Props = transformForArchetype(cleanMarkdown, tables, 'A03');

      if (!result['rentGap'] || result['rentGap']._derived) result['rentGap'] = { title: '임대료 갭', content: mdRentGap, tables, metrics, _derived: true, ...pRentGap };
      if (!result['upside'] || result['upside']._derived) result['upside'] = { title: '인상 경로', content: mdUpside, tables, metrics, _derived: true, ...pUpside };
      if (!result['leasing'] || result['leasing']._derived) result['leasing'] = { title: '임차 유치', content: mdLeasing, tables, metrics, _derived: true, ...pLeasing };
      if (!result['remodel'] || result['remodel']._derived) result['remodel'] = { title: '리모델링 계획', content: mdRemodel, tables, metrics, _derived: true, ...pRemodel };
      // D41 A2b: income_analysis → comps fallback 제거
      // 비교사례(comps) 슬라이드에 재무분석 데이터가 오염되는 버그 수정
      // comps는 manual_comps 또는 RTMS API에서만 바인딩되어야 함
      if (!result['farUpside'] || result['farUpside']._derived) {
        result['farUpside'] = { title: '용적률 여유', content: cleanMarkdown, tables, metrics, _derived: true, ...buildFarUpsideProps(cleanMarkdown, tables, doc.body, building) };
      }
    }

    // owner_occupied 파생 데이터 제공
    if (posture === 'owner_occupied') {
      if (sectionType === 'occupancy_fit') {
        const planProps = buildOwnerOccupiedPlanProps(doc.body, building);
        result['plan'] = { title: '사옥 사용 계획', content: cleanMarkdown, tables, metrics, _derived: true, ...planProps };

        const commuteProps = buildOwnerOccupiedCommuteProps(doc.body, building, result['location']);
        result['commute'] = { title: '통근 및 접근성', content: cleanMarkdown, tables, metrics, _derived: true, ...commuteProps };
      }
      if (sectionType === 'cost_comparison') {
        const vsLeaseProps = buildOwnerOccupiedVsLeaseProps(doc.body, building);
        result['vsLease'] = { title: '자가사용 vs 임차비용 비교', content: cleanMarkdown, tables, metrics, _derived: true, ...vsLeaseProps };
      }
      if (sectionType === 'investment_thesis') {
        const valueProps = buildOwnerOccupiedValueProps(doc.body, building);
        result['value'] = { title: '자산 가치 제안', content: cleanMarkdown, tables, metrics, _derived: true, ...valueProps };
      }
    }

    // development 파생 데이터 제공 (구조화 props 빌더 — Rule 26 동적화)
    if (posture === 'development') {
      if (sectionType === 'site_analysis') {
        if (!result['landDetail'] || result['landDetail']._derived) {
          const landDetailProps = buildDevelopmentLandDetailProps(doc.body, building);
          result['landDetail'] = { title: '토지 상세 분석', content: cleanMarkdown, tables, metrics, _derived: true, ...landDetailProps };
        }
        if (!result['scale'] || result['scale']._derived) {
          const scaleProps = buildDevelopmentScaleProps(doc.body, building);
          result['scale'] = { title: '신축 규모 검토', content: cleanMarkdown, tables, metrics, _derived: true, ...scaleProps };
        }
        if (!result['eviction'] || result['eviction']._derived) {
          const evictionProps = buildDevelopmentEvictionProps(doc.body, building);
          result['eviction'] = { title: '명도 계획', content: cleanMarkdown, tables, metrics, _derived: true, ...evictionProps };
        }
      }
      if (sectionType === 'development_feasibility') {
        if (!result['cost'] || result['cost']._derived) {
          const costProps = buildDevelopmentCostProps(doc.body, building);
          result['cost'] = { title: '투입 비용 분석', content: cleanMarkdown, tables, metrics, _derived: true, ...costProps };
        }
        if (!result['feasibility'] || result['feasibility']._derived) {
          const feasibilityProps = buildDevelopmentFeasibilityProps(doc.body, building);
          result['feasibility'] = { title: '사업 수지 분석', content: cleanMarkdown, tables, metrics, _derived: true, ...feasibilityProps };
        }
        if (!result['stacking'] || result['stacking']._derived) {
          const stackingProps = transformForArchetype(cleanMarkdown, tables, 'A05');
          result['stacking'] = { title: '스태킹계획', content: cleanMarkdown, tables, metrics, _derived: true, ...stackingProps };
        }
      }
    }

    // operating 파생 데이터 제공 (Sprint 0: 포스처 빌더 연결)
    if (sectionType === 'operation_overview') {
      if (!result['kpi'] || !result['kpi']._derived) {
        const kpiProps = buildOperatingKpiProps(doc.body, building);
        result['kpi'] = { title: '운영 지표 (KPI)', content: cleanMarkdown, tables, metrics, _derived: true, ...kpiProps };
      }
      if (!result['operator']) {
        const operatorProps = buildOperatingOperatorProps(doc.body, building);
        result['operator'] = { title: '운영사 현황', content: cleanMarkdown, tables, metrics, _derived: true, ...operatorProps };
      }
    }
    if (sectionType === 'gop_analysis') {
      if (!result['revenue'] || !result['revenue']._derived) {
        const revenueProps = buildOperatingRevenueProps(doc.body, building);
        result['revenue'] = { title: '매출 구조 분석', content: cleanMarkdown, tables, metrics, _derived: true, ...revenueProps };
      }
      if (!result['seasonality']) {
        const seasonalityProps = buildOperatingSeasonalityProps(doc.body, building);
        result['seasonality'] = { title: '계절성 및 변동성', content: cleanMarkdown, tables, metrics, _derived: true, ...seasonalityProps };
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

  // D38: capital 슬라이드가 없으면 A16 구조화 데이터 합성 (모든 포스처/등급 안전망)
  if (!result['capital']) {
    const capitalProps = buildCapitalFromIncome('', [], doc.body, building);
    result['capital'] = { title: '자본구조', content: '', tables: [], metrics: {}, _derived: true, ...capitalProps };
  }

  // D38: farUpside 슬라이드가 없으면 용적률 여유 데이터 합성 (R-INC-02 안전망)
  if (!result['farUpside']) {
    const farUpsideProps = buildFarUpsideProps('', [], doc.body, building);
    result['farUpside'] = { title: '용적률 여유', content: '', tables: [], metrics: {}, _derived: true, ...farUpsideProps };
  }

  // A22: stackingPlan 슬라이드가 없으면 스태킹 플랜 구조화 데이터 합성
  if (!result['stackingPlan']) {
    const a22Props = buildA22Props('', [], [], doc.body);
    result['stackingPlan'] = { title: '스태킹 플랜', content: '', tables: [], metrics: {}, _derived: true, ...a22Props };
  }

  // ── 포스처별 슬라이드 안전망 (사옥형 4대 슬라이드 결손 방지) ──
  const isOwnerOccupied = posture === 'owner_occupied' || Boolean(doc.body?.occupancySpec);

  if (isOwnerOccupied) {
    if (!result['plan'] || !(result['plan'].left?.rows?.length > 0)) {
      const planProps = buildOwnerOccupiedPlanProps(doc.body, building);
      result['plan'] = {
        title: '기업 사옥 적합성 및 층별 공간 배분',
        kicker: 'OWNER-OCCUPIED SUITABILITY',
        content: '',
        tables: [],
        metrics: {},
        _derived: true,
        ...planProps,
      };
    }
    const rawAddr = doc.body?.resolved_address ?? doc.body?.address ?? '';
    const areaName = building?.area_signal ?? doc.body?.ssot_summary?.area_signal ?? (rawAddr ? rawAddr.split(' ').slice(0, 3).join(' ') : '도심 핵심 업무권역');
    const stationCandidate = result['location']?.station_name || doc.body?.ssot_summary?.station_name || '인근 지하철역';
    const cleanStation = normalizeStationName(stationCandidate);

    if (!result['vsLease'] || !((result['vsLease']?.table1?.rows?.length ?? 0) > 0)) {
      const vsLeaseProps = buildOwnerOccupiedVsLeaseProps(doc.body, building);
      result['vsLease'] = {
        title: `${areaName} 임차 vs 단독 사옥 매입 10년 재무 비교`,
        kicker: 'FINANCIAL COMPARISON',
        content: '',
        tables: [],
        metrics: {},
        _derived: true,
        ...vsLeaseProps,
      };
    }
    if (!result['commute'] || result['commute']?._derived || !((result['commute']?.right?.rows?.length ?? 0) > 0)) {
      const commuteProps = buildOwnerOccupiedCommuteProps(doc.body, building, result['location']);
      result['commute'] = {
        title: `${areaName} 비즈니스 접근성 및 통근 환경`,
        kicker: 'LOCATION & ACCESSIBILITY',
        content: '',
        tables: [],
        metrics: {},
        _derived: true,
        address: rawAddr,
        areaSignal: areaName,
        ...commuteProps,
      };
    }
    if (!result['value'] || result['value']?._derived || !((result['value']?.left?.rows?.length ?? 0) > 0)) {
      const valueProps = buildOwnerOccupiedValueProps(doc.body, building);
      result['value'] = {
        title: `${areaName} 단독 사옥의 자산가치 및 브랜딩`,
        kicker: 'ASSET VALUE & STRATEGY',
        content: '',
        tables: [],
        metrics: {},
        _derived: true,
        ...valueProps,
      };
    }

    // 사옥형 thesis 안전망
    if (!result['thesis'] || !((result['thesis']?.pillars?.length ?? 0) > 0)) {
      result['thesis'] = {
        title: '핵심 투자 논거',
        kicker: 'INVESTMENT THESIS',
        content: '',
        tables: [],
        metrics: {},
        _derived: true,
        subtitle: `${areaName} 단독 사옥 매입의 전략적·재무적 타당성`,
        pillars: [
          { number: '01', title: '핵심 업무권역 입지', body: `${cleanStation} 인근 비즈니스 업무권역으로 우수 IT/전문직 인재 유치 및 통근 최적` },
          { number: '02', title: '사옥 즉시 입주 가능', body: '매매 잔금 시 매도인 퇴거 및 명도 확약 조건으로 공실 및 명도 리스크 최소화' },
          { number: '03', title: '임차 대비 순비용 절감', body: '동급 오피스 임차료 지출 대비 장기 현금 순지출 절감 및 10년 자산 가치 축적' },
          { number: '04', title: '기업 단독 브랜딩 확보', body: '사옥 단독 명칭 표기(간판 설치권) 확보 및 독립 사옥 운영을 통한 대외 신인도 제고' },
        ],
        takeaway: `${areaName} 소재 단독 사옥으로, 임차료 지출을 법인 자산 축적으로 전환하는 최적의 자가 사옥 매입 기회입니다.`,
      };
    }

    // 사옥형 risk 안전망
    if (!result['risk'] || !((result['risk']?.blocks?.length ?? 0) > 0)) {
      result['risk'] = {
        title: '핵심 리스크 진단 및 대응 방안',
        kicker: 'RISK FACTORS & MITIGATION',
        content: '',
        tables: [],
        metrics: {},
        _derived: true,
        blocks: [
          { label: '명도 리스크', value: '해소 방안', description: '매도인 점유 공간 매매 잔금 시 퇴거 확약서 징구 및 명도 일정 확약 조건' },
          { label: '권리 리스크', value: '완전 무결', description: '등기부 갑구 권리분쟁 전무, 을구 근저당 등 잔금 시 동시 변제·말소 조건' },
          { label: '세무 리스크', value: '사전 검토', description: '과밀억제권역 법인 사옥 취득세 요건 및 적격 분할/지점 설치 세무 자문 연계' },
          { label: '주차 리스크', value: '대응 방안', description: '건물 내 주차 가용 면수 확보 및 인근 대형 빌딩 월정기 주차 계약 연계 지원' },
        ],
        bottomBar: { text: '실사 단계에서 법률·세무·물리적 실사를 통해 잔여 잠재 리스크를 철저히 차단합니다.' },
      };
    }
  }

  // ── 포스처별 슬라이드 안전망 (개발형 6대 슬라이드 결손 방지) ──
  const isDevelopment = posture === 'development' || Boolean(doc.body?.developmentSpec);

  if (isDevelopment) {
    if (!result['landDetail'] || !((result['landDetail']?.left?.rows?.length ?? 0) > 0)) {
      const ldProps = buildDevelopmentLandDetailProps(doc.body, building);
      result['landDetail'] = {
        title: '토지 상세 분석',
        kicker: 'LAND DETAIL',
        content: '', tables: [], metrics: {}, _derived: true,
        ...ldProps,
      };
    }
    if (!result['scale'] || !(result['scale']?.left?.sub)) {
      const scProps = buildDevelopmentScaleProps(doc.body, building);
      result['scale'] = {
        title: '신축 규모 검토',
        kicker: 'SCALE PLAN',
        content: '', tables: [], metrics: {}, _derived: true,
        ...scProps,
      };
    }
    if (!result['eviction'] || !((result['eviction']?.left?.rows?.length ?? 0) > 0)) {
      const evProps = buildDevelopmentEvictionProps(doc.body, building);
      result['eviction'] = {
        title: '명도 계획 및 리스크 관리',
        kicker: 'EVICTION PLAN',
        content: '', tables: [], metrics: {}, _derived: true,
        ...evProps,
      };
    }
    if (!result['cost'] || !((result['cost']?.table1?.rows?.length ?? 0) > 0)) {
      const costProps = buildDevelopmentCostProps(doc.body, building);
      result['cost'] = {
        title: '개발 투입 비용 분석',
        kicker: 'COST BREAKDOWN',
        content: '', tables: [], metrics: {}, _derived: true,
        ...costProps,
      };
    }
    if (!result['feasibility'] || !(result['feasibility']?.left?.sub)) {
      const feasProps = buildDevelopmentFeasibilityProps(doc.body, building);
      result['feasibility'] = {
        title: '개발 사업 수지 분석',
        kicker: 'FEASIBILITY STUDY',
        content: '', tables: [], metrics: {}, _derived: true,
        ...feasProps,
      };
    }
  }

  // D32 BL-6 / D38: 결손 문구 및 실사 점검 항목을 checklist 슬롯에 온전히 주입 (A18 일원화)
  const existingChecklist = result['checklist']?.checkItems ?? [];
  const allCheckItems = [...existingChecklist, ...collectedDeficiencies];

  if (allCheckItems.length === 0) {
    allCheckItems.push(
      '등기부등본 갑구/을구 권리관계 및 근저당 채권최고액 전액 말소 조건 원본 대조',
      '임대차 원본 계약서 대조 (보증금, 월임대료, 관리비 실입금 내역 및 제소전화해조서)',
      '건축물대장상 위반건축물 등재 여부 및 불법 증축·용도변경 이행강제금 납부 이력 점검',
      '토지이용계획확인원상 도시계획시설 저촉, 건축선 후퇴, 지구단위계획 특별계획구역 확인',
      '기계식 주차기 정기 안전점검 합격증, 승강기 검사필증, 소방 완비증명서 실물 실사',
      '정화조 용량 대비 현 업종 적합성 및 하수도 원인자부담금 추가 부과 대상 여부 확인'
    );
  }

  const checklistMarkdown = allCheckItems.map(item => `• ${item}`).join('\n');
  result['checklist'] = {
    title: '실사 및 확인 필요사항',
    kicker: 'DUE DILIGENCE CHECKLIST',
    content: checklistMarkdown,
    markdown: checklistMarkdown,
    tables: [],
    metrics: {},
    checkItems: allCheckItems,
    _derived: true,
  };

  if (collectedDeficiencies.length > 0) {
    result['_deficiencies'] = {
      title: '결손 항목',
      content: '',
      tables: [],
      metrics: {},
      checkItems: [...collectedDeficiencies],
    };
    log.warn({ collectedDeficiencies: collectedDeficiencies }, `[BL-6 / D38] ${collectedDeficiencies.length}건의 결손 문구를 A18 체크리스트로 이관 완료`);
  }

  // 4대 완성형 프라임 템플릿 특화 데이터 바인딩
  const activeTemplateId = templateId ?? doc.body?.templateId ?? doc.body?.presetId;
  if (activeTemplateId) {
    bindSpecializedTemplateData(activeTemplateId, doc, result);
  }

  return result;
}

// ══════════════════════════════════════════════════════
// property_overview 파생 데이터 빌더
// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
// 유틸리티 함수
// ══════════════════════════════════════════════════════
// W-PPTX-5: CRE 실무 용어 교정 맵 — 신규 용어 추가 시 여기에 항목 추가
export const CRE_LEXICON_REPLACEMENTS: Array<[RegExp, string]> = [
  [/네이밍\s*라이츠/gu, '사옥 단독 명칭 표기(간판 설치권)'],
  [/네이밍라이츠/gu, '사옥 단독 명칭 표기'],
  [/브랜딩\s*라이츠/gu, '기업 단독 브랜딩'],
  [/브랜딩라이츠/gu, '기업 단독 브랜딩'],
  [/테넌트\s*인센티브/gu, '인테리어 지원금(TI)'],
  [/테넌트인센티브/gu, '인테리어 지원금(TI)'],
  [/프리\s*렌트/gu, '렌트프리(무상임대)'],
  [/프리렌트/gu, '렌트프리(무상임대)'],
  [/렌트\s*프리/gu, '렌트프리(무상임대)'],
  [/리커버리\s*레이트/gu, '비용 회수율'],
  [/캡\s*레이트/gu, '연 순수익률(Cap Rate)'],
];
import { enforceTextBudget } from './text-budget';
import type { IMCore, Comp } from '@/types/im-core';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('data-binder');
// ══════════════════════════════════════════════════════════════════
// Phase 2: V-World / 공공 API 구조화 데이터 → 슬라이드 직접 바인딩
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════
// 4대 완성형 프라임 템플릿 특화 데이터 바인딩 (M1 Prime Templates)
// ══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════
// 개발형 전용 빌더 함수 (Rule 26: 동적화, Rule 34: 하드코딩 금지)
// ══════════════════════════════════════════════════
