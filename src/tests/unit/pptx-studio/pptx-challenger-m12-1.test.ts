import { describe, it, expect } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import { TokenBinder } from '@/domain/building/pptx-studio/composition/token-binder';
import { buildEffectiveSnapshot } from '@/domain/building/im-core/evidence/effective-snapshot';
import { PublicationPackageBuilder } from '@/domain/building/im-core/publication/package-builder';
import { validateLayout } from '@/domain/building/mobile-im/pptx/layout-validator';
import { extractGateContext, generateAuditReport } from '@/domain/building/mobile-im/pptx/extract-gate-context';
import type { ParsedSlide, ParsedShape } from '@/domain/building/mobile-im/pptx/pptx-parser';
import { PUBLISH_GATES } from '@/domain/building/mobile-im/quality-gates-v02';
import { HarnessEvaluator } from '@/assurance/im-harness/evaluator';
import { registerPPTXProfiles } from '@/assurance/im-harness/profiles/pptx-profile';
import type { PPTXDeckSpec } from '@/domain/building/pptx-publication/types';
import { buildA04Asymmetric75 } from '@/domain/building/mobile-im/pptx/archetypes/a04-asymmetric-7-5';
import { getPptxTheme } from '@/domain/building/mobile-im/pptx/pptx-theme';

describe('Adversarial Challenger M12-1: TokenBinder, Layout-Validator & Rule 3 Duplicate Detection', () => {
  // =========================================================================
  // SECTION 1: TokenBinder Empirical Stress Testing
  // =========================================================================
  describe('1. TokenBinder Extreme Inputs & Determinism Stress Tests', () => {
    const binder = new TokenBinder();

    it('Zero Unhandled Exceptions on completely empty package snapshot and claims', () => {
      // Pass bare empty snapshot and claims directly to stress test optional chaining
      const pkg = {
        snapshot: {},
        claims: {},
      } as any;

      const template = [
        '소재지: {{snapshot.address}}',
        '건물명: {{snapshot.building_name}}',
        '대지면적: {{snapshot.land_area}}',
        '연면적: {{snapshot.gross_floor_area}}',
        '건축면적: {{snapshot.building_area}}',
        '전용면적: {{snapshot.exclusive_lease_area}}',
        '준공연도: {{snapshot.built_year}}',
        '지상층: {{snapshot.floors_above}}',
        '지하층: {{snapshot.floors_below}}',
        '용도지역: {{snapshot.zoning_district}}',
        '매매가: {{snapshot.asking_price}}',
        '월임대료: {{snapshot.monthly_rent}}',
        '보증금: {{snapshot.deposit}}',
        '월관리비: {{snapshot.monthly_admin_fee}}',
        '평당가(대지): {{snapshot.price_per_pyeong_land}}',
        '평당가(연면적): {{snapshot.price_per_pyeong_gross}}',
        '딜ID: {{snapshot.deal_id}}',
        '클레임 매매가: {{claim.asking_price}}',
        '클레임 대지면적: {{claim.land_area}}',
      ].join('\n');

      let output = '';
      expect(() => {
        output = binder.bindTokens(template, pkg);
      }).not.toThrow();

      // All missing fields must fall back deterministically to '-' without throwing
      expect(output).toContain('소재지: -');
      expect(output).toContain('건물명: -');
      expect(output).toContain('대지면적: -');
      expect(output).toContain('연면적: -');
      expect(output).toContain('매매가: -');
      expect(output).toContain('월임대료: -');
      expect(output).toContain('평당가(대지): -');
      expect(output).toContain('클레임 매매가: -');
    });

    it('Zero Unhandled Exceptions with explicit null & undefined property values', () => {
      const snap = {
        dealId: null,
        parcels: null,
        areas: {
          landAreaTotal: null,
          grossFloorArea: undefined,
          buildingAreaTotal: null,
          exclusiveLeaseArea: undefined,
        },
        pricing: {
          askingPriceKrw: null,
          monthlyRentKrw: undefined,
          totalDepositKrw: null,
          monthlyAdminFeeKrw: undefined,
        },
        unitPrices: {
          pricePerPyeongLand: null,
          pricePerPyeongGross: undefined,
        },
        buildingName: null,
        builtYear: null,
        floorsAbove: null,
        floorsBelow: null,
        zoningDistrict: null,
      };

      const pkg = {
        snapshot: snap as any,
        claims: {
          null_claim: { claimId: 'c1', subject: 'null_claim', value: null, unit: null },
          undefined_claim: { claimId: 'c2', subject: 'undefined_claim', value: undefined, unit: undefined },
        },
      } as any;

      const template = [
        '{{snapshot.address}}',
        '{{snapshot.building_name}}',
        '{{snapshot.land_area}}',
        '{{snapshot.gross_floor_area}}',
        '{{snapshot.building_area}}',
        '{{snapshot.exclusive_lease_area}}',
        '{{snapshot.built_year}}',
        '{{snapshot.floors_above}}',
        '{{snapshot.floors_below}}',
        '{{snapshot.zoning_district}}',
        '{{snapshot.asking_price}}',
        '{{snapshot.monthly_rent}}',
        '{{snapshot.deposit}}',
        '{{snapshot.monthly_admin_fee}}',
        '{{snapshot.price_per_pyeong_land}}',
        '{{snapshot.price_per_pyeong_gross}}',
        '{{snapshot.deal_id}}',
        '{{claim.null_claim}}',
        '{{claim.undefined_claim}}',
      ].join(' | ');

      let bound = '';
      expect(() => {
        bound = binder.bindTokens(template, pkg);
      }).not.toThrow();

      // Ensure every token resolved to '-'
      const tokens = bound.split(' | ');
      expect(tokens.length).toBe(19);
      for (const t of tokens) {
        expect(t).toBe('-');
      }
    });

    it('Correct formatting and 0 crashes on negative prices and negative areas', () => {
      const snap = {
        dealId: 'deal-neg',
        pricing: {
          askingPriceKrw: -50000000000, // -500억
          monthlyRentKrw: -120000000,   // -1.2억
          totalDepositKrw: -1000000000,  // -10억
          monthlyAdminFeeKrw: -150000,   // -15만
        },
        areas: {
          landAreaTotal: -850.5,
          grossFloorArea: -3400,
        },
        unitPrices: {
          pricePerPyeongLand: -45000000, // -4,500만
          pricePerPyeongGross: -12000000, // -1,200만
        },
      };

      const pkg = {
        snapshot: snap as any,
        claims: {
          yield_gap: { claimId: 'c-neg', subject: 'yield_gap', value: -2.35, unit: '%' },
        },
      } as any;

      const template = [
        '매매가: {{snapshot.asking_price}}',
        '월세: {{snapshot.monthly_rent}}',
        '보증금: {{snapshot.deposit}}',
        '관리비: {{snapshot.monthly_admin_fee}}',
        '대지면적: {{snapshot.land_area}}',
        '연면적: {{snapshot.gross_floor_area}}',
        '수익률갭: {{claim.yield_gap}}',
      ].join('\n');

      let res = '';
      expect(() => {
        res = binder.bindTokens(template, pkg);
      }).not.toThrow();

      expect(res).toContain('매매가: -500억 원');
      expect(res).toContain('월세: -1.2억 원');
      expect(res).toContain('보증금: -10억 원');
      expect(res).toContain('관리비: -15만 원');
      expect(res).toContain('대지면적: -850.5 ㎡');
      expect(res).toContain('연면적: -3,400 ㎡');
      expect(res).toContain('수익률갭: -2.35 %');
    });

    it('Correct formatting on huge numbers and boundary numerical values', () => {
      const snap = {
        dealId: 'deal-huge',
        pricing: {
          askingPriceKrw: 1e16, // 1경 원 = 100,000,000억 원
          monthlyRentKrw: 5000000000000, // 5조 원 = 50,000억 원
          totalDepositKrw: 2000000000000, // 2조 원 = 20,000억 원
          monthlyAdminFeeKrw: 99990000000, // 999억 9천만 원
        },
        areas: {
          landAreaTotal: 999999999.99,
          grossFloorArea: Number.MAX_SAFE_INTEGER,
        },
      };

      const pkg = {
        snapshot: snap as any,
        claims: {
          max_claim: { claimId: 'c-max', subject: 'max_claim', value: Number.MAX_SAFE_INTEGER, unit: 'KRW' },
          zero_claim: { claimId: 'c-zero', subject: 'zero_claim', value: 0, unit: '건' },
          nan_val: { claimId: 'c-nan', subject: 'nan_val', value: NaN, unit: '' },
        },
      } as any;

      const template = [
        '매매가: {{snapshot.asking_price}}',
        '월세: {{snapshot.monthly_rent}}',
        '보증금: {{snapshot.deposit}}',
        '관리비: {{snapshot.monthly_admin_fee}}',
        '대지면적: {{snapshot.land_area}}',
        '최대치: {{claim.max_claim}}',
        '0치: {{claim.zero_claim}}',
      ].join('\n');

      const res = binder.bindTokens(template, pkg);

      expect(res).toContain('매매가: 100,000,000억 원');
      expect(res).toContain('월세: 50,000억 원');
      expect(res).toContain('보증금: 20,000억 원');
      expect(res).toContain('관리비: 9,999,000만 원');
      expect(res).toContain('대지면적: 999,999,999.99 ㎡');
      expect(res).toContain(`최대치: ${Number.MAX_SAFE_INTEGER.toLocaleString()} KRW`);
      expect(res).toContain('0치: 0 건');
    });

    it('Resilience against special characters, regex tokens, XSS, and Unicode symbols', () => {
      const snap = {
        dealId: 'deal-special-char-!@#$%^&*()_+',
        buildingName: '㈜현대&삼성 <script>alert("xss")</script> 🏢 🔥',
        address: "서울특별시 강남구 테헤란로 123, 'B'동 \"501호\" (역삼동 600-1)",
        zoningDistrict: '일반상업지역 & 제1종지구단위계획구역(용적률 $100% / 800%)',
        builtYear: '2020년 12월 (준공인가 済)',
        floorsAbove: '지상 15층 (옥탑 2층 포함)',
        floorsBelow: '지하 4층 (기계실 포함)',
      };

      const pkg = {
        snapshot: snap as any,
        claims: {
          regex_injection: {
            claimId: 'c-regex',
            subject: 'regex_injection',
            value: '$$ $& $1 $2 $\' $` \\n \\r \\t',
            unit: '',
          },
        },
      } as any;

      const template = [
        '건물: {{snapshot.building_name}}',
        '주소: {{snapshot.address}}',
        '용도: {{snapshot.zoning_district}}',
        '준공: {{snapshot.built_year}}',
        '지상: {{snapshot.floors_above}}',
        '지하: {{snapshot.floors_below}}',
        '정규식인젝션: {{claim.regex_injection}}',
      ].join('\n');

      const res = binder.bindTokens(template, pkg);

      expect(res).toContain('건물: ㈜현대&삼성 <script>alert("xss")</script> 🏢 🔥');
      expect(res).toContain('주소: 서울특별시 강남구 테헤란로 123, \'B\'동 "501호" (역삼동 600-1)');
      expect(res).toContain('용도: 일반상업지역 & 제1종지구단위계획구역(용적률 $100% / 800%)');
      expect(res).toContain('준공: 2020년 12월 (준공인가 済)');
      expect(res).toContain('지상: 지상 15층 (옥탑 2층 포함)');
      expect(res).toContain('지하: 지하 4층 (기계실 포함)');
      // In JS replace with a replacer function, '$&', '$1' are NOT interpreted as replacement patterns
      expect(res).toContain('정규식인젝션: $$ $& $1 $2 $\' $` \\n \\r \\t');
    });

    it('100% Deterministic replacement across 100 consecutive executions', () => {
      const snap = {
        dealId: 'deal-det-100',
        buildingName: '테스트 타워',
        pricing: { askingPriceKrw: 32000000000, monthlyRentKrw: 85000000 },
        areas: { landAreaTotal: 512.4, grossFloorArea: 2150.8 },
      };

      const pkg = {
        snapshot: snap as any,
        claims: {
          cap_rate: { claimId: 'c-det', subject: 'cap_rate', value: 4.35, unit: '%' },
        },
      } as any;

      const template = '타워: {{snapshot.building_name}}, 가액: {{snapshot.asking_price}}, 연면적: {{snapshot.gross_floor_area}}, Cap: {{claim.cap_rate}}';

      const baseline = binder.bindTokens(template, pkg);
      for (let i = 0; i < 100; i++) {
        const current = binder.bindTokens(template, pkg);
        expect(current).toBe(baseline);
      }
    });

    it('Throws UNKNOWN_TOKEN_VIOLATION on unmapped token', () => {
      const pkg = { snapshot: {}, claims: {} } as any;
      const template = '미등록 변수: {{invalid.token_name}}';
      expect(() => binder.bindTokens(template, pkg)).toThrowError(/UNKNOWN_TOKEN_VIOLATION/);
    });

    it('Throws TOKEN_BINDING_INCOMPLETE if substituted value introduces recursive template token', () => {
      const snap = {
        dealId: 'deal-nested',
        buildingName: '타워 {{snapshot.address}} 중첩',
      };
      const pkg = { snapshot: snap as any, claims: {} } as any;
      const template = '건물명: {{snapshot.building_name}}';
      expect(() => binder.bindTokens(template, pkg)).toThrowError(/TOKEN_BINDING_INCOMPLETE/);
    });
  });

  // =========================================================================
  // SECTION 2: Layout Validator Edge Coordinates Stress Testing
  // =========================================================================
  describe('2. Layout Validator Edge Coordinates Stress Tests', () => {
    // Helper to create mock PptxGenJS presentation
    const createMockPres = (elements: Array<{
      x: number | string;
      y: number | string;
      w: number | string;
      h: number | string;
      type?: 'text' | 'image' | 'shape' | 'table';
      imgPixelW?: number;
      imgPixelH?: number;
    }>) => {
      return {
        _slides: [
          {
            _slideObjects: elements.map((el) => ({
              _type: el.type ?? 'shape',
              options: {
                x: el.x,
                y: el.y,
                w: el.w,
                h: el.h,
                _imgW: el.imgPixelW,
                _imgH: el.imgPixelH,
              },
            })),
          },
        ],
      } as unknown as PptxGenJS;
    };

    describe('Negative positions', () => {
      it('Catches negative X position (x = -0.5 in) as G35 bleed', () => {
        const pres = createMockPres([{ x: -0.5, y: 1.0, w: 3.0, h: 2.0 }]);
        const result = validateLayout(pres);
        expect(result.bleedCount).toBe(1);
        expect(result.violations.some((v) => v.gate === 'G35' && v.message.includes('지면 이탈'))).toBe(true);
      });

      it('Catches negative Y position (y = -0.2 in) as G35 bleed', () => {
        const pres = createMockPres([{ x: 1.0, y: -0.2, w: 3.0, h: 2.0 }]);
        const result = validateLayout(pres);
        expect(result.bleedCount).toBe(1);
        expect(result.violations.some((v) => v.gate === 'G35')).toBe(true);
      });

      it('Passes within -0.01 in tolerance (e.g. x = -0.005 in)', () => {
        const pres = createMockPres([{ x: -0.005, y: 0.0, w: 5.0, h: 3.0 }]);
        const result = validateLayout(pres);
        expect(result.bleedCount).toBe(0);
      });

      it('Catches negative EMU position (x = -914400 EMU)', () => {
        const pres = createMockPres([{ x: -914400, y: 0, w: 2.0, h: 1.0 }]);
        const result = validateLayout(pres);
        expect(result.bleedCount).toBe(1);
        expect(result.violations[0].gate).toBe('G35');
      });
    });

    describe('Values right on 13.333" x 7.5" boundary', () => {
      it('Passes when element spans exact canvas bounds (0, 0, 13.333, 7.5)', () => {
        const pres = createMockPres([{ x: 0, y: 0, w: 13.333, h: 7.5 }]);
        const result = validateLayout(pres);
        expect(result.bleedCount).toBe(0);
      });

      it('Passes when element is positioned at right boundary (x = 10.0, w = 3.333 -> rightEdge = 13.333)', () => {
        const pres = createMockPres([{ x: 10.0, y: 0, w: 3.333, h: 7.5 }]);
        const result = validateLayout(pres);
        expect(result.bleedCount).toBe(0);
      });

      it('Passes when element is positioned at bottom boundary (y = 5.0, h = 2.5 -> bottomEdge = 7.5)', () => {
        const pres = createMockPres([{ x: 0, y: 5.0, w: 13.333, h: 2.5 }]);
        const result = validateLayout(pres);
        expect(result.bleedCount).toBe(0);
      });

      it('Passes at exact boundary + tolerance threshold (w = 13.342 in, h = 7.509 in)', () => {
        // CANVAS_W + 0.01 = 13.343, CANVAS_H + 0.01 = 7.510
        const pres = createMockPres([{ x: 0, y: 0, w: 13.342, h: 7.509 }]);
        const result = validateLayout(pres);
        expect(result.bleedCount).toBe(0);
      });

      it('Catches right edge bleed exceeding tolerance by 0.002 in (w = 13.345 in)', () => {
        const pres = createMockPres([{ x: 0, y: 0, w: 13.345, h: 7.5 }]);
        const result = validateLayout(pres);
        expect(result.bleedCount).toBe(1);
        expect(result.violations.some((v) => v.gate === 'G35')).toBe(true);
      });

      it('Catches bottom edge bleed exceeding tolerance by 0.002 in (h = 7.512 in)', () => {
        const pres = createMockPres([{ x: 0, y: 0, w: 13.333, h: 7.512 }]);
        const result = validateLayout(pres);
        expect(result.bleedCount).toBe(1);
        expect(result.violations.some((v) => v.gate === 'G35')).toBe(true);
      });
    });

    describe('Huge EMU values and EMU normalization', () => {
      it('Correctly normalizes full-canvas EMU width 12,192,000 EMU (13.333 in) to pass without false bleed', () => {
        // 12192000 EMU / 914400 = 13.333333 in
        const pres = createMockPres([{ x: 0, y: 0, w: 12192000, h: 6858000 }]);
        const result = validateLayout(pres);
        expect(result.bleedCount).toBe(0);
      });

      it('Normalizes EMU offset and dimension: x = 914,400 EMU (1 in), w = 10,972,800 EMU (12 in) -> rightEdge = 13 in', () => {
        const pres = createMockPres([{ x: 914400, y: 457200, w: 10972800, h: 5486400 }]);
        const result = validateLayout(pres);
        expect(result.bleedCount).toBe(0);
      });

      it('Catches bleeding EMU width exceeding 16:9 canvas (12,500,000 EMU = 13.67 in)', () => {
        const pres = createMockPres([{ x: 0, y: 0, w: 12500000, h: 6858000 }]);
        const result = validateLayout(pres);
        expect(result.bleedCount).toBe(1);
        expect(result.violations.some((v) => v.gate === 'G35')).toBe(true);
      });

      it('Catches astronomical EMU coordinates (x = 100,000,000 EMU = 109.36 in)', () => {
        const pres = createMockPres([{ x: 100000000, y: 0, w: 914400, h: 914400 }]);
        const result = validateLayout(pres);
        expect(result.bleedCount).toBe(1);
        expect(result.violations.some((v) => v.gate === 'G35')).toBe(true);
      });
    });

    describe('0-width elements', () => {
      it('Skips element when both w === 0 and h === 0', () => {
        const pres = createMockPres([{ x: 0, y: 0, w: 0, h: 0 }]);
        const result = validateLayout(pres);
        expect(result.bleedCount).toBe(0);
        expect(result.violations.length).toBe(0);
      });

      it('Handles vertical separator line (w = 0, h = 5.0 in) safely without division by zero', () => {
        const pres = createMockPres([{
          type: 'shape',
          x: 6.666,
          y: 1.0,
          w: 0,
          h: 5.0,
        }]);
        const result = validateLayout(pres);
        expect(result.bleedCount).toBe(0);
      });

      it('Catches bleeding vertical separator line (w = 0, x = 14.0 in)', () => {
        const pres = createMockPres([{
          type: 'shape',
          x: 14.0,
          y: 1.0,
          w: 0,
          h: 5.0,
        }]);
        const result = validateLayout(pres);
        expect(result.bleedCount).toBe(1);
        expect(result.violations.some((v) => v.gate === 'G35')).toBe(true);
      });

      it('Handles horizontal separator line (w = 8.0 in, h = 0) safely without division by zero', () => {
        const pres = createMockPres([{
          type: 'shape',
          x: 2.0,
          y: 3.5,
          w: 8.0,
          h: 0,
        }]);
        const result = validateLayout(pres);
        expect(result.bleedCount).toBe(0);
      });

      it('Zero-width image does not cause division by zero in DPI calculation', () => {
        const pres = createMockPres([{
          type: 'image',
          x: 1.0,
          y: 1.0,
          w: 0,
          h: 3.0,
          imgPixelW: 800,
          imgPixelH: 600,
        }]);
        let result: any;
        expect(() => {
          result = validateLayout(pres);
        }).not.toThrow();
        expect(result.bleedCount).toBe(0);
        // Default dpi 300 when no valid image effective DPI calculated
        expect(result.minEffectiveDpi).toBe(300);
      });
    });
  });

  // =========================================================================
  // SECTION 3: Rule 3 Duplicate Detection Stress Testing
  // =========================================================================
  describe('3. Rule 3 Duplicate Detection Stress Tests', () => {
    // Helper to create mock ParsedSlide
    const createSlideWithShapes = (shapes: ParsedShape[]): ParsedSlide => {
      return {
        index: 1,
        shapes,
        texts: shapes.filter((s) => !!s.text).map((s) => s.text!),
        images: [],
      };
    };

    it('Positive Pair: Detects identical bullets across left (x < 6.8) and right (x >= 6.8)', () => {
      const duplicateBullet = '• 상세 건물 제원은 실사 자료를 참조하시기 바랍니다';
      const slide = createSlideWithShapes([
        {
          name: 'left_callout',
          type: 'text',
          position: { x: 1.0, y: 2.0, cx: 5.0, cy: 3.0 },
          text: duplicateBullet,
        },
        {
          name: 'right_callout',
          type: 'text',
          position: { x: 7.5, y: 2.0, cx: 5.0, cy: 3.0 },
          text: duplicateBullet,
        },
      ]);

      const gateCtx = extractGateContext([slide]);
      expect(gateCtx.highlightSpecDuplicate).toBe(true);

      const report = generateAuditReport([slide], gateCtx);
      expect(report.standardViolations).toContain('G43: highlights↔제원 중복');

      const g43Gate = PUBLISH_GATES.find((g) => g.id === 'G43');
      expect(g43Gate?.check(gateCtx as any)).toBe(false); // Fails G43 check
    });

    it('Positive Pair: Detects duplicate bullets despite differing bullet prefixes (• vs - vs ·)', () => {
      const slide = createSlideWithShapes([
        {
          name: 'left_bullet',
          type: 'text',
          position: { x: 1.0, y: 2.0, cx: 5.0, cy: 3.0 },
          text: '• 건물 현황 및 규모는 첨부 대장을 기준으로 합니다',
        },
        {
          name: 'right_bullet',
          type: 'text',
          position: { x: 8.0, y: 2.0, cx: 5.0, cy: 3.0 },
          text: '- 건물 현황 및 규모는 첨부 대장을 기준으로 합니다',
        },
      ]);

      const gateCtx = extractGateContext([slide]);
      expect(gateCtx.highlightSpecDuplicate).toBe(true);
    });

    it('Positive Pair: Detects long substring duplication (>= 15 chars) embedded in a narrative', () => {
      const sharedFact = '등기부등본상 권리관계 및 제한물권 설정 여부를 확인하였습니다';
      const slide = createSlideWithShapes([
        {
          name: 'left_narrative',
          type: 'text',
          position: { x: 0.8, y: 1.5, cx: 5.5, cy: 4.0 },
          text: `자산 종합 검토 보고:\n${sharedFact}`,
        },
        {
          name: 'right_card',
          type: 'text',
          position: { x: 7.0, y: 1.5, cx: 5.5, cy: 4.0 },
          text: `실사 포인트:\n현장 법률 자문 결과, ${sharedFact}에 부합합니다.`,
        },
      ]);

      const gateCtx = extractGateContext([slide]);
      expect(gateCtx.highlightSpecDuplicate).toBe(true);
    });

    it('Negative Pair: Passes when left narrative and right cards contain distinct text', () => {
      const slide = createSlideWithShapes([
        {
          name: 'left_callout',
          type: 'text',
          position: { x: 0.8, y: 1.8, cx: 5.5, cy: 3.0 },
          text: '• 상세 건물 제원은 실사 자료를 참조하시기 바랍니다\n• 건물 현황 및 규모는 첨부 대장을 기준으로 합니다\n• 건물 상태 및 설비 현황은 실사 보고서를 참조하십시오',
        },
        {
          name: 'right_callout_1',
          type: 'text',
          position: { x: 7.2, y: 1.8, cx: 5.5, cy: 2.3 },
          text: '• 물건 접면 도로 폭 및 진출입 여건은 현장 실사 확인 사항입니다\n• 등기부등본상 권리관계 및 제한물권 설정 여부를 확인하였습니다\n• 지구단위계획 및 토지이용계획상 허용 용도를 검토하였습니다',
        },
        {
          name: 'right_callout_2',
          type: 'text',
          position: { x: 7.2, y: 4.35, cx: 5.5, cy: 2.35 },
          text: '• 주요 임차인별 계약 만기 분산 및 렌트롤 실사가 필요합니다\n• 관리비 정산 내역 및 수선유지비 집행 이력을 점검하였습니다\n• 취득세 감면 및 대출 조달 구조는 금융·세무 자문 후 확정됩니다',
        },
      ]);

      const gateCtx = extractGateContext([slide]);
      expect(gateCtx.highlightSpecDuplicate).toBe(false);

      const report = generateAuditReport([slide], gateCtx);
      expect(report.standardViolations.some((v) => v.includes('G43'))).toBe(false);

      const g43Gate = PUBLISH_GATES.find((g) => g.id === 'G43');
      expect(g43Gate?.check(gateCtx as any)).toBe(true); // Passes G43
    });

    it('Negative Pair: Does NOT falsely trigger on identical bullets when both shapes are on the left side', () => {
      const slide = createSlideWithShapes([
        {
          name: 'left_top',
          type: 'text',
          position: { x: 1.0, y: 1.0, cx: 4.0, cy: 2.0 },
          text: '• 동일한 안내 문구 반복 배치 테스트 항목입니다',
        },
        {
          name: 'left_bottom',
          type: 'text',
          position: { x: 1.0, y: 3.5, cx: 4.0, cy: 2.0 },
          text: '• 동일한 안내 문구 반복 배치 테스트 항목입니다',
        },
      ]);

      const gateCtx = extractGateContext([slide]);
      // Rule 3 applies exclusively across the split (left vs right)
      expect(gateCtx.highlightSpecDuplicate).toBe(false);
    });

    it('Negative Pair: Ignores short identical metric tokens (< 10 chars) like percentages and labels', () => {
      const slide = createSlideWithShapes([
        {
          name: 'left_stat',
          type: 'text',
          position: { x: 2.0, y: 2.0, cx: 4.0, cy: 2.0 },
          text: '• 연 4.5%\n• 120억 원',
        },
        {
          name: 'right_stat',
          type: 'text',
          position: { x: 7.5, y: 2.0, cx: 4.0, cy: 2.0 },
          text: '• 연 4.5%\n• 120억 원',
        },
      ]);

      const gateCtx = extractGateContext([slide]);
      expect(gateCtx.highlightSpecDuplicate).toBe(false);
    });

    it('Verifies GATE-PPTX-NON-DUPLICATION in HarnessEvaluator P-PPTX-PREVIEW profile', async () => {
      const evaluator = new HarnessEvaluator();
      registerPPTXProfiles(evaluator);

      // Deck with duplicate
      const failingDeck: PPTXDeckSpec = {
        deckId: 'deck-dupe-test',
        bodySlideCount: 12,
        appendixSlideCount: 0,
        slides: [
          {
            slideNumber: 1,
            title: '중복 슬라이드',
            layoutStyle: 'split',
            leftContent: { narrative: '본 자산은 주요 임차인별 계약 만기 분산 관리가 철저합니다.' },
            rightContent: {
              cards: [
                { label: '핵심강점', value: '주요 임차인별 계약 만기 분산 관리' }, // >= 10 chars duplicate
              ],
            },
          },
        ],
      };

      const failingReport = await evaluator.evaluateProfile('P-PPTX-PREVIEW', 'run-fail', failingDeck);
      const failingGate = failingReport.results.find((r) => r.gateId === 'GATE-PPTX-NON-DUPLICATION');
      expect(failingGate?.status).toBe('FAIL');
      expect(failingGate?.reason).toContain('좌측 리드문과 우측 카드 텍스트 중복 발생');

      // Deck without duplicate
      const passingDeck: PPTXDeckSpec = {
        deckId: 'deck-clean-test',
        bodySlideCount: 12,
        appendixSlideCount: 0,
        slides: [
          {
            slideNumber: 1,
            title: '정상 슬라이드',
            layoutStyle: 'split',
            leftContent: { narrative: '강남대로 오피스 밀집 권역 내 위치한 최상급 자산입니다.' },
            rightContent: {
              cards: [
                { label: '임대차현황', value: '전층 우량 법인 임대 완료' },
              ],
            },
          },
        ],
      };

      const passingReport = await evaluator.evaluateProfile('P-PPTX-PREVIEW', 'run-pass', passingDeck);
      const passingGate = passingReport.results.find((r) => r.gateId === 'GATE-PPTX-NON-DUPLICATION');
      expect(passingGate?.status).toBe('PASS');
    });

    it('A04 Archetype Regression Verification: Fallback rendering produces ZERO duplicate bullets', async () => {
      const pres = new PptxGenJS();
      const theme = getPptxTheme('golden_institutional');
      
      // Render A04 with empty/fallback data
      const { slide } = await buildA04Asymmetric75({
        pres,
        slideNum: 4,
        docno: 'IM-2026-TEST',
        grade: 'A',
        provenance: {},
        data: {
          title: '건축물 제원 및 물리 스펙',
          kicker: 'PHYSICAL SPECIFICATIONS',
          left: { rows: [] }, // triggers left fallback callout
          right: { callouts: [] }, // triggers right fallback callouts
        },
      });

      // Extract shapes from the rendered slide
      const slideObjs = (slide as any)._slideObjects ?? [];
      const parsedShapes: ParsedShape[] = [];
      for (const obj of slideObjs) {
        const opts = obj.options ?? {};
        const text = opts.text || (Array.isArray(obj.text) ? obj.text.map((t: any) => t.text).join('') : '');
        if (text) {
          parsedShapes.push({
            name: 'slideObj',
            type: 'text',
            position: {
              x: opts.x ?? 0,
              y: opts.y ?? 0,
              cx: opts.w ?? 0,
              cy: opts.h ?? 0,
            },
            text,
          });
        }
      }

      const parsedSlide: ParsedSlide = {
        index: 1,
        shapes: parsedShapes,
        texts: parsedShapes.map((s) => s.text!),
        images: [],
      };

      const gateCtx = extractGateContext([parsedSlide]);
      expect(gateCtx.highlightSpecDuplicate).toBe(false); // Proves M2 resolved the A04 duplicate bug!
    });
  });
});
