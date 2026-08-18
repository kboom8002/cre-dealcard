import type { InvestmentPosture } from '@/domain/ontology';

export type DataQualityTier = 'verified' | 'partial' | 'reference' | 'draft';

export interface DataQualityBadgeInfo {
  tier: DataQualityTier;
  label: string;
  emoji: string;
  score: number;
  missingItems: string[];
}

export function computeDataQualityBadge(params: {
  hasAddress: boolean;
  hasPublicData: boolean;
  hasMonthlyRent: boolean;
  hasVacancy: boolean;
  hasPhotos: boolean;
  hasAskingPrice?: boolean;
  hasLoanAmount?: boolean;
  hasFloorLeases?: boolean;
  hasLandArea?: boolean;
  hasZoning?: boolean;
  hasTotalGrossArea?: boolean;
  hasMonthlyRevenue?: boolean;
}, posture: InvestmentPosture = 'income'): DataQualityBadgeInfo {
  let score = 0;
  if (params.hasAddress) score += 20;
  if (params.hasPublicData) score += 20;

  const missingItems: string[] = [];
  if (!params.hasAddress) missingItems.push('주소 입력');
  if (!params.hasPublicData) missingItems.push('공공데이터 연동 (건축물대장/토지이용계획)');

  if (posture === 'development') {
    // 개발형: 대지면적, 용도지역, 공공데이터가 핵심 (월세/공실률/임대차 무관)
    const hasLand = params.hasLandArea || params.hasPublicData;
    const hasZone = params.hasZoning || params.hasPublicData;
    if (hasLand) score += 20;
    if (hasZone) score += 15;
    if (params.hasAskingPrice) score += 15;
    if (params.hasPhotos) score += 10;

    if (!hasLand) missingItems.push('대지면적');
    if (!hasZone) missingItems.push('용도지역');
    if (!params.hasAskingPrice) missingItems.push('매각 희망가 (선택)');
    if (!params.hasPhotos) missingItems.push('현장 사진');

    if (params.hasAddress && params.hasPublicData && hasLand && hasZone && params.hasAskingPrice) {
      return { tier: 'verified', label: 'A등급 — 개발 수지 검토 가능', emoji: '🟢', score, missingItems };
    }
    if (params.hasAddress && params.hasPublicData && hasLand) {
      return { tier: 'partial', label: 'B등급 — 개발 입지 분석', emoji: '🟡', score, missingItems };
    }
  } else if (posture === 'owner_occupied') {
    // 사옥형: 매각가, 건물규모가 핵심 (월세/공실률/임대차 무관)
    if (params.hasAskingPrice) score += 25;
    else missingItems.push('매각 희망가');

    const hasArea = params.hasTotalGrossArea || params.hasPublicData;
    if (hasArea) score += 20;
    else missingItems.push('건축 연면적');

    if (params.hasPhotos) score += 15;
    else missingItems.push('건물 외관 사진');

    if (params.hasAddress && params.hasPublicData && params.hasAskingPrice && hasArea) {
      return { tier: 'verified', label: 'A등급 — 사옥 매입 검토 가능', emoji: '🟢', score, missingItems };
    }
    if (params.hasAddress && params.hasPublicData && (params.hasAskingPrice || hasArea)) {
      return { tier: 'partial', label: 'B등급 — 사옥 적합성 분석', emoji: '🟡', score, missingItems };
    }
  } else if (posture === 'operating') {
    // 운영형: 매출/수익 또는 임대료, 가동률 핵심
    const hasRev = params.hasMonthlyRevenue || params.hasMonthlyRent;
    if (hasRev) score += 20;
    else missingItems.push('월 매출 / 운영 수입');

    if (params.hasAskingPrice) score += 20;
    else missingItems.push('매각 희망가');

    if (params.hasVacancy) score += 10;
    if (params.hasPhotos) score += 10;

    if (params.hasAddress && params.hasPublicData && hasRev && params.hasAskingPrice) {
      return { tier: 'verified', label: 'A등급 — 운영 수익 검토 가능', emoji: '🟢', score, missingItems };
    }
    if (params.hasAddress && params.hasPublicData && (hasRev || params.hasAskingPrice)) {
      return { tier: 'partial', label: 'B등급 — 운영 현황 분석', emoji: '🟡', score, missingItems };
    }
  } else if (posture === 'trading') {
    // 단기매매형: 매각가, 비교사례(시장비교)가 핵심
    if (params.hasAskingPrice) score += 25;
    else missingItems.push('매각 희망가');

    if (params.hasPublicData) score += 15;
    else missingItems.push('공공데이터 (비교사례용)');

    if (params.hasPhotos) score += 10;
    else missingItems.push('건물 사진');

    if (params.hasMonthlyRent) score += 5;

    if (params.hasAddress && params.hasPublicData && params.hasAskingPrice) {
      return { tier: 'verified', label: 'A등급 — 비교사례 분석 가능', emoji: '🟢', score, missingItems };
    }
    if (params.hasAddress && params.hasPublicData) {
      return { tier: 'partial', label: 'B등급 — 시장 포지셔닝 분석', emoji: '🟡', score, missingItems };
    }
  } else {
    // income: 소득형 (기존 재무 중심)
    if (params.hasMonthlyRent) score += 15;
    else missingItems.push('월 임대료 총액');

    if (params.hasAskingPrice) score += 15;
    else missingItems.push('매각 희망가');

    if (params.hasFloorLeases) score += 10;
    else missingItems.push('층별 임대차 내역');

    if (params.hasLoanAmount) score += 8;
    else missingItems.push('대출 금액');

    if (!params.hasVacancy) missingItems.push('공실 현황');
    if (!params.hasPhotos) missingItems.push('건물 사진');

    if (params.hasAddress && params.hasPublicData && params.hasMonthlyRent && params.hasAskingPrice) {
      return { tier: 'verified', label: 'A등급 — 투자 검토 가능', emoji: '🟢', score, missingItems };
    }
    if (params.hasAddress && params.hasPublicData && (params.hasMonthlyRent || params.hasAskingPrice)) {
      return { tier: 'partial', label: 'B등급 — 기본 수익률 산출', emoji: '🟡', score, missingItems };
    }
  }

  // C등급: 건물 정보만 (주소 또는 공공데이터 있음)
  if (params.hasAddress || params.hasPublicData) {
    return { tier: 'reference', label: 'C등급 — 건물 정보만', emoji: '🟠', score, missingItems };
  }
  // D등급: 데이터 보충 필요
  return { tier: 'draft', label: 'C등급 — 데이터 보강 권장', emoji: '⚠️', score, missingItems };
}

// ── Basic/Pro tier 게이트 ──

export type ImTier = 'basic' | 'pro';
export type DataGrade = 'A' | 'B' | 'C';

/** 해당 등급에서 사용 가능한 최소 tier */
export function minimumTierForGrade(grade: DataGrade): ImTier {
  return 'basic';
}

/** Pro IM 생성 가능 여부 (A등급만) */
export function isProEligible(grade: DataGrade): boolean {
  return grade === 'A';
}

export function hasMinimumBasicData(
  params: {
    hasAskingPrice?: boolean;
    hasMonthlyRent?: boolean;
    hasAddress?: boolean;
    hasPublicData?: boolean;
    hasMonthlyRevenue?: boolean;
  },
  posture: InvestmentPosture = 'income'
): boolean {
  if (posture === 'development') {
    // 개발형은 주소만 있으면 Basic 생성 가능 (매각가 미정 허용)
    return !!params.hasAddress || !!params.hasPublicData || !!params.hasAskingPrice;
  }
  if (posture === 'owner_occupied') {
    // 사옥형은 매각가 또는 주소가 있으면 가능
    return !!params.hasAskingPrice || !!params.hasAddress;
  }
  if (posture === 'operating') {
    return !!params.hasAskingPrice || !!params.hasMonthlyRent || !!params.hasMonthlyRevenue;
  }
  // income, trading: 매각가, 월세, 또는 주소가 있으면 Basic 허용
  return !!params.hasAskingPrice || !!params.hasMonthlyRent || !!params.hasAddress || !!params.hasPublicData;
}

/** DataQualityTier → DataGrade 변환 (3-tier) */
export function tierToGrade(tier: DataQualityTier): DataGrade {
  switch (tier) {
    case 'verified': return 'A';
    case 'partial': return 'B';
    case 'reference': return 'C';
    case 'draft': return 'C';  // draft도 C등급으로 통합
  }
}

export function getDataFreshnessWarning(dataFetchedAt?: string): string | null {
  if (!dataFetchedAt) return '⚠️ 데이터 수집 일시 미확인';
  const daysSince = (Date.now() - new Date(dataFetchedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > 30) return '🔴 데이터 갱신 필요 (30일 초과)';
  if (daysSince > 7) return '🟡 데이터 갱신 권장 (7일 초과)';
  return null;
}

