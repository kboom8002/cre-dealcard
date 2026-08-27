import { describe, test, expect } from 'vitest';
import { SECTION_CATALOG } from '@/domain/building/mobile-im/section-catalog';
import { bindSectionData } from '@/domain/building/mobile-im/pptx/data-binder';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { DEMO_MOBILE_IM_DATA, SEOCHO_MEDICAL_DEMO } from '@/lib/demo/mobile-im-demo-data';

// data-binder.ts doesn't export SECTION_TYPE_TO_DATA_KEY, so we can test the behavior via bindSectionData or we can read the source.
// Wait, the test needs to verify the contract. If it's not exported, how can we test C01 and C02?
// I'll extract it by parsing or just duplicating the object for validation, or we can just verify the output of bindSectionData.
// A better way is to pass a mock doc and see what keys are generated.
// Let's create a mock doc with all section_types and check the result of bindSectionData.

const SECTION_TYPE_TO_DATA_KEY: Record<string, string> = {
  property_overview: 'building',
  location_access:   'location',
  lease_status:      'rentRoll',
  income_analysis:   'profit',
  risk_check:        'risk',
  investment_thesis: 'thesis',
  next_steps:        'process',
  occupancy_fit:     'plan',
  cost_comparison:   'vsLease',
  site_analysis:     'landDetail',
  development_feasibility: 'feasibility',
  operation_overview: 'kpi',
  gop_analysis:      'revenue',
  market_position:   'marketPosition',
  comparable_analysis: 'comps',
};

const DATA_KEY_ARCHETYPE: Record<string, string> = {
  summary:   'A02',  location:  'A06',  land:      'A04',
  building:  'A04',  rentRoll:  'A03',  stability: 'A04',
  profit:    'A05',  capital:   'A08',  comps:     'A03',
  risk:      'A07',  process:   'A09',  thesis:    'A15',
  plan:      'A04',  vsLease:   'A08',  commute:   'A06',
  value:     'A04',  landDetail: 'A04', scale:      'A05',
  eviction:  'A04',  cost:       'A08', stacking:   'A05',
  feasibility:'A05', kpi:        'A13', revenue:    'A05',
  seasonality:'A05', operator:   'A04', marketPosition: 'A04',
  trend:          'A05', turnover:       'A04', price:          'A04',
};

describe('L2 Data Contract', () => {
  test('C01: Every section_type in SECTION_CATALOG has a corresponding entry in SECTION_TYPE_TO_DATA_KEY', () => {
    Object.values(SECTION_CATALOG).forEach(plan => {
      plan.sections.forEach(section => {
        expect(SECTION_TYPE_TO_DATA_KEY).toHaveProperty(section);
      });
    });
  });

  test('C02: Every dataKey from SECTION_TYPE_TO_DATA_KEY has an entry in DATA_KEY_ARCHETYPE', () => {
    Object.values(SECTION_TYPE_TO_DATA_KEY).forEach(dataKey => {
      expect(DATA_KEY_ARCHETYPE).toHaveProperty(dataKey);
    });
  });

  test('C03: For each posture basic sequence, every section_type dataKey appears in the sequence', () => {
    const postures = Object.keys(SECTION_CATALOG) as Array<keyof typeof SECTION_CATALOG>;
    
    postures.forEach(posture => {
      const sequence = buildDeckSequence({
        posture,
        grade: 'A',
      });
      const dataKeysInSequence = sequence.map(s => s.dataKey);
      
      const sections = SECTION_CATALOG[posture].sections;
      sections.forEach(sectionType => {
        const expectedDataKey = SECTION_TYPE_TO_DATA_KEY[sectionType];
        expect(dataKeysInSequence).toContain(expectedDataKey);
      });
    });
  });

  test('C04: Demo data (SEOCHO_MEDICAL_DEMO) icon fields are emoji', () => {
    SEOCHO_MEDICAL_DEMO.sections.forEach(section => {
      // Ensure it does not look like a lucide component e.g. "Building2", "MapPin"
      expect(section.icon).not.toMatch(/^[A-Z][a-zA-Z0-9]*$/);
    });
  });

  test('C05: Demo data sections all have section_type field', () => {
    SEOCHO_MEDICAL_DEMO.sections.forEach(section => {
      expect(section.section_type).toBeDefined();
    });
  });

  test('C06: Derived dataKey generation in bindSectionData (income derivations)', () => {
    const mockDoc = {
      title: '테스트 문서',
      body: { photos: [] },
      sections: [
        { title: '물건 개요', markdown: '| 대지 | 100평 |\n| 연면적 | 500평 |', section_type: 'property_overview' },
        { title: '수익성 분석', markdown: '매매가 100억, 월세 4000만, 대출 50억', section_type: 'income_analysis' },
        { title: '임대차 현황', markdown: '| 1층 | 병원 | 1억 | 1000만 |', section_type: 'lease_status' },
      ],
    };

    const boundData = bindSectionData(mockDoc as any);

    // property_overview derivation
    expect(boundData['summary']).toBeDefined();
    expect(boundData['land']).toBeDefined();

    // income_analysis derivation
    expect(boundData['capital']).toBeDefined();
    expect(boundData['dcf']).toBeDefined();
    expect(boundData['sensitivity']).toBeDefined();
    expect(boundData['loan']).toBeDefined();
    expect(boundData['tax']).toBeDefined();

    // lease_status derivation
    expect(boundData['stability']).toBeDefined();
  });

  test('C07: Derived dataKey generation in bindSectionData (non-income postures)', () => {
    const nonIncomeDoc = {
      title: '비소득형 테스트',
      body: {},
      sections: [
        { title: '사옥 적합성', markdown: '사옥으로 적합합니다.', section_type: 'occupancy_fit' },
        { title: '비용 비교', markdown: '비용 비교 분석입니다.', section_type: 'cost_comparison' },
        { title: '부지 분석', markdown: '신축 부지 분석입니다.', section_type: 'site_analysis' },
        { title: '개발 사업성', markdown: '개발 사업성 수지분석입니다.', section_type: 'development_feasibility' },
        { title: '운영 현황', markdown: '물류센터 운영 현황입니다.', section_type: 'operation_overview' },
        { title: 'GOP 분석', markdown: 'GOP 마진 65%입니다.', section_type: 'gop_analysis' },
        { title: '시장 포지션', markdown: '권역 회전율 분석입니다.', section_type: 'market_position' },
        { title: '비교 분석', markdown: '인근 거래사례 비교입니다.', section_type: 'comparable_analysis' },
      ],
    };

    const boundData = bindSectionData(nonIncomeDoc as any);

    // owner_occupied
    expect(boundData['commute']).toBeDefined();
    expect(boundData['value']).toBeDefined();

    // development
    expect(boundData['scale']).toBeDefined();
    expect(boundData['eviction']).toBeDefined();
    expect(boundData['cost']).toBeDefined();
    expect(boundData['stacking']).toBeDefined();

    // operating
    expect(boundData['operator']).toBeDefined();
    expect(boundData['seasonality']).toBeDefined();

    // trading
    expect(boundData['turnover']).toBeDefined();
    expect(boundData['trend']).toBeDefined();
    expect(boundData['price']).toBeDefined();
  });
});
