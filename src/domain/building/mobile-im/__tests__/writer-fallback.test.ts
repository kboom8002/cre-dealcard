import { describe, it, expect } from 'vitest';
import {
  createTimeoutChecklistSection,
  createRetryExhaustedChecklistSection,
  createKillLimitChecklistSection,
} from '../writer-fallback';

describe('writer-fallback', () => {
  it('creates timeout checklist section with expected metadata and needs_check status', () => {
    const sec = createTimeoutChecklistSection('investment_thesis', 5);
    expect(sec.section_type).toBe('checklist');
    expect(sec.section_order).toBe(5);
    expect(sec.confidence).toBe('needs_check');
    expect(sec.title).toContain('investment_thesis');
    expect(sec.markdown).toContain('105초');

    // Negative assertion: confidence must NOT be high or medium
    expect(sec.confidence).not.toBe('high');
    expect(sec.confidence).not.toBe('medium');
  });

  it('creates retry exhausted checklist section with fallback error message', () => {
    const sec = createRetryExhaustedChecklistSection('cost_comparison', 3, 2, 'API rate limited');
    expect(sec.section_type).toBe('checklist');
    expect(sec.markdown).toContain('3회 시도 후 실패');
    expect(sec.markdown).toContain('API rate limited');
    expect(sec.confidence).toBe('needs_check');

    // Negative case: when error is undefined, uses '알 수 없음' fallback
    const secNoErr = createRetryExhaustedChecklistSection('cost_comparison', 3, 2, undefined);
    expect(secNoErr.markdown).toContain('알 수 없음');
    expect(secNoErr.markdown).not.toContain('undefined');
  });

  it('creates kill limit checklist section with discarded section count', () => {
    const sec = createKillLimitChecklistSection(8, 3);
    expect(sec.section_type).toBe('checklist');
    expect(sec.section_order).toBe(8);
    expect(sec.markdown).toContain('3개 섹션이 제거');
    expect(sec.boundary_note).toBe('BL-6: 3개 섹션 타임아웃 폐기');

    // Negative assertion: order is not 0
    expect(sec.section_order).not.toBe(0);
  });
});
