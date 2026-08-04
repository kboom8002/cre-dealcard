export function suggestPreciseMode(deal: {
  leaseUnitCount: number;
  assetType: string;
  purpose?: string;
}): boolean {
  // If there are many lease units, precise mode is recommended
  if (deal.leaseUnitCount >= 4 && deal.purpose !== 'development') {
    return true;
  }
  
  // Certain asset types typically require precise lease analysis
  const complexAssetTypes = ['retail', 'mixed', 'commercial', 'shopping_center'];
  if (complexAssetTypes.includes(deal.assetType.toLowerCase())) {
    return true;
  }
  
  // Specific buyer purposes like value-add may require detailed lease info
  if (deal.purpose && deal.purpose.toLowerCase().includes('value-add')) {
    return true;
  }
  
  return false;
}

/** AUTH-04.3: Precise mode 필요성 판단 (v0.4 강화) */
export function suggestPreciseModeV2(params: {
  posture?: string;
  unitCount: number;
  vacatePlanned?: boolean;
  currentGrade?: string;
}): { needed: boolean; reason: string } | null {
  // operating → 렌트롤 불필요
  if (params.posture === 'operating') {
    return null;
  }
  // development + 명도 계획 → 불필요
  if (params.posture === 'development' && params.vacatePlanned) {
    return null;
  }
  // 호실 < 4 → 표준으로 충분
  if (params.unitCount < 4) {
    return null;
  }
  // 그 외: precise 권장
  return {
    needed: true,
    reason: `호실 ${params.unitCount}개 — Precise 모드 시 WALE·만기 분석 활성화`,
  };
}
