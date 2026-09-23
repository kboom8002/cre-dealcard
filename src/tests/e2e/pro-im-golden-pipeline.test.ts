/**
 * @file pro-im-golden-pipeline.test.ts
 * @description Milestone 4 (Generation 20): Institutional Pro IM End-to-End Automated Golden Test Suite.
 *
 * Verifies:
 * 1. Multi-posture Pro IM deck generation across investment postures (income, owner_occupied, development)
 *    producing 30~40 slides (34~36 expected).
 * 2. 5 core chapter sequence with Roman numerals I through V using A25 chapter dividers.
 * 3. SSoT mathematical consistency between Ch.1 Executive Summary and Ch.3 Financial Model via verifyMathematicalConsistency.
 * 4. Physical PPTX binary inspection via assertAllPhysicalBinaryGates (0 poison tokens, 0 evasive phrases, 0 mock leaks).
 * 5. Negative regression guard asserting that corrupt inputs/poison tokens trip the binary gate.
 * 6. Basic IM isolation confirming buildDeckSequence without Pro preset stays strictly <= 16 slides (9-10 slides, 0 Pro dividers).
 *
 * CRITICAL INVARIANTS:
 * - Basic IM PAGE_HARD_LIMIT = 16 is strictly isolated and never violated.
 * - Pro IM PRO_PAGE_MIN_LIMIT = 30, PRO_PAGE_HARD_LIMIT = 40.
 * - SSoT mathematical consistency tolerance = 0.00%.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import JSZip from 'jszip';
import {
  buildProDeckSequence,
  PRO_PAGE_MIN_LIMIT,
  PRO_PAGE_HARD_LIMIT,
  PRO_PAGE_TARGET,
} from '@/domain/building/mobile-im/pptx/pro-deck-sequencer';
import {
  buildDeckSequence,
  PAGE_HARD_LIMIT,
} from '@/domain/building/mobile-im/pptx/deck-sequencer';
import {
  MobileImPptxRenderer,
  type MobileImPptxInput,
} from '@/domain/building/mobile-im/pptx/pptx-renderer';
import {
  extractSlideTexts,
  assertZeroPoisonTokens,
  assertZeroEvasivePhrases,
  assertZeroMockLeaks,
  assertAllPhysicalBinaryGates,
  verifyMathematicalConsistency,
  inspectPptxBinary,
} from '@/assurance/im-harness/golden-test-utils';
import {
  generateMultiYearCashFlow,
  validateProImFinancialConsistency,
} from '@/domain/building/im-core/pro-financial-model';
import type { InvestmentPosture } from '@/domain/ontology';

/**
 * Fixture generator for authentic Pro IM golden test inputs.
 * Strictly free of poison tokens, personas, mock data leaks, and evasive phrases.
 */
function createGoldenProInput(posture: InvestmentPosture): MobileImPptxInput {
  const isIncome = posture === 'income';
  const isOwner = posture === 'owner_occupied';
  const isDev = posture === 'development';

  const assetName = isIncome
    ? '역삼 테라타워'
    : isOwner
    ? '서초 메디컬 타워'
    : '대흥 역세권 개발부지';

  const address = isIncome
    ? '서울특별시 강남구 테헤란로 152'
    : isOwner
    ? '서울특별시 서초구 서초대로 254'
    : '서울특별시 마포구 백범로 35';

  const askingPriceKrw = isIncome
    ? 25_000_000_000
    : isOwner
    ? 21_000_000_000
    : 18_000_000_000;

  const askingPriceManwon = Math.round(askingPriceKrw / 10000);
  const monthlyRentTotalKrw = isIncome ? 87_500_000 : isOwner ? 65_000_000 : 0;
  const annualRentKrw = monthlyRentTotalKrw * 12;
  const totalDepositKrw = isIncome ? 2_000_000_000 : isOwner ? 1_500_000_000 : 0;
  const totalDepositManwon = Math.round(totalDepositKrw / 10000);
  const capRate = isIncome ? 4.20 : isOwner ? 3.71 : 0;
  const landAreaPy = isIncome ? 220 : isOwner ? 180 : 310;
  const totalGrossAreaPy = isIncome ? 1250 : isOwner ? 980 : 2100;
  const totalGrossAreaSqm = Math.round(totalGrossAreaPy / 0.3025);
  const landAreaSqm = Math.round(landAreaPy / 0.3025);

  const floorLeases = [
    {
      floor: 'B1',
      unitNumber: 'B101호',
      tenantName: '프라임 피트니스',
      industry: '스포츠/레저',
      leasedAreaM2: 330.5,
      leasedAreaPyeong: 100.0,
      depositKrw: 150_000_000,
      monthlyRentKrw: 7_500_000,
      monthlyMaintenanceKrw: 2_000_000,
      leaseStartDate: '2023-01-01',
      leaseEndDate: '2028-12-31',
      statutoryProtection10Y: true,
    },
    {
      floor: '1F',
      unitNumber: '101호',
      tenantName: '블루보틀 커피',
      industry: 'F&B/카페',
      leasedAreaM2: 247.9,
      leasedAreaPyeong: 75.0,
      depositKrw: 300_000_000,
      monthlyRentKrw: 16_000_000,
      monthlyMaintenanceKrw: 3_000_000,
      leaseStartDate: '2022-06-01',
      leaseEndDate: '2027-05-31',
      statutoryProtection10Y: true,
      isAnchor: true,
    },
    {
      floor: '2F',
      unitNumber: '201호',
      tenantName: '서울연세안과의원',
      industry: '메디컬/병원',
      leasedAreaM2: 297.5,
      leasedAreaPyeong: 90.0,
      depositKrw: 200_000_000,
      monthlyRentKrw: 12_000_000,
      monthlyMaintenanceKrw: 2_500_000,
      leaseStartDate: '2021-03-01',
      leaseEndDate: '2026-02-28',
      statutoryProtection10Y: true,
    },
    {
      floor: '3F',
      unitNumber: '301호',
      tenantName: '정명 세무회계법인',
      industry: '전문서비스/세무',
      leasedAreaM2: 314.0,
      leasedAreaPyeong: 95.0,
      depositKrw: 150_000_000,
      monthlyRentKrw: 10_000_000,
      monthlyMaintenanceKrw: 2_200_000,
      leaseStartDate: '2023-09-01',
      leaseEndDate: '2026-08-31',
      statutoryProtection10Y: true,
    },
    {
      floor: '4F',
      unitNumber: '401호',
      tenantName: '넥스트소프트',
      industry: 'IT/소프트웨어',
      leasedAreaM2: 314.0,
      leasedAreaPyeong: 95.0,
      depositKrw: 150_000_000,
      monthlyRentKrw: 10_000_000,
      monthlyMaintenanceKrw: 2_200_000,
      leaseStartDate: '2024-02-01',
      leaseEndDate: '2027-01-31',
      statutoryProtection10Y: false,
    },
    {
      floor: '5F',
      unitNumber: '501호',
      tenantName: '스튜디오 크리에이티브',
      industry: '미디어/디자인',
      leasedAreaM2: 314.0,
      leasedAreaPyeong: 95.0,
      depositKrw: 150_000_000,
      monthlyRentKrw: 10_000_000,
      monthlyMaintenanceKrw: 2_200_000,
      leaseStartDate: '2023-11-01',
      leaseEndDate: '2026-10-31',
      statutoryProtection10Y: false,
    },
    {
      floor: '6F',
      unitNumber: '601호',
      tenantName: '글로벌파트너스',
      industry: '경영컨설팅',
      leasedAreaM2: 314.0,
      leasedAreaPyeong: 95.0,
      depositKrw: 150_000_000,
      monthlyRentKrw: 10_000_000,
      monthlyMaintenanceKrw: 2_200_000,
      leaseStartDate: '2022-10-01',
      leaseEndDate: '2027-09-30',
      statutoryProtection10Y: true,
    },
    {
      floor: '7F',
      unitNumber: '701호',
      tenantName: '에이스자산운용',
      industry: '금융/투자',
      leasedAreaM2: 314.0,
      leasedAreaPyeong: 95.0,
      depositKrw: 150_000_000,
      monthlyRentKrw: 12_000_000,
      monthlyMaintenanceKrw: 2_500_000,
      leaseStartDate: '2023-05-01',
      leaseEndDate: '2028-04-30',
      statutoryProtection10Y: true,
    },
  ];

  return {
    buildingId: `golden-${posture}-bld`,
    posture,
    grade: 'A',
    preset: 'institutional_dark_gold',
    isPro: true,
    doc: {
      title: `${assetName} 투자설명서`,
      body: {
        title: assetName,
        investment_posture: posture,
        posture,
        askingPrice: askingPriceKrw,
        asking_price_krw: askingPriceKrw,
        asking_price_manwon: askingPriceManwon,
        annual_rent_krw: annualRentKrw,
        monthly_rent_total_krw: monthlyRentTotalKrw,
        total_deposit_krw: totalDepositKrw,
        total_deposit_manwon: totalDepositManwon,
        cap_rate_percent: capRate,
        land_area_py: landAreaPy,
        total_gross_area_py: totalGrossAreaPy,
        floor_leases: floorLeases,
        heroCard: {
          title: assetName,
          askingPriceKrw,
          askingPriceDisplay: `${askingPriceKrw / 100_000_000}억 원`,
          landAreaM2: landAreaSqm,
          totalGrossAreaSqm,
          capRatePct: capRate,
          monthlyRentKrw: monthlyRentTotalKrw,
          depositKrw: totalDepositKrw,
          useZone: '일반상업지역',
          floors: '지하 2층 ~ 지상 8층',
          completionYear: 2018,
          hookText: isIncome
            ? '강남 테헤란로 핵심 업무권역 위치 프라임 오피스 자산'
            : isOwner
            ? '서초 법원·검찰청 권역 통사옥 활용 최적 자산'
            : '마포 대흥 역세권 개발 사업성 우수 부지',
        },
        summary: {
          leadText: isIncome
            ? '테헤란로 핵심 비즈니스 벨트 입지의 안정적 임대수익형 프라임 자산'
            : isOwner
            ? '서초권역 접근성과 단독 사옥 브랜딩 가치를 갖춘 통사옥 자산'
            : '대흥 역세권 입지의 신축 개발 사업 타당성 우수 부지',
          narrative: isIncome
            ? '매각희망가 250억 원, 대지 220평, 연면적 1,250평 규모의 우량 자산으로 안정적인 운용 수익과 중장기 가치 상승이 기대됩니다.'
            : isOwner
            ? '매각희망가 210억 원 규모로 사옥 매입을 통한 임차료 절감 및 법인 자산 가치 제고에 적합한 자산입니다.'
            : '매각희망가 180억 원 규모의 역세권 부지로 주거 및 상업 복합 신축 개발 타당성이 확보된 부지입니다.',
        },
        ssot_summary: {
          title: assetName,
          address,
          asking_price: askingPriceKrw,
          asking_price_manwon: askingPriceManwon,
          price_band: `${askingPriceKrw / 100_000_000}억 원`,
          total_area: totalGrossAreaSqm,
          total_gross_area_sqm: totalGrossAreaSqm,
          land_area_sqm: landAreaSqm,
          cap_rate: capRate,
          deposit: totalDepositKrw,
          total_deposit_manwon: totalDepositManwon,
          monthly_rent: monthlyRentTotalKrw,
          monthly_rent_total_krw: monthlyRentTotalKrw,
          annual_rent_krw: annualRentKrw,
          zoning: '일반상업지역',
          building_area_sqm: Math.round(landAreaSqm * 0.6),
          bcr_pct: 60,
          far_pct: 570,
          completion_year: 2018,
          floors_above: 8,
          floors_below: 2,
          parking_count: 32,
          elevator_count: 2,
        },
        stackingPlan: [
          { floor: '7F', tenant: '에이스자산운용', area: '95평', status: '임대완료' },
          { floor: '6F', tenant: '글로벌파트너스', area: '95평', status: '임대완료' },
          { floor: '5F', tenant: '스튜디오 크리에이티브', area: '95평', status: '임대완료' },
          { floor: '4F', tenant: '넥스트소프트', area: '95평', status: '임대완료' },
          { floor: '3F', tenant: '정명 세무회계법인', area: '95평', status: '임대완료' },
          { floor: '2F', tenant: '서울연세안과의원', area: '90평', status: '임대완료' },
          { floor: '1F', tenant: '블루보틀 커피', area: '75평', status: '임대완료' },
          { floor: 'B1', tenant: '프라임 피트니스', area: '100평', status: '임대완료' },
        ],
        disclaimer:
          '본 자료는 대상 자산에 대한 이해를 돕기 위해 작성된 것으로 법적 구속력을 갖지 않으며, 최종 계약 시 공적 장부 및 현장 실사를 통해 상세 내용을 확인하시기 바랍니다.',
      },
      sections: [
        {
          title: '물건 개요',
          markdown: '본 자산은 테헤란로 핵심 업무권역에 위치한 프라임 오피스 자산입니다.',
          section_type: 'property_overview',
        },
        {
          title: '입지 분석',
          markdown: '지하철역 도보 역세권 및 간선도로 교통망 접근성이 탁월합니다.',
          section_type: 'location_access',
        },
        {
          title: '임대차 현황',
          markdown: '우량 테넌트 중심의 만실 운영으로 안정적 현금흐름을 창출하고 있습니다.',
          section_type: 'lease_status',
        },
        {
          title: '재무 분석',
          markdown: '연 순영업소득(NOI)과 Cap Rate를 기반으로 우수한 투자 수익성을 유지합니다.',
          section_type: 'income_analysis',
        },
        {
          title: '투자 논거',
          markdown: '입지 가치, 임대차 안정성, 중장기 자본수익 잠재력이 결합된 핵심 자산입니다.',
          section_type: 'investment_thesis',
        },
        {
          title: '다음 단계',
          markdown: 'LOI 접수 후 상세 기술 실사 및 매입 본계약 체결을 진행합니다.',
          section_type: 'next_steps',
        },
      ],
    },
    building: {
      address,
      area_signal: isIncome ? '강남권역 (GBD)' : isOwner ? '서초권역 (GBD)' : '마포권역 (YBD)',
      asset_type: isIncome ? '오피스빌딩' : isOwner ? '메디컬사옥' : '신축부지',
      price_band: `${askingPriceKrw / 100_000_000}억 원`,
      built_year: 2018,
      floors_above: 8,
      floors_below: 2,
    },
    broker: {
      display_name: '김수석 이사',
      company_name: 'CREDEAL 파트너스 부동산중개법인',
      phone: '02-1234-5678',
      email: 'lead@credeal.com',
      registration_no: '11680-2024-00001',
    },
  };
}

describe('Institutional Pro IM Golden Pipeline E2E Test Suite', { timeout: 180_000 }, () => {
  let renderer: MobileImPptxRenderer;
  let incomeGoldenBuffer: Buffer;
  let ownerGoldenBuffer: Buffer;
  let devGoldenBuffer: Buffer;

  beforeAll(async () => {
    renderer = new MobileImPptxRenderer();

    // Render full physical Pro IM PPTX decks for the 3 target postures
    const incomeRes = await renderer.render(createGoldenProInput('income'));
    incomeGoldenBuffer = incomeRes.buffer;

    const ownerRes = await renderer.render(createGoldenProInput('owner_occupied'));
    ownerGoldenBuffer = ownerRes.buffer;

    const devRes = await renderer.render(createGoldenProInput('development'));
    devGoldenBuffer = devRes.buffer;
  }, 60000);

  // ==========================================================================
  // Suite 1: Multi-Posture End-to-End Pro IM Deck Generation
  // ==========================================================================
  describe('Suite 1: Multi-Posture E2E Deck Generation (income, owner_occupied, development)', () => {
    const postures: InvestmentPosture[] = ['income', 'owner_occupied', 'development'];

    it.each(postures)(
      'generates 30~40 slides (specifically 34~36 slides) for posture: %s',
      (posture) => {
        const seq = buildProDeckSequence({ posture, grade: 'A' });
        expect(seq.length).toBeGreaterThanOrEqual(PRO_PAGE_MIN_LIMIT);
        expect(seq.length).toBeLessThanOrEqual(PRO_PAGE_HARD_LIMIT);
        expect(seq.length).toBeGreaterThanOrEqual(34);
        expect(seq.length).toBeLessThanOrEqual(36);
      }
    );

    it('enforces PRO_PAGE_TARGET = 36 and PRO_PAGE_HARD_LIMIT = 40 as constants', async () => {
      expect(PRO_PAGE_MIN_LIMIT).toBe(30);
      expect(PRO_PAGE_TARGET).toBe(36);
      expect(PRO_PAGE_HARD_LIMIT).toBe(40);
    });

    it('produces valid physical PPTX buffers > 50KB for all 3 postures', async () => {
      expect(incomeGoldenBuffer).toBeDefined();
      expect(incomeGoldenBuffer.length).toBeGreaterThan(50_000);

      expect(ownerGoldenBuffer).toBeDefined();
      expect(ownerGoldenBuffer.length).toBeGreaterThan(50_000);

      expect(devGoldenBuffer).toBeDefined();
      expect(devGoldenBuffer.length).toBeGreaterThan(50_000);
    });

    it('renders 30~40 slides in physical PPTX for each posture', async () => {
      const incomeSlides = await extractSlideTexts(incomeGoldenBuffer);
      expect(incomeSlides.length).toBeGreaterThanOrEqual(PRO_PAGE_MIN_LIMIT);
      expect(incomeSlides.length).toBeLessThanOrEqual(PRO_PAGE_HARD_LIMIT);

      const ownerSlides = await extractSlideTexts(ownerGoldenBuffer);
      expect(ownerSlides.length).toBeGreaterThanOrEqual(PRO_PAGE_MIN_LIMIT);
      expect(ownerSlides.length).toBeLessThanOrEqual(PRO_PAGE_HARD_LIMIT);

      const devSlides = await extractSlideTexts(devGoldenBuffer);
      expect(devSlides.length).toBeGreaterThanOrEqual(PRO_PAGE_MIN_LIMIT);
      expect(devSlides.length).toBeLessThanOrEqual(PRO_PAGE_HARD_LIMIT);
    });
  });

  // ==========================================================================
  // Suite 2: Five Core Chapter Structure & Roman Numeral Sequencing
  // ==========================================================================
  describe('Suite 2: 5 Core Chapter Structure & Roman Numeral Sequencing', () => {
    it('verifies front matter: Slide 1 is Cover (A01), Slide 2 is Agenda (A15)', async () => {
      const seq = buildProDeckSequence({ posture: 'income', grade: 'A' });
      expect(seq[0].archetype).toBe('A01');
      expect(seq[0].dataKey).toBe('cover');

      expect(seq[1].archetype).toBe('A15');
      expect(seq[1].dataKey).toBe('agenda');
    });

    it('contains exactly 5 Chapter Dividers (A25) in sequential order', async () => {
      const seq = buildProDeckSequence({ posture: 'income', grade: 'A' });
      const dividers = seq.filter((s) => s.archetype === 'A25');

      expect(dividers).toHaveLength(5);
      expect(dividers.map((d) => d.dataKey)).toEqual([
        'ch1_divider',
        'ch2_divider',
        'ch3_divider',
        'ch4_divider',
        'ch5_divider',
      ]);
    });

    it('verifies chapter dividers have Roman numerals I through V in strict sequential order', async () => {
      const slideTexts = await extractSlideTexts(incomeGoldenBuffer);
      const expectedChapters = ['CHAPTER 01', 'CHAPTER 02', 'CHAPTER 03', 'CHAPTER 04', 'CHAPTER 05'];
      const expectedRoman = ['I', 'II', 'III', 'IV', 'V'];
      const expectedTitles = [
        'Executive Summary',
        'Detailed Asset',
        'Comprehensive Financial',
        'Market Dynamics',
        'Due Diligence',
      ];

      const dividerSlides = expectedChapters.map((chMarker, idx) => {
        const slide = slideTexts.find((s) => s.text.includes(chMarker));
        expect(slide).toBeDefined();
        expect(slide?.text).toContain(expectedRoman[idx]);
        expect(slide?.text).toContain(expectedTitles[idx]);
        return slide!;
      });

      for (let i = 1; i < dividerSlides.length; i++) {
        expect(dividerSlides[i].slideNumber).toBeGreaterThan(dividerSlides[i - 1].slideNumber);
      }
    });

    it('verifies end matter: final slide is Closing (A10)', async () => {
      const seq = buildProDeckSequence({ posture: 'income', grade: 'A' });
      const lastSlide = seq[seq.length - 1];
      expect(lastSlide.archetype).toBe('A10');
      expect(lastSlide.dataKey).toBe('closing');
    });
  });

  // ==========================================================================
  // Suite 3: SSoT Mathematical Consistency Gate Verification
  // ==========================================================================
  describe('Suite 3: SSoT Mathematical Consistency Gate (0.00% Discrepancy Validator)', () => {
    it('[Positive] confirms 0.00% discrepancy between Ch.1 summary and Ch.3 DCF schedules', async () => {
      const purchasePrice = 25_000_000_000;
      const initialRent = 1_050_000_000;
      const capRatePct = 4.20;

      const dcf = generateMultiYearCashFlow({
        purchasePriceKrw: purchasePrice,
        initialPgiKrw: initialRent,
        exitCapRatePct: capRatePct,
        holdingPeriodYears: 10,
        rentGrowthRatePct: 2.0,
        vacancyRatePct: 3.0,
        capexReserveRatePct: 1.0,
        discountRatePct: 6.0,
      });

      const year1Noi = dcf.noi[0];
      const result = verifyMathematicalConsistency(
        {
          noi: year1Noi,
          askingPrice: purchasePrice,
          initialCapRatePct: Number(((year1Noi / purchasePrice) * 100).toFixed(2)),
        },
        {
          year1Noi,
          grossSalePrice: purchasePrice,
        }
      );

      expect(result.isConsistent).toBe(true);
      expect(result.discrepancies).toHaveLength(0);
    });

    it('[Negative Pair] flags discrepancy when Year 1 NOI differs between summary and detail', async () => {
      const result = verifyMathematicalConsistency(
        {
          noi: 1_000_000_000,
          askingPrice: 25_000_000_000,
          initialCapRatePct: 4.00,
        },
        {
          year1Noi: 1_150_000_000, // 15% discrepancy
          grossSalePrice: 25_000_000_000,
        }
      );

      expect(result.isConsistent).toBe(false);
      expect(result.discrepancies.length).toBeGreaterThan(0);
      expect(result.discrepancies[0]).toContain('NOI mismatch');
    });

    it('[Negative Pair] flags discrepancy when Asking Price differs between summary and detail', async () => {
      const result = verifyMathematicalConsistency(
        {
          noi: 1_000_000_000,
          askingPrice: 25_000_000_000,
          initialCapRatePct: 4.00,
        },
        {
          year1Noi: 1_000_000_000,
          grossSalePrice: 26_000_000_000, // 10억 discrepancy
        }
      );

      expect(result.isConsistent).toBe(false);
      expect(result.discrepancies.some((d) => d.includes('Price mismatch'))).toBe(true);
    });

    it('[Negative Pair] flags discrepancy when initial Cap Rate violates mathematical formula', async () => {
      const result = verifyMathematicalConsistency(
        {
          noi: 1_000_000_000,
          askingPrice: 25_000_000_000,
          initialCapRatePct: 6.50, // Mathematically should be 4.00%
        },
        {
          year1Noi: 1_000_000_000,
          grossSalePrice: 25_000_000_000,
        }
      );

      expect(result.isConsistent).toBe(false);
      expect(result.discrepancies.some((d) => d.includes('Cap Rate formula mismatch'))).toBe(true);
    });

    it('passes comprehensive 6-point domain consistency validator for golden inputs', async () => {
      const askingPriceKrw = 25_000_000_000;
      const annualRentKrw = 1_050_000_000;
      const totalDepositKrw = 2_000_000_000;

      const dcfModel = generateMultiYearCashFlow({
        purchasePriceKrw: askingPriceKrw,
        initialPgiKrw: annualRentKrw,
        exitCapRatePct: 4.20,
      });

      const validation = validateProImFinancialConsistency(
        {
          executiveSummary: {
            askingPriceKrw,
            year1NoiKrw: dcfModel.noi[0],
            initialCapRatePct: dcfModel.metrics.initialCapRatePct,
            totalAnnualRentKrw: annualRentKrw,
            totalDepositKrw,
          },
          detailSchedule: {
            cashFlowYear1: {
              purchasePrice: askingPriceKrw,
              noi: dcfModel.noi[0],
              pgi: annualRentKrw,
            },
            tenantRosterTotal: {
              totalAnnualRent: annualRentKrw,
              totalDeposit: totalDepositKrw,
            },
          },
        },
        0.00
      );

      expect(validation.passed).toBe(true);
      expect(validation.discrepancyCount).toBe(0);
      expect(validation.checks.every((c) => c.passed)).toBe(true);
    });
  });

  // ==========================================================================
  // Suite 4: Physical PPTX Binary Inspection & Commercial Quality Gates
  // ==========================================================================
  describe('Suite 4: Physical PPTX Binary Gate Assertions (0 Poison, 0 Evasion, 0 Mock Leaks)', () => {
    it('[Positive] assertAllPhysicalBinaryGates passes on income Pro deck', async () => {
      const inspection = await assertAllPhysicalBinaryGates(incomeGoldenBuffer);
      expect(inspection.isPass).toBe(true);
      expect(inspection.issues).toHaveLength(0);
      expect(inspection.bleedCount).toBe(0);
      expect(inspection.brokenImageCount).toBe(0);
      expect(inspection.placeholderResidueCount).toBe(0);
      expect(inspection.poisonTokenViolationCount).toBe(0);
      expect(inspection.evasivePhraseViolationCount).toBe(0);
      expect(inspection.mockLeakViolationCount).toBe(0);
      expect(inspection.personaViolationCount).toBe(0);
      expect(inspection.lexiconViolationCount).toBe(0);
      expect(inspection.legalRiskViolationCount).toBe(0);
    });

    it('[Positive] assertAllPhysicalBinaryGates passes on owner_occupied Pro deck', async () => {
      const inspection = await assertAllPhysicalBinaryGates(ownerGoldenBuffer);
      expect(inspection.isPass).toBe(true);
      expect(inspection.issues).toHaveLength(0);
      expect(inspection.poisonTokenViolationCount).toBe(0);
      expect(inspection.evasivePhraseViolationCount).toBe(0);
      expect(inspection.mockLeakViolationCount).toBe(0);
    });

    it('[Positive] assertAllPhysicalBinaryGates passes on development Pro deck', async () => {
      const inspection = await assertAllPhysicalBinaryGates(devGoldenBuffer);
      expect(inspection.isPass).toBe(true);
      expect(inspection.issues).toHaveLength(0);
      expect(inspection.poisonTokenViolationCount).toBe(0);
      expect(inspection.evasivePhraseViolationCount).toBe(0);
      expect(inspection.mockLeakViolationCount).toBe(0);
    });

    it('confirms assertZeroPoisonTokens passes without throwing on golden buffer', async () => {
      await expect(assertZeroPoisonTokens(incomeGoldenBuffer)).resolves.toBeUndefined();
    });

    it('confirms assertZeroEvasivePhrases passes without throwing on golden buffer', async () => {
      await expect(assertZeroEvasivePhrases(incomeGoldenBuffer)).resolves.toBeUndefined();
    });

    it('confirms assertZeroMockLeaks passes without throwing on golden buffer', async () => {
      await expect(assertZeroMockLeaks(incomeGoldenBuffer)).resolves.toBeUndefined();
    });
  });

  // ==========================================================================
  // Suite 5: Negative Regression Guard (Tampered Buffer Detection)
  // ==========================================================================
  describe('Suite 5: Negative Regression Guard (Tampered Buffer Detection)', () => {
    /**
     * Helper to inject text into a slide inside a PPTX buffer.
     */
    async function injectCorruptedTextIntoBuffer(
      cleanBuffer: Buffer,
      corruptedText: string,
      slideTarget = 'ppt/slides/slide3.xml'
    ): Promise<Buffer> {
      const zip = await JSZip.loadAsync(cleanBuffer);
      const slideXml = await zip.file(slideTarget)?.async('string');
      if (!slideXml) {
        throw new Error(`Target slide ${slideTarget} not found in buffer`);
      }

      // Inject text inside an XML paragraph
      const injection = `<a:p><a:r><a:rPr lang="ko-KR"/><a:t>${corruptedText}</a:t></a:r></a:p>`;
      const modifiedXml = slideXml.replace('</p:spTree>', `${injection}</p:spTree>`);

      zip.file(slideTarget, modifiedXml);
      return await zip.generateAsync({ type: 'nodebuffer' });
    }

    it('[Negative Pair] NaN poison token injection trips assertZeroPoisonTokens', async () => {
      const poisonedBuffer = await injectCorruptedTextIntoBuffer(
        incomeGoldenBuffer,
        'NOI 추정액: NaN 원'
      );

      await expect(assertZeroPoisonTokens(poisonedBuffer)).rejects.toThrow(
        /Poison token or unresolved placeholder violation detected/
      );

      await expect(assertAllPhysicalBinaryGates(poisonedBuffer)).rejects.toThrow(
        /Physical binary gate assertion failed/
      );
    });

    it('[Negative Pair] undefined poison token injection trips assertZeroPoisonTokens', async () => {
      const poisonedBuffer = await injectCorruptedTextIntoBuffer(
        incomeGoldenBuffer,
        '연간 임대료: undefined'
      );

      await expect(assertZeroPoisonTokens(poisonedBuffer)).rejects.toThrow(
        /Poison token or unresolved placeholder violation detected/
      );
    });

    it('[Negative Pair] unresolved placeholder injection trips assertZeroPoisonTokens', async () => {
      const poisonedBuffer = await injectCorruptedTextIntoBuffer(
        incomeGoldenBuffer,
        '기준 금리: {{claim.interest_rate}}%'
      );

      await expect(assertZeroPoisonTokens(poisonedBuffer)).rejects.toThrow(
        /Poison token or unresolved placeholder violation detected/
      );
    });

    it('[Negative Pair] evasive phrase injection trips assertZeroEvasivePhrases', async () => {
      const evasiveBuffer = await injectCorruptedTextIntoBuffer(
        incomeGoldenBuffer,
        '임대차 계약 만기: 추후 확인 필요'
      );

      await expect(assertZeroEvasivePhrases(evasiveBuffer)).rejects.toThrow(
        /Evasive phrase violation detected/
      );

      await expect(assertAllPhysicalBinaryGates(evasiveBuffer)).rejects.toThrow(
        /Physical binary gate assertion failed/
      );
    });

    it('[Negative Pair] mock leak injection trips assertZeroMockLeaks', async () => {
      const mockLeakBuffer = await injectCorruptedTextIntoBuffer(
        incomeGoldenBuffer,
        '테넌트: NH농협캐피탈 본사'
      );

      await expect(assertZeroMockLeaks(mockLeakBuffer)).rejects.toThrow(
        /Mock data leak violation detected/
      );

      await expect(assertAllPhysicalBinaryGates(mockLeakBuffer)).rejects.toThrow(
        /Physical binary gate assertion failed/
      );
    });
  });

  // ==========================================================================
  // Suite 6: Basic IM Isolation Verification (PAGE_HARD_LIMIT = 16)
  // ==========================================================================
  describe('Suite 6: Basic IM Isolation Verification (PAGE_HARD_LIMIT = 16 Invariant)', () => {
    it('enforces Basic IM buildDeckSequence stays strictly <= PAGE_HARD_LIMIT (16 slides)', async () => {
      const basicSeq = buildDeckSequence({
        posture: 'income',
        grade: 'A',
      });

      expect(PAGE_HARD_LIMIT).toBe(16);
      expect(basicSeq.length).toBeLessThanOrEqual(PAGE_HARD_LIMIT);
      expect(basicSeq.length).toBeGreaterThanOrEqual(7);
    });

    it('verifies Basic IM sequence contains exactly 0 A25 Chapter Dividers and 0 Pro chapter keys', async () => {
      const basicSeq = buildDeckSequence({
        posture: 'income',
        grade: 'A',
      });

      const a25Dividers = basicSeq.filter((s) => s.archetype === 'A25');
      expect(a25Dividers).toHaveLength(0);

      const proKeys = basicSeq.filter((s) =>
        /^(ch\d+_divider|dcf_schedule|opex_breakdown|sensitivity_matrix|development_budget|physical_dd|next_steps)$/.test(
          s.dataKey
        )
      );
      expect(proKeys).toHaveLength(0);
    });

    it('renders a Basic IM PPTX deck strictly within 16 slides with 0 chapter dividers', async () => {
      const basicInput: MobileImPptxInput = {
        buildingId: 'basic-isolation-test',
        posture: 'income',
        grade: 'A',
        preset: 'credeal_basic',
        isPro: false,
        doc: {
          title: '당산동 호산당빌딩 투자설명서',
          body: {
            title: '호산당빌딩',
            asking_price_manwon: 1150000,
            monthly_rent_total_krw: 35000000,
            total_deposit_manwon: 50000,
            cap_rate_percent: 3.82,
            ssot_summary: {
              address: '서울특별시 영등포구 당산동1가 72-1',
              asking_price_manwon: 1150000,
              total_deposit_manwon: 50000,
              monthly_rent_total_krw: 35000000,
              cap_rate: 3.82,
            },
          },
          sections: [
            {
              title: '물건 개요',
              markdown: '영등포구 당산동 호산당빌딩 개요입니다.',
              section_type: 'property_overview',
            },
          ],
        },
      };

      const basicRender = await renderer.render(basicInput);
      expect(basicRender.slideCount).toBeLessThanOrEqual(PAGE_HARD_LIMIT);
      expect(basicRender.slideCount).toBeGreaterThanOrEqual(7);
      expect(basicRender.slideCount).toBeLessThanOrEqual(10);

      const slideTexts = await extractSlideTexts(basicRender.buffer);
      const hasA25 = slideTexts.some((s) =>
        s.xml.includes('a25') || s.text.includes('CHAPTER 0') || s.text.includes('CHAPTER I')
      );
      expect(hasA25).toBe(false);
    });

    it('strictly forbids Grade D from publication in both Basic and Pro IM', async () => {
      expect(() => buildDeckSequence({ posture: 'income', grade: 'D' as any })).toThrow(/G30/);
      expect(() => buildProDeckSequence({ posture: 'income', grade: 'D' as any })).toThrow(/G30/);
    });
  });
});
