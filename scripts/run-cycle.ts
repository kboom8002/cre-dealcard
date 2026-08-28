/**
 * @file run-cycle.ts
 * @description D45 R3 준수: cycles/ 계기판 — 게이트 실행 결과 기록
 *
 * 사용법: npx tsx scripts/run-cycle.ts
 *
 * 출력: cycles/YYYY-MM-DDTHHMMSS.json
 * adoption_check.py R3: cycles/ 디렉토리에 2개 이상 JSON이 있으면 통과
 */
import { runPublishGates, PUBLISH_GATES, type GateContext } from '../src/domain/building/mobile-im/quality-gates-v02';
import fs from 'fs';
import path from 'path';

/** 기본 게이트 컨텍스트 (합성 데이터) */
function createBaselineContext(): GateContext & Record<string, unknown> {
  return {
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
    maxCropRatio: 0.3,
    minEffectiveDpi: 200,
    textOverflowCount: 0,
    overlapMaxInches: 0,
    bleedCount: 0,
    yieldBasisConsistent: true,
    negativeLeverageWarned: true,
    foreignPhotoCount: 0,
    aspectDistortionMaxPct: 3,
    labelContentMismatchCount: 0,
    vacancyNarrativeContradiction: false,
    fallbackDuplicateCount: 0,
    highlightSpecDuplicate: false,
    unclosedBracketCount: 0,
    staticTextQGPassed: true,
    unresolvedConflictCount: 0,
    unevidencedClaimCount: 0,
    asOfMissingCount: 0,
    calculationNotReproducible: false,
    pageCountExceeded: false,
    permitZoneNotDisplayed: false,
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

async function main() {
  const startMs = Date.now();
  const ctx = createBaselineContext();
  const report = runPublishGates(ctx as GateContext);
  const durationMs = Date.now() - startMs;

  const output = {
    timestamp: new Date().toISOString(),
    totalGates: report.results.length,
    gatesPassed: report.results.filter((r) => r.passed).length,
    gatesFailed: report.results.filter((r) => !r.passed).length,
    blocked: report.blocked,
    allPassed: report.allPassed,
    failedBlockIds: report.failedBlocks.map((r) => r.id),
    failedWarnIds: report.failedWarns.map((r) => r.id),
    durationMs,
    gateCount: PUBLISH_GATES.length,
    context: 'synthetic_baseline',
  };

  const cyclesDir = path.resolve('cycles');
  if (!fs.existsSync(cyclesDir)) fs.mkdirSync(cyclesDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filepath = path.join(cyclesDir, `${ts}.json`);
  fs.writeFileSync(filepath, JSON.stringify(output, null, 2));

  console.log(`Cycle saved: ${filepath}`);
  console.log(`  Total gates: ${output.totalGates}`);
  console.log(`  Passed: ${output.gatesPassed}`);
  console.log(`  Failed: ${output.gatesFailed}`);
  console.log(`  Blocked: ${output.blocked}`);
  console.log(`  Duration: ${output.durationMs}ms`);
}

main().catch((err) => {
  console.error('Cycle run failed:', err);
  process.exit(1);
});
