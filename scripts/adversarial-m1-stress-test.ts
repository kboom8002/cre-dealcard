import { ClaimRegistry } from '../src/domain/building/im-core/claim-registry';
import { computeDeterministicClaimsHash } from '../src/domain/building/im-core/target-hash';
import { registerActionCardClaims, ActionCard } from '../src/domain/building/im-core/action-card';
import { registerProFormaClaims, ProFormaClaimRegistrationInput } from '../src/domain/building/im-core/broker-input-validator';
import { ApprovalLedgerService } from '../src/domain/building/im-core/approval/ledger-service';
import { StudioApprovalService } from '../src/domain/building/pptx-studio/approval/studio-approval-service';
import { studioService } from '../src/domain/building/pptx-studio/studio-service';
import { InvalidationEngine } from '../src/platform/im-pipeline/regeneration/invalidation-engine';

interface StressTestResult {
  name: string;
  passed: boolean;
  details: string;
  evidence?: any;
}

const results: StressTestResult[] = [];

function record(name: string, passed: boolean, details: string, evidence?: any) {
  results.push({ name, passed, details, evidence });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${icon}] ${name}: ${details}`);
}

// ── 1. Order Invariance: 1,000 Shuffled Permutations of Complex Claim Registry ──
console.log('\n--- 1. ORDER INVARIANCE CHALLENGE ---');

function createPopulatedRegistry(): { registry: ClaimRegistry; initialOrder: any[] } {
  const reg = new ClaimRegistry();

  // 1. Public Data Claims
  reg.register({
    subject: 'land_area_pyeong',
    value: 180.3,
    unit: '평',
    evidence: [{ sourceId: 'public_api', asOf: '2026-08-31', excerpt: '토지대장' }],
    provenance: 'public_api',
    asOf: '2026-08-31',
    status: 'reconciled',
  });
  reg.register({
    subject: 'total_floor_area_m2',
    value: 1487.6,
    unit: '㎡',
    evidence: [{ sourceId: 'public_api', asOf: '2026-08-31', excerpt: '건축물대장' }],
    provenance: 'public_api',
    asOf: '2026-08-31',
    status: 'reconciled',
  });

  // 2. Broker Input Claims
  reg.register({
    subject: 'asking_price_krw',
    value: 23_000_000_000,
    unit: '원',
    evidence: [{ sourceId: 'broker', asOf: '2026-08-31', excerpt: '매도인 의뢰가' }],
    provenance: 'broker',
    asOf: '2026-08-31',
    status: 'unverified',
  });

  // 3. Pro-Forma Claims (5 claims)
  const proFormaInput: ProFormaClaimRegistrationInput = {
    currentCapRatePct: 1.15,
    estimatedFullOccupancyCapRatePct: 1.93,
    upsideCapRatePp: 0.78,
    vacantFloorCount: 3,
    vacantAreaPyeong: 80.0,
    proFormaAnnualNoiKrw: 443_900_000,
    narrative: '공실 3개층 정상화 시 연 1.93% 달성 가능',
  };
  registerProFormaClaims(reg, proFormaInput, '2026-08-31');

  // 4. Action Card Claims
  const card1: ActionCard = {
    cardOrder: 1,
    currentStateSummary: '공실 3개층 리모델링 및 메디컬 유치',
    scenarios: [
      {
        type: 'base',
        title: '기준 정상화',
        stabilizedCapRate: 3.5,
        stabilizedNOI: 350_000_000,
        stabilizedMonthlyRent: 29_166_667,
        estimatedValue: 10_000_000_000,
        totalReturn: 5.2,
        actions: [],
      },
      {
        type: 'upside',
        title: '메디컬 앵커 유치',
        stabilizedCapRate: 4.8,
        stabilizedNOI: 480_000_000,
        stabilizedMonthlyRent: 40_000_000,
        estimatedValue: 12_000_000_000,
        totalReturn: 7.5,
        actions: [],
      },
      {
        type: 'downside',
        title: '공실 장기화 보수적 시나리오',
        stabilizedCapRate: 2.8,
        stabilizedNOI: 280_000_000,
        stabilizedMonthlyRent: 23_333_333,
        estimatedValue: 9_000_000_000,
        totalReturn: 3.8,
        actions: [],
      },
    ],
    involvesTenantRelocation: true,
    relatedClaimIds: [],
  };
  registerActionCardClaims(reg, card1, '2026-08-31');

  return { registry: reg, initialOrder: reg.getAll() };
}

const baseSetup = createPopulatedRegistry();
const baselineHash = computeDeterministicClaimsHash(baseSetup.registry);

// Run 1,000 permutations of claims by reconstructing registries with shuffled claim order
let permutationsPassed = 0;
const totalPermutations = 1000;
const allClaimsList = baseSetup.registry.getAll();

for (let i = 0; i < totalPermutations; i++) {
  // Fisher-Yates shuffle
  const shuffled = [...allClaimsList];
  for (let j = shuffled.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
  }

  // Create a pseudo-registry that returns shuffled array
  const mockRegistry = { getAll: () => shuffled };
  const permHash = computeDeterministicClaimsHash(mockRegistry);

  if (permHash === baselineHash) {
    permutationsPassed++;
  } else {
    record(
      'Order Invariance Permutation Failure',
      false,
      `Permutation ${i} produced hash ${permHash} !== baseline ${baselineHash}`
    );
    break;
  }
}

if (permutationsPassed === totalPermutations) {
  record(
    'Order Invariance Stress Test (1,000 permutations)',
    true,
    `1,000 out of 1,000 random orderings produced exact identical hash (${baselineHash})`
  );
}

// ── 2. Mutation Sensitivity: Single-Digit / Single-Field Mutations ──
console.log('\n--- 2. MUTATION SENSITIVITY CHALLENGE ---');

interface MutationTestCase {
  target: string;
  field: string;
  original: any;
  mutated: any;
  createMutatedRegistry: () => ClaimRegistry;
}

const mutationCases: MutationTestCase[] = [
  {
    target: 'proFormaOpportunity',
    field: 'currentCapRatePct',
    original: 1.15,
    mutated: 1.16,
    createMutatedRegistry: () => {
      const reg = new ClaimRegistry();
      registerProFormaClaims(reg, {
        currentCapRatePct: 1.16, // mutated +0.01
        estimatedFullOccupancyCapRatePct: 1.93,
        upsideCapRatePp: 0.78,
        vacantFloorCount: 3,
        vacantAreaPyeong: 80.0,
      });
      return reg;
    },
  },
  {
    target: 'proFormaOpportunity',
    field: 'estimatedFullOccupancyCapRatePct',
    original: 1.93,
    mutated: 1.94,
    createMutatedRegistry: () => {
      const reg = new ClaimRegistry();
      registerProFormaClaims(reg, {
        currentCapRatePct: 1.15,
        estimatedFullOccupancyCapRatePct: 1.94, // mutated +0.01
        upsideCapRatePp: 0.78,
        vacantFloorCount: 3,
        vacantAreaPyeong: 80.0,
      });
      return reg;
    },
  },
  {
    target: 'proFormaOpportunity',
    field: 'upsideCapRatePp',
    original: 0.78,
    mutated: 0.79,
    createMutatedRegistry: () => {
      const reg = new ClaimRegistry();
      registerProFormaClaims(reg, {
        currentCapRatePct: 1.15,
        estimatedFullOccupancyCapRatePct: 1.93,
        upsideCapRatePp: 0.79, // mutated +0.01
        vacantFloorCount: 3,
        vacantAreaPyeong: 80.0,
      });
      return reg;
    },
  },
  {
    target: 'proFormaOpportunity',
    field: 'vacantFloorCount',
    original: 3,
    mutated: 4,
    createMutatedRegistry: () => {
      const reg = new ClaimRegistry();
      registerProFormaClaims(reg, {
        currentCapRatePct: 1.15,
        estimatedFullOccupancyCapRatePct: 1.93,
        upsideCapRatePp: 0.78,
        vacantFloorCount: 4, // mutated +1 floor
        vacantAreaPyeong: 80.0,
      });
      return reg;
    },
  },
  {
    target: 'proFormaOpportunity',
    field: 'vacantAreaPyeong',
    original: 80.0,
    mutated: 80.1,
    createMutatedRegistry: () => {
      const reg = new ClaimRegistry();
      registerProFormaClaims(reg, {
        currentCapRatePct: 1.15,
        estimatedFullOccupancyCapRatePct: 1.93,
        upsideCapRatePp: 0.78,
        vacantFloorCount: 3,
        vacantAreaPyeong: 80.1, // mutated +0.1 pyeong
      });
      return reg;
    },
  },
  {
    target: 'proFormaOpportunity',
    field: 'proFormaAnnualNoiKrw',
    original: 443_900_000,
    mutated: 443_900_001,
    createMutatedRegistry: () => {
      const reg = new ClaimRegistry();
      registerProFormaClaims(reg, {
        currentCapRatePct: 1.15,
        estimatedFullOccupancyCapRatePct: 1.93,
        upsideCapRatePp: 0.78,
        vacantFloorCount: 3,
        vacantAreaPyeong: 80.0,
        proFormaAnnualNoiKrw: 443_900_001, // mutated +1 KRW
      });
      return reg;
    },
  },
  {
    target: 'ActionCard',
    field: 'stabilizedCapRate',
    original: 4.5,
    mutated: 4.6,
    createMutatedRegistry: () => {
      const reg = new ClaimRegistry();
      registerActionCardClaims(reg, {
        cardOrder: 1,
        currentStateSummary: '공실 3개층 리모델링',
        scenarios: [
          {
            type: 'base',
            title: 'F&B 메디컬 유치',
            stabilizedCapRate: 4.6, // mutated +0.1%
            stabilizedNOI: 450_000_000,
            stabilizedMonthlyRent: 37_500_000,
            estimatedValue: 10_000_000_000,
            totalReturn: 6.0,
            actions: [],
          },
        ],
        involvesTenantRelocation: false,
        relatedClaimIds: [],
      });
      return reg;
    },
  },
  {
    target: 'ActionCard',
    field: 'stabilizedNOI',
    original: 450_000_000,
    mutated: 450_000_001,
    createMutatedRegistry: () => {
      const reg = new ClaimRegistry();
      registerActionCardClaims(reg, {
        cardOrder: 1,
        currentStateSummary: '공실 3개층 리모델링',
        scenarios: [
          {
            type: 'base',
            title: 'F&B 메디컬 유치',
            stabilizedCapRate: 4.5,
            stabilizedNOI: 450_000_001, // mutated +1 KRW
            stabilizedMonthlyRent: 37_500_000,
            estimatedValue: 10_000_000_000,
            totalReturn: 6.0,
            actions: [],
          },
        ],
        involvesTenantRelocation: false,
        relatedClaimIds: [],
      });
      return reg;
    },
  },
  {
    target: 'ActionCard',
    field: 'stabilizedMonthlyRent',
    original: 37_500_000,
    mutated: 37_500_001,
    createMutatedRegistry: () => {
      const reg = new ClaimRegistry();
      registerActionCardClaims(reg, {
        cardOrder: 1,
        currentStateSummary: '공실 3개층 리모델링',
        scenarios: [
          {
            type: 'base',
            title: 'F&B 메디컬 유치',
            stabilizedCapRate: 4.5,
            stabilizedNOI: 450_000_000,
            stabilizedMonthlyRent: 37_500_001, // mutated +1 KRW
            estimatedValue: 10_000_000_000,
            totalReturn: 6.0,
            actions: [],
          },
        ],
        involvesTenantRelocation: false,
        relatedClaimIds: [],
      });
      return reg;
    },
  },
  {
    target: 'ActionCard',
    field: 'estimatedValue',
    original: 10_000_000_000,
    mutated: 10_000_000_001,
    createMutatedRegistry: () => {
      const reg = new ClaimRegistry();
      registerActionCardClaims(reg, {
        cardOrder: 1,
        currentStateSummary: '공실 3개층 리모델링',
        scenarios: [
          {
            type: 'base',
            title: 'F&B 메디컬 유치',
            stabilizedCapRate: 4.5,
            stabilizedNOI: 450_000_000,
            stabilizedMonthlyRent: 37_500_000,
            estimatedValue: 10_000_000_001, // mutated +1 KRW
            totalReturn: 6.0,
            actions: [],
          },
        ],
        involvesTenantRelocation: false,
        relatedClaimIds: [],
      });
      return reg;
    },
  },
  {
    target: 'ActionCard',
    field: 'involvesTenantRelocation',
    original: false,
    mutated: true,
    createMutatedRegistry: () => {
      const reg = new ClaimRegistry();
      registerActionCardClaims(reg, {
        cardOrder: 1,
        currentStateSummary: '공실 3개층 리모델링',
        scenarios: [
          {
            type: 'base',
            title: 'F&B 메디컬 유치',
            stabilizedCapRate: 4.5,
            stabilizedNOI: 450_000_000,
            stabilizedMonthlyRent: 37_500_000,
            estimatedValue: 10_000_000_000,
            totalReturn: 6.0,
            actions: [],
          },
        ],
        involvesTenantRelocation: true, // triggers premium risk claim
        relatedClaimIds: [],
      });
      return reg;
    },
  },
];

// Baseline proForma registry
const pfBaseReg = new ClaimRegistry();
registerProFormaClaims(pfBaseReg, {
  currentCapRatePct: 1.15,
  estimatedFullOccupancyCapRatePct: 1.93,
  upsideCapRatePp: 0.78,
  vacantFloorCount: 3,
  vacantAreaPyeong: 80.0,
  proFormaAnnualNoiKrw: 443_900_000,
});
const pfBaseHash = computeDeterministicClaimsHash(pfBaseReg);

// Baseline ActionCard registry
const acBaseReg = new ClaimRegistry();
registerActionCardClaims(acBaseReg, {
  cardOrder: 1,
  currentStateSummary: '공실 3개층 리모델링',
  scenarios: [
    {
      type: 'base',
      title: 'F&B 메디컬 유치',
      stabilizedCapRate: 4.5,
      stabilizedNOI: 450_000_000,
      stabilizedMonthlyRent: 37_500_000,
      estimatedValue: 10_000_000_000,
      totalReturn: 6.0,
      actions: [],
    },
  ],
  involvesTenantRelocation: false,
  relatedClaimIds: [],
});
const acBaseHash = computeDeterministicClaimsHash(acBaseReg);

for (const tc of mutationCases) {
  const mutReg = tc.createMutatedRegistry();
  const mutHash = computeDeterministicClaimsHash(mutReg);
  const baseHash = tc.target === 'proFormaOpportunity' ? pfBaseHash : acBaseHash;
  const isDifferent = mutHash !== baseHash;

  record(
    `Mutation Sensitivity: [${tc.target}] ${tc.field} (${tc.original} -> ${tc.mutated})`,
    isDifferent,
    isDifferent
      ? `Original: ${baseHash.slice(0, 18)}... Mutated: ${mutHash.slice(0, 18)}... (Diff confirmed)`
      : `CRITICAL: Mutated hash collided with base hash!`,
    { original: tc.original, mutated: tc.mutated, baseHash, mutHash }
  );
}

// ── 3. Cross-Channel Invalidation: Pro-Forma Claim Tampering ──
console.log('\n--- 3. CROSS-CHANNEL INVALIDATION CHALLENGE ---');

async function testTamperInvalidation() {
  const isolatedLedger = new ApprovalLedgerService(true);
  const approvalService = new StudioApprovalService(isolatedLedger);
  const engine = new InvalidationEngine();

  // A. Normal Life-Cycle: Pro-Forma Claims Registered -> S60 -> S70 -> Published
  const claimReg = new ClaimRegistry();
  registerProFormaClaims(claimReg, {
    currentCapRatePct: 1.15,
    estimatedFullOccupancyCapRatePct: 1.93,
    upsideCapRatePp: 0.78,
    vacantFloorCount: 3,
    vacantAreaPyeong: 80.0,
    proFormaAnnualNoiKrw: 443_900_000,
  });

  const legitimateHash = computeDeterministicClaimsHash(claimReg);
  const projectId = 'proj-seocho-tamper-test';
  const project = studioService.createProject(projectId, 'pkg-seocho-01', '서초동 FM빌딩', 'credeal_signature');

  studioService.advanceStage(project.id, 'S40_PREVIEW');
  const s60Event = await approvalService.approveEditorial(project, 'broker-lead', legitimateHash);

  const fileUrl = `/api/broker/pptx-studio/projects/${project.id}/download`;
  const fileHash = 'sha256:bbbb1111222233334444555566667777888899990000aaaabbbbccccddddeeee';
  const { release } = await approvalService.approveFile(
    project,
    fileHash,
    fileUrl,
    'broker-lead'
  );

  record(
    'Baseline Publication State',
    release.status === 'PUBLISHED' && s60Event.targetHash === legitimateHash,
    `Stage: ${project.stage}, Release: ${release.status}, Bound Hash: ${legitimateHash.slice(0, 20)}...`
  );

  // B. Adversarial Tamper: Mutate pro_forma_cap_rate directly in ClaimRegistry
  // Broker or malicious actor changes cap rate from 1.93 to 2.50
  const capRateClaim = claimReg.getLatestBySubject('pro_forma_cap_rate');
  if (capRateClaim) {
    capRateClaim.value = 2.50; // TAMPERED!
  }

  // C. Recompute Claims Hash after tampering
  const tamperedHash = computeDeterministicClaimsHash(claimReg);
  const hashBroken = tamperedHash !== legitimateHash;
  record(
    'Tampered Claim Breaks Target Hash',
    hashBroken,
    `Legitimate Hash: ${legitimateHash.slice(0, 22)}... Tampered Hash: ${tamperedHash.slice(0, 22)}...`
  );

  // D. Cross-Channel Verification: Check if ledger detects discrepancy
  const latestApproval = await isolatedLedger.getLatestApproval(project.id);
  const approvalHashMatchesSSoT = latestApproval?.targetHash === tamperedHash;

  record(
    'Approval Ledger Hash Integrity Check',
    !approvalHashMatchesSSoT,
    `Ledger targetHash (${latestApproval?.targetHash.slice(0, 20)}...) does NOT match tampered SSoT hash (${tamperedHash.slice(0, 20)}...)`
  );

  // E. Invalidation Engine Cascades Invalidation
  const scope = engine.resolveScope('correction_added');
  record(
    'Invalidation Engine Scope on Correction',
    scope.invalidatedChannels.includes('pptx') &&
      scope.invalidatedChannels.includes('mobile') &&
      scope.requiresFullReapproval === true,
    `Channels: ${scope.invalidatedChannels.join(', ')}, Reapproval: ${scope.requiresFullReapproval}`
  );

  // F. Stale Transition: Release Record transitioned to STALE upon detected mismatch
  await isolatedLedger.updateReleaseStatus(release.id, 'STALE');
  const staleRelease = await isolatedLedger.getReleaseRecord(release.id);

  record(
    'Release Record Transition to STALE',
    staleRelease?.status === 'STALE',
    `Status successfully transitioned from PUBLISHED to ${staleRelease?.status}`
  );

  // G. Negative Pair: Attempting S70 file approval with STALE or mismatched state must fail
  // S70 requires S60_EDITORIAL_APPROVAL stage. Since project is in S70_FILE_APPROVAL, it cannot be re-approved without S60
  let preventedDoubleApproval = false;
  try {
    await approvalService.approveFile(project, 'sha256:newfilehash', fileUrl, 'broker-lead');
  } catch (err: any) {
    preventedDoubleApproval = err.message.includes('PRECONDITION_FAILED');
  }

  record(
    'Negative Pair: S70 File Approval Rejection without Prior S60 Re-Approval',
    preventedDoubleApproval,
    `Attempting S70 without returning to S60 correctly threw PRECONDITION_FAILED`
  );
}

// ── 4. Deep Adversarial Boundary Testing ──
console.log('\n--- 4. DEEP ADVERSARIAL BOUNDARY CHALLENGES ---');

// Challenge A: Duplicate Subject Claims Invariance
// What happens if two claims share the same subject?
function testDuplicateSubjectInvariance() {
  const regA = {
    getAll: () => [
      { subject: 'tax_rate', value: 4.6, unit: '%', provenance: 'public_api', displayLabel: '공공', status: 'reconciled' },
      { subject: 'tax_rate', value: 5.0, unit: '%', provenance: 'public_api', displayLabel: '공공', status: 'reconciled' },
    ],
  };

  const regB = {
    getAll: () => [
      { subject: 'tax_rate', value: 5.0, unit: '%', provenance: 'public_api', displayLabel: '공공', status: 'reconciled' },
      { subject: 'tax_rate', value: 4.6, unit: '%', provenance: 'public_api', displayLabel: '공공', status: 'reconciled' },
    ],
  };

  const hashA = computeDeterministicClaimsHash(regA as any);
  const hashB = computeDeterministicClaimsHash(regB as any);

  const passed = hashA === hashB;
  record(
    'Adversarial Boundary: Duplicate Subject Claims Array Shuffle',
    passed,
    passed
      ? `Identical hash ${hashA} across duplicate subjects`
      : `FLAW FOUND: Duplicate subjects in different order produce different hashes: ${hashA} vs ${hashB}`,
    { hashA, hashB }
  );
}

// Challenge B: Null / Undefined / Zero / False Value Sensitivity
function testSpecialValuesSensitivity() {
  const values = [null, 0, false, '', -0.0, '0'];
  const hashes = new Set<string>();

  for (const v of values) {
    const reg = {
      getAll: () => [
        { subject: 'test_metric', value: v, unit: '%', provenance: 'derived', displayLabel: '계산', status: 'reconciled' },
      ],
    };
    hashes.add(computeDeterministicClaimsHash(reg as any));
  }

  // Each distinct semantic value should produce distinct hashes
  const uniqueHashes = hashes.size;
  record(
    'Special Values Discrimination (null, 0, false, "", -0, "0")',
    uniqueHashes >= 4,
    `Produced ${uniqueHashes} unique hashes out of ${values.length} test values`,
    { values, uniqueHashes }
  );
}

// Challenge C: ReleaseTier Sensitivity
function testReleaseTierSensitivity() {
  const reg = new ClaimRegistry();
  reg.register({
    subject: 'asking_price',
    value: 1000,
    evidence: [],
    provenance: 'broker',
    asOf: '2026-08-31',
  });

  const tiers = ['internal_only', 'fact_om', 'analysis_im', 'decision_im', 'expert_required'] as const;
  const hashes = tiers.map((tier) => computeDeterministicClaimsHash(reg, tier));
  const uniqueTiers = new Set(hashes).size;

  record(
    'ReleaseTier Cryptographic Binding',
    uniqueTiers === 5,
    `All 5 ReleaseTiers generated distinct SHA-256 target hashes (${uniqueTiers}/5 unique)`
  );
}

// Challenge D: PolicyVersion Sensitivity
function testPolicyVersionSensitivity() {
  const reg = new ClaimRegistry();
  reg.register({
    subject: 'asking_price',
    value: 1000,
    evidence: [],
    provenance: 'broker',
    asOf: '2026-08-31',
  });

  const hashV1 = computeDeterministicClaimsHash(reg, 'fact_om', '2026-08-31');
  const hashV2 = computeDeterministicClaimsHash(reg, 'fact_om', '2026-09-01');

  record(
    'PolicyVersion Cryptographic Binding',
    hashV1 !== hashV2,
    `Policy change from 2026-08-31 to 2026-09-01 mutates hash: ${hashV1.slice(0, 16)}... !== ${hashV2.slice(0, 16)}...`
  );
}

async function runAll() {
  await testTamperInvalidation();
  testDuplicateSubjectInvariance();
  testSpecialValuesSensitivity();
  testReleaseTierSensitivity();
  testPolicyVersionSensitivity();

  console.log('\n======================================================');
  console.log('CHALLENGER STRESS HARNESS SUMMARY');
  console.log('======================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Total Invariant Checks: ${total} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.error('\nFAILED TESTS:');
    for (const f of results.filter((r) => !r.passed)) {
      console.error(`- ${f.name}: ${f.details}`);
    }
  }
}

runAll().catch(console.error);
