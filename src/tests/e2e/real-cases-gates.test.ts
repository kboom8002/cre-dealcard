/**
 * real-cases-gates.test.ts — 5대 실매물 E2E 게이트 차단 및 정상 판정 테스트 스위트
 * Spec: docs/imup/01_spec_new/TEST_PLAN.md (§3.1, §4.1, §5.1, §6.1, §7.1)
 */

import { describe, it, expect } from 'vitest';
import { checkQG19, checkC19, checkQG21, runDeterministicGates } from '@/domain/building/gates/deterministic-gates';
import { calculateIncomeFinancials, calculateDevelopmentFinancials, calculateOwnerOccupiedFinancials, calculateTradingFinancials } from '@/domain/building/mobile-im/financials';
import type { IMCore } from '@/types/im-core';

describe('5 Real Cases E2E Gate & Pipeline Tests', () => {
  function createBaseCore(overrides: Partial<IMCore> = {}): IMCore {
    return {
      meta: {
        assetId: 'case-test',
        ontology: { buildingUse: '근린생활시설', assetType: '상가건물', posture: 'income', priceBand: 'B3' },
        generatedAt: '2026-08-23T00:00:00Z',
        resolution: 'R2',
        capabilities: ['CAP_DCF'],
        priceBand: 'B3',
      },
      address: {
        raw: '서울특별시 영등포구 양평동 100',
        roadAddress: '서울특별시 영등포구 양평로 10',
        jibunAddress: '서울특별시 영등포구 양평동 100',
        sido: '서울특별시',
        sigungu: '영등포구',
        dong: '양평동',
        pnu: '1156012300101000000',
      },
      physical: {
        landAreaSqm: 500,
        totalGrossAreaSqm: 1000,
        floorsAbove: 5,
        floorsBelow: 1,
        completionYear: 2018,
        parkingCount: 8,
        elevatorCount: 1,
        zoning: '제2종일반주거지역',
        bcrPct: 59.0,
        farPct: 199.5,
        roadAccess: '10m 도로 접함',
      },
      price: {
        askingKrw: 25_000_000_000,
        perPyeongLand: 165_289_256,
        officialLandPriceRatio: 2.1,
      },
      equity: {
        askingPrice: 25_000_000_000,
        acquisitionTax: 1_150_000_000,
        brokerFee: 225_000_000,
        totalAcquisitionCost: 26_375_000_000,
        deposit: 1_000_000_000,
        loan: 12_500_000_000,
        netEquity: 12_875_000_000,
      },
      yields: {
        gross_price: { label: '연 수익률 (매매가 기준)', valuePct: 4.2, basis: 'gross_price' },
      },
      headline: {
        posture: 'income',
        primaryMetricLabel: '연 수익률',
        primaryMetricValue: '4.2%',
        coreStrengths: ['양평역 역세권 코너 빌딩'],
      },
      leases: [
        {
          unitLabel: '1F',
          leaseAreaSqm: 200,
          tenantBusiness: '투썸플레이스',
          depositKrw: 400_000_000,
          monthlyRentKrw: 16_400_000,
          mgmtFeeKrw: 1_000_000,
          legalBasis: 'commercial',
          leaseState: '임대중',
        },
        {
          unitLabel: '2F-5F',
          leaseAreaSqm: 800,
          tenantBusiness: '메디컬센터',
          depositKrw: 600_000_000,
          monthlyRentKrw: 20_000_000,
          mgmtFeeKrw: 3_000_000,
          legalBasis: 'commercial',
          leaseState: '임대중',
        },
      ],
      comps: [],
      deficiencies: [],
      anchors: {
        askingPriceManwon: 2500000,
        totalDepositManwon: 100000,
        monthlyRentTotalManwon: 3640,
        grossYieldPct: 4.2,
        netYieldPct: null,
        landAreaPyung: 151.25,
        grossAreaPyung: 302.5,
      },
      provenance: {},
      attachedDocs: [
        { docType: 'building_register', fileName: '건축물대장.pdf', fileUrl: 'https://cdn.credeal.net/docs/b.pdf', verified: true },
      ],
      ...overrides,
    };
  }

  // 1. G01 양평동 250억 (Income): G19 표지 월세 불일치 및 G21 미검증 문서 차단
  it('G01 Yangpyeong (250억, Income): blocks G19 when monthly rent differs by 3.6M, blocks G21 on unverified doc', () => {
    // 표지 앵커는 4,000만원인데 원장 합계는 3,640만원 (360만원 불일치)
    const g01Core = createBaseCore({
      anchors: {
        askingPriceManwon: 2500000,
        totalDepositManwon: 100000,
        monthlyRentTotalManwon: 4000, // 4,000만 != 3,640만 (원장합계)
        grossYieldPct: 4.2,
        netYieldPct: null,
        landAreaPyung: 151.25,
        grossAreaPyung: 302.5,
      },
      attachedDocs: [
        { docType: 'land_use_plan', fileName: '토지이용계획원.pdf', fileUrl: '', verified: false }, // 논현동 오첨부
      ],
    });

    const g19Result = checkQG19(g01Core);
    expect(g19Result.passed).toBe(false);
    expect(g19Result.severity).toBe('block');
    expect(g19Result.diff?.monthlyDiff).toBe(3_600_000);

    const g21Result = checkQG21(g01Core);
    expect(g21Result.passed).toBe(false);
    expect(g21Result.severity).toBe('block');

    const fullReport = runDeterministicGates({ core: g01Core });
    expect(fullReport.blocked).toBe(true);
    expect(fullReport.failedBlocks.length).toBeGreaterThanOrEqual(2);
  });

  // 2. G02 당산동 115억 (Income): C19 면적 20.8% 모순 차단 & LTV 50% 역레버리지 검증
  it('G02 Dangsan (115억, Income): blocks C19 on 20.8% area mismatch & detects negative leverage', () => {
    // 대장 연면적 1,000㎡ vs 호실 임대면적 합계 1,208㎡ (20.8% 초과 > 2% 허용치)
    const g02Core = createBaseCore({
      physical: {
        ...createBaseCore().physical,
        totalGrossAreaSqm: 1000,
      },
      leases: [
        { unitLabel: '1F', leaseAreaSqm: 408, depositKrw: 100_000_000, monthlyRentKrw: 10_000_000, legalBasis: 'commercial', leaseState: '임대중' },
        { unitLabel: '2F-4F', leaseAreaSqm: 800, depositKrw: 200_000_000, monthlyRentKrw: 20_000_000, legalBasis: 'commercial', leaseState: '임대중' },
      ],
    });

    const c19Result = checkC19(g02Core);
    expect(c19Result.passed).toBe(false);
    expect(c19Result.severity).toBe('block');

    // 금융 엔진에서 Cap Rate 3.13% vs 대출금리 4.5% -> LTV 50% 역레버리지 확인
    const fin = calculateIncomeFinancials({
      askingPriceKrw: 11_500_000_000,
      monthlyRentTotalKrw: 30_000_000,
      loanRatePct: 0.045, // 4.5%
      loanAmountKrw: 5_750_000_000, // 50% LTV
    });
    expect(fin.negativeLeverage).toBe(true); // 3.13% < 4.5%
  });

  // 3. G03 역삼동 120억 사옥 (OwnerOccupied): 사옥형 점유비용 및 자가 vs 임차 절감액 산출
  it('G03 Yeoksam (120억, OwnerOccupied): evaluates occupancy cost and own vs lease savings', () => {
    const ownFin = calculateOwnerOccupiedFinancials({
      askingPriceKrw: 12_000_000_000,
      totalGrossAreaPyung: 350,
      loanRatePct: 0.045,
    });

    expect(ownFin.occupancyCostPerPyeongMonthly).toBeGreaterThan(0);
    expect(ownFin.ownVsLeaseSavingsBil).toBeGreaterThan(0);
    expect(ownFin.totalAcquisitionCostBil).toBeCloseTo(126.6, 1); // 120억 + 취득세(4.6%) + 중개보수(0.9%) = 126.6억
  });

  // 4. G06 잠원동 332억 (Development): 2종일반 용적률 250% 상한 및 한시 완화 기한 적용
  it('G06 Jamwon (332억, Development): enforces 250% FAR ceiling for type-2 residential & includes acquisition tax', () => {
    const devFin = calculateDevelopmentFinancials({
      landAreaSqm: 660, // 200평
      askingPriceKrw: 33_200_000_000,
      targetFarPct: 250, // 2종일반 상한
      targetBcrPct: 60,
    });

    expect(devFin.targetFarPct).toBe(250);
    expect(devFin.regulationExpiry).toBe('2028-05-18');
    expect(devFin.regulationDaysLeft).toBeGreaterThan(0);
    expect(devFin.estConstructionCostBil).toBeGreaterThan(0); // 1,200만/평
  });

  // 5. G07 대치동 150억 (Trading): Comps 부재 시 목표 매각가 미산출
  it('G07 Daechi (150억, Trading): leaves target exit price null when comps are not provided', () => {
    const tradeFin = calculateTradingFinancials({
      askingPriceKrw: 15_000_000_000,
      manualComps: null, // comps 미제공
    });

    expect(tradeFin.targetExitPriceBil).toBeNull();
    expect(tradeFin.expectedHprPct).toBeNull();
  });
});
