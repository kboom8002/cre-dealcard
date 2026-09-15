import { MOCK_DISPATCH_REGISTRY } from '@/ai/providers/mock-openai';
import { describe, it, expect } from 'vitest';

describe('Mock Provider Registry Coverage', () => {
  const PRODUCTION_PROMPT_PATTERNS = [
    { name: 'quality_gate', keyword: 'quality_gate' },
    { name: 'judge', keyword: 'LLM-as-Judge' },
    { name: 'persona', keyword: 'IDEAL BUYER PERSONAS' },
    { name: 'rent_roll', keyword: 'rent_roll' },
    { name: 'section_narrative', keyword: 'section_narrative' },
  ];

  for (const pattern of PRODUCTION_PROMPT_PATTERNS) {
    it(`Mock 레지스트리에 "${pattern.name}" 프롬프트 핸들러가 등록되어야 함`, () => {
      const found = MOCK_DISPATCH_REGISTRY.some((e: { name: string }) => e.name === pattern.name);
      expect(found).toBe(true);
    });
  }
});
