/**
 * @file src/domain/building/im-core/hashes.ts
 * @description WP-P4a1-04: Three-Tier Hash Matrix implementation
 *
 * 1. content_hash: Canonical SHA-256 of pure domain facts & inputs.
 *    Strictly filters out volatile timestamps (generated_at, approved_at),
 *    runtime UUIDs, and large inline base64 assets to guarantee immutable
 *    re-verification post-approval.
 * 2. doc_hash: Canonical SHA-256 of the structured BasicImDocument model,
 *    enforcing isomorphic consistency between PPTX and Mobile IM renderers.
 * 3. file_sha256: Binary SHA-256 of rendered artifact buffers (PPTX, PDF).
 *
 * Authoritative Sources:
 * - docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §5.7.4 (D-1), §4.4
 * - PROJECT.md (Three-Tier Hash Matrix Contract)
 */

import { createHash } from 'crypto';

/**
 * Volatile keys that must NEVER participate in content_hash calculation.
 * Including these causes approval hash mismatch when metadata or timestamps change.
 */
export const VOLATILE_CONTENT_KEYS = new Set([
  'targetHash',
  'approval_target_hash',
  'approved_at',
  'approvedAt',
  'generated_at',
  'generatedAt',
  'createdAt',
  'updatedAt',
  'created_at',
  'updated_at',
  'sealed_at',
  'sealedAt',
  'seal_hash',
  'sealHash',
  'runtimeId',
  'runtime_uuid',
  'job_id',
  'generation_job_id',
  'cost_usd',
  'tokens',
  'llm_calls',
  'dataCompleteness',
  'data_completeness',
]);

/**
 * Canonicalizes a JSON object into a deterministic string by recursively
 * sorting all object keys alphabetically. Handles null, undefined, arrays,
 * numbers, booleans, and nested objects.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalizeJson).join(',') + ']';
  }
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec)
    .filter((k) => rec[k] !== undefined)
    .sort();

  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + canonicalizeJson(rec[k]))
      .join(',') +
    '}'
  );
}

/**
 * Recursively filters out volatile keys and heavy base64 strings from an object
 * to yield a stable content representation.
 */
export function pickContentKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    // Strip large inline base64 image strings to keep content_hash focused on facts
    if (typeof obj === 'string' && obj.startsWith('data:image/') && obj.length > 500) {
      return `[image_digest:${createHash('sha256').update(obj).digest('hex').slice(0, 16)}]`;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(pickContentKeys);
  }

  const result: Record<string, unknown> = {};
  const rec = obj as Record<string, unknown>;

  for (const key of Object.keys(rec)) {
    if (VOLATILE_CONTENT_KEYS.has(key)) {
      continue;
    }
    // Handle nested dataCompleteness object generatedAt stripping
    if (key === 'dataCompleteness' && rec[key] && typeof rec[key] === 'object') {
      const { generatedAt, ...cleanCompleteness } = rec[key] as Record<string, unknown>;
      result[key] = pickContentKeys(cleanCompleteness);
      continue;
    }
    result[key] = pickContentKeys(rec[key]);
  }

  return result;
}

/**
 * 1. Tier 1: computeContentHash
 * Computes deterministic SHA-256 for domain facts & body content.
 */
export function computeContentHash(payload: {
  body: unknown;
  releaseTier?: string;
  policyVersion?: string;
} | Record<string, any>): string {
  let bodyPayload: unknown;
  let releaseTier = 'fact_om';
  let policyVersion = '2026-08-31';

  if (payload && typeof payload === 'object' && 'body' in payload) {
    bodyPayload = payload.body;
    if (payload.releaseTier) releaseTier = payload.releaseTier;
    if (payload.policyVersion) policyVersion = payload.policyVersion;
  } else {
    bodyPayload = payload;
  }

  const cleanBody = pickContentKeys(bodyPayload);
  const canonicalPayload = {
    body: cleanBody,
    releaseTier,
    policyVersion,
  };

  const canonicalString = canonicalizeJson(canonicalPayload);
  const hash = createHash('sha256').update(canonicalString, 'utf-8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * 2. Tier 2: computeDocHash
 * Computes deterministic SHA-256 for a canonical BasicImDocument model.
 * Embedded in PPTX custom metadata and Mobile IM DOM for render parity verification.
 */
export function computeDocHash(doc: unknown): string {
  // Strip any existing docHash self-reference to avoid circular dependency
  let cleanDoc = doc;
  if (doc && typeof doc === 'object' && !Array.isArray(doc)) {
    const { docHash, ...rest } = doc as Record<string, unknown>;
    cleanDoc = rest;
  }

  const canonicalStr = canonicalizeJson(cleanDoc);
  const hash = createHash('sha256').update(canonicalStr, 'utf-8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * 3. Tier 3: computeFileSha256
 * Computes binary SHA-256 for rendered artifact file buffers (PPTX, PDF).
 */
export function computeFileSha256(buffer: Buffer | Uint8Array | ArrayBuffer): string {
  let u8: Uint8Array;
  if (Buffer.isBuffer(buffer)) {
    u8 = new Uint8Array(buffer);
  } else if (buffer instanceof ArrayBuffer) {
    u8 = new Uint8Array(buffer);
  } else {
    u8 = buffer;
  }

  const hash = createHash('sha256').update(u8).digest('hex');
  return `sha256:${hash}`;
}
