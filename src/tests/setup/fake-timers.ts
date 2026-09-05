import { vi, beforeEach, afterEach } from 'vitest';

export interface FakeTimerOptions {
  now?: string | number | Date;
  toFake?: ('setTimeout' | 'clearTimeout' | 'setInterval' | 'clearInterval' | 'Date' | 'hrtime')[];
}

/**
 * Standard utility to control time deterministically across Vitest test suites.
 * Eliminates flaky tests caused by real-world clock skews and race conditions.
 */
export function setupFakeTimers(options: FakeTimerOptions = {}) {
  const initialDate = options.now ? new Date(options.now) : new Date('2026-09-01T00:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers({
      now: initialDate,
      toFake: options.toFake ?? ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  return {
    advanceBy: (ms: number) => vi.advanceTimersByTime(ms),
    advanceToNextTimer: () => vi.runOnlyPendingTimers(),
    runAllTimers: () => vi.runAllTimers(),
    setDate: (d: Date | string | number) => vi.setSystemTime(new Date(d)),
    now: () => new Date(),
  };
}
