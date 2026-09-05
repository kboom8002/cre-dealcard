import { describe, it, expect } from 'vitest';
import { createRegenerationPlan } from '@/platform/im-pipeline/regeneration/planner';

describe('RegenerationPlan API & Calculator (PR-B4-03 / Negative-Pair Obligation)', () => {
  it('Positive Pair: Mobile layout change retains all upstream CORE stages as reusable', () => {
    const plan = createRegenerationPlan('deal-regen-1', 'mobile_layout_changed', [
      'P10',
      'P20',
      'P30',
      'P40',
      'P50',
      'P60',
      'M10',
      'M20',
      'S30',
      'S70',
    ]);

    expect(plan.changeKind).toBe('mobile_layout_changed');
    expect(plan.reusableStageOutputs).toContain('P10');
    expect(plan.reusableStageOutputs).toContain('P30');
    expect(plan.reusableStageOutputs).toContain('P60');
    expect(plan.reusableStageOutputs).toContain('S70'); // PPTX remains intact!
    expect(plan.invalidatedApprovalIds.length).toBe(0);
  });

  it('Negative Pair: Raw data change invalidates all approvals and requires full pipeline rerun', () => {
    const plan = createRegenerationPlan('deal-regen-2', 'raw_data_update', [
      'P10',
      'P30',
      'P60',
      'M10',
      'S70',
    ]);

    expect(plan.changeKind).toBe('raw_data_update');
    expect(plan.reusableStageOutputs.length).toBe(0);
    expect(plan.invalidatedApprovalIds.length).toBeGreaterThan(0);
  });
});
