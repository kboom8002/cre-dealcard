import type { InvestmentPosture } from '@/domain/ontology/enums';

export const JAMWON_FIXTURE = {
  fixtureId: 'jamwon',
  posture: 'development' as InvestmentPosture,
  grade: 'C' as const,
  resolution: { L: 'R1', P: 'P2' },
  asset: {
    assetId: 'FX-JW-001',
    addressBand: '서울특별시 서초구 잠원동',
    buildingUse: '근린생활시설',
    assetType: 'development_site',
    landAreaSqm: 382.5,
    roadExclusionSqm: 12.5,
    effectiveLandAreaSqm: 370.0,
    currentFar: 180.0,
    zoning: '제2종일반주거지역',
    maxFar: 250.0,
  },
  financial: {
    priceKrw: 24_200_000_000,
  },
  devPlan: {
    vacateStatus: 'seller_responsible',
    estimatedDevCostKrw: 5_000_000_000,
  },
  expect: {
    grade: 'C' as const,
    exclusionApplied: true,
  },
};
