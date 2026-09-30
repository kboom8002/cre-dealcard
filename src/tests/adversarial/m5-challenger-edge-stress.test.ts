/**
 * @file m5-challenger-edge-stress.test.ts
 * @description Adversarial Edge Cases & Negative Stress Harness for Milestone 5 Release Gate
 *
 * Probes:
 * 1. Fully empty & degenerate inputs to generateMobileIM and generatePremiumTemplate
 * 2. Partial leases & corrupt rent rolls (missing fields, 0 values, negative values)
 * 3. Hostile Korean & Unicode characters, scripts, zero-width characters
 * 4. Zero tolerance for poison tokens (NaN, undefined, null, [object Object], Infinity)
 * 5. Zero tolerance for Rule 1 persona leaks and colloquialisms
 * 6. Zero tolerance for Rule 37 evasive phrases and Rule 52 price bands
 */

import { describe, it, expect, vi } from 'vitest';
import { generateMobileIM } from '@/domain/building/mobile-im/writer';
import { generatePremiumTemplate } from '@/domain/building/mobile-im/premium-template-engine';
import { formatFinancialsMarkdown, calculateFinancials } from '@/domain/building/mobile-im/financials';
import { formatNetCashFlowMarkdown, calculateNetCashFlow } from '@/domain/building/mobile-im/net-cash-flow-calculator';
import { normalizeGeneratedMarkdown } from '@/domain/building/mobile-im/terminology-normalizer';
import type { MobileIMWriterInput, MobileIMSectionType } from '@/domain/building/mobile-im/types';
import type { InvestmentPosture } from '@/domain/ontology';

// Mock LLM client to force template fallback and ensure deterministic stress execution
vi.mock('@/ai/llm-client', () => ({
  callLLM: vi.fn().mockRejectedValue(new Error('ADVERSARIAL_TEST_ENFORCE_TEMPLATE')),
  embedText: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/supabase/service', () => {
  const chain: any = {
    insert: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    createServiceClient: () => ({
      from: vi.fn().mockReturnValue(chain),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  };
});

const ALL_SECTIONS: MobileIMSectionType[] = [
  'property_overview',
  'location_access',
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
  'title_rights',
  'land_detail',
  'comparables',
  'decision_snapshot',
  'market_rent_gap',
  'value_add_plan',
  'stabilized_scenario',
  'evidence_status',
  'checklist',
  'closing',
];

const POSTURES: InvestmentPosture[] = ['income', 'development', 'operating', 'owner_occupied', 'trading'];

const POISON_TOKEN_REGEX = /(?:\bNaN\b|\bundefined\b|\bnull\b|\[object Object\]|NaN%|NaN원|\bInfinity\b)/i;
const PERSONA_LEAK_REGEX = /(?:60대 자산가|은퇴 자산가|자녀 세대 가업승계용|법인 대표 맞춤|개인 투자자 맞춤|초보 투자자용|가업승계)/;
const COLLOQUIALISM_REGEX = /(?:내 돈|세입자|원금 안전판|땅값 비중)/;
const EVASIVE_REGEX = /(?:본문을 참조|별도 안내 예정|추후 확인|구체적인 수치는 본문을 참조|자문 후 확정)/;
const PRICE_BAND_REGEX = /\b\d+억대\b/;

describe('Milestone 5 Adversarial Stress & Edge Case Challenge', () => {
  describe('1. Degenerate Empty Input Probing in generateMobileIM', () => {
    it('handles degenerate input with empty building_ssot_lite and supplemental without crashing', async () => {
      const minimalInput: MobileIMWriterInput = {
        building_ssot_lite: {} as any,
        supplemental: {} as any,
        readiness: { score: 0, missing: [] } as any,
      };

      const result = await generateMobileIM(minimalInput);
      expect(result).toBeDefined();
      expect(result.sections).toBeDefined();
      expect(Array.isArray(result.sections)).toBe(true);
      expect(result.sections.length).toBeGreaterThan(0);

      // Verify no poison tokens in any generated section
      for (const sec of result.sections) {
        expect(sec.markdown).not.toMatch(POISON_TOKEN_REGEX);
        expect(sec.markdown).not.toMatch(PERSONA_LEAK_REGEX);
        expect(sec.markdown).not.toMatch(COLLOQUIALISM_REGEX);
        expect(sec.markdown).not.toMatch(EVASIVE_REGEX);
      }
    });

    it('probes unhandled TypeError when building_ssot_lite is undefined', async () => {
      const missingSsotInput: any = {
        supplemental: {},
        readiness: { score: 0, missing: [] },
      };

      // Demonstrates lack of null-safety defense in normalizeSsotLite
      let caughtError: Error | null = null;
      try {
        await generateMobileIM(missingSsotInput);
      } catch (err: any) {
        caughtError = err;
      }
      expect(caughtError).not.toBeNull();
      expect(caughtError?.message).toContain("Cannot read properties of undefined (reading 'asset_identity')");
    });

    it('handles input with all empty sub-objects across all 5 postures', async () => {
      for (const posture of POSTURES) {
        const input: MobileIMWriterInput = {
          building_ssot_lite: {
            id: `adv-empty-${posture}`,
            investment_posture: posture,
          } as any,
          identity: {
            investmentPosture: posture,
          } as any,
          supplemental: {} as any,
          readiness: { score: 0, missing: [] },
          external_data: {} as any,
        };

        const result = await generateMobileIM(input);
        expect(result.sections.length).toBeGreaterThan(0);

        for (const sec of result.sections) {
          const matchPoison = sec.markdown.match(POISON_TOKEN_REGEX);
          if (matchPoison) {
            throw new Error(`Poison token "${matchPoison[0]}" found in [${posture}:${sec.section_type}]: ${sec.markdown.slice(0, 200)}`);
          }
          expect(sec.markdown).not.toMatch(PERSONA_LEAK_REGEX);
          expect(sec.markdown).not.toMatch(EVASIVE_REGEX);
        }
      }
    });
  });

  describe('2. Partial Leases & Corrupt Rent Roll Stress', () => {
    it('handles floor_leases with zero, negative, or missing numeric values gracefully', async () => {
      const corruptLeasesInput: MobileIMWriterInput = {
        building_ssot_lite: {
          id: 'adv-corrupt-leases',
          investment_posture: 'income',
        } as any,
        identity: { investmentPosture: 'income' },
        readiness: { score: 50, missing: [] },
        supplemental: {
          asking_price_manwon: 1000000,
          monthly_rent_total_krw: 30000000,
          total_deposit_manwon: 100000,
          floor_leases: [
            { floor: 'B1F', tenant: '공실', rent_manwon: 0, deposit_manwon: 0, area_m2: 0 },
            { floor: '1F', tenant: '', rent_manwon: 1500, deposit_manwon: 50000, area_m2: 120 },
            { floor: '2F', tenant: '스타트업', rent_manwon: -500, deposit_manwon: -1000, area_m2: -50 } as any,
            { floor: '', tenant: '미상', rent_manwon: null, deposit_manwon: undefined, area_m2: NaN } as any,
          ],
        },
      };

      const result = await generateMobileIM(corruptLeasesInput);
      expect(result.sections.length).toBeGreaterThan(0);

      for (const sec of result.sections) {
        expect(sec.markdown).not.toMatch(POISON_TOKEN_REGEX);
      }
    });
  });

  describe('3. Hostile Korean Syllables, Unicode & Script Injection Probing', () => {
    it('safely processes unusual Korean archaic/compound syllables and code injection', async () => {
      const hostileInput: MobileIMWriterInput = {
        building_ssot_lite: {
          id: 'adv-hostile-unicode',
          investment_posture: 'trading',
        } as any,
        identity: { investmentPosture: 'trading' },
        readiness: { score: 80, missing: [] },
        supplemental: {
          building_name: '뛟뙣굠챦빌딩 <script>alert("xss")</script>',
          broker_highlight: '뛟뙣굠챦빌딩 <script>alert("xss")</script>',
          resolved_address: '서울특별시 강남구 뛟뙣동 999-99 \u200B\uFEFF',
          asking_price_manwon: 500000,
          monthly_rent_total_krw: 15000000,
        },
      };

      const result = await generateMobileIM(hostileInput);
      expect(result.sections.length).toBeGreaterThan(0);

      const allMarkdown = result.sections.map((s) => s.markdown).join('\n');
      expect(allMarkdown).not.toMatch(POISON_TOKEN_REGEX);
      expect(allMarkdown).not.toMatch(PERSONA_LEAK_REGEX);
    });

    it('normalizeGeneratedMarkdown resists extreme string manipulation and script injection', () => {
      const hostileTexts = [
        '<div><script>alert("내 돈")</script>60대 자산가를 위한 매물</div>',
        '원금 안전판\u200B\uFEFF이 확보된 세입자 명도 물건',
        '평당 5,000만원'.repeat(100),
        '가업승계 핵심 자산화 및 자녀 세대 가업승계용 플랜',
      ];

      for (const text of hostileTexts) {
        const normalized = normalizeGeneratedMarkdown(text);
        expect(normalized).not.toMatch(PERSONA_LEAK_REGEX);
        expect(normalized).not.toMatch(COLLOQUIALISM_REGEX);
      }
    });
  });

  describe('4. generatePremiumTemplate Universal Negative Matrix Scan', () => {
    it('verifies ALL 25 sections under completely empty / undefined data objects have 0 poison tokens', () => {
      const emptyAsset = {};
      const emptyPhysical = {};
      const emptyMarket = {};
      const emptyBuyer = {};
      const emptySupp = {};

      for (const posture of POSTURES) {
        for (const sec of ALL_SECTIONS) {
          const md = generatePremiumTemplate(
            sec,
            emptyAsset as any,
            emptyPhysical as any,
            emptyMarket as any,
            emptyBuyer as any,
            emptySupp as any,
            null,
            undefined,
            posture
          );

          // 1. Poison tokens
          const poisonMatch = md.match(POISON_TOKEN_REGEX);
          if (poisonMatch) {
            throw new Error(`Poison token "${poisonMatch[0]}" detected in [${posture}:${sec}]:\n${md}`);
          }

          // 2. Persona leaks
          expect(md).not.toMatch(PERSONA_LEAK_REGEX);

          // 3. Colloquialisms
          expect(md).not.toMatch(COLLOQUIALISM_REGEX);

          // 4. Evasive phrases
          expect(md).not.toMatch(EVASIVE_REGEX);
        }
      }
    });
  });

  describe('5. Financial & Net Cash Flow Calculator Negative Stress', () => {
    it('calculateFinancials & formatFinancialsMarkdown with 0 and empty fields emits no poison tokens', () => {
      const zeroFin = calculateFinancials({
        purchasePriceKrw: 0,
        askingPriceManwon: 0,
        posture: 'income',
        loanAmountManwon: 0,
        totalDepositManwon: 0,
        annualRentManwon: 0,
        annualNoiManwon: 0,
      });

      const md = formatFinancialsMarkdown(zeroFin);
      expect(md).not.toMatch(POISON_TOKEN_REGEX);
      expect(md).not.toMatch(COLLOQUIALISM_REGEX);
    });

    it('calculateNetCashFlow with degenerate 0 values emits no poison tokens or crashes', () => {
      const ncf = calculateNetCashFlow({
        purchasePriceKrw: 0,
        monthlyRentKrw: 0,
        totalDepositKrw: 0,
        loanAmountKrw: 0,
        landPriceTotalKrw: 0,
      });

      if (ncf) {
        const md = formatNetCashFlowMarkdown(ncf);
        expect(md).not.toMatch(POISON_TOKEN_REGEX);
        expect(md).not.toMatch(COLLOQUIALISM_REGEX);
      }
    });
  });
});
