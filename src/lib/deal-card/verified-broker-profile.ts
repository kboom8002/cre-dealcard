/**
 * WP-7.3C P1-5 — DB-verified broker profile for DealCard published snapshots.
 *
 * Public snapshots must never trust a client-supplied brokerProfile. This helper
 * reads `profiles` + `broker_profiles` with the service client (schema-drift
 * tolerant: falls back to narrower column sets on 42703/PGRST204) and merges the
 * statutory fields returned by assertPublishable as a fallback.
 */
import { buildBrokerProfileMeta } from '@/lib/workspace/summary/types-and-helpers';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSchemaColumnErr(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === '42703' || err.code === 'PGRST204') return true;
  return /does not exist|schema cache/i.test(String(err.message || ''));
}

export interface StatutoryBrokerFallback {
  company?: string;
  officeAddress?: string;
  phone?: string;
  officeRegNumber?: string;
  representativeName?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceLike = { from: (table: string) => any } | null | undefined;

export async function fetchVerifiedBrokerSnapshotProfile(
  supabase: ServiceLike,
  userId: string,
  statutoryFallback?: StatutoryBrokerFallback | null,
): Promise<Record<string, unknown> | null> {
  let pRow: Record<string, unknown> | null = null;
  let bpRow: Record<string, unknown> | null = null;

  if (supabase && typeof supabase.from === 'function' && UUID_RE.test(String(userId || ''))) {
    try {
      const pFull = await supabase
        .from('profiles')
        .select('display_name, company, phone, photo_url')
        .eq('id', userId)
        .maybeSingle();
      if (pFull?.error && isSchemaColumnErr(pFull.error)) {
        const pMin = await supabase
          .from('profiles')
          .select('display_name, company, phone')
          .eq('id', userId)
          .maybeSingle();
        pRow = (pMin?.data as Record<string, unknown> | null) ?? null;
      } else {
        pRow = (pFull?.data as Record<string, unknown> | null) ?? null;
      }
    } catch {
      pRow = null;
    }

    try {
      const bpFull = await supabase
        .from('broker_profiles')
        .select(
          'user_id, slug, card_name, photo_url, deal_specialty, license_number, office_reg_number, office_address, representative_name',
        )
        .eq('user_id', userId)
        .maybeSingle();
      if (bpFull?.error && isSchemaColumnErr(bpFull.error)) {
        const bpCore = await supabase
          .from('broker_profiles')
          .select('user_id, slug, card_name, photo_url, license_number, office_reg_number')
          .eq('user_id', userId)
          .maybeSingle();
        if (bpCore?.error && isSchemaColumnErr(bpCore.error)) {
          const bpMin = await supabase
            .from('broker_profiles')
            .select('user_id, slug, office_reg_number')
            .eq('user_id', userId)
            .maybeSingle();
          bpRow = (bpMin?.data as Record<string, unknown> | null) ?? null;
        } else {
          bpRow = (bpCore?.data as Record<string, unknown> | null) ?? null;
        }
      } else {
        bpRow = (bpFull?.data as Record<string, unknown> | null) ?? null;
      }
    } catch {
      bpRow = null;
    }
  }

  const meta = buildBrokerProfileMeta(pRow, bpRow);
  const company = meta?.company || statutoryFallback?.company || undefined;
  const officeAddress = meta?.officeAddress || statutoryFallback?.officeAddress || undefined;
  const phone = meta?.phone || statutoryFallback?.phone || undefined;
  const officeRegNumber = meta?.officeRegNumber || statutoryFallback?.officeRegNumber || undefined;
  const representativeName =
    meta?.representativeName || statutoryFallback?.representativeName || undefined;
  const displayName =
    meta?.displayName ||
    (typeof bpRow?.card_name === 'string' && bpRow.card_name) ||
    representativeName ||
    undefined;
  const photoUrl =
    meta?.photoUrl ||
    (typeof bpRow?.photo_url === 'string' ? bpRow.photo_url : undefined) ||
    (typeof pRow?.photo_url === 'string' ? pRow.photo_url : undefined);

  if (!company && !officeAddress && !phone && !officeRegNumber && !representativeName && !displayName) {
    return null;
  }

  return {
    ...(meta || {}),
    ...(displayName ? { displayName, display_name: displayName } : {}),
    ...(company ? { company } : {}),
    ...(phone ? { phone } : {}),
    ...(officeAddress ? { officeAddress, office_address: officeAddress } : {}),
    ...(officeRegNumber
      ? {
          officeRegNumber,
          office_reg_number: officeRegNumber,
          registrationNo: officeRegNumber,
        }
      : {}),
    ...(representativeName ? { representativeName, representative_name: representativeName } : {}),
    ...(photoUrl ? { photoUrl, avatar_url: photoUrl } : {}),
    ...(typeof bpRow?.card_name === 'string' && bpRow.card_name ? { card_name: bpRow.card_name } : {}),
    is_licensed: Boolean(meta?.is_licensed || officeRegNumber),
  };
}
