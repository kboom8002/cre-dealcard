import { createHash } from 'crypto';

/**
 * Recursively canonicalizes any JSON-serializable value.
 * Object keys are sorted alphabetically to ensure deterministic byte representation.
 */
export function canonicalizeJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalizeJson).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map(
        (k) =>
          JSON.stringify(k) +
          ':' +
          canonicalizeJson((obj as Record<string, unknown>)[k])
      )
      .join(',') +
    '}'
  );
}

/**
 * Computes a deterministic SHA-256 target hash for approval binding.
 * @see CREDEAL_IM_MODERNIZATION/01_INTEGRATED_MODERNIZATION_SDD.md §7
 * @see CREDEAL_IM_MODERNIZATION/07_PHASE_1_SAFETY_CONTAINMENT.md §4
 */
export function computeTargetHash(payload: {
  body: unknown;
  releaseTier: string;
  policyVersion: string;
}): string {
  const canonicalStr = canonicalizeJson(payload);
  return 'sha256:' + createHash('sha256').update(canonicalStr, 'utf-8').digest('hex');
}

export interface CanonicalClaimEntry {
  subject: string;
  value: number | string | null;
  unit?: string;
  provenance: string;
  displayLabel: string;
  status: string;
  formula?: string;
  basis?: string;
}

/**
 * Computes a deterministic SHA-256 hash of all claims in the ClaimRegistry.
 * Sorts claims alphabetically by subject and excludes runtime UUIDs to guarantee consistency.
 */
export function computeDeterministicClaimsHash(
  registry: { getAll: () => any[] },
  releaseTier: string = 'fact_om',
  policyVersion: string = '2026-08-31'
): string {
  const claims = registry.getAll();
  const sorted = [...claims].sort((a, b) => a.subject.localeCompare(b.subject));

  const canonicalEntries: Record<string, CanonicalClaimEntry> = {};
  for (const c of sorted) {
    canonicalEntries[c.subject] = {
      subject: c.subject,
      value: c.value,
      unit: c.unit,
      provenance: c.provenance,
      displayLabel: c.displayLabel,
      status: c.status,
      formula: c.calculation?.formula,
      basis: c.calculation?.basis,
    };
  }

  return computeTargetHash({
    body: canonicalEntries,
    releaseTier,
    policyVersion,
  });
}

