import { describe, it, expect } from 'vitest';
import { InvalidationEngine } from '@/platform/im-pipeline/regeneration/invalidation-engine';

describe('InvalidationEngine 13-Change Invariant Matrix (PR-B4-02 / Negative-Pair Obligation)', () => {
  const engine = new InvalidationEngine();

  it('Positive Pair: Mobile layout change strictly isolates invalidation to mobile channel', () => {
    const scope = engine.resolveScope('mobile_layout_changed');

    expect(scope.invalidatedChannels).toEqual(['mobile']);
    expect(scope.invalidatedChannels).not.toContain('pptx');
    expect(scope.invalidatedChannels).not.toContain('core');
    expect(scope.requiresSnapshotRebuild).toBe(false);
  });

  it('Negative Pair: Raw data modification causes cascading invalidation across all channels', () => {
    const scope = engine.resolveScope('raw_data_update');

    expect(scope.invalidatedChannels).toContain('core');
    expect(scope.invalidatedChannels).toContain('mobile');
    expect(scope.invalidatedChannels).toContain('pptx');
    expect(scope.invalidatedChannels).toContain('dealcard');
    expect(scope.requiresSnapshotRebuild).toBe(true);
    expect(scope.requiresFullReapproval).toBe(true);
  });
});
