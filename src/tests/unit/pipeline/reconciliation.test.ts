import { describe, it, expect } from 'vitest';
import {
  reconcilePhysicalAttribute,
  reconcileCommercialAttribute,
} from '@/domain/building/common-pipeline/reconciliation';

describe('Deterministic Discrepancy Reconciliation (CIM-0401 / PR-M4-01)', () => {
  it('should prioritize public_registry for physical area and detect conflict if deviation > 0.5%', () => {
    const result = reconcilePhysicalAttribute('total_area', [
      { source: 'broker_input', value: 1400.0, asOf: '2026-09-01' },
      { source: 'public_registry', value: 1380.0, asOf: '2026-08-30' },
    ]);

    expect(result.reconciledValue).toBe(1380.0);
    expect(result.winningSource).toBe('public_registry');
    expect(result.hasConflict).toBe(true);
    expect(result.conflictDetails?.diffPercent).toBeCloseTo(1.45, 1);
  });

  it('should prioritize broker_input for asking price', () => {
    const result = reconcileCommercialAttribute('asking_price', [
      { source: 'seller_notice', value: 13000000000, asOf: '2026-08-20' },
      { source: 'broker_input', value: 12500000000, asOf: '2026-09-01' },
    ]);

    expect(result.reconciledValue).toBe(12500000000);
    expect(result.winningSource).toBe('broker_input');
  });
});
