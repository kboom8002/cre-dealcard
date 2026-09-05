import { describe, test, expect } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import { SECTION_CATALOG } from '@/domain/building/mobile-im/section-catalog';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { DEMO_MOBILE_IM_DATA } from '@/lib/demo/mobile-im-demo-data';
import { isSupportedMedia, resolvePhotos } from '@/domain/building/mobile-im/photo-url-transformer';
import { buildA03LargeTable } from '@/domain/building/mobile-im/pptx/archetypes/a03-large-table';

const SECTION_TYPE_TO_DATA_KEY: Record<string, string> = {
  property_overview: 'building',
  location_access:   'location',
  title_rights:      'titleRights',
  land_detail:       'land',
  lease_status:      'rentRoll',
  income_analysis:   'profit',
  risk_check:        'risk',
  investment_thesis: 'thesis',
  checklist:         'checklist',
  next_steps:        'process',
  closing:           'closing',
  occupancy_fit:     'plan',
  cost_comparison:   'vsLease',
  site_analysis:     'landDetail',
  development_feasibility: 'feasibility',
  operation_overview: 'kpi',
  gop_analysis:      'revenue',
  market_position:   'turnover',
  comparable_analysis: 'comps',
  comparables:       'comps',
};

describe('L4 Cross-Format Parity', () => {
  test('XF01: For each posture, every section in SECTION_CATALOG has its dataKey in the basic deck sequence', () => {
    const postures = Object.keys(SECTION_CATALOG) as Array<keyof typeof SECTION_CATALOG>;
    
    postures.forEach(posture => {
      const sequence = buildDeckSequence({
        posture,
        grade: 'A',
        dataAvailability: { hasRegistryData: true },
      });
      const dataKeysInSequence = sequence.map(s => s.dataKey);
      
      const sections = SECTION_CATALOG[posture].sections;
      sections.forEach(sectionType => {
        const expectedDataKey = SECTION_TYPE_TO_DATA_KEY[sectionType];
        expect(expectedDataKey, `Missing mapping for ${sectionType}`).toBeDefined();
        expect(dataKeysInSequence).toContain(expectedDataKey);
      });
    });
  });

  test('XF02: Basic tier deck sequences do NOT contain dcf or sensitivity dataKeys', () => {
    const postures = Object.keys(SECTION_CATALOG) as Array<keyof typeof SECTION_CATALOG>;
    
    postures.forEach(posture => {
      const sequence = buildDeckSequence({
        posture,
        grade: 'B',
      });
      const dataKeysInSequence = sequence.map(s => s.dataKey);
      
      expect(dataKeysInSequence).not.toContain('dcf');
      expect(dataKeysInSequence).not.toContain('sensitivity');
    });

    // Rule 7 Negative pair: Pro tier (Grade A) sequence DOES contain dcf
    const proSequence = buildDeckSequence({
      posture: 'income',
      grade: 'A',
    });
    const proDataKeys = proSequence.map(s => s.dataKey);
    expect(proDataKeys).toContain('dcf');
  });

  test('XF03: All demo data objects in DEMO_MOBILE_IM_DATA have emoji icons', () => {
    Object.values(DEMO_MOBILE_IM_DATA).forEach(demo => {
      demo.sections.forEach(section => {
        // Must not be a component name like 'Building2'
        expect(section.icon).not.toMatch(/^[A-Z][a-zA-Z0-9]*$/);
      });
    });
  });

  test('XF04: isSupportedMedia and resolvePhotos filter out .wdp files and accept standard formats', () => {
    // 1. isSupportedMedia unit assertions
    expect(isSupportedMedia('https://example.com/photo.wdp')).toBe(false);
    expect(isSupportedMedia('https://example.com/photo.wdp?token=abc')).toBe(false);
    expect(isSupportedMedia('https://example.com/photo.WDP')).toBe(false);
    expect(isSupportedMedia('https://example.com/photo.jpg')).toBe(true);
    expect(isSupportedMedia('https://example.com/photo.png')).toBe(true);
    expect(isSupportedMedia(undefined)).toBe(false);

    // 2. resolvePhotos with photos_v2
    const mixedV2 = {
      photos_v2: [
        { url: 'https://example.com/good1.jpg', category: 'exterior' as const, order: 0 },
        { url: 'https://example.com/bad1.wdp', category: 'interior' as const, order: 1 },
        { url: 'https://example.com/good2.png?q=high', category: 'lobby' as const, order: 2 },
      ],
    };
    const resolvedV2 = resolvePhotos(mixedV2);
    expect(resolvedV2.length).toBe(2);
    expect(resolvedV2.map(p => p.url)).toEqual([
      'https://example.com/good1.jpg',
      'https://example.com/good2.png?q=high',
    ]);

    // 3. resolvePhotos with photo_urls (v1)
    const mixedV1 = {
      photo_urls: [
        'https://example.com/photo_exterior.jpg',
        'https://example.com/photo_lobby.wdp',
        'https://example.com/photo_interior.png',
      ],
    };
    const resolvedV1 = resolvePhotos(mixedV1);
    expect(resolvedV1.length).toBe(2);
    expect(resolvedV1.map(p => p.url)).not.toContain('https://example.com/photo_lobby.wdp');

    // 4. Negative pair: All .wdp -> 0 photos returned
    const allWdp = {
      photo_urls: ['https://example.com/1.wdp', 'https://example.com/2.wdp?arg=1'],
    };
    expect(resolvePhotos(allWdp)).toHaveLength(0);
  });

  test('XF05: buildA03LargeTable renders rent roll with summary and vacancy styling without error', () => {
    const pres = new PptxGenJS();
    const result = buildA03LargeTable({
      pres,
      slideNum: 4,
      docno: 'DOC-TEST-01',
      grade: 'A',
      provenance: {},
      data: {
        title: '임대차 현황',
        kicker: 'Lease Status',
        tableHead: ['층', '호실', '임차인', '보증금', '월세'],
        tableRows: [
          ['1F', '101호', '스타벅스', '3억', '1,500만'],
          ['2F', '201호', '공실', '0', '0'],
          ['합계', '', '', '3억', '1,500만'],
        ],
        note: '임대차 계약서 기준',
      },
    });

    expect(result.slide).toBeDefined();
    expect(result.warnings).toHaveLength(0);
  });
});

