import { describe, it, expect, afterEach, vi } from 'vitest';
import { isDeterministicLLMMode } from '@/ai/llm-determinism';
import { shouldJudgeByConfidence } from '@/domain/building/mobile-im/im-judge';
import { CrePromptRegistry } from '@/domain/building/mobile-im/cre-prompt-registry';

describe('H4 LLM 결정성 (record/replay 모드)', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('isDeterministicLLMMode: record/replay/record-missing 만 true', () => {
    for (const m of ['record', 'replay', 'record-missing', 'REPLAY']) expect(isDeterministicLLMMode({ LLM_MODE: m } as unknown as NodeJS.ProcessEnv)).toBe(true);
    for (const m of ['live', '', undefined]) expect(isDeterministicLLMMode({ LLM_MODE: m } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it('Judge 샘플링: 결정 모드에선 needs_check 만 평가 (Math.random 무관)', () => {
    vi.stubEnv('LLM_MODE', 'replay');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(shouldJudgeByConfidence('needs_check')).toBe(true);
    expect(shouldJudgeByConfidence('inferred')).toBe(false);
    expect(shouldJudgeByConfidence('confirmed')).toBe(false);
  });

  it('Judge 샘플링: live 에선 기존 확률 동작 유지', () => {
    vi.stubEnv('LLM_MODE', 'live');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(shouldJudgeByConfidence('confirmed')).toBe(true);
  });

  it('A/B 프롬프트: 결정 모드에선 항상 첫 변형', () => {
    vi.stubEnv('LLM_MODE', 'record-missing');
    const reg = CrePromptRegistry.getInstance();
    const spy = vi.spyOn(Math, 'random');
    const ids = new Set<string | undefined>();
    for (const r of [0, 0.99, 0.5]) { spy.mockReturnValue(r); ids.add(reg.getActivePrompt('writer_system')?.id); }
    expect(ids.size).toBe(1);
  });
});
