/**
 * D32 L4 테스트 — BL-3 수익률 기준 정합 + BL-4 역레버리지 경고
 * 
 * 각 케이스에 negative 짝이 있어야 합니다 (D30 교훈).
 */
import { describe, it, expect } from 'vitest';
import { runPublishGates, type GateContext, type GateResult } from '@/domain/building/mobile-im/quality-gates-v02';

// 기본 GateContext (모든 게이트 통과 상태)
function baseCtx(overrides: Partial<GateContext> = {}): GateContext {
  return {
    capRateResults: [{ basis: 'GPI' }],
    totalReturnScenarios: [{ label: 'base', totalReturnPct: 5 }],
    parcels: [{ exclusions: [], area: 500 }],
    leaseUnits: [{ convertedDeposit: 1e8, opposingPower: false }],
    disclosureDcf: 'present',
    disclosureIrr: 'present',
    termExplanationExists: true,
    effectiveLandArea: 500,
    effectiveFAR: 300,
    calculatedEffectiveFAR: 300,
    salePrice: 25000000000,
    area: 2490,
    address: '서울 영등포구 양평동4가',
    dataGrade: 'B',
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
    // D32 기본값: 정합·경고 충족
    yieldBasisConsistent: true,
    negativeLeverageWarned: true,
    foreignPhotoCount: 0,
    ...overrides,
  };
}

describe('D32 L4 — BL-3 수익률 기준 정합 (G38)', () => {
  it('L4-YLD-01: yieldBasis 라벨과 계산 경로 일치 시 G38 통과', () => {
    const ctx = baseCtx({ yieldBasisConsistent: true });
    const report = runPublishGates(ctx);
    const g38 = report.results.find((r: GateResult) => r.id === 'G38');
    expect(g38).toBeDefined();
    expect(g38!.passed).toBe(true);
  });

  it('L4-YLD-01-NEG: yieldBasis 불일치 시 G38 차단', () => {
    const ctx = baseCtx({ yieldBasisConsistent: false });
    const report = runPublishGates(ctx);
    const g38 = report.results.find((r: GateResult) => r.id === 'G38');
    expect(g38).toBeDefined();
    expect(g38!.passed).toBe(false);
    expect(report.blocked).toBe(true);
  });
});

describe('D32 L4 — BL-4 역레버리지 경고 (G40)', () => {
  it('L4-LEV-01: 역레버리지 경고가 표시된 상태면 G40 통과', () => {
    const ctx = baseCtx({ negativeLeverageWarned: true });
    const report = runPublishGates(ctx);
    const g40 = report.results.find((r: GateResult) => r.id === 'G40');
    expect(g40).toBeDefined();
    expect(g40!.passed).toBe(true);
  });

  it('L4-LEV-01-NEG: 역레버리지 미경고 시 G40 차단', () => {
    const ctx = baseCtx({ negativeLeverageWarned: false });
    const report = runPublishGates(ctx);
    const g40 = report.results.find((r: GateResult) => r.id === 'G40');
    expect(g40).toBeDefined();
    expect(g40!.passed).toBe(false);
    expect(report.blocked).toBe(true);
  });
});

describe('D32 L4 — BL-1 타 물건 사진 (G37)', () => {
  it('L4-IMG-01: 타 물건 사진 0장이면 G37 통과', () => {
    const ctx = baseCtx({ foreignPhotoCount: 0 });
    const report = runPublishGates(ctx);
    const g37 = report.results.find((r: GateResult) => r.id === 'G37');
    expect(g37).toBeDefined();
    expect(g37!.passed).toBe(true);
  });

  it('L4-IMG-01-NEG: 타 물건 사진 1장이면 G37 차단', () => {
    const ctx = baseCtx({ foreignPhotoCount: 1 });
    const report = runPublishGates(ctx);
    const g37 = report.results.find((r: GateResult) => r.id === 'G37');
    expect(g37).toBeDefined();
    expect(g37!.passed).toBe(false);
    expect(report.blocked).toBe(true);
  });
});

describe('D32 L4 — data-binder 레거시 경로 검증', () => {
  it('L4-YLD-02: buildSummaryFromOverview가 GPI 기준일 때 라벨에 NOI를 쓰지 않음', async () => {
    const { bindSectionData } = await import('@/domain/building/mobile-im/pptx/data-binder');
    const doc = {
      body: {
        heroCard: {
          askingPriceDisplay: '250억',
          capRateBase: 2.41,
          leveragedYieldPct: 3.85,
          equityRequiredBil: 125,
          posture: 'income',
          // yieldBasis 미지정 = GPI 기본
        },
      },
      sections: [
        { title: '물건 개요', section_type: 'property_overview', markdown: '### 테스트\n- 대지면적: 500㎡' },
      ],
    };
    const dataMap = bindSectionData(doc, { area_signal: '양평동' });
    const summaryMetrics = (dataMap['summary'] as any)?.metrics ?? [];
    
    // Cap Rate 라벨에 'NOI'가 없어야 함 (GPI 기준이므로)
    const capRateMetric = summaryMetrics.find((m: any) => m.label.includes('Cap Rate'));
    if (capRateMetric) {
      expect(capRateMetric.label).toContain('총임대료');
      expect(capRateMetric.label).not.toContain('순영업소득');
    }
  });

  it('L4-LEV-02: capRate 2.41% < 기본금리 4.5%이면 ROE 대신 역레버리지 경고', async () => {
    const { bindSectionData } = await import('@/domain/building/mobile-im/pptx/data-binder');
    const doc = {
      body: {
        heroCard: {
          askingPriceDisplay: '250억',
          capRateBase: 2.41,  // < 4.5% 기본금리
          leveragedYieldPct: 3.85,
          equityRequiredBil: 125,
          posture: 'income',
        },
      },
      sections: [
        { title: '물건 개요', section_type: 'property_overview', markdown: '### 테스트\n- 대지면적: 500㎡' },
      ],
    };
    const dataMap = bindSectionData(doc, { area_signal: '양평동' });
    const summaryMetrics = (dataMap['summary'] as any)?.metrics ?? [];
    
    // '자기자본수익률' 라벨이 단독으로 있으면 안 됨
    const roeMetric = summaryMetrics.find((m: any) => m.label === '자기자본수익률');
    expect(roeMetric).toBeUndefined();
    
    // 대신 역레버리지 경고가 있어야 함
    const negLevMetric = summaryMetrics.find((m: any) => m.label.includes('역레버리지'));
    expect(negLevMetric).toBeDefined();
  });

  it('L4-LEV-02-NEG: capRate 6% > 기본금리 4.5%이면 ROE 정상 표시', async () => {
    const { bindSectionData } = await import('@/domain/building/mobile-im/pptx/data-binder');
    const doc = {
      body: {
        heroCard: {
          askingPriceDisplay: '100억',
          capRateBase: 6.0,  // > 4.5% 기본금리 → 정상 레버리지
          leveragedYieldPct: 8.5,
          equityRequiredBil: 50,
          posture: 'income',
        },
      },
      sections: [
        { title: '물건 개요', section_type: 'property_overview', markdown: '### 테스트\n- 대지면적: 300㎡' },
      ],
    };
    const dataMap = bindSectionData(doc, { area_signal: '테스트' });
    const summaryMetrics = (dataMap['summary'] as any)?.metrics ?? [];
    
    // 정상 레버리지: ROE 표시됨
    const roeMetric = summaryMetrics.find((m: any) => m.label === '자기자본수익률');
    expect(roeMetric).toBeDefined();
    expect(roeMetric.value).toBe('8.5%');
    
    // 역레버리지 경고 없음
    const negLevMetric = summaryMetrics.find((m: any) => m.label.includes('역레버리지'));
    expect(negLevMetric).toBeUndefined();
  });
});
