/**
 * real-case-05-hotel.test.ts — 실매물 05: 서대문구 대현동 에이치에비뉴호텔 (운영형 300억)
 * Spec: docs/test/12_e2e_real_05_hotel_operating.md
 */

import { describe, it, expect } from 'vitest';
import { calculateFinancials } from '@/domain/building/mobile-im/financials';
import { formatBandedPrice, formatBandedYield } from '@/domain/dealcard/teaser-rules';
import { runDeterministicGates } from '@/domain/building/gates/deterministic-gates';
import type { IMCore } from '@/types/im-core';

describe('Real Case 05: 에이치에비뉴호텔 이대점 300억 (Operating)', () => {
  const hotelCore: IMCore = {
    meta: {
      assetId: 'hotel-avenue-300b',
      ontology: { buildingUse: '숙박시설', assetType: '호텔', posture: 'operating', priceBand: 'B4' },
      generatedAt: '2026-08-23T00:00:00Z',
      resolution: 'R1',
      capabilities: ['CAP_DCF', 'CAP_COMPS'],
      priceBand: 'B4',
    },
    address: {
      raw: '서울특별시 서대문구 대현동 10-1',
      roadAddress: '서울특별시 서대문구 신촌로 100',
      jibunAddress: '서울특별시 서대문구 대현동 10-1',
      sido: '서울특별시',
      sigungu: '서대문구',
      dong: '대현동',
      pnu: '1141011200100100001',
    },
    physical: {
      landAreaSqm: 486.2, // 147평
      totalGrossAreaSqm: 3842.6, // 1,162평
      floorsAbove: 12,
      floorsBelow: 2,
      completionYear: 2016,
      parkingCount: 20,
      elevatorCount: 2,
      zoning: '일반상업지역',
      bcrPct: 59.8,
      farPct: 654.1,
      roadAccess: '15m 대로변',
    },
    price: {
      askingKrw: 30_000_000_000,
      perPyeongLand: 204_081_632,
      officialLandPriceRatio: 2.3,
    },
    equity: {
      askingPrice: 30_000_000_000,
      totalAcquisitionCost: 31_650_000_000,
      acquisitionTax: 1_380_000_000,
      brokerFee: 270_000_000,
      ltvScenarios: [
        { ltvPct: 0, loanAmount: 0, requiredEquity: 31_650_000_000, annualInterest: 0, netCashFlow: 0, leveragedYield: 0 },
        { ltvPct: 50, loanAmount: 15_000_000_000, requiredEquity: 16_650_000_000, annualInterest: 675_000_000, netCashFlow: 0, leveragedYield: 0 },
      ],
      negativeLeverage: false,
    },
    yields: {
      effectiveGrossYield: null,
      netOperatingYield: null,
      leveragedYield50: null,
      gopCapRate: 4.25,
    },
    headline: {
      posture: 'operating',
      annualGopBil: 12.8,
      gopMarginPct: 35.0,
      adrKrw: 95000,
      occPct: 78.0,
      revparKrw: 74100,
      gopCapRatePct: 4.25,
    },
    leases: [], // 위탁 직영 운영 자산
    comps: [],
    deficiencies: [],
    anchors: [],
    provenance: {
      source: 'financial_statement',
      verifiedAt: '2026-08-23T00:00:00Z',
    },
    attachedDocs: [
      { docType: 'hotel_gop_audit', verified: true, fileUrl: 'https://docs.credeal.net/hotel_audit.pdf' },
      { docType: 'building_register', verified: true, fileUrl: 'https://docs.credeal.net/bldg_reg.pdf' },
    ],
  };

  it('calculates hotel operating metrics (GOP, RevPAR, GOP Cap Rate)', () => {
    const fin = calculateFinancials({
      posture: 'operating',
      purchasePriceKrw: 30_000_000_000,
      annualRevenueKrw: 3_500_000_000,
      gopMarginPct: 36.5,
    });

    expect(fin.annualGopBil).toBeCloseTo(12.8, 0); // 35억 * 36.5% = 12.775억
    expect(fin.gopCapRatePct).toBeCloseTo(4.26, 1); // 12.775억 / 300억 = 4.258%
    expect(fin.disclaimer).toContain('AI');
  });

  it('bands price correctly into "300억 원대" and yield into "4%대 초반"', () => {
    expect(formatBandedPrice(30_000_000_000)).toBe('300억 원대');
    expect(formatBandedYield(4.25)).toBe('4%대 초반');
  });

  it('passes deterministic quality gates without error on hotel asset without traditional lease rows', () => {
    const report = runDeterministicGates({ core: hotelCore });
    expect(report.allPassed).toBe(true);
    expect(report.blocked).toBe(false);
  });
});
