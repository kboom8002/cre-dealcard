import type { InvestmentPosture } from '@/domain/ontology/enums';

export const MULTIPARCEL_FIXTURE = {
  fixtureId: 'multiparcel',
  posture: 'income' as InvestmentPosture,
  grade: 'A' as const,
  resolution: { L: 'R2', P: 'P2' },
  asset: {
    assetId: 'FX-MP-001',
    addressBand: '서울특별시 강남구 역삼동',
    buildingUse: '업무시설',
    assetType: 'office',
    parcels: [
      { pnu: '1168010100100010001', areaM2: 250, shareRatio: 1.0, officialPricePerM2: 15_000_000 },
      { pnu: '1168010100100010002', areaM2: 150, shareRatio: 1.0, officialPricePerM2: 14_500_000 },
    ],
  },
  financial: {
    priceKrw: 35_000_000_000,
    depositKrw: 1_200_000_000,
    monthlyRentKrw: 110_000_000,
  },
  expect: {
    grade: 'A' as const,
  },
};
