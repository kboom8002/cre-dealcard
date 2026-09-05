import { describe, it, expect } from 'vitest';
import { HarnessEvaluator } from '@/assurance/im-harness/evaluator';

describe('Harness Evaluator & Rule Registry (CIM-0203 / PR-M2-03)', () => {
  it('should evaluate profile rules, handle system errors, and compute report hash', async () => {
    const evaluator = new HarnessEvaluator('2026-08-31');

    // Register a passing rule
    evaluator.registerRule('P-TEST', {
      gateId: 'GATE-PASS-01',
      version: '1.0.0',
      severity: 'BLOCKER',
      description: '정상 통과 검사',
      check: async (ctx: any) => ({
        status: ctx.valid ? 'PASS' : 'FAIL',
        observed: ctx.valid,
        expected: true,
        reason: '정상 검증 완료',
      }),
    });

    // Register a crashing rule (simulating exception in observer)
    evaluator.registerRule('P-TEST', {
      gateId: 'GATE-CRASH-01',
      version: '1.0.0',
      severity: 'BLOCKER',
      description: '예외 발생 검사',
      check: async () => {
        throw new Error('Database connection failed');
      },
    });

    const report = await evaluator.evaluateProfile('P-TEST', 'run-001', { valid: true });

    expect(report.results.length).toBe(2);
    expect(report.results[0].status).toBe('PASS');
    expect(report.results[1].status).toBe('SYSTEM_ERROR');
    expect(report.blockerCount).toBe(1); // The SYSTEM_ERROR on BLOCKER counts as a blocker!
    expect(report.reportHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
