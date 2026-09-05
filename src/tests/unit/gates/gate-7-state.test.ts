import { describe, it, expect } from 'vitest';
import {
  type GateResultV2,
  isGateBlockingPublish,
} from '@/types/gate-result';

describe('7-State Gate Evaluation Model (CIM-0101 / PR-M1-01)', () => {
  const baseGate: GateResultV2 = {
    gateId: 'GATE-TEST-01',
    version: '1.0.0',
    status: 'PASS',
    severity: 'BLOCKER',
    observed: true,
    expected: true,
    reason: '정상 통과',
    observerVersion: '1.0.0',
    executedAt: new Date().toISOString(),
    durationMs: 5,
  };

  it('should allow publication when BLOCKER status is PASS', () => {
    const result: GateResultV2 = { ...baseGate, status: 'PASS' };
    expect(isGateBlockingPublish(result)).toBe(false);
  });

  it('should block publication when BLOCKER status is FAIL', () => {
    const result: GateResultV2 = { ...baseGate, status: 'FAIL', reason: '조건 위반' };
    expect(isGateBlockingPublish(result)).toBe(true);
  });

  it('should block publication when BLOCKER status is NOT_RUN (Absolute Invariant #6)', () => {
    const result: GateResultV2 = { ...baseGate, status: 'NOT_RUN', reason: '미실행' };
    expect(isGateBlockingPublish(result)).toBe(true);
  });

  it('should block publication when BLOCKER status is INDETERMINATE', () => {
    const result: GateResultV2 = { ...baseGate, status: 'INDETERMINATE', reason: '데이터 모호성' };
    expect(isGateBlockingPublish(result)).toBe(true);
  });

  it('should block publication when BLOCKER status is SYSTEM_ERROR', () => {
    const result: GateResultV2 = { ...baseGate, status: 'SYSTEM_ERROR', reason: '도구 예외 발생' };
    expect(isGateBlockingPublish(result)).toBe(true);
  });

  it('should not block publication when status is WARN even if severity is WARNING', () => {
    const result: GateResultV2 = {
      ...baseGate,
      severity: 'WARNING',
      status: 'WARN',
      reason: '주의 권고',
    };
    expect(isGateBlockingPublish(result)).toBe(false);
  });

  it('should not block publication when status is NOT_APPLICABLE and reason is given', () => {
    const result: GateResultV2 = {
      ...baseGate,
      status: 'NOT_APPLICABLE',
      applicabilityReason: '주거용 건물이 아니므로 해당 없음',
    };
    expect(isGateBlockingPublish(result)).toBe(false);
  });
});
