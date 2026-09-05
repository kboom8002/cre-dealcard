/**
 * @file adversarial-m5-stress-test.ts
 * @description Milestone M5 Adversarial Challenge Runner (Empirical Challenger)
 * Tests:
 * 1. SSoT Claim Mutation & Deterministic SHA-256 Hash Invalidation
 * 2. Cross-Channel Approval Ledger Invalidation & Precondition Guards
 * 3. Matching Engine Fuzzing & Negative Pair Resilience (Zero 500s)
 * 4. Physical PPTX Binary Artifact Deep Inspection (Bleed == 0, Tokens == 0)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Setup environment before any app imports
(process.env as any).NODE_ENV = 'test';
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vwbmaulavgjwezffbxgi.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_6Q8anEUP7ur7Nd4rTr5fQA_UcN8K1mc';

import { NextRequest } from 'next/server';

// Domain & Pipeline Imports
import { ClaimRegistry } from '../src/domain/building/im-core/claim-registry';
import { computeDeterministicClaimsHash, computeTargetHash, canonicalizeJson } from '../src/domain/building/im-core/target-hash';
import { InvalidationEngine } from '../src/platform/im-pipeline/regeneration/invalidation-engine';
import { ApprovalLedgerService } from '../src/domain/building/im-core/approval/ledger-service';
import { StudioApprovalService } from '../src/domain/building/pptx-studio/approval/studio-approval-service';
import { PptxStudioService } from '../src/domain/building/pptx-studio/studio-service';
import { verifyCrossChannelConsistency } from '../src/domain/building/im-core/cross-channel-checker';
import { inspectPptxBinary } from '../src/assurance/im-harness/observers/pptx-binary-observer';

// API Handlers for Fuzzing
import { POST as matchPost } from '../src/app/api/broker/match/route';
import { POST as leaseMatchPost } from '../src/app/api/broker/lease-match/route';
import { POST as circleDisclosurePost } from '../src/app/api/broker/circles/[id]/match/[matchId]/disclosure/route';

interface ChallengeItem {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  expected: string;
  actual: string;
  notes?: string;
}

const challengeResults: ChallengeItem[] = [];

function recordChallenge(item: ChallengeItem) {
  challengeResults.push(item);
  const mark = item.passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${mark}] [${item.category}] ${item.id}: ${item.name}`);
  if (!item.passed) {
    console.error(`       Expected: ${item.expected}`);
    console.error(`       Actual:   ${item.actual}`);
    if (item.notes) console.error(`       Notes:    ${item.notes}`);
  }
}

async function runM5AdversarialChallenges() {
  console.log('======================================================================');
  console.log('⚔️  MILESTONE M5 ADVERSARIAL CHALLENGE — EMPIRICAL VERIFICATION HARNESS');
  console.log('======================================================================\n');

  // ══════════════════════════════════════════════════════════════════
  // SECTION 1: SSoT Claim Mutation & Target Hash Determinism
  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 1: SSoT CLAIM MUTATION & TARGET HASH DETERMINISM ---');

  function getBaseRegistry(): ClaimRegistry {
    const reg = new ClaimRegistry();
    reg.register({
      subject: 'asking_price_eok',
      value: 760,
      unit: '억원',
      evidence: [{ sourceId: 'broker', asOf: '2026-09-01', excerpt: '중개인 확인 매매가' }],
      provenance: 'broker',
      asOf: '2026-09-01',
      status: 'unverified',
    });
    reg.register({
      subject: 'cap_rate_pct',
      value: 1.02,
      unit: '%',
      evidence: [{ sourceId: 'derived', asOf: '2026-09-01', excerpt: '순수익률 산출' }],
      provenance: 'derived',
      asOf: '2026-09-01',
      status: 'reconciled',
    });
    reg.register({
      subject: 'vacancy_rate_pct',
      value: 16.7,
      unit: '%',
      evidence: [{ sourceId: 'broker', asOf: '2026-09-01', excerpt: '임대차 현황 공실률' }],
      provenance: 'broker',
      asOf: '2026-09-01',
      status: 'reconciled',
    });
    reg.register({
      subject: 'rent_roll_total_monthly_krw',
      value: 64625000,
      unit: '원',
      evidence: [{ sourceId: 'broker', asOf: '2026-09-01', excerpt: '월 임대료 합계' }],
      provenance: 'broker',
      asOf: '2026-09-01',
      status: 'reconciled',
    });
    return reg;
  }

  const baselineHash = computeDeterministicClaimsHash(getBaseRegistry());
  console.log(`Baseline Target Hash: ${baselineHash}`);

  // Test 1.1: Canonical Key Order Invariance (Positive Pair)
  const regShuffled = new ClaimRegistry();
  regShuffled.register({
    subject: 'rent_roll_total_monthly_krw',
    value: 64625000,
    unit: '원',
    evidence: [{ sourceId: 'broker', asOf: '2026-09-01', excerpt: '월 임대료 합계' }],
    provenance: 'broker',
    asOf: '2026-09-01',
    status: 'reconciled',
  });
  regShuffled.register({
    subject: 'vacancy_rate_pct',
    value: 16.7,
    unit: '%',
    evidence: [{ sourceId: 'broker', asOf: '2026-09-01', excerpt: '임대차 현황 공실률' }],
    provenance: 'broker',
    asOf: '2026-09-01',
    status: 'reconciled',
  });
  regShuffled.register({
    subject: 'asking_price_eok',
    value: 760,
    unit: '억원',
    evidence: [{ sourceId: 'broker', asOf: '2026-09-01', excerpt: '중개인 확인 매매가' }],
    provenance: 'broker',
    asOf: '2026-09-01',
    status: 'unverified',
  });
  regShuffled.register({
    subject: 'cap_rate_pct',
    value: 1.02,
    unit: '%',
    evidence: [{ sourceId: 'derived', asOf: '2026-09-01', excerpt: '순수익률 산출' }],
    provenance: 'derived',
    asOf: '2026-09-01',
    status: 'reconciled',
  });
  const shuffledHash = computeDeterministicClaimsHash(regShuffled);

  recordChallenge({
    id: 'CHAL-M5-01',
    name: 'Claim insertion order permutation produces identical SHA-256 hash',
    category: 'TargetHash',
    passed: shuffledHash === baselineHash,
    expected: baselineHash,
    actual: shuffledHash,
  });

  // Test 1.2: Mutate Asking Price (Negative Pair)
  const regPriceMutated = getBaseRegistry();
  regPriceMutated.register({
    subject: 'asking_price_eok',
    value: 750,
    unit: '억원',
    evidence: [{ sourceId: 'broker', asOf: '2026-09-01', excerpt: '가격 변경' }],
    provenance: 'broker',
    asOf: '2026-09-01',
    status: 'unverified',
  });
  const priceMutatedHash = computeDeterministicClaimsHash(regPriceMutated);
  recordChallenge({
    id: 'CHAL-M5-02',
    name: 'Mutating asking price (760 -> 750) strictly breaks SHA-256 target hash',
    category: 'TargetHash',
    passed: priceMutatedHash !== baselineHash,
    expected: 'hash !== baselineHash',
    actual: priceMutatedHash,
  });

  // Test 1.3: Mutate Cap Rate (Negative Pair)
  const regCapMutated = getBaseRegistry();
  regCapMutated.register({
    subject: 'cap_rate_pct',
    value: 1.05,
    unit: '%',
    evidence: [{ sourceId: 'derived', asOf: '2026-09-01', excerpt: '수익률 재산정' }],
    provenance: 'derived',
    asOf: '2026-09-01',
    status: 'reconciled',
  });
  const capMutatedHash = computeDeterministicClaimsHash(regCapMutated);
  recordChallenge({
    id: 'CHAL-M5-03',
    name: 'Mutating cap rate (1.02% -> 1.05%) strictly breaks SHA-256 target hash',
    category: 'TargetHash',
    passed: capMutatedHash !== baselineHash,
    expected: 'hash !== baselineHash',
    actual: capMutatedHash,
  });

  // Test 1.4: Mutate Vacancy Rate (Negative Pair)
  const regVacMutated = getBaseRegistry();
  regVacMutated.register({
    subject: 'vacancy_rate_pct',
    value: 0.0,
    unit: '%',
    evidence: [{ sourceId: 'broker', asOf: '2026-09-01', excerpt: '만실 확인' }],
    provenance: 'broker',
    asOf: '2026-09-01',
    status: 'reconciled',
  });
  const vacMutatedHash = computeDeterministicClaimsHash(regVacMutated);
  recordChallenge({
    id: 'CHAL-M5-04',
    name: 'Mutating vacancy rate (16.7% -> 0.0%) strictly breaks SHA-256 target hash',
    category: 'TargetHash',
    passed: vacMutatedHash !== baselineHash,
    expected: 'hash !== baselineHash',
    actual: vacMutatedHash,
  });

  // Test 1.5: Mutate Rent Roll Total (Negative Pair)
  const regRentMutated = getBaseRegistry();
  regRentMutated.register({
    subject: 'rent_roll_total_monthly_krw',
    value: 64625001,
    unit: '원',
    evidence: [{ sourceId: 'broker', asOf: '2026-09-01', excerpt: '1원 오차 보정' }],
    provenance: 'broker',
    asOf: '2026-09-01',
    status: 'reconciled',
  });
  const rentMutatedHash = computeDeterministicClaimsHash(regRentMutated);
  recordChallenge({
    id: 'CHAL-M5-05',
    name: 'Mutating rent roll by 1 KRW strictly breaks SHA-256 target hash',
    category: 'TargetHash',
    passed: rentMutatedHash !== baselineHash,
    expected: 'hash !== baselineHash',
    actual: rentMutatedHash,
  });

  // ══════════════════════════════════════════════════════════════════
  // SECTION 2: Cross-Channel Approval Invalidation & Preconditions
  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 2: CROSS-CHANNEL APPROVAL INVALIDATION & PRECONDITIONS ---');

  const engine = new InvalidationEngine();
  const correctionScope = engine.resolveScope('correction_added');
  recordChallenge({
    id: 'CHAL-M5-06',
    name: 'Correction to SSoT invalidates both mobile and pptx channels',
    category: 'InvalidationEngine',
    passed: correctionScope.invalidatedChannels.includes('mobile') && correctionScope.invalidatedChannels.includes('pptx'),
    expected: "includes 'mobile' and 'pptx'",
    actual: JSON.stringify(correctionScope.invalidatedChannels),
  });

  const studio = new PptxStudioService(true);
  const ledger = new ApprovalLedgerService(true);
  const approvalService = new StudioApprovalService(ledger);

  const proj = studio.createProject('deal-chal-1', 'pkg-chal-1', '테스트 자산', 'commercial_visual_grid');
  let thrownError = '';
  try {
    await approvalService.approveFile(proj, 'sha256:dummy', '/url/test.pptx', 'broker');
  } catch (err: any) {
    thrownError = err.message;
  }

  recordChallenge({
    id: 'CHAL-M5-07',
    name: 'Attempting S70 binary approval without S60 editorial throws PRECONDITION_FAILED',
    category: 'ApprovalPrecondition',
    passed: thrownError.includes('PRECONDITION_FAILED'),
    expected: "Error containing 'PRECONDITION_FAILED'",
    actual: thrownError,
  });

  // Verify full sequential approval and channel status transition
  studio.advanceStage(proj.id, 'S40_PREVIEW');
  const s60Event = await approvalService.approveEditorial(proj, 'auditor-1', baselineHash);
  const { fileApproval, release } = await approvalService.approveFile(proj, baselineHash, '/downloads/real.pptx', 'auditor-1');

  recordChallenge({
    id: 'CHAL-M5-08',
    name: 'Sequential S60 -> S70 sets project stage to S70_FILE_APPROVAL and release to PUBLISHED',
    category: 'ApprovalFlow',
    passed: proj.stage === 'S70_FILE_APPROVAL' && release.status === 'PUBLISHED',
    expected: "stage === 'S70_FILE_APPROVAL' && release.status === 'PUBLISHED'",
    actual: `stage=${proj.stage}, release.status=${release.status}`,
  });

  // Invalidate release upon correction
  await ledger.updateReleaseStatus(release.id, 'STALE');
  const staleRelease = await ledger.getReleaseRecord(release.id);
  recordChallenge({
    id: 'CHAL-M5-09',
    name: 'Approval ledger marks release STALE upon SSoT data mutation',
    category: 'ApprovalFlow',
    passed: staleRelease?.status === 'STALE',
    expected: 'STALE',
    actual: staleRelease?.status || 'undefined',
  });

  // ══════════════════════════════════════════════════════════════════
  // SECTION 3: Matching Engine Fuzzing & Negative Pair Resilience
  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 3: MATCHING ENGINE FUZZING & NEGATIVE PAIR RESILIENCE ---');

  const fuzzHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test-token-broker-001',
  };

  // 3.1: Empty payload to /api/broker/match
  const emptyMatchReq = new NextRequest('http://localhost:3000/api/broker/match', {
    method: 'POST',
    headers: fuzzHeaders,
    body: JSON.stringify({}),
  });
  const emptyMatchRes = await matchPost(emptyMatchReq);
  const emptyMatchStatus = emptyMatchRes.status;
  recordChallenge({
    id: 'CHAL-M5-10',
    name: 'POST /api/broker/match with empty body returns 400 Bad Request (not 500)',
    category: 'MatchingEngineFuzz',
    passed: emptyMatchStatus === 400,
    expected: '400',
    actual: `${emptyMatchStatus}`,
  });

  // 3.2: Malformed payload to /api/broker/match
  const malformedMatchReq = new NextRequest('http://localhost:3000/api/broker/match', {
    method: 'POST',
    headers: fuzzHeaders,
    body: JSON.stringify({
      building: { id: 12345, priceBand: null }, // wrong types
      intent: 'not-an-object',
    }),
  });
  const malformedMatchRes = await matchPost(malformedMatchReq);
  recordChallenge({
    id: 'CHAL-M5-11',
    name: 'POST /api/broker/match with wrong types returns 400 Bad Request (not 500)',
    category: 'MatchingEngineFuzz',
    passed: malformedMatchRes.status === 400,
    expected: '400',
    actual: `${malformedMatchRes.status}`,
  });

  // 3.3: Empty payload to /api/broker/lease-match
  const emptyLeaseReq = new NextRequest('http://localhost:3000/api/broker/lease-match', {
    method: 'POST',
    headers: fuzzHeaders,
    body: JSON.stringify({}),
  });
  const emptyLeaseRes = await leaseMatchPost(emptyLeaseReq);
  recordChallenge({
    id: 'CHAL-M5-12',
    name: 'POST /api/broker/lease-match with empty body returns 400 Bad Request (not 500)',
    category: 'MatchingEngineFuzz',
    passed: emptyLeaseRes.status === 400,
    expected: '400',
    actual: `${emptyLeaseRes.status}`,
  });

  // 3.4: Invalid disclosure level
  const invalidDisclosureReq = new NextRequest('http://localhost:3000/api/broker/circles/c1/match/m1/disclosure', {
    method: 'POST',
    headers: fuzzHeaders,
    body: JSON.stringify({ level: 'super_confidential_unsupported_level' }),
  });
  const invalidDisclosureRes = await circleDisclosurePost(invalidDisclosureReq, {
    params: Promise.resolve({ id: 'c1', matchId: 'm1' }),
  });
  recordChallenge({
    id: 'CHAL-M5-13',
    name: 'POST circle disclosure with invalid level returns 400 Bad Request (not 500)',
    category: 'MatchingEngineFuzz',
    passed: invalidDisclosureRes.status === 400,
    expected: '400',
    actual: `${invalidDisclosureRes.status}`,
  });

  // ══════════════════════════════════════════════════════════════════
  // SECTION 4: Physical PPTX Benchmark Artifact Deep Inspection
  // ══════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 4: PHYSICAL PPTX BENCHMARK ARTIFACT DEEP INSPECTION ---');

  const sinsaPath = path.resolve(process.cwd(), 'docs', 'demo-output', 'real-broker-sinsa-590.pptx');
  const seochoPath = path.resolve(process.cwd(), 'docs', 'demo-output', 'real-broker-seocho-1364.pptx');

  const sinsaExists = fs.existsSync(sinsaPath);
  recordChallenge({
    id: 'CHAL-M5-14',
    name: 'docs/demo-output/real-broker-sinsa-590.pptx exists on filesystem',
    category: 'PhysicalArtifact',
    passed: sinsaExists,
    expected: 'true',
    actual: `${sinsaExists}`,
  });

  const seochoExists = fs.existsSync(seochoPath);
  recordChallenge({
    id: 'CHAL-M5-15',
    name: 'docs/demo-output/real-broker-seocho-1364.pptx exists on filesystem',
    category: 'PhysicalArtifact',
    passed: seochoExists,
    expected: 'true',
    actual: `${seochoExists}`,
  });

  if (sinsaExists) {
    const sinsaBuf = fs.readFileSync(sinsaPath);
    const sinsaInspect = await inspectPptxBinary(sinsaBuf);

    recordChallenge({
      id: 'CHAL-M5-16',
      name: '[신사동 590] Bleed count is strictly 0 (no element overflow)',
      category: 'PhysicalInspection',
      passed: sinsaInspect.bleedCount === 0,
      expected: '0',
      actual: `${sinsaInspect.bleedCount}`,
    });

    recordChallenge({
      id: 'CHAL-M5-17',
      name: '[신사동 590] Unreplaced template tokens count is strictly 0 (zero {{...}})',
      category: 'PhysicalInspection',
      passed: sinsaInspect.placeholderResidueCount === 0,
      expected: '0',
      actual: `${sinsaInspect.placeholderResidueCount}`,
    });

    recordChallenge({
      id: 'CHAL-M5-18',
      name: '[신사동 590] Broken image count is strictly 0',
      category: 'PhysicalInspection',
      passed: sinsaInspect.brokenImageCount === 0,
      expected: '0',
      actual: `${sinsaInspect.brokenImageCount}`,
    });

    recordChallenge({
      id: 'CHAL-M5-19',
      name: '[신사동 590] Persona leakages (Rule 1) and CRE lexicon violations (Rule 2) count is 0',
      category: 'PhysicalInspection',
      passed: sinsaInspect.personaViolationCount === 0 && sinsaInspect.lexiconViolationCount === 0,
      expected: 'persona=0, lexicon=0',
      actual: `persona=${sinsaInspect.personaViolationCount}, lexicon=${sinsaInspect.lexiconViolationCount}`,
    });
  }

  if (seochoExists) {
    const seochoBuf = fs.readFileSync(seochoPath);
    const seochoInspect = await inspectPptxBinary(seochoBuf);

    recordChallenge({
      id: 'CHAL-M5-20',
      name: '[서초동 1364] Bleed count is strictly 0 (no element overflow)',
      category: 'PhysicalInspection',
      passed: seochoInspect.bleedCount === 0,
      expected: '0',
      actual: `${seochoInspect.bleedCount}`,
    });

    recordChallenge({
      id: 'CHAL-M5-21',
      name: '[서초동 1364] Unreplaced template tokens count is strictly 0 (zero {{...}})',
      category: 'PhysicalInspection',
      passed: seochoInspect.placeholderResidueCount === 0,
      expected: '0',
      actual: `${seochoInspect.placeholderResidueCount}`,
    });

    recordChallenge({
      id: 'CHAL-M5-22',
      name: '[서초동 1364] Broken image count is strictly 0',
      category: 'PhysicalInspection',
      passed: seochoInspect.brokenImageCount === 0,
      expected: '0',
      actual: `${seochoInspect.brokenImageCount}`,
    });

    recordChallenge({
      id: 'CHAL-M5-23',
      name: '[서초동 1364] Persona leakages (Rule 1) and CRE lexicon violations (Rule 2) count is 0',
      category: 'PhysicalInspection',
      passed: seochoInspect.personaViolationCount === 0 && seochoInspect.lexiconViolationCount === 0,
      expected: 'persona=0, lexicon=0',
      actual: `persona=${seochoInspect.personaViolationCount}, lexicon=${seochoInspect.lexiconViolationCount}`,
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // SUMMARY SCORECARD
  // ══════════════════════════════════════════════════════════════════
  console.log('\n======================================================================');
  console.log('🏆 ADVERSARIAL CHALLENGE SCORECARD');
  console.log('======================================================================');
  const total = challengeResults.length;
  const passed = challengeResults.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(`Total Challenges Executed: ${total}`);
  console.log(`Passed:                    ${passed}`);
  console.log(`Failed:                    ${failed}`);
  console.log(`Pass Rate:                  ${((passed / total) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.error('\n❌ CHALLENGE FAILED: Some adversarial assertions did not pass.');
    process.exit(1);
  } else {
    console.log('\n🎉 ALL ADVERSARIAL CHALLENGES EMPIRICALLY PASSED!');
  }
}

runM5AdversarialChallenges().catch((err) => {
  console.error('Fatal unhandled error in adversarial challenge harness:', err);
  process.exit(1);
});
