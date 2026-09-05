import { describe, it, expect, beforeEach } from 'vitest';
import { CrePromptRegistry, type PromptRegistryPort } from '../cre-prompt-registry';

describe('CrePromptRegistry & PromptRegistryPort (P2-2)', () => {
  let registry: CrePromptRegistry;

  beforeEach(() => {
    registry = CrePromptRegistry.getInstance();
  });

  it('implements PromptRegistryPort and retrieves default active prompts', () => {
    const prompt = registry.getActivePrompt('writer_system');
    expect(prompt).not.toBeNull();
    expect(prompt?.isActive).toBe(true);
    expect(prompt?.systemPrompt).toContain('Commercial Real Estate');
  });

  it('returns null when slotKey is unknown or unregistered (negative pair)', () => {
    const prompt = registry.getActivePrompt('non_existent_slot_key_xyz');
    expect(prompt).toBeNull();
  });

  it('allows registering custom prompts and lists them by slotKey', () => {
    registry.register('custom_test_slot', {
      id: 'custom_v1',
      version: '1.0',
      description: 'Custom prompt test',
      systemPrompt: 'You are a test agent.',
      isActive: true,
      isABTesting: false,
    });

    const active = registry.getActivePrompt('custom_test_slot');
    expect(active?.id).toBe('custom_v1');

    const list = registry.listPrompts('custom_test_slot') as any[];
    expect(list).toHaveLength(1);

    // Negative check: unregistered slot returns empty list
    const emptyList = registry.listPrompts('empty_slot_123') as any[];
    expect(emptyList).toEqual([]);
  });

  it('returns null when prompt in slot is inactive (negative pair)', () => {
    registry.register('inactive_slot', {
      id: 'inactive_v1',
      version: '1.0',
      description: 'Inactive prompt',
      systemPrompt: 'Do nothing',
      isActive: false,
      isABTesting: false,
    });

    const prompt = registry.getActivePrompt('inactive_slot');
    expect(prompt).toBeNull();
  });
});
