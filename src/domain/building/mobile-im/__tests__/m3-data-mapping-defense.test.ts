import { describe, it, expect } from 'vitest';
import { renderTitleRights, type TitleRightsInput } from '../section-renderers/title-rights-renderer';
import { renderLandDetail, type LandDetailInput } from '../section-renderers/land-detail-renderer';
import { generatePremiumTemplate } from '../premium-template-engine';
import { bridgeDealCardToIM } from '../ssot-to-im-bridge';

describe('Milestone 3 Data Mapping & Domain Missing Data Defense', () => {
  describe('renderTitleRights', () => {
    it('renders single owner and encumbrances correctly', () => {
      const input: TitleRightsInput = {
        owners: [{ name: '홍길동', shareRatio: 1.0 }],
        encumbrances: [
          {
            type: '근저당권',
            creditor: '신한은행',
            amountKrw: 3_500_000_000,
            registeredDate: '2021-05-12',
          },
        ],
        restrictions: ['임차보증금 반환 확약서 징구 요망'],
      };

      const result = renderTitleRights(input);
      expect(result.section_type).toBe('title_rights');
      expect(result.title).toBe('권리관계 요약');
      expect(result.confidence).toBe('deterministic');
      expect(result.markdown).toContain('단독 소유: 홍길동');
      expect(result.markdown).toContain('신한은행');
      expect(result.markdown).toContain('35.0억');
      expect(result.markdown).toContain('채권최고액 합계: 35.0억 원');
      expect(result.markdown).toContain('임차보증금 반환 확약서 징구 요망');
    });

    it('renders co-owners and clean status when encumbrances are empty', () => {
      const input: TitleRightsInput = {
        owners: [
          { name: '김철수', shareRatio: 0.6 },
          { name: '이영희', shareRatio: 0.4 },
        ],
        encumbrances: [],
        restrictions: [],
      };

      const result = renderTitleRights(input);
      expect(result.markdown).toContain('공동 소유 (2인)');
      expect(result.markdown).toContain('김철수: 지분 60.0%');
      expect(result.markdown).toContain('이영희: 지분 40.0%');
      expect(result.markdown).toContain('설정 권리 없음 ✅');
    });
  });

  describe('premium-template-engine switch cases completeness', () => {
    const dummyAsset = { asset_type: 'commercial' };
    const dummyPhysical = { total_area_pyung: 300, plat_area_pyung: 100 };
    const dummyMarket = {};
    const dummyBuyer = { keyInvestmentPoint: '우수한 입지 및 접근성' };
    const dummySupplemental = {
      asking_price_manwon: 1_200_000,
      monthly_rent_total_krw: 25_000_000,
      broker_highlight: '핵심 상권 대로변 빌딩',
      floor_leases: [
        { floor: '1F', rent_manwon: 1500, deposit_manwon: 20000 },
        { floor: '2F', rent_manwon: 1000, deposit_manwon: 10000 },
      ],
    };

    const newSections = [
      'title_rights',
      'decision_snapshot',
      'market_rent_gap',
      'value_add_plan',
      'stabilized_scenario',
      'evidence_status',
    ] as const;

    for (const sec of newSections) {
      it(`renders dedicated template for ${sec} without falling back to next_steps`, () => {
        const md = generatePremiumTemplate(
          sec,
          dummyAsset,
          dummyPhysical,
          dummyMarket,
          dummyBuyer,
          dummySupplemental,
          null
        );

        expect(md).toBeDefined();
        expect(md.length).toBeGreaterThan(50);
        // Guarantee no fallback to next_steps
        expect(md).not.toContain('관심이 있으시다면 아래 절차로 진행해 주세요');
        expect(md).not.toContain('NDA 체결');
        expect(md).not.toContain('LOI(투자의향서) 제출');
      });
    }

    it('eradicates fake numbers (120억, 3800만, 400, 26.7년) in cost_comparison', () => {
      const emptySupp = { asking_price_manwon: 0 };
      const mdEmpty = generatePremiumTemplate(
        'cost_comparison',
        {},
        {},
        {},
        {},
        emptySupp,
        null
      );

      expect(mdEmpty).not.toContain('120억');
      expect(mdEmpty).not.toContain('3,800만');
      expect(mdEmpty).not.toContain('3800');
      expect(mdEmpty).not.toContain('26.7년');
    });

    it('eradicates evasive phrase 확인 필요 in land_detail', () => {
      const mdLand = generatePremiumTemplate(
        'land_detail',
        {},
        {},
        {},
        {},
        {},
        {
          landUsePlan: {
            zoningDistrict: '제3종일반주거지역',
            buildingCoverageMax: 50,
            floorAreaRatioMax: 250,
          },
        } as any
      );

      expect(mdLand).not.toContain('확인 필요');
    });
  });

  describe('ssot-to-im-bridge precision and domain layers', () => {
    it('preserves exact sub-unit KRW rent precision', () => {
      const exactRentKrw = 28_456_789;
      const res = bridgeDealCardToIM({
        ssot: {
          lease_summary: {
            monthly_rent_total_krw: exactRentKrw,
          },
        },
      });

      expect(res.supplemental.monthly_rent_total_krw).toBe(exactRentKrw);
      expect(res.prefillData.monthlyRent).toBe(2846); // 만원 단위 반올림
    });

    it('maps all 8 domain layers without data drop', () => {
      const hotelSpec = { total_rooms: 45, adr_krw: 150000, occupancy_rate_pct: 82 };
      const devSpec = { constructionCostPerPyung: 800, targetScalePyung: 1200 };
      const occSpec = { currentRentManwon: 4200, desiredFloors: '3F~5F' };
      const logisticsSpec = { ceiling_height_m: 10.5, dock_count: 8 };
      const manualComps = [{ address: '역삼동 101', dealAmount: 1500000, area: 1000, dealYear: 2025, dealMonth: 6 }];

      const res = bridgeDealCardToIM({
        ssot: {
          layers: {
            hotel_operating: hotelSpec,
            developmentSpec: devSpec,
            occupancySpec: occSpec,
            logistics: logisticsSpec,
            manual_comps: manualComps,
            financial: {
              acquisition_tax_pct: 4.6,
              brokerage_fee_manwon: 5000,
              ltv_pct: 65,
            },
          },
        },
      });

      expect(res.supplemental.hotel_operating).toEqual(hotelSpec);
      expect(res.supplemental.developmentSpec).toEqual(devSpec);
      expect(res.supplemental.occupancySpec).toEqual(occSpec);
      expect(res.supplemental.logistics).toEqual(logisticsSpec);
      expect(res.supplemental.manual_comps).toEqual(manualComps);
      expect(res.supplemental.acquisition_tax_pct).toBe(4.6);
      expect(res.supplemental.brokerage_fee_manwon).toBe(5000);
      expect(res.supplemental.ltv_pct).toBe(65);
    });
  });
});
