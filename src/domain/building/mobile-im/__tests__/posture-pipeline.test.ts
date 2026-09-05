import { describe, it, expect } from 'vitest';
import { INVESTMENT_POSTURE } from '@/domain/ontology';
import { getSectionPlan } from '../section-catalog';
import { getPosturePromptOverlay } from '../posture-prompts';
import { suggestArchetype } from '../archetype-registry';
import { buildDeckSequence } from '../pptx/deck-sequencer';
import { computeDataQualityBadge, hasMinimumBasicData } from '../data-quality-badge';
import { bridgeDealCardToIM } from '../ssot-to-im-bridge';

describe('Posture Pipeline — Section Catalog', () => {
  // D29 m-2: 포스처별 분화 (수익 12, 사옥 9, 개발 10, 운영 10, 매매 8)
  const EXPECTED_COUNTS: Record<string, number> = {
    income: 12, owner_occupied: 9, development: 10, operating: 10, trading: 8,
  };

  for (const posture of INVESTMENT_POSTURE) {
    it(`${posture}: should have ${EXPECTED_COUNTS[posture]} sections in plan (with checklist)`, () => {
      const plan = getSectionPlan(posture);
      expect(plan.posture).toBe(posture);
      expect(plan.sections).toHaveLength(EXPECTED_COUNTS[posture]);
      expect(plan.sections).toContain('checklist');
    });

    it(`${posture}: should not overlap sections with suppress list`, () => {
      const plan = getSectionPlan(posture);
      for (const s of plan.sections) {
        expect(plan.suppress).not.toContain(s);
      }
    });
  }
});

describe('Posture Pipeline — Archetype Registry', () => {
  for (const posture of INVESTMENT_POSTURE) {
    it(`${posture}: should suggest a valid primary archetype`, () => {
      const result = suggestArchetype({ vacancyPct: 10, buildingAge: 15, posture });
      expect(result.primary).toBeTruthy();
    });
  }

  it('posture specific primary archetype mappings', () => {
    expect(suggestArchetype({ vacancyPct: 0, buildingAge: 5, posture: 'development' }).primary).toBe('R-DEV-01');
    expect(suggestArchetype({ vacancyPct: 0, buildingAge: 5, posture: 'owner_occupied' }).primary).toBe('R-OWN-01');
    expect(suggestArchetype({ vacancyPct: 0, buildingAge: 5, posture: 'operating' }).primary).toBe('R-OPR-01');
    expect(suggestArchetype({ vacancyPct: 0, buildingAge: 5, posture: 'trading' }).primary).toBe('R-TRD-01');
  });
});

describe('Posture Pipeline — Posture Overlay Prompts', () => {
  const postureTestSections: Record<string, string> = {
    income: 'property_overview',
    owner_occupied: 'occupancy_fit',
    development: 'site_analysis',
    operating: 'operation_overview',
    trading: 'market_position',
  };

  for (const posture of INVESTMENT_POSTURE) {
    it(`${posture}: should return overlay instructions or null if income default`, () => {
      const targetSection = postureTestSections[posture];
      const overlay = getPosturePromptOverlay(posture, targetSection);
      expect(overlay).toBeTruthy();
      expect(typeof overlay).toBe('string');
    });
  }
});

describe('Posture Pipeline — Deck Sequencer', () => {
  for (const posture of INVESTMENT_POSTURE) {
    for (const grade of ['A', 'B', 'C', 'D'] as const) {
      it(`${posture}/${grade}: should return valid slide sequence`, () => {
        if (grade === 'D') {
          // D29 BL-1: D등급은 전면 차단 (throw)
          expect(() => buildDeckSequence({ posture, grade }))
            .toThrow('[G30]');
        } else {
          const result = buildDeckSequence({ posture, grade });
          expect(result.length).toBeGreaterThan(0);
        }
      });
    }
  }

  it('slide sequence posture customization', () => {
    const devSeq = buildDeckSequence({ posture: 'development', grade: 'B' });
    const devDataKeys = devSeq.map(s => s.dataKey);
    expect(devDataKeys).toContain('land');
    expect(devDataKeys).toContain('feasibility');

    const ownSeq = buildDeckSequence({ posture: 'owner_occupied', grade: 'B' });
    const ownDataKeys = ownSeq.map(s => s.dataKey);
    expect(ownDataKeys).toContain('vsLease');

    const opsSeq = buildDeckSequence({ posture: 'operating', grade: 'B' });
    const opsDataKeys = opsSeq.map(s => s.dataKey);
    expect(opsDataKeys).toContain('kpi');

    const trdSeq = buildDeckSequence({ posture: 'trading', grade: 'B' });
    const trdDataKeys = trdSeq.map(s => s.dataKey);
    expect(trdDataKeys).toContain('comps');
  });
});

describe('Posture Pipeline — Data Quality Badge & Gating', () => {
  const baseParams = {
    hasAddress: true,
    hasPublicData: true,
    hasMonthlyRent: false,
    hasVacancy: false,
    hasPhotos: false,
    hasAskingPrice: false,
  };

  it('development: should not require monthly rent for high grade', () => {
    const badge = computeDataQualityBadge(
      { ...baseParams, hasLandArea: true, hasZoning: true, hasAskingPrice: true, hasDevTargetUse: true, hasDevTargetScale: true },
      'development',
    );
    expect(badge.tier).toBe('verified');
    expect(badge.missingItems).not.toContain('월 임대료 총액');
  });

  it('trading: should evaluate quality based on price and public data', () => {
    const badge = computeDataQualityBadge(
      { ...baseParams, hasAskingPrice: true },
      'trading',
    );
    expect(badge.tier).toBe('verified');
  });

  it('hasMinimumBasicData: posture-specific requirements', () => {
    expect(hasMinimumBasicData({ hasAddress: true }, 'development')).toBe(true);
    expect(hasMinimumBasicData({ hasAskingPrice: true }, 'owner_occupied')).toBe(true);
    expect(hasMinimumBasicData({}, 'income')).toBe(false);
    expect(hasMinimumBasicData({ hasAskingPrice: true }, 'income')).toBe(true);
    expect(hasMinimumBasicData({ hasMonthlyRent: true }, 'income')).toBe(true);
  });

  // Rule 7: Negative Pair
  it('Rule 7 (Negative Pair): development missing land area should degrade to draft/reference', () => {
    const badge = computeDataQualityBadge(
      { ...baseParams, hasAddress: false, hasPublicData: false, hasLandArea: false, hasZoning: false },
      'development',
    );
    expect(badge.tier).not.toBe('verified');
    expect(badge.missingItems).toContain('대지면적');
  });

  // Rule 7: Negative Pair
  it('Rule 7 (Negative Pair): hasMinimumBasicData returns false when posture requirements are not met', () => {
    expect(hasMinimumBasicData({}, 'development')).toBe(false);
    expect(hasMinimumBasicData({}, 'owner_occupied')).toBe(false);
    expect(hasMinimumBasicData({}, 'operating')).toBe(false);
    expect(hasMinimumBasicData({}, 'trading')).toBe(false);
  });
});

describe('Posture Pipeline — SSoT to IM Bridge', () => {
  const mockSsotInput = {
    ssot: {
      area_signal: '강남구',
      asset_type: '오피스',
      price_band: '100억대',
    },
  };

  it('should generate posture-aware gradeUpItems for operating and trading', () => {
    const opsOutput = bridgeDealCardToIM(mockSsotInput, 'operating');
    const opsFields = opsOutput.gradeUpItems.map(g => g.field);
    expect(opsFields).toContain('monthlyRevenue');

    const trdOutput = bridgeDealCardToIM(mockSsotInput, 'trading');
    const trdFields = trdOutput.gradeUpItems.map(g => g.field);
    expect(trdFields).toContain('askingPrice');
  });
});
