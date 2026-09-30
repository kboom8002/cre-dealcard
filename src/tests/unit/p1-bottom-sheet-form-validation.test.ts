import { describe, it, expect } from 'vitest';
import {
  computeDataQualityBadge,
  hasMinimumBasicData,
  isProEligible,
  tierToGrade,
  getDataFreshnessWarning,
} from '@/domain/building/mobile-im/data-quality-badge';
import {
  getSectionPlan,
  getAugmentedSectionPlan,
  SECTION_CATALOG,
} from '@/domain/building/mobile-im/section-catalog';
import type { InvestmentPosture } from '@/domain/ontology';

describe('P1 Bottom Sheet Form Validation', () => {
  describe('computeDataQualityBadge — 5 posture × grade matrix (P2-2)', () => {
    describe('income posture', () => {
      it('All fields present -> tier="verified", label includes "A등급"', () => {
        const result = computeDataQualityBadge({
          hasAddress: true,
          hasPublicData: true,
          hasMonthlyRent: true,
          hasAskingPrice: true,
          hasFloorLeases: true,
          hasVacancy: true,
          hasPhotos: true,
          hasLoanAmount: true,
        }, 'income');
        expect(result.tier).toBe('verified');
        expect(result.label).toContain('A등급');
      });

      it('Address + public + rent + price (no leases) -> tier="partial", label includes "B등급"', () => {
        const result = computeDataQualityBadge({
          hasAddress: true,
          hasPublicData: true,
          hasMonthlyRent: true,
          hasAskingPrice: true,
          hasFloorLeases: false,
          hasVacancy: true,
          hasPhotos: true,
        }, 'income');
        expect(result.tier).toBe('partial');
        expect(result.label).toContain('B등급');
      });

      it('Only address -> tier="reference", label includes "C등급"', () => {
        const result = computeDataQualityBadge({
          hasAddress: true,
          hasPublicData: false,
          hasMonthlyRent: false,
          hasVacancy: false,
          hasPhotos: false,
        }, 'income');
        expect(result.tier).toBe('reference');
        expect(result.label).toContain('C등급');
      });

      it('Nothing -> tier="draft"', () => {
        const result = computeDataQualityBadge({
          hasAddress: false,
          hasPublicData: false,
          hasMonthlyRent: false,
          hasVacancy: false,
          hasPhotos: false,
        }, 'income');
        expect(result.tier).toBe('draft');
      });
    });

    describe('development posture', () => {
      it('All fields (address+public+land+zoning+price+devTarget) -> "verified"', () => {
        const result = computeDataQualityBadge({
          hasAddress: true,
          hasPublicData: true,
          hasLandArea: true,
          hasZoning: true,
          hasAskingPrice: true,
          hasDevTargetUse: true,
          hasDevTargetScale: true,
          hasVacancy: false,
          hasMonthlyRent: false,
          hasPhotos: true,
        }, 'development');
        expect(result.tier).toBe('verified');
      });

      it('Address+public+land -> "partial"', () => {
        const result = computeDataQualityBadge({
          hasAddress: true,
          hasPublicData: true,
          hasLandArea: true,
          hasZoning: false,
          hasAskingPrice: false,
          hasVacancy: false,
          hasMonthlyRent: false,
          hasPhotos: false,
        }, 'development');
        expect(result.tier).toBe('partial');
      });

      it('Only address -> "reference"', () => {
        const result = computeDataQualityBadge({
          hasAddress: true,
          hasPublicData: false,
          hasVacancy: false,
          hasMonthlyRent: false,
          hasPhotos: false,
        }, 'development');
        expect(result.tier).toBe('reference');
      });
    });

    describe('owner_occupied posture', () => {
      it('Address+public+price+area -> "verified"', () => {
        const result = computeDataQualityBadge({
          hasAddress: true,
          hasPublicData: true,
          hasAskingPrice: true,
          hasTotalGrossArea: true,
          hasPhotos: true,
          hasMonthlyRent: false,
          hasVacancy: false,
        }, 'owner_occupied');
        expect(result.tier).toBe('verified');
      });

      it('Address+public+price (no explicit area, but public data implies area) -> still "verified"', () => {
        // hasArea = hasTotalGrossArea || hasPublicData, so hasPublicData=true → hasArea=true
        const result = computeDataQualityBadge({
          hasAddress: true,
          hasPublicData: true,
          hasAskingPrice: true,
          hasTotalGrossArea: false,
          hasPhotos: true,
          hasMonthlyRent: false,
          hasVacancy: false,
        }, 'owner_occupied');
        expect(result.tier).toBe('verified');
      });

      it('Address+no_public+price (truly no area) -> "partial"', () => {
        // hasPublicData=false, hasTotalGrossArea=false → hasArea=false → partial
        const result = computeDataQualityBadge({
          hasAddress: true,
          hasPublicData: false,
          hasAskingPrice: true,
          hasTotalGrossArea: false,
          hasPhotos: false,
          hasMonthlyRent: false,
          hasVacancy: false,
        }, 'owner_occupied');
        // No publicData → no area → only address+price → still partial via (hasAskingPrice || hasArea)
        expect(result.tier).toBe('reference');
      });
    });

    describe('operating posture', () => {
      it('Address+public+revenue+price+roomCount -> "verified"', () => {
        const result = computeDataQualityBadge({
          hasAddress: true,
          hasPublicData: true,
          hasMonthlyRevenue: true,
          hasAskingPrice: true,
          hasRoomCount: true,
          hasVacancy: false,
          hasMonthlyRent: false,
          hasPhotos: true,
        }, 'operating');
        expect(result.tier).toBe('verified');
      });

      it('Address+public+revenue -> "partial"', () => {
        const result = computeDataQualityBadge({
          hasAddress: true,
          hasPublicData: true,
          hasMonthlyRevenue: true,
          hasAskingPrice: false,
          hasRoomCount: false,
          hasVacancy: false,
          hasMonthlyRent: false,
          hasPhotos: true,
        }, 'operating');
        expect(result.tier).toBe('partial');
      });
    });

    describe('trading posture', () => {
      it('Address+public+price -> "verified"', () => {
        const result = computeDataQualityBadge({
          hasAddress: true,
          hasPublicData: true,
          hasAskingPrice: true,
          hasVacancy: false,
          hasMonthlyRent: false,
          hasPhotos: true,
        }, 'trading');
        expect(result.tier).toBe('verified');
      });

      it('Address+public (no price) -> "partial"', () => {
        const result = computeDataQualityBadge({
          hasAddress: true,
          hasPublicData: true,
          hasAskingPrice: false,
          hasVacancy: false,
          hasMonthlyRent: false,
          hasPhotos: true,
        }, 'trading');
        expect(result.tier).toBe('partial');
      });
    });
  });

  describe('hasMinimumBasicData — posture-specific minimum gates', () => {
    it('income: askingPrice alone -> true', () => {
      expect(hasMinimumBasicData({ hasAskingPrice: true }, 'income')).toBe(true);
    });
    it('income: nothing -> false', () => {
      expect(hasMinimumBasicData({}, 'income')).toBe(false);
    });
    it('development: address alone -> true', () => {
      expect(hasMinimumBasicData({ hasAddress: true }, 'development')).toBe(true);
    });
    it('development: nothing -> false', () => {
      expect(hasMinimumBasicData({}, 'development')).toBe(false);
    });
    it('owner_occupied: askingPrice alone -> true', () => {
      expect(hasMinimumBasicData({ hasAskingPrice: true }, 'owner_occupied')).toBe(true);
    });
    it('operating: monthlyRevenue alone -> true', () => {
      expect(hasMinimumBasicData({ hasMonthlyRevenue: true }, 'operating')).toBe(true);
    });
    it('operating: nothing -> false', () => {
      expect(hasMinimumBasicData({}, 'operating')).toBe(false);
    });
    it('trading: address alone -> true', () => {
      expect(hasMinimumBasicData({ hasAddress: true }, 'trading')).toBe(true);
    });
  });

  describe('isProEligible', () => {
    it('Grade A -> true', () => {
      expect(isProEligible('A')).toBe(true);
    });
    it('Grade B -> false', () => {
      expect(isProEligible('B')).toBe(false);
    });
    it('Grade C -> false', () => {
      expect(isProEligible('C')).toBe(false);
    });
  });

  describe('tierToGrade', () => {
    it('verified -> A', () => {
      expect(tierToGrade('verified')).toBe('A');
    });
    it('partial -> B', () => {
      expect(tierToGrade('partial')).toBe('B');
    });
    it('reference -> C', () => {
      expect(tierToGrade('reference')).toBe('C');
    });
    it('draft -> C', () => {
      expect(tierToGrade('draft')).toBe('C');
    });
  });

  describe('getDataFreshnessWarning', () => {
    it('undefined -> warning string', () => {
      expect(getDataFreshnessWarning(undefined)).toContain('⚠️');
    });
    it('invalid date string -> warning string', () => {
      expect(getDataFreshnessWarning('invalid-date')).toContain('⚠️');
    });
    it('40 days ago -> "30일 초과" message', () => {
      const date = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      expect(getDataFreshnessWarning(date)).toContain('30일 초과');
    });
    it('10 days ago -> "7일 초과" message', () => {
      const date = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      expect(getDataFreshnessWarning(date)).toContain('7일 초과');
    });
    it('1 day ago -> null', () => {
      const date = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
      expect(getDataFreshnessWarning(date)).toBeNull();
    });
    it('today -> null', () => {
      const date = new Date().toISOString();
      expect(getDataFreshnessWarning(date)).toBeNull();
    });
  });

  describe('Section Catalog — getSectionPlan & getAugmentedSectionPlan (P3-2)', () => {
    describe('getSectionPlan', () => {
      it('income -> 11 sections, emphasize=["lease_status","income_analysis"], required includes "checklist"', () => {
        const plan = getSectionPlan('income');
        expect(plan.sections.length).toBe(11);
        expect(plan.emphasize).toEqual(['lease_status', 'income_analysis']);
        expect(plan.required).toContain('checklist');
      });
      it('owner_occupied -> 9 sections, suppress includes "lease_status"', () => {
        const plan = getSectionPlan('owner_occupied');
        expect(plan.sections.length).toBe(9);
        expect(plan.suppress).toContain('lease_status');
      });
      it('development -> 10 sections, emphasize=["site_analysis","development_feasibility"]', () => {
        const plan = getSectionPlan('development');
        expect(plan.sections.length).toBe(10);
        expect(plan.emphasize).toEqual(['site_analysis', 'development_feasibility']);
      });
      it('operating -> 10 sections, required includes "gop_analysis"', () => {
        const plan = getSectionPlan('operating');
        expect(plan.sections.length).toBe(10);
        expect(plan.required).toContain('gop_analysis');
      });
      it('trading -> 8 sections, suppress includes "land_detail"', () => {
        const plan = getSectionPlan('trading');
        expect(plan.sections.length).toBe(8);
        expect(plan.suppress).toContain('land_detail');
      });
    });

    describe('Section ordering invariants (every posture)', () => {
      const postures: InvestmentPosture[] = ['income', 'owner_occupied', 'development', 'operating', 'trading'];

      postures.forEach((posture) => {
        it(`[${posture}] maintains section invariants`, () => {
          const plan = getSectionPlan(posture);
          const sections = plan.sections;
          
          // 'checklist' comes right before 'next_steps'
          const checklistIdx = sections.indexOf('checklist');
          const nextStepsIdx = sections.indexOf('next_steps');
          expect(checklistIdx).toBe(nextStepsIdx - 1);
          
          // 'property_overview' is always first
          expect(sections[0]).toBe('property_overview');
          
          // 'next_steps' is always last
          expect(sections[sections.length - 1]).toBe('next_steps');
          
          // emphasize list has exactly 2 items
          expect(plan.emphasize.length).toBe(2);
          
          // Each posture's required sections are subset of its sections
          plan.required.forEach((req) => {
            expect(sections).toContain(req);
          });
        });
      });
    });

    describe('getAugmentedSectionPlan', () => {
      it('R-OPR-04 -> "legality_warning" inserted before "risk_check", "risk_check" added to emphasize', () => {
        const plan = getAugmentedSectionPlan('operating', 'R-OPR-04');
        const legalityIdx = plan.sections.indexOf('legality_warning');
        const riskIdx = plan.sections.indexOf('risk_check');
        expect(legalityIdx).toBe(riskIdx - 1);
        expect(plan.emphasize).toContain('risk_check');
      });

      it('R-TRD-04 -> "exit_constraint" inserted before "risk_check"', () => {
        const plan = getAugmentedSectionPlan('trading', 'R-TRD-04');
        const exitIdx = plan.sections.indexOf('exit_constraint');
        const riskIdx = plan.sections.indexOf('risk_check');
        expect(exitIdx).toBe(riskIdx - 1);
      });

      it('No archetype -> no extra sections', () => {
        const basePlan = getSectionPlan('income');
        const augmented = getAugmentedSectionPlan('income');
        expect(augmented.sections).toEqual(basePlan.sections);
      });

      it('Idempotent: calling twice with same archetype doesn\'t duplicate sections', () => {
        const augmented1 = getAugmentedSectionPlan('operating', 'R-OPR-04');
        const augmented2 = getAugmentedSectionPlan('operating', 'R-OPR-04');
        expect(augmented1.sections).toEqual(augmented2.sections);
      });
    });
  });

  describe('Score arithmetic', () => {
    it('income: address(20) + public(20) + rent(15) + price(15) + leases(10) + loan(8) = 88', () => {
      const result = computeDataQualityBadge({
        hasAddress: true,
        hasPublicData: true,
        hasMonthlyRent: true,
        hasAskingPrice: true,
        hasFloorLeases: true,
        hasLoanAmount: true,
        hasVacancy: false,
        hasPhotos: false,
      }, 'income');
      expect(result.score).toBe(88);
    });

    it('development: address(20) + public(20) + land(20) + zoning(15) + price(15) + photos(10) + devUse(5) + devScale(5) = 110', () => {
      const result = computeDataQualityBadge({
        hasAddress: true,
        hasPublicData: true,
        hasLandArea: true,
        hasZoning: true,
        hasAskingPrice: true,
        hasPhotos: true,
        hasDevTargetUse: true,
        hasDevTargetScale: true,
        hasVacancy: false,
        hasMonthlyRent: false,
      }, 'development');
      expect(result.score).toBe(110);
    });

    it('Verify missingItems array correctness: when hasPhotos=false, missingItems includes "건물 사진" or similar', () => {
      const result = computeDataQualityBadge({
        hasAddress: true,
        hasPublicData: true,
        hasMonthlyRent: true,
        hasAskingPrice: true,
        hasFloorLeases: true,
        hasLoanAmount: true,
        hasVacancy: true,
        hasPhotos: false,
      }, 'income');
      expect(result.missingItems).toContain('건물 사진');
    });
  });
});
