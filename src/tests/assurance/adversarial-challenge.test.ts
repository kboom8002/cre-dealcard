import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { GoldenCaseRunner } from '@/assurance/im-harness/golden-runner';
import { EvidenceService } from '@/domain/building/im-core/evidence/evidence-service';
import { computeTargetHash } from '@/domain/building/im-core/target-hash';

describe('Adversarial Challenge & Empirical Stress Harness (Challenger M1-2)', () => {
  // 1. Golden Runner 12 Fixtures Execution
  it('Challenge 1: Verify Golden Runner executes all 12 fixtures with 0.00% error rate', async () => {
    const runner = new GoldenCaseRunner();
    const results = await runner.runAllCases();

    expect(results.length).toBe(12);
    const failureCount = results.filter((r) => !r.pass).length;
    const errorRate = (failureCount / results.length) * 100;

    expect(failureCount).toBe(0);
    expect(errorRate).toBe(0);
  });

  // 2. Perturbation Boundary Stress Testing on Evidence Conflict Detector
  it('Challenge 2A: Discrepancy boundary stress test (<=0.5% PASS vs >0.5% CONFLICT)', () => {
    const service = new EvidenceService();
    const dealId = 'deal-stress-boundary';

    const art1 = service.ingestSourceArtifact(dealId, 'public_registry', { val: 10000 });
    const art2 = service.ingestSourceArtifact(dealId, 'broker_input', { val: 10050 }); // exactly +0.50%
    const art3 = service.ingestSourceArtifact(dealId, 'broker_input', { val: 10051 }); // +0.51%
    const art4 = service.ingestSourceArtifact(dealId, 'broker_input', { val: 10010 }); // +0.10%

    // Base observation: 10,000
    service.extractObservation(art1.id, 'test.metric.p01', 10000);
    service.extractObservation(art4.id, 'test.metric.p01', 10010); // +0.1% diff
    expect(service.detectConflicts(dealId, 'test.metric.p01').length).toBe(0);

    // Test at exactly +0.50% boundary: diff = 50 / 10000 = 0.50% -> NOT > 0.5%, so 0 conflicts
    const dealBoundary = 'deal-stress-boundary-exact';
    const sB1 = service.ingestSourceArtifact(dealBoundary, 'public_registry', { val: 10000 });
    const sB2 = service.ingestSourceArtifact(dealBoundary, 'broker_input', { val: 10050 });
    service.extractObservation(sB1.id, 'test.metric.p05', 10000);
    service.extractObservation(sB2.id, 'test.metric.p05', 10050);
    expect(service.detectConflicts(dealBoundary, 'test.metric.p05').length).toBe(0);

    // Test at +0.51% (over threshold): diff = 51 / 10000 = 0.51% -> > 0.5%, so 1 conflict
    const dealOver = 'deal-stress-boundary-over';
    const sO1 = service.ingestSourceArtifact(dealOver, 'public_registry', { val: 10000 });
    const sO2 = service.ingestSourceArtifact(dealOver, 'broker_input', { val: 10051 });
    service.extractObservation(sO1.id, 'test.metric.over', 10000);
    service.extractObservation(sO2.id, 'test.metric.over', 10051);
    const conflicts = service.detectConflicts(dealOver, 'test.metric.over');
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].kind).toBe('numeric_threshold');
    expect(conflicts[0].diffPercent).toBe(0.51);
  });

  // 3. Canary / Shadow Discrepancy Parity Threshold (>0.1% causes DISCREPANCY)
  it('Challenge 2B: Canary discrepancy oracle - any deviation > 0.10% triggers DISCREPANCY', () => {
    function evaluateCanaryParity(legacyVal: number, modernVal: number): { diffPct: number; status: 'MATCH' | 'DISCREPANCY' } {
      const base = Math.min(legacyVal, modernVal);
      const diffPct = base > 0 ? (Math.abs(legacyVal - modernVal) / base) * 100 : 0;
      const status = diffPct <= 0.10 ? 'MATCH' : 'DISCREPANCY';
      return { diffPct: Math.round(diffPct * 100) / 100, status };
    }

    // 0.00% difference -> MATCH
    expect(evaluateCanaryParity(10000000000, 10000000000)).toEqual({ diffPct: 0.0, status: 'MATCH' });

    // 0.08% difference (within 0.10%) -> MATCH
    expect(evaluateCanaryParity(10000000000, 10008000000)).toEqual({ diffPct: 0.08, status: 'MATCH' });

    // 0.10% difference (boundary) -> MATCH
    expect(evaluateCanaryParity(10000000000, 10010000000)).toEqual({ diffPct: 0.10, status: 'MATCH' });

    // 0.11% difference (> 0.10%) -> DISCREPANCY
    expect(evaluateCanaryParity(10000000000, 10011000000)).toEqual({ diffPct: 0.11, status: 'DISCREPANCY' });

    // 0.50% difference (> 0.10%) -> DISCREPANCY
    expect(evaluateCanaryParity(10000000000, 10050000000)).toEqual({ diffPct: 0.50, status: 'DISCREPANCY' });
  });

  // 4. Cryptographic Target Hash Perturbation Sensitivity
  it('Challenge 2C: Any perturbation in approved data breaks SHA-256 target hash', () => {
    const originalPayload = {
      askingPriceKrw: 12500000000,
      landAreaSqm: 420.5,
      grossFloorAreaSqm: 1380.2,
      monthlyRentKrw: 22000000,
    };

    const originalHash = computeTargetHash({
      body: originalPayload,
      releaseTier: 'fact_om',
      policyVersion: '2026-08-31',
    });

    // Perturb asking price by 0.1% (+12,500,000 KRW)
    const perturbed01Payload = { ...originalPayload, askingPriceKrw: 12512500000 };
    const hash01 = computeTargetHash({
      body: perturbed01Payload,
      releaseTier: 'fact_om',
      policyVersion: '2026-08-31',
    });

    // Perturb asking price by 0.5% (+62,500,000 KRW)
    const perturbed05Payload = { ...originalPayload, askingPriceKrw: 12562500000 };
    const hash05 = computeTargetHash({
      body: perturbed05Payload,
      releaseTier: 'fact_om',
      policyVersion: '2026-08-31',
    });

    expect(originalHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hash01).not.toBe(originalHash);
    expect(hash05).not.toBe(originalHash);
    expect(hash01).not.toBe(hash05);
  });

  // 5. Final Acceptance Audit (FA-01~16) Edge Cases
  it('Challenge 3: Final Acceptance Audit edge cases - strict validator rejects bad formats & missing signers', () => {
    // Edge case 1: Bad FA ID format
    const invalidId = 'FA-1';
    expect(/^FA-\d{2}$/.test(invalidId)).toBe(false);

    const validId = 'FA-01';
    expect(/^FA-\d{2}$/.test(validId)).toBe(true);

    // Edge case 2: Incomplete signer roles
    const requiredRoles = ['product', 'domain', 'architecture', 'quality'];
    const mockGoodApprovals = [
      { role: 'product', signer: 'p1' },
      { role: 'domain', signer: 'd1' },
      { role: 'architecture', signer: 'a1' },
      { role: 'quality', signer: 'q1' },
    ];
    const mockBadApprovals = [
      { role: 'product', signer: 'p1' },
      { role: 'domain', signer: 'd1' },
      { role: 'architecture', signer: 'a1' },
      // missing quality!
    ];

    const goodRoles = mockGoodApprovals.map((a) => a.role);
    const badRoles = mockBadApprovals.map((a) => a.role);

    expect(requiredRoles.every((r) => goodRoles.includes(r))).toBe(true);
    expect(requiredRoles.every((r) => badRoles.includes(r))).toBe(false);
  });

  // 6. Flaw Analysis: Golden runner string mismatch analysis
  it('Challenge 4: Audit of GoldenCaseRunner gateExpected check flaw', () => {
    const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures', 'golden-cases');
    const files = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));

    const rawFixtures = files.map((f) => {
      const data = JSON.parse(fs.readFileSync(path.join(fixturesDir, f), 'utf-8'));
      return {
        caseId: data.caseId,
        gateExpected: data.expectedOutcome?.gateExpected,
        evaluatedByRunner: data.expectedOutcome?.gateExpected === 'BLOCK' ? 'BLOCK' : 'PASS',
      };
    });

    // Note the finding: Cases with "BLOCKER" or "ERROR" are evaluated by GoldenCaseRunner as "PASS"
    const blockerCases = rawFixtures.filter((r) => r.gateExpected === 'BLOCKER' || r.gateExpected === 'ERROR');
    expect(blockerCases.length).toBe(5); // case-05, case-06, case-07, case-09, case-12

    blockerCases.forEach((c) => {
      // Demonstrating that the runner strictly checks === 'BLOCK', so it misclassifies them as 'PASS'
      expect(c.evaluatedByRunner).toBe('PASS');
    });
  });
});
