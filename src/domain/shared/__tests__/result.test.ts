import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr, DomainError, type Result } from '../result';

describe('Result<T, E> & DomainError (P1-5)', () => {
  it('ok() should construct a successful result', () => {
    const res = ok(42);
    expect(isOk(res)).toBe(true);
    expect(isErr(res)).toBe(false);
    if (isOk(res)) {
      expect(res.value).toBe(42);
    }
  });

  it('err() should construct a failure result', () => {
    const error = new DomainError('INVALID_INPUT', 'Test error message', { field: 'name' });
    const res: Result<number> = err(error);
    expect(isOk(res)).toBe(false);
    expect(isErr(res)).toBe(true);
    if (isErr(res)) {
      expect(res.error.code).toBe('INVALID_INPUT');
      expect(res.error.message).toBe('Test error message');
      expect(res.error.context?.field).toBe('name');
    }
  });

  // Rule 7: Negative Pair — isOk and isErr should be strictly mutually exclusive
  it('Rule 7 (Negative Pair): isOk and isErr must never both be true or both false', () => {
    const okRes = ok('success');
    expect(isOk(okRes) && isErr(okRes)).toBe(false);
    expect(!isOk(okRes) && !isErr(okRes)).toBe(false);

    const errRes = err(new DomainError('FAIL', 'Failed'));
    expect(isOk(errRes) && isErr(errRes)).toBe(false);
    expect(!isOk(errRes) && !isErr(errRes)).toBe(false);
  });
});
