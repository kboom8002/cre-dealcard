import { describe, it, expect } from 'vitest';
import {
  PPTX_PRESET_TEMPLATES,
  PRIME_TEMPLATE_ALIASES,
  CORE_PRIME_TEMPLATES,
  DEFAULT_PPTX_PRESET,
  getPptxTheme,
  getPptxThemeAsync,
  validatePresetAccessibility,
  type PptxThemeTokens,
} from '@/domain/building/mobile-im/pptx/pptx-theme';
import {
  bindInstitutionalTemplateData,
  bindCorporateTemplateData,
  bindCommercialTemplateData,
  bindDevelopmentTemplateData,
  bindSpecializedTemplateData,
  bindSectionData,
} from '@/domain/building/mobile-im/pptx/data-binder';

describe('Milestone 1: 4 Core Prime Templates & Broker Custom Preset Builder', () => {
  // ══════════════════════════════════════════════════════════════════
  // Suite 1: 4 Core Prime Templates Registration & Token Schemas
  // ══════════════════════════════════════════════════════════════════
  describe('Suite 1: 4 Core Prime Templates Registration & Token Schemas', () => {
    it('T1-01: All 4 core prime templates are registered in PPTX_PRESET_TEMPLATES', () => {
      // Positive assertion: 4 prime templates exist
      for (const templateId of CORE_PRIME_TEMPLATES) {
        expect(PPTX_PRESET_TEMPLATES[templateId]).toBeDefined();
        expect(PPTX_PRESET_TEMPLATES[templateId].presetId).toBe(templateId);
      }

      // Negative pair: Unknown preset is not directly in PPTX_PRESET_TEMPLATES
      expect(PPTX_PRESET_TEMPLATES['non_existent_preset']).toBeUndefined();
    });

    it('T1-02: Backward compatibility aliases correctly resolve to prime templates', () => {
      // Positive assertions for aliases
      expect(PRIME_TEMPLATE_ALIASES['golden_institutional']).toBe('institutional_dark_gold');
      expect(PRIME_TEMPLATE_ALIASES['corporate_clean']).toBe('corporate_clean_white');
      expect(PRIME_TEMPLATE_ALIASES['commercial_visual']).toBe('commercial_visual_grid');
      expect(PRIME_TEMPLATE_ALIASES['development_blueprint']).toBe('development_technical_blueprint');

      const goldenTheme = getPptxTheme('golden_institutional');
      expect(goldenTheme).toBeDefined();
      expect(goldenTheme.accent).toBe('B98A2E');

      const corporateTheme = getPptxTheme('corporate_clean');
      expect(corporateTheme).toBeDefined();
      expect(corporateTheme.accent).toBe('059669');

      // Negative pair: Non-existent alias falls back to default preset
      const fallbackTheme = getPptxTheme('completely_random_unknown_preset');
      expect(fallbackTheme.presetId).toBe(DEFAULT_PPTX_PRESET);
      expect(fallbackTheme.presetId).not.toBe('completely_random_unknown_preset');
    });

    it('T1-03: Token schema completeness for all 4 prime templates', () => {
      const requiredFields: (keyof PptxThemeTokens)[] = [
        'presetId', 'presetName',
        // 무채색
        'ink', 'ink2', 'ink3', 'slate', 'body', 'mute', 'mute2', 'line', 'line2', 'bg', 'tint',
        // 액센트
        'accent', 'accentD', 'accentL', 'accentT',
        // 의미색
        'green', 'greenL', 'red', 'redL', 'amber', 'amberL', 'blue', 'blueL', 'violet', 'violetL',
        // 다크 전용
        'darkCard', 'darkBlock', 'darkBorder', 'darkBody', 'darkMute', 'darkFaint', 'darkAccentBg', 'darkAccentBorder', 'darkAccentText',
        // 타이포 & 스타일
        'titleFont', 'bodyFont', 'coverStyle', 'layoutStyle', 'companyName', 'companyTagline'
      ];

      for (const templateId of CORE_PRIME_TEMPLATES) {
        const t = PPTX_PRESET_TEMPLATES[templateId];
        for (const field of requiredFields) {
          // Positive assertion: Every token has a non-empty string value
          expect(t[field]).toBeDefined();
          expect(typeof t[field]).toBe('string');
          expect((t[field] as string).length).toBeGreaterThan(0);
        }
      }

      // Negative pair: Tokens must not contain invalid hex formats or undefined values
      for (const templateId of CORE_PRIME_TEMPLATES) {
        const t = PPTX_PRESET_TEMPLATES[templateId];
        expect(t.accent).toMatch(/^[0-9A-Fa-f]{6}$/);
        expect(t.bg).toMatch(/^[0-9A-Fa-f]{6}$/);
        expect(t.ink).toMatch(/^[0-9A-Fa-f]{6}$/);
      }
    });

    it('T1-04: WCAG accessibility compliance for all 4 prime templates', () => {
      // Positive assertion: All 4 prime templates must have 0 accessibility issues
      for (const templateId of CORE_PRIME_TEMPLATES) {
        const issues = validatePresetAccessibility(PPTX_PRESET_TEMPLATES[templateId]);
        expect(issues).toEqual([]);
        expect(issues.length).toBe(0);
      }

      // Negative pair: A defective template with low contrast must report issues
      const badTheme: PptxThemeTokens = {
        ...PPTX_PRESET_TEMPLATES.institutional_dark_gold,
        presetId: 'bad_contrast_test',
        body: 'FFFFFF', // White text on white background
        bg: 'FFFFFF',
      };
      const badIssues = validatePresetAccessibility(badTheme);
      expect(badIssues.length).toBeGreaterThan(0);
      expect(badIssues.some(i => i.includes('body'))).toBe(true);
    });

    it('T1-05: DEFAULT_PPTX_PRESET maintains backward compatibility with golden_institutional', () => {
      expect(DEFAULT_PPTX_PRESET).toBe('golden_institutional');
      expect(getPptxTheme().presetId).toBe('golden_institutional');
      expect(getPptxTheme(undefined).presetId).toBe('golden_institutional');
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // Suite 2: Specialized Template Data Binding Outputs
  // ══════════════════════════════════════════════════════════════════
  describe('Suite 2: Specialized Template Data Binding Outputs', () => {
    // 2.1 Institutional Dark/Gold
    describe('2.1 Institutional Dark/Gold (WALE, Cap Rate/NOI, Multi-column Rent Roll)', () => {
      it('computes WALE with real mathematical weighting and formats multi-column rent roll', () => {
        const testDoc = {
          body: {
            askingPrice: 20000000000,
            asOfDate: '2026-06-01',
            leases: [
              { tenantName: '스타벅스', rentAmount: 25000000, areaSqm: 200, leaseEndDate: '2029-06-01' }, // 3.0 years
              { tenantName: '올리브영', rentAmount: 15000000, areaSqm: 100, leaseEndDate: '2027-06-01' }, // 1.0 year (expires in 12m)
            ],
            heroCard: {
              capRateBase: 5.12,
              askingPriceDisplay: '200.0억 원',
            },
          },
        };

        const dataMap = bindInstitutionalTemplateData(testDoc);

        // Positive assertions: WALE calculation exists
        expect(dataMap['summary']).toBeDefined();
        const summary = dataMap['summary'];
        expect(summary.wale).toBeDefined();
        expect(summary.wale.waleByRentYears).toBeGreaterThan(1.5);
        expect(summary.wale.waleByRentYears).toBeLessThan(3.0);
        // Olive Young is 15M / (25M + 15M) = 37.5% expiring within 12m
        expect(summary.wale.atRiskRentPct12m).toBeCloseTo(37.5, 0);

        // Cap Rate and NOI in summary metrics
        const metrics = summary.metricsData as Array<{ label: string; value: string }>;
        expect(metrics.some(m => m.label.includes('Cap Rate') && m.value.includes('5.12%'))).toBe(true);
        expect(metrics.some(m => m.label.includes('NOI'))).toBe(true);
        expect(metrics.some(m => m.label.includes('WALE'))).toBe(true);

        // Multi-column Rent Roll (A03)
        expect(dataMap['rentRoll']).toBeDefined();
        const rentRoll = dataMap['rentRoll'];
        expect(rentRoll.tableHead).toHaveLength(9);
        expect(rentRoll.tableHead).toContain('호실/층');
        expect(rentRoll.tableHead).toContain('임차인(업종)');
        expect(rentRoll.tableHead).toContain('전용면적(㎡)');
        expect(rentRoll.tableHead).toContain('보증금(만원)');
        expect(rentRoll.tableHead).toContain('월 임대료(만원)');
        expect(rentRoll.tableHead).toContain('만기일자');
        expect(rentRoll.tableHead).toContain('잔여기간');
        expect(rentRoll.tableRows).toHaveLength(2);

        // Negative pair: Expired lease does not increase WALE
        const expiredDoc = {
          body: {
            asOfDate: '2026-06-01',
            leases: [
              { tenantName: '만기임차인', rentAmount: 10000000, areaSqm: 100, leaseEndDate: '2025-01-01' },
            ],
          },
        };
        const expiredDataMap = bindInstitutionalTemplateData(expiredDoc);
        expect(expiredDataMap['summary'].wale.waleByRentYears).toBe(0);
      });
    });

    // 2.2 Corporate Clean White
    describe('2.2 Corporate Clean White (Rule 2 Terms, 총취득원가, vsLease TCO)', () => {
      it('strictly enforces Rule 2 standard terms and calculates exact 총취득원가 and vsLease TCO', () => {
        const askingPrice = 10000000000; // 100억
        const testDoc = {
          body: {
            askingPrice,
            heroCard: {
              askingPriceKrw: askingPrice,
            },
          },
        };

        const dataMap = bindCorporateTemplateData(testDoc);

        // Positive assertions: Rule 2 compliance
        const summaryText = JSON.stringify(dataMap['summary']);
        const vsLeaseText = JSON.stringify(dataMap['vsLease']);
        const combinedText = summaryText + ' ' + vsLeaseText;

        expect(combinedText).toContain('사옥 단독 명칭 표기(간판 설치권)');
        expect(combinedText).toContain('기업 단독 브랜딩');
        expect(combinedText).toContain('인테리어 지원금(TI) / 렌트프리(무상임대)');

        // Negative pair: Zero banned transliterations and zero persona terms
        expect(combinedText).not.toContain('네이밍 라이츠');
        expect(combinedText).not.toContain('브랜딩 라이츠');
        expect(combinedText).not.toContain('60대 자산가');
        expect(combinedText).not.toContain('법인 대표를 위한');

        // 총취득원가: 매매가 + 취득세 4.6% + 중개보수 0.9% = askingPrice * 1.055
        const expectedAcqTax = Math.round(askingPrice * 0.046); // 4.6억
        const expectedBrokerage = Math.round(askingPrice * 0.009); // 0.9억
        const expectedTotalCost = askingPrice + expectedAcqTax + expectedBrokerage; // 105.5억

        expect(dataMap['vsLease'].totalAcquisitionCostKrw).toBe(expectedTotalCost);
        expect(dataMap['vsLease'].acquisitionTaxKrw).toBe(expectedAcqTax);
        expect(dataMap['vsLease'].brokerageFeeKrw).toBe(expectedBrokerage);

        // Negative pair: 총취득원가는 매매가보다 엄격하게 커야 함
        expect(dataMap['vsLease'].totalAcquisitionCostKrw).toBeGreaterThan(askingPrice);

        // vsLease DualTable (A08)
        expect(dataMap['vsLease'].table1).toBeDefined();
        expect(dataMap['vsLease'].table2).toBeDefined();
        expect(dataMap['vsLease'].table1.rows.length).toBeGreaterThan(3);
        expect(dataMap['vsLease'].table2.rows.length).toBeGreaterThan(3);
      });
    });

    // 2.3 Commercial Visual Grid
    describe('2.3 Commercial Visual Grid (층별 MD 구성, 로드뷰 & 앵커 테넌트, 유동인구)', () => {
      it('binds multi-floor MD configuration plan, roadview anchor card, and catchment population', () => {
        const testDoc = {
          body: {
            title: '강남 메디컬 타워',
          },
        };

        const dataMap = bindCommercialTemplateData(testDoc);

        // Positive assertions: 층별 업종 MD 구성 (MD Plan)
        expect(dataMap['plan']).toBeDefined();
        const plan = dataMap['plan'];
        expect(plan.tableHead).toContain('층수');
        expect(plan.tableHead).toContain('추천 MD 및 권장 업종');
        expect(plan.tableRows.length).toBeGreaterThanOrEqual(5);
        const allMdText = plan.tableRows.map(r => r.join(' ')).join(' ');
        expect(allMdText).toContain('F&B');
        expect(allMdText).toContain('앵커 테넌트');
        expect(allMdText).toContain('메디컬 클리닉');
        expect(allMdText).toContain('전문학원');
        expect(allMdText).toContain('피트니스');

        // 로드뷰 및 앵커 테넌트 카드
        expect(dataMap['location']).toBeDefined();
        const location = dataMap['location'];
        const rightRowsText = location.right.rows.map((r: any) => r.join(' ')).join(' ');
        expect(rightRowsText).toContain('사거리 코너');
        expect(rightRowsText).toContain('약국, 병원, 스타벅스');
        expect(location.metrics.footTraffic).toBe('45,000명/일');
        expect(location.metrics.catchmentHousehold).toBe('8,500세대');

        // Negative pair: MD rows must not be empty or contain undefined labels
        for (const row of plan.tableRows) {
          expect(row[0]).not.toBe('');
          expect(row[1]).not.toBe('');
        }
      });
    });

    // 2.4 Development Technical Blueprint
    describe('2.4 Development Technical Blueprint (다필지 대지면적, 3단 투입비, 규제 완화, 부록 분리)', () => {
      it('binds multi-parcel area summation, 3-tier costs, regulation expiry, and appendix separation', () => {
        const testDoc = {
          body: {
            parcels: [
              { lotNumber: '101-1번지', category: '대', areaM2: 500.0, zoning: '일반상업' },
              { lotNumber: '101-2번지', category: '대', areaM2: 300.0, zoning: '일반상업' },
            ],
            landCostBil: 250,
            constCostBil: 150,
            financeCostBil: 50,
          },
        };

        const dataMap = bindDevelopmentTemplateData(testDoc);

        // Positive assertions: 다필지 대지면적 합산
        expect(dataMap['land']).toBeDefined();
        const land = dataMap['land'];
        expect(land.totalAreaM2).toBe(800.0);
        expect(land.totalAreaPyeong).toBeCloseTo(800.0 * 0.3025, 1);
        const lastRow = land.tableRows[land.tableRows.length - 1];
        expect(lastRow[0]).toContain('합계');
        expect(lastRow[2]).toBe('800㎡');

        // 3단 투입비 (토지비, 건축공사비, 금융/제세공과금)
        expect(dataMap['cost']).toBeDefined();
        const cost = dataMap['cost'];
        expect(cost.totalProjectCostBil).toBe(450); // 250 + 150 + 50
        const t1Text = cost.table1.rows.map((r: any) => r.join(' ')).join(' ');
        expect(t1Text).toContain('1단: 토지비');
        expect(t1Text).toContain('2단: 건축공사비');
        expect(t1Text).toContain('3단: 금융/제세공과금');

        // 규제 완화 기한 배너 (A17)
        expect(dataMap['marketing']).toBeDefined();
        const marketing = dataMap['marketing'];
        expect(marketing.regulationExpiry).toBe('2028-05-18');
        expect(marketing.regulationDaysLeft).toBe(630);
        expect(marketing.callout.title).toContain('한시적 용적률 완화 기한');

        // 신축 계획 및 지적도 부록 분리 (Rule 10 16-slide limit preservation)
        expect(dataMap['newBuildingPlan']).toBeDefined();
        expect(dataMap['newBuildingPlan'].placement).toBe('appendix');
        expect(dataMap['cadastralMap']).toBeDefined();
        expect(dataMap['cadastralMap'].placement).toBe('appendix');

        // Negative pair: Appendix items must not have placement === 'body'
        expect(dataMap['newBuildingPlan'].placement).not.toBe('body');
        expect(dataMap['cadastralMap'].placement).not.toBe('body');
      });

      it('guards against division by zero and produces 0.0% instead of NaN% when project costs are 0', () => {
        const zeroCostDoc = {
          title: '0원 개발부지',
          body: {
            landCostBil: 0,
            constCostBil: 0,
            financeCostBil: 0,
            expectedExitBil: 0,
          },
          sections: [],
        };

        const dataMap = bindDevelopmentTemplateData(zeroCostDoc);
        expect(dataMap['cost']).toBeDefined();
        const cost = dataMap['cost'];
        expect(cost.totalProjectCostBil).toBe(0);

        // Positive: Ensure formatted percentages are '0.0%'
        const t1All = JSON.stringify(cost.table1);
        const t2All = JSON.stringify(cost.table2);
        const calloutsAll = JSON.stringify(cost.callouts);

        expect(t1All).toContain('0.0%');
        expect(t2All).toContain('0.0%');

        // Negative pair: No NaN or NaN% anywhere in cost tables or callouts
        expect(t1All).not.toContain('NaN');
        expect(t2All).not.toContain('NaN');
        expect(calloutsAll).not.toContain('NaN');
        expect(t1All).not.toContain('Infinity');
        expect(t2All).not.toContain('Infinity');
      });
    });

    // 2.5 Unified Dispatcher via bindSectionData
    describe('2.5 Unified Dispatcher via bindSectionData', () => {
      it('automatically triggers specialized binding when templateId is supplied in bindSectionData', () => {
        const doc = {
          title: '테스트 자산',
          body: {
            askingPrice: 12000000000,
          },
          sections: [
            { title: '개요', markdown: '## 건축물 개요\n대지면적: 500㎡', section_type: 'property_overview' },
          ],
        };

        // Institutional
        const instData = bindSectionData(doc, undefined, 'institutional_dark_gold');
        expect(instData['summary'].title).toContain('Institutional Prime');

        // Corporate
        const corpData = bindSectionData(doc, undefined, 'corporate_clean_white');
        expect(corpData['summary'].title).toContain('Corporate Clean White');
        expect(corpData['vsLease']).toBeDefined();

        // Commercial
        const commData = bindSectionData(doc, undefined, 'commercial_visual_grid');
        expect(commData['summary'].title).toContain('Commercial Visual Grid');
        expect(commData['plan']).toBeDefined();

        // Development
        const devData = bindSectionData(doc, undefined, 'development_technical_blueprint');
        expect(devData['summary'].title).toContain('Development Technical Blueprint');
        expect(devData['newBuildingPlan'].placement).toBe('appendix');

        // Negative pair: Unknown template ID does not corrupt existing dataMap
        const defaultData = bindSectionData(doc, undefined, 'unknown_template');
        expect(defaultData['summary']).toBeDefined();
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // Suite 3: Broker Custom Preset Builder Contract & Token Serialization
  // ══════════════════════════════════════════════════════════════════
  describe('Suite 3: Broker Custom Preset Builder Contract & Token Serialization', () => {
    it('T3-01: Serializes tokens to JSON matching pptx_custom_presets.tokens schema', () => {
      const basePreset = PPTX_PRESET_TEMPLATES.corporate_clean_white;
      const customTokens: PptxThemeTokens = {
        ...basePreset,
        presetId: 'custom-preset-uuid-1',
        presetName: '삼경파트너스 커스텀 프리셋',
        accent: '059669',
        titleFont: '나눔스퀘어',
        bodyFont: '나눔스퀘어',
        companyName: '삼경부동산중개법인',
        companyTagline: '최고의 빌딩 투자 솔루션',
        logoUrl: 'https://cdn.credeal.com/logos/samkyung.png',
      };

      const serialized = JSON.parse(JSON.stringify(customTokens));

      // Positive assertions
      expect(serialized.presetId).toBe('custom-preset-uuid-1');
      expect(serialized.presetName).toBe('삼경파트너스 커스텀 프리셋');
      expect(serialized.titleFont).toBe('나눔스퀘어');
      expect(serialized.companyName).toBe('삼경부동산중개법인');
      expect(serialized.logoUrl).toBe('https://cdn.credeal.com/logos/samkyung.png');

      // Negative pair: Non-matching fields are not injected
      expect(serialized.invalidField).toBeUndefined();
    });

    it('T3-02: Merges custom preset overrides with base preset in getPptxThemeAsync', async () => {
      const mockCustomId = '12345678-1234-1234-1234-123456789abc';
      const mockSupabase: any = {
        from: (table: string) => {
          expect(table).toBe('pptx_custom_presets');
          return {
            select: () => ({
              eq: (col: string, val: string) => {
                expect(col).toBe('id');
                expect(val).toBe(mockCustomId);
                return {
                  maybeSingle: async () => ({
                    data: {
                      tokens: {
                        accent: 'FF5500',
                        titleFont: 'Noto Sans KR',
                      },
                      cover_style: 'split',
                      layout_style: 'modern',
                      company_name: '테스트 에이전시',
                      logo_url: 'https://storage.test/logo.svg',
                    },
                  }),
                };
              },
            }),
          };
        },
      };

      const theme = await getPptxThemeAsync(mockCustomId, mockSupabase);

      // Positive assertions: Custom overrides are applied
      expect(theme.presetId).toBe(mockCustomId);
      expect(theme.accent).toBe('FF5500');
      expect(theme.titleFont).toBe('Noto Sans KR');
      expect(theme.coverStyle).toBe('split');
      expect(theme.layoutStyle).toBe('modern');
      expect(theme.companyName).toBe('테스트 에이전시');
      expect(theme.logoUrl).toBe('https://storage.test/logo.svg');

      // Unchanged base tokens remain intact from default preset
      expect(theme.bg).toBe(PPTX_PRESET_TEMPLATES[DEFAULT_PPTX_PRESET].bg);
    });

    it('T3-03: Negative test pair: Non-UUID or missing DB record safely returns default template', async () => {
      const nonUuidId = 'invalid-custom-id';
      const theme1 = await getPptxThemeAsync(nonUuidId);
      expect(theme1.presetId).toBe(DEFAULT_PPTX_PRESET);

      const notFoundUuid = '00000000-0000-0000-0000-000000000000';
      const mockEmptySupabase: any = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
        }),
      };
      const theme2 = await getPptxThemeAsync(notFoundUuid, mockEmptySupabase);
      expect(theme2.presetId).toBe(DEFAULT_PPTX_PRESET);
    });
  });
});
