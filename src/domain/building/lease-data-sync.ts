/**
 * W-3: Lease data synchronization helpers
 *
 * Resolves the JSONB dual-storage issue between `layers.finance` and
 * `layers.lease_summary`. Both objects historically store the same
 * three fields: monthly_rent_krw, total_deposit_krw, vacancy_pct.
 *
 * - `syncLeaseData()` — call on WRITE to keep both layers consistent.
 * - `getLeaseData()` — call on READ; prefers lease_summary, falls back to finance.
 */

export interface LeaseDataFields {
  monthly_rent_krw?: number | null;
  monthly_rent_manwon?: number | null;
  total_deposit_krw?: number | null;
  total_deposit_manwon?: number | null;
  vacancy_pct?: number | null;
}

/**
 * Write helper: given partial lease-related fields, produce synchronised
 * `finance` and `lease_summary` layer fragments.
 *
 * Returns `{ finance, lease_summary }` — merge these into `layers` before persisting.
 */
export function syncLeaseData(
  fields: LeaseDataFields,
): { finance: LeaseDataFields; lease_summary: LeaseDataFields } {
  const normalised: LeaseDataFields = {
    monthly_rent_krw: fields.monthly_rent_krw ?? null,
    monthly_rent_manwon:
      fields.monthly_rent_manwon ??
      (fields.monthly_rent_krw != null ? fields.monthly_rent_krw / 10000 : null),
    total_deposit_krw: fields.total_deposit_krw ?? null,
    total_deposit_manwon:
      fields.total_deposit_manwon ??
      (fields.total_deposit_krw != null ? fields.total_deposit_krw / 10000 : null),
    vacancy_pct: fields.vacancy_pct ?? null,
  };

  return {
    finance: { ...normalised },
    lease_summary: { ...normalised },
  };
}

/**
 * Read helper: prefer `lease_summary`, fall back to `finance` per-field.
 *
 * @param layers — the `layers` JSONB column from `building_ssot_lite`
 */
export function getLeaseData(
  layers: Record<string, any> | null | undefined,
): LeaseDataFields {
  const ls = layers?.lease_summary ?? {};
  const fin = layers?.finance ?? {};

  return {
    monthly_rent_krw: ls.monthly_rent_krw ?? fin.monthly_rent_krw ?? null,
    monthly_rent_manwon: ls.monthly_rent_manwon ?? fin.monthly_rent_manwon ?? null,
    total_deposit_krw: ls.total_deposit_krw ?? fin.total_deposit_krw ?? null,
    total_deposit_manwon: ls.total_deposit_manwon ?? fin.total_deposit_manwon ?? null,
    vacancy_pct: ls.vacancy_pct ?? fin.vacancy_pct ?? null,
  };
}
