/**
 * Deterministic Nested-Key Idempotency Hashing (WP-P05-03 / S5)
 * 
 * Bug Fix from v1:
 * Previous JSON.stringify(obj, Object.keys(obj).sort()) dropped nested keys!
 * canonicalizeJson recursively sorts all dictionary keys at every depth level,
 * ensuring deterministic SHA-256 idempotency across nested payload variations.
 */
import { createHash } from 'node:crypto';

/**
 * Recursively canonicalizes any JSON value into a deterministic sorted string.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalizeJson).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const pairs = keys.map((k) => {
      const v = (value as Record<string, unknown>)[k];
      return `${JSON.stringify(k)}:${canonicalizeJson(v)}`;
    });
    return '{' + pairs.join(',') + '}';
  }
  return JSON.stringify(String(value));
}

export interface IdempotencyHashParams {
  ownerId?: string | null;
  buildingId: string;
  input: unknown;
  promptVersion?: string;
  posture?: string;
  tier?: string;
}

/**
 * Computes deterministic idempotency hash:
 * sha256(ownerId | buildingId | canonicalizeJson(input) | promptVersion | posture | tier)
 */
export function computeIdempotencyHash(params: IdempotencyHashParams): string {
  const parts = [
    params.ownerId || 'anon',
    params.buildingId,
    canonicalizeJson(params.input),
    params.promptVersion || 'v1',
    params.posture || 'income',
    params.tier || 'basic',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}
