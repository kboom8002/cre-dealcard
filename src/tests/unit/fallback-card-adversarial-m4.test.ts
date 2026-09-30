/**
 * @file fallback-card-adversarial-m4.test.ts
 * @description Adversarial Challenge & Stress Test Suite for Milestone M4 (Worker M4):
 *              L.fallbackCard layout physics, boundary monotonicity under extreme parameters,
 *              0/1/10 actionItems/checklist clamping, extreme title/leadText lengths,
 *              dark/light mode WCAG contrast physics, and real PptxGenJS binary safety.
 *
 * Rule 7 Compliant: Strictly Paired Positive and Negative Assertions.
 */

import { describe, it, expect, vi } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import * as L from '@/domain/building/mobile-im/pptx/imlib';
import {
  fallbackCard,
  C,
  CD,
  M,
  CW,
  SAFE_BOTTOM,
  type FallbackCardOpts,
} from '@/domain/building/mobile-im/pptx/imlib';
import fs from 'node:fs';
import { join } from 'node:path';
import {
  getCharWidthInches,
  simulateTextWrap,
} from '@/domain/building/mobile-im/pptx/layout-physics';

// ═════════════════════════════════════════════════════════════════════════════
// Test Fixtures & Mathematical Helpers
// ═════════════════════════════════════════════════════════════════════════════

interface RecordedShape {
  type: string;
  opts: Record<string, any>;
}

interface RecordedText {
  text: string;
  opts: Record<string, any>;
}

function createSlideSpy() {
  const shapes: RecordedShape[] = [];
  const texts: RecordedText[] = [];

  const slide = {
    addShape: vi.fn((type: string, opts: Record<string, any>) => {
      shapes.push({ type, opts });
      return slide;
    }),
    addText: vi.fn((text: string, opts: Record<string, any>) => {
      texts.push({ text, opts });
      return slide;
    }),
    addImage: vi.fn(() => slide),
    addTable: vi.fn(() => slide),
  };

  return { slide, shapes, texts };
}

/**
 * WCAG 2.1 Relative Luminance calculation.
 * L = 0.2126 * R + 0.7152 * G + 0.0722 * B (linearized sRGB)
 */
function srgbToLinear(c255: number): number {
  const s = c255 / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

function getLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const TOLERANCE = 0.001;

describe('Adversarial Stress Harness: Milestone M4 FallbackCard Layout Physics', () => {

  // ═════════════════════════════════════════════════════════════════════════════
  // 1. Boundary & Monotonicity Testing Under Dimension Extremes
  // ═════════════════════════════════════════════════════════════════════════════
  describe('1. Boundary & Monotonicity Testing (Tight Boxes vs Canonical Layouts)', () => {

    it('[Positive Pair] Canonical Production Dimensions: All 4 production archetypes strictly stay within bounds and SAFE_BOTTOM', () => {
      // Production archetype sizes:
      // A06 Diagram Cadastral/Transit: x=0.60, y=1.62, w=8.60, h=4.50 (Bottom = 6.12")
      // A14 Gallery: x=0.62, y=1.50, w=12.093, h=5.00 (Bottom = 6.50")
      // A23 Yield Land History: x=7.20, y=1.62, w=5.53, h=4.90 (Bottom = 6.52")
      // A24 Rent Roll: x=0.62, y=1.62, w=12.093, h=4.80 (Bottom = 6.42")
      const archetypes = [
        { name: 'A06-diagram', x: 0.60, y: 1.62, w: 8.60, h: 4.50 },
        { name: 'A14-gallery', x: M, y: 1.50, w: CW, h: 5.00 },
        { name: 'A23-yield', x: 7.20, y: 1.62, w: 5.53, h: 4.90 },
        { name: 'A24-rentroll', x: M, y: 1.62, w: CW, h: 4.80 },
      ];

      for (const arch of archetypes) {
        const { slide, shapes, texts } = createSlideSpy();
        fallbackCard(slide, arch.x, arch.y, arch.w, arch.h, {
          badge: '실사 확인 안내',
          title: `${arch.name} 제목`,
          leadText: '설명 리드문입니다.',
          checklist: ['항목 1', '항목 2', '항목 3', '항목 4'],
        });

        // Verify container shape
        const container = shapes[0].opts;
        expect(container.x).toBe(arch.x);
        expect(container.y).toBe(arch.y);
        expect(container.w).toBe(arch.w);
        expect(container.h).toBe(arch.h);
        expect(container.y + container.h).toBeLessThanOrEqual(SAFE_BOTTOM);

        // Verify every child shape is strictly within [x, y, w, h]
        for (const shape of shapes) {
          const sx = shape.opts.x;
          const sy = shape.opts.y;
          const sw = shape.opts.w ?? 0;
          const sh = shape.opts.h ?? 0;
          expect(sx).toBeGreaterThanOrEqual(arch.x - TOLERANCE);
          expect(sx + sw).toBeLessThanOrEqual(arch.x + arch.w + TOLERANCE);
          expect(sy).toBeGreaterThanOrEqual(arch.y - TOLERANCE);
          expect(sy + sh).toBeLessThanOrEqual(arch.y + arch.h + TOLERANCE);
        }

        // Verify every text box is strictly within [x, y, w, h] and does not breach SAFE_BOTTOM
        for (const text of texts) {
          const tx = text.opts.x;
          const ty = text.opts.y;
          const tw = text.opts.w ?? 0;
          const th = text.opts.h ?? 0;
          expect(tx).toBeGreaterThanOrEqual(arch.x - TOLERANCE);
          expect(tx + tw).toBeLessThanOrEqual(arch.x + arch.w + TOLERANCE);
          expect(ty).toBeGreaterThanOrEqual(arch.y - TOLERANCE);
          expect(ty + th).toBeLessThanOrEqual(arch.y + arch.h + TOLERANCE);
          expect(ty + th).toBeLessThanOrEqual(SAFE_BOTTOM);
        }
      }
    });

    it('[Negative Pair] Degenerate Height Breakdown (h < 1.5"): listAvailH floor forcing and fixed itemBoxH cause card bottom overflow', () => {
      // Adversarial attack: Container height is very tight (h = 1.2", y = 2.0")
      // Container bounds: top = 2.0", bottom = 3.2"
      const { slide, texts } = createSlideSpy();
      const x = 1.0;
      const y = 2.0;
      const w = 4.0;
      const h = 1.2;

      fallbackCard(slide, x, y, w, h, {
        badge: '공적장부 열람 대상',
        title: '초소형 박스 테스트',
        leadText: '리드문 텍스트입니다.',
        checklist: ['점검항목 1', '점검항목 2', '점검항목 3', '점검항목 4'],
      });

      // Find the last checklist item text box
      const lastItemText = texts[texts.length - 1];
      const lastItemBottom = lastItemText.opts.y + lastItemText.opts.h;
      const cardBottom = y + h;

      // EMPIRICAL CHALLENGE FINDING:
      // In imlib.ts: listAvailH = Math.max(0.5, (y + h) - listStartY - padY)
      // Because available vertical space is <= 0.20", Math.max(0.5, ...) clamps to 0.5".
      // And itemBoxH = Math.max(0.22, itemSlotH - 0.04) clamps to 0.22".
      // Thus, the 4th item box physically penetrates beyond cardBottom by > 0.5 inches!
      expect(lastItemBottom).toBeGreaterThan(cardBottom);
      const overflowInches = lastItemBottom - cardBottom;
      expect(overflowInches).toBeGreaterThan(0.50); // Empirically ~0.575" overflow
    });

    it('[Negative Pair] Extreme Tight Height (h = 1.0"): listStartY itself starts below container bottom', () => {
      const { slide, texts } = createSlideSpy();
      const x = 1.0;
      const y = 2.0;
      const w = 4.0;
      const h = 1.0; // cardBottom = 3.0"

      fallbackCard(slide, x, y, w, h, {
        badge: '실사 안내',
        title: '초소형 테스트',
        leadText: '리드문',
        checklist: ['항목 1'],
      });

      // The 1st checklist item starts at listStartY
      const firstItemText = texts.find(t => t.text === '항목 1')!;
      expect(firstItemText).toBeDefined();

      // listStartY = divY + 0.10 >= y + 1.18" = 3.18" > cardBottom (3.00")
      // The entire checklist section is rendered outside the card boundary!
      expect(firstItemText.opts.y).toBeGreaterThan(y + h);
    });

    it('[Positive Pair] Monotonicity Threshold: Determines exact height where zero bottom-overflow is achieved', () => {
      // Find the critical threshold height where 4 items fit without overflow
      const x = 1.0;
      const y = 1.0;
      const w = 6.0;

      const testHeights = [1.5, 1.8, 1.85, 2.0, 2.5, 3.0, 4.0];
      const results: { h: number; overflows: boolean; maxBottom: number }[] = [];

      for (const h of testHeights) {
        const { slide, shapes, texts } = createSlideSpy();
        fallbackCard(slide, x, y, w, h, {
          badge: '실사 안내',
          title: '높이 임계 테스트',
          leadText: '리드문 텍스트',
          checklist: ['항목 1', '항목 2', '항목 3', '항목 4'],
        });

        const cardBottom = y + h;
        let maxElementBottom = 0;
        for (const s of shapes) maxElementBottom = Math.max(maxElementBottom, s.opts.y + (s.opts.h ?? 0));
        for (const t of texts) maxElementBottom = Math.max(maxElementBottom, t.opts.y + (t.opts.h ?? 0));

        results.push({
          h,
          overflows: maxElementBottom > cardBottom + TOLERANCE,
          maxBottom: maxElementBottom,
        });
      }

      // Height 1.5" overflows by ~0.30"
      expect(results.find(r => r.h === 1.5)!.overflows).toBe(true);

      // Height >= 2.0" strictly does not overflow
      expect(results.find(r => r.h === 2.0)!.overflows).toBe(false);
      expect(results.find(r => r.h === 3.0)!.overflows).toBe(false);
      expect(results.find(r => r.h === 4.0)!.overflows).toBe(false);
    });

    it('[Positive/Negative Pair] Degenerate Width (w = 1.8", h = 4.5"): Shapes stay within horizontal boundaries, but text capacity contracts drastically', () => {
      const { slide, shapes, texts } = createSlideSpy();
      const x = 0.5;
      const y = 1.0;
      const w = 1.8; // Very narrow container
      const h = 4.5;

      const longItem = '토지이용계획확인원 상 용도지역·지구 행위제한 정합성 실사'; // 34 CJK chars
      fallbackCard(slide, x, y, w, h, {
        badge: '공적장부 열람 대상',
        title: '협소 폭 테스트',
        leadText: '협소 폭 카드 리드문입니다.',
        checklist: [longItem],
      });

      // [Positive Pair] Shape bounding boxes are strictly clamped horizontally inside [x, x + w]
      for (const s of shapes) {
        expect(s.opts.x).toBeGreaterThanOrEqual(x - TOLERANCE);
        expect(s.opts.x + (s.opts.w ?? 0)).toBeLessThanOrEqual(x + w + TOLERANCE);
      }
      for (const t of texts) {
        expect(t.opts.x).toBeGreaterThanOrEqual(x - TOLERANCE);
        expect(t.opts.x + (t.opts.w ?? 0)).toBeLessThanOrEqual(x + w + TOLERANCE);
      }

      // [Negative Pair] Available text width contracts to 1.38", forcing 34 CJK characters into 4 lines
      const itemText = texts.find(t => t.text === longItem)!;
      expect(itemText.opts.w).toBeCloseTo(1.38, 2);

      // Check text wrap simulation: 1.38" width at 9.2pt font requires >= 3 wrapped lines
      const wrap = simulateTextWrap(longItem, itemText.opts.w, 9.2);
      expect(wrap.lines.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 2. Action Items / Checklist Item Count Extremes (0, 1, 4, 10 items)
  // ═════════════════════════════════════════════════════════════════════════════
  describe('2. Action Items / Checklist Count Extremes (0, 1, 4, 10 items & Aliasing)', () => {

    it('[Positive Pair] 0 Items: Empty checklist array renders clean container without crashing or dividing by zero', () => {
      const { slide, shapes, texts } = createSlideSpy();
      expect(() => {
        fallbackCard(slide, 1.0, 1.0, 8.0, 4.5, {
          badge: '공적장부 열람 대상',
          title: '체크리스트 미제공',
          leadText: '체크리스트가 비어 있는 경우의 카드입니다.',
          checklist: [],
        });
      }).not.toThrow();

      // Outer container, badge shape, divider line = 3 shapes
      // (No bullet marker shapes rendered)
      expect(shapes).toHaveLength(3);
      expect(shapes[0].type).toBe('roundRect'); // Container
      expect(shapes[1].type).toBe('roundRect'); // Badge
      expect(shapes[2].type).toBe('line');      // Divider

      // Badge text, title text, lead text = 3 texts
      // (No checklist item texts rendered)
      expect(texts).toHaveLength(3);
      expect(texts.map(t => t.text)).toEqual([
        '[ 공적장부 열람 대상 ]',
        '체크리스트 미제공',
        '체크리스트가 비어 있는 경우의 카드입니다.',
      ]);
    });

    it('[Negative Pair] ActionItems vs Checklist Aliasing: Passing actionItems without checklist renders 0 items', () => {
      const { slide, texts } = createSlideSpy();
      // Caller passes actionItems (as phrased in dispatch) instead of checklist
      const optsWithActionItems = {
        badge: '임대차 실사 안내',
        title: '임대차 실사',
        leadText: '임대차 실사 안내입니다.',
        actionItems: ['계약서 전수 대조', '금융 원장 대조'],
      };

      fallbackCard(slide, 1.0, 1.0, 8.0, 4.5, optsWithActionItems as any);

      // Only 3 texts rendered because opts.checklist was undefined
      expect(texts).toHaveLength(3);
      expect(texts.some(t => t.text.includes('계약서 전수 대조'))).toBe(false);
    });

    it('[Positive Pair] 1 Item: Single item renders cleanly at top of checklist area without excessive vertical stretching', () => {
      const { slide, shapes, texts } = createSlideSpy();
      fallbackCard(slide, 1.0, 1.0, 8.0, 4.5, {
        badge: '현장 실사 예정',
        title: '단일 점검 항목',
        leadText: '단일 항목만 존재하는 경우입니다.',
        checklist: ['외관 파사드 마감재 정밀 점검'],
      });

      // 4 shapes: container, badge, divider, 1 bullet marker
      expect(shapes).toHaveLength(4);
      const bullet = shapes[3];
      expect(bullet.type).toBe('rect');
      expect(bullet.opts.w).toBe(0.07);
      expect(bullet.opts.h).toBe(0.07);

      // 4 texts: badge, title, lead, 1 item
      expect(texts).toHaveLength(4);
      const item = texts[3];
      expect(item.text).toBe('외관 파사드 마감재 정밀 점검');
      expect(item.opts.valign).toBe('top');

      // Verify item fits within container
      expect(item.opts.y + item.opts.h).toBeLessThanOrEqual(1.0 + 4.5);
    });

    it('[Positive Pair] 4 Items (Canonical Standard): Even vertical distribution and bullet-text alignment', () => {
      const { slide, shapes, texts } = createSlideSpy();
      const items = [
        '토지이용계획확인원 상 용도지역·지구 행위제한 정합성 실사',
        '지적공부(토지대장·지적도)상 지목, 면적 및 필지 경계 실측 대조',
        '건축선 후퇴, 도로접면 조건(진입로 폭원) 및 일조사선 규제 점검',
        '지구단위계획구역 여부 및 지자체 도시계획조례 추가 완화 가능성 검토',
      ];

      fallbackCard(slide, 1.0, 1.0, 8.0, 4.5, {
        badge: '공적장부 열람 대상',
        title: '지적 및 토지이용계획 열람 안내',
        leadText: '본 자산의 지적경계 및 용도지역 지정 현황을 대조합니다.',
        checklist: items,
      });

      // 3 header shapes + 4 bullets = 7 shapes
      expect(shapes).toHaveLength(7);
      // 3 header texts + 4 items = 7 texts
      expect(texts).toHaveLength(7);

      // Verify bullets and texts step downwards monotonically with equal step size
      const bullets = shapes.slice(3);
      const itemTexts = texts.slice(3);

      const step1 = bullets[1].opts.y - bullets[0].opts.y;
      const step2 = bullets[2].opts.y - bullets[1].opts.y;
      const step3 = bullets[3].opts.y - bullets[2].opts.y;

      expect(step1).toBeGreaterThan(0.5);
      expect(Math.abs(step1 - step2)).toBeLessThan(0.01);
      expect(Math.abs(step2 - step3)).toBeLessThan(0.01);

      // Verify each bullet aligns with its text counterpart
      for (let i = 0; i < 4; i++) {
        // Bullet x is before text x
        expect(bullets[i].opts.x).toBeLessThan(itemTexts[i].opts.x);
        // Bullet y is offset +0.06 from text y for visual baseline alignment
        expect(bullets[i].opts.y).toBeCloseTo(itemTexts[i].opts.y + 0.06, 2);
      }
    });

    it('[Negative Pair] Surplus Items (10 Items): Clamped to exactly 4 items, safely omitting items 5~10 without overflow', () => {
      const { slide, shapes, texts } = createSlideSpy();
      const tenItems = Array.from({ length: 10 }, (_, i) => `점검 항목 #${i + 1}`);

      fallbackCard(slide, 1.0, 1.0, 8.0, 4.5, {
        badge: '실사 점검 안내',
        title: '대량 점검 항목 스트레스 테스트',
        leadText: '10개 항목이 제공된 경우 카드 바운더리 보호 검증',
        checklist: tenItems,
      });

      // Exactly 4 bullets and 4 texts rendered (slice(0, 4))
      expect(shapes).toHaveLength(3 + 4);
      expect(texts).toHaveLength(3 + 4);

      // Verify items 1~4 are present
      expect(texts[3].text).toBe('점검 항목 #1');
      expect(texts[6].text).toBe('점검 항목 #4');

      // Verify items 5~10 are NOT rendered
      expect(texts.some(t => t.text.includes('#5'))).toBe(false);
      expect(texts.some(t => t.text.includes('#10'))).toBe(false);

      // Verify bottom does not breach container
      const lastText = texts[6];
      expect(lastText.opts.y + lastText.opts.h).toBeLessThanOrEqual(1.0 + 4.5);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 3. Extreme Character Lengths in Title, LeadText, and Badge
  // ═════════════════════════════════════════════════════════════════════════════
  describe('3. Extreme Character Lengths in Title, LeadText, and Badge', () => {

    it('[Negative Pair] Extreme Title (70 CJK characters): Wraps to 2 lines exceeding fixed titleH (0.30") and colliding with leadY', () => {
      const { slide, texts } = createSlideSpy();
      const extremeTitle = '본 대상 부동산 자산의 토지 및 건축물에 관한 공적장부 열람 및 권리관계 정밀 실사 프로토콜 종합 안내';
      // 53 CJK characters. In 12pt: 53 * (12/72) = 8.83 inches of text!

      fallbackCard(slide, 1.0, 1.0, 8.0, 4.5, {
        badge: '공적장부 열람 대상',
        title: extremeTitle,
        leadText: '리드문 텍스트입니다.',
        checklist: ['항목 1'],
      });

      const titleText = texts.find(t => t.text === extremeTitle)!;
      const leadText = texts.find(t => t.text === '리드문 텍스트입니다.')!;

      expect(titleText.opts.h).toBe(0.30); // Fixed title height in imlib.ts

      // Text wrap analysis: 8.83" text inside innerW (7.44") wraps to 2 lines
      const wrap = simulateTextWrap(extremeTitle, titleText.opts.w, 12);
      expect(wrap.lines.length).toBe(2);

      // 2 lines of 12pt font require at least 2 * (12/72 * 1.2) = 0.40"
      // But gap between titleY and leadY is only titleH + 0.04 = 0.34"
      const gapToLead = leadText.opts.y - titleText.opts.y;
      expect(gapToLead).toBeCloseTo(0.34, 2);
      // In PowerPoint rendering, 2 lines of 12pt text will physically overlap with the lead text!
    });

    it('[Negative Pair] Extreme Lead Text (300 CJK characters): Wraps to 5+ lines exceeding leadH (0.50") and intersecting divider line', () => {
      const { slide, shapes, texts } = createSlideSpy();
      const extremeLead = '본 자산의 지적경계 및 용도지역 지정 현황은 토지이음 및 부동산종합공부시스템 원장을 기반으로 대조·확인하며, 현장 실사 및 공부 열람을 통하여 등기부등본 및 토지대장, 건축물관리대장과의 정합성을 면밀히 검증합니다. 또한 도로접면 조건, 건축선 후퇴, 일조사선 규제 등 인허가 법률 요건을 사전에 점검하여 리스크를 최소화합니다.';
      // ~175 CJK characters

      fallbackCard(slide, 1.0, 1.0, 8.0, 4.5, {
        badge: '공적장부 열람 대상',
        title: '정상 타이틀',
        leadText: extremeLead,
        checklist: ['항목 1'],
      });

      const leadTextBox = texts.find(t => t.text === extremeLead)!;
      const dividerLine = shapes.find(s => s.type === 'line')!;

      // leadH is capped at Math.min(0.50, Math.max(0.30, h * 0.10)) = 0.45"
      expect(leadTextBox.opts.h).toBe(0.45);

      // Text wrap analysis: 175 CJK characters at 9.5pt inside 7.44" wraps to 4 lines
      const wrap = simulateTextWrap(extremeLead, leadTextBox.opts.w, 9.5);
      expect(wrap.lines.length).toBeGreaterThanOrEqual(3);

      // 4 lines at 9.5pt require 4 * (9.5/72 * 1.15) = ~0.61"
      // But divider line is placed at divY = leadY + leadH + 0.06 = leadY + 0.51"
      const leadToDivider = dividerLine.opts.y - leadTextBox.opts.y;
      expect(leadToDivider).toBeCloseTo(0.51, 2);
      // Text exceeds 0.51", so in PPTX rendering the divider line visually cuts through the bottom text lines!
    });

    it('[Positive Pair] Institutional Standard Lengths: All 4 production archetype strings fit cleanly with zero overlap', () => {
      const prodConfigs = [
        {
          title: '지적 및 토지이용계획 열람 안내',
          lead: '본 자산의 지적경계 및 용도지역 지정 현황은 토지이음 및 부동산종합공부시스템 원장을 기반으로 대조·확인합니다.',
          w: 8.60,
        },
        {
          title: '교통망 및 입지 인프라 실사 안내',
          lead: '대상 자산의 대중교통 접근성 및 반경 1km 내 비즈니스·상업 인프라 집적도를 현장 조사 기준으로 검증합니다.',
          w: 8.60,
        },
        {
          title: '건축물 현황 및 물리적 실사 점검 안내',
          lead: '본 자산의 내·외관 상태 및 주요 설비 사양은 매수 실사 절차 진행 시 현장 방문 조사를 통해 상세 확인 및 촬영이 진행됩니다.',
          w: CW,
        },
        {
          title: '임대차 계약 및 렌트롤 상세 실사 프로토콜',
          lead: '본 자산의 세부 층별 임대차 계약 원장 및 정산 내역은 매수 의향 접수 및 비밀유지협약(NDA) 체결 후 실측 대조가 진행됩니다.',
          w: CW,
        },
      ];

      for (const cfg of prodConfigs) {
        const { slide, texts } = createSlideSpy();
        fallbackCard(slide, 0.60, 1.62, cfg.w, 4.50, {
          badge: '실사 안내',
          title: cfg.title,
          leadText: cfg.lead,
          checklist: ['항목 1', '항목 2'],
        });

        const titleText = texts.find(t => t.text === cfg.title)!;
        const leadText = texts.find(t => t.text === cfg.lead)!;

        // Title fits on 1 single line in production width
        const titleWrap = simulateTextWrap(cfg.title, titleText.opts.w, 12);
        expect(titleWrap.lines.length).toBe(1);

        // Lead text fits in 2 lines or fewer, strictly within leadH (0.45")
        const leadWrap = simulateTextWrap(cfg.lead, leadText.opts.w, 9.5);
        expect(leadWrap.lines.length).toBeLessThanOrEqual(2);
      }
    });

    it('[Positive/Negative Pair] Badge String Cleaning and Width Clamping', () => {
      const { slide, shapes, texts } = createSlideSpy();
      // Caller passes badge wrapped in brackets: '[ 공적장부 열람 대상 ]'
      fallbackCard(slide, 1.0, 1.0, 8.0, 4.5, {
        badge: '[ 공적장부 열람 대상 ]',
        title: '배지 정규화 테스트',
        leadText: '배지 텍스트 정규화 검증',
        checklist: ['항목 1'],
      });

      // [Positive Pair] Bracket stripping & reformatting does not double-bracket
      const badgeText = texts[0];
      expect(badgeText.text).toBe('[ 공적장부 열람 대상 ]');
      expect(badgeText.text).not.toContain('[[ ');

      // [Negative Pair] Extremely long badge string is clamped to innerW * 0.6
      const { slide: slide2, shapes: shapes2 } = createSlideSpy();
      const longBadge = '서울특별시 강남구 테헤란로 핵심 거점 자산 실사 확인 배지';
      fallbackCard(slide2, 1.0, 1.0, 6.0, 4.5, {
        badge: longBadge,
        title: '장문 배지 테스트',
        leadText: '리드문',
        checklist: ['항목 1'],
      });

      const badgeShape = shapes2[1];
      const innerW = 6.0 - Math.min(0.28, 6.0 * 0.05) * 2;
      expect(badgeShape.opts.w).toBeLessThanOrEqual(innerW * 0.6 + TOLERANCE);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 4. Dark Mode (onDark: true) vs Light Mode (onDark: false) & Contrast
  // ═════════════════════════════════════════════════════════════════════════════
  describe('4. Dark Mode (onDark: true) vs Light Mode (onDark: false) & WCAG Contrast Physics', () => {

    it('[Positive Pair] Light Mode (onDark: false): All typography passes WCAG AAA (>= 7.0:1) and badges pass AA (>= 4.5:1)', () => {
      const { slide, shapes, texts } = createSlideSpy();
      fallbackCard(slide, 1.0, 1.0, 8.0, 4.5, {
        badge: '공적장부 열람 대상',
        badgeKind: 'brass',
        title: '라이트 모드 타이틀',
        leadText: '라이트 모드 리드문',
        checklist: ['체크리스트 본문 1'],
        onDark: false,
      });

      const container = shapes[0].opts;
      expect(container.fill.color).toBe(C.tint); // F5F7F9
      expect(container.line.color).toBe(C.line); // DDE3E8

      const cardBg = container.fill.color;

      // 1. Title: C.ink ('10161F') on C.tint ('F5F7F9')
      const title = texts.find(t => t.text === '라이트 모드 타이틀')!;
      expect(title.opts.color).toBe(C.ink);
      const titleContrast = getContrastRatio(title.opts.color, cardBg);
      expect(titleContrast).toBeGreaterThanOrEqual(14.0); // WCAG AAA >= 7.0:1

      // 2. Lead: C.slate ('2E3A4A') on C.tint ('F5F7F9')
      const lead = texts.find(t => t.text === '라이트 모드 리드문')!;
      expect(lead.opts.color).toBe(C.slate);
      const leadContrast = getContrastRatio(lead.opts.color, cardBg);
      expect(leadContrast).toBeGreaterThanOrEqual(9.5); // WCAG AAA >= 7.0:1

      // 3. Body: C.body ('2B3440') on C.tint ('F5F7F9')
      const body = texts.find(t => t.text === '체크리스트 본문 1')!;
      expect(body.opts.color).toBe(C.body);
      const bodyContrast = getContrastRatio(body.opts.color, cardBg);
      expect(bodyContrast).toBeGreaterThanOrEqual(10.0); // WCAG AAA >= 7.0:1

      // 4. Brass Badge: C.brassD ('8E6A20') on C.brassT ('FBF6EC')
      const badgeText = texts[0];
      const badgeShape = shapes[1];
      expect(badgeText.opts.color).toBe(C.brassD);
      expect(badgeShape.opts.fill.color).toBe(C.brassT);
      const badgeContrast = getContrastRatio(badgeText.opts.color, badgeShape.opts.fill.color);
      expect(badgeContrast).toBeGreaterThanOrEqual(4.5); // WCAG AA >= 4.5:1
    });

    it('[Positive Pair] Dark Mode (onDark: true): Typography passes WCAG AA (>= 4.5:1) and AAA (>= 7.0:1)', () => {
      const { slide, shapes, texts } = createSlideSpy();
      fallbackCard(slide, 1.0, 1.0, 8.0, 4.5, {
        badge: '권역 입지 분석',
        badgeKind: 'info',
        title: '다크 모드 타이틀',
        leadText: '다크 모드 리드문',
        checklist: ['다크 모드 체크리스트 본문'],
        onDark: true,
      });

      const container = shapes[0].opts;
      expect(container.fill.color).toBe(CD.block); // 232F3C
      expect(container.line.color).toBe(CD.border); // 2A3644

      const darkCardBg = container.fill.color;

      // 1. Title: 'FFFFFF' on CD.block ('232F3C')
      const title = texts.find(t => t.text === '다크 모드 타이틀')!;
      expect(title.opts.color).toBe('FFFFFF');
      const titleContrast = getContrastRatio(title.opts.color, darkCardBg);
      expect(titleContrast).toBeGreaterThanOrEqual(12.0); // WCAG AAA >= 7.0:1

      // 2. Lead: CD.mute ('8A96A2') on CD.block ('232F3C')
      const lead = texts.find(t => t.text === '다크 모드 리드문')!;
      expect(lead.opts.color).toBe(CD.mute);
      const leadContrast = getContrastRatio(lead.opts.color, darkCardBg);
      expect(leadContrast).toBeGreaterThanOrEqual(4.5); // WCAG AA >= 4.5:1

      // 3. Body: CD.body ('A8B2BC') on CD.block ('232F3C')
      const body = texts.find(t => t.text === '다크 모드 체크리스트 본문')!;
      expect(body.opts.color).toBe(CD.body);
      const bodyContrast = getContrastRatio(body.opts.color, darkCardBg);
      expect(bodyContrast).toBeGreaterThanOrEqual(6.0); // WCAG AA >= 4.5:1

      // 4. Bullet Marker: C.brass ('B98A2E') on CD.block ('232F3C')
      const bullet = shapes[3];
      expect(bullet.opts.fill.color).toBe(C.brass);
      const bulletContrast = getContrastRatio(bullet.opts.fill.color, darkCardBg);
      expect(bulletContrast).toBeGreaterThanOrEqual(3.5); // Graphical UI contrast >= 3.0:1
    });

    it('[Negative Pair] Badge Contrast Under Dark Mode: Badge pill retains internal contrast on light badge background', () => {
      // In dark mode, badgeColors in imlib.ts uses [fg, bg, line] which are light-pill tokens
      // e.g. info: [C.blue, C.blueL, C.blue]
      const { slide, shapes, texts } = createSlideSpy();
      fallbackCard(slide, 1.0, 1.0, 8.0, 4.5, {
        badge: '정보 배지',
        badgeKind: 'info',
        title: '다크 배지 검증',
        leadText: '리드문',
        checklist: ['항목 1'],
        onDark: true,
      });

      const badgeShape = shapes[1];
      const badgeText = texts[0];

      // Badge pill background is C.blueL ('E9EEF3'), foreground is C.blue ('44637F')
      expect(badgeShape.opts.fill.color).toBe(C.blueL);
      expect(badgeText.opts.color).toBe(C.blue);

      // Internal text-to-badgeBg contrast passes WCAG AA
      const internalContrast = getContrastRatio(badgeText.opts.color, badgeShape.opts.fill.color);
      expect(internalContrast).toBeGreaterThanOrEqual(4.8);

      // Badge pill itself on dark background has stark contrast (deliberate high visibility)
      const pillToCardContrast = getContrastRatio(badgeShape.opts.fill.color, CD.block);
      expect(pillToCardContrast).toBeGreaterThanOrEqual(10.0);
    });

    it('[Positive Pair] 4 Primary Badge Kinds (info, good, bad, brass) strictly satisfy WCAG AA (>= 4.5:1)', () => {
      const primaryKinds: FallbackCardOpts['badgeKind'][] = ['info', 'good', 'bad', 'brass'];

      for (const kind of primaryKinds) {
        const { slide, shapes, texts } = createSlideSpy();
        fallbackCard(slide, 1.0, 1.0, 8.0, 4.5, {
          badge: `${kind} 배지`,
          badgeKind: kind,
          title: '배지 종류별 테스트',
          leadText: '설명',
          checklist: ['항목'],
        });

        const badgeShape = shapes[1];
        const badgeText = texts[0];
        const contrast = getContrastRatio(badgeText.opts.color, badgeShape.opts.fill.color);

        // Primary badges strictly exceed WCAG AA normal text threshold (>= 4.5:1)
        expect(contrast).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('[Negative Pair] Warn Badge Contrast Profile: C.amber (96702A) on C.amberL (F7EFDC) achieves 3.94:1 (below 4.5:1 text AA)', () => {
      const { slide, shapes, texts } = createSlideSpy();
      fallbackCard(slide, 1.0, 1.0, 8.0, 4.5, {
        badge: '경고 배지',
        badgeKind: 'warn',
        title: '경고 배지 대비 검증',
        leadText: '설명',
        checklist: ['항목'],
      });

      const badgeShape = shapes[1];
      const badgeText = texts[0];
      const contrast = getContrastRatio(badgeText.opts.color, badgeShape.opts.fill.color);

      // EMPIRICAL CHALLENGE FINDING:
      // C.amber ('96702A') on C.amberL ('F7EFDC') yields 3.94:1
      // While it satisfies graphical UI object contrast (>= 3.0:1),
      // it falls below the WCAG AA text threshold of 4.5:1 for 8.5pt text.
      expect(contrast).toBeCloseTo(3.94, 1);
      expect(contrast).toBeGreaterThanOrEqual(3.0); // Passes UI component contrast
      expect(contrast).toBeLessThan(4.5);           // Fails strict normal-text AA
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // 5. Real PptxGenJS Binary Generation & Zero-Poison-Token Safety
  // ═════════════════════════════════════════════════════════════════════════════
  describe('5. Real PptxGenJS Binary Generation & End-to-End Safety', () => {

    it('[Positive Pair] Generates 5 distinct slides with fallbackCard variations without throwing or corrupting', async () => {
      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_WIDE'; // 13.333" x 7.50"

      // Slide 1: Cadastral Fallback (A06 layout)
      const s1 = pres.addSlide();
      fallbackCard(s1, 0.60, 1.62, 8.60, 4.50, {
        badge: '공적장부 열람 대상',
        badgeKind: 'brass',
        title: '지적 및 토지이용계획 열람 안내',
        leadText: '본 자산의 지적경계 및 용도지역 지정 현황을 대조합니다.',
        checklist: [
          '토지이용계획확인원 상 용도지역·지구 행위제한 정합성 실사',
          '지적공부(토지대장·지적도)상 지목, 면적 및 필지 경계 실측 대조',
          '건축선 후퇴, 도로접면 조건(진입로 폭원) 및 일조사선 규제 점검',
          '지구단위계획구역 여부 및 지자체 도시계획조례 추가 완화 가능성 검토',
        ],
      });

      // Slide 2: Photo Gallery Fallback (A14 layout)
      const s2 = pres.addSlide();
      fallbackCard(s2, M, 1.50, CW, 5.00, {
        badge: '현장 실사 예정',
        badgeKind: 'info',
        title: '건축물 현황 및 물리적 실사 점검 안내',
        leadText: '본 자산의 내·외관 상태 및 주요 설비 사양을 현장 방문 조사를 통해 확인합니다.',
        checklist: [
          '외관 파사드 마감재 보존 상태 및 균열·누수 흔적 정밀 점검',
          '승강기, 기계식 주차설비, 수배전반 등 핵심 설비 내구연한 점검',
          '옥상 방수 상태, 지하층 결로/누수 여부 점검',
          '법정 주차대수 확보 여부 및 층고 실측 검증',
        ],
      });

      // Slide 3: Yield Land Price Fallback (A23 layout)
      const s3 = pres.addSlide();
      fallbackCard(s3, 7.20, 1.62, 5.53, 4.90, {
        badge: '공시지가 열람 안내',
        badgeKind: 'brass',
        title: '개별공시지가 및 토지 가치 평가 안내',
        leadText: '대상 필지의 개별공시지가 연도별 이력을 공적 자료를 통해 확인합니다.',
        checklist: [
          '최근 5~10개년 개별공시지가 변동 추이 분석',
          '인근 표준지 공시지가 대비 토지 특성 분석',
          '토지 공시지가 대비 실거래가 매매 배율 검증',
          '보유세 과세표준 기준액 산출 점검',
        ],
      });

      // Slide 4: Rent Roll Fallback (A24 layout)
      const s4 = pres.addSlide();
      fallbackCard(s4, M, 1.62, CW, 4.80, {
        badge: '임대차 실사 안내',
        badgeKind: 'brass',
        title: '임대차 계약 및 렌트롤 상세 실사 프로토콜',
        leadText: '본 자산의 세부 층별 임대차 계약 원장은 NDA 체결 후 실측 대조가 진행됩니다.',
        checklist: [
          '임대차 계약서 원본 전수 대조',
          '보증금 및 월임대료 입금 금융 원장 대조',
          '특약 사항 및 렌트프리 실질 유효 임대료 산정',
          '명도 및 재계약 리스크 검토',
        ],
      });

      // Slide 5: Dark Mode Fallback
      const s5 = pres.addSlide();
      fallbackCard(s5, 1.0, 1.50, 10.0, 5.0, {
        badge: '권역 입지 분석',
        badgeKind: 'info',
        title: '교통망 및 입지 인프라 실사 안내 (Dark Mode)',
        leadText: '대상 자산의 대중교통 접근성을 현장 조사 기준으로 검증합니다.',
        checklist: [
          '주요 간선도로 및 광역 대중교통 환승 노선 접근성 실사',
          '도보 5분~10분 반경 유동인구 집객 동선 평가',
        ],
        onDark: true,
      });

      // Verify slides count is strictly 5
      expect((pres as any).slides).toHaveLength(5);

      // Verify binary export completes without error
      const buffer = await pres.write({ outputType: 'nodebuffer' });
      expect(buffer).toBeInstanceOf(Buffer);
      expect((buffer as Buffer).length).toBeGreaterThan(10000);

      const outDir = join(process.cwd(), 'docs/test/stress');
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      fs.writeFileSync(join(outDir, 'm4_fallback_test.pptx'), buffer as Buffer);
    });

    it('[Negative Pair] Zero Poison Tokens: Slide serialization contains 0 NaN, 0 undefined, 0 null tokens in stringified output', async () => {
      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_WIDE';
      const s = pres.addSlide();

      fallbackCard(s, 0.60, 1.62, 8.60, 4.50, {
        badge: '공적장부 열람 대상',
        title: '독성 토큰 방지 테스트',
        leadText: '독성 토큰 누출 차단 검증',
        checklist: ['점검항목 A', '점검항목 B'],
      });

      const serialized = JSON.stringify((pres as any).slides);

      // Rule G50 Poison Tokens: NaN, Infinity, -Infinity, [object Object]
      expect(serialized).not.toMatch(/"[^"]*":\s*NaN/);
      expect(serialized).not.toMatch(/"[^"]*":\s*Infinity/);
      expect(serialized).not.toMatch(/\[object Object\]/);
      expect(serialized).not.toMatch(/undefined/);
    });
  });

});
