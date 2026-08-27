import { describe, test, expect } from 'vitest';
import { SECTION_CATALOG } from '@/domain/building/mobile-im/section-catalog';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { DEMO_MOBILE_IM_DATA } from '@/lib/demo/mobile-im-demo-data';

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

describe('L4 Cross-Format Parity', () => {
  test('XF01: For each posture, every section in SECTION_CATALOG has its dataKey in the basic deck sequence', () => {
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

  test('XF02: Basic tier deck sequences do NOT contain dcf or sensitivity dataKeys', () => {
    const postures = Object.keys(SECTION_CATALOG) as Array<keyof typeof SECTION_CATALOG>;
    
    postures.forEach(posture => {
      const sequence = buildDeckSequence({
        posture,
        grade: 'A',
      });
      const dataKeysInSequence = sequence.map(s => s.dataKey);
      
      expect(dataKeysInSequence).not.toContain('dcf');
      expect(dataKeysInSequence).not.toContain('sensitivity');
    });
  });

  test('XF03: All demo data objects in DEMO_MOBILE_IM_DATA have emoji icons', () => {
    Object.values(DEMO_MOBILE_IM_DATA).forEach(demo => {
      demo.sections.forEach(section => {
        // Must not be a component name like 'Building2'
        expect(section.icon).not.toMatch(/^[A-Z][a-zA-Z0-9]*$/);
      });
    });
  });
});
