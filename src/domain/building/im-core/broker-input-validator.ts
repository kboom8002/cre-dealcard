/**
 * @file broker-input-validator.ts
 * @description 중개인 원본 입력치와 공학적/법적 SSoT 계산치 간 정합성 검증 및 이상치(Anomaly) 자동 감지 엔진
 *
 * 주요 검증 항목:
 * 1. 토지 평당가 정합성: 중개인 수기 기재 토지평당가 vs (매매희망가 / 대지평수) 교차 검증 (오차 > 5% 시 경고)
 * 2. 연면적 평당가 정합성: 매매희망가 / 연면적평수
 * 3. 렌트롤 합산 정합성: 층별 보증금/월세 합산액 vs 총 보증금/월 임대료 일치 여부
 * 4. 고공실률(≥20%) 정상화 시나리오: 단순 Cap Rate 대비 만실 정상화(Pro-forma) Cap Rate 자동 산출
 * 5. 비표준 미디어 포맷 감지: .wdp 등 웹/PPTX 비호환 포맷 감지 및 대체 권고
 */

import { randomUUID } from 'crypto';
import type { ClaimRegistry } from './claim-registry';
import type { Claim } from './claim';

export interface BrokerInputDiscrepancy {
  code: 'LAND_PRICE_PYEONG_DISCREPANCY' | 'GFA_PRICE_PYEONG_DISCREPANCY' | 'RENTROLL_SUM_MISMATCH' | 'HIGH_VACANCY_PRO_FORMA' | 'UNSUPPORTED_MEDIA_FORMAT';
  severity: 'critical' | 'warning' | 'info';
  field: string;
  statedValue: unknown;
  calculatedValue: unknown;
  discrepancyPct?: number;
  message: string;
  recommendation: string;
}

export interface BrokerInputValidationResult {
  isValid: boolean;
  hasCritical: boolean;
  discrepancies: BrokerInputDiscrepancy[];
  proFormaOpportunity?: {
    currentCapRatePct: number;
    estimatedFullOccupancyCapRatePct: number;
    upsideCapRatePp: number;
    vacantFloorCount: number;
    vacantAreaPyeong: number;
    narrative: string;
  };
  proFormaClaims?: Claim[];
}

export interface BrokerPropertyInput {
  askingPriceKrw: number;
  landAreaM2: number;
  grossFloorAreaM2: number;
  statedLandPricePerPyeongKrw?: number;
  statedGfaPricePerPyeongKrw?: number;
  statedDepositKrw?: number;
  statedMonthlyRentKrw?: number;
  rentRoll?: {
    totalUnits?: number;
    units: Array<{
      floor: string;
      tenant: string;
      deposit?: number;
      rent?: number;
      areaPyeong?: number;
      isVacant?: boolean;
    }>;
  };
  photoUrls?: string[];
}

export function validateBrokerInput(
  input: BrokerPropertyInput,
  options?: { registry?: ClaimRegistry; asOf?: string }
): BrokerInputValidationResult {
  const discrepancies: BrokerInputDiscrepancy[] = [];
  const landAreaPyeong = input.landAreaM2 * 0.3025;
  const gfaAreaPyeong = input.grossFloorAreaM2 * 0.3025;

  // 1. 토지 평당가 검증
  if (input.statedLandPricePerPyeongKrw && landAreaPyeong > 0) {
    const calcLandPricePyeong = Math.round(input.askingPriceKrw / landAreaPyeong);
    const diff = Math.abs(input.statedLandPricePerPyeongKrw - calcLandPricePyeong);
    const diffPct = (diff / calcLandPricePyeong) * 100;

    if (diffPct > 5.0) {
      const isCritical = diffPct > 20.0;
      discrepancies.push({
        code: 'LAND_PRICE_PYEONG_DISCREPANCY',
        severity: isCritical ? 'critical' : 'warning',
        field: 'landPricePerPyeong',
        statedValue: input.statedLandPricePerPyeongKrw,
        calculatedValue: calcLandPricePyeong,
        discrepancyPct: Math.round(diffPct * 10) / 10,
        message: `중개인 기재 토지평당가(${(input.statedLandPricePerPyeongKrw / 100000000).toFixed(2)}억/평)와 실제 계산치(${(calcLandPricePyeong / 100000000).toFixed(2)}억/평) 간 ${diffPct.toFixed(1)}% 불일치 감지`,
        recommendation: `대지면적(${(landAreaPyeong).toFixed(1)}평) 기준 실제 토지 평당가는 ${(calcLandPricePyeong / 100000000).toFixed(2)}억 원/평입니다. (연면적 평당가와의 혼동 여부 점검 권장)`,
      });
    }
  }

  // 2. 렌트롤 합산 정합성 검증
  if (input.rentRoll?.units && input.rentRoll.units.length > 0) {
    let sumDeposit = 0;
    let sumRent = 0;
    let vacantCount = 0;
    let vacantAreaPyeong = 0;

    for (const u of input.rentRoll.units) {
      sumDeposit += u.deposit || 0;
      sumRent += u.rent || 0;
      if (u.isVacant || u.tenant.includes('공실')) {
        vacantCount++;
        vacantAreaPyeong += u.areaPyeong || 0;
      }
    }

    if (input.statedDepositKrw != null && Math.abs(input.statedDepositKrw - sumDeposit) > 100000) {
      discrepancies.push({
        code: 'RENTROLL_SUM_MISMATCH',
        severity: 'warning',
        field: 'deposit',
        statedValue: input.statedDepositKrw,
        calculatedValue: sumDeposit,
        message: `총 보증금 기재액(${input.statedDepositKrw.toLocaleString()}원)과 렌트롤 개별 합산액(${sumDeposit.toLocaleString()}원) 불일치`,
        recommendation: '렌트롤 호실별 보증금 합계로 총 보증금을 자동 정규화합니다.',
      });
    }

    if (input.statedMonthlyRentKrw != null && Math.abs(input.statedMonthlyRentKrw - sumRent) > 50000) {
      discrepancies.push({
        code: 'RENTROLL_SUM_MISMATCH',
        severity: 'warning',
        field: 'monthlyRent',
        statedValue: input.statedMonthlyRentKrw,
        calculatedValue: sumRent,
        message: `월 총임대료 기재액(${input.statedMonthlyRentKrw.toLocaleString()}원)과 렌트롤 개별 합산액(${sumRent.toLocaleString()}원) 불일치`,
        recommendation: '렌트롤 호실별 월차임 합계로 월 총임대료를 자동 정규화합니다.',
      });
    }

    // 3. 고공실률(≥20%) 정상화 시나리오 계산
    const totalUnits = input.rentRoll.totalUnits || input.rentRoll.units.length;
    const vacancyRate = totalUnits > 0 ? (vacantCount / totalUnits) * 100 : 0;

    if (vacancyRate >= 20.0 && input.askingPriceKrw > 0) {
      const currentAnnualRent = (input.statedMonthlyRentKrw || sumRent) * 12;
      const currentCapRate = (currentAnnualRent / input.askingPriceKrw) * 100;

      // 만실 시 예상 임대료: 공실 평당 인근 시세(약 8~9만원/평) 적용 또는 기존 층 평균 임대료 역산
      const avgRentPerPyeong = gfaAreaPyeong > 0 && sumRent > 0 && (gfaAreaPyeong - vacantAreaPyeong) > 0
        ? sumRent / (gfaAreaPyeong - vacantAreaPyeong)
        : 85000;
      const additionalMonthlyRent = vacantAreaPyeong > 0
        ? Math.round(vacantAreaPyeong * avgRentPerPyeong)
        : Math.round(sumRent * (vacantCount / (totalUnits - vacantCount || 1)));

      const proFormaMonthlyRent = (input.statedMonthlyRentKrw || sumRent) + additionalMonthlyRent;
      const proFormaAnnualRent = proFormaMonthlyRent * 12;
      const proFormaCapRate = (proFormaAnnualRent / input.askingPriceKrw) * 100;

      discrepancies.push({
        code: 'HIGH_VACANCY_PRO_FORMA',
        severity: 'info',
        field: 'vacancySensitivity',
        statedValue: `${vacantCount}개층 공실 (${vacancyRate.toFixed(1)}%)`,
        calculatedValue: `만실 시 예상 Cap Rate: ${proFormaCapRate.toFixed(2)}%`,
        message: `현재 공실률(${vacancyRate.toFixed(1)}%)이 높아 단순 Cap Rate(${currentCapRate.toFixed(2)}%)가 일시적 저평가 상태입니다.`,
        recommendation: `공실 ${vacantCount}개층 정상화 시 연 순수익률이 ${(proFormaCapRate - currentCapRate).toFixed(2)}%p 개선된 ${proFormaCapRate.toFixed(2)}%로 추정됩니다. 만실 정상화(Pro-forma) 시나리오를 추가 제공합니다.`,
      });

      const proFormaOpportunity = {
        currentCapRatePct: Math.round(currentCapRate * 100) / 100,
        estimatedFullOccupancyCapRatePct: Math.round(proFormaCapRate * 100) / 100,
        upsideCapRatePp: Math.round((proFormaCapRate - currentCapRate) * 100) / 100,
        vacantFloorCount: vacantCount,
        vacantAreaPyeong: Math.round(vacantAreaPyeong * 10) / 10,
        narrative: `현재 ${vacantCount}개층 공실로 인해 연 순수익률이 ${currentCapRate.toFixed(2)}%이나, 주변 오피스·상가 시세로 임대 정상화 완료 시 연 순수익률(Cap Rate)은 ${proFormaCapRate.toFixed(2)}% 수준으로 대폭 개선되는 밸류애드 기회입니다.`,
      };

      let proFormaClaims: Claim[] | undefined = undefined;
      if (options?.registry) {
        proFormaClaims = registerProFormaClaims(
          options.registry,
          {
            ...proFormaOpportunity,
            additionalMonthlyRentKrw: additionalMonthlyRent,
            proFormaAnnualNoiKrw: proFormaAnnualRent,
          },
          options.asOf
        );
      }

      return {
        isValid: discrepancies.filter(d => d.severity === 'critical').length === 0,
        hasCritical: discrepancies.some(d => d.severity === 'critical'),
        discrepancies,
        proFormaOpportunity,
        proFormaClaims,
      };
    }
  }


  // 4. 비표준 미디어 포맷 감지
  if (input.photoUrls) {
    for (const url of input.photoUrls) {
      if (url.toLowerCase().endsWith('.wdp')) {
        discrepancies.push({
          code: 'UNSUPPORTED_MEDIA_FORMAT',
          severity: 'warning',
          field: 'photoUrls',
          statedValue: url,
          calculatedValue: 'JPG/PNG',
          message: `비표준 이미지 포맷(.wdp / HD Photo) 감지: ${url}`,
          recommendation: '웹 뷰어 및 PPTX 렌더링 무결성을 위해 고해상도 JPG/PNG 포맷으로 자동 변환하거나 대체합니다.',
        });
      }
    }
  }

  return {
    isValid: discrepancies.filter(d => d.severity === 'critical').length === 0,
    hasCritical: discrepancies.some(d => d.severity === 'critical'),
    discrepancies,
  };
}

export interface ProFormaClaimRegistrationInput {
  currentCapRatePct: number;
  estimatedFullOccupancyCapRatePct: number;
  upsideCapRatePp: number;
  vacantFloorCount: number;
  vacantAreaPyeong: number;
  additionalMonthlyRentKrw?: number;
  proFormaAnnualNoiKrw?: number;
  narrative?: string;
  askingPriceClaimId?: string;
  currentCapRateClaimId?: string;
}

/**
 * 고공실률 정상화(Pro-forma) 지표를 ClaimRegistry에 1급 객체로 등록합니다.
 */
export function registerProFormaClaims(
  registry: ClaimRegistry,
  input: ProFormaClaimRegistrationInput,
  asOf: string = new Date().toISOString().slice(0, 10)
): Claim[] {
  const registered: Claim[] = [];
  const baseOpts = {
    provenance: 'derived' as const,
    asOf,
    status: 'reconciled' as const,
  };

  // 1. pro_forma_cap_rate
  const { claim: capRateClaim } = registry.register({
    ...baseOpts,
    subject: 'pro_forma_cap_rate',
    value: input.estimatedFullOccupancyCapRatePct,
    unit: '%',
    evidence: [{ sourceId: 'derived', asOf, excerpt: input.narrative || '공실 정상화 예상 연 순수익률' }],
    calculation: {
      id: randomUUID(),
      formula: 'pro_forma_annual_noi / asking_price * 100',
      formulaVersion: 'v1.0.0',
      inputs: input.askingPriceClaimId ? { asking_price: input.askingPriceClaimId } : {},
      result: input.estimatedFullOccupancyCapRatePct,
      basis: 'NOI',
    },
  });
  registered.push(capRateClaim);

  // 2. pro_forma_upside_cap_rate_pp
  const { claim: upsideClaim } = registry.register({
    ...baseOpts,
    subject: 'pro_forma_upside_cap_rate_pp',
    value: input.upsideCapRatePp,
    unit: '%p',
    evidence: [{ sourceId: 'derived', asOf, excerpt: `공실 해소 시 연 순수익률 +${input.upsideCapRatePp.toFixed(2)}%p 개선` }],
    calculation: {
      id: randomUUID(),
      formula: 'pro_forma_cap_rate - cap_rate_base',
      formulaVersion: 'v1.0.0',
      inputs: input.currentCapRateClaimId ? { cap_rate_base: input.currentCapRateClaimId } : {},
      result: input.upsideCapRatePp,
    },
  });
  registered.push(upsideClaim);

  // 3. pro_forma_vacant_floors
  const { claim: floorsClaim } = registry.register({
    ...baseOpts,
    subject: 'pro_forma_vacant_floors',
    value: input.vacantFloorCount,
    unit: '개층',
    evidence: [{ sourceId: 'derived', asOf, excerpt: `공실 ${input.vacantFloorCount}개층` }],
  });
  registered.push(floorsClaim);

  // 4. pro_forma_vacant_area_pyeong
  const { claim: areaClaim } = registry.register({
    ...baseOpts,
    subject: 'pro_forma_vacant_area_pyeong',
    value: input.vacantAreaPyeong,
    unit: '평',
    evidence: [{ sourceId: 'derived', asOf, excerpt: `공실 면적 ${input.vacantAreaPyeong}평` }],
  });
  registered.push(areaClaim);

  if (input.proFormaAnnualNoiKrw) {
    const { claim: noiClaim } = registry.register({
      ...baseOpts,
      subject: 'pro_forma_annual_noi',
      value: input.proFormaAnnualNoiKrw,
      unit: '원',
      evidence: [{ sourceId: 'derived', asOf, excerpt: '공실 정상화 시 연간 순영업소득(NOI)' }],
      calculation: {
        id: randomUUID(),
        formula: 'pro_forma_annual_gross - opex',
        formulaVersion: 'v1.0.0',
        inputs: {},
        result: input.proFormaAnnualNoiKrw,
        basis: 'NOI',
      },
    });
    registered.push(noiClaim);
  }

  return registered;
}

export interface BuildingSpecsInput {
  archAreaM2?: number;
  completionDate?: string;
  parkingCount?: number;
  parking?: string;
  elevatorCount?: number;
  keyFacts3Tier?: {
    tier1_subject?: Array<[string, string]>;
    tier2_land?: Array<[string, string]>;
    tier3_building?: Array<[string, string]>;
  };
  [key: string]: any;
}

export interface BuildingSpecsValidationResult {
  isValid: boolean;
  missingSpecs: string[];
  missingTiers: string[];
  missingLabels: string[];
  errors: string[];
}

/**
 * 4대 필수 건축 제원(건축면적, 사용승인일, 주차대수, 승강기) 및 3단 Key Facts 계층·라벨 유효성 검증 엔진
 */
export function validateBuildingSpecs(input: BuildingSpecsInput): BuildingSpecsValidationResult {
  const missingSpecs: string[] = [];
  const missingTiers: string[] = [];
  const missingLabels: string[] = [];
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return {
      isValid: false,
      missingSpecs: ['archAreaM2', 'completionDate', 'parkingCount', 'elevatorCount'],
      missingTiers: ['tier1_subject', 'tier2_land', 'tier3_building'],
      missingLabels: [],
      errors: ['입력 데이터 객체가 유효하지 않습니다.'],
    };
  }

  // 1. 4대 필수 건축 제원 검증
  if (input.archAreaM2 == null || typeof input.archAreaM2 !== 'number' || input.archAreaM2 <= 0) {
    missingSpecs.push('archAreaM2');
    errors.push('건축면적(archAreaM2)이 누락되었거나 양수 숫자가 아닙니다.');
  }

  if (!input.completionDate || typeof input.completionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.completionDate)) {
    missingSpecs.push('completionDate');
    errors.push('사용승인일(completionDate)이 누락되었거나 YYYY-MM-DD 형식이 아닙니다.');
  }

  if (input.parkingCount == null || typeof input.parkingCount !== 'number' || input.parkingCount < 0) {
    missingSpecs.push('parkingCount');
    errors.push('주차대수(parkingCount)가 누락되었거나 음수입니다.');
  }

  if (input.elevatorCount == null || typeof input.elevatorCount !== 'number' || input.elevatorCount < 0) {
    missingSpecs.push('elevatorCount');
    errors.push('승강기(elevatorCount)가 누락되었거나 음수입니다.');
  }

  // 2. 3단 Key Facts 계층 및 필수 라벨 검증
  const keyFacts = input.keyFacts3Tier;
  if (!keyFacts || typeof keyFacts !== 'object') {
    missingTiers.push('tier1_subject', 'tier2_land', 'tier3_building');
    errors.push('3단 Key Facts(keyFacts3Tier) 계층이 누락되었습니다.');
  } else {
    // Tier 1 (대상지)
    if (!Array.isArray(keyFacts.tier1_subject) || keyFacts.tier1_subject.length === 0) {
      missingTiers.push('tier1_subject');
      errors.push('Key Facts Tier 1(대상지 계층, tier1_subject)이 누락되었거나 비어 있습니다.');
    } else {
      const t1Labels = keyFacts.tier1_subject.map((r: any) => (Array.isArray(r) ? r[0] : ''));
      if (!t1Labels.includes('소재지')) missingLabels.push('Tier 1: 소재지');
      if (!t1Labels.includes('매각희망가')) missingLabels.push('Tier 1: 매각희망가');
      if (!t1Labels.some((l: string) => l.includes('Cap Rate') || l.includes('수익률'))) {
        missingLabels.push('Tier 1: Cap Rate/수익률');
      }
    }

    // Tier 2 (토지)
    if (!Array.isArray(keyFacts.tier2_land) || keyFacts.tier2_land.length === 0) {
      missingTiers.push('tier2_land');
      errors.push('Key Facts Tier 2(토지 계층, tier2_land)이 누락되었거나 비어 있습니다.');
    } else {
      const t2Labels = keyFacts.tier2_land.map((r: any) => (Array.isArray(r) ? r[0] : ''));
      if (!t2Labels.includes('대지면적')) missingLabels.push('Tier 2: 대지면적');
      if (!t2Labels.includes('용도지역')) missingLabels.push('Tier 2: 용도지역');
    }

    // Tier 3 (건물)
    if (!Array.isArray(keyFacts.tier3_building) || keyFacts.tier3_building.length === 0) {
      missingTiers.push('tier3_building');
      errors.push('Key Facts Tier 3(건물 계층, tier3_building)이 누락되었거나 비어 있습니다.');
    } else {
      const t3Labels = keyFacts.tier3_building.map((r: any) => (Array.isArray(r) ? r[0] : ''));
      if (!t3Labels.includes('연면적')) missingLabels.push('Tier 3: 연면적');
      if (!t3Labels.includes('건축면적')) missingLabels.push('Tier 3: 건축면적');
      if (!t3Labels.includes('사용승인일')) missingLabels.push('Tier 3: 사용승인일');
      if (!t3Labels.some((l: string) => l.includes('주차'))) missingLabels.push('Tier 3: 주차');
      if (!t3Labels.some((l: string) => l.includes('승강기'))) missingLabels.push('Tier 3: 승강기');
    }
  }

  if (missingLabels.length > 0) {
    errors.push(`3단 Key Facts 내 필수 라벨 누락: ${missingLabels.join(', ')}`);
  }

  return {
    isValid: missingSpecs.length === 0 && missingTiers.length === 0 && missingLabels.length === 0,
    missingSpecs,
    missingTiers,
    missingLabels,
    errors,
  };
}
