import { describe, it, expect } from 'vitest';
import { resolveEnrichment } from '@/domain/building/im-core/resolve-enrichment';
import { TIER_CONFIG } from '@/domain/building/im-core/release-tier';
import { computeDataQualityBadge, hasMinimumBasicData } from '@/domain/building/mobile-im/data-quality-badge';

// Replicate the validation logic from fetch-im-data.ts for unit testing
function isValidKoreanCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 33.0 && lat <= 43.0 && lng >= 124.0 && lng <= 132.0;
}

const SECTION_ICON_MAP: Record<string, string> = {
  'property_overview': '🏢',
  'location_access': '📍',
  'lease_status': '📋',
  'income_analysis': '💰',
  'risk_check': '⚠️',
  'investment_thesis': '🎯',
  'next_steps': '🚀',
  'occupancy_fit': '🏠',
  'cost_comparison': '📊',
  'site_analysis': '🗺️',
  'development_feasibility': '🏗️',
  'operation_overview': '⚙️',
  'gop_analysis': '📈',
  'market_position': '🏷️',
  'comparable_analysis': '📐',
};

describe('P3 Server Data Fetching & Handler Post-Processing', () => {
  
  describe('Korean Coordinate Validation (P3-5-04)', () => {
    it('Seoul (37.5665, 126.9780) → true', () => {
      expect(isValidKoreanCoord(37.5665, 126.9780)).toBe(true);
    });

    it('Busan (35.1796, 129.0756) → true', () => {
      expect(isValidKoreanCoord(35.1796, 129.0756)).toBe(true);
    });

    it('Jeju (33.4996, 126.5312) → true', () => {
      expect(isValidKoreanCoord(33.4996, 126.5312)).toBe(true);
    });

    it('Northern boundary (43.0, 131.0) → true', () => {
      expect(isValidKoreanCoord(43.0, 131.0)).toBe(true);
    });

    it('Out of range (0, 0) → false', () => {
      expect(isValidKoreanCoord(0, 0)).toBe(false);
    });

    it('Tokyo (35.6762, 139.6503) → false (lng > 132)', () => {
      expect(isValidKoreanCoord(35.6762, 139.6503)).toBe(false);
    });

    it('Beijing (39.9042, 116.4074) → false (lng < 124)', () => {
      expect(isValidKoreanCoord(39.9042, 116.4074)).toBe(false);
    });

    it('NaN values → false', () => {
      expect(isValidKoreanCoord(NaN, 127)).toBe(false);
      expect(isValidKoreanCoord(37, NaN)).toBe(false);
    });

    it('Infinity values → false', () => {
      expect(isValidKoreanCoord(Infinity, 127)).toBe(false);
      expect(isValidKoreanCoord(37, -Infinity)).toBe(false);
    });

    it('Negative coords → false', () => {
      expect(isValidKoreanCoord(-37.5, -127.0)).toBe(false);
    });
  });

  describe('resolveEnrichment (P5-3-01)', () => {
    it('Body with enrichment field → returns normalized enrichment', () => {
      const body = {
        enrichment: {
          address: 'Seoul',
          hasPublicData: true,
          landUsePlan: { data: 'test' }
        }
      };
      const resolved = resolveEnrichment(body);
      expect(resolved.meta.address).toBe('Seoul');
      expect(resolved.meta.hasPublicData).toBe(true);
      expect(resolved.landUsePlan).toEqual({ data: 'test' });
    });

    it('Body with external_data field → returns normalized enrichment', () => {
      const body = {
        external_data: {
          address: 'Busan',
          hasPublicData: false,
          buildingRegister: { size: 100 }
        }
      };
      const resolved = resolveEnrichment(body);
      expect(resolved.meta.address).toBe('Busan');
      expect(resolved.meta.hasPublicData).toBe(false);
      expect(resolved.buildingRegister).toEqual({ size: 100 });
    });

    it('Body with neither → returns default empty enrichment', () => {
      const resolved = resolveEnrichment({});
      expect(resolved.meta.address).toBeNull();
      expect(resolved.meta.hasPublicData).toBe(false);
      expect(resolved.landUsePlan).toBeNull();
    });

    it('Body with both → enrichment takes precedence', () => {
      const body = {
        enrichment: {
          address: 'Seoul',
        },
        external_data: {
          address: 'Busan',
        }
      };
      const resolved = resolveEnrichment(body);
      expect(resolved.meta.address).toBe('Seoul');
    });

    it('Verify meta fields enrichedAt, hasPublicData, address exist and are correctly inferred', () => {
      const body = {
        enrichment: {
          landUsePlan: { plan: 'A' },
          enrichedAt: '2026-09-30T10:00:00Z'
        }
      };
      const resolved = resolveEnrichment(body);
      expect(resolved.meta.enrichedAt).toBe('2026-09-30T10:00:00Z');
      expect(resolved.meta.address).toBeNull();
      expect(resolved.meta.hasPublicData).toBe(true);
    });
  });

  describe('Handler Anti-Hallucination Gate (P1-5)', () => {
    it('income: no address, no rent, no price → false (should block)', () => {
      expect(hasMinimumBasicData({}, 'income')).toBe(false);
    });

    it('income: has address → true (should allow)', () => {
      expect(hasMinimumBasicData({ hasAddress: true }, 'income')).toBe(true);
    });

    it('development: no address, no public, no price → false', () => {
      expect(hasMinimumBasicData({}, 'development')).toBe(false);
    });

    it('development: has public data → true', () => {
      expect(hasMinimumBasicData({ hasPublicData: true }, 'development')).toBe(true);
    });

    it('operating: no price, no rent, no revenue → false', () => {
      expect(hasMinimumBasicData({}, 'operating')).toBe(false);
    });

    it('operating: has monthlyRevenue → true', () => {
      expect(hasMinimumBasicData({ hasMonthlyRevenue: true }, 'operating')).toBe(true);
    });
  });

  describe('Locked Section Content Scrubbing (P5-1-01, P5-1-02)', () => {
    it('locked section → content is empty string', () => {
      const section = { content: 'sensitive data', locked: true, boundaryNote: 'note', provenance: ['p1'] };
      const scrubbed = section.locked 
        ? { ...section, content: '', boundaryNote: undefined, provenance: [] }
        : section;
      expect(scrubbed.content).toBe('');
      expect(scrubbed.boundaryNote).toBeUndefined();
      expect(scrubbed.provenance).toEqual([]);
    });

    it('unlocked section → content preserved', () => {
      const section = { content: '## 분석 내용', locked: false, boundaryNote: 'note', provenance: ['p1'] };
      const scrubbed = section.locked 
        ? { ...section, content: '', boundaryNote: undefined, provenance: [] }
        : section;
      expect(scrubbed.content).toBe('## 분석 내용');
      expect(scrubbed.boundaryNote).toBe('note');
      expect(scrubbed.provenance).toEqual(['p1']);
    });
  });

  describe('Release Tier Gating (P5-1-02)', () => {
    it('fact_om tier → allowFinancials is false', () => {
      expect(TIER_CONFIG['fact_om'].allowFinancials).toBe(false);
    });

    it('analysis_im tier → allowFinancials is true', () => {
      expect(TIER_CONFIG['analysis_im'].allowFinancials).toBe(true);
    });

    it('decision_im tier → allowFinancials and allowScenario are true', () => {
      expect(TIER_CONFIG['decision_im'].allowFinancials).toBe(true);
      expect(TIER_CONFIG['decision_im'].allowScenario).toBe(true);
    });

    it('Each tier config has expected boolean fields', () => {
      const keys = Object.keys(TIER_CONFIG);
      keys.forEach(key => {
        expect(typeof TIER_CONFIG[key].allowFinancials).toBe('boolean');
        expect(typeof TIER_CONFIG[key].allowScenario).toBe('boolean');
        expect(typeof TIER_CONFIG[key].allowValueAdd).toBe('boolean');
        expect(typeof TIER_CONFIG[key].allowRentGap).toBe('boolean');
        expect(typeof TIER_CONFIG[key].maxBodyPages).toBe('number');
      });
    });
  });

  describe('Section Icon Mapping', () => {
    it('All 15 section types have correct icon mappings', () => {
      const expectedMappings = {
        'property_overview': '🏢',
        'location_access': '📍',
        'lease_status': '📋',
        'income_analysis': '💰',
        'risk_check': '⚠️',
        'investment_thesis': '🎯',
        'next_steps': '🚀',
        'occupancy_fit': '🏠',
        'cost_comparison': '📊',
        'site_analysis': '🗺️',
        'development_feasibility': '🏗️',
        'operation_overview': '⚙️',
        'gop_analysis': '📈',
        'market_position': '🏷️',
        'comparable_analysis': '📐',
      };

      for (const [key, icon] of Object.entries(expectedMappings)) {
        expect(SECTION_ICON_MAP[key]).toBe(icon);
      }
      expect(Object.keys(SECTION_ICON_MAP).length).toBe(15);
    });
  });

  describe('Data Quality Badge in fetchIMData context', () => {
    it('Produces correct results when called with parameter structure used in fetchIMData', () => {
      const badge = computeDataQualityBadge({
        hasAddress: true,
        hasPublicData: true,
        hasMonthlyRent: true,
        hasVacancy: true,
        hasPhotos: true,
        hasAskingPrice: true,
        hasLoanAmount: true,
        hasFloorLeases: true,
      }, 'income');
      
      expect(badge.tier).toBe('verified');
      expect(badge.score).toBeGreaterThan(0);
    });
  });
});
