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
}): DataQualityBadgeInfo {
  let score = 0;
  if (params.hasAddress) score += 20;
  if (params.hasPublicData) score += 20;
  if (params.hasMonthlyRent) score += 15;
  if (params.hasAskingPrice) score += 15;
  if (params.hasFloorLeases) score += 10;
  if (params.hasLoanAmount) score += 8;
  if (params.hasVacancy) score += 7;
  if (params.hasPhotos) score += 5;

  // 부족 항목 안내
  const missingItems: string[] = [];
  if (!params.hasAddress) missingItems.push('주소 입력');
  if (!params.hasPublicData) missingItems.push('공공데이터 연동 (건축물대장/토지이용계획)');
  if (!params.hasMonthlyRent) missingItems.push('월 임대료 총액');
  if (!params.hasAskingPrice) missingItems.push('매각 희망가');
  if (!params.hasVacancy) missingItems.push('공실 현황');
  if (!params.hasPhotos) missingItems.push('건물 사진');
  if (!params.hasLoanAmount) missingItems.push('대출 금액');
  if (!params.hasFloorLeases) missingItems.push('층별 임대차 내역');

  // A등급: 재무 분석 완전 가능 (매각가 + 임대료 → Cap Rate, IRR 산출)
  if (params.hasAddress && params.hasPublicData && params.hasMonthlyRent && params.hasAskingPrice) {
    return { tier: 'verified', label: 'A등급 — 투자 검토 가능', emoji: '🟢', score, missingItems };
  }
  // B등급: 기본 수익률 산출 가능 (임대료 있지만 매각가 없음)
  if (params.hasAddress && params.hasPublicData && params.hasMonthlyRent) {
    return { tier: 'partial', label: 'B등급 — 기본 수익률 산출', emoji: '🟡', score, missingItems };
  }
  // C등급: 건물 정보만 (공공데이터 있지만 임대 데이터 없음)
  if (params.hasAddress && params.hasPublicData) {
    return { tier: 'reference', label: 'C등급 — 건물 정보만', emoji: '🟠', score, missingItems };
  }
  // D등급: 데이터 보충 필요
  return { tier: 'draft', label: 'D등급 — 데이터 보충 필요', emoji: '🔴', score, missingItems };
}
