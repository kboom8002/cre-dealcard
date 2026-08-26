import type { InvestmentPosture } from '@/domain/ontology/enums';

export const HOTEL_FIXTURE = {
  fixtureId: 'hotel',
  posture: 'operating' as InvestmentPosture,
  grade: 'D' as const,
  resolution: { L: 'R0', P: 'P1' },
  asset: {
    assetId: 'FX-HT-001',
    addressBand: '서울특별시 서대문구 대현동',
    buildingUse: '숙박시설',
    assetType: 'hotel',
    rooms: 65,
  },
  financial: {
    priceKrw: 30_000_000_000,
    annualRevenueKrw: null,
    gopKrw: null,
  },
  expect: {
    grade: 'D' as const,
    blockedFromPublish: true,
  },
};
