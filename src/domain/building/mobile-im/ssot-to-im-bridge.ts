/**
 * ssot-to-im-bridge.ts
 * 
 * 딜카드 → IM 데이터 자동 공급 브릿지.
 * 딜카드 생성 시 SSoT에 저장된 데이터를 IM 생성에 필요한 supplemental 형태로 변환.
 */

import type { MobileIMSupplementalInput, AncillaryIncomeItem, FloorLeaseInput } from './types';
import { sanitizeTextHygiene } from './terminology-normalizer';
import { humanizeGuardrailTokensForView } from './guardrails';
import { readSsotLayerAreas, positiveOrNull } from './resolve-total-area';

export interface DealCardToIMBridgeInput {
  // building_ssot_lite fields
  ssot: {
    area_signal?: string;
    asset_type?: string;
    price_band?: string;
    size_signal?: string;
    vacancy_signal?: string;
    fit_summary?: string;
    caution_summary?: string;
    layers?: Record<string, any>;
    /** 메모 원문 — "신축/계획/가능 연면적" 라벨 판정(개발 포스처 계획 GFA 분리)에 사용 (선택) */
    raw_input?: string;
    lease_summary?: Record<string, any>;
    /** 비임대 부가수입 (통신장비, 주차 등) */
    ancillary_incomes?: AncillaryIncomeItem[];
    /** 층별 임대차 데이터 (변동임대 포함) */
    floor_leases?: FloorLeaseInput[];
  };
  // v3 teaser view fields (from teaser-projector)
  teaserView?: {
    bandedPrice?: string;
    bandedCapRate?: string;
    bandedArea?: string;
    vacancyLabel?: string;
    region?: string;
    archetypeResult?: {
      primaryArchetype: string;
      secondaryArchetypes: string[];
      confidenceScore: number;
      reasons: string[];
    };
    dataGrade?: string;
  };
  // blind teaser AI output
  blindTeaser?: {
    hookCopy?: string;
    dealPoints?: string[];
    cautionPoints?: string[];
    curiosityHook?: string;
    structureChips?: string[];
  };
}

export interface DealCardToIMBridgeOutput {
  supplemental: Partial<MobileIMSupplementalInput>;
  prefillData: {
    address?: string;
    pnu?: string;
    monthlyRent?: number; // 만원
    totalDeposit?: number; // 만원
    mgmtFeeTotal?: number; // 만원
    loanAmount?: number; // 만원
    askingPrice?: number; // 만원
    vacancyPct?: number;
    brokerHighlight?: string;
    photoUrls?: string[];
  };
  /** Grade computed from current SSoT data */
  currentGrade?: string;
  /** Items needed to reach next grade */
  gradeUpItems: { field: string; label: string; gradeContribution: string }[];
}

import type { InvestmentPosture } from '@/domain/ontology';

/**
 * 딜카드/SSoT 데이터를 IM supplemental + 바텀시트 프리필 데이터로 변환.
 */
export function bridgeDealCardToIM(
  input: DealCardToIMBridgeInput,
  posture: InvestmentPosture = 'income'
): DealCardToIMBridgeOutput {
  const { ssot, teaserView, blindTeaser } = input;
  const layers = ssot?.layers || {};
  const lease = ssot?.lease_summary || {};

  // Extract address from layers
  const address = layers.location?.address || layers.location?.neighborhood || undefined;
  const pnu = layers.location?.pnu || undefined;

  // Extract financial data from lease_summary (preserve exact KRW precision)
  const monthlyRentTotalKrw = lease.monthly_rent_total_krw != null
    ? Number(lease.monthly_rent_total_krw)
    : undefined;
  const monthlyRent = monthlyRentTotalKrw != null
    ? Math.round(monthlyRentTotalKrw / 10000)
    : undefined;
  const totalDeposit = lease.total_deposit_manwon || undefined;
  const mgmtFeeTotal = lease.mgmt_fee_total_manwon || undefined;
  const loanAmount = lease.loan_amount_manwon || undefined;
  const askingPrice = lease.asking_price_manwon || undefined;
  const monthlyRevenue = lease.monthly_revenue_manwon || undefined;
  const vacancyPct = lease.vacancy_pct ?? (lease.vacancy_rate != null ? lease.vacancy_rate * 100 : undefined);

  // Photos from layers
  const photoUrls = Array.isArray(layers.photos)
    ? layers.photos.map((p: any) => typeof p === 'string' ? p : p?.url).filter(Boolean)
    : undefined;

  // Broker highlight from blindTeaser or fit_summary — sanitize & humanize
  const rawHighlight = blindTeaser?.hookCopy || ssot?.fit_summary || undefined;
  const brokerHighlight = rawHighlight
    ? humanizeGuardrailTokensForView(sanitizeTextHygiene(rawHighlight), 'institutional')
    : undefined;

  // Caution summary — sanitize & humanize
  const rawCaution = ssot?.caution_summary || undefined;
  const cautionSummary = rawCaution
    ? humanizeGuardrailTokensForView(sanitizeTextHygiene(rawCaution), 'institutional')
    : undefined;

  // Bridge ancillary incomes from SSoT
  const ancillaryIncomes = ssot?.ancillary_incomes || undefined;

  // Bridge floor leases (including variable rent types)
  const floorLeases = ssot?.floor_leases || undefined;

  // ── R1: Map 8 Missing Domain Layers from SSoT ──
  const hotelOperating = ssot?.layers?.hotel_operating || ssot?.layers?.hotel || (ssot as any)?.hotel_operating || undefined;
  // B1: SSoT 면적 키 불일치 흡수 (layers.physical.*_sqm ㎡ + layers.total_floor_area_pyung/land_area_pyung 평 flat)
  const ssotAreas = readSsotLayerAreas(layers, { memoText: ssot?.raw_input, development: posture === 'development' });
  const baseDevelopmentSpec = ssot?.layers?.developmentSpec || ssot?.layers?.development || (ssot as any)?.developmentSpec || undefined;
  // 개발 포스처: 메모의 신축/계획/가능 연면적은 기존 연면적이 아니라 계획 GFA(targetScalePyung)
  const developmentSpec = (posture === 'development' && ssotAreas.plannedGfaSqm > 0
    && !(Number(baseDevelopmentSpec?.targetScalePyung) > 0) && !(Number(baseDevelopmentSpec?.targetScalePyeong) > 0))
    ? { ...(baseDevelopmentSpec ?? {}), targetScalePyung: Math.round(ssotAreas.plannedGfaSqm * 0.3025 * 10) / 10 }
    : baseDevelopmentSpec;
  const occupancySpec = ssot?.layers?.occupancySpec || ssot?.layers?.occupancy || (ssot as any)?.occupancySpec || undefined;
  const logistics = ssot?.layers?.logistics || (ssot as any)?.logistics || undefined;
  const manualComps = ssot?.layers?.manual_comps || ssot?.layers?.comparables || (ssot as any)?.manual_comps || undefined;
  const acquisitionTaxPct = ssot?.layers?.financial?.acquisition_tax_pct ?? (ssot as any)?.acquisition_tax_pct ?? undefined;
  const brokerageFeeManwon = ssot?.layers?.financial?.brokerage_fee_manwon ?? (ssot as any)?.brokerage_fee_manwon ?? undefined;
  const ltvPct = ssot?.layers?.financial?.ltv_pct ?? (ssot as any)?.ltv_pct ?? undefined;

  // Additional physical & financial layers
  const totalGrossAreaM2 = (ssotAreas.totalFrom === 'physical_sqm' ? ssotAreas.totalSqm : undefined)
    ?? positiveOrNull((ssot as any)?.total_area) ?? positiveOrNull((ssot as any)?.total_gross_area_m2)
    ?? positiveOrNull(ssotAreas.totalSqm) ?? undefined;
  const landAreaM2 = (ssotAreas.landFrom === 'physical_sqm' ? ssotAreas.landSqm : undefined)
    ?? positiveOrNull((ssot as any)?.plat_area) ?? positiveOrNull((ssot as any)?.land_area_m2)
    ?? positiveOrNull(ssotAreas.landSqm) ?? undefined;
  const buildingName = layers.physical?.building_name ?? (ssot as any)?.building_name ?? undefined;
  const floorsAbove = layers.physical?.floors_above ?? (ssot as any)?.floors_above ?? undefined;
  const floorsBelow = layers.physical?.floors_below ?? (ssot as any)?.floors_below ?? undefined;
  const regulation = layers.regulation ?? (ssot as any)?.regulation ?? undefined;
  const parcels = layers.parcels ?? (ssot as any)?.parcels ?? undefined;
  const legalFeeManwon = ssot?.layers?.financial?.legal_fee_manwon ?? (ssot as any)?.legal_fee_manwon ?? undefined;
  const otherAcquisitionCostManwon = ssot?.layers?.financial?.other_acquisition_cost_manwon ?? (ssot as any)?.other_acquisition_cost_manwon ?? undefined;
  const loanInterestPct = ssot?.layers?.financial?.loan_interest_pct ?? (ssot as any)?.loan_interest_pct ?? undefined;
  const loanTermYears = ssot?.layers?.financial?.loan_term_years ?? (ssot as any)?.loan_term_years ?? undefined;
  const targetIrrPct = ssot?.layers?.financial?.target_irr_pct ?? (ssot as any)?.target_irr_pct ?? undefined;

  // Build supplemental
  const supplemental: Partial<MobileIMSupplementalInput> = {
    resolved_address: address,
    resolved_pnu: pnu,
    vacancy_status: ssot?.vacancy_signal || teaserView?.vacancyLabel || undefined,
    vacancy_pct: vacancyPct,
    monthly_rent_total_krw: monthlyRentTotalKrw,
    total_deposit_manwon: totalDeposit,
    mgmt_fee_total_manwon: mgmtFeeTotal,
    loan_amount_manwon: loanAmount,
    asking_price_manwon: askingPrice,
    broker_highlight: brokerHighlight,
    photo_urls: photoUrls,
    ancillary_incomes: ancillaryIncomes,
    floor_leases: floorLeases,
    monthly_revenue_manwon: monthlyRevenue,
    // 8 mapped domain layers
    hotel_operating: hotelOperating,
    developmentSpec,
    occupancySpec,
    logistics,
    manual_comps: manualComps,
    acquisition_tax_pct: acquisitionTaxPct,
    brokerage_fee_manwon: brokerageFeeManwon,
    ltv_pct: ltvPct,
    // Physical & financial details
    total_gross_area_m2: totalGrossAreaM2,
    land_area_m2: landAreaM2,
    building_name: buildingName,
    floors_above: floorsAbove,
    floors_below: floorsBelow,
    regulation,
    parcels,
    legal_fee_manwon: legalFeeManwon,
    other_acquisition_cost_manwon: otherAcquisitionCostManwon,
    loan_interest_pct: loanInterestPct,
    loan_term_years: loanTermYears,
    target_irr_pct: targetIrrPct,
  };

  // Determine grade-up items (Posture별 최적화)
  const gradeUpItems: DealCardToIMBridgeOutput['gradeUpItems'] = [];

  if (!address && !pnu) {
    gradeUpItems.push({ field: 'address', label: '정확한 주소', gradeContribution: 'D→C 필수' });
  }

  if (posture === 'development') {
    // 개발형: 대지면적, 용도지역이 핵심
    const landArea = landAreaM2;
    if (!landArea) {
      gradeUpItems.push({ field: 'landArea', label: '대지면적', gradeContribution: 'C→B 필수' });
    }
    if (!askingPrice) {
      gradeUpItems.push({ field: 'askingPrice', label: '매각 희망가 (토지비)', gradeContribution: 'B→A 필수' });
    }
  } else if (posture === 'owner_occupied') {
    // 사옥형: 연면적, 매각가가 핵심
    const grossArea = totalGrossAreaM2;
    if (!grossArea) {
      gradeUpItems.push({ field: 'grossArea', label: '연면적 (사용가능면적)', gradeContribution: 'C→B 필수' });
    }
    if (!askingPrice) {
      gradeUpItems.push({ field: 'askingPrice', label: '매각 희망가', gradeContribution: 'B→A 필수' });
    }
  } else if (posture === 'operating') {
    // 운영형: 매출/GOP가 핵심
    if (!monthlyRent && !monthlyRevenue) {
      gradeUpItems.push({ field: 'monthlyRevenue', label: '월 매출 / 운영 수입', gradeContribution: 'C→B 필수' });
    }
    if (!askingPrice) {
      gradeUpItems.push({ field: 'askingPrice', label: '매각 희망가', gradeContribution: 'B→A 필수' });
    }
  } else if (posture === 'trading') {
    // 단기매매형: 매각가·비교사례가 핵심
    if (!askingPrice) {
      gradeUpItems.push({ field: 'askingPrice', label: '매각 희망가', gradeContribution: 'C→B 필수' });
    }
  } else {
    // income (기본)
    if (!monthlyRent) {
      gradeUpItems.push({ field: 'monthlyRent', label: '월 임대료 총액', gradeContribution: 'C→B 필수' });
    }
    if (!askingPrice) {
      gradeUpItems.push({ field: 'askingPrice', label: '매각 희망가', gradeContribution: 'B→A 필수' });
    }
    if (vacancyPct == null) {
      gradeUpItems.push({ field: 'vacancyPct', label: '공실률', gradeContribution: 'A등급 보강' });
    }
    if (!floorLeases || floorLeases.length === 0) {
      gradeUpItems.push({ field: 'floorLeases', label: '층별 임대차 현황', gradeContribution: 'A등급 필수' });
    }
  }

  if (!loanAmount && posture !== 'development' && posture !== 'owner_occupied') {
    gradeUpItems.push({ field: 'loanAmount', label: '선순위 대출 잔액', gradeContribution: 'A등급 보강' });
  }
  if (!photoUrls || photoUrls.length === 0) {
    gradeUpItems.push({ field: 'photos', label: '건물 대표 사진', gradeContribution: '품질 향상' });
  }

  return {
    supplemental,
    prefillData: {
      address,
      pnu,
      monthlyRent,
      totalDeposit,
      mgmtFeeTotal,
      loanAmount,
      askingPrice,
      vacancyPct,
      brokerHighlight,
      photoUrls,
    },
    currentGrade: teaserView?.dataGrade || undefined,
    gradeUpItems,
  };
}

