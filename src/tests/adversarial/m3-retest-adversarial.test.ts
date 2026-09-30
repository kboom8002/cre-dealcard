/**
 * Adversarial Milestone 3 Remediation Retest Suite
 *
 * Authored by: challenger_m3_retest (critic, specialist)
 * Purpose: Adversarially challenge all remediated Milestone 3 components:
 * 1. SSoT-to-IM Bridge null/undefined/corrupt safety and precision.
 * 2. Release Tier lookup robustness across standard & non-standard tier strings.
 * 3. Rent calculation backfill and template fallback unlocked output.
 * 4. Posture isolation under degraded/zero price conditions.
 * 5. Complete absence of evasive phrases ('확인 필요') and poison tokens.
 */

import { describe, it, expect, vi } from 'vitest';
import { bridgeDealCardToIM } from '@/domain/building/mobile-im/ssot-to-im-bridge';
import { getTierAllowedSections, TIER_CONFIG, type ReleaseTier } from '@/domain/building/im-core/release-tier';
import { generateSingleSection } from '@/domain/building/mobile-im/im-section-generator';
import { generatePremiumTemplate } from '@/domain/building/mobile-im/premium-template-engine';
import type { IMGenerationContext } from '@/domain/building/mobile-im/im-context-builder';
import type { MobileIMSupplementalInput } from '@/domain/building/mobile-im/types';
import type { InvestmentPosture } from '@/domain/ontology/enums';

// Mock LLM client to enforce deterministic fallback template execution
vi.mock('@/ai/llm-client', () => ({
  callLLM: vi.fn().mockRejectedValue(new Error('TEST_ENFORCE_DETERMINISTIC_PATH')),
  generateChatCompletion: vi.fn().mockRejectedValue(new Error('TEST_ENFORCE_DETERMINISTIC_PATH')),
}));

vi.mock('@/domain/building/mobile-im/golden-im-manager', () => ({
  buildIMFewShotBlock: vi.fn().mockResolvedValue({ formatted: '', usedIds: [] }),
  logFewShotUsage: vi.fn().mockResolvedValue(undefined),
  promoteToGoldenCandidate: vi.fn().mockResolvedValue(undefined),
  updateFewShotResultScore: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/domain/building/mobile-im/fewshot-tracker', () => ({
  logFewShotUsage: vi.fn().mockResolvedValue(undefined),
  updateFewShotResultScore: vi.fn().mockResolvedValue(undefined),
  promoteToGoldenCandidate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  }),
}));

function createTestContext(overrides?: Partial<IMGenerationContext>): IMGenerationContext {
  return {
    buildingId: 'retest-bldg-001',
    generationId: 'gen-retest-001',
    assetIdentity: {
      asset_type: 'commercial',
      area_signal: '강남구 역삼동',
      price_band: '120억',
    },
    physicalFact: {
      total_area_pyung: 350,
      plat_area_pyung: 120,
      floors: '지하 1층 / 지상 6층',
      build_year: '2019',
    },
    marketLocation: {
      area_signal: '강남구 역삼동',
    },
    buyerFit: {
      keyInvestmentPoint: '핵심 상권 우량 임대수익',
    },
    sectionPlan: {
      posture: 'income',
      sections: ['property_overview', 'lease_status', 'income_analysis'],
      emphasize: ['income_analysis'],
      suppress: [],
      required: [],
    },
    provenanceMap: [] as any,
    purchasePriceKrw: 12_000_000_000,
    totalAreaSqm: 1157.02,
    vacancyPct: 0,
    sysPromptText: 'You are a CRE expert.',
    ...overrides,
  } as any;
}

describe('Milestone 3 Remediation Retest: Adversarial Challenge', () => {

  // ──────────────────────────────────────────────────────────────────────────
  // 1. SSoT-to-IM Bridge Boundary Edge Cases
  // ──────────────────────────────────────────────────────────────────────────
  describe('SSoT Bridge Boundary & Null Safety', () => {
    it('gracefully handles explicit null ssot without throwing TypeError', () => {
      const res = bridgeDealCardToIM({ ssot: null as any });
      expect(res).toBeDefined();
      expect(res.supplemental).toBeDefined();
      expect(res.prefillData).toBeDefined();
      expect(res.gradeUpItems).toBeDefined();
      expect(res.supplemental.monthly_rent_total_krw).toBeUndefined();
    });

    it('gracefully handles explicit undefined ssot without throwing', () => {
      const res = bridgeDealCardToIM({ ssot: undefined as any });
      expect(res).toBeDefined();
      expect(res.supplemental).toBeDefined();
      expect(res.prefillData.monthlyRent).toBeUndefined();
    });

    it('gracefully handles completely empty input object {}', () => {
      const res = bridgeDealCardToIM({} as any);
      expect(res).toBeDefined();
      expect(res.supplemental).toBeDefined();
    });

    it('gracefully handles null layers and null lease_summary in ssot', () => {
      const res = bridgeDealCardToIM({
        ssot: {
          layers: null as any,
          lease_summary: null as any,
        } as any,
      });
      expect(res).toBeDefined();
      expect(res.supplemental.hotel_operating).toBeUndefined();
      expect(res.prefillData.monthlyRent).toBeUndefined();
    });

    it('correctly extracts exact sub-unit KRW and converts prefill to manwon', () => {
      const exactKrw = 45_678_901;
      const res = bridgeDealCardToIM({
        ssot: {
          lease_summary: {
            monthly_rent_total_krw: exactKrw,
          },
        } as any,
      });
      expect(res.supplemental.monthly_rent_total_krw).toBe(exactKrw);
      expect(res.prefillData.monthlyRent).toBe(4568); // 4567.8901 rounded
    });

    it('generates correct grade-up items across all 5 postures when input is empty', () => {
      const postures: InvestmentPosture[] = ['income', 'development', 'operating', 'owner_occupied', 'trading'];
      for (const p of postures) {
        const res = bridgeDealCardToIM({ ssot: null as any }, p);
        expect(res.gradeUpItems.length).toBeGreaterThan(0);
        // Common required field
        expect(res.gradeUpItems.some(i => i.field === 'address')).toBe(true);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Release Tier Lookup Robustness & Section Permissions
  // ──────────────────────────────────────────────────────────────────────────
  describe('Release Tier Lookup Robustness', () => {
    it('provides valid permissions for standard tiers', () => {
      const tiers: ReleaseTier[] = ['internal_only', 'fact_om', 'analysis_im', 'decision_im', 'expert_required'];
      for (const t of tiers) {
        const config = getTierAllowedSections(t);
        expect(config).toBeDefined();
        expect(typeof config.allowFinancials).toBe('boolean');
        expect(typeof config.allowScenario).toBe('boolean');
        expect(typeof config.allowValueAdd).toBe('boolean');
        expect(typeof config.allowRentGap).toBe('boolean');
        expect(typeof config.maxBodyPages).toBe('number');
      }
    });

    it('handles legacy tiers basic and pro safely', () => {
      const basicConfig = getTierAllowedSections('basic');
      expect(basicConfig).toBeDefined();
      expect(basicConfig.allowFinancials).toBe(true);
      expect(basicConfig.allowScenario).toBe(false);

      const proConfig = getTierAllowedSections('pro');
      expect(proConfig).toBeDefined();
      expect(proConfig.allowFinancials).toBe(true);
      expect(proConfig.allowScenario).toBe(true);
    });

    it('safely falls back to pro for unknown, null, or corrupted tier strings without throwing', () => {
      const unknownConfig = getTierAllowedSections('unknown_custom_tier');
      expect(unknownConfig).toEqual(TIER_CONFIG.pro);

      const emptyConfig = getTierAllowedSections('');
      expect(emptyConfig).toEqual(TIER_CONFIG.pro);

      const nullConfig = getTierAllowedSections(null as any);
      expect(nullConfig).toEqual(TIER_CONFIG.pro);

      const undefConfig = getTierAllowedSections(undefined as any);
      expect(undefConfig).toEqual(TIER_CONFIG.pro);
    });

    it('simulates fetch-im-data tier gating logic for all tier variants', () => {
      const testCases = [
        { tier: 'basic', section: 'income_analysis', shouldLock: false },
        { tier: 'pro', section: 'income_analysis', shouldLock: false },
        { tier: 'internal_only', section: 'income_analysis', shouldLock: true },
        { tier: 'fact_om', section: 'income_analysis', shouldLock: true },
        { tier: 'analysis_im', section: 'income_analysis', shouldLock: false },
        { tier: 'decision_im', section: 'income_analysis', shouldLock: false },
        { tier: 'expert_required', section: 'income_analysis', shouldLock: true },
        { tier: 'unknown', section: 'income_analysis', shouldLock: false },
      ];

      for (const tc of testCases) {
        const allowed = TIER_CONFIG[tc.tier as ReleaseTier] ?? TIER_CONFIG.pro;
        let isLocked = false;
        if (tc.section === 'income_analysis' && !allowed.allowFinancials) isLocked = true;
        expect(isLocked).toBe(tc.shouldLock);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Rent Calculation Backfill & Fallback Template Unlocked Output
  // ──────────────────────────────────────────────────────────────────────────
  describe('Rent Calculation Backfill & Fallback Rendering', () => {
    it('backfills monthly_rent_total_krw in supplemental from floor_leases in im-section-generator', async () => {
      const ctx = createTestContext();
      const supplemental: MobileIMSupplementalInput = {
        asking_price_manwon: 1_200_000,
        floor_leases: [
          { floor: 'B1', rent_manwon: 400, deposit_manwon: 3000 },
          { floor: '1F', rent_manwon: 1800, deposit_manwon: 10000 },
          { floor: '2F', rent_manwon: 1200, deposit_manwon: 8000 },
        ],
      };

      const result = await generateSingleSection(
        'income_analysis',
        2,
        ctx,
        {} as any,
        supplemental,
        null,
        {},
        { forceFastTemplate: true }
      );

      // Backfill verification: supplemental.monthly_rent_total_krw must be 34,000,000 KRW
      expect(supplemental.monthly_rent_total_krw).toBe(34_000_000);

      // Must NOT contain the locked message
      expect(result.section.markdown).not.toContain('🔒 **임대 현황 데이터 확보 후 수익 분석이 제공됩니다.**');

      // Must contain rendered financial calculations
      expect(result.section.markdown).toContain('실투자금 대비 연 순수익(약 4.08억 원)');
      expect(result.section.markdown).toContain('총 수익률(Gross Yield)');
    });

    it('directly calculates floorLeasesSum in generatePremiumTemplate even if supplemental is not pre-mutated', () => {
      const templateMd = generatePremiumTemplate(
        'income_analysis',
        { price_band: '120억', area_signal: '역삼동', asset_type: 'commercial' },
        {},
        {},
        {},
        {
          asking_price_manwon: 1_200_000,
          floor_leases: [
            { floor: '1F', rent_manwon: 2000, deposit_manwon: 10000 },
            { floor: '2F', rent_manwon: 1000, deposit_manwon: 5000 },
          ],
        },
        null,
        {},
        'income'
      );

      expect(templateMd).not.toContain('🔒 **임대 현황 데이터 확보 후 수익 분석이 제공됩니다.**');
      expect(templateMd).toContain('실투자금 대비 연 순수익(약 3.6억 원)');
    });

    it('gracefully emits locked message when both root rent and floor_leases are missing', () => {
      const templateMd = generatePremiumTemplate(
        'income_analysis',
        { price_band: '120억', area_signal: '역삼동', asset_type: 'commercial' },
        {},
        {},
        {},
        { asking_price_manwon: 1_200_000 }, // no rent at all
        null,
        {},
        'income'
      );

      expect(templateMd).toContain('🔒 **임대 현황 데이터 확보 후 수익 분석이 제공됩니다.**');
    });

    it('replaces evasive 확인 필요 with neutral - in property_overview under completely empty physical facts', () => {
      const templateMd = generatePremiumTemplate(
        'property_overview',
        {},
        {},
        {},
        {},
        {},
        null,
        {},
        'income'
      );

      expect(templateMd).not.toContain('확인 필요');
      expect(templateMd).toContain('| **연면적** | - |');
      expect(templateMd).toContain('| **대지면적** | - |');
    });

    it('replaces evasive 확인 필요 with neutral - in lease_status when rent is zero but vacancy is known', () => {
      const templateMd = generatePremiumTemplate(
        'lease_status',
        {},
        { vacancy_signal: '만실' },
        {},
        {},
        { vacancy_pct: 0 },
        null,
        {},
        'income'
      );

      expect(templateMd).not.toContain('확인 필요');
      expect(templateMd).toContain('| **월 임대료 합계** | - |');
      expect(templateMd).toContain('| **연 임대 수입** | - |');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Non-Income Posture Isolation Under Degraded Inputs
  // ──────────────────────────────────────────────────────────────────────────
  describe('Non-Income Posture Isolation', () => {
    it('does not format basic income markdown or inject rental NOI when development posture has purchasePriceKrw = 0', async () => {
      const devCtx = createTestContext({
        sectionPlan: {
          posture: 'development',
          sections: ['development_feasibility'],
          emphasize: [],
          suppress: [],
          required: [],
        },
        purchasePriceKrw: 0,
      });

      const supplemental: MobileIMSupplementalInput = {
        monthly_rent_total_krw: 30_000_000,
        floor_leases: [{ floor: '1F', rent_manwon: 3000 }],
      };

      const result = await generateSingleSection(
        'development_feasibility',
        0,
        devCtx,
        {} as any,
        supplemental,
        null,
        {},
        { forceFastTemplate: true }
      );

      expect(result.section.section_type).toBe('development_feasibility');
      // Should not contain basic rental income NOI table
      expect(result.section.markdown).not.toContain('순영업소득(NOI)');
      expect(result.section.markdown).not.toContain('Cap Rate');
    });

    it('does not leak income analysis tables into operating or owner_occupied postures', async () => {
      const opCtx = createTestContext({
        sectionPlan: {
          posture: 'operating',
          sections: ['operation_overview'],
          emphasize: [],
          suppress: [],
          required: [],
        },
        purchasePriceKrw: 0,
      });

      const opResult = await generateSingleSection(
        'operation_overview',
        0,
        opCtx,
        {} as any,
        {},
        null,
        {},
        { forceFastTemplate: true }
      );

      expect(opResult.section.markdown).not.toContain('순영업소득(NOI)');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Zero Poison Tokens & Clean Serializability
  // ──────────────────────────────────────────────────────────────────────────
  describe('Zero Poison Tokens & Serializability', () => {
    it('renders zero poison tokens across all templates under degenerate empty inputs', () => {
      const sections = [
        'property_overview',
        'location_access',
        'tenant_mix',
        'lease_status',
        'income_analysis',
        'risk_check',
        'investment_thesis',
        'next_steps',
        'occupancy_fit',
        'cost_comparison',
        'site_analysis',
        'development_feasibility',
        'operation_overview',
        'gop_analysis',
        'market_position',
        'comparable_analysis',
      ];

      for (const sec of sections) {
        const md = generatePremiumTemplate(
          sec as any,
          {},
          {},
          {},
          {},
          {},
          null,
          {},
          'income'
        );

        expect(md).not.toContain('NaN');
        expect(md).not.toContain('undefined');
        expect(md).not.toContain('null');
        expect(md).not.toContain('[object Object]');
      }
    });
  });
});
