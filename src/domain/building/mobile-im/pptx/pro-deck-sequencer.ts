/**
 * @file pro-deck-sequencer.ts
 * @description Institutional Pro IM Deck Sequencer (30+ Slides across 5 Core Chapters)
 *
 * Expands beyond Basic IM (7-10 slides) to generate institutional-grade
 * investment memorandums (30~40 slides, 5 core chapters, multi-year cash flow
 * modeling, sensitivity analysis, tenant rosters, and due diligence annexes).
 *
 * CRITICAL INVARIANT:
 * - Basic IM is isolated in deck-sequencer.ts with PAGE_HARD_LIMIT = 16.
 * - Pro IM uses buildProDeckSequence() with PRO_PAGE_HARD_LIMIT = 40 (min 30 slides).
 */

import type { InvestmentPosture } from '@/domain/ontology';
import type { SlideSpec, Grade, DataAvailability, DeckSequenceInput } from './deck-sequencer';
import {
  chunkTenantRoster,
  type InstitutionalTenantRosterItem,
} from '../../im-core/pro-tenant-roster';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('pro-deck-sequencer');

export const PRO_PAGE_MIN_LIMIT = 30;
export const PRO_PAGE_HARD_LIMIT = 40;
export const PRO_PAGE_TARGET = 36;

export interface ProDeckSequenceOptions {
  data?: any;
  posture?: InvestmentPosture;
  theme?: any;
  grade?: Grade;
  hasPhotos?: boolean;
  dataAvailability?: DataAvailability;
}

/**
 * Normalizes input arguments to extract posture, data, and options.
 */
function normalizeProInput(
  dataOrInput?: any,
  postureArg?: InvestmentPosture,
  themeArg?: any
): {
  data: Record<string, any>;
  posture: InvestmentPosture;
  grade: Grade;
  theme: any;
  hasPhotos: boolean;
  dataAvailability: DataAvailability;
} {
  let data: Record<string, any> = {};
  let posture: InvestmentPosture = 'income';
  let grade: Grade = 'B';
  let theme: any = themeArg;
  let hasPhotos = true;
  let dataAvailability: DataAvailability = {
    hasCadastralMap: true,
    hasPhotos: true,
    hasRentRoll: true,
    hasStackingPlan: true,
    hasCommercialDistrict: true,
    hasComparables: true,
  };

  if (dataOrInput && typeof dataOrInput === 'object') {
    if ('posture' in dataOrInput && 'grade' in dataOrInput) {
      // It's DeckSequenceInput
      const input = dataOrInput as DeckSequenceInput;
      posture = input.posture || 'income';
      grade = input.grade || 'B';
      hasPhotos = input.hasPhotos !== false;
      if (input.dataAvailability) {
        dataAvailability = { ...dataAvailability, ...input.dataAvailability };
      }
      data = (input as any).data || (input as any).doc?.body || {};
    } else {
      data = dataOrInput;
      if (postureArg) posture = postureArg;
      else if (data.investment_posture) posture = data.investment_posture;
      else if (data.posture) posture = data.posture;

      if (data.grade) grade = data.grade;
      if (data.hasPhotos !== undefined) hasPhotos = Boolean(data.hasPhotos);
      if (data.dataAvailability) {
        dataAvailability = { ...dataAvailability, ...data.dataAvailability };
      }
    }
  }

  return { data, posture, grade, theme, hasPhotos, dataAvailability };
}

/**
 * Builds the comprehensive 30+ slide Institutional Pro IM sequence
 * structured strictly across 5 core chapters + front/end matter.
 */
export function buildProDeckSequence(
  dataOrInput?: any,
  postureArg?: InvestmentPosture,
  themeArg?: any
): SlideSpec[] {
  const { data, posture, grade, dataAvailability } = normalizeProInput(dataOrInput, postureArg, themeArg);

  // Grade D check — D grade is strictly forbidden from publication
  if (grade === 'D') {
    throw new Error('[G30] D등급은 Pro IM을 발행할 수 없습니다.');
  }

  const sequence: SlideSpec[] = [];
  const isDevelopment = posture === 'development';

  // ════════════════════════════════════════════════════════════════
  // [FRONT MATTER] (2 slides)
  // ════════════════════════════════════════════════════════════════
  sequence.push({
    archetype: 'A01',
    kicker: 'INVESTMENT MEMORANDUM',
    title: '표지',
    dataKey: 'cover',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A15',
    kicker: 'TABLE OF CONTENTS',
    title: '목차 및 주요 검토 항목',
    dataKey: 'agenda',
    placement: 'body',
  });

  // ════════════════════════════════════════════════════════════════
  // [CHAPTER 1: Executive Summary & Investment Thesis] (6 slides, min 5)
  // ════════════════════════════════════════════════════════════════
  sequence.push({
    archetype: 'A25',
    kicker: 'CHAPTER 01',
    title: 'Executive Summary & Investment Thesis',
    dataKey: 'ch1_divider',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A02',
    kicker: 'EXECUTIVE SUMMARY',
    title: '핵심 투자 지표 및 물건 프로필',
    dataKey: 'summary',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A15',
    kicker: 'INVESTMENT THESIS',
    title: '핵심 투자 논거 및 전략적 가치',
    dataKey: 'thesis',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A04',
    kicker: 'ACQUISITION HIGHLIGHTS',
    title: '매입 핵심 하이라이트 및 밸류애드 기회',
    dataKey: 'acquisition_highlights',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A06',
    kicker: 'LOCATION & CONNECTIVITY',
    title: '광역 입지 및 대중교통망 분석',
    dataKey: 'location',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A23',
    kicker: 'CASH FLOW SNAPSHOT',
    title: '임대차 및 운용 현금흐름 요약',
    dataKey: 'cash_flow_snapshot',
    placement: 'body',
  });

  // ════════════════════════════════════════════════════════════════
  // [CHAPTER 2: Detailed Asset & Building Specifications] (8 slides, min 6)
  // ════════════════════════════════════════════════════════════════
  sequence.push({
    archetype: 'A25',
    kicker: 'CHAPTER 02',
    title: 'Detailed Asset & Building Specifications',
    dataKey: 'ch2_divider',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A04',
    kicker: 'BUILDING SPECS',
    title: '건축물 물리적 제원 및 특성',
    dataKey: 'building',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A04',
    kicker: 'LAND & ZONING',
    title: '토지 제원 및 용도지역·공법상 제한',
    dataKey: 'land',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A22',
    kicker: 'STACKING PLAN',
    title: '건축 입면 셋백 스태킹 플랜',
    dataKey: 'stackingPlan',
    placement: 'body',
  });

  // Tenant Roster Chunking Integration
  const floorLeases: InstitutionalTenantRosterItem[] =
    data.floor_leases || data.tenantRoster || [];
  const tenantChunks = chunkTenantRoster(floorLeases, 12);

  // Subsequent slides after rent roll:
  // Ch2 remaining (facility_mep 1 + gallery 1 = 2) + Ch3 (7) + Ch4 (6) + Ch5 (6) + closing (1) = 22 slides
  const REMAINING_SUBSEQUENT_SLIDES = 22;
  if (tenantChunks.length > 2 && sequence.length + tenantChunks.length + REMAINING_SUBSEQUENT_SLIDES <= PRO_PAGE_HARD_LIMIT) {
    tenantChunks.forEach((_, idx) => {
      sequence.push({
        archetype: 'A03',
        kicker: `TENANT ROSTER (${idx + 1}/${tenantChunks.length})`,
        title: `상세 임대차 현황 (Part ${idx + 1})`,
        dataKey: `rentRollPart${idx + 1}`,
        placement: 'body',
      });
    });
  } else {
    // Standard 2-part institutional roster
    sequence.push({
      archetype: 'A03',
      kicker: 'TENANT ROSTER (1/2)',
      title: '상세 임대차 현황 (저층부 및 주요 임차인)',
      dataKey: 'rentRollPart1',
      placement: 'body',
    });

    sequence.push({
      archetype: 'A03',
      kicker: 'TENANT ROSTER (2/2)',
      title: '상세 임대차 현황 (상층부 및 만기 스케줄)',
      dataKey: 'rentRollPart2',
      placement: 'body',
    });
  }

  sequence.push({
    archetype: 'A18',
    kicker: 'FACILITY & MEP',
    title: '기계·전기·소방(MEP) 설비 및 관리 상태 점검',
    dataKey: 'facility_mep',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A14',
    kicker: 'PROPERTY GALLERY',
    title: '물건 내외부 현장 사진 갤러리',
    dataKey: 'gallery',
    placement: 'body',
  });

  // ════════════════════════════════════════════════════════════════
  // [CHAPTER 3: Comprehensive Financial Modeling] (7 slides, min 7)
  // ════════════════════════════════════════════════════════════════
  sequence.push({
    archetype: 'A25',
    kicker: 'CHAPTER 03',
    title: 'Comprehensive Financial Modeling',
    dataKey: 'ch3_divider',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A08',
    kicker: '10-YEAR DCF SCHEDULE',
    title: '10개년 현금흐름(DCF) 추정 스케줄',
    dataKey: 'dcf_schedule',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A03',
    kicker: 'OPEX BREAKDOWN',
    title: '수익 및 운영비(OPEX) 세부 항목 분석',
    dataKey: 'opex_breakdown',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A23',
    kicker: 'EXIT VALUATION',
    title: 'Exit Cap Rate 및 매각 가치 환원 산정',
    dataKey: 'dcf_valuation',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A08',
    kicker: '2D SENSITIVITY MATRIX',
    title: '2차원 민감도 분석 (Exit Cap vs 할인율)',
    dataKey: 'sensitivity_matrix',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A08',
    kicker: 'STRESS TESTING',
    title: '공실률 및 임대료 하향 스트레스 테스트',
    dataKey: 'vacancy_stress',
    placement: 'body',
  });

  if (isDevelopment) {
    sequence.push({
      archetype: 'A08',
      kicker: 'DEVELOPMENT BUDGET',
      title: '5단계 개발 사업 수지 분석 (Feasibility Budget)',
      dataKey: 'development_budget',
      placement: 'body',
    });
  } else {
    sequence.push({
      archetype: 'A16',
      kicker: 'CAPITAL & DEBT',
      title: '자본 구조 및 차입(레버리지) 시뮬레이션',
      dataKey: 'debt_financing',
      placement: 'body',
    });
  }

  // ════════════════════════════════════════════════════════════════
  // [CHAPTER 4: Market Dynamics & Comparable Transactions] (6 slides, min 6)
  // ════════════════════════════════════════════════════════════════
  sequence.push({
    archetype: 'A25',
    kicker: 'CHAPTER 04',
    title: 'Market Dynamics & Comparable Transactions',
    dataKey: 'ch4_divider',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A05',
    kicker: 'SUBMARKET OVERVIEW',
    title: '권역 거시 시장 및 수급 동향 분석',
    dataKey: 'submarket_overview',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A04',
    kicker: 'RENT & VACANCY TRENDS',
    title: '권역 임대료 및 공실률 추이 벤치마크',
    dataKey: 'rental_trends',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A07',
    kicker: 'MICRO LOCATION',
    title: '미시 입지 상권 및 대중교통 인프라 연결성',
    dataKey: 'transit_connectivity',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A03',
    kicker: 'SALES COMPARABLES',
    title: '인근 실거래 비교 사례 (Sales Comps)',
    dataKey: 'comps',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A08',
    kicker: 'COMP BENCHMARKING',
    title: '거래 배수 및 평당가 벤치마크 비교 분석',
    dataKey: 'comp_benchmarking',
    placement: 'body',
  });

  // ════════════════════════════════════════════════════════════════
  // [CHAPTER 5: Legal, Technical & Physical Due Diligence Annexes] (6 slides, min 6)
  // ════════════════════════════════════════════════════════════════
  sequence.push({
    archetype: 'A25',
    kicker: 'CHAPTER 05',
    title: 'Legal, Technical & Physical Due Diligence Annexes',
    dataKey: 'ch5_divider',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A06',
    kicker: 'CADASTRAL MAP',
    title: '지적도 및 필지 경계·형상 분석',
    dataKey: 'cadastralMap',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A12',
    kicker: 'TITLE & OWNERSHIP',
    title: '등기부 갑구·을구 소유권 및 권리관계',
    dataKey: 'ownership',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A04',
    kicker: 'CODE COMPLIANCE',
    title: '건축 법규, 건폐율·용적률 및 증축 타당성',
    dataKey: 'code_compliance',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A18',
    kicker: 'DUE DILIGENCE CHECKLIST',
    title: '물리적 실사 점검표 및 리스크 매트릭스',
    dataKey: 'physical_dd',
    placement: 'body',
  });

  sequence.push({
    archetype: 'A09',
    kicker: 'EXECUTION ROADMAP',
    title: '투자심의 의사결정 매트릭스 및 거래 일정',
    dataKey: 'next_steps',
    placement: 'body',
  });

  // ════════════════════════════════════════════════════════════════
  // [END MATTER] (1 slide)
  // ════════════════════════════════════════════════════════════════
  sequence.push({
    archetype: 'A10',
    kicker: 'CLOSING & ADVISORY',
    title: '자문단 연락처 및 법적 면책 고지',
    dataKey: 'closing',
    placement: 'closing',
  });

  // ════════════════════════════════════════════════════════════════
  // Scale & Bounds Validation
  // ════════════════════════════════════════════════════════════════
  const totalSlides = sequence.length;

  if (totalSlides < PRO_PAGE_MIN_LIMIT) {
    throw new Error(
      `[pro-deck-sequencer] Pro IM 슬라이드 수 부족 (${totalSlides}면 < ${PRO_PAGE_MIN_LIMIT}면). ` +
      `5대 챕터 편성을 확인하세요.`
    );
  }

  if (totalSlides > PRO_PAGE_HARD_LIMIT) {
    throw new Error(
      `[pro-deck-sequencer] PRO_PAGE_HARD_LIMIT(${PRO_PAGE_HARD_LIMIT}) 초과: 총 ${totalSlides}면.`
    );
  }

  log.info(
    `[pro-deck-sequencer] Pro IM sequence generated: ${totalSlides} slides across 5 core chapters (posture=${posture})`
  );

  return sequence;
}
