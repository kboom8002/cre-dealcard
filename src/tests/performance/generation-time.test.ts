/**
 * generation-time.test.ts — PF-LIMIT-01 성능 한계선 및 처리 속도 게이트
 * Spec: docs/imup/01_spec_new/TEST_PLAN.md (§2. 불변조건 15: 섹션 증설 전 생성 시간 측정)
 */

import { describe, it, expect } from 'vitest';
import { calculateFinancials } from '@/domain/building/mobile-im/financials';
import { runDeterministicGates } from '@/domain/building/gates/deterministic-gates';
import { evaluateFreshness } from '@/domain/postpublish/freshness-engine';
import { evaluateSignals } from '@/domain/postpublish/signal-engine';
import { calculate7AxisReadiness } from '@/domain/workspace/deal-readiness-7axis';
import type { IMCore } from '@/types/im-core';

describe('PF-LIMIT-01: Processing Time Limit Gate', () => {
  const dummyCore: IMCore = {
    meta: {
      assetId: 'perf-test',
      ontology: { buildingUse: '근린생활시설', assetType: '상가건물', posture: 'income', priceBand: 'B3' },
      generatedAt: '2026-08-23T00:00:00Z',
      resolution: 'R2',
      capabilities: ['CAP_DCF'],
      priceBand: 'B3',
    },
    address: {
      raw: '서울특별시 강남구 역삼동 100',
      roadAddress: '서울특별시 강남구 테헤란로 100',
      jibunAddress: '서울특별시 강남구 역삼동 100',
      sido: '서울특별시',
      sigungu: '강남구',
      dong: '역삼동',
      pnu: '1168010100101000000',
    },
    physical: {
      landAreaSqm: 500,
      totalGrossAreaSqm: 1000,
      floorsAbove: 5,
      floorsBelow: 1,
      completionYear: 2020,
      parkingCount: 10,
      elevatorCount: 1,
      zoning: '일반상업지역',
      bcrPct: 60,
      farPct: 200,
      roadAccess: '12m 도로',
    },
    price: { askingKrw: 10_000_000_000, perPyeongLand: 66_000_000, officialLandPriceRatio: 2.0 },
    equity: {
      askingPrice: 10_000_000_000,
      totalAcquisitionCost: 10_550_000_000,
      acquisitionTax: 460_000_000,
      brokerFee: 90_000_000,
      ltvScenarios: [{ ltvPct: 50, loanAmount: 5_000_000_000, requiredEquity: 5_550_000_000, annualInterest: 225_000_000, netCashFlow: 135_000_000, leveragedYield: 2.43 }],
      negativeLeverage: false,
    },
    yields: { effectiveGrossYield: 4.0, netOperatingYield: 3.6, leveragedYield50: 2.43, gopCapRate: null },
    headline: { posture: 'income', targetGrossAreaPyung: null, estConstructionCostBil: null, totalProjectCostBil: null, expectedSalesRevenueBil: null, devProfitMarginPct: null, regulationExpiry: null },
    leases: [
      { unitLabel: '101', leaseAreaSqm: 500, depositKrw: 200_000_000, monthlyRentKrw: 15_000_000, legalBasis: 'commercial', leaseState: '임대중' },
      { unitLabel: '201', leaseAreaSqm: 500, depositKrw: 200_000_000, monthlyRentKrw: 15_000_000, legalBasis: 'commercial', leaseState: '임대중' },
    ],
    comps: [],
    deficiencies: [],
    anchors: [],
    provenance: { source: 'public_record', verifiedAt: '2026-08-23T00:00:00Z' },
    attachedDocs: [],
  };

  it('completes 100 consecutive full financial & gate evaluations in under 1 second', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      calculateFinancials({
        posture: 'income',
        purchasePriceKrw: 10_000_000_000,
        monthlyRentKrw: 30_000_000,
      });
      runDeterministicGates({ core: dummyCore });
      evaluateFreshness({ registryDays: 35, landUsePlanDays: 45 });
      evaluateSignals({ totalViews: 25, distinctDevices: 3, publishedDays: 4 });
      calculate7AxisReadiness({
        hasBuildingRegister: true,
        hasRegistry: true,
        hasLandUsePlan: true,
        hasRentRoll: true,
        hasPhotos: true,
        hasAskingPrice: true,
        isPriceReasonable: true,
        hasExclusiveContract: true,
        isSellerDirectConfirmed: true,
        hasNoEncumbrances: true,
        hasVacatePlan: true,
        hasNoViolations: true,
        hasNoZoningRestrictions: true,
        hasFeasibleFinancing: true,
        hasDeskAppraisal: true,
        buyerInquiryCount: 7,
      });
    }
    const elapsedMs = performance.now() - start;
    expect(elapsedMs).toBeLessThan(1000); // 100회 풀 파이프라인이 1초(1000ms) 이내 완료
  });

  it('verifies single deal evaluation latency is below 10ms', () => {
    const start = performance.now();
    calculateFinancials({
      posture: 'development',
      purchasePriceKrw: 8_900_000_000,
      platAreaSqm: 651.2,
      targetGrossAreaPyeong: 1576,
    });
    runDeterministicGates({ core: dummyCore });
    const elapsedMs = performance.now() - start;
    expect(elapsedMs).toBeLessThan(10);
  });
});
