import { describe, it, expect, vi, beforeEach } from 'vitest';

const callLLM = vi.fn();
vi.mock('@/ai/llm-client', () => ({ callLLM: (...a: unknown[]) => callLLM(...a) }));

import { validateRepair, extractNumberTokens, isGateSystemFailure, repairDraftForGate, buildRepairPrompts } from '@/domain/building/mobile-im/cre-gate-repair';

const ORIGINAL = `- **입지**: 선유도역 135m·도보 2분, 토지 518.7㎡ 공시지가 기준 약 53.4억 원으로 원금 보전력을 강화합니다.
- **임대**: 월 임대료 5,147만원, 공실률 8.33%.
- **규모**: 연면적 2,490.88㎡.`;
const ISSUE = [{ type: 'investment_guarantee' as const, excerpt: '원금 보전력을 강화합니다', suggestion: '보장 표현 제거' }];

describe('cre-gate-repair', () => {
  beforeEach(() => callLLM.mockReset());

  it('extractNumberTokens: 콤마 제거·소수 유지', () => {
    expect([...extractNumberTokens('5,147만원 8.33% 2026년 10.0')]).toEqual(['5147', '8.33', '2026', '10']);
  });

  it('validateRepair: 원문에 없는 수치가 생기면 거부 (Rule 34)', () => {
    const bad = ORIGINAL.replace('원금 보전력을 강화합니다', '연 5.2% 수익이 예상됩니다');
    expect(validateRepair(ORIGINAL, bad).ok).toBe(false);
    expect(validateRepair(ORIGINAL, bad).reason).toMatch(/new_numbers:5.2/);
  });

  it('validateRepair: 과도하게 짧거나 빈 교정본 거부, 정상 교정 허용', () => {
    expect(validateRepair(ORIGINAL, '').ok).toBe(false);
    expect(validateRepair(ORIGINAL, '- 짧음').ok).toBe(false);
    expect(validateRepair(ORIGINAL, ORIGINAL.replace('원금 보전력을 강화합니다', '입지 요건을 갖추고 있습니다')).ok).toBe(true);
  });

  it('게이트 시스템 실패는 교정하지 않음 (BL-6)', async () => {
    const sys = [{ type: 'fabricated_data' as const, excerpt: '[LLM 검사기 호출 실패]', suggestion: '' }];
    expect(isGateSystemFailure(sys)).toBe(true);
    expect(await repairDraftForGate(ORIGINAL, 'investment_thesis', sys, 'm', 1000)).toBeNull();
    expect(callLLM).not.toHaveBeenCalled();
  });

  it('정상 교정본은 반환, 코드펜스 제거', async () => {
    const fixed = ORIGINAL.replace('원금 보전력을 강화합니다', '입지 요건을 갖추고 있습니다');
    callLLM.mockResolvedValue({ content: '```markdown\n' + fixed + '\n```', tokens: 10 });
    expect(await repairDraftForGate(ORIGINAL, 'investment_thesis', ISSUE, 'm', 1000)).toBe(fixed);
  });

  it('수치 창작 교정본 / LLM 실패 → null', async () => {
    callLLM.mockResolvedValueOnce({ content: ORIGINAL.replace('원금 보전력을 강화합니다', '연 7% 상승 예상'), tokens: 1 });
    expect(await repairDraftForGate(ORIGINAL, 'investment_thesis', ISSUE, 'm', 1000)).toBeNull();
    callLLM.mockRejectedValueOnce(new Error('timeout'));
    expect(await repairDraftForGate(ORIGINAL, 'investment_thesis', ISSUE, 'm', 1000)).toBeNull();
  });

  it('프롬프트에 지적 발췌·제안·원문 포함', () => {
    const { userPrompt } = buildRepairPrompts(ORIGINAL, 'investment_thesis', ISSUE);
    expect(userPrompt).toContain('원금 보전력을 강화합니다');
    expect(userPrompt).toContain('보장 표현 제거');
    expect(userPrompt).toContain('5,147만원');
  });
});
