import { describe, it, expect } from 'vitest';
import {
  buildProDeckSequence,
  PRO_PAGE_HARD_LIMIT,
  PRO_PAGE_MIN_LIMIT,
} from '@/domain/building/mobile-im/pptx/pro-deck-sequencer';
import {
  buildDeckSequence,
  PAGE_HARD_LIMIT,
} from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { buildA25ChapterDivider } from '@/domain/building/mobile-im/pptx/archetypes/a25-chapter-divider';
import { bindSectionData, bindProImChapterData } from '@/domain/building/mobile-im/pptx/data-binder';
import {
  generateMultiYearCashFlow,
  generate2DSensitivityMatrix,
  generateDevelopmentFeasibilityBudget,
  validateProImFinancialConsistency,
  chunkTenantRoster,
  calculateProWALE,
  type InstitutionalTenantRosterItem,
} from '@/domain/building/im-core';
import { withThemeIsolation } from '@/domain/building/mobile-im/pptx/imlib';
import { PPTX_PRESET_TEMPLATES } from '@/domain/building/mobile-im/pptx/pptx-theme';
import type { InvestmentPosture } from '@/domain/ontology';

describe('Milestone 2: Pro IM Chapter Pipeline & Deck Layout Engine Suite', () => {
  const defaultProInput = {
    posture: 'income' as InvestmentPosture,
    grade: 'B' as const,
    dataAvailability: {
      hasRentRoll: true,
      hasStackingPlan: true,
      hasPhotos: true,
      hasCadastralMap: true,
      hasComparables: true,
      hasCommercialDistrict: true,
    },
  };

  // ==========================================================================
  // 1. Pro IM Slide Count & Page Limits
  // ==========================================================================
  describe('Slide Count & Hard Limits', () => {
    it('generates 30+ slides meeting PRO_PAGE_MIN_LIMIT and not exceeding PRO_PAGE_HARD_LIMIT', async () => {
      const seq = buildProDeckSequence(defaultProInput);

      expect(seq.length).toBeGreaterThanOrEqual(PRO_PAGE_MIN_LIMIT);
      expect(seq.length).toBeLessThanOrEqual(PRO_PAGE_HARD_LIMIT);
      expect(seq.length).toBe(36);
    });

    it('enforces PRO_PAGE_HARD_LIMIT = 40 as an invariant constant', async () => {
      expect(PRO_PAGE_HARD_LIMIT).toBe(40);
      expect(PRO_PAGE_MIN_LIMIT).toBe(30);
    });
  });

  // ==========================================================================
  // 2. 5 Core Chapters & A25 Dividers
  // ==========================================================================
  describe('5 Core Chapters Structure & A25 Dividers', () => {
    it('contains all 5 core chapter divider slides using A25 archetype', async () => {
      const seq = buildProDeckSequence(defaultProInput);

      const dividers = seq.filter(s => s.archetype === 'A25');
      expect(dividers.length).toBe(5);

      const dividerKeys = dividers.map(s => s.dataKey);
      expect(dividerKeys).toEqual([
        'ch1_divider',
        'ch2_divider',
        'ch3_divider',
        'ch4_divider',
        'ch5_divider',
      ]);

      expect(dividers[0].kicker).toBe('CHAPTER 01');
      expect(dividers[1].kicker).toBe('CHAPTER 02');
      expect(dividers[2].kicker).toBe('CHAPTER 03');
      expect(dividers[3].kicker).toBe('CHAPTER 04');
      expect(dividers[4].kicker).toBe('CHAPTER 05');
    });

    it('enforces chapter slide count minimums (5, 6, 7, 6, 6)', async () => {
      const seq = buildProDeckSequence(defaultProInput);
      const dataKeys = seq.map(s => s.dataKey);

      // Chapter indices based on divider positions
      const ch1Idx = dataKeys.indexOf('ch1_divider');
      const ch2Idx = dataKeys.indexOf('ch2_divider');
      const ch3Idx = dataKeys.indexOf('ch3_divider');
      const ch4Idx = dataKeys.indexOf('ch4_divider');
      const ch5Idx = dataKeys.indexOf('ch5_divider');
      const closingIdx = dataKeys.indexOf('closing');

      expect(ch1Idx).toBeGreaterThan(0);
      expect(ch2Idx).toBeGreaterThan(ch1Idx);
      expect(ch3Idx).toBeGreaterThan(ch2Idx);
      expect(ch4Idx).toBeGreaterThan(ch3Idx);
      expect(ch5Idx).toBeGreaterThan(ch4Idx);

      // Slide counts per chapter (divider inclusive)
      const ch1Count = ch2Idx - ch1Idx;
      const ch2Count = ch3Idx - ch2Idx;
      const ch3Count = ch4Idx - ch3Idx;
      const ch4Count = ch5Idx - ch4Idx;
      const ch5Count = closingIdx - ch5Idx;

      expect(ch1Count).toBeGreaterThanOrEqual(5); // Ch1: Executive Summary >= 5 (Actual: 6)
      expect(ch2Count).toBeGreaterThanOrEqual(6); // Ch2: Asset Specs >= 6 (Actual: 8)
      expect(ch3Count).toBeGreaterThanOrEqual(7); // Ch3: Financial Modeling >= 7 (Actual: 7)
      expect(ch4Count).toBeGreaterThanOrEqual(6); // Ch4: Market Dynamics >= 6 (Actual: 6)
      expect(ch5Count).toBeGreaterThanOrEqual(6); // Ch5: DD Annexes >= 6 (Actual: 6)
    });

    it('includes essential Front Matter (Cover, Agenda) and End Matter (Closing)', async () => {
      const seq = buildProDeckSequence(defaultProInput);
      const dataKeys = seq.map(s => s.dataKey);

      // Front Matter
      expect(dataKeys[0]).toBe('cover');
      expect(seq[0].archetype).toBe('A01');

      expect(dataKeys[1]).toBe('agenda');
      expect(seq[1].archetype).toBe('A15');

      // End Matter
      const lastSlide = seq[seq.length - 1];
      expect(lastSlide.dataKey).toBe('closing');
      expect(lastSlide.archetype).toBe('A10');
    });
  });

  // ==========================================================================
  // 3. Multi-Page Tenant Roster Chunking Integration
  // ==========================================================================
  describe('Multi-Page Tenant Roster Chunking', () => {
    it('generates standard 2-part rent roll for standard portfolios (<= 12 tenants)', async () => {
      const seq = buildProDeckSequence({
        ...defaultProInput,
        data: {
          floor_leases: [
            { floor: '1F', unitNumber: '101호', tenantName: 'Tenant 1', industry: '일반사무', leasedAreaM2: 100, leasedAreaPyeong: 30.25, depositKrw: 50000000, monthlyRentKrw: 3000000, monthlyMaintenanceKrw: 500000, leaseStartDate: '2023-01-01', leaseEndDate: '2027-01-01', statutoryProtection10Y: true },
            { floor: '2F', unitNumber: '201호', tenantName: 'Tenant 2', industry: '일반사무', leasedAreaM2: 100, leasedAreaPyeong: 30.25, depositKrw: 50000000, monthlyRentKrw: 3000000, monthlyMaintenanceKrw: 500000, leaseStartDate: '2023-01-01', leaseEndDate: '2027-01-01', statutoryProtection10Y: true },
          ],
        },
      });

      const keys = seq.map(s => s.dataKey);
      expect(keys).toContain('rentRollPart1');
      expect(keys).toContain('rentRollPart2');
    });

    it('dynamically generates 3+ tenant roster slides for large tenant count (> 24 tenants)', async () => {
      const largePortfolio: InstitutionalTenantRosterItem[] = Array.from({ length: 30 }, (_, i) => ({
        floor: `${i + 1}F`,
        unitNumber: `${i + 1}01호`,
        tenantName: `임차인 ${i + 1}`,
        industry: '일반사무',
        leasedAreaM2: 200,
        leasedAreaPyeong: 60.5,
        depositKrw: 100000000,
        monthlyRentKrw: 5000000,
        monthlyMaintenanceKrw: 1000000,
        leaseStartDate: '2023-01-01',
        leaseEndDate: '2026-12-31',
        statutoryProtection10Y: true,
      }));

      const chunks = chunkTenantRoster(largePortfolio, 12);
      expect(chunks.length).toBe(3); // 30 tenants / 12 per page = 3 pages (12, 12, 6)

      const seq = buildProDeckSequence({
        ...defaultProInput,
        data: {
          floor_leases: largePortfolio,
        },
      });

      const keys = seq.map(s => s.dataKey);
      expect(keys).toContain('rentRollPart1');
      expect(keys).toContain('rentRollPart2');
      expect(keys).toContain('rentRollPart3');
      expect(seq.length).toBeLessThanOrEqual(PRO_PAGE_HARD_LIMIT);
    });

    it('calculates running subtotals and grand totals correctly across roster chunks', async () => {
      const sampleTenants: InstitutionalTenantRosterItem[] = [
        { floor: '1F', unitNumber: '101호', tenantName: '카페', industry: 'F&B', leasedAreaM2: 100, leasedAreaPyeong: 30, depositKrw: 100000000, monthlyRentKrw: 10000000, monthlyMaintenanceKrw: 2000000, leaseStartDate: '2023-01-01', leaseEndDate: '2028-01-01', statutoryProtection10Y: true },
        { floor: '2F', unitNumber: '201호', tenantName: '학원', industry: '교육', leasedAreaM2: 200, leasedAreaPyeong: 60, depositKrw: 200000000, monthlyRentKrw: 15000000, monthlyMaintenanceKrw: 3000000, leaseStartDate: '2022-01-01', leaseEndDate: '2027-01-01', statutoryProtection10Y: true },
        { floor: '3F', unitNumber: '301호', tenantName: '병원', industry: '의료', leasedAreaM2: 300, leasedAreaPyeong: 90, depositKrw: 300000000, monthlyRentKrw: 20000000, monthlyMaintenanceKrw: 4000000, leaseStartDate: '2021-01-01', leaseEndDate: '2026-01-01', statutoryProtection10Y: true },
      ];

      const chunks = chunkTenantRoster(sampleTenants, 2);
      expect(chunks.length).toBe(2);

      // Chunk 1 (2 items)
      expect(chunks[0].subtotal.tenantCount).toBe(2);
      expect(chunks[0].subtotal.leasedAreaM2).toBe(300);
      expect(chunks[0].subtotal.depositKrw).toBe(300000000);
      expect(chunks[0].subtotal.monthlyRentKrw).toBe(25000000);

      // Chunk 2 (1 item, with grandTotal)
      expect(chunks[1].subtotal.tenantCount).toBe(1);
      expect(chunks[1].grandTotal).toBeDefined();
      expect(chunks[1].grandTotal?.tenantCount).toBe(3);
      expect(chunks[1].grandTotal?.leasedAreaM2).toBe(600);
      expect(chunks[1].grandTotal?.depositKrw).toBe(600000000);
      expect(chunks[1].grandTotal?.monthlyRentKrw).toBe(45000000);
    });
  });

  // ==========================================================================
  // 4. Posture Specific Variations & Development Feasibility
  // ==========================================================================
  describe('Posture Specific Variations', () => {
    it('includes 5-Tier Development Feasibility Budget for development posture', async () => {
      const devSeq = buildProDeckSequence({
        ...defaultProInput,
        posture: 'development',
      });

      const keys = devSeq.map(s => s.dataKey);
      expect(keys).toContain('development_budget');
      expect(keys).not.toContain('debt_financing');
      expect(devSeq.length).toBeGreaterThanOrEqual(PRO_PAGE_MIN_LIMIT);
      expect(devSeq.length).toBeLessThanOrEqual(PRO_PAGE_HARD_LIMIT);
    });

    it('includes Capital & Debt financing for income posture', async () => {
      const incomeSeq = buildProDeckSequence({
        ...defaultProInput,
        posture: 'income',
      });

      const keys = incomeSeq.map(s => s.dataKey);
      expect(keys).toContain('debt_financing');
      expect(keys).not.toContain('development_budget');
    });

    it('generates valid 30+ slide decks across all 5 investment postures', async () => {
      const postures: InvestmentPosture[] = [
        'income',
        'development',
        'owner_occupied',
        'trading',
        'operating',
      ];

      for (const posture of postures) {
        const seq = buildProDeckSequence({
          ...defaultProInput,
          posture,
        });

        expect(seq.length, `Posture ${posture} slide count`).toBeGreaterThanOrEqual(PRO_PAGE_MIN_LIMIT);
        expect(seq.length, `Posture ${posture} slide count`).toBeLessThanOrEqual(PRO_PAGE_HARD_LIMIT);

        // All postures must contain the 5 core chapter dividers
        const dividers = seq.filter(s => s.archetype === 'A25');
        expect(dividers.length, `Posture ${posture} dividers`).toBe(5);
      }
    });
  });

  // ==========================================================================
  // 5. Basic IM Isolation & Immutability (Rule 47 & Milestone 2 Contract)
  // ==========================================================================
  describe('Basic IM Isolation & Immutability', () => {
    it('strictly preserves PAGE_HARD_LIMIT = 16 for Basic IM', async () => {
      expect(PAGE_HARD_LIMIT).toBe(16);
    });

    it('Basic IM sequence continues to produce strictly <= 16 slides (typically 7-9)', async () => {
      const basicSeq = buildDeckSequence({
        posture: 'income',
        preset: 'credeal_basic',
        grade: 'B',
        dataAvailability: {
          hasRentRoll: true,
          hasStackingPlan: true,
          hasPhotos: true,
          hasCadastralMap: true,
        },
      });

      expect(basicSeq.length).toBeLessThanOrEqual(PAGE_HARD_LIMIT);
      expect(basicSeq.length).toBe(9);

      const keys = basicSeq.map(s => s.dataKey);
      // Basic IM must NEVER contain Pro chapter dividers
      expect(keys).not.toContain('ch1_divider');
      expect(keys).not.toContain('ch2_divider');
      expect(keys).not.toContain('ch3_divider');
      expect(keys).not.toContain('ch4_divider');
      expect(keys).not.toContain('ch5_divider');

      // Basic IM must NEVER contain Pro financial model slides
      expect(keys).not.toContain('dcf_schedule');
      expect(keys).not.toContain('sensitivity_matrix');
      expect(keys).not.toContain('vacancy_stress');
      expect(keys).not.toContain('development_budget');
    });

    it('routes to Pro sequence only when isPro / proMode is requested', async () => {
      const proViaInput = buildDeckSequence({
        posture: 'income',
        grade: 'B',
        isPro: true,
      });

      expect(proViaInput.length).toBeGreaterThanOrEqual(PRO_PAGE_MIN_LIMIT);
      expect(proViaInput.length).toBe(36);
    });
  });

  // ==========================================================================
  // 6. A25 Chapter Divider Layout Physics & Rendering Archetype
  // ==========================================================================
  describe('A25 Chapter Divider Archetype', () => {
    it('builds an institutional chapter divider slide within 16:9 widescreen layout bounds', async () => {
      const addedShapes: any[] = [];
      const addedTexts: any[] = [];

      const mockSlide: any = {
        background: null,
        addShape: (shape: any, opts: any) => {
          addedShapes.push({ shape, opts });
          return mockSlide;
        },
        addText: (text: any, opts: any) => {
          addedTexts.push({ text, opts });
          return mockSlide;
        },
      };

      const mockPptx: any = {
        addSlide: () => mockSlide,
        ShapeType: {
          rect: 'rect',
          line: 'line',
        },
      };

      const mockTheme: any = {
        primaryColor: '#0A1128',
        accentColor: '#C5A059',
        fontHead: 'Pretendard SemiBold',
        fontBody: 'Pretendard',
      };

      const sectionData = {
        title: 'Quantitative Financial Modeling',
        kicker: 'CHAPTER 03',
        subtitle: '10개년 DCF 스케줄, OPEX 세부 내역, Exit Cap 감정평가 및 2D 민감도',
        romanNumeral: 'III',
        chapterNumber: 3,
        topics: [
          '03.01  10개년 할인현금흐름(DCF) 추정 스케줄 (10-Yr Cash Flow)',
          '03.02  수익 및 운영비(OPEX) 세부 항목 분석 (OPEX Breakdown)',
          '03.03  Exit Cap Rate 및 매각 가치 환원 산정 (Terminal Valuation)',
          '03.04  2차원 민감도 분석: Exit Cap vs 할인율 (2D Sensitivity Matrix)',
        ],
      };

      buildA25ChapterDivider({
        pres: mockPptx,
        slideNum: 3,
        docno: 'TEST-001',
        data: sectionData as any,
        grade: 'B',
        provenance: {},
      });

      // Verify background is dark institutional navy/slate
      expect(mockSlide.background).toBeDefined();
      expect(mockSlide.background.fill).toBeDefined();

      // Verify Roman numeral was rendered
      const romanText = addedTexts.find(t => t.text === 'III');
      expect(romanText).toBeDefined();

      // Verify title was rendered
      const titleText = addedTexts.find(t => t.text === 'Quantitative Financial Modeling');
      expect(titleText).toBeDefined();

      // Verify zero bleed & layout physics: all added text boxes within 13.333" x 7.5"
      for (const item of addedTexts) {
        const x = Number(item.opts.x) || 0;
        const y = Number(item.opts.y) || 0;
        const w = Number(item.opts.w) || 0;
        const h = Number(item.opts.h) || 0;

        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(13.34); // slight floating point tolerance
        expect(y + h).toBeLessThanOrEqual(7.51);
      }
    });

    it('defends slide background under institutional_slate (#2B2F3E) and credeal_basic (#0A1620)', async () => {
      const createMockPptx = () => {
        const slide = {
          background: {} as any,
          addShape: () => {},
          addText: () => {},
        };
        return {
          addSlide: () => slide,
          slide,
        };
      };

      // Under institutional_slate
      await withThemeIsolation(PPTX_PRESET_TEMPLATES.institutional_slate, async () => {
        const mockPptx = createMockPptx();
        buildA25ChapterDivider({
          pres: mockPptx as any,
          slideNum: 3,
          docno: 'TEST-001',
          data: { title: 'Test Slate', romanNumeral: 'I' },
          grade: 'B',
          provenance: {},
        });
        expect(mockPptx.slide.background.fill).toBe('2B2F3E');
      });

      // Under credeal_basic
      await withThemeIsolation(PPTX_PRESET_TEMPLATES.credeal_basic, async () => {
        const mockPptx = createMockPptx();
        buildA25ChapterDivider({
          pres: mockPptx as any,
          slideNum: 3,
          docno: 'TEST-001',
          data: { title: 'Test Basic', romanNumeral: 'I' },
          grade: 'B',
          provenance: {},
        });
        expect(mockPptx.slide.background.fill).toBe('0A1620');
      });
    });
  });

  // ==========================================================================
  // 7. Data Binder Pro IM Integration
  // ==========================================================================
  describe('Data Binder Pro IM Integration', () => {
    it('populates all Pro chapter data keys without poison tokens', async () => {
      const mockDoc = {
        title: '강남구 역삼동 프라임 오피스 타워',
        body: {
          asking_price_krw: 50_000_000_000,
          annual_rent_krw: 2_200_000_000,
          total_deposit_krw: 3_500_000_000,
          cap_rate_percent: 4.40,
          total_gross_area_py: 1500,
          land_area_py: 220,
        },
      };

      const bound = bindProImChapterData(mockDoc, {}, {});

      // Verify divider sections
      expect(bound['ch1_divider']).toBeDefined();
      expect(bound['ch2_divider']).toBeDefined();
      expect(bound['ch3_divider']).toBeDefined();
      expect(bound['ch4_divider']).toBeDefined();
      expect(bound['ch5_divider']).toBeDefined();

      // Verify financial modeling sections
      expect(bound['dcf_schedule']).toBeDefined();
      expect(bound['opex_breakdown']).toBeDefined();
      expect(bound['dcf_valuation']).toBeDefined();
      expect(bound['sensitivity_matrix']).toBeDefined();
      expect(bound['vacancy_stress']).toBeDefined();
      expect(bound['development_budget']).toBeDefined();

      // Check for poison tokens in bound data
      const jsonString = JSON.stringify(bound);
      expect(jsonString).not.toContain('NaN');
      expect(jsonString).not.toContain('undefined');
      expect(jsonString).not.toContain('[object Object]');
    });

    it('verifies Defect A fix: passes raw WON to cash_flow_snapshot and dcf_valuation', async () => {
      const askingPriceKrw = 25_000_000_000;
      const annualRentKrw = 1_050_000_000;
      const totalDepositKrw = 2_000_000_000;

      const bound = bindProImChapterData({
        body: {
          asking_price_krw: askingPriceKrw,
          annual_rent_krw: annualRentKrw,
          total_deposit_krw: totalDepositKrw,
        },
      }, {}, {});

      // Raw WON, not manwon
      expect(bound['cash_flow_snapshot'].annualRent).toBe(annualRentKrw);
      expect(bound['cash_flow_snapshot'].askingPrice).toBe(askingPriceKrw);
      expect(bound['cash_flow_snapshot'].totalDeposit).toBe(totalDepositKrw);

      expect(bound['dcf_valuation'].annualRent).toBe(annualRentKrw);
      expect(bound['dcf_valuation'].askingPrice).toBe(askingPriceKrw);
      expect(bound['dcf_valuation'].totalDeposit).toBe(totalDepositKrw);
    });

    it('verifies Defect B fix: debt_financing supplies raw WON equityBreakdown and ltvPct in ltvScenarios', async () => {
      const askingPriceKrw = 25_000_000_000;
      const totalDepositKrw = 2_000_000_000;

      const bound = bindProImChapterData({
        body: {
          asking_price_krw: askingPriceKrw,
          total_deposit_krw: totalDepositKrw,
        },
      }, {}, {});

      const debt = bound['debt_financing'];
      expect(debt).toBeDefined();

      // Raw WON in equityBreakdown
      expect(debt.equityBreakdown.price).toBe(askingPriceKrw);
      expect(debt.equityBreakdown.deposit).toBe(totalDepositKrw);
      expect(debt.equityBreakdown.loan).toBe(Math.round(askingPriceKrw * 0.5));
      expect(debt.equityBreakdown.totalAcquisitionCost).toBeGreaterThan(askingPriceKrw);

      // Structured ltvScenarios with ltvPct (preventing "LTV undefined%")
      expect(Array.isArray(debt.ltvScenarios)).toBe(true);
      expect(debt.ltvScenarios).toBeDefined();
      for (const scenario of debt.ltvScenarios!) {
        expect(typeof scenario.ltvPct).toBe('number');
        expect(typeof scenario.equityBil).toBe('string');
        expect(typeof scenario.yieldPct).toBe('string');
        expect(typeof scenario.note).toBe('string');
        expect(scenario.ltvPct).not.toBeUndefined();
      }
    });

    it('verifies Defect C fix: ownership provides ownershipRows as 2D string matrix without [object Object]', async () => {
      const bound = bindProImChapterData({
        body: {},
      }, {}, {});

      const ownership = bound['ownership'];
      expect(ownership).toBeDefined();
      expect(Array.isArray(ownership.ownershipRows)).toBe(true);

      // Must be 2D matrix of strings, NOT array of objects
      expect(ownership.ownershipRows).toBeDefined();
      for (const row of ownership.ownershipRows!) {
        expect(Array.isArray(row)).toBe(true);
        for (const cell of row) {
          expect(typeof cell).toBe('string');
          expect(cell).not.toBe('[object Object]');
        }
      }
    });

    it('verifies Defect D fix: binds multi-page tenant rosters dynamically beyond 2 parts with running subtotals', async () => {
      const largePortfolio: InstitutionalTenantRosterItem[] = Array.from({ length: 30 }, (_, i) => ({
        floor: `${i + 1}F`,
        unitNumber: `${i + 1}01호`,
        tenantName: `임차인 ${i + 1}`,
        industry: '일반사무',
        leasedAreaM2: 200,
        leasedAreaPyeong: 60.5,
        depositKrw: 100000000,
        monthlyRentKrw: 5000000,
        monthlyMaintenanceKrw: 1000000,
        leaseStartDate: '2023-01-01',
        leaseEndDate: '2026-12-31',
        statutoryProtection10Y: true,
      }));

      const bound = bindProImChapterData({
        body: {
          floor_leases: largePortfolio,
        },
      }, {}, {});

      // 30 tenants with 12 per page = 3 parts
      expect(bound['rentRollPart1']).toBeDefined();
      expect(bound['rentRollPart2']).toBeDefined();
      expect(bound['rentRollPart3']).toBeDefined();

      expect(bound['rentRollPart1'].pageIndex).toBe(1);
      expect(bound['rentRollPart1'].pageTotal).toBe(3);

      expect(bound['rentRollPart3'].pageIndex).toBe(3);
      expect(bound['rentRollPart3'].pageTotal).toBe(3);

      // Running subtotal in Part 1
      const p1Rows = bound['rentRollPart1'].tableRows;
      const p1LastRow = p1Rows[p1Rows.length - 1];
      expect(p1LastRow[0]).toBe('소계');

      // Final part has both running subtotal and Grand Total ('합계')
      const p3Rows = bound['rentRollPart3'].tableRows;
      const p3GrandTotalRow = p3Rows[p3Rows.length - 1];
      expect(p3GrandTotalRow[0]).toBe('합계');
      expect(p3GrandTotalRow[2]).toBe('30개사');
    });

    it('verifies mathematical consistency between executive summary and DCF schedule', async () => {
      const askingPriceKrw = 30_000_000_000;
      const annualRentKrw = 1_500_000_000;
      const totalDepositKrw = 2_000_000_000;

      const dcf = generateMultiYearCashFlow({
        purchasePriceKrw: askingPriceKrw,
        initialPgiKrw: annualRentKrw,
        exitCapRatePct: 4.5,
      });

      const validation = validateProImFinancialConsistency({
        executiveSummary: {
          askingPriceKrw,
          year1NoiKrw: dcf.noi[0],
          initialCapRatePct: dcf.metrics.initialCapRatePct,
          totalAnnualRentKrw: annualRentKrw,
          totalDepositKrw,
        },
        detailSchedule: {
          cashFlowYear1: {
            purchasePrice: askingPriceKrw,
            noi: dcf.noi[0],
            pgi: annualRentKrw,
          },
          tenantRosterTotal: {
            totalAnnualRent: annualRentKrw,
            totalDeposit: totalDepositKrw,
          },
        },
      });

      expect(validation.passed).toBe(true);
      expect(validation.discrepancyCount).toBe(0);
    });
  });
});
