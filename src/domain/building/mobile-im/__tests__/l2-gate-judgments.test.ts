import { describe, it, expect, vi } from 'vitest';
import { runPublishGates, type GateContext } from '@/domain/building/mobile-im/quality-gates-v02';
import { ALL_ARCHETYPES, INCOME_ARCHETYPES, DEV_ARCHETYPES, OPERATING_ARCHETYPES, OWNER_OCC_ARCHETYPES, TRADING_ARCHETYPES } from '@/domain/building/mobile-im/archetype-registry';
import { runRiskBoundaryCheck, runDisclosureGuard } from '@/domain/building/mobile-im/guardrails';
import { runCREQualityGate } from '@/domain/building/mobile-im/cre-quality-gate';
import * as llmClient from '@/ai/llm-client';

function createValidGateContext(overrides?: Partial<GateContext>): GateContext {
  return {
    salePrice: 10_000_000_000,
    area: 500,
    address: '서울특별시 강남구 역삼동 123-45',
    dataGrade: 'B',
    crossValidationPassed: true,
    hasHallucination: false,
    piiRemoved: true,
    hasRiskExpression: false,
    threeAxisConfirmed: true,
    imagePiiConfirmed: true,
    effectiveLandArea: 500,
    effectiveFAR: 200,
    calculatedEffectiveFAR: 200,
    termExplanationExists: true,
    disclosureDcf: '표기완료',
    disclosureIrr: '표기완료',
    capRateResults: [{ basis: 'NOI 기준' }],
    totalReturnScenarios: [{ label: '기본', totalReturnPct: 5.2 }],
    parcels: [],
    leaseUnits: [],
    imJudgeScore: 3.5,
    dcfGradeGatePassed: true,
    leaseActConfirmed: true,
    renewalRightConfirmed: true,
    mixedUseConfirmed: true,
    illegalArchitectureConfirmed: true,
    ...overrides,
  };
}

describe('L2: Gate & Judgment Logic (43 cases)', () => {
  describe('G-Series Blocking Gates (G01~G10)', () => {
    it('L2-G01: Sale price presence (G01)', () => {
      const pass = runPublishGates(createValidGateContext({ salePrice: 1000000000 }));
      expect(pass.blocked).toBe(false);
      const fail = runPublishGates(createValidGateContext({ salePrice: 0 }));
      expect(fail.blocked).toBe(true);
      expect(fail.failedBlocks.map(f => f.id)).toContain('G01');
    });

    it('L2-G02: Area presence (G02)', () => {
      const pass = runPublishGates(createValidGateContext({ area: 300 }));
      expect(pass.blocked).toBe(false);
      const fail = runPublishGates(createValidGateContext({ area: 0, effectiveLandArea: 0 }));
      expect(fail.blocked).toBe(true);
      expect(fail.failedBlocks.map(f => f.id)).toContain('G02');
    });

    it('L2-G03: Address presence (G03)', () => {
      const pass = runPublishGates(createValidGateContext({ address: '서울시 강남구' }));
      expect(pass.blocked).toBe(false);
      const fail = runPublishGates(createValidGateContext({ address: '' }));
      expect(fail.blocked).toBe(true);
      expect(fail.failedBlocks.map(f => f.id)).toContain('G03');
    });

    it('L2-G04: Grade D blocks publish (G04 / CF2: D grade publish blocked)', () => {
      const pass = runPublishGates(createValidGateContext({ dataGrade: 'B' }));
      expect(pass.blocked).toBe(false);
      const fail = runPublishGates(createValidGateContext({ dataGrade: 'D' }));
      expect(fail.blocked).toBe(true);
      expect(fail.failedBlocks.map(f => f.id)).toContain('G04');
    });

    it('L2-G05: Numerical cross validation passed (G05)', () => {
      const pass = runPublishGates(createValidGateContext({ crossValidationPassed: true }));
      expect(pass.blocked).toBe(false);
      const fail = runPublishGates(createValidGateContext({ crossValidationPassed: false }));
      expect(fail.blocked).toBe(true);
      expect(fail.failedBlocks.map(f => f.id)).toContain('G05');
    });

    it('L2-G06: Hallucination check (G06)', () => {
      const pass = runPublishGates(createValidGateContext({ hasHallucination: false }));
      expect(pass.blocked).toBe(false);
      const fail = runPublishGates(createValidGateContext({ hasHallucination: true }));
      expect(fail.blocked).toBe(true);
      expect(fail.failedBlocks.map(f => f.id)).toContain('G06');
    });

    it('L2-G07: PII removed (G07)', () => {
      const pass = runPublishGates(createValidGateContext({ piiRemoved: true }));
      expect(pass.blocked).toBe(false);
      const fail = runPublishGates(createValidGateContext({ piiRemoved: false }));
      expect(fail.blocked).toBe(true);
      expect(fail.failedBlocks.map(f => f.id)).toContain('G07');
    });

    it('L2-G08: Risk expression absence (G08)', () => {
      const pass = runPublishGates(createValidGateContext({ hasRiskExpression: false }));
      expect(pass.blocked).toBe(false);
      const fail = runPublishGates(createValidGateContext({ hasRiskExpression: true }));
      expect(fail.blocked).toBe(true);
      expect(fail.failedBlocks.map(f => f.id)).toContain('G08');
    });

    it('L2-G10: 3-Axis confirmation (G10)', () => {
      const pass = runPublishGates(createValidGateContext({ threeAxisConfirmed: true }));
      expect(pass.blocked).toBe(false);
      const fail = runPublishGates(createValidGateContext({ threeAxisConfirmed: false }));
      expect(fail.blocked).toBe(true);
      expect(fail.failedBlocks.map(f => f.id)).toContain('G10');
    });
  });

  describe('New Blocking Gates (G17~G30)', () => {
    it('L2-G20: Photo PII confirmation (G20)', () => {
      const pass = runPublishGates(createValidGateContext({ imagePiiConfirmed: true }));
      expect(pass.blocked).toBe(false);
      const fail = runPublishGates(createValidGateContext({ imagePiiConfirmed: false }));
      expect(fail.blocked).toBe(true);
      expect(fail.failedBlocks.map(f => f.id)).toContain('G20');
    });

    it('L2-G24: Cross-page numerical consistency (G24)', () => {
      const pass = runPublishGates(createValidGateContext({ crossValidationPassed: true }));
      expect(pass.blocked).toBe(false);
      const fail = runPublishGates(createValidGateContext({ crossValidationPassed: false }));
      expect(fail.blocked).toBe(true);
      expect(fail.failedBlocks.map(f => f.id)).toContain('G24');
    });

    it('L2-G26: Minimum photo count (G26)', () => {
      const pass = runPublishGates(createValidGateContext({ photoCount: 4 } as any));
      expect(pass.blocked).toBe(false);
      const fail = runPublishGates(createValidGateContext({ photoCount: 2 } as any));
      expect(fail.blocked).toBe(true);
      expect(fail.failedBlocks.map(f => f.id)).toContain('G26');
    });

    it('L2-G27: Tenant masking (G27)', () => {
      const pass = runPublishGates(createValidGateContext({ tenantMasked: true } as any));
      expect(pass.blocked).toBe(false);
      const fail = runPublishGates(createValidGateContext({ tenantMasked: false } as any));
      expect(fail.blocked).toBe(true);
      expect(fail.failedBlocks.map(f => f.id)).toContain('G27');
    });

    it('L2-G28: TotalGross vs EffectiveGross separation (G28)', () => {
      const pass = runPublishGates(createValidGateContext({ areaMetricSeparated: true } as any));
      expect(pass.blocked).toBe(false);
      const fail = runPublishGates(createValidGateContext({ areaMetricSeparated: false } as any));
      expect(fail.blocked).toBe(true);
      expect(fail.failedBlocks.map(f => f.id)).toContain('G28');
    });
  });

  describe('Quality Warning Gates (QG09~QG16)', () => {
    it('L2-QG09: IM Judge score >= 3.0', () => {
      const pass = runPublishGates(createValidGateContext({ imJudgeScore: 3.5 }));
      expect(pass.failedWarns.map(f => f.id)).not.toContain('QG09');
      const warn = runPublishGates(createValidGateContext({ imJudgeScore: 2.5 }));
      expect(warn.failedWarns.map(f => f.id)).toContain('QG09');
      expect(warn.blocked).toBe(false);
    });

    it('L2-QG12: Cap Rate basis specification', () => {
      const pass = runPublishGates(createValidGateContext({ capRateResults: [{ basis: 'NOI' }] }));
      expect(pass.failedWarns.map(f => f.id)).not.toContain('QG12');
      const warn = runPublishGates(createValidGateContext({ capRateResults: [{ basis: '' }] }));
      expect(warn.failedWarns.map(f => f.id)).toContain('QG12');
    });

    it('L2-QG14: Renewal right confirmation', () => {
      const pass = runPublishGates(createValidGateContext({ renewalRightConfirmed: true }));
      expect(pass.failedWarns.map(f => f.id)).not.toContain('QG14');
      const warn = runPublishGates(createValidGateContext({ renewalRightConfirmed: false }));
      expect(warn.failedWarns.map(f => f.id)).toContain('QG14');
    });
  });

  describe('Archetype Registry (25 Canonical Archetypes)', () => {
    it('L2-ARCH-01: ALL_ARCHETYPES contains exactly 25 canonical archetypes', () => {
      expect(Object.keys(ALL_ARCHETYPES).length).toBe(25);
    });

    it('L2-ARCH-02: Income archetypes has 9 types (R-INC-01 ~ R-INC-09)', () => {
      expect(Object.keys(INCOME_ARCHETYPES).length).toBe(9);
      expect(ALL_ARCHETYPES['R-INC-01']).toBeDefined();
      expect(ALL_ARCHETYPES['R-INC-09']).toBeDefined();
    });

    it('L2-ARCH-03: Development archetypes has 4 types (R-DEV-01 ~ R-DEV-04)', () => {
      expect(Object.keys(DEV_ARCHETYPES).length).toBe(4);
    });

    it('L2-ARCH-04: Operating archetypes has 4 types (R-OPR-01 ~ R-OPR-04)', () => {
      expect(Object.keys(OPERATING_ARCHETYPES).length).toBe(4);
    });

    it('L2-ARCH-05: Warning archetypes (R-OPR-04, R-TRD-04) narrative / trigger conditions', () => {
      expect(ALL_ARCHETYPES['R-OPR-04'].label).toContain('용도 리스크');
      expect(ALL_ARCHETYPES['R-TRD-04'].label).toContain('출구 제약');
    });

    it('L2-ARCH-06: No forbidden words in archetype labels', () => {
      const forbidden = ['랜드마크', '캡레이트', '투자보장', '확정수익'];
      for (const [key, item] of Object.entries(ALL_ARCHETYPES)) {
        for (const word of forbidden) {
          expect(item.label).not.toContain(word);
        }
      }
    });
  });

  describe('Guardrails & CRE Lexicon Standards', () => {
    it('L2-LEX-01: runRiskBoundaryCheck detects forbidden investment guarantee terms', () => {
      const textWithRisk = '이 매물은 100% 확정 수익을 보장하며 원금 보장됩니다.';
      const res = runRiskBoundaryCheck(textWithRisk);
      expect(res.status).toBe('blocked');
      expect(res.issues.length).toBeGreaterThan(0);
    });

    it('L2-LEX-02: runDisclosureGuard permits standard CRE disclosure', () => {
      const standardText = '연 순수익률 (Cap Rate) 4.5% 기준 산정되었습니다.';
      const res = runDisclosureGuard(standardText);
      expect(res.status).toBe('pass');
    });
  });

  describe('Fail-Closed Quality Gate (BL-6)', () => {
    it('L2-FAILCLOSED: Unresolved / unevaluated gate defaults to passed:false and riskLevel:high', async () => {
      vi.spyOn(llmClient, 'callLLM').mockRejectedValueOnce(new Error('LLM Service Unavailable'));
      const result = await runCREQualityGate('## 테스트 내용', 'investment_thesis');
      expect(result.passed).toBe(false);
      expect(result.riskLevel).toBe('high');
      expect(result.issues[0].excerpt).toContain('LLM 검사기 호출 실패');
    });
  });
});