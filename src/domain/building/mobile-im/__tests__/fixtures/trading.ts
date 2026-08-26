import type { InvestmentPosture } from '@/domain/ontology/enums';

export const TRADING_FIXTURE = {
  fixtureId: 'trading',
  posture: 'trading' as InvestmentPosture,
  grade: 'C' as const,
  resolution: { L: 'R1', P: 'P2' },
  asset: {
    assetId: 'FX-TR-001',
    addressBand: '서울특별시 강남구 신사동',
    buildingUse: '근린생활시설',
    assetType: 'retail',
    landAreaSqm: 210.0,
    totalFloorAreaSqm: 520.0,
  },
  financial: {
    priceKrw: 15_000_000_000,
    prevTradePriceKrw: 8_250_000_000,
    holdingMonths: 18,
  },
  expect: {
    grade: 'C' as const,
    blockedFromPublish: true, // L축 R1으로 등급 C -> trading 포스처 발행 차단
  },
};
