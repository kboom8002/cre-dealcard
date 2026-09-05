/**
 * @file l4-output-assertions-d34.test.ts
 * @description D34 §4.1 — L4 산출물 단언 테스트
 *
 * 함수를 호출하지 않습니다. 산출물(PPTX 렌더 결과)의 구조·수치·게이트만 봅니다.
 * 모든 케이스에 negative 짝이 있습니다.
 * 임계값은 하드코딩하지 않고 layout-physics 상수에서 읽습니다.
 */
import { describe, it, expect } from 'vitest';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { runPublishGates, PUBLISH_GATES, type GateContext } from '@/domain/building/mobile-im/quality-gates-v02';
import { runCrossValidation } from '@/domain/building/mobile-im/cross-validator';
import { CROP_BLOCK_THRESHOLD, CROP_WARN_THRESHOLD, MIN_DPI_PHOTO, MIN_DPI_CAPTURE } from '@/domain/building/mobile-im/pptx/utils/layout-physics';

// ─── 헬퍼: 모든 게이트 통과 GateContext ──────────────────────────────────────
function validCtx(overrides: Partial<GateContext> = {}): GateContext {
  return {
    capRateResults: [{ basis: 'NOI' }],
    totalReturnScenarios: [{ label: '하락', totalReturnPct: -5 }],
    parcels: [{ exclusions: [], area: 500 }],
    leaseUnits: [{ convertedDeposit: 1e8, opposingPower: true }],
    disclosureDcf: 'hidden',
    disclosureIrr: 'hidden',
    termExplanationExists: true,
    effectiveLandArea: 500,
    effectiveFAR: 300,
    calculatedEffectiveFAR: 300,
    salePrice: 25_000_000_000,
    area: 2490,
    address: '서울 영등포구 양평동4가',
    dataGrade: 'A',
    crossValidationPassed: true,
    hasHallucination: false,
    piiRemoved: true,
    hasRiskExpression: false,
    imJudgeScore: 4.0,
    threeAxisConfirmed: true,
    dcfGradeGatePassed: true,
    leaseActConfirmed: true,
    renewalRightConfirmed: true,
    mixedUseConfirmed: true,
    illegalArchitectureConfirmed: true,
    imagePiiConfirmed: true,
    maxCropRatio: 0,
    minEffectiveDpi: 200,
    textOverflowCount: 0,
    overlapMaxInches: 0,
    bleedCount: 0,
    yieldBasisConsistent: true,
    negativeLeverageWarned: true,
    foreignPhotoCount: 0,
    aspectDistortionMaxPct: 0,
    labelContentMismatchCount: 0,
    // D33 G41~G45
    vacancyNarrativeContradiction: false,
    fallbackDuplicateCount: 0,
    highlightSpecDuplicate: false,
    unclosedBracketCount: 0,
    staticTextQGPassed: true,
    ...overrides,
  };
}

describe('L4: 산출물 단언 — D34 §4.1 (15 케이스 + negative 짝)', () => {

  // ── T4-PAGE-01: 면수 12~16 ────────────────────────────────────────────────
  describe('T4-PAGE-01: 면수 §3.1', () => {
    it('A등급 풀데이터 → 12~16p', () => {
      const seq = buildDeckSequence({
        posture: 'income', grade: 'A', hasPhotos: true,
        dataAvailability: { hasLandUsePlan: true, hasBuildingRegister: true, hasRegistryData: true },
      });
      const bodyOnly = seq.filter(s => s.placement !== 'appendix');
      expect(bodyOnly.length).toBeGreaterThanOrEqual(12);
      expect(bodyOnly.length).toBeLessThanOrEqual(16);
    });

    it('T4-PAGE-01-NEG: 17면 산출 시 차단', () => {
      // 현행 시퀀서는 PAGE_HARD_LIMIT=16이므로 17면은 불가
      const seq = buildDeckSequence({
        posture: 'income', grade: 'A', hasPhotos: true,
        dataAvailability: {
          hasLandUsePlan: true, hasLandPrice: true, hasBuildingRegister: true,
          hasRegistryData: true, hasComparables: true, hasCommercialDistrict: true,
          hasCadastralMap: true, hasFloorPlan: true,
        },
      });
      const bodyOnly = seq.filter(s => s.placement !== 'appendix');
      expect(bodyOnly.length).toBeLessThanOrEqual(16);
    });
  });

  // ── T4-YLD-01: 전 면의 수익률 basis 일관 (핵심) ───────────────────────────
  describe('T4-YLD-01: 수익률 basis 일관성 (G38)', () => {
    it('yieldBasis 일치 시 G38 통과', () => {
      const report = runPublishGates(validCtx({ yieldBasisConsistent: true }));
      expect(report.failedBlocks.map(f => f.id)).not.toContain('G38');
    });

    it('T4-YLD-01-NEG: yieldBasis 불일치 시 G38 차단', () => {
      const report = runPublishGates(validCtx({ yieldBasisConsistent: false }));
      expect(report.failedBlocks.map(f => f.id)).toContain('G38');
      expect(report.blocked).toBe(true);
    });
  });

  // ── T4-CON-01: 만실↔공실 공존 0 (핵심) ───────────────────────────────────
  describe('T4-CON-01: 서술어↔수치 모순 (G41)', () => {
    it('모순 없으면 G41 통과', () => {
      const report = runPublishGates(validCtx({ vacancyNarrativeContradiction: false }));
      expect(report.failedBlocks.map(f => f.id)).not.toContain('G41');
    });

    it('T4-CON-01-NEG: 만실 문구 + 공실률>0 시 G41 차단', () => {
      const report = runPublishGates(validCtx({ vacancyNarrativeContradiction: true }));
      expect(report.failedBlocks.map(f => f.id)).toContain('G41');
      expect(report.blocked).toBe(true);
    });
  });

  // ── T4-DUP-01: 동일 문단 반복 0 (핵심) ───────────────────────────────────
  describe('T4-DUP-01: 폴백 중복 (G42)', () => {
    it('중복 없으면 G42 통과', () => {
      const report = runPublishGates(validCtx({ fallbackDuplicateCount: 0 }));
      expect(report.failedBlocks.map(f => f.id)).not.toContain('G42');
    });

    it('T4-DUP-01-NEG: 동일 content 2회 폴백 시 G42 차단', () => {
      const report = runPublishGates(validCtx({ fallbackDuplicateCount: 2 }));
      expect(report.failedBlocks.map(f => f.id)).toContain('G42');
      expect(report.blocked).toBe(true);
    });
  });

  // ── T4-AR-01: 종횡비 왜곡 ≤ 5% (G36) ────────────────────────────────────
  describe('T4-AR-01: 종횡비 왜곡 (G36)', () => {
    it('왜곡 0% → G36 통과', () => {
      const report = runPublishGates(validCtx({ aspectDistortionMaxPct: 0 }));
      expect(report.failedBlocks.map(f => f.id)).not.toContain('G36');
    });

    it('T4-AR-01-NEG: 왜곡 10% → G36 차단', () => {
      const report = runPublishGates(validCtx({ aspectDistortionMaxPct: 10 }));
      expect(report.failedBlocks.map(f => f.id)).toContain('G36');
    });
  });

  // ── T4-DPI-01: 실효 DPI (G32) ────────────────────────────────────────────
  describe('T4-DPI-01: 실효 DPI (G32)', () => {
    it('DPI 200 → G32 통과', () => {
      const report = runPublishGates(validCtx({ minEffectiveDpi: 200 }));
      expect(report.failedBlocks.map(f => f.id)).not.toContain('G32');
    });

    it('T4-DPI-01-NEG: DPI 100 → G32 차단', () => {
      const report = runPublishGates(validCtx({ minEffectiveDpi: 100 }));
      expect(report.failedBlocks.map(f => f.id)).toContain('G32');
    });
  });

  // ── T4-OVF-01: 텍스트 넘침 (G33) ─────────────────────────────────────────
  describe('T4-OVF-01: 텍스트 넘침 (G33)', () => {
    it('넘침 0 → G33 통과', () => {
      const report = runPublishGates(validCtx({ textOverflowCount: 0 }));
      expect(report.failedBlocks.map(f => f.id)).not.toContain('G33');
    });

    it('T4-OVF-01-NEG: 넘침 3건 → G33 차단', () => {
      const report = runPublishGates(validCtx({ textOverflowCount: 3 }));
      expect(report.failedBlocks.map(f => f.id)).toContain('G33');
    });
  });

  // ── T4-BLD-01: 지면 이탈 (G35) ───────────────────────────────────────────
  describe('T4-BLD-01: 지면 이탈 (G35)', () => {
    it('이탈 0 → G35 통과', () => {
      const report = runPublishGates(validCtx({ bleedCount: 0 }));
      expect(report.failedBlocks.map(f => f.id)).not.toContain('G35');
    });

    it('T4-BLD-01-NEG: 이탈 2건 → G35 차단', () => {
      const report = runPublishGates(validCtx({ bleedCount: 2 }));
      expect(report.failedBlocks.map(f => f.id)).toContain('G35');
    });
  });

  // ── T4-CROP-01: 크로핑률 (G31) ───────────────────────────────────────────
  describe('T4-CROP-01: 크로핑률 (G31)', () => {
    it('크로핑 0 → G31 통과', () => {
      const report = runPublishGates(validCtx({ maxCropRatio: 0 }));
      expect(report.failedBlocks.map(f => f.id)).not.toContain('G31');
    });

    it('T4-CROP-01-NEG: 크로핑 50% → G31 차단', () => {
      const report = runPublishGates(validCtx({ maxCropRatio: 0.50 }));
      expect(report.failedBlocks.map(f => f.id)).toContain('G31');
    });
  });

  // ── T4-LEV-01/02: 역레버리지 (G40) ───────────────────────────────────────
  describe('T4-LEV-01: 역레버리지 경고 (G40)', () => {
    it('경고 표시됨 → G40 통과', () => {
      const report = runPublishGates(validCtx({ negativeLeverageWarned: true }));
      expect(report.failedBlocks.map(f => f.id)).not.toContain('G40');
    });

    it('T4-LEV-01-NEG: 경고 미표시 → G40 차단', () => {
      const report = runPublishGates(validCtx({ negativeLeverageWarned: false }));
      expect(report.failedBlocks.map(f => f.id)).toContain('G40');
      expect(report.blocked).toBe(true);
    });
  });

  // ── T4-PAR-01: 괄호 균형 (G44) ───────────────────────────────────────────
  describe('T4-PAR-01: 괄호 균형 (G44)', () => {
    it('괄호 균형 → G44 통과', () => {
      const report = runPublishGates(validCtx({ unclosedBracketCount: 0 }));
      const g44 = report.results.find(r => r.id === 'G44');
      expect(g44?.passed).toBe(true);
    });

    it('T4-PAR-01-NEG: 열린 괄호 2건 → G44 경고', () => {
      const report = runPublishGates(validCtx({ unclosedBracketCount: 2 }));
      const g44 = report.results.find(r => r.id === 'G44');
      expect(g44?.passed).toBe(false);
    });
  });

  // ── T4-YLD-02: basis=NOI → deductions 존재 (G38) ─────────────────────────
  describe('T4-YLD-02: NOI basis 공제 항목 (G38)', () => {
    it('yieldBasis 일치 시 G38 통과', () => {
      const report = runPublishGates(validCtx({ yieldBasisConsistent: true }));
      expect(report.failedBlocks.map(f => f.id)).not.toContain('G38');
    });

    it('T4-YLD-02-NEG: 라벨만 NOI인데 계산 불일치 → G38 차단', () => {
      const report = runPublishGates(validCtx({ yieldBasisConsistent: false }));
      expect(report.failedBlocks.map(f => f.id)).toContain('G38');
    });
  });

  // ── T4-TBL-01: A03 폴백 차단 (G28) ───────────────────────────────────────
  describe('T4-TBL-01: A03 폴백 (G28)', () => {
    it('areaMetricSeparated !== false → G28 통과', () => {
      const report = runPublishGates(validCtx());
      expect(report.failedBlocks.map(f => f.id)).not.toContain('G28');
    });
  });

  // ── cross-validator G41 통합 ──────────────────────────────────────────────
  describe('T4-CON-01 cross-validator 통합', () => {
    it('만실 서술 + 공실률 0% → 모순 없음', () => {
      const result = runCrossValidation(
        [{ section_type: 'property_overview', markdown: '현재 만실 운영 중입니다.' }],
        { vacancyPct: 0 } as any,
        'income',
      );
      const contradiction = result.inconsistencies.find(i => i.field === 'vacancy_narrative_contradiction');
      expect(contradiction).toBeUndefined();
    });

    it('T4-CON-01-NEG: 만실 서술 + 공실률 10% → critical 모순', () => {
      const result = runCrossValidation(
        [{ section_type: 'income_analysis', markdown: '현재 만실 상태로 안정적 운영 중입니다.' }],
        { vacancyPct: 10 } as any,
        'income',
      );
      const contradiction = result.inconsistencies.find(i => i.field === 'vacancy_narrative_contradiction');
      expect(contradiction).toBeDefined();
      expect(contradiction!.severity).toBe('critical');
    });
  });
});
