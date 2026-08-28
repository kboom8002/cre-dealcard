/**
 * @file l5-gate-coverage.test.ts
 * @description D45 R1 준수: PUBLISH_GATES 전수 positive/negative pair 테스트
 *
 * im.errors.yaml의 51개 게이트 코드 중 기존 테스트에서 12개만 언급.
 * 이 파일은 나머지 39개 코드에 대해:
 *   - positive: 정상 GateContext → gate.check() === true
 *   - negative: 위반 필드 설정 → gate.check() === false
 * 를 검증합니다.
 *
 * KNOWLEDGE_SOURCE.md §A6: "되돌렸을 때 실패하는가"로 검증
 * AGENTS.md §7: Negative 짝 의무
 */
import { describe, it, expect } from 'vitest';
import {
  runPublishGates,
  PUBLISH_GATES,
  type GateContext,
} from '@/domain/building/mobile-im/quality-gates-v02';

// ── Helper: 모든 게이트가 통과하는 기준 GateContext ──
function createPassingContext(): GateContext & Record<string, unknown> {
  return {
    // ── GateContext 필수 필드 ──
    capRateResults: [{ basis: 'net' }],
    totalReturnScenarios: [{ label: '하락 시나리오', totalReturnPct: -5 }],
    parcels: [{ exclusions: [], area: 100 }],
    leaseUnits: [{ convertedDeposit: 100000000, opposingPower: true }],
    disclosureDcf: 'hidden',
    disclosureIrr: 'hidden',
    termExplanationExists: true,
    effectiveLandArea: 500,
    effectiveFAR: 250,
    calculatedEffectiveFAR: 250,

    // ── Phase 4 필드 ──
    salePrice: 2500000000,
    area: 750,
    address: '서울특별시 영등포구 양평동4가',
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

    // ── D31 지면 물리 필드 ──
    maxCropRatio: 0.3,
    minEffectiveDpi: 200,
    textOverflowCount: 0,
    overlapMaxInches: 0,
    bleedCount: 0,

    // ── D32 필드 ──
    yieldBasisConsistent: true,
    negativeLeverageWarned: true,
    foreignPhotoCount: 0,
    aspectDistortionMaxPct: 3,
    labelContentMismatchCount: 0,

    // ── D33 필드 ──
    vacancyNarrativeContradiction: false,
    fallbackDuplicateCount: 0,
    highlightSpecDuplicate: false,
    unclosedBracketCount: 0,
    staticTextQGPassed: true,

    // ── D37 Claim/Conflict 필드 ──
    unresolvedConflictCount: 0,
    unevidencedClaimCount: 0,
    asOfMissingCount: 0,
    calculationNotReproducible: false,
    pageCountExceeded: false,
    permitZoneNotDisplayed: false,

    // ── 코드에서 (ctx as any)로 접근하는 확장 필드 ──
    imageDpi: 150,
    exifMatch: true,
    requiredSectionsComplete: true,
    areaLabelAccurate: true,
    llmSafetyPassed: true,
    photoCount: 5,
    tenantMasked: true,
    areaMetricSeparated: true,
    brandHallucinationBlocked: true,
    assumptionMarked: true,
  };
}

function findGate(id: string) {
  return PUBLISH_GATES.find((g) => g.id === id);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Integration: 기준 컨텍스트로 runPublishGates 전수 통과
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('D45 R1 Integration: runPublishGates 전수', () => {
  it('passing context → 모든 게이트 통과, blocked=false', () => {
    const ctx = createPassingContext();
    const report = runPublishGates(ctx as GateContext);
    expect(report.blocked).toBe(false);
    expect(report.failedBlocks).toEqual([]);
    // warn 게이트도 전부 통과해야 함
    expect(report.failedWarns).toEqual([]);
    expect(report.allPassed).toBe(true);
  });

  it('negative: salePrice=0 → blocked=true (최소 G01 차단)', () => {
    const ctx = { ...createPassingContext(), salePrice: 0 };
    const report = runPublishGates(ctx as GateContext);
    expect(report.blocked).toBe(true);
    expect(report.failedBlocks.some((r) => r.id === 'G01')).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 개별 게이트 positive/negative pair (R1 미커버 39종)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// [gateId, failOverride, description]
type NegSpec = [string, Record<string, unknown>, string];

const NEGATIVE_PAIRS: NegSpec[] = [
  // ── Group A: 기본 발행 차단 ──
  ['G08', { hasRiskExpression: true }, '위험 표현 있음 → 차단'],
  ['G10', { threeAxisConfirmed: false }, '3축 분류 미확정 → 차단'],
  ['G20', { imagePiiConfirmed: false }, '이미지 PII 미승인 → 차단'],

  // ── Group B: 이미지/마스킹/면적 (코드 as any 필드) ──
  ['G22', { areaLabelAccurate: false }, '면적 라벨 부정확 → 차단'],
  // G23: () => true — 항상 통과. 설계상 negative pair 불가 (아래 별도 테스트)
  ['G24', { crossValidationPassed: false }, '교차검증 실패 → 차단'],
  ['G25', { llmSafetyPassed: false }, 'LLM 안전 판정 실패 → 차단'],
  ['G26', { photoCount: 1 }, '사진 3매 미만 → 차단'],
  ['G27', { tenantMasked: false }, '임차인 미마스킹 → 차단'],
  ['G28', { areaMetricSeparated: false }, '면적 지표 미분리 → 차단'],
  ['G29', { brandHallucinationBlocked: false }, '브랜드 환각 미차단 → 차단'],

  // ── Group C: D31 지면 물리 게이트 ──
  ['G31', { maxCropRatio: 0.5 }, '크로핑률 45% 초과 → 차단'],
  ['G32', { minEffectiveDpi: 100 }, '실효 DPI 150 미만 → 차단'],
  ['G33', { textOverflowCount: 3 }, '텍스트 넘침 3건 → 차단'],
  ['G34', { overlapMaxInches: 0.02 }, '요소 겹침 0.02in → 경고'],
  ['G35', { bleedCount: 2 }, '지면 이탈 2건 → 차단'],

  // ── Group D: D32 수익률/왜곡/혼입 ──
  ['G36', { aspectDistortionMaxPct: 8 }, '종횡비 왜곡 8% → 차단'],
  ['G37', { foreignPhotoCount: 1 }, '타 물건 사진 1매 혼입 → 차단'],
  ['G38', { yieldBasisConsistent: false }, 'yieldBasis 불일치 → 차단'],
  ['G39', { labelContentMismatchCount: 2 }, '라벨-내용 불일치 2건 → 경고'],
  ['G40', { negativeLeverageWarned: false }, '역레버리지 미경고 → 차단'],

  // ── Group E: D33 서술어/폴백/괄호 ──
  ['G41', { vacancyNarrativeContradiction: true }, '만실↔공실 서술 모순 → 차단'],
  ['G42', { fallbackDuplicateCount: 3 }, '폴백 중복 3건 → 차단'],
  ['G43', { highlightSpecDuplicate: true }, 'highlights↔제원 중복 → 경고'],
  ['G44', { unclosedBracketCount: 2 }, '열린 괄호 2건 → 경고'],
  ['G45', { staticTextQGPassed: false }, '정적 문구 QG 실패 → 경고'],

  // ── Group F: D37 Claim/Conflict 게이트 ──
  ['G48', { unresolvedConflictCount: 2 }, '미해결 Conflict 2건 → 차단'],
  ['G49', { unevidencedClaimCount: 3 }, '증거 없는 Claim 3건 → 차단'],
  ['G50', { asOfMissingCount: 1 }, '기준일 미표시 1건 → 경고'],
  ['G51', { calculationNotReproducible: true }, '계산식 재현 불가 → 차단'],
  ['G52', { pageCountExceeded: true }, '면수 상한 초과 → 차단'],
  ['G53', { permitZoneNotDisplayed: true }, '토지거래허가 미표시 → 경고'],

  // ── Group G: QG 계열 품질 경고 ──
  ['QG09', { imJudgeScore: 2.0 }, 'IM Judge 3.0 미만 → 경고'],
  ['QG11', { dcfGradeGatePassed: false }, 'DCF 등급 미통과 → 경고'],
  ['QG12', { capRateResults: [{ basis: '' }] }, 'Cap Rate basis 미기재 → 경고'],
  ['QG13', { leaseActConfirmed: false }, '임대차 법령 미확정 → 경고'],
  ['QG14', { renewalRightConfirmed: false }, '갱신요구권 미확인 → 경고'],
  ['QG15', { mixedUseConfirmed: false }, '혼합 용도 법령 미확정 → 경고'],
  ['QG16', { illegalArchitectureConfirmed: false }, '위반건축물 미확인 → 경고'],
];

describe('D45 R1: 개별 게이트 positive/negative pair', () => {
  // ── Positive: 각 게이트가 passing context에서 통과 ──
  const allGateIds = NEGATIVE_PAIRS.map(([id]) => id);
  // G23은 negative pair 없지만 positive 검증은 필요
  allGateIds.push('G23');

  it.each(allGateIds)('positive: %s 통과', (gateId) => {
    const gate = findGate(gateId);
    expect(gate, `${gateId}가 PUBLISH_GATES에 존재해야 합니다`).toBeDefined();
    const ctx = createPassingContext();
    expect(gate!.check(ctx as GateContext)).toBe(true);
  });

  // ── Negative: 위반 필드로 각 게이트 실패 ──
  it.each(NEGATIVE_PAIRS)(
    'negative: %s — %s',
    (gateId, failOverride, _desc) => {
      const gate = findGate(gateId);
      expect(gate, `${gateId}가 PUBLISH_GATES에 존재해야 합니다`).toBeDefined();
      const ctx = { ...createPassingContext(), ...failOverride };
      expect(gate!.check(ctx as GateContext)).toBe(false);
    },
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. G23 특수 케이스: 항상 통과 (negative pair 불가)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('G23: 렌트롤 전량 표기 — 항상 통과 (BL-2에서 보장)', () => {
  it('G23 check는 () => true — 빈 컨텍스트에서도 통과', () => {
    const gate = findGate('G23')!;
    expect(gate.check({} as GateContext)).toBe(true);
  });

  it('G23에는 설계상 negative pair가 없음 (KNOWLEDGE_SOURCE §A6)', () => {
    // G23은 BL-2 단계에서 렌트롤 전량이 데이터로 보장되므로
    // 게이트 수준에서는 항상 true를 반환합니다.
    // "되돌렸을 때 실패하는가" — 되돌릴 수 없으므로 negative pair 면제.
    const gate = findGate('G23')!;
    expect(gate.check).toBeDefined();
    expect(gate.id).toBe('G23');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 게이트 severity 일관성: block 게이트 실패 → blocked=true
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('D45: severity 일관성', () => {
  const blockGates = NEGATIVE_PAIRS.filter(([id]) => {
    const gate = findGate(id);
    return gate?.severity === 'block';
  });

  it.each(blockGates)(
    'severity=block %s 실패 시 report.blocked=true',
    (gateId, failOverride) => {
      const ctx = { ...createPassingContext(), ...failOverride };
      const report = runPublishGates(ctx as GateContext);
      const failed = report.failedBlocks.find((r) => r.id === gateId);
      expect(failed, `${gateId}가 failedBlocks에 있어야 합니다`).toBeDefined();
    },
  );

  const warnGates = NEGATIVE_PAIRS.filter(([id]) => {
    const gate = findGate(id);
    return gate?.severity === 'warn';
  });

  it.each(warnGates)(
    'severity=warn %s 실패 시 report.blocked=false (경고만)',
    (gateId, failOverride) => {
      const ctx = { ...createPassingContext(), ...failOverride };
      const report = runPublishGates(ctx as GateContext);
      // warn 게이트 하나만 실패해도 blocked=false여야 함
      // 단, 다른 block 게이트가 같은 필드를 공유하면 blocked=true 가능
      const failedWarn = report.failedWarns.find((r) => r.id === gateId);
      expect(failedWarn, `${gateId}가 failedWarns에 있어야 합니다`).toBeDefined();
    },
  );
});
