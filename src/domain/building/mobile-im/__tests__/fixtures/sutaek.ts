import type { InvestmentPosture } from '@/domain/ontology/enums';

export const SUTAEK_FIXTURE = {
  fixtureId: 'sutaek',
  posture: 'development' as InvestmentPosture,
  grade: 'D' as const,
  resolution: { L: 'R0', P: 'P2' },
  asset: {
    assetId: 'FX-ST-001',
    addressBand: '경기도 구리시 수택동',
    buildingUse: '나대지',
    assetType: 'bare_land',
    landAreaSqm: 419.0,
    zoning: '일반상업지역',
  },
  financial: {
    priceKrw: 8_900_000_000,
  },
  expect: {
    grade: 'D' as const,
    blockedFromPublish: true,
  },
};
