// src/domain/building/mobile-im/__tests__/gates/deterministic-gates.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  checkG19,
  checkC19,
  checkG21,
  checkG15,
  checkG16,
  runDeterministicGates,
} from '@/domain/building/gates/deterministic-gates';
import type { IMCore } from '@/types/im-core';

function createMockCore(overrides?: Partial<IMCore>): IMCore {
  return {
    meta: {
      assetId: 'test-building-1',
      ontology: {
        buildingUse: '제2종근린생활시설',
        assetType: 'small_building',
        posture: 'income',
      },
      generatedAt: '2026-08-23',
      resolution: 'R2',
      capabilities: ['yield_gross', 'yield_noi'],
      priceBand: 'B2',
    },
    address: {
      raw: '서울 강남구 역삼동 100-1',
      roadAddress: '서울 강남구 테헤란로 10',
      jibunAddress: '서울 강남구 역삼동 100-1',
      sido: '서울',
      sigungu: '강남구',
      dong: '역삼동',
      pnu: '1168010100',
    },
    physical: {
      landAreaSqm: 330,
      totalGrossAreaSqm: 1000,
      floorsAbove: 5,
      floorsBelow: 1,
      completionYear: 2018,
      parkingCount: 6,
      elevatorCount: 1,
      zoning: '제3종일반주거지역',
      bcrPct: 49.5,
      farPct: 248.0,
      roadAccess: '8m 도로 접함',
    },
    price: {
      askingKrw: 10_000_000_000,
      perPyeongLand: 100_000_000,
      officialLandPriceRatio: 1.5,
    },
    equity: {
      price: 10_000_000_000,
      acquisitionTax: 460_000_000,
      brokerFee: 90_000_000,
      otherCost: 0,
      totalAcquisitionCost: 10_550_000_000,
      deposit: 500_000_000,
      loan: 5_000_000_000,
      equity: 5_050_000_000,
    },
    yields: {
      gross_price: { value: 4.2, basis: 'gross_price' },
      noi_price: { value: 3.6, basis: 'noi_price' },
    },
    headline: {
      posture: 'income',
      monthlyNetCashFlow: 15_000_000,
      negativeLeverage: false,
    },
    leases: [
      {
        unitLabel: '1F',
        tenantBusiness: '카페',
        depositKrw: 200_000_000,
        monthlyRentKrw: 15_000_000,
        currentExpiryDate: '2027-12-31',
        leaseState: '임대중',
        contractGroup: null,
        leaseAreaSqm: 300,
        legalBasis: '상가',
        mgmtFeeKrw: 1_000_000,
        currentStartDate: '2023-12-31',
        firstContractDate: '2023-12-31',
        renewalExercised: null,
        opposingPower: '사업자등록',
        note: null,
      },
      {
        unitLabel: '2F-5F',
        tenantBusiness: '사무실',
        depositKrw: 300_000_000,
        monthlyRentKrw: 20_000_000,
        currentExpiryDate: '2028-06-30',
        leaseState: '임대중',
        contractGroup: null,
        leaseAreaSqm: 650,
        legalBasis: '상가',
        mgmtFeeKrw: 2_000_000,
        currentStartDate: '2024-06-30',
        firstContractDate: '2024-06-30',
        renewalExercised: null,
        opposingPower: '사업자등록',
        note: null,
      },
    ],
    comps: [],
    deficiencies: [],
    anchors: {
      askingPriceManwon: 1000000,
      totalDepositManwon: 50000,
      monthlyRentTotalManwon: 3500, // 15M + 20M = 35M
      grossYieldPct: 4.2,
      netYieldPct: 3.6,
      landAreaPyung: 100,
      grossAreaPyung: 302.5,
    },
    provenance: {},
    attachedDocs: [
      { docType: '대장', fileName: '건축물대장.pdf', fileUrl: 'https://example.com/doc.pdf', verified: true },
    ],
    ...overrides,
  };
}

describe('Deterministic Gates (Phase 5.1)', () => {
  const originalEnv = process.env.GATE_STRICT_MODE;

  beforeEach(() => {
    process.env.GATE_STRICT_MODE = 'true';
  });

  afterEach(() => {
    process.env.GATE_STRICT_MODE = originalEnv;
  });

  describe('G19: Summary Deposit/Rent === Ledger Sum', () => {
    it('UT-01: G19 passes when summary equals ledger total exactly', () => {
      const core = createMockCore();
      const result = checkG19(core);
      expect(result.passed).toBe(true);
      expect(result.severity).toBe('block');
    });

    it('UT-02: G19 fails when deposit in summary does not match ledger sum', () => {
      const core = createMockCore({
        equity: {
          price: 10_000_000_000,
          acquisitionTax: 460_000_000,
          brokerFee: 90_000_000,
          otherCost: 0,
          totalAcquisitionCost: 10_550_000_000,
          deposit: 600_000_000, // Discrepancy (Ledger sum is 500M)
          loan: 5_000_000_000,
          equity: 4_950_000_000,
        },
      });
      const result = checkG19(core);
      expect(result.passed).toBe(false);
      expect(result.diff?.depositDiff).toBe(100_000_000);
    });

    it('UT-03: G19 fails when monthly rent anchor does not match ledger sum', () => {
      const core = createMockCore({
        anchors: {
          askingPriceManwon: 1000000,
          totalDepositManwon: 50000,
          monthlyRentTotalManwon: 4000, // Discrepancy (Ledger sum is 3500)
          grossYieldPct: 4.8,
          netYieldPct: 4.1,
          landAreaPyung: 100,
          grossAreaPyung: 302.5,
        },
      });
      const result = checkG19(core);
      expect(result.passed).toBe(false);
      expect(result.diff?.monthlyDiff).toBe(5_000_000);
    });
  });

  describe('C19: Building Total Gross Area vs Leased Area (±2%)', () => {
    it('UT-04: C19 passes when total leased area (950m2) <= total gross area (1000m2)', () => {
      const core = createMockCore();
      const result = checkC19(core);
      expect(result.passed).toBe(true);
    });

    it('UT-05: C19 passes when leased area slightly exceeds within 2% (1015m2 <= 1020m2)', () => {
      const core = createMockCore({
        leases: [
          {
            unitLabel: '1F-5F',
            tenantBusiness: '전층 임대',
            depositKrw: 500_000_000,
            monthlyRentKrw: 35_000_000,
            currentExpiryDate: '2028-12-31',
            leaseState: '임대중',
            contractGroup: null,
            leaseAreaSqm: 1015, // 1000 * 1.015 <= 1020
            legalBasis: '상가',
            mgmtFeeKrw: 0,
            currentStartDate: null,
            firstContractDate: null,
            renewalExercised: null,
            opposingPower: null,
            note: null,
          },
        ],
      });
      const result = checkC19(core);
      expect(result.passed).toBe(true);
    });

    it('UT-06: C19 fails when leased area exceeds gross area by more than 2% (1050m2 > 1020m2)', () => {
      const core = createMockCore({
        leases: [
          {
            unitLabel: '1F-5F',
            tenantBusiness: '전층 임대',
            depositKrw: 500_000_000,
            monthlyRentKrw: 35_000_000,
            currentExpiryDate: '2028-12-31',
            leaseState: '임대중',
            contractGroup: null,
            leaseAreaSqm: 1050, // Exceeds by 5%
            legalBasis: '상가',
            mgmtFeeKrw: 0,
            currentStartDate: null,
            firstContractDate: null,
            renewalExercised: null,
            opposingPower: null,
            note: null,
          },
        ],
      });
      const result = checkC19(core);
      expect(result.passed).toBe(false);
      expect(result.message).toContain('2% 이상 초과');
    });
  });

  describe('G21: Attached Documents Verification', () => {
    it('UT-07: G21 passes when all docs are verified', () => {
      const core = createMockCore();
      const result = checkG21(core);
      expect(result.passed).toBe(true);
    });

    it('UT-08: G21 fails when unverified document exists', () => {
      const core = createMockCore({
        attachedDocs: [
          { docType: '대장', fileName: '미확인도면.pdf', fileUrl: 'https://example.com/unv.pdf', verified: false },
        ],
      });
      const result = checkG21(core);
      expect(result.passed).toBe(false);
    });
  });

  describe('G15: Text Budget & Limits', () => {
    it('UT-09: G15 passes when all text lengths are within limits', () => {
      const result = checkG15({
        core: createMockCore(),
        textSnippets: [
          { type: 'slideTitle', text: '핵심 투자 지표 요약' },
          { type: 'kicker', text: 'PROPERTY OVERVIEW' },
          { type: 'statLabel', text: '매매 희망가' },
        ],
      });
      expect(result.passed).toBe(true);
    });

    it('UT-10: G15 fails when text exceeds limits', () => {
      const result = checkG15({
        core: createMockCore(),
        textSnippets: [
          { type: 'slideTitle', text: '이 제목은 슬라이드 제목의 글자수 제한인 삼십이 글자를 훨씬 넘어서 작성된 매우 길고 긴 비정상적인 제목입니다' },
        ],
      });
      expect(result.passed).toBe(false);
    });
  });

  describe('G16: Coordinate & Bounds Integrity (12.713 x 6.75)', () => {
    it('UT-11: G16 passes when all elements fit within bounds', () => {
      const result = checkG16({
        core: createMockCore(),
        renderedElements: [
          { x: 0.6, y: 1.55, w: 5.9, h: 4.8 },
          { x: 6.8, y: 1.55, w: 5.8, h: 4.8 }, // right: 12.6 <= 12.713, bottom: 6.35 <= 6.75
        ],
      });
      expect(result.passed).toBe(true);
    });

    it('UT-12: G16 fails when element overflows right edge or bottom edge', () => {
      const result = checkG16({
        core: createMockCore(),
        renderedElements: [
          { x: 8.0, y: 2.0, w: 5.5, h: 5.2 }, // right: 13.5 > 12.713, bottom: 7.2 > 6.75
        ],
      });
      expect(result.passed).toBe(false);
      expect(result.message).toContain('좌표 경계 초과');
    });
  });

  describe('Comprehensive Gate Suite & GATE_STRICT_MODE', () => {
    it('UT-13: runDeterministicGates passes all when clean', () => {
      const report = runDeterministicGates({
        core: createMockCore(),
        renderedElements: [{ x: 0.6, y: 1.55, w: 5.9, h: 4.8 }],
        textSnippets: [{ type: 'slideTitle', text: '정상 제목' }],
      });
      expect(report.allPassed).toBe(true);
      expect(report.blocked).toBe(false);
    });

    it('UT-14: runDeterministicGates degrades block to warn when GATE_STRICT_MODE=false', () => {
      process.env.GATE_STRICT_MODE = 'false';
      const report = runDeterministicGates({
        core: createMockCore({
          equity: {
            price: 10_000_000_000,
            acquisitionTax: 460_000_000,
            brokerFee: 90_000_000,
            otherCost: 0,
            totalAcquisitionCost: 10_550_000_000,
            deposit: 700_000_000, // Discrepancy
            loan: 5_000_000_000,
            equity: 4_850_000_000,
          },
        }),
      });
      expect(report.allPassed).toBe(false);
      expect(report.blocked).toBe(false); // In non-strict mode, not blocked!
      expect(report.failedWarns.length).toBeGreaterThan(0);
      expect(report.failedBlocks.length).toBe(0);
    });
  });
});
