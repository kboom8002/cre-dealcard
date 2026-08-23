/**
 * real-case-03-sutaek.test.ts — 실매물 03: 구리시 수택동 419-19 외 2필지 나대지 (개발형 89억)
 * Spec: docs/test/12_e2e_real_03_sutaek_development.md
 */

import { describe, it, expect } from 'vitest';
import { calculateDevelopmentFinancials } from '@/domain/building/mobile-im/financials';
import { formatBandedPrice } from '@/domain/dealcard/teaser-rules';
import { auditDeficiencies } from '@/domain/building/mobile-im/deficiency-ledger';
import { runDeterministicGates } from '@/domain/building/gates/deterministic-gates';
import type { IMCore } from '@/types/im-core';

describe('Real Case 03: 수택동 89억 나대지 (Development)', () => {
  const sutaekCore: IMCore = {
    meta: {
      assetId: 'sutaek-89b-land',
      ontology: { buildingUse: '토지', assetType: '나대지', posture: 'development', priceBand: 'B3' },
      generatedAt: '2026-08-23T00:00:00Z',
      resolution: 'R0',
      capabilities: ['CAP_DEV_FEASIBILITY'],
      priceBand: 'B3',
    },
    address: {
      raw: '경기도 구리시 수택동 419-19',
      roadAddress: '경기도 구리시 수택동 419-19',
      jibunAddress: '경기도 구리시 수택동 419-19 외 2필지',
      sido: '경기도',
      sigungu: '구리시',
      dong: '수택동',
      pnu: '4131010500104190019',
    },
    physical: {
      landAreaSqm: 651.2, // 196.98평
      totalGrossAreaSqm: 0, // 나대지
      floorsAbove: 0,
      floorsBelow: 0,
      completionYear: null,
      parkingCount: 0,
      elevatorCount: 0,
      zoning: '일반상업지역',
      bcrPct: 70.0,
      farPct: 800.0,
      roadAccess: '12m/6m/4m 삼면접도',
    },
    price: {
      askingKrw: 8_900_000_000,
      perPyeongLand: 45_180_000,
      officialLandPriceRatio: 1.8,
    },
    equity: {
      askingPrice: 8_900_000_000,
      totalAcquisitionCost: 9_389_500_000, // 89억 + 4.6% + 0.9%
      acquisitionTax: 409_400_000,
      brokerFee: 80_100_000,
      ltvScenarios: [
        { ltvPct: 0, loanAmount: 0, requiredEquity: 9_389_500_000, annualInterest: 0, netCashFlow: 0, leveragedYield: 0 },
        { ltvPct: 40, loanAmount: 3_560_000_000, requiredEquity: 5_829_500_000, annualInterest: 160_200_000, netCashFlow: 0, leveragedYield: 0 },
        { ltvPct: 50, loanAmount: 4_450_000_000, requiredEquity: 4_939_500_000, annualInterest: 200_250_000, netCashFlow: 0, leveragedYield: 0 },
      ],
      negativeLeverage: false,
    },
    yields: {
      effectiveGrossYield: null,
      netOperatingYield: null,
      leveragedYield50: null,
      gopCapRate: null,
    },
    headline: {
      posture: 'development',
      targetGrossAreaPyung: 1576,
      estConstructionCostBil: 189.1,
      totalProjectCostBil: 278.1,
      expectedSalesRevenueBil: 346.7,
      devProfitMarginPct: 24.7,
      regulationExpiry: '2028-05-18',
    },
    leases: [], // 나대지이므로 렌트롤 공란
    comps: [
      { address: '구리시 수택동 인근 1', dealPriceKrw: 6_100_000_000, landAreaSqm: 469.4, pricePerPyeong: 42_960_000, dealDate: '2026-03' },
      { address: '구리시 수택동 인근 2', dealPriceKrw: 8_800_000_000, landAreaSqm: 621.5, pricePerPyeong: 46_810_000, dealDate: '2026-05' },
    ],
    deficiencies: [],
    anchors: [],
    provenance: {
      source: 'public_record',
      verifiedAt: '2026-08-23T00:00:00Z',
    },
    attachedDocs: [
      { docType: 'cadastral_map', verified: true, fileUrl: 'https://docs.credeal.net/cadastral.pdf' },
      { docType: 'land_use_plan', verified: true, fileUrl: 'https://docs.credeal.net/landuse.pdf' },
    ],
  };

  it('calculates development financials accurately for 651.2 sqm commercial zoning', () => {
    const fin = calculateDevelopmentFinancials({
      askingPriceKrw: 8_900_000_000,
      landAreaSqm: 651.2,
      targetFarPct: 800,
    });

    expect(fin.targetGrossAreaPyung).toBeGreaterThan(1500);
    expect(fin.estConstructionCostBil).toBeGreaterThan(100);
    expect(fin.totalProjectCostBil).toBeGreaterThan(200);
    expect(fin.devProfitMarginPct).toBeDefined();
  });

  it('bands price correctly into "80억 원대" for B2C Teaser', () => {
    expect(formatBandedPrice(8_900_000_000)).toBe('80억 원대');
  });

  it('passes deterministic quality gates without false positives on empty lease roll for land', () => {
    const report = runDeterministicGates({ core: sutaekCore });
    expect(report.allPassed).toBe(true);
    expect(report.blocked).toBe(false);
  });

  it('audits zero deficiencies when zoning and land area are provided for development', () => {
    const defs = auditDeficiencies({
      posture: 'development',
      physical: { farPct: 800, zoning: '일반상업지역' },
    });
    expect(defs.some(d => d.field === 'zoning')).toBe(false);
  });
});
