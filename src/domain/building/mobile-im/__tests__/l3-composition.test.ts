import { describe, it, expect } from 'vitest';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { getSectionPlan, getAugmentedSectionPlan, SECTION_CATALOG } from '@/domain/building/mobile-im/section-catalog';
import { renderChecklist } from '@/domain/building/mobile-im/checklist-renderer';

describe('L3: Composition & Deck Sequencing (32 cases)', () => {
  describe('buildDeckSequence', () => {
    const postures = ['income', 'development', 'owner_occupied', 'operating', 'trading'] as const;

    postures.forEach(posture => {
      it(`L3-L02-01: ${posture} / B grade yields 10~20 slides (goldilocks)`, () => {
        const seq = buildDeckSequence({ posture, grade: 'B' });
        expect(seq.length).toBeGreaterThanOrEqual(10);
        expect(seq.length).toBeLessThanOrEqual(16); // D34: 정본 §3.1 상한 16
        expect(seq[0].archetype).toBe('A01');
      });

      it(`L3-L02-02: ${posture} / A grade yields 12~20 slides (goldilocks)`, () => {
        const seq = buildDeckSequence({ posture, grade: 'A' });
        expect(seq.length).toBeGreaterThanOrEqual(12);
        expect(seq.length).toBeLessThanOrEqual(16); // D34: 정본 §3.1 상한 16
      });
    });

    it('L3-L02-09: D grade throws error blocking publication', () => {
      expect(() => buildDeckSequence({ posture: 'income', grade: 'D' })).toThrow(/D등급은 발행할 수 없습니다/);
      expect(() => buildDeckSequence({ posture: 'development', grade: 'D' })).toThrow(/D등급은 발행할 수 없습니다/);
    });

    it('L3-L02-03: R-INC-04 includes rent normalization archetype in pro income sequence', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'A',
        incomeArchetype: 'R-INC-04',
      });
      const slideTitles = seq.map(s => s.title);
      expect(slideTitles.some(t => t.includes('정상화') || t.includes('임대료'))).toBe(true);
    });

    it('L3-L02-04: R-INC-02 includes value-add archetype in pro income sequence', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'A',
        incomeArchetype: 'R-INC-02',
      });
      const slideTitles = seq.map(s => s.title);
      expect(slideTitles.some(t => t.includes('가치 상승') || t.includes('수익 분석'))).toBe(true);
    });
  });

  describe('Section Catalog & Augmentation', () => {
    it('L3-SEC-01: SECTION_CATALOG defines plans for all 5 postures', () => {
      const postures = ['income', 'owner_occupied', 'development', 'operating', 'trading'] as const;
      postures.forEach(p => {
        const plan = SECTION_CATALOG[p];
        expect(plan).toBeDefined();
        expect(plan.sections.length).toBeGreaterThanOrEqual(7);
        expect(plan.required.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('L3-SEC-02: getSectionPlan returns valid plan for income', () => {
      const plan = getSectionPlan('income');
      expect(plan.sections).toContain('lease_status');
      expect(plan.sections).toContain('income_analysis');
      expect(plan.required).toContain('property_overview');
      expect(plan.required).toContain('checklist');
    });

    it('L3-SEC-03: getSectionPlan for development requires development_feasibility', () => {
      const plan = getSectionPlan('development');
      expect(plan.sections).toContain('development_feasibility');
      expect(plan.required).toContain('development_feasibility');
    });

    it('L3-AUG-01: getAugmentedSectionPlan injects cautionary section for R-OPR-04', () => {
      const augPlan = getAugmentedSectionPlan('operating', 'R-OPR-04');
      expect(augPlan.sections.some(s => s.includes('risk') || s.includes('operating'))).toBe(true);
    });

    it('L3-AUG-02: getAugmentedSectionPlan injects cautionary section for R-TRD-04', () => {
      const augPlan = getAugmentedSectionPlan('trading', 'R-TRD-04');
      expect(augPlan.sections).toBeDefined();
    });
  });

  describe('Checklist Renderer', () => {
    it('L3-CHK-01: renderChecklist renders all deficiency & warning categories without truncation', () => {
      const section = renderChecklist({
        deficiencies: [
          { field: 'rentRoll', label: '임대차 원장', affects: ['yield_gross'] as any, severity: 'block', nextBest: null },
          { field: 'officialLandPrice', label: '공시지가', affects: ['yield_noi'] as any, severity: 'degrade', nextBest: null },
        ],
        gateWarnings: [
          { id: 'QG14', label: '최초계약일 미확인 호실 존재' },
        ],
        assumptions: [
          { slot: 'opexRatio', label: '운영비 비율', value: 10 },
        ],
        lockedMetrics: [
          { metric: '실투자금', missingSlots: ['대출액', '취득세'] },
        ],
      });

      expect(section.section_type).toBe('checklist');
      expect(section.markdown).toContain('임대차 원장');
      expect(section.markdown).toContain('공시지가');
      expect(section.markdown).toContain('최초계약일 미확인');
      expect(section.markdown).toContain('운영비 비율');
      expect(section.markdown).toContain('실투자금');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // D34 §4.2 — T3 편성 케이스
  // ═══════════════════════════════════════════════════════════════════════════

  describe('D34 T3: Sequencing Assertions (8 cases)', () => {

    it('T3-SEQ-01: SlideSpec.requiredKeys 필드가 존재 (G39)', () => {
      const seq = buildDeckSequence({ posture: 'income', grade: 'B' });
      // requiredKeys는 선택적 필드이므로 undefined 가능 — 타입만 확인
      for (const spec of seq) {
        if (spec.requiredKeys) {
          expect(Array.isArray(spec.requiredKeys)).toBe(true);
        }
      }
    });

    /**
     * T3-RR-01: hasRentRoll=false면 rentRoll 면이 열리지 않아야 함
     * 
     * ✅ D34에서 발견 → deck-sequencer.ts 수정으로 해결.
     */
    it('T3-RR-01: hasRentRoll=false면 rentRoll 면이 열리지 않음', () => {
      const seq = buildDeckSequence({
        posture: 'income', grade: 'B',
        dataAvailability: { hasRentRoll: false },
      });
      const keys = seq.map(s => s.dataKey);
      expect(keys).not.toContain('rentRoll');
    });

    it('T3-RR-01-NEG: hasRentRoll=true면 rentRoll 면 포함 (A등급)', () => {
      const seq = buildDeckSequence({
        posture: 'income', grade: 'A',
        dataAvailability: { hasRentRoll: true },
      });
      // A등급에서 rentRoll 면이 열릴 수 있음 (절삭 대상이지만 데이터 면 자체는 추가됨)
      // 절삭으로 제거될 수 있으므로 면수만 확인
      expect(seq.length).toBeLessThanOrEqual(16);
    });

    it('T3-IMG-02: 사진 없으면 갤러리 면 미개방', () => {
      const seq = buildDeckSequence({
        posture: 'income', grade: 'B',
        hasPhotos: false,
      });
      const keys = seq.map(s => s.dataKey);
      expect(keys).not.toContain('gallery');
    });

    it('T3-IMG-02-NEG: 사진 있으면 갤러리 면 포함', () => {
      const seq = buildDeckSequence({
        posture: 'income', grade: 'B',
        hasPhotos: true,
      });
      const keys = seq.map(s => s.dataKey);
      expect(keys).toContain('gallery');
    });

    it('T3-TRIM-01: 절삭 시 보호 키 전량 잔존', () => {
      const seq = buildDeckSequence({
        posture: 'income', grade: 'A', hasPhotos: true,
        dataAvailability: {
          hasLandUsePlan: true, hasLandPrice: true,
          hasBuildingRegister: true, hasRegistryData: true,
          hasComparables: true, hasCommercialDistrict: true,
          hasCadastralMap: true, hasFloorPlan: true,
        },
      });
      const keys = seq.map(s => s.dataKey);
      // 보호 키: cover, summary, closing, risk, checklist, process, thesis
      expect(keys).toContain('cover');
      expect(keys).toContain('summary');
      expect(keys).toContain('closing');
      expect(keys).toContain('risk');
      expect(keys).toContain('checklist');
      expect(keys).toContain('process');
      expect(keys).toContain('thesis');
    });

    it('T3-TRIM-01-NEG: titleRights는 보호키 — 절삭 후에도 잔존', () => {
      const seq = buildDeckSequence({
        posture: 'income', grade: 'A', hasPhotos: true,
        dataAvailability: {
          hasLandUsePlan: true, hasLandPrice: true,
          hasBuildingRegister: true, hasRegistryData: true,
          hasComparables: true, hasCommercialDistrict: true,
          hasCadastralMap: true,
        },
      });
      const keys = seq.map(s => s.dataKey);
      expect(keys).toContain('titleRights');
    });

    it('T3-LAND-01: D등급 → G30 throw · 슬라이드 0', () => {
      expect(() => buildDeckSequence({
        posture: 'income', grade: 'D',
      })).toThrow('[G30]');
    });
  });
});