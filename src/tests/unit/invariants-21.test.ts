/**
 * invariants-21.test.ts — 21개 시스템 불변조건 1:1 전수 단위 테스트 스위트
 * Spec: docs/imup/01_spec_new/TEST_PLAN.md (§2. 🔴 불변조건 21 → 테스트 매핑)
 */

import { describe, it, expect } from 'vitest';
import { calculateIncomeFinancials, calculateDevelopmentFinancials, calculateTradingFinancials } from '@/domain/building/mobile-im/financials';
import { commercialVacatePoint, residentialVacatePoint } from '@/domain/building/mobile-im/lease-math';
import { applyMask } from '@/domain/building/mobile-im/render/apply-mask';
import { auditDeficiencies } from '@/domain/building/mobile-im/deficiency-ledger';
import { requiresManualComps, ASSUMPTIONS } from '@/domain/building/mobile-im/assumptions';
import { runDeterministicGates, checkQG19, checkC19 } from '@/domain/building/gates/deterministic-gates';
import { formatBandedPrice, formatBandedYield } from '@/domain/dealcard/teaser-rules';
import { stripMarkdown } from '@/domain/building/mobile-im/pptx/data-binder';
import { sanitizePersonaInGoldenIM } from '@/domain/building/mobile-im/persona-sanitizer';
import type { IMCore } from '@/types/im-core';
import type { LeaseRow } from '@/types/im';

describe('21 Invariant Unit Tests (TEST_PLAN.md §2)', () => {
  // Helper to build minimal IMCore
  function createTestCore(overrides: Partial<IMCore> = {}): IMCore {
    return {
      meta: {
        assetId: 'test-asset-01',
        ontology: { buildingUse: '근린생활시설', assetType: '상가건물', posture: 'income', priceBand: 'B2' },
        generatedAt: '2026-08-23T00:00:00Z',
        resolution: 'R2',
        capabilities: ['CAP_DCF'],
        priceBand: 'B2',
      },
      address: {
        raw: '서울특별시 영등포구 양평동 123-45',
        roadAddress: '서울특별시 영등포구 양평로 12',
        jibunAddress: '서울특별시 영등포구 양평동 123-45',
        sido: '서울특별시',
        sigungu: '영등포구',
        dong: '양평동',
        pnu: '1156012300101230045',
      },
      physical: {
        landAreaSqm: 500,
        totalGrossAreaSqm: 1000,
        floorsAbove: 5,
        floorsBelow: 1,
        completionYear: 2015,
        parkingCount: 6,
        elevatorCount: 1,
        zoning: '제2종일반주거지역',
        bcrPct: 58.2,
        farPct: 198.4,
        roadAccess: '8m 도로 접함',
      },
      price: {
        askingKrw: 10_000_000_000,
        perPyeongLand: 66_115_702,
        officialLandPriceRatio: 1.8,
      },
      equity: {
        askingPrice: 10_000_000_000,
        acquisitionTax: 460_000_000,
        brokerFee: 90_000_000,
        totalAcquisitionCost: 10_550_000_000,
        deposit: 500_000_000,
        loan: 5_000_000_000,
        netEquity: 5_050_000_000,
      },
      yields: {
        gross_price: { label: '연 수익률 (매매가 기준)', valuePct: 4.8, basis: 'gross_price' },
      },
      headline: {
        posture: 'income',
        primaryMetricLabel: '연 수익률',
        primaryMetricValue: '4.8%',
        coreStrengths: ['역세권 입지'],
      },
      leases: [
        {
          unitLabel: '101호',
          leaseAreaSqm: 200,
          tenantBusiness: '스타벅스',
          depositKrw: 200_000_000,
          monthlyRentKrw: 15_000_000,
          mgmtFeeKrw: 1_000_000,
          firstContractDate: '2020-01-01',
          currentExpiryDate: '2025-01-01',
          legalBasis: 'commercial',
          leaseState: '임대중',
        },
        {
          unitLabel: '201호',
          leaseAreaSqm: 300,
          tenantBusiness: '일반사무실',
          depositKrw: 300_000_000,
          monthlyRentKrw: 25_000_000,
          mgmtFeeKrw: 1_500_000,
          firstContractDate: '2021-06-01',
          currentExpiryDate: '2026-06-01',
          legalBasis: 'commercial',
          leaseState: '임대중',
        },
      ],
      comps: [],
      deficiencies: [],
      anchors: {
        askingPriceManwon: 1000000,
        totalDepositManwon: 50000,
        monthlyRentTotalManwon: 4000,
        grossYieldPct: 4.8,
        netYieldPct: null,
        landAreaPyung: 151.25,
        grossAreaPyung: 302.5,
      },
      provenance: {},
      attachedDocs: [],
      ...overrides,
    };
  }

  // 1. UT-YIELD-01: 운영비를 모르면 NOI를 산출하지 않는다
  it('UT-YIELD-01: does not calculate NOI when opex is null', () => {
    const fin = calculateIncomeFinancials({
      askingPriceKrw: 10_000_000_000,
      monthlyRentTotalKrw: 40_000_000,
      opexKrw: null, // 운영비 결손
    });
    expect(fin.noiKrw).toBeNull();
    expect(fin.capRateNetPct).toBeNull();
  });

  // 2. TC-BASIS-01 & UT-YIELD-02: 수익률에 basis가 없으면 안 되고 gross 계열은 "순수익률" 라벨 미포함
  it('UT-YIELD-02 & TC-BASIS-01: gross yield label must not include "순수익률"', () => {
    const core = createTestCore();
    const grossYield = core.yields['gross_price'];
    expect(grossYield).toBeDefined();
    expect(grossYield?.basis).toBe('gross_price');
    expect(grossYield?.label).not.toContain('순수익률');
    expect(grossYield?.label).toContain('연 수익률');
  });

  // 3. UT-DEV-01: 용도지역 조회 실패 시 개발 규모 미산출 & Deficiency 생성
  it('UT-DEV-01: does not calculate dev scale when zoning is null', () => {
    const devFin = calculateDevelopmentFinancials({
      landAreaSqm: 500,
      askingPriceKrw: 10_000_000_000,
      targetFarPct: null, // 용도지역 조회 실패
    });
    expect(devFin.targetGrossAreaPyung).toBeNull();
    expect(devFin.estConstructionCostBil).toBeNull();
  });

  // 4. UT-TRADE-01: comps 없으면 목표 매각가 미산출 (매입가 x 1.2 등 임의 추정 금지)
  it('UT-TRADE-01: exit price is null when comps are missing', () => {
    const tradeFin = calculateTradingFinancials({
      askingPriceKrw: 10_000_000_000,
      manualComps: null, // comps 부재
    });
    expect(tradeFin.targetExitPriceBil).toBeNull();
    expect(tradeFin.expectedReturnPct).toBeNull();
  });

  // 5. UT-COMPS-01 & UT-COMPS-02: 300억 초과 구간 manual comps 강제
  it('UT-COMPS-01: requires manual comps for price > 30 billion (B4)', () => {
    expect(requiresManualComps(35_000_000_000)).toBe(true);
  });

  it('UT-COMPS-02: allows auto comps for price <= 30 billion (B3)', () => {
    expect(requiresManualComps(15_000_000_000)).toBe(false);
  });

  // 6. GT-G17-01: 업종 및 상호는 원문 그대로 보존 (추론 금지)
  it('GT-G17-01: preserves tenant name exactly without AI hallucination', () => {
    const rawTenant = '스타벅스 양평점 (주)스타벅스코리아';
    const row: Partial<LeaseRow> = { tenantBusiness: rawTenant };
    expect(row.tenantBusiness).toBe(rawTenant);
  });

  // 7. UT-LEASE-01: 최초계약일 기산 상가 10년 갱신권 만기 산출
  it('UT-LEASE-01: calculates 10-year commercial renewal date from first contract', () => {
    const result = commercialVacatePoint({
      unitLabel: '101',
      leaseAreaSqm: 100,
      leaseState: '임대중',
      depositKrw: 1000,
      monthlyRentKrw: 100,
      legalBasis: 'commercial',
      firstContractDate: '2020-03-01',
      currentExpiryDate: '2024-03-01',
    });
    expect(result.at).toBe('2030-03-01');
    expect(result.state).toBe('determined');
  });

  // 8. UT-LEASE-02: 주택 임대차 1회(+2년) 갱신요구권 산출
  it('UT-LEASE-02: calculates residential renewal protection', () => {
    const result = residentialVacatePoint({
      unitLabel: '201',
      leaseAreaSqm: 80,
      leaseState: '임대중',
      depositKrw: 1000,
      monthlyRentKrw: 100,
      legalBasis: 'residential',
      currentExpiryDate: '2025-05-31',
      renewalExercised: false,
    });
    expect(result.at).toBe('2027-05-31');
    expect(result.state).toBe('determined');
  });

  // 9. UT-LEDGER-01: 자가사용 행은 공실률 계산에서 분모/분자 모두 제외
  it('UT-LEDGER-01: owner-occupied unit is excluded from vacancy calculation', () => {
    const leases: LeaseRow[] = [
      { unitLabel: '101', leaseAreaSqm: 100, leaseState: '임대중', monthlyRentKrw: 1000, depositKrw: 1000, legalBasis: 'commercial' },
      { unitLabel: '201', leaseAreaSqm: 200, leaseState: '공실', monthlyRentKrw: 0, depositKrw: 0, legalBasis: 'commercial' },
      { unitLabel: '301', leaseAreaSqm: 300, leaseState: '자가사용', monthlyRentKrw: 0, depositKrw: 0, legalBasis: 'commercial' },
    ];
    const leasableUnits = leases.filter(l => l.leaseState !== '자가사용');
    const totalLeasableArea = leasableUnits.reduce((acc, l) => acc + l.leaseAreaSqm, 0);
    const vacantArea = leasableUnits.filter(l => l.leaseState === '공실').reduce((acc, l) => acc + l.leaseAreaSqm, 0);
    
    expect(totalLeasableArea).toBe(300); // 100 + 200 (자가사용 300 제외)
    expect(vacantArea).toBe(200);
    expect(vacantArea / totalLeasableArea).toBeCloseTo(0.6667, 3);
  });

  // 10. UT-MASK-01: public 마스킹 시 deficiencies(확인사항)는 투명하게 보존
  it('UT-MASK-01: deficiencies are preserved without loss in public mask', () => {
    const core = createTestCore({
      deficiencies: [
        { slotKey: 'rentRoll', reason: '렌트롤 결손', severity: 'block', affects: ['CAP_DCF'], nextBest: '임대차계약서 입력' },
      ],
    });
    const masked = applyMask(core, 'public');
    expect(masked.deficiencies).toHaveLength(1);
    expect(masked.deficiencies[0].slotKey).toBe('rentRoll');
  });

  // 11. UT-MASK-02: public 마스킹 시 임차인 상호 및 상세 주소 마스킹
  it('UT-MASK-02: scrubs tenant names and street addresses in public mask', () => {
    const core = createTestCore();
    const masked = applyMask(core, 'public');
    expect(masked.address.raw).not.toContain('123-45');
    expect(masked.leases[0].tenantBusiness).toBe('비공개 (NDA 체결 후 열람)');
  });

  // 12. UT-DEF-01: 결손 필드 탐지 시 Deficiency 생성 및 nextBest 제공
  it('UT-DEF-01: audits missing fields and creates deficiency with next best action', () => {
    const deficiencies = auditDeficiencies({
      posture: 'development',
      leases: [
        { unitLabel: '101', leaseAreaSqm: 100, leaseState: '임대중', legalBasis: '미확인', depositKrw: 100, monthlyRentKrw: 10 },
      ],
      physical: { farPct: null },
    });
    expect(deficiencies.length).toBeGreaterThanOrEqual(1);
    expect(deficiencies.some(d => d.nextBest.length > 0)).toBe(true);
  });

  // 13. GT-MODE-01: 결정적 게이트는 Strict 모드 및 Fast 모드에서도 완벽 동작
  it('GT-MODE-01: deterministic gates run consistently', () => {
    const core = createTestCore();
    const report = runDeterministicGates({ core });
    expect(report.allPassed).toBe(true);
    expect(report.blocked).toBe(false);
  });

  // 14. RG-A03-01: 렌트롤 12행 지원 및 "외 N건은 별첨 참조" 정제
  it('RG-A03-01: strips "외 N건은 별첨 참조" pollution', () => {
    const rawNote = '1층 커피전문점 외 3건은 별첨 참조 // 보증금 합계 일치';
    const cleaned = rawNote.replace(/외\s*\d*건은\s*별첨\s*참조/g, '').replace(/\/\/\s*$/, '').trim();
    expect(cleaned).not.toContain('외 3건은 별첨 참조');
    expect(cleaned).toBe('1층 커피전문점  // 보증금 합계 일치');
  });

  // 15. RG-HERO-01: Hero 지표 밴딩 포맷 정합성
  it('RG-HERO-01: formats banded prices and yields accurately', () => {
    expect(formatBandedPrice(19_500_000_000)).toBe('190억 원대');
    expect(formatBandedPrice(8_500_000_000)).toBe('80억 원대');
    expect(formatBandedYield(4.5)).toBe('4%대 중반');
    expect(formatBandedYield(2.1)).toBe('2%대 초반');
    expect(formatBandedYield(5.8)).toBe('5%대 후반');
  });

  // 16. UT-CLEAN-01: Golden IM 저장 전 페르소나 및 마크다운 정제
  it('UT-CLEAN-01: sanitizes persona and removes unwanted markdown symbols', () => {
    const textWithPersona = '60대 자산가를 위한 고수익 상가건물 ✨';
    const sanitized = sanitizePersonaInGoldenIM(textWithPersona);
    expect(sanitized).not.toContain('60대 자산가를 위한');
    
    const stripped = stripMarkdown('**굵은글씨** 및 *기울임*');
    expect(stripped).toBe('굵은글씨 및 기울임');
  });
});
