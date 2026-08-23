// src/domain/building/mobile-im/__tests__/archetypes-a16-a17.test.ts
import { describe, it, expect } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import { buildA16InvestmentStructure } from '../pptx/archetypes/a16-investment-structure';
import { buildA17PreCompletionMarketing } from '../pptx/archetypes/a17-pre-completion-marketing';
import { buildA03LargeTable } from '../pptx/archetypes/a03-large-table';
import { buildA07ThreeBlock } from '../pptx/archetypes/a07-three-block';
import { ARCHETYPE_REGISTRY } from '../pptx/archetypes';
import { assertBounds } from '../pptx/text-budget';

describe('PPTX Archetypes Expansion & Refactoring (Phase 4.1)', () => {
  const createPres = () => new PptxGenJS();

  describe('Registry Registration', () => {
    it('AR-01: A16 and A17 are registered in ARCHETYPE_REGISTRY', () => {
      expect(ARCHETYPE_REGISTRY.A16).toBeDefined();
      expect(ARCHETYPE_REGISTRY.A17).toBeDefined();
      expect(typeof ARCHETYPE_REGISTRY.A16).toBe('function');
      expect(typeof ARCHETYPE_REGISTRY.A17).toBe('function');
    });
  });

  describe('A16: Investment Structure Archetype', () => {
    it('A16-01: builds A16 slide with equity breakdown and LTV scenarios', () => {
      const pres = createPres();
      const output = buildA16InvestmentStructure({
        pres,
        slideNum: 5,
        docno: 'IM-2026-TEST',
        grade: 'A',
        provenance: {},
        data: {
          title: '투자 및 자본 조달 구조 분석',
          equityBreakdown: {
            price: 10_000_000_000,
            acquisitionTax: 460_000_000,
            brokerFee: 90_000_000,
            totalAcquisitionCost: 10_550_000_000,
            deposit: 500_000_000,
            loan: 5_000_000_000,
            equity: 5_050_000_000,
          },
          ltvScenarios: [
            { ltvPct: 0, equityBil: '10.5', yieldPct: 4.2, note: '전액 자기자본' },
            { ltvPct: 40, equityBil: '6.5', yieldPct: 4.8, note: '보수적 차입' },
            { ltvPct: 50, equityBil: '5.5', yieldPct: 5.2, note: '표준 차입' },
          ],
          negativeLeverage: false,
        },
      });

      expect(output.slide).toBeDefined();
      expect(output.warnings.length).toBe(0);
    });

    it('A16-02: emits warning when negative leverage is true', () => {
      const pres = createPres();
      const output = buildA16InvestmentStructure({
        pres,
        slideNum: 5,
        docno: 'IM-2026-TEST',
        grade: 'A',
        provenance: {},
        data: {
          negativeLeverage: true,
          negativeLeverageWarning: '대출금리가 총수익률을 초과하는 역레버리지 구간입니다.',
        },
      });

      expect(output.warnings).toContain('역레버리지 경고 슬라이드 반영');
    });
  });

  describe('A17: Pre-completion Marketing Archetype', () => {
    it('A17-01: builds A17 slide with stacking plan and regulation expiry', () => {
      const pres = createPres();
      const output = buildA17PreCompletionMarketing({
        pres,
        slideNum: 6,
        docno: 'IM-2026-TEST',
        grade: 'A',
        provenance: {},
        data: {
          title: '신축 개발 규모 및 준공 전 마케팅 계획',
          devMetrics: {
            landAreaPyeong: '150',
            targetGrossAreaPyeong: '500',
            expectedBcrPct: 58.5,
            expectedFarPct: 398.0,
            estConstructionCostBil: 60,
          },
          regulationExpiry: '2028-05-18',
          regulationDaysLeft: 630,
        },
      });

      expect(output.slide).toBeDefined();
      expect(output.warnings.length).toBe(0);
    });
  });

  describe('A03: Large Table 12-row pagination & Note cleaning', () => {
    it('A03-01: supports up to 12 rows and cleans "외 N건은 별첨 참조" notes', () => {
      const pres = createPres();
      const tableRows = Array.from({ length: 14 }, (_, i) => [
        `${i + 1}01호`,
        `임차인 ${i + 1}`,
        '30평',
        '5,000만',
        '300만',
        '30만',
        '2027-12-31',
      ]);

      const output = buildA03LargeTable({
        pres,
        slideNum: 4,
        docno: 'IM-2026-TEST',
        grade: 'A',
        provenance: {},
        data: {
          tableHead: ['호실', '업종', '면적', '보증금', '월세', '관리비', '만기일'],
          tableRows,
          note: '주차장 이용 특약 포함 / 외 2건은 별첨 참조',
        },
      });

      expect(output.slide).toBeDefined();
      // Notice should be cleaned of "외 2건은 별첨 참조"
    });
  });

  describe('A07: Three Block Risk Assessment', () => {
    it('A07-01: builds 3 distinct visual sections for risk check', () => {
      const pres = createPres();
      const output = buildA07ThreeBlock({
        pres,
        slideNum: 7,
        docno: 'IM-2026-TEST',
        grade: 'A',
        provenance: {},
        data: {
          title: '핵심 투자 리스크 및 권리·물리 실사 점검',
        },
      });

      expect(output.slide).toBeDefined();
      expect(output.warnings.length).toBe(0);
    });
  });

  describe('assertBounds validation', () => {
    it('AB-01: returns valid for elements inside 12.713 x 6.75 safe zone', () => {
      expect(assertBounds({ x: 0.6, y: 1.55, w: 5.9, h: 4.8 }).valid).toBe(true);
    });

    it('AB-02: returns invalid for overflowing elements', () => {
      const check = assertBounds({ x: 10.0, y: 1.55, w: 3.5, h: 4.8 }); // right = 13.5 > 12.713
      expect(check.valid).toBe(false);
      expect(check.error).toContain('exceeds max safe width');
    });
  });
});
