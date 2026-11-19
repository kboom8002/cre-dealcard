/**
 * Pure (dependency-free) DealCard public-snapshot sanitizer.
 *
 * Extracted from workspace-repository.ts (WP-7.3C) so offline tooling such as
 * scripts/backfill-workspace-items.ts can build snapshots through the exact same
 * code path without importing server-only modules. workspace-repository.ts
 * re-exports `buildSanitizedDealCardPublicSnapshot` unchanged.
 */

const DEALCARD_PUBLIC_FORBIDDEN_KEYS = new Set([
  'memoText',
  'memo_text',
  'rawMemo',
  'pairedMemoId',
  'personas',
  'ownerPhone',
  'ownerName',
  'jibunAddress',
  'roadAddress',
  'rentRoll',
  'rent_roll',
  'draftPayload',
  'internalNotes',
]);

function stripDealCardPrivateKeys(val: unknown, depth = 0): unknown {
  if (depth > 6 || val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val.map((item) => stripDealCardPrivateKeys(item, depth + 1));
  }
  const src = val as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (DEALCARD_PUBLIC_FORBIDDEN_KEYS.has(k)) continue;
    out[k] = stripDealCardPrivateKeys(v, depth + 1);
  }
  return out;
}

export function buildSanitizedDealCardPublicSnapshot(
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  return stripDealCardPrivateKeys(raw, 0) as Record<string, unknown>;
}
