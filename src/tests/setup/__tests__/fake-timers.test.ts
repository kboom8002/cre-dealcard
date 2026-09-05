import { describe, it, expect, vi } from 'vitest';
import { setupFakeTimers } from '../fake-timers';

describe('setupFakeTimers Utility', () => {
  const clock = setupFakeTimers({ now: '2026-09-01T12:00:00.000Z' });

  it('initializes to the configured mock timestamp', () => {
    expect(new Date().toISOString()).toBe('2026-09-01T12:00:00.000Z');
  });

  it('advances timers and calls scheduled callbacks', () => {
    const fn = vi.fn();
    setTimeout(fn, 1000);

    // Negative pair: callback is NOT called before timer elapses
    expect(fn).not.toHaveBeenCalled();

    // Advance 500ms: still not called
    clock.advanceBy(500);
    expect(fn).not.toHaveBeenCalled();

    // Advance remaining 500ms: now called exactly once
    clock.advanceBy(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('allows overriding system time dynamically', () => {
    clock.setDate('2027-01-01T00:00:00.000Z');
    expect(new Date().toISOString()).toBe('2027-01-01T00:00:00.000Z');

    // Negative check: not the original initial date
    expect(new Date().toISOString()).not.toBe('2026-09-01T12:00:00.000Z');
  });
});
