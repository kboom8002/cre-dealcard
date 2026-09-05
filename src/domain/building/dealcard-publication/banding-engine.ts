import { randomUUID } from 'crypto';
import type { MemoObservationSet } from '../memo-intake/types';
import { computeTargetHash } from '../im-core/target-hash';

export interface DealcardRentRollSummary {
  /** 총 호실/구획 수 (예: "총 6개 구획") */
  bandedUnitCount: string;
  /** 공실/운용 상태 (예: "안정 임대 운용 중", "일부 층 공실 (정상화 및 신규 임차 기회)") */
  occupancyStatus: string;
  /** 공실률 밴드 (예: "공실률 약 20% 내외", "공실률 0% (만실 운영)") */
  physicalVacancyBand?: string;
  /** 일반화된 업종 구성 (브랜드명 배제, 예: ["의원/메디컬", "F&B/식음료", "업무시설"]) */
  tenantIndustryMix: string[];
}

export interface DealcardProFormaVacancy {
  /** 공실 정상화 업사이드 기회 보유 여부 */
  hasUpside: boolean;
  /** 현재 단순 수익률 밴드 (예: "1%대 초반") */
  currentCapRateBand: string;
  /** 만실 정상화 목표 수익률 밴드 (예: "2%대 초반") */
  stabilizedCapRateBand: string;
  /** 예상 개선폭 밴드 (예: "+1.1%p 개선 여력") */
  upsideCapRateBand: string;
  /** 가용 면적 개략 (예: "약 80평 규모 가용 공간 (3개층 내외)") */
  vacantSpaceSummary: string;
}

export interface DealcardValueAddSummary {
  /** 대표 밸류애드 전략 */
  primaryStrategy: string;
  /** 핵심 밸류애드 포인트 (최대 3개) */
  strategies: string[];
}

export interface DealcardEnrichmentInput {
  corePackageHash?: string;
  rentRoll?: {
    totalUnits?: number;
    vacancyRatePct?: number;
    units?: Array<{ tenantIndustry?: string; occupancyType?: string; floor?: string }>;
  };
  proFormaOpportunity?: {
    currentCapRatePct: number;
    estimatedFullOccupancyCapRatePct: number;
    upsideCapRatePp: number;
    vacantFloorCount: number;
    vacantAreaPyeong: number;
  };
  actionCards?: Array<{
    cardOrder: number;
    currentStateSummary: string;
    scenarios: Array<{ type: string; title: string }>;
  }>;
  posture?: string;
}

export interface DealcardPackage {
  packageId: string;
  memoRawHash: string;
  corePackageHash?: string;
  bandedLocation: string;
  bandedPrice: string;
  bandedLandArea: string;
  bandedYield?: string;
  rentRollSummary?: DealcardRentRollSummary;
  proFormaVacancy?: DealcardProFormaVacancy;
  valueAddSummary?: DealcardValueAddSummary;
  highlights: string[];
  privacyGuaranteed: boolean;
  packageHash: string;
  createdAt: string;
}


export function bandPrice(krw: number): string {
  const eok = Math.floor(krw / 100000000);
  if (eok >= 100) {
    const low = Math.floor(eok / 10) * 10;
    const high = low + 10;
    return `${low}억~${high}억 원대`;
  }
  return `${eok}억 원대`;
}

export function bandLocation(rawLoc: string): string {
  // Strip any numbers or bunji
  const sanitized = rawLoc.replace(/\d+(?:-\d+)?(?:번지)?/g, '').trim();
  if (sanitized.includes('역') && !sanitized.includes('인근')) {
    return `${sanitized} 인근`;
  }
  return sanitized || '서울 주요 생활권';
}

export function bandLandArea(sqm: number): string {
  const pyeong = Math.round(sqm / 3.30578);
  return `대지 약 ${pyeong}평 (${Math.round(sqm)}㎡)`;
}

export function formatBandedYield(rate: number): string {
  if (rate <= 0) return '0%대';
  const floored = Math.floor(rate);
  const decimal = rate - floored;
  if (decimal < 0.35) {
    return `${floored}%대 초반`;
  } else if (decimal < 0.65) {
    return `${floored}%대 중반`;
  } else {
    return `${floored}%대 후반`;
  }
}

export function bandRentRollSummary(
  rentRoll?: DealcardEnrichmentInput['rentRoll']
): DealcardRentRollSummary | undefined {
  if (!rentRoll) return undefined;
  const count = rentRoll.totalUnits ?? rentRoll.units?.length ?? 0;
  if (count <= 0) return undefined;

  const bandedUnitCount = `총 ${count}개 구획`;
  const vacancyRate = rentRoll.vacancyRatePct ?? 0;

  let occupancyStatus = '안정 임대 운용 중';
  if (vacancyRate >= 20.0) {
    occupancyStatus = '일부 층 공실 (정상화 및 신규 임차 기회)';
  } else if (vacancyRate > 0) {
    occupancyStatus = '우량 테넌트 임대 중 (잔여 공실 일부)';
  }

  const physicalVacancyBand = vacancyRate > 0
    ? `공실률 약 ${Math.round(vacancyRate / 5) * 5}% 내외`
    : '공실률 0% (만실 운영)';

  const genericIndustries = new Set<string>();
  if (rentRoll.units) {
    for (const u of rentRoll.units) {
      if (u.occupancyType === 'vacant') continue;
      const ind = u.tenantIndustry || '';
      if (/병원|의원|한의원|성형|치과|메디컬/.test(ind)) genericIndustries.add('의원/메디컬');
      else if (/식당|카페|커피|베이커리|주점|음식/.test(ind)) genericIndustries.add('식음료/FNB');
      else if (/학원|어학|교육|보컬/.test(ind)) genericIndustries.add('교육/학원');
      else if (/사무실|오피스|본사|스튜디오/.test(ind)) genericIndustries.add('업무시설');
      else if (/판매|소매|리테일|매장/.test(ind)) genericIndustries.add('근생/리테일');
      else if (ind) genericIndustries.add('근린생활시설');
    }
  }

  return {
    bandedUnitCount,
    occupancyStatus,
    physicalVacancyBand,
    tenantIndustryMix: Array.from(genericIndustries).slice(0, 4),
  };
}

export function bandProFormaVacancy(
  opportunity?: DealcardEnrichmentInput['proFormaOpportunity']
): DealcardProFormaVacancy | undefined {
  if (!opportunity || opportunity.upsideCapRatePp <= 0) return undefined;

  const currentCapRateBand = formatBandedYield(opportunity.currentCapRatePct);
  const stabilizedCapRateBand = formatBandedYield(opportunity.estimatedFullOccupancyCapRatePct);
  const upsideCapRateBand = `+${opportunity.upsideCapRatePp.toFixed(1)}%p 개선 여력`;
  const pyeongRounded = Math.round(opportunity.vacantAreaPyeong / 10) * 10;
  const vacantSpaceSummary = pyeongRounded > 0
    ? `약 ${pyeongRounded}평 규모 가용 공간 (${opportunity.vacantFloorCount}개층 내외)`
    : `${opportunity.vacantFloorCount}개층 가용 공간`;

  return {
    hasUpside: true,
    currentCapRateBand,
    stabilizedCapRateBand,
    upsideCapRateBand,
    vacantSpaceSummary,
  };
}

export function bandValueAddSummary(
  actionCards?: DealcardEnrichmentInput['actionCards'],
  posture?: string
): DealcardValueAddSummary | undefined {
  const strategies: string[] = [];

  if (actionCards && actionCards.length > 0) {
    for (const card of actionCards) {
      if (strategies.length >= 3) break;
      const targetScenario = card.scenarios?.find((s) => s.type === 'value_add')
        || card.scenarios?.find((s) => s.type === 'base')
        || card.scenarios?.[0];
      if (targetScenario?.title) {
        strategies.push(targetScenario.title);
      }
    }
  }

  if (strategies.length === 0) {
    if (posture === 'owner_occupied') {
      strategies.push('사옥 단독 명칭 표기(간판 설치권) 확보 가능');
      strategies.push('기업 단독 브랜딩 및 전층 리노베이션 기회');
    } else if (posture) {
      strategies.push('MD 재구성을 통한 우량 테넌트 유치');
      strategies.push('공실 정상화(Lease-up)에 따른 연 순수익률 개선');
    }
  }

  if (strategies.length === 0) return undefined;

  return {
    primaryStrategy: strategies[0] || '자산 가치 제고 (Value-Add)',
    strategies,
  };
}

export function generateDealcardPackage(
  observationSet: MemoObservationSet,
  enrichment?: DealcardEnrichmentInput
): DealcardPackage {
  const priceObs = observationSet.observations.find((o) => o.candidateType === 'asking_price');
  const landObs = observationSet.observations.find((o) => o.candidateType === 'land_area');
  const locObs = observationSet.observations.find((o) => o.candidateType === 'address');
  const yieldObs = observationSet.observations.find((o) => o.candidateType === 'yield');

  const bandedPrice = priceObs && typeof priceObs.candidateValue === 'number'
    ? bandPrice(priceObs.candidateValue)
    : '가격 협의';

  const bandedLocation = locObs && typeof locObs.candidateValue === 'string'
    ? bandLocation(locObs.candidateValue)
    : '수도권 역세권 생활권';

  const bandedLandArea = landObs && typeof landObs.candidateValue === 'number'
    ? bandLandArea(landObs.candidateValue)
    : '면적 유선 문의';

  const bandedYield = yieldObs && typeof yieldObs.candidateValue === 'number'
    ? `예상 수익률 약 ${yieldObs.candidateValue}%`
    : undefined; // 원문에 없으면 임의 날조 원천 차단!

  const rentRollSummary = bandRentRollSummary(enrichment?.rentRoll);
  const proFormaVacancy = bandProFormaVacancy(enrichment?.proFormaOpportunity);
  const valueAddSummary = bandValueAddSummary(enrichment?.actionCards, enrichment?.posture);

  const highlights = [
    `${bandedLocation} 핵심 거점 물건`,
    `${bandedLandArea} 규모의 실용적 근생`,
    `매각 희망가 ${bandedPrice}`,
  ];

  if (proFormaVacancy?.hasUpside) {
    highlights.push(`만실 정상화 시 연 순수익률 ${proFormaVacancy.upsideCapRateBand}`);
  }
  if (valueAddSummary?.primaryStrategy) {
    highlights.push(valueAddSummary.primaryStrategy);
  }

  const packageId = randomUUID();
  const createdAt = new Date().toISOString();

  const packageHash = computeTargetHash({
    body: {
      packageId,
      memoRawHash: observationSet.memoRawHash,
      corePackageHash: enrichment?.corePackageHash ?? null,
      bandedLocation,
      bandedPrice,
      bandedLandArea,
      bandedYield: bandedYield ?? null,
      rentRollSummary: rentRollSummary ?? null,
      proFormaVacancy: proFormaVacancy ?? null,
      valueAddSummary: valueAddSummary ?? null,
      highlights,
      privacyGuaranteed: true,
    },
    releaseTier: 'dealcard_teaser',
    policyVersion: '2026-08-31',
  });

  return {
    packageId,
    memoRawHash: observationSet.memoRawHash,
    corePackageHash: enrichment?.corePackageHash,
    bandedLocation,
    bandedPrice,
    bandedLandArea,
    bandedYield,
    rentRollSummary,
    proFormaVacancy,
    valueAddSummary,
    highlights,
    privacyGuaranteed: true,
    packageHash,
    createdAt,
  };
}

export const bandDealcardPackage = generateDealcardPackage;


