import { isMissingRelationOrColumnError } from '@/lib/workspace/workspace-repository';
import { isUuid } from '@/lib/im-lite/quick-generate-store';

export const PUBLIC_LEGACY_BUILDING_STATUSES: readonly string[] = [
  'public_signal_ready',
  'published',
  'active',
  'sent',
  'shared_external',
];

const PUBLIC_LEGACY_BUILDING_STATUS_SET = new Set(PUBLIC_LEGACY_BUILDING_STATUSES);

/**
 * Returns true when a legacy `building_ssot_lite.status` represents an explicitly
 * published listing. `'draft'`, `'snapshot_draft_ready'`, `'archived'`, and
 * `'revoked'` return false.
 */
export function isLegacyBuildingRowPublic(status: string | null | undefined): boolean {
  const normalized = String(status || '').trim().toLowerCase();
  return Boolean(normalized && PUBLIC_LEGACY_BUILDING_STATUS_SET.has(normalized));
}

/**
 * Synchronizes legacy `building_ssot_lite.status` to `'public_signal_ready'` when a
 * DealCard is published through any of the canonical publish entrypoints.
 */
export async function syncLegacyBuildingPublishedStatus(
  supabase: unknown,
  buildingId: string | null | undefined,
  updatedAt: string = new Date().toISOString()
): Promise<{ ok: boolean; error?: unknown }> {
  const cleanId = String(buildingId || '').trim();
  if (!cleanId || !isUuid(cleanId)) {
    return { ok: true };
  }
  const db = supabase as {
    from?: (table: string) => {
      update?: (patch: Record<string, unknown>) => {
        eq?: (col: string, val: unknown) => PromiseLike<{ error?: unknown }>;
      };
    };
  } | null;
  if (!db || typeof db.from !== 'function') {
    return { ok: true };
  }

  try {
    const q = db
      .from('building_ssot_lite')
      ?.update?.({ status: 'public_signal_ready', updated_at: updatedAt })
      ?.eq?.('id', cleanId);
    const res = q ? await q : null;
    if (res?.error && !isMissingRelationOrColumnError(res.error)) {
      return { ok: false, error: res.error };
    }
    return { ok: true };
  } catch (err) {
    if (isMissingRelationOrColumnError(err)) {
      return { ok: true };
    }
    return { ok: false, error: err };
  }
}
