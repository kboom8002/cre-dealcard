import type { InvestmentPosture } from '@/domain/ontology/enums';

export const OWNOCC_FIXTURE = {
  fixtureId: 'ownocc',
  posture: 'owner_occupied' as InvestmentPosture,
  grade: 'B' as const,
  resolution: { L: 'R1', P: 'P2' },
  asset: {
    assetId: 'FX-OO-001',
    addressBand: '서울특별시 성동구 성수동2가',
    buildingUse: '업무시설',
    assetType: 'office_building',
    landAreaSqm: 284.8,
    totalFloorAreaSqm: 785.9,
    buildingCoverageRatio: 57.51,
    floorAreaRatio: 199.75,
  },
  financial: {
    priceKrw: 13_500_000_000,
  },
  occupancyPlan: {
    headcount: 50,
    currentRentPerMonth: 45_000_000,
    vacateStatus: 'immediate',
  },
  expect: {
    grade: 'B' as const,
  },
};
