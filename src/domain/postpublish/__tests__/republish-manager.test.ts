import { describe, it, expect } from 'vitest';
import { createRepublishRecord } from '../republish-manager';
import type { PublishRecord, Verdict } from '../types';

describe('Republish Manager Multi-Version Pipeline', () => {
  const initialRecord: PublishRecord = {
    id: 'pub_b123_v1',
    buildingId: 'b123',
    version: 1,
    status: 'active',
    publishedAt: '2026-08-01T00:00:00Z',
    findings: [
      { source: 'rule', code: 'F01', severity: 'warn', message: '등기부 경과', detectedAt: '2026-08-01', resolved: false },
      { source: 'rule', code: 'F09', severity: 'block', message: '만기 임박', detectedAt: '2026-08-01', resolved: false },
    ],
    resolvedFindings: [],
  };

  it('resolves single finding and bumps version to v2', () => {
    const result = createRepublishRecord({
      currentRecord: initialRecord,
      resolvedFindingCodes: ['F01'],
      remainingFindings: [initialRecord.findings[1]],
    });

    expect(result.previousRecord.status).toBe('superseded');
    expect(result.previousRecord.supersededBy).toBe('pub_b123_v2');
    expect(result.previousRecord.supersededAt).toBeDefined();

    expect(result.newRecord.version).toBe(2);
    expect(result.newRecord.status).toBe('active');
    expect(result.newRecord.resolvedFindings).toEqual(['F01']);
    expect(result.newRecord.findings).toHaveLength(1);
    expect(result.resolvedCount).toBe(1);
  });

  it('resolves remaining findings across multiple republish cycles (v1 -> v2 -> v3)', () => {
    // Cycle 1: v1 -> v2
    const cycle1 = createRepublishRecord({
      currentRecord: initialRecord,
      resolvedFindingCodes: ['F01'],
      remainingFindings: [initialRecord.findings[1]],
    });

    // Cycle 2: v2 -> v3
    const cycle2 = createRepublishRecord({
      currentRecord: cycle1.newRecord,
      resolvedFindingCodes: ['F09'],
      remainingFindings: [],
    });

    expect(cycle2.previousRecord.version).toBe(2);
    expect(cycle2.previousRecord.status).toBe('superseded');
    expect(cycle2.newRecord.version).toBe(3);
    expect(cycle2.newRecord.status).toBe('active');
    expect(cycle2.newRecord.resolvedFindings).toEqual(['F01', 'F09']);
    expect(cycle2.newRecord.findings).toHaveLength(0);
  });

  it('preserves buildingId and accumulates history without data loss', () => {
    const result = createRepublishRecord({
      currentRecord: initialRecord,
      resolvedFindingCodes: ['F01', 'F09'],
      remainingFindings: [],
    });

    expect(result.newRecord.buildingId).toBe(initialRecord.buildingId);
    expect(result.resolvedCount).toBe(2);
    expect(result.newRecord.resolvedFindings).toContain('F01');
    expect(result.newRecord.resolvedFindings).toContain('F09');
  });
});
