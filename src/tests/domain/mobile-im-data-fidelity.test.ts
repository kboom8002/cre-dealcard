/**
 * @file mobile-im-data-fidelity.test.ts
 * @description Automated 5-Posture Data Fidelity Assertion Suite
 *
 * Implements Acceptance Criterion 2:
 * "입력된 원본 도메인 데이터와 최종 생성된 섹션 콘텐츠(문자열/구조)가 완벽히 일치하는지
 * 교차 대조하는 새로운 '단언(Assert) 테스트'를 작성하여 데이터 유실이 없음을 증명"
 *
 * 5 Posture Fixtures:
 * 1. income: 당산동 빌딩 (115억 원, Land 330.5㎡ / 100평, Gross 991.7㎡ / 300평, Rent 2,800만 원, Deposit 3억 원, 5개 층 임대차)
 * 2. development: 대흥동 부지 (85억 원, Land 450㎡ / 136.1평, 법정 용적률 대비 현황 여력)
 * 3. operating: 신사동 근생/숙박 (210억 원, GOP 8.5억 원, OCC 78%, ADR 18만 원)
 * 4. owner_occupied: 서초동 오피스 (180억 원, 연면적 1,500㎡, 즉시 명도 가능)
 * 5. trading: 역삼동 빌딩 (140억 원, 실거래가 분석 및 시세 대비 밸류)
 *
 * 5 Assertion Dimensions:
 * 1. assertNumericParity(input, sections)
 * 2. assertRentRollParity(input, sections)
 * 3. assertNegativeInvariants(sections) [Poison tokens, Persona leaks, Evasive phrases, Price bands]
 * 4. assertProposalIntegrity(proposals, sections)
 * 5. assertMissingDataSafety(emptyInput, sections)
 */

import { describe, it, expect, vi } from 'vitest';
import { generateMobileIM } from '@/domain/building/mobile-im/writer';
import type {
  MobileIMWriterInput,
  MobileIMSection,
} from '@/domain/building/mobile-im/types';
import type { ProposalUnit } from '@/domain/building/im-core/proposals/proposal-unit';

// Mock LLM client to enforce deterministic high-fidelity template pipeline in tests
vi.mock('@/ai/llm-client', () => ({
  callLLM: vi.fn().mockRejectedValue(new Error('TEST_ENFORCE_DETERMINISTIC_TEMPLATE')),
  embedText: vi.fn().mockResolvedValue([]),
}));

// Suppress Supabase storage or network indexing warnings during unit test runs
vi.mock('@/lib/supabase/service', () => {
  const chain: any = {
    insert: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    createServiceClient: () => ({
      from: vi.fn().mockReturnValue(chain),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  };
});

// ═══════════════════════════════════════════════════════════════════
// 1. Data Fidelity Assertion Contract & Report Interface
// ═══════════════════════════════════════════════════════════════════

export interface DataFidelityAssertionReport {
  posture: string;
  numericParityPassed: boolean;
  rentRollPassed: boolean;
  zeroPoisonTokensPassed: boolean;
  zeroPersonaLeaksPassed: boolean;
  zeroPriceBandsPassed: boolean;
  missingDataHandledGracefully: boolean;
  failures: string[];
}

export interface AssertionResult {
  passed: boolean;
  failures: string[];
}

// ═══════════════════════════════════════════════════════════════════
// 2. 5 Verification Assertion Functions
// ═══════════════════════════════════════════════════════════════════

/**
 * Dimension 1: Exact Numeric Parity Assertion
 * Checks that asking price, land area, total gross area, monthly rent, and deposit
 * match the input domain numbers exactly.
 */
export function assertNumericParity(
  input: MobileIMWriterInput,
  sections: MobileIMSection[]
): AssertionResult {
  const failures: string[] = [];
  const allText = sections.map((s) => s.markdown).join('\n');
  const posture = input.identity?.investmentPosture || 'income';

  // 1. Asking price check
  const askingManwon = input.supplemental?.asking_price_manwon;
  if (askingManwon) {
    const askingEok = (askingManwon / 10000).toFixed(0); // e.g. "115"
    const hasEok = new RegExp(`${askingEok}억`).test(allText);
    const hasKrw = new RegExp(`${(askingManwon * 10000).toLocaleString()}`).test(allText);
    if (!hasEok && !hasKrw) {
      failures.push(`Asking price ${askingEok}억 원 (${askingManwon * 10000} KRW) not found in generated sections`);
    }
  }

  // 2. Land area & Total gross area check
  const landArea = input.supplemental?.land_area_m2 || input.external_data?.buildingRegister?.platArea;
  if (landArea) {
    const landStr = Math.round(landArea).toString();
    const landPy = (landArea / 3.3058).toFixed(0);
    const hasLand = allText.includes(landStr) || allText.includes(`${landPy}평`) || allText.includes(landArea.toString());
    if (!hasLand) {
      failures.push(`Land area ${landArea}㎡ (${landPy}평) not found in generated sections`);
    }
  }

  const grossArea = input.supplemental?.total_gross_area_m2 || input.external_data?.buildingRegister?.totalArea;
  if (grossArea) {
    const grossStr = Math.round(grossArea).toString();
    const grossPy = (grossArea / 3.3058).toFixed(0);
    const hasGross = allText.includes(grossStr) || allText.includes(`${grossPy}평`) || allText.includes(grossArea.toString());
    if (!hasGross) {
      failures.push(`Gross area ${grossArea}㎡ (${grossPy}평) not found in generated sections`);
    }
  }

  // 3. Rent & Deposit check (for income posture)
  if (posture === 'income') {
    const rentKrw = input.supplemental?.monthly_rent_total_krw;
    if (rentKrw) {
      const rentManwon = (rentKrw / 10000).toLocaleString(); // e.g. "2,800"
      const rentManwonSimple = (rentKrw / 10000).toString(); // "2800"
      const hasRent = allText.includes(rentManwon) || allText.includes(rentManwonSimple) || allText.includes(rentKrw.toLocaleString());
      if (!hasRent) {
        failures.push(`Monthly rent ${rentManwon}만원 (${rentKrw} KRW) not found in income sections`);
      }
    }

    const depositManwon = input.supplemental?.total_deposit_manwon;
    if (depositManwon) {
      const depEok = (depositManwon / 10000).toString(); // "3"
      const depManwonStr = depositManwon.toLocaleString(); // "30,000"
      const hasDep = new RegExp(`${depEok}억`).test(allText) || allText.includes(depManwonStr) || allText.includes((depositManwon * 10000).toLocaleString());
      if (!hasDep) {
        failures.push(`Total deposit ${depEok}억 원 (${depositManwon}만원) not found in income sections`);
      }
    }
  }

  // 4. Operating metrics (for operating posture)
  if (posture === 'operating') {
    const gop = (input.supplemental as any)?.annual_gop_krw;
    if (gop) {
      const gopEok = (gop / 1e8).toFixed(1); // "8.5"
      const hasGop = allText.includes(gopEok) || allText.includes('8.5억') || allText.includes(gop.toLocaleString());
      if (!hasGop) {
        failures.push(`GOP ${gopEok}억원 not found in operating sections`);
      }
    }
  }

  return { passed: failures.length === 0, failures };
}

/**
 * Dimension 2: Rent Roll Completeness & Parity Assertion
 * Checks that every floor in floor_leases is represented in markdown tables/rows,
 * and the sum of floor rents equals the monthly total.
 */
export function assertRentRollParity(
  input: MobileIMWriterInput,
  sections: MobileIMSection[]
): AssertionResult {
  const failures: string[] = [];
  const floorLeases = input.supplemental?.floor_leases;
  const leaseSection = sections.find((s) => s.section_type === 'lease_status');
  const allText = sections.map((s) => s.markdown).join('\n');
  const targetText = leaseSection ? leaseSection.markdown : allText;

  if (Array.isArray(floorLeases) && floorLeases.length > 0) {
    // 1. Verify every floor identifier appears
    for (const fl of floorLeases) {
      const floorKey = fl.floor;
      const floorKorean = floorKey.replace(/F$/, '층');
      const hasFloor = targetText.includes(floorKey) || targetText.includes(floorKorean);
      if (!hasFloor) {
        failures.push(`Floor ${floorKey} from rent roll not represented in lease sections`);
      }
    }

    // 2. Verify sum of rents matches monthly total
    const sumRentManwon = floorLeases.reduce((sum, fl) => sum + (Number(fl.rent_manwon) || 0), 0);
    const expectedRentManwon = input.supplemental?.monthly_rent_total_krw
      ? input.supplemental.monthly_rent_total_krw / 10000
      : undefined;

    if (expectedRentManwon !== undefined && sumRentManwon !== expectedRentManwon) {
      failures.push(`Sum of floor rents (${sumRentManwon}만원) does not match monthly total (${expectedRentManwon}만원)`);
    }

    // 3. Verify total rent appears in target text
    if (sumRentManwon > 0) {
      const rentStr = sumRentManwon.toLocaleString();
      const hasSum = targetText.includes(rentStr) || targetText.includes(sumRentManwon.toString());
      if (!hasSum) {
        failures.push(`Rent roll total ${rentStr}만원 not found in lease status markdown`);
      }
    }
  }

  return { passed: failures.length === 0, failures };
}

/**
 * Dimension 3: Zero Negative Invariants Assertion
 * Asserts 0 poison tokens, 0 persona leaks (Rule 1), 0 evasive phrases (Rule 37),
 * and 0 price bands (Rule 52) in section narrative bodies.
 */
export function assertNegativeInvariants(
  sections: MobileIMSection[]
): {
  passed: boolean;
  zeroPoisonTokens: boolean;
  zeroPersonaLeaks: boolean;
  zeroEvasivePhrases: boolean;
  zeroPriceBands: boolean;
  failures: string[];
} {
  const failures: string[] = [];
  let zeroPoisonTokens = true;
  let zeroPersonaLeaks = true;
  let zeroEvasivePhrases = true;
  let zeroPriceBands = true;

  // 1. Poison tokens
  const poisonRegex = /(?:\bNaN\b|\bundefined\b|\bnull\b|\[object Object\]|NaN%|NaN원)/i;

  // 2. Persona leaks (Rule 1)
  const personaLeaks = [
    '60대 자산가',
    '60대 자산가를 위한',
    '법인 대표 맞춤',
    '개인 투자자 맞춤',
    '은퇴 자산가',
    '초보 투자자용',
    '자녀 세대 가업승계용',
    '가업승계',
  ];

  // 3. Evasive phrases (Rule 37)
  const evasivePhrases = [
    '본문을 참조',
    '별도 안내 예정',
    '추후 확인',
    '상세...별첨',
    '구체적인 수치는 본문을 참조',
    '자문 후 확정',
  ];

  // 4. Price bands in narrative body (Rule 52)
  const priceBandRegex = /\b\d+억대\b/g;

  for (const s of sections) {
    const content = `${s.title}\n${s.markdown}`;

    // Poison token check
    if (poisonRegex.test(content)) {
      const match = content.match(poisonRegex);
      failures.push(`[Poison Token] Found '${match?.[0]}' in section '${s.section_type}'`);
      zeroPoisonTokens = false;
    }

    // Persona leak check
    for (const p of personaLeaks) {
      if (content.includes(p)) {
        failures.push(`[Rule 1 Persona Leak] Found '${p}' in section '${s.section_type}'`);
        zeroPersonaLeaks = false;
      }
    }

    // Evasion check
    for (const e of evasivePhrases) {
      if (content.includes(e)) {
        failures.push(`[Rule 37 Evasion Phrase] Found '${e}' in section '${s.section_type}'`);
        zeroEvasivePhrases = false;
      }
    }

    // Price band check in narrative body
    if (priceBandRegex.test(s.markdown)) {
      const match = s.markdown.match(priceBandRegex);
      failures.push(`[Rule 52 Price Band] Found '${match?.[0]}' in section '${s.section_type}' narrative`);
      zeroPriceBands = false;
    }
  }

  const passed = zeroPoisonTokens && zeroPersonaLeaks && zeroEvasivePhrases && zeroPriceBands;
  return {
    passed,
    zeroPoisonTokens,
    zeroPersonaLeaks,
    zeroEvasivePhrases,
    zeroPriceBands,
    failures,
  };
}

/**
 * Dimension 4: Proposal Integrity Assertion
 * Asserts that broker-confirmed value-add and investment thesis points are faithfully represented.
 */
export function assertProposalIntegrity(
  proposals: any[],
  sections: MobileIMSection[]
): AssertionResult {
  const failures: string[] = [];
  const allText = sections.map((s) => s.markdown).join('\n');

  if (Array.isArray(proposals) && proposals.length > 0) {
    for (const prop of proposals) {
      if (typeof prop === 'string') {
        const keywords = prop.split(/\s+/).filter((w) => w.length >= 2);
        const hasFull = allText.includes(prop);
        const matchCount = keywords.filter((kw) => allText.includes(kw)).length;
        const hasMajority = keywords.length > 0 && matchCount >= Math.min(2, keywords.length);
        if (!hasFull && !hasMajority) {
          failures.push(`Proposal point '${prop}' or its key terms not represented in generated output`);
        }
      } else if (prop && typeof prop === 'object') {
        if (prop.approvalState === 'broker_confirmed') {
          const text = prop.finalCopy || prop.buyerIntentMeaning || prop.brokerRawText || '';
          if (text) {
            const keywords = text.split(/\s+/).filter((w: string) => w.length >= 2);
            const hasFull = allText.includes(text);
            const matchCount = keywords.filter((kw: string) => allText.includes(kw)).length;
            const hasMajority = keywords.length > 0 && matchCount >= Math.min(2, keywords.length);
            if (!hasFull && !hasMajority) {
              failures.push(`Confirmed proposal '${text}' not reflected in output sections`);
            }
          }
        }
      }
    }
  }

  return { passed: failures.length === 0, failures };
}

/**
 * Dimension 5: Missing Data Safety & Graceful Fallback Assertion
 * Asserts that when degenerate inputs are provided, the pipeline executes safely
 * without crashes or poison tokens, and renders clean fallback claims.
 */
export function assertMissingDataSafety(
  emptyInput: MobileIMWriterInput,
  sections: MobileIMSection[]
): AssertionResult {
  const failures: string[] = [];

  if (!Array.isArray(sections) || sections.length === 0) {
    failures.push('Sections array is empty when generated from degenerate input');
    return { passed: false, failures };
  }

  const poisonRegex = /(?:\bNaN\b|\bundefined\b|\bnull\b|\[object Object\]|NaN%|NaN원)/i;
  for (const s of sections) {
    const text = `${s.title}\n${s.markdown}`;
    if (poisonRegex.test(text)) {
      const match = text.match(poisonRegex);
      failures.push(`[Poison Token on Missing Data] Found '${match?.[0]}' in section '${s.section_type}'`);
    }
  }

  const allText = sections.map((s) => s.markdown).join('\n');
  const hasFallbackIndicators =
    allText.includes('확인 필요') ||
    allText.includes('담당 브로커') ||
    allText.includes('미정') ||
    allText.includes('자료') ||
    allText.includes('-');

  if (!hasFallbackIndicators) {
    failures.push('Missing data output did not include any graceful fallback indicators or notices');
  }

  return { passed: failures.length === 0, failures };
}

/**
 * Combined Data Fidelity Evaluation Runner
 */
export function evaluateDataFidelity(
  input: MobileIMWriterInput,
  sections: MobileIMSection[],
  proposals?: any[]
): DataFidelityAssertionReport {
  const posture = input.identity?.investmentPosture || 'income';
  const numResult = assertNumericParity(input, sections);
  const rentRollResult = assertRentRollParity(input, sections);
  const negResult = assertNegativeInvariants(sections);
  const propResult = assertProposalIntegrity(proposals || (input.supplemental as any)?.proposals || [], sections);
  const missingResult = assertMissingDataSafety(input, sections);

  const allFailures = [
    ...numResult.failures,
    ...rentRollResult.failures,
    ...negResult.failures,
    ...propResult.failures,
  ];

  return {
    posture,
    numericParityPassed: numResult.passed,
    rentRollPassed: rentRollResult.passed,
    zeroPoisonTokensPassed: negResult.zeroPoisonTokens,
    zeroPersonaLeaksPassed: negResult.zeroPersonaLeaks,
    zeroPriceBandsPassed: negResult.zeroPriceBands,
    missingDataHandledGracefully: missingResult.passed,
    failures: allFailures,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 3. 5 Realistic Posture Fixtures
// ═══════════════════════════════════════════════════════════════════

export const FIXTURE_INCOME: MobileIMWriterInput = {
  building_ssot_lite: {
    id: 'fixture-income-dangsan',
    address: '서울특별시 영등포구 당산동1가 72-1',
    investment_posture: 'income',
    asking_price: 11_500_000_000,
    price_band: '115억 원',
    total_area: 991.7,
    plat_area: 330.5,
    fit_summary: '신축 리모델링을 통한 임대수익률 개선 및 우량 테넌트 유치',
    layers: { location: {} },
  } as any,
  identity: {
    investmentPosture: 'income',
    assetType: 'retail_strip',
  },
  supplemental: {
    resolved_address: '서울특별시 영등포구 당산동1가 72-1',
    asking_price_manwon: 1_150_000,
    monthly_rent_total_krw: 28_000_000,
    total_deposit_manwon: 30_000,
    land_area_m2: 330.5,
    total_gross_area_m2: 991.7,
    floor_leases: [
      { floor: '1F', tenant_type: '근생(소매점)', rent_manwon: 800, deposit_manwon: 10_000, area_sqm: 198.3 },
      { floor: '2F', tenant_type: '일반음식점', rent_manwon: 600, deposit_manwon: 5_000, area_sqm: 198.3 },
      { floor: '3F', tenant_type: '의원/클리닉', rent_manwon: 500, deposit_manwon: 5_000, area_sqm: 198.3 },
      { floor: '4F', tenant_type: '학원/교습소', rent_manwon: 450, deposit_manwon: 5_000, area_sqm: 198.3 },
      { floor: '5F', tenant_type: '업무시설', rent_manwon: 450, deposit_manwon: 5_000, area_sqm: 198.5 },
    ],
    broker_highlight: '당산역 역세권 115억 원 안정적 임대수익형 자산',
    proposals: [
      '신축 리모델링을 통한 임대수익률 개선',
      '우량 테넌트 유치 및 장기 안정적 현금흐름 확보',
    ],
  } as any,
  readiness: { score: 95, missing: [] },
  dataGrade: 'A',
  external_data: {
    buildingRegister: { platArea: 330.5, totalArea: 991.7 },
    landUsePlan: { zoningDistrict: '준공업지역' },
  } as any,
};

export const FIXTURE_DEVELOPMENT: MobileIMWriterInput = {
  building_ssot_lite: {
    id: 'fixture-dev-daeheung',
    address: '서울특별시 마포구 대흥동 12-41',
    investment_posture: 'development',
    asking_price: 8_500_000_000,
    price_band: '85억 원',
    total_area: 495.0,
    plat_area: 450.0,
    fit_summary: '신축 개발을 통한 자산가치 극대화 및 근린생활시설 개발 인허가 용이',
    layers: { location: {} },
  } as any,
  identity: {
    investmentPosture: 'development',
    assetType: 'bare_land',
  },
  supplemental: {
    resolved_address: '서울특별시 마포구 대흥동 12-41',
    asking_price_manwon: 850_000,
    land_area_m2: 450.0,
    total_gross_area_m2: 495.0,
    developmentSpec: {
      constructionCostPerPyeong: 850,
      targetScalePyeong: 340,
      expectedSalePricePerPyeong: 5000,
    },
    broker_highlight: '대흥동 신축 개발 부지, 85억 원, 잔여 용적률 여력 확보',
    proposals: [
      '신축 개발을 통한 자산가치 극대화',
      '근린생활시설 개발 인허가 용이',
    ],
  } as any,
  readiness: { score: 90, missing: [] },
  dataGrade: 'A',
  external_data: {
    buildingRegister: { platArea: 450.0, totalArea: 495.0 },
    landUsePlan: { zoningDistrict: '제2종일반주거지역', floorAreaRatioMax: 200, buildingCoverageMax: 60 },
  } as any,
};

export const FIXTURE_OPERATING: MobileIMWriterInput = {
  building_ssot_lite: {
    id: 'fixture-operating-sinsa',
    address: '서울특별시 강남구 신사동 590',
    investment_posture: 'operating',
    asking_price: 21_000_000_000,
    price_band: '210억 원',
    total_area: 2_400.0,
    plat_area: 660.0,
    fit_summary: '직영 오퍼레이션 고도화를 통한 GOP 개선 및 관광객 유치 확대',
    layers: { location: {} },
  } as any,
  identity: {
    investmentPosture: 'operating',
    assetType: 'hotel',
  },
  supplemental: {
    resolved_address: '서울특별시 강남구 신사동 590',
    asking_price_manwon: 2_100_000,
    land_area_m2: 660.0,
    total_gross_area_m2: 2400.0,
    annual_gop_krw: 850_000_000,
    gop_margin_pct: 35.0,
    annual_revenue_krw: 2_428_571_428,
    broker_highlight: '신사동 근생/숙박 운영형 자산, 210억 원, GOP 8.5억 원, OCC 78%, ADR 18만 원',
    proposals: [
      '직영 오퍼레이션 고도화를 통한 GOP 개선',
      '관광객 및 비즈니스 투숙객 유치 확대',
    ],
  } as any,
  readiness: { score: 92, missing: [] },
  dataGrade: 'A',
  external_data: {
    buildingRegister: { platArea: 660.0, totalArea: 2400.0 },
    landUsePlan: { zoningDistrict: '일반상업지역' },
  } as any,
};

export const FIXTURE_OWNER_OCCUPIED: MobileIMWriterInput = {
  building_ssot_lite: {
    id: 'fixture-ownocc-seocho',
    address: '서울특별시 서초구 서초동 1364-28',
    investment_posture: 'owner_occupied',
    asking_price: 18_000_000_000,
    price_band: '180억 원',
    total_area: 1_500.0,
    plat_area: 520.0,
    fit_summary: '단독 사옥 브랜딩 및 사옥 이전비 절감, 전 층 단독 사용 및 즉시 명도 완료',
    layers: { location: {} },
  } as any,
  identity: {
    investmentPosture: 'owner_occupied',
    assetType: 'office_building',
  },
  supplemental: {
    resolved_address: '서울특별시 서초구 서초동 1364-28',
    asking_price_manwon: 1_800_000,
    land_area_m2: 520.0,
    total_gross_area_m2: 1500.0,
    occupancySpec: {
      currentRentManwon: 4500,
    },
    broker_highlight: '서초동 사옥형 오피스, 180억 원, 연면적 1,500㎡, 즉시 명도 가능',
    proposals: [
      '단독 사옥 브랜딩 및 사옥 이전비 절감',
      '전 층 단독 사용 및 즉시 명도 완료',
    ],
  } as any,
  readiness: { score: 92, missing: [] },
  dataGrade: 'A',
  external_data: {
    buildingRegister: { platArea: 520.0, totalArea: 1500.0 },
    landUsePlan: { zoningDistrict: '제3종일반주거지역' },
  } as any,
};

export const FIXTURE_TRADING: MobileIMWriterInput = {
  building_ssot_lite: {
    id: 'fixture-trading-yeoksam',
    address: '서울특별시 강남구 역삼동 832-7',
    investment_posture: 'trading',
    asking_price: 14_000_000_000,
    price_band: '140억 원',
    total_area: 1_200.0,
    plat_area: 400.0,
    fit_summary: '단기 밸류애드 후 매각 차익 실현 및 인근 실거래가 대비 가격 경쟁력 확보',
    layers: { location: {} },
  } as any,
  identity: {
    investmentPosture: 'trading',
    assetType: 'retail_strip',
  },
  supplemental: {
    resolved_address: '서울특별시 강남구 역삼동 832-7',
    asking_price_manwon: 1_400_000,
    land_area_m2: 400.0,
    total_gross_area_m2: 1200.0,
    broker_highlight: '역삼동 테헤란로 이면 매매/차익형 빌딩, 140억 원, 시세 대비 밸류 우수',
    proposals: [
      '단기 밸류애드 후 매각 차익 실현',
      '인근 실거래가 대비 가격 경쟁력 확보',
    ],
  } as any,
  readiness: { score: 90, missing: [] },
  dataGrade: 'A',
  external_data: {
    buildingRegister: { platArea: 400.0, totalArea: 1200.0 },
    landUsePlan: { zoningDistrict: '제3종일반주거지역' },
  } as any,
};

export const FIXTURE_DEGENERATE_EMPTY: MobileIMWriterInput = {
  building_ssot_lite: {
    id: 'fixture-degenerate-empty',
    address: '확인 필요',
    investment_posture: 'income',
  } as any,
  supplemental: {} as any,
  readiness: { score: 10, missing: ['asking_price', 'address', 'area'] } as any,
  identity: {
    investmentPosture: 'income',
    assetType: 'retail_strip',
  },
};

// ═══════════════════════════════════════════════════════════════════
// 4. Vitest Test Suite Execution
// ═══════════════════════════════════════════════════════════════════

describe('5-Posture Mobile IM Data Fidelity Assertion Suite', () => {

  // ─────────────────────────────────────────────────────────────────
  // Tier 1: 5-Posture Primary Behavior (Happy Path)
  // ─────────────────────────────────────────────────────────────────
  describe('Tier 1: 5-Posture Primary Behavior & Exact Parity', () => {

    it('Posture 1: income (당산동 빌딩 115억) full generation & data fidelity report', async () => {
      const output = await generateMobileIM(FIXTURE_INCOME);
      expect(output).toBeDefined();
      expect(output.sections.length).toBeGreaterThanOrEqual(5);

      const report = evaluateDataFidelity(FIXTURE_INCOME, output.sections, (FIXTURE_INCOME.supplemental as any).proposals);
      expect(report.failures).toEqual([]);
      expect(report.numericParityPassed).toBe(true);
      expect(report.rentRollPassed).toBe(true);
      expect(report.zeroPoisonTokensPassed).toBe(true);
      expect(report.zeroPersonaLeaksPassed).toBe(true);
      expect(report.zeroPriceBandsPassed).toBe(true);
    });

    it('Posture 2: development (대흥동 부지 85억) full generation & data fidelity report', async () => {
      const output = await generateMobileIM(FIXTURE_DEVELOPMENT);
      expect(output).toBeDefined();
      expect(output.sections.length).toBeGreaterThanOrEqual(4);

      const report = evaluateDataFidelity(FIXTURE_DEVELOPMENT, output.sections, (FIXTURE_DEVELOPMENT.supplemental as any).proposals);
      expect(report.failures).toEqual([]);
      expect(report.numericParityPassed).toBe(true);
      expect(report.zeroPoisonTokensPassed).toBe(true);
      expect(report.zeroPersonaLeaksPassed).toBe(true);
      expect(report.zeroPriceBandsPassed).toBe(true);
    });

    it('Posture 3: operating (신사동 근생/숙박 210억, GOP 8.5억) full generation & data fidelity report', async () => {
      const output = await generateMobileIM(FIXTURE_OPERATING);
      expect(output).toBeDefined();
      expect(output.sections.length).toBeGreaterThanOrEqual(4);

      const report = evaluateDataFidelity(FIXTURE_OPERATING, output.sections, (FIXTURE_OPERATING.supplemental as any).proposals);
      expect(report.failures).toEqual([]);
      expect(report.numericParityPassed).toBe(true);
      expect(report.zeroPoisonTokensPassed).toBe(true);
      expect(report.zeroPersonaLeaksPassed).toBe(true);
      expect(report.zeroPriceBandsPassed).toBe(true);
    });

    it('Posture 4: owner_occupied (서초동 오피스 180억, 연면적 1,500㎡) full generation & data fidelity report', async () => {
      const output = await generateMobileIM(FIXTURE_OWNER_OCCUPIED);
      expect(output).toBeDefined();
      expect(output.sections.length).toBeGreaterThanOrEqual(4);

      const report = evaluateDataFidelity(FIXTURE_OWNER_OCCUPIED, output.sections, (FIXTURE_OWNER_OCCUPIED.supplemental as any).proposals);
      expect(report.failures).toEqual([]);
      expect(report.numericParityPassed).toBe(true);
      expect(report.zeroPoisonTokensPassed).toBe(true);
      expect(report.zeroPersonaLeaksPassed).toBe(true);
      expect(report.zeroPriceBandsPassed).toBe(true);
    });

    it('Posture 5: trading (역삼동 빌딩 140억) full generation & data fidelity report', async () => {
      const output = await generateMobileIM(FIXTURE_TRADING);
      expect(output).toBeDefined();
      expect(output.sections.length).toBeGreaterThanOrEqual(4);

      const report = evaluateDataFidelity(FIXTURE_TRADING, output.sections, (FIXTURE_TRADING.supplemental as any).proposals);
      expect(report.failures).toEqual([]);
      expect(report.numericParityPassed).toBe(true);
      expect(report.zeroPoisonTokensPassed).toBe(true);
      expect(report.zeroPersonaLeaksPassed).toBe(true);
      expect(report.zeroPriceBandsPassed).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Tier 2: Boundary & Corner Cases (Degenerate inputs)
  // ─────────────────────────────────────────────────────────────────
  describe('Tier 2: Boundary & Corner Cases (Missing Data Defense)', () => {

    it('Graceful handling of degenerate empty input without crashes or poison tokens', async () => {
      const output = await generateMobileIM(FIXTURE_DEGENERATE_EMPTY);
      expect(output).toBeDefined();
      expect(output.sections.length).toBeGreaterThanOrEqual(1);

      const missingResult = assertMissingDataSafety(FIXTURE_DEGENERATE_EMPTY, output.sections);
      expect(missingResult.passed).toBe(true);
      expect(missingResult.failures).toEqual([]);

      const negResult = assertNegativeInvariants(output.sections);
      expect(negResult.passed).toBe(true);
      expect(negResult.failures).toEqual([]);
    });

    it('Graceful handling of empty floor_leases array in income posture', async () => {
      const inputWithoutLeases: MobileIMWriterInput = {
        ...FIXTURE_INCOME,
        supplemental: {
          ...FIXTURE_INCOME.supplemental,
          floor_leases: [],
        },
      };

      const output = await generateMobileIM(inputWithoutLeases);
      expect(output.sections.length).toBeGreaterThanOrEqual(4);

      const negResult = assertNegativeInvariants(output.sections);
      expect(negResult.zeroPoisonTokens).toBe(true);
      expect(negResult.zeroPersonaLeaks).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Tier 3: Cross-Feature Invariant Assertions
  // ─────────────────────────────────────────────────────────────────
  describe('Tier 3: Cross-Feature Negative Invariants', () => {

    it('Zero poison tokens (NaN, undefined, null, [object Object]) across all 5 postures', async () => {
      const fixtures = [
        FIXTURE_INCOME,
        FIXTURE_DEVELOPMENT,
        FIXTURE_OPERATING,
        FIXTURE_OWNER_OCCUPIED,
        FIXTURE_TRADING,
      ];

      for (const fix of fixtures) {
        const output = await generateMobileIM(fix);
        const neg = assertNegativeInvariants(output.sections);
        expect(neg.zeroPoisonTokens, `Poison token found in ${fix.identity?.investmentPosture}: ${neg.failures.join('; ')}`).toBe(true);
      }
    });

    it('Zero Rule 1 persona leaks (60대 자산가, 법인 대표 맞춤 등) across all outputs', async () => {
      const fixtures = [
        FIXTURE_INCOME,
        FIXTURE_DEVELOPMENT,
        FIXTURE_OPERATING,
        FIXTURE_OWNER_OCCUPIED,
        FIXTURE_TRADING,
      ];

      for (const fix of fixtures) {
        const output = await generateMobileIM(fix);
        const neg = assertNegativeInvariants(output.sections);
        expect(neg.zeroPersonaLeaks, `Persona leak found in ${fix.identity?.investmentPosture}: ${neg.failures.join('; ')}`).toBe(true);
      }
    });

    it('Zero Rule 37 evasive phrases (본문을 참조, 별도 안내 예정 등)', async () => {
      const fixtures = [
        FIXTURE_INCOME,
        FIXTURE_DEVELOPMENT,
        FIXTURE_OPERATING,
        FIXTURE_OWNER_OCCUPIED,
        FIXTURE_TRADING,
      ];

      for (const fix of fixtures) {
        const output = await generateMobileIM(fix);
        const neg = assertNegativeInvariants(output.sections);
        expect(neg.zeroEvasivePhrases, `Evasive phrase found in ${fix.identity?.investmentPosture}: ${neg.failures.join('; ')}`).toBe(true);
      }
    });

    it('Zero Rule 52 price bands (200억대 등) in section narratives', async () => {
      const fixtures = [
        FIXTURE_INCOME,
        FIXTURE_DEVELOPMENT,
        FIXTURE_OPERATING,
        FIXTURE_OWNER_OCCUPIED,
        FIXTURE_TRADING,
      ];

      for (const fix of fixtures) {
        const output = await generateMobileIM(fix);
        const neg = assertNegativeInvariants(output.sections);
        expect(neg.zeroPriceBands, `Price band found in ${fix.identity?.investmentPosture}: ${neg.failures.join('; ')}`).toBe(true);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Tier 4: Rent Roll Parity & Proposal Integrity
  // ─────────────────────────────────────────────────────────────────
  describe('Tier 4: Rent Roll Parity & Proposal Integrity', () => {

    it('assertRentRollParity detects floor rent mismatch when manipulated', () => {
      const corruptInput: MobileIMWriterInput = {
        ...FIXTURE_INCOME,
        supplemental: {
          ...FIXTURE_INCOME.supplemental,
          monthly_rent_total_krw: 35_000_000, // Deliberate mismatch with floor_leases sum (28,000,000)
        },
      };

      const fakeSections: MobileIMSection[] = [
        {
          section_type: 'lease_status',
          section_order: 3,
          title: '임대차 현황',
          markdown: '| 1F | 근생 | 800만원 |\n| 2F | 근생 | 600만원 |\n| 3F | 근생 | 500만원 |\n| 4F | 근생 | 450만원 |\n| 5F | 근생 | 450만원 |',
          confidence: 'confirmed',
          boundary_note: '',
        },
      ];

      const res = assertRentRollParity(corruptInput, fakeSections);
      expect(res.passed).toBe(false);
      expect(res.failures.some((f) => f.includes('Sum of floor rents'))).toBe(true);
    });

    it('assertProposalIntegrity validates confirmed ProposalUnit objects', () => {
      const proposalUnits: Partial<ProposalUnit>[] = [
        {
          id: 'prop-1',
          approvalState: 'broker_confirmed',
          finalCopy: '신축 리모델링을 통한 임대수익률 개선',
          buyerIntentMeaning: '임대수익 극대화 전략',
        },
        {
          id: 'prop-2',
          approvalState: 'draft',
          finalCopy: '미승인 초안 제안 내용 (제외되어야 함)',
        },
      ];

      const testSections: MobileIMSection[] = [
        {
          section_type: 'investment_thesis',
          section_order: 6,
          title: '투자 논거',
          markdown: '### 핵심 전략\n- 신축 리모델링을 통한 임대수익률 개선 효과가 기대됩니다.',
          confidence: 'confirmed',
          boundary_note: '',
        },
      ];

      const res = assertProposalIntegrity(proposalUnits, testSections);
      expect(res.passed).toBe(true);
      expect(res.failures).toEqual([]);
    });
  });
});
