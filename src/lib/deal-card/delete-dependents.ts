/**
 * WP-7.3C P2 — shared cascade cleanup for hard-deleting a DealCard building.
 *
 * Used by DELETE /api/broker/deal-card/[id] and DELETE /api/broker/deal-card/[id]/delete
 * so the two paths cannot drift (they previously disagreed on circle_shared_assets:
 * `asset_id` vs a non-existent `building_id`). Failures are no longer silently
 * discarded by Promise.allSettled: every non-"missing table/column" failure is
 * returned to the caller (and logged there).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceLike = { from: (table: string) => any };

export interface DealCardDependentDeleteFailure {
  table: string;
  message: string;
}

function isMissingSchemaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = String((err as { code?: unknown }).code ?? '');
  const msg = String((err as { message?: unknown }).message ?? '');
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    /does not exist|schema cache|could not find the (?:table|column)/i.test(msg)
  );
}

/** [table, column] pairs keyed on the building id. */
const DEPENDENT_TABLES: ReadonlyArray<readonly [string, string]> = [
  ['document_objects', 'building_id'],
  ['building_signal_cards', 'building_id'],
  ['gate_requests', 'building_id'],
  ['owner_readiness_checks', 'building_id'],
  ['deal_card_personas', 'building_ssot_lite_id'],
  ['deal_matches', 'building_id'],
  ['price_predictions', 'building_id'],
  ['lease_spaces', 'building_id'],
  ['full_im_handoffs', 'source_building_ssot_lite_id'],
  ['space_ai_handoffs', 'source_building_ssot_lite_id'],
  ['match_results', 'building_ssot_lite_id'],
  ['deal_pipeline_states', 'building_ssot_lite_id'],
  ['deal_casepacks', 'building_ssot_lite_id'],
];

export async function deleteDealCardDependents(
  service: ServiceLike,
  buildingId: string,
): Promise<DealCardDependentDeleteFailure[]> {
  const ops: Array<{ table: string; run: () => PromiseLike<{ error?: unknown } | null | undefined> }> =
    DEPENDENT_TABLES.map(([table, column]) => ({
      table,
      run: () => service.from(table).delete().eq(column, buildingId),
    }));
  // circle_shared_assets (00067): polymorphic (asset_type, asset_id) — there is no building_id column.
  ops.push({
    table: 'circle_shared_assets',
    run: () =>
      service.from('circle_shared_assets').delete().eq('asset_type', 'building').eq('asset_id', buildingId),
  });

  const results = await Promise.allSettled(
    ops.map(async (op) => {
      const res = await op.run();
      return res ?? null;
    }),
  );

  const failures: DealCardDependentDeleteFailure[] = [];
  results.forEach((r, idx) => {
    const table = ops[idx].table;
    if (r.status === 'rejected') {
      if (isMissingSchemaError(r.reason)) return;
      failures.push({
        table,
        message: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
      return;
    }
    const err = (r.value as { error?: unknown } | null)?.error;
    if (err && !isMissingSchemaError(err)) {
      failures.push({ table, message: String((err as { message?: unknown }).message ?? err) });
    }
  });
  return failures;
}
