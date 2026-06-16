export type DataQualityTier = 'verified' | 'partial' | 'reference' | 'draft';

export interface DataQualityBadgeInfo {
  tier: DataQualityTier;
  label: string;
  emoji: string;
  score: number;
}

export function computeDataQualityBadge(params: {
  hasAddress: boolean;
  hasPublicData: boolean;
  hasMonthlyRent: boolean;
  hasVacancy: boolean;
  hasPhotos: boolean;
}): DataQualityBadgeInfo {
  let score = 0;
  if (params.hasAddress) score += 30;
  if (params.hasPublicData) score += 30;
  if (params.hasMonthlyRent) score += 20;
  if (params.hasVacancy) score += 10;
  if (params.hasPhotos) score += 10;

  if (params.hasAddress && params.hasPublicData && params.hasMonthlyRent) {
    return { tier: 'verified', label: '데이터 검증 완료', emoji: '🟢', score };
  }
  if (params.hasAddress && params.hasPublicData) {
    return { tier: 'partial', label: '공공데이터 연동', emoji: '🟡', score };
  }
  if (params.hasAddress || params.hasMonthlyRent) {
    return { tier: 'reference', label: '부분 확인 (참고용)', emoji: '🟠', score };
  }
  return { tier: 'draft', label: '초안 (데이터 부족)', emoji: '🔴', score };
}
