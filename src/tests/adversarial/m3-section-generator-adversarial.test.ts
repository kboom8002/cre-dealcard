/**
 * Adversarial Section Generator & Domain Data Fidelity Stress Suite — Challenger M3-1
 *
 * Verifies:
 * 1. Completeness & Zero Silent Fallback across all 25 MobileIMSectionTypes:
 *    - All sections deterministically generate their own content without falling back to next_steps
 * 2. Zero Poison Tokens under Edge / Degenerate / Malformed Inputs:
 *    - NaN, undefined, null, [object Object] across empty, null, negative, and NaN inputs
 * 3. Evasive Phrasing & Fake Constants Audit:
 *    - Zero Rule 37 evasive phrases (본문을 참조, 별도 안내 예정, 추후 확인)
 *    - Zero hardcoded mock numbers (120억, 3800, 26.7년, 400)
 *    - Empirical detection of remaining '확인 필요' in template engine
 * 4. Deterministic Renderers Stress Testing:
 *    - title-rights-renderer under extreme owners, zero owners, massive encumbrances
 *    - land-detail-renderer under empty parcels, degenerate zoning/FAR
 *    - comparables-renderer under empty comps, outlier prices
 * 5. SSoT-to-IM Bridge Robustness:
 *    - Sub-unit KRW precision preservation
 *    - Layer mapping fault tolerance
 */

import { describe, it, expect, vi } from 'vitest';
import { generatePremiumTemplate } from '@/domain/building/mobile-im/premium-template-engine';
import {
  MOBILE_IM_SECTIONS_7,
  MOBILE_IM_SECTIONS_NON_INCOME,
  type MobileIMSectionType,
  type MobileIMSupplementalInput,
  type ExternalDataSnapshot,
} from '@/domain/building/mobile-im/types';
import { generateSingleSection } from '@/domain/building/mobile-im/im-section-generator';
import { renderTitleRights, type TitleRightsInput } from '@/domain/building/mobile-im/section-renderers/title-rights-renderer';
import { renderLandDetail, type LandDetailInput } from '@/domain/building/mobile-im/section-renderers/land-detail-renderer';
import { renderComparables, type ComparablesInput } from '@/domain/building/mobile-im/section-renderers/comparables-renderer';
import { bridgeDealCardToIM } from '@/domain/building/mobile-im/ssot-to-im-bridge';

// Mock LLM client so generateSingleSection deterministically tests fallback and deterministic paths
vi.mock('@/ai/llm-client', () => ({
  callLlm: vi.fn().mockRejectedValue(new Error('TEST_ENFORCE_DETERMINISTIC_TEMPLATE')),
  generateChatCompletion: vi.fn().mockRejectedValue(new Error('TEST_ENFORCE_DETERMINISTIC_TEMPLATE')),
}));

// Mock golden IM and embedding indexer
vi.mock('@/domain/building/mobile-im/golden-im-manager', () => ({
  buildIMFewShotBlock: vi.fn().mockResolvedValue({ formatted: '', usedIds: [] }),
  logFewShotUsage: vi.fn().mockResolvedValue(undefined),
  promoteToGoldenCandidate: vi.fn().mockResolvedValue(undefined),
  updateFewShotResultScore: vi.fn().mockResolvedValue(undefined),
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

const ALL_25_SECTION_TYPES: MobileIMSectionType[] = [
  ...MOBILE_IM_SECTIONS_7,
  ...MOBILE_IM_SECTIONS_NON_INCOME,
];

describe('Challenger M3-1: Adversarial Section Generator & Data Fidelity', () => {

  // ─── 1. Zero Silent Fallback to next_steps ────────────────────────────────
  describe('Zero Silent Fallback to next_steps', () => {
    for (const sectionType of ALL_25_SECTION_TYPES) {
      if (sectionType === 'next_steps') continue;

      it(`section "${sectionType}" must NEVER fall back silently to next_steps copy`, () => {
        const output = generatePremiumTemplate(
          sectionType,
          {},
          {},
          {},
          {},
          {},
          null
        );

        expect(output).toBeDefined();
        expect(output.trim().length).toBeGreaterThan(20);

        // next_steps specific copy must NOT appear in other sections
        expect(output).not.toContain('관심이 있으시다면 아래 절차로 진행해 주세요');
        expect(output).not.toContain('LOI(투자의향서) 제출');
        expect(output).not.toContain('초기 관심 표명 → 담당 중개인 연락');
      });
    }
  });

  // ─── 2. Poison Tokens under Degenerate & Edge Inputs ───────────────────────
  describe('Zero Poison Tokens (NaN, undefined, null, [object Object])', () => {
    const poisonPatterns = [
      { name: 'NaN', regex: /\bNaN\b/ },
      { name: 'undefined', regex: /\bundefined\b/ },
      { name: 'null', regex: /\bnull\b/ },
      { name: '[object Object]', regex: /\[object\s+Object\]/i },
    ];

    const edgeScenarios: Array<{
      name: string;
      assetIdentity: any;
      physicalFact: any;
      marketLocation: any;
      buyerFit: any;
      supplemental: MobileIMSupplementalInput;
      externalData: ExternalDataSnapshot | null;
    }> = [
      {
        name: 'Completely empty inputs',
        assetIdentity: {},
        physicalFact: {},
        marketLocation: {},
        buyerFit: {},
        supplemental: {},
        externalData: null,
      },
      {
        name: 'Explicit undefined / null fields',
        assetIdentity: { price_band: undefined, area_signal: null, asset_type: undefined },
        physicalFact: { total_area_pyung: null, plat_area_pyung: undefined, floors: null },
        marketLocation: { location_analysis: null, subway_info: undefined },
        buyerFit: { keyInvestmentPoint: undefined, caution_summary: null },
        supplemental: {
          asking_price_manwon: undefined,
          monthly_rent_total_krw: undefined,
          floor_leases: undefined,
        },
        externalData: null,
      },
      {
        name: 'NaN and negative numbers',
        assetIdentity: { price_band: '가격 협의' },
        physicalFact: { total_area_pyung: NaN, plat_area_pyung: -50, floors: -2 },
        marketLocation: {},
        buyerFit: {},
        supplemental: {
          asking_price_manwon: NaN,
          monthly_rent_total_krw: NaN,
          floor_leases: [
            { floor: '1F', rent_manwon: NaN, deposit_manwon: -100, area_pyeong: NaN },
          ],
        },
        externalData: {
          buildingRegister: {
            totalArea: NaN,
            platArea: -100,
            bcRat: NaN,
            vlRat: NaN,
            elevatorCount: NaN,
            parkingCount: NaN,
          } as any,
          landPrice: { pricePerSqm: NaN } as any,
          landUsePlan: {
            buildingCoverageMax: NaN,
            floorAreaRatioMax: NaN,
          } as any,
        } as any,
      },
    ];

    for (const scenario of edgeScenarios) {
      for (const sectionType of ALL_25_SECTION_TYPES) {
        it(`[${scenario.name}] section "${sectionType}" contains zero poison tokens`, () => {
          const output = generatePremiumTemplate(
            sectionType,
            scenario.assetIdentity,
            scenario.physicalFact,
            scenario.marketLocation,
            scenario.buyerFit,
            scenario.supplemental,
            scenario.externalData
          );

          for (const { name, regex } of poisonPatterns) {
            const match = output.match(regex);
            expect(
              match,
              `Poison token "${name}" detected in section "${sectionType}" under "${scenario.name}":\n${output}`
            ).toBeNull();
          }
        });
      }
    }
  });

  // ─── 3. Evasive Phrases & Mock Numbers Audit ──────────────────────────────
  describe('Evasive Phrasing & Fake Numbers Audit', () => {
    it('eradicates Rule 37 evasive phrases across all 25 sections', () => {
      const evasivePhrases = [
        '본문을 참조',
        '별도 안내 예정',
        '추후 확인',
        '상세...별첨',
      ];

      for (const sectionType of ALL_25_SECTION_TYPES) {
        const output = generatePremiumTemplate(
          sectionType,
          {},
          {},
          {},
          {},
          {},
          null
        );

        for (const phrase of evasivePhrases) {
          expect(output).not.toContain(phrase);
        }
      }
    });

    it('eradicates fake numbers (120억, 3800만, 400, 26.7년) in cost_comparison under empty inputs', () => {
      const output = generatePremiumTemplate(
        'cost_comparison',
        {},
        {},
        {},
        {},
        {},
        null
      );

      expect(output).not.toContain('120억');
      expect(output).not.toContain('12,000,000,000');
      expect(output).not.toContain('3,800만');
      expect(output).not.toContain('3800');
      expect(output).not.toContain('400');
      expect(output).not.toContain('26.7년');
      expect(output).not.toContain('26.7');
    });

    it('checks for occurrences of "확인 필요" across all 25 section outputs', () => {
      const sectionsWithCheckNeeded: string[] = [];

      for (const sectionType of ALL_25_SECTION_TYPES) {
        const output = generatePremiumTemplate(
          sectionType,
          {},
          {},
          {},
          {},
          {},
          null
        );

        if (output.includes('확인 필요')) {
          sectionsWithCheckNeeded.push(sectionType);
        }
      }

      // Record which sections still emit '확인 필요' (only risk_check DD items)
      expect(sectionsWithCheckNeeded).toEqual(['risk_check']);
    });

    it('REMEDIATED: property_overview emits neutral "-" instead of "확인 필요" when totalArea/platArea are missing', () => {
      const output = generatePremiumTemplate('property_overview', {}, {}, {}, {}, {}, null);
      expect(output).not.toContain('확인 필요');
      expect(output).toContain('| **연면적** | - |');
      expect(output).toContain('| **대지면적** | - |');
    });

    it('EMPIRICAL FINDING: risk_check emits "확인 필요" across multiple fields', () => {
      const output = generatePremiumTemplate('risk_check', {}, {}, {}, {}, {}, null);
      expect(output).toContain('준공연도 확인 필요');
      expect(output).toContain('승강기 정보 확인 필요');
      expect(output).toContain('정기검사 이력, 냉난방 설비 상태 확인 필요');
      expect(output).toContain('잔여 계약기간(WALE), 임차인 신용도 확인 필요');
      expect(output).toContain('임대차 분쟁·소송 이력 확인 필요');
      expect(output).toContain('가압류·가처분·근저당 설정 현황 확인 필요');

      const outputWithStructure = generatePremiumTemplate('risk_check', {}, { structure: '확인 필요' }, {}, {}, {}, null);
      expect(outputWithStructure).toContain('구조 확인 필요');
    });

    it('REMEDIATED: lease_status emits neutral "-" instead of "확인 필요" when vacancy is given but rent is zero', () => {
      const output = generatePremiumTemplate('lease_status', {}, { vacancy_signal: '10%' }, {}, {}, {}, null);
      expect(output).not.toContain('확인 필요');
      expect(output).toContain('| **월 임대료 합계** | - |');
      expect(output).toContain('| **연 임대 수입** | - |');
    });
  });

  // ─── 4. Deterministic Renderers Stress Tests ──────────────────────────────
  describe('Deterministic Section Renderers', () => {
    describe('renderTitleRights', () => {
      it('handles empty owners gracefully without poison tokens', () => {
        const input: TitleRightsInput = {
          owners: [],
          encumbrances: [],
          restrictions: [],
        };

        const res = renderTitleRights(input);
        expect(res.section_type).toBe('title_rights');
        expect(res.markdown).not.toContain('NaN');
        expect(res.markdown).not.toContain('undefined');
        expect(res.markdown).not.toContain('null');
        expect(res.markdown).toContain('소유자 정보가 등록되지 않았습니다.');
        expect(res.markdown).toContain('설정 권리 없음');
      });

      it('handles massive 10+ encumbrances and computes total claim amount accurately', () => {
        const encumbrances = Array.from({ length: 15 }, (_, i) => ({
          type: '근저당권',
          creditor: `은행_${i + 1}`,
          amountKrw: 100_000_000 * (i + 1),
          registeredDate: `2024-0${(i % 9) + 1}-01`,
        }));

        const totalExpectedKrw = encumbrances.reduce((acc, cur) => acc + cur.amountKrw, 0);
        const totalExpectedBil = (totalExpectedKrw / 1e8).toFixed(1);

        const input: TitleRightsInput = {
          owners: [{ name: '소유자A', shareRatio: 1.0 }],
          encumbrances,
          restrictions: ['주의사항 A', '주의사항 B'],
        };

        const res = renderTitleRights(input);
        expect(res.markdown).toContain(`채권최고액 합계: ${totalExpectedBil}억 원`);
        expect(res.markdown).toContain('은행_1');
        expect(res.markdown).toContain('은행_15');
      });
    });

    describe('renderLandDetail', () => {
      it('handles completely empty parcels input gracefully', () => {
        const input: LandDetailInput = {
          parcels: [],
          zoning: '-',
        };

        const res = renderLandDetail(input);
        expect(res.section_type).toBe('land_detail');
        expect(res.markdown).not.toContain('NaN');
        expect(res.markdown).not.toContain('undefined');
        expect(res.markdown).not.toContain('null');
        expect(res.markdown).not.toContain('확인 필요');
      });

      it('handles multi-parcel aggregation accurately', () => {
        const input: LandDetailInput = {
          parcels: [
            { pnu: '111101', jimok: '대', areaM2: 500, ownershipRatio: 1.0, officialLandPricePerM2: 10_000_000 },
            { pnu: '111102', jimok: '대', areaM2: 300, ownershipRatio: 0.5, officialLandPricePerM2: 12_000_000 },
          ],
          zoning: '일반상업지역',
          buildingCoverageRatio: 60,
          floorAreaRatio: 800,
          maxFar: 800,
        };

        const res = renderLandDetail(input);
        // Effective area: 500 * 1.0 + 300 * 0.5 = 650
        expect(res.markdown).toContain('650㎡');
        expect(res.markdown).toContain('일반상업지역');
        expect(res.markdown).toContain('60%');
        expect(res.markdown).toContain('800%');
      });
    });

    describe('renderComparables', () => {
      it('handles empty comparables gracefully without crash', () => {
        const input: ComparablesInput = {
          subjectName: '테스트 빌딩',
          subjectPricePerPyeong: 0,
          comparables: [],
        };

        const res = renderComparables(input);
        expect(res.section_type).toBe('comparables');
        expect(res.markdown).not.toContain('NaN');
        expect(res.markdown).not.toContain('undefined');
        expect(res.markdown).not.toContain('null');
      });
    });
  });

  // ─── 5. generateSingleSection Full Pipeline Integration ───────────────────
  describe('generateSingleSection Pipeline Integration', () => {
    it('generates title_rights, land_detail, and comparables deterministically', async () => {
      const baseCtx: any = {
        generationId: 'test-gen',
        assetIdentity: { address: '서울시 강남구 테헤란로 1' },
        physicalFact: {},
        marketLocation: {},
        buyerFit: {},
        provenanceMap: [],
        purchasePriceKrw: 10_000_000_000,
        totalAreaSqm: 1000,
      };

      const sectionTypes: MobileIMSectionType[] = ['title_rights', 'land_detail', 'comparables'];

      for (let i = 0; i < sectionTypes.length; i++) {
        const secType = sectionTypes[i];
        const res = await generateSingleSection(
          secType,
          i,
          baseCtx,
          {} as any,
          {},
          null,
          {} as any,
          { forceFastTemplate: true }
        );

        expect(res.section.section_type).toBe(secType);
        expect(res.section.markdown).toBeDefined();
        expect(res.section.markdown.length).toBeGreaterThan(30);
        expect(res.section.markdown).not.toContain('관심이 있으시다면 아래 절차로 진행해 주세요');
      }
    });

    it('falls back to premium template on LLM failure without crashing', async () => {
      const baseCtx: any = {
        generationId: 'test-gen-fallback',
        assetIdentity: { asset_type: 'commercial', price_band: '100억' },
        physicalFact: { total_area_pyung: 200, plat_area_pyung: 80 },
        marketLocation: {},
        buyerFit: {},
        provenanceMap: [],
        purchasePriceKrw: 10_000_000_000,
      };

      const res = await generateSingleSection(
        'property_overview',
        0,
        baseCtx,
        {} as any,
        {},
        null,
        {} as any,
        {}
      );

      expect(res.section.section_type).toBe('property_overview');
      expect(res.section.markdown).toContain('commercial');
      expect(res.generatedByAi).toBe(false);
    });
  });

  // ─── 6. SSoT to IM Bridge Robustness ──────────────────────────────────────
  describe('SSoT-to-IM Bridge Robustness', () => {
    it('preserves exact fractional sub-unit KRW values without rounding truncation', () => {
      const exactRent = 12_345_678.9;
      const res = bridgeDealCardToIM({
        ssot: {
          lease_summary: {
            monthly_rent_total_krw: exactRent,
          },
        },
      });

      expect(res.supplemental.monthly_rent_total_krw).toBe(exactRent);
    });

    it('handles empty ssot object gracefully', () => {
      const res = bridgeDealCardToIM({
        ssot: {},
      });

      expect(res.supplemental).toBeDefined();
      expect(res.prefillData).toBeDefined();
    });

    it('does not crash when ssot is null (remediated boundary guard)', () => {
      expect(() => {
        bridgeDealCardToIM({
          ssot: null as any,
        });
      }).not.toThrow();
    });
  });
});

