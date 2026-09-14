import { describe, it, expect, vi } from 'vitest';
import { createModuleLogger, logger } from './logger';

describe('Logger & Observability Integration (P3-05)', () => {
  it('should create a module logger with info, warn, error, debug, child', () => {
    const log = createModuleLogger('test-module');
    expect(log).toBeDefined();
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.child).toBe('function');
  });

  it('should support child loggers with nested metadata', () => {
    const log = createModuleLogger('parent');
    const childLog = log.child({ subService: 'child-service' });
    expect(childLog).toBeDefined();
    expect(typeof childLog.info).toBe('function');
    expect(typeof childLog.error).toBe('function');
  });

  it('should safely serialize Error objects with stack, name, and message', () => {
    const log = createModuleLogger('error-test');
    const err = new Error('Database connection failed');
    err.name = 'DatabaseError';
    (err as any).code = 'ECONNREFUSED';

    // Should not throw and format safely
    expect(() => {
      log.error('Query execution failed', err);
      log.error(err, 'Explicit error first');
      log.error(err);
      log.error('Error with metadata', err, { attempt: 3 });
    }).not.toThrow();
  });

  it('should handle multiple primitive arguments and plain metadata objects', () => {
    const log = createModuleLogger('args-test');
    expect(() => {
      log.info('User joined', { userId: 'usr-123', role: 'broker' });
      log.warn('Threshold exceeded', 95, '%', 'warning');
      log.debug('Single debug message');
    }).not.toThrow();
  });
});
