/**
 * @file a22-stacking-plan.test.ts
 * @description Unit tests for Archetype A22 (Architectural Setback Stacking Plan)
 *              Rule 6 (산출물 단언 우선) 및 Rule 7 (Negative Pair 의무) 철저 준수
 */

import { describe, it, expect } from 'vitest';
import pptxgen from 'pptxgenjs';
import { SLIDE_ARCHETYPE_REGISTRY } from '../../domain/building/mobile-im/pptx/archetypes';
import {
  buildA22StackingPlan,
  calculateSetbackRatio,
  inferTenantCategory,
  SEMANTIC_COLORS,
} from '../../domain/building/mobile-im/pptx/archetypes/a22-stacking-plan';
import { buildA22Props, bindSectionData } from '../../domain/building/mobile-im/pptx/data-binder';
import { buildDeckSequence } from '../../domain/building/mobile-im/pptx/deck-sequencer';
import type { StackingPlanFloor } from '../../domain/building/mobile-im/types';

describe('Archetype A22: Architectural Setback Stacking Plan', () => {

  const nhCapitalStackingFixture: StackingPlanFloor[] = [
    { floor: '11F', use: '업무시설(사무소)', tenant: 'NH농협캐피탈(주)', floorAreaM2: 592.89, exclusiveAreaPy: 120.94, leasableAreaPy: 241.53, expiryYear: 2026, isVacant: false },
    { floor: '10F', use: '업무시설(사무소)', tenant: 'NH농협캐피탈(주)', floorAreaM2: 738.09, exclusiveAreaPy: 156.85, leasableAreaPy: 313.27, expiryYear: 2026, isVacant: false },
    { floor: '9F',  use: '업무시설(사무소)', tenant: 'NH농협캐피탈(주)', floorAreaM2: 1153.83, exclusiveAreaPy: 276.87, leasableAreaPy: 552.94, expiryYear: 2026, isVacant: false },
    { floor: '8F',  use: '업무시설(사무소)', tenant: 'NH농협캐피탈(주)', floorAreaM2: 1153.83, exclusiveAreaPy: 276.87, leasableAreaPy: 552.94, expiryYear: 2026, isVacant: false },
    { floor: '7F',  use: '업무시설(사무소)', tenant: 'NH농협캐피탈(주)', floorAreaM2: 1153.83, exclusiveAreaPy: 276.87, leasableAreaPy: 552.94, expiryYear: 2026, isVacant: false },
    { floor: '6F',  use: '업무시설(사무소)', tenant: 'NH농협캐피탈(주)', floorAreaM2: 1154.93, exclusiveAreaPy: 277.20, leasableAreaPy: 553.67, expiryYear: 2026, isVacant: false },
    { floor: '5F',  use: '업무시설(사무소)', tenant: 'NH농협캐피탈(주)', floorAreaM2: 1154.93, exclusiveAreaPy: 277.20, leasableAreaPy: 553.67, expiryYear: 2026, isVacant: false },
    { floor: '4F',  use: '업무시설(사무소)', tenant: '어니스트인베스트먼트', floorAreaM2: 1160.61, exclusiveAreaPy: 278.22, leasableAreaPy: 555.65, expiryYear: 2025, isVacant: false },
    { floor: '3F',  use: '업무시설(사무소)', tenant: '한국휴렛팩커드', floorAreaM2: 1160.61, exclusiveAreaPy: 278.23, leasableAreaPy: 555.65, expiryYear: 2025, isVacant: false },
    { floor: '2F',  use: '제2종근린생활시설', tenant: '세광그린푸드', floorAreaM2: 987.06, exclusiveAreaPy: 221.52, leasableAreaPy: 426.98, expiryYear: 2027, isVacant: false },
    { floor: '1F',  use: '제2종근린생활시설(휴게음식)', tenant: '롤링핀 / GS25', floorAreaM2: 915.60, exclusiveAreaPy: 155.77, leasableAreaPy: 315.94, expiryYear: 2028, isVacant: false },
    { floor: 'B1F', use: '제1종·제2종근린생활시설', tenant: '아비쥬의원', floorAreaM2: 1542.25, exclusiveAreaPy: 318.56, leasableAreaPy: 553.24, expiryYear: 2027, isVacant: false },
    { floor: 'B2F', use: '업무시설(서고)', tenant: 'NH농협캐피탈(서고)', floorAreaM2: 1624.94, exclusiveAreaPy: 318.31, leasableAreaPy: 533.52, expiryYear: 2026, isVacant: false },
    { floor: 'B3F', use: '주차장', tenant: '자주식 주차장 (34대)', floorAreaM2: 1624.94, exclusiveAreaPy: 0, leasableAreaPy: 0, expiryYear: 0, isVacant: false },
    { floor: 'B4F', use: '주차장', tenant: '자주식 주차장 (34대)', floorAreaM2: 1624.94, exclusiveAreaPy: 0, leasableAreaPy: 0, expiryYear: 0, isVacant: false },
    { floor: 'B5F', use: '주차장', tenant: '자주식 주차장 (27대)', floorAreaM2: 1624.94, exclusiveAreaPy: 0, leasableAreaPy: 0, expiryYear: 0, isVacant: false },
    { floor: 'B6F', use: '기계실 / 전기실', tenant: '중앙 통제실 및 기계·전기설비', floorAreaM2: 1332.39, exclusiveAreaPy: 0, leasableAreaPy: 0, expiryYear: 0, isVacant: false },
  ];

  // ─────────────────────────────────────────────────────────────
  // 1. 레지스트리 등록 단언
  // ─────────────────────────────────────────────────────────────
  describe('Registry Registration', () => {
    it('[Positive] A22 아키타입이 SLIDE_ARCHETYPE_REGISTRY에 정상 등록되어 있어야 함', () => {
      expect(SLIDE_ARCHETYPE_REGISTRY['A22']).toBeDefined();
      expect(typeof SLIDE_ARCHETYPE_REGISTRY['A22']).toBe('function');
      expect(SLIDE_ARCHETYPE_REGISTRY['A22']).toBe(buildA22StackingPlan);
    });

    it('[Negative Pair] 존재하지 않는 A99 아키타입은 레지스트리에 없어야 함', () => {
      expect(SLIDE_ARCHETYPE_REGISTRY['A99']).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. 셋백 비율 및 기하 계산 단언 (Rule 7 Negative Pair)
  // ─────────────────────────────────────────────────────────────
  describe('Setback Ratio Math', () => {
    const stdArea = 1153.83; // 9F 기준층

    it('[Positive] 상층부 셋백 11F는 기준층의 약 51% (0.51) 너비 비율을 산출해야 함', () => {
      const ratio = calculateSetbackRatio(592.89, stdArea, false);
      expect(ratio).toBeCloseTo(0.51, 2);
    });

    it('[Positive] 상층부 셋백 10F는 기준층의 약 64% (0.64) 너비 비율을 산출해야 함', () => {
      const ratio = calculateSetbackRatio(738.09, stdArea, false);
      expect(ratio).toBeCloseTo(0.64, 2);
    });

    it('[Positive] 지하층 B1F는 굴착 심도로 인해 134% (1.34) 너비 비율을 산출해야 함', () => {
      const ratio = calculateSetbackRatio(1542.25, stdArea, true);
      expect(ratio).toBeCloseTo(1.34, 2);
    });

    it('[Positive] 지상층 최소 너비는 0.45로 하한 클램프되어야 함', () => {
      const ratio = calculateSetbackRatio(100.0, stdArea, false);
      expect(ratio).toBe(0.45);
    });

    it('[Positive] 지하층 최대 너비는 1.35로 상한 클램프되어야 함', () => {
      const ratio = calculateSetbackRatio(2500.0, stdArea, true);
      expect(ratio).toBe(1.35);
    });

    it('[Negative Pair] 음수 바닥면적 입력 시 예외(Error)를 발생시켜야 함', () => {
      expect(() => calculateSetbackRatio(-500, stdArea, false)).toThrow(/음수일 수 없습니다/);
    });

    it('[Negative Pair] 기준층 면적이 0이거나 없을 경우 기본 비율 1.0을 안전하게 반환해야 함', () => {
      expect(calculateSetbackRatio(500, 0, false)).toBe(1.0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. 의미적 테넌트 카테고리 추론 단언 (Rule 7 Negative Pair)
  // ─────────────────────────────────────────────────────────────
  describe('Tenant Category Inference', () => {
    it('[Positive] NH농협캐피탈 및 사옥 키워드는 anchor로 분류되어야 함', () => {
      const cat = inferTenantCategory({ tenant: 'NH농협캐피탈(주) 본사' }, 'NH농협캐피탈');
      expect(cat).toBe('anchor');
    });

    it('[Positive] 어니스트인베스트먼트 및 일반 업무시설은 general로 분류되어야 함', () => {
      const cat = inferTenantCategory({ use: '업무시설(사무소)', tenant: '어니스트인베스트먼트' });
      expect(cat).toBe('general');
    });

    it('[Positive] 롤링핀, GS25, 아비쥬의원은 retail로 분류되어야 함', () => {
      expect(inferTenantCategory({ use: '제2종근린생활시설', tenant: '롤링핀 베이커리' })).toBe('retail');
      expect(inferTenantCategory({ use: '근린생활', tenant: 'GS25 편의점' })).toBe('retail');
      expect(inferTenantCategory({ use: '의원', tenant: '아비쥬의원' })).toBe('retail');
    });

    it('[Positive] 주차장 및 기계실은 parking으로 분류되어야 함', () => {
      expect(inferTenantCategory({ use: '주차장', tenant: '자주식 주차장 (34대)' })).toBe('parking');
      expect(inferTenantCategory({ use: '기계실 / 전기실', tenant: '중앙 통제실' })).toBe('parking');
    });

    it('[Positive] 공실 플래그 또는 공실 텍스트는 vacant로 분류되어야 함', () => {
      expect(inferTenantCategory({ isVacant: true, tenant: '-' })).toBe('vacant');
      expect(inferTenantCategory({ tenant: '공실 (임차인 모집 중)' })).toBe('vacant');
    });

    it('[Negative Pair] 공실이 아니고 일반 업무인 경우 절대 vacant나 parking으로 잘못 분류되지 않아야 함', () => {
      const cat = inferTenantCategory({ use: '업무시설', tenant: '한국휴렛팩커드', isVacant: false });
      expect(cat).not.toBe('vacant');
      expect(cat).not.toBe('parking');
      expect(cat).toBe('general');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. A22 슬라이드 렌더링 무결성 및 Rule 1/3/6/10 단언
  // ─────────────────────────────────────────────────────────────
  describe('A22 Slide Generation & Compliance', () => {
    const pres = new pptxgen();
    pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5

    it('[Positive] A22 정상 데이터 주입 시 슬라이드가 성공적으로 생성되어야 함', () => {
      const input = {
        pres,
        slideNum: 5,
        docno: 'IM-TEST-2026',
        data: {
          title: 'NH농협캐피탈빌딩 건축 입면 셋백 스태킹 플랜',
          kicker: 'ARCHITECTURAL STACKING PLAN',
          stackingPlan: nhCapitalStackingFixture,
          summary: {
            totalGrossAreaPy: 6261.9,
            exclusiveRatePct: 51.6,
            waleYears: 2.1,
            vacancyRatePct: 0.0,
          },
          anchorTenantName: 'NH농협캐피탈',
          onDark: false,
        },
        grade: 'A' as const,
        provenance: {},
      };

      const result = buildA22StackingPlan(input);
      expect(result.slide).toBeDefined();
      expect(result.warnings.length).toBe(0);
    });

    it('[Positive] 다크 모드(onDark: true)에서도 정상 렌더링되어야 함', () => {
      const input = {
        pres,
        slideNum: 5,
        docno: 'IM-TEST-2026',
        data: {
          title: '건축 입면 셋백 스태킹 플랜',
          stackingPlan: nhCapitalStackingFixture,
          onDark: true,
        },
        grade: 'A' as const,
        provenance: {},
      };

      const result = buildA22StackingPlan(input);
      expect(result.slide).toBeDefined();
      expect(result.warnings.length).toBe(0);
    });

    it('[Negative Pair] Rule 1 페르소나 단어("60대 자산가") 오염 시 warnings 경고가 수집되어야 함', () => {
      const input = {
        pres,
        slideNum: 5,
        docno: 'IM-TEST-2026',
        data: {
          title: '60대 자산가를 위한 스태킹 플랜', // Rule 1 위반 제목
          stackingPlan: nhCapitalStackingFixture,
        },
        grade: 'A' as const,
        provenance: {},
      };

      const result = buildA22StackingPlan(input);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('[Rule 1]'))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Data Binder & Deck Sequencer 연동 단언
  // ─────────────────────────────────────────────────────────────
  describe('Data Binder & Deck Sequencer Integration', () => {
    it('[Positive] buildA22Props가 마크다운 및 body에서 스태킹 데이터를 올바르게 구성해야 함', () => {
      const body = {
        heroCard: { grossFloorAreaM2: 20700.61, waleYears: 2.1, vacancyRatePct: 0.0 },
        stackingPlan: nhCapitalStackingFixture,
      };

      const props = buildA22Props('', [], [], body);
      expect(props.kicker).toBe('ARCHITECTURAL STACKING PLAN');
      expect(props.stackingPlan.length).toBe(17);
      expect(props.summary.totalGrossAreaPy).toBeCloseTo(6261.9, 1);
      expect(props.summary.waleYears).toBe(2.1);
    });

    it('[Positive] bindSectionData가 lease_status로부터 stackingPlan 슬롯을 정상 합성해야 함', () => {
      const doc = {
        title: 'NH농협캐피탈빌딩',
        body: {
          stackingPlan: nhCapitalStackingFixture,
          heroCard: { grossFloorAreaM2: 20700.61 },
        },
        sections: [
          {
            section_type: 'lease_status',
            title: '임대차 현황 및 스태킹 플랜',
            markdown: '| 층수 | 주용도 | 전용(평) | 임대(평) | 주요 입주사 | 만기 |\n|---|---|---|---|---|---|\n| 11F | 업무 | 120.9 | 241.5 | NH농협캐피탈 | 2026 |',
          },
        ],
      };

      const bound = bindSectionData(doc);
      expect(bound['stackingPlan']).toBeDefined();
      expect(bound['stackingPlan'].stackingPlan).toBeDefined();
      expect(bound['stackingPlan'].stackingPlan.length).toBeGreaterThan(0);
    });

    it('[Positive] deck-sequencer에서 hasStackingPlan: true일 때 A22 슬라이드가 편성되어야 함', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'A',
        dataAvailability: {
          hasStackingPlan: true,
          hasRentRoll: true,
        },
      });

      const a22Slide = seq.find(s => s.archetype === 'A22');
      expect(a22Slide).toBeDefined();
      expect(a22Slide?.dataKey).toBe('stackingPlan');

      // Rule 10: 본문 슬라이드는 16면 이하이어야 함
      const bodySlides = seq.filter(s => s.placement !== 'appendix');
      expect(bodySlides.length).toBeLessThanOrEqual(16);
    });

    it('[Negative Pair] hasStackingPlan이 없을 때는 income 시퀀스에 A22가 편성되지 않아야 함', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'A',
        dataAvailability: {
          hasStackingPlan: false,
          hasRentRoll: true,
        },
      });

      const a22Slide = seq.find(s => s.archetype === 'A22');
      expect(a22Slide).toBeUndefined();
    });
  });
});
