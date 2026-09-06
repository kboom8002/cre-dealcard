import { describe, it, expect } from 'vitest';
import { ClaimRegistry } from '@/domain/building/im-core/claim-registry';
import { runApprovalGate } from '@/domain/building/im-core/approval-gate';
import { resolveTier } from '@/domain/building/im-core/release-tier';
import { PUBLISH_GATES, type GateContext, runPublishGates } from '@/domain/building/mobile-im/quality-gates-v02';

describe('Milestone 1 L4: Business Domain & Approval Gate Integrity', () => {
  describe('L4-03: Approval Gate Subject Aliasing & Posture Routing', () => {
    it('passes approval when claims use FinancialCalculator alias subjects: total_area_sqm and yield_on_cost', () => {
      const registry = new ClaimRegistry();
      registry.register({
        subject: 'asking_price',
        value: 10_000_000_000,
        evidence: [],
        provenance: 'broker',
        asOf: '2026-09-06',
        status: 'reconciled',
      });
      registry.register({
        subject: 'total_area_sqm', // Alias for total_area
        value: 1500,
        evidence: [],
        provenance: 'public_api',
        asOf: '2026-09-06',
        status: 'reconciled',
      });
      registry.register({
        subject: 'yield_on_cost', // Alias for gross_yield
        value: 4.5,
        evidence: [],
        provenance: 'broker',
        asOf: '2026-09-06',
        status: 'reconciled',
      });

      const result = runApprovalGate(registry, 'fact_om', { posture: 'income' });
      expect(result.passed).toBe(true);
      expect(result.blockers).toEqual([]);
    });

    it('passes approval when claims use cap_rate as alias for gross_yield', () => {
      const registry = new ClaimRegistry();
      registry.register({
        subject: 'asking_price',
        value: 10_000_000_000,
        evidence: [],
        provenance: 'broker',
        asOf: '2026-09-06',
        status: 'reconciled',
      });
      registry.register({
        subject: 'total_area',
        value: 1200,
        evidence: [],
        provenance: 'public_api',
        asOf: '2026-09-06',
        status: 'reconciled',
      });
      registry.register({
        subject: 'cap_rate', // Alias for gross_yield
        value: 4.2,
        evidence: [],
        provenance: 'broker',
        asOf: '2026-09-06',
        status: 'reconciled',
      });

      const result = runApprovalGate(registry, 'fact_om', { posture: 'income' });
      expect(result.passed).toBe(true);
      expect(result.blockers).toEqual([]);
    });

    it('does NOT mandate gross_yield for owner_occupied posture deals', () => {
      const registry = new ClaimRegistry();
      registry.register({
        subject: 'asking_price',
        value: 15_000_000_000,
        evidence: [],
        provenance: 'broker',
        asOf: '2026-09-06',
        status: 'reconciled',
      });
      registry.register({
        subject: 'total_area_sqm',
        value: 2000,
        evidence: [],
        provenance: 'public_api',
        asOf: '2026-09-06',
        status: 'reconciled',
      });
      // No gross_yield or yield_on_cost!

      const result = runApprovalGate(registry, 'fact_om', { posture: 'owner_occupied' });
      expect(result.passed).toBe(true);
      expect(result.blockers).toEqual([]);
    });

    it('does NOT mandate gross_yield for development posture deals', () => {
      const registry = new ClaimRegistry();
      registry.register({
        subject: 'asking_price',
        value: 25_000_000_000,
        evidence: [],
        provenance: 'broker',
        asOf: '2026-09-06',
        status: 'reconciled',
      });
      registry.register({
        subject: 'total_area',
        value: 3000,
        evidence: [],
        provenance: 'public_api',
        asOf: '2026-09-06',
        status: 'reconciled',
      });

      const result = runApprovalGate(registry, 'fact_om', { posture: 'development' });
      expect(result.passed).toBe(true);
      expect(result.blockers).toEqual([]);
    });

    it('Negative Pair: blocks income posture when gross_yield and aliases are missing', () => {
      const registry = new ClaimRegistry();
      registry.register({
        subject: 'asking_price',
        value: 10_000_000_000,
        evidence: [],
        provenance: 'broker',
        asOf: '2026-09-06',
        status: 'reconciled',
      });
      registry.register({
        subject: 'total_area',
        value: 1200,
        evidence: [],
        provenance: 'public_api',
        asOf: '2026-09-06',
        status: 'reconciled',
      });

      const result = runApprovalGate(registry, 'fact_om', { posture: 'income' });
      expect(result.passed).toBe(false);
      expect(result.blockers.some((b) => b.id === 'approval.required_missing.gross_yield')).toBe(true);
    });

    it('Negative Pair: blocks when total_area and aliases are missing', () => {
      const registry = new ClaimRegistry();
      registry.register({
        subject: 'asking_price',
        value: 10_000_000_000,
        evidence: [],
        provenance: 'broker',
        asOf: '2026-09-06',
        status: 'reconciled',
      });
      registry.register({
        subject: 'gross_yield',
        value: 4.5,
        evidence: [],
        provenance: 'broker',
        asOf: '2026-09-06',
        status: 'reconciled',
      });

      const result = runApprovalGate(registry, 'fact_om', { posture: 'income' });
      expect(result.passed).toBe(false);
      expect(result.blockers.some((b) => b.id === 'approval.required_missing.total_area')).toBe(true);
    });
  });

  describe('L4-02 / L4-07: ReleaseTier Decision IM Resolution', () => {
    it('resolves decision_im when grade is A and hasAsOf and hasScenario are true', () => {
      const tier = resolveTier({
        grade: 'A',
        posture: 'income',
        dataAvailability: {
          hasBuildingRegister: true,
          hasLandUsePlan: true,
          hasRentRoll: true,
          hasComparables: true,
          hasPhotos: true,
        },
        hasExpertReview: false,
        hasAsOf: true,
        hasScenario: true,
      });
      expect(tier).toBe('decision_im');
    });

    it('resolves decision_im when grade is B and hasAsOf and hasScenario are true', () => {
      const tier = resolveTier({
        grade: 'B',
        posture: 'income',
        dataAvailability: {
          hasBuildingRegister: true,
          hasLandUsePlan: true,
          hasRentRoll: true,
          hasComparables: true,
          hasPhotos: true,
        },
        hasExpertReview: false,
        hasAsOf: true,
        hasScenario: true,
      });
      expect(tier).toBe('decision_im');
    });

    it('Negative Pair: downgrades to analysis_im when hasAsOf is false', () => {
      const tier = resolveTier({
        grade: 'A',
        posture: 'income',
        dataAvailability: {
          hasBuildingRegister: true,
          hasLandUsePlan: true,
          hasRentRoll: true,
          hasComparables: true,
          hasPhotos: true,
        },
        hasExpertReview: false,
        hasAsOf: false,
        hasScenario: true,
      });
      expect(tier).toBe('analysis_im');
    });

    it('Negative Pair: downgrades to analysis_im when hasScenario is false', () => {
      const tier = resolveTier({
        grade: 'A',
        posture: 'income',
        dataAvailability: {
          hasBuildingRegister: true,
          hasLandUsePlan: true,
          hasRentRoll: true,
          hasComparables: true,
          hasPhotos: true,
        },
        hasExpertReview: false,
        hasAsOf: true,
        hasScenario: false,
      });
      expect(tier).toBe('analysis_im');
    });
  });

  describe('L4-04: PUBLISH_GATES G17-G30 Type-Safe and Safe Handlers', () => {
    it('G23 fails when rentRollFullyDisclosed is explicitly false', () => {
      const g23 = PUBLISH_GATES.find((g) => g.id === 'G23')!;
      expect(g23).toBeDefined();
      expect(g23.check({} as GateContext)).toBe(true);
      expect(g23.check({ rentRollFullyDisclosed: false } as GateContext)).toBe(false);
      expect(g23.check({ rentRollFullyDisclosed: true } as GateContext)).toBe(true);
    });

    it('G17 fails when imageDpi is below 72 and passes when undefined or >= 72', () => {
      const g17 = PUBLISH_GATES.find((g) => g.id === 'G17')!;
      expect(g17.check({} as GateContext)).toBe(true);
      expect(g17.check({ imageDpi: 50 } as GateContext)).toBe(false);
      expect(g17.check({ imageDpi: 72 } as GateContext)).toBe(true);
      expect(g17.check({ imageDpi: 150 } as GateContext)).toBe(true);
    });

    it('G26 fails when photoCount is less than 3 and passes when undefined or >= 3', () => {
      const g26 = PUBLISH_GATES.find((g) => g.id === 'G26')!;
      expect(g26.check({} as GateContext)).toBe(true);
      expect(g26.check({ photoCount: 1 } as GateContext)).toBe(false);
      expect(g26.check({ photoCount: 2 } as GateContext)).toBe(false);
      expect(g26.check({ photoCount: 3 } as GateContext)).toBe(true);
    });
  });
});
