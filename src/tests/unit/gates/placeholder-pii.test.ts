import { describe, it, expect } from 'vitest';
import { runPublishGates } from '@/domain/building/mobile-im/quality-gates-v02';
import { checkG20, type ImageApprovalRecord } from '@/domain/building/gates/image-pii-gate';

describe('Placeholder Residue & Image PII Containment (CIM-0104 / PR-M1-04)', () => {
  const baseCtx = {
    salePrice: 10000000000,
    area: 500,
    effectiveLandArea: 500,
    address: '서울시 영등포구 당산동 123-4',
    dataGrade: 'A',
    crossValidationPassed: true,
    hasHallucination: false,
    piiRemoved: true,
    placeholderResidueCount: 0,
    threeAxisConfirmed: true,
    imagePiiConfirmed: true,
    aspectDistortionMaxPct: 2.0,
    minEffectiveDpi: 200,
    maxCropRatio: 0.2,
    textOverflowCount: 0,
    bleedCount: 0,
  };

  it('should block publication via G07 when placeholder residue is detected (e.g. {{price}} or NaN)', () => {
    const report = runPublishGates({
      ...(baseCtx as any),
      placeholderResidueCount: 2, // 2 unreplaced variables detected
    });

    const g07 = report.results.find((r) => r.id === 'G07');
    expect(g07).toBeDefined();
    expect(g07?.passed).toBe(false);
    expect(g07?.status).toBe('FAIL');
    expect(report.blocked).toBe(true);
  });

  it('should pass G07 when piiRemoved is true and placeholderResidueCount is 0', () => {
    const report = runPublishGates({
      ...(baseCtx as any),
      placeholderResidueCount: 0,
      piiRemoved: true,
    });

    const g07 = report.results.find((r) => r.id === 'G07');
    expect(g07).toBeDefined();
    expect(g07?.passed).toBe(true);
    expect(g07?.status).toBe('PASS');
  });

  it('should return NOT_RUN status for G20 if approvals map is empty and images exist', () => {
    const usedImages = [
      { sha256: 'abc1234567890', slot: 'exterior' },
    ];
    const approvals = new Map<string, ImageApprovalRecord>();

    const g20Result = checkG20(usedImages, approvals);

    expect(g20Result.passed).toBe(false);
    expect(g20Result.status).toBe('NOT_RUN');
    expect(g20Result.failures.length).toBe(1);
    expect(g20Result.failures[0].reason).toBe('마스킹 승인 필요');
  });

  it('should pass G20 when valid approval records exist for all images', () => {
    const sha = 'abc1234567890';
    const usedImages = [{ sha256: sha, slot: 'exterior' }];
    const approvals = new Map<string, ImageApprovalRecord>();
    approvals.set(sha, {
      sha256: sha,
      slot: 'exterior',
      maskedRegions: 1,
      approvedBy: 'reviewer-1',
      approvedAt: new Date().toISOString(),
      pipelineVersion: 'v1',
    });

    const g20Result = checkG20(usedImages, approvals);

    expect(g20Result.passed).toBe(true);
    expect(g20Result.status).toBe('PASS');
    expect(g20Result.failures.length).toBe(0);
  });
});
