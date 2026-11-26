import { after } from 'next/server';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('after-safe');

export function runAfterResponse(label: string, fn: () => Promise<unknown>): void {
  const wrapped = async () => {
    try {
      await fn();
    } catch (err) {
      log.error({ err, label }, '[after-safe] background task failed');
    }
  };
  try {
    after(wrapped);
  } catch {
    // Outside Next.js requestAsyncStorage (e.g. direct Vitest unit handler invocation)
    void wrapped();
  }
}
