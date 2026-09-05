import { describe, it, expect } from 'vitest';
import { computeTargetHash, canonicalizeJson } from '@/domain/building/im-core/target-hash';
import { ClaimRegistry } from '@/domain/building/im-core/claim-registry';
import { runApprovalGate } from '@/domain/building/im-core/approval-gate';

describe('Approval Target Hash Binding & Claim Rehydration (CIM-0102 / PR-M1-02)', () => {
  const sampleBody = {
    title: '당산동 빌딩',
    releaseTier: 'fact_om',
    claims: [
      {
        subject: 'asking_price',
        value: 12500000000,
        evidence: [{ sourceId: 'broker', asOf: '2026-09-03' }],
        provenance: 'broker',
        asOf: '2026-09-03',
        status: 'reconciled',
      },
      {
        subject: 'total_area',
        value: 1380.2,
        evidence: [{ sourceId: 'public_api', asOf: '2026-09-03' }],
        provenance: 'public_api',
        asOf: '2026-09-03',
        status: 'reconciled',
      },
      {
        subject: 'gross_yield',
        value: 4.2,
        evidence: [{ sourceId: 'broker', asOf: '2026-09-03' }],
        provenance: 'broker',
        asOf: '2026-09-03',
        status: 'reconciled',
      },
    ],
  };

  it('should compute deterministic target hash regardless of key order', () => {
    const payloadA = {
      body: { b: 2, a: 1 },
      releaseTier: 'fact_om',
      policyVersion: '2026-08-31',
    };
    const payloadB = {
      policyVersion: '2026-08-31',
      body: { a: 1, b: 2 },
      releaseTier: 'fact_om',
    };
    const hashA = computeTargetHash(payloadA);
    const hashB = computeTargetHash(payloadB);
    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('should fail approval when expectedHash does not match server computed hash (tamper detection)', () => {
    const expectedHash = computeTargetHash({
      body: sampleBody,
      releaseTier: 'fact_om',
      policyVersion: '2026-08-31',
    });

    // Tamper body slightly (125억 -> 126억)
    const tamperedBody = {
      ...sampleBody,
      claims: [
        { ...sampleBody.claims[0], value: 12600000000 },
        sampleBody.claims[1],
        sampleBody.claims[2],
      ],
    };

    const serverHash = computeTargetHash({
      body: tamperedBody,
      releaseTier: 'fact_om',
      policyVersion: '2026-08-31',
    });

    expect(serverHash).not.toBe(expectedHash);
  });

  it('should block approval if ClaimRegistry is empty (G2 fix)', () => {
    const emptyRegistry = new ClaimRegistry();
    const result = runApprovalGate(emptyRegistry, 'fact_om');

    expect(result.passed).toBe(false);
    expect(result.blockers.some((b) => b.id === 'approval.empty_registry')).toBe(true);
  });

  it('should pass approval when ClaimRegistry is properly rehydrated with verified required claims', () => {
    const registry = new ClaimRegistry();
    for (const claim of sampleBody.claims) {
      registry.register(claim as any);
    }
    const result = runApprovalGate(registry, 'fact_om');

    expect(result.passed).toBe(true);
    expect(result.blockers.length).toBe(0);
  });
});
