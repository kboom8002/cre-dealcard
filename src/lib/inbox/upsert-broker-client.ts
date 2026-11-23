/**
 * Idempotent Inbound-to-CRM broker_clients Upsert Helper (Axis 5 — A5-07)
 *
 * Ensures every qualified inbound lead (G2 gate, IM inquiry, workspace gate
 * approval, or newsletter subscriber) is idempotently linked/upserted into
 * `broker_clients` without duplicating existing contacts or overwriting
 * broker-curated CRM fields (`notes`, `free_memo`, `tier`, `is_vip`).
 *
 * Strictly non-blocking: swallows/logs schema or transient errors without
 * leaking PII so public intake and approval flows never fail on CRM sync.
 */
import { createModuleLogger } from '@/lib/logger';
import { isIgnorableSchemaError } from '@/lib/inbox/inbox-schema-caps';

const log = createModuleLogger('upsert-broker-client');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface UpsertBrokerClientInboundParams {
  supabase: any;
  brokerUserId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  buildingId?: string | null;
  buildingTitle?: string | null;
  clientRole?: 'buyer' | 'seller' | 'tenant' | 'partner';
  source?: string;
  preferredRegions?: string[];
  /** Only true after explicit recipient confirmation (DOI confirm). */
  consentConfirmed?: boolean;
}

export interface UpsertBrokerClientResult {
  id: string | null;
  created: boolean;
}

const PLACEHOLDER_NAMES = new Set([
  '이름 미입력 고객',
  '잠재 고객',
  '미입력',
  '무명',
  '고객',
  '익명',
  '게스트',
]);

export function canonicalKrPhoneDigits(raw?: unknown): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('82') && digits.length >= 11 && digits.length <= 13) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

function formatKrPhoneForStorage(raw?: string | null, digits?: string): string {
  const d = digits ?? canonicalKrPhoneDigits(raw);
  if (/^01[016789]\d{8}$/.test(d)) {
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  if (/^01[016789]\d{7}$/.test(d)) {
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return String(raw || '').trim();
}

function normalizeEmailForStorage(raw?: string | null): string {
  const trimmed = String(raw || '').trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return '';
  }
  return trimmed;
}

function isPlaceholderDisplayName(name: string, email: string): boolean {
  const clean = name.trim();
  if (!clean) return true;
  if (PLACEHOLDER_NAMES.has(clean)) return true;
  if (email && clean.toLowerCase() === email.split('@')[0]?.toLowerCase()) {
    return true;
  }
  return false;
}

function isMissingColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = String((err as { code?: unknown }).code || '');
  const msg = String((err as { message?: unknown }).message || '');
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    /column .* does not exist|could not find the .* column/i.test(msg)
  );
}

async function resolveBrokerProfileUuid(
  supabase: any,
  rawBrokerKey?: string | null,
): Promise<string | null> {
  const clean = String(rawBrokerKey || '').trim();
  if (!clean) return null;
  if (UUID_RE.test(clean)) return clean;

  try {
    const q = supabase
      .from('broker_profiles')
      .select('user_id')
      .eq('slug', clean);
    const res =
      typeof q?.limit === 'function' ? await q.limit(1) : await q;
    const row = Array.isArray(res?.data) ? res.data[0] : res?.data;
    const candidate = String(row?.user_id || '').trim();
    if (UUID_RE.test(candidate)) return candidate;
  } catch {
    // non-blocking slug resolution fallback
  }
  return null;
}

async function fetchBrokerClientsForMatching(
  supabase: any,
  brokerUuid: string,
): Promise<{ rows: any[]; schemaSupported: boolean }> {
  const selectCandidates = [
    'id, broker_id, display_name, phone, email, company, building_id, building_title, linked_building_ids, preferred_regions, tags, notes, free_memo, tier, is_vip, client_role, client_type, consent_status',
    'id, broker_id, display_name, phone, email, company, linked_building_ids, preferred_regions, tags, notes, tier, client_type',
    'id, broker_id, display_name, phone, tier, tags, notes, linked_building_ids',
  ];

  for (const cols of selectCandidates) {
    try {
      const q = supabase
        .from('broker_clients')
        .select(cols)
        .eq('broker_id', brokerUuid);
      const res =
        typeof q?.limit === 'function' ? await q.limit(500) : await q;
      if (!res?.error) {
        return {
          rows: Array.isArray(res?.data) ? res.data : [],
          schemaSupported: true,
        };
      }
      if (isMissingColumnError(res.error)) {
        continue;
      }
      if (isIgnorableSchemaError(res.error)) {
        return { rows: [], schemaSupported: false };
      }
      return { rows: [], schemaSupported: false };
    } catch {
      return { rows: [], schemaSupported: false };
    }
  }

  return { rows: [], schemaSupported: false };
}

export async function upsertBrokerClientFromInbound(
  params: UpsertBrokerClientInboundParams,
): Promise<UpsertBrokerClientResult | null> {
  const { supabase } = params;
  if (!supabase || typeof supabase.from !== 'function') {
    return null;
  }

  try {
    const brokerUuid = await resolveBrokerProfileUuid(supabase, params.brokerUserId);
    if (!brokerUuid) {
      return null;
    }

    const phoneDigits = canonicalKrPhoneDigits(params.phone);
    const hasMatchablePhone = phoneDigits.length >= 9 && phoneDigits.length <= 12;
    const formattedPhone = hasMatchablePhone
      ? formatKrPhoneForStorage(params.phone, phoneDigits)
      : '';
    const emailNorm = normalizeEmailForStorage(params.email);

    if (!hasMatchablePhone && !emailNorm) {
      return null;
    }

    const cleanName = String(params.name || '').trim();
    const cleanCompany = String(params.company || '').trim();
    const cleanBuildingId = String(params.buildingId || '').trim();
    const validBuildingUuid = UUID_RE.test(cleanBuildingId) ? cleanBuildingId : null;
    const cleanBuildingTitle = String(params.buildingTitle || '').trim();
    const sourceTag = String(params.source || '').trim();
    const cleanRegions = Array.from(
      new Set(
        (params.preferredRegions || [])
          .map((r) => String(r || '').trim())
          .filter(Boolean),
      ),
    );

    const { rows, schemaSupported } = await fetchBrokerClientsForMatching(
      supabase,
      brokerUuid,
    );
    if (!schemaSupported) {
      return null;
    }

    const phoneMatch = hasMatchablePhone
      ? rows.find((row) => canonicalKrPhoneDigits(row?.phone) === phoneDigits)
      : undefined;
    const emailMatch =
      !phoneMatch && emailNorm
        ? rows.find(
            (row) => normalizeEmailForStorage(row?.email) === emailNorm,
          )
        : undefined;
    const existing = phoneMatch || emailMatch;

    if (existing) {
      const patch: Record<string, unknown> = {};
      const existingName = String(existing.display_name || '').trim();
      const existingEmail = normalizeEmailForStorage(existing.email);
      const existingPhoneDigits = canonicalKrPhoneDigits(existing.phone);
      const existingCompany = String(existing.company || '').trim();
      const existingBuildingTitle = String(existing.building_title || '').trim();

      if (cleanName && isPlaceholderDisplayName(existingName, existingEmail)) {
        patch.display_name = cleanName;
      }
      if (cleanCompany && !existingCompany) {
        patch.company = cleanCompany;
      }
      if (formattedPhone && !existingPhoneDigits) {
        patch.phone = formattedPhone;
      }
      if (emailNorm && !existingEmail) {
        patch.email = emailNorm;
      }
      if (validBuildingUuid && !existing.building_id) {
        patch.building_id = validBuildingUuid;
      }
      if (cleanBuildingTitle && !existingBuildingTitle) {
        patch.building_title = cleanBuildingTitle;
      }

      if (validBuildingUuid) {
        const prevLinked: string[] = Array.isArray(existing.linked_building_ids)
          ? existing.linked_building_ids.filter(Boolean)
          : [];
        if (!prevLinked.includes(validBuildingUuid)) {
          patch.linked_building_ids = [...prevLinked, validBuildingUuid];
        }
      }

      if (cleanRegions.length > 0) {
        const prevRegions: string[] = Array.isArray(existing.preferred_regions)
          ? existing.preferred_regions.filter(Boolean)
          : [];
        const mergedRegions = Array.from(new Set([...prevRegions, ...cleanRegions]));
        if (mergedRegions.length > prevRegions.length) {
          patch.preferred_regions = mergedRegions;
        }
      }

      if (sourceTag) {
        const prevTags: string[] = Array.isArray(existing.tags)
          ? existing.tags.filter(Boolean)
          : [];
        if (!prevTags.includes(sourceTag)) {
          patch.tags = [...prevTags, sourceTag];
        }
      }

      if (
        params.consentConfirmed === true &&
        existing.consent_status !== 'unsubscribed' &&
        existing.consent_status !== 'confirmed'
      ) {
        patch.consent_status = 'confirmed';
        patch.consent_updated_at = new Date().toISOString();
      }

      if (Object.keys(patch).length > 0 && existing.id) {
        const { error: updateErr } = await supabase
          .from('broker_clients')
          .update(patch)
          .eq('id', existing.id);

        if (updateErr && isMissingColumnError(updateErr)) {
          const minimalPatch: Record<string, unknown> = {};
          for (const k of [
            'display_name',
            'company',
            'phone',
            'email',
            'linked_building_ids',
            'tags',
          ]) {
            if (k in patch) minimalPatch[k] = patch[k];
          }
          if (Object.keys(minimalPatch).length > 0) {
            const { error: retryErr } = await supabase
              .from('broker_clients')
              .update(minimalPatch)
              .eq('id', existing.id);
            if (retryErr && isMissingColumnError(retryErr)) {
              const corePatch: Record<string, unknown> = {};
              for (const k of ['display_name', 'phone', 'linked_building_ids', 'tags']) {
                if (k in minimalPatch) corePatch[k] = minimalPatch[k];
              }
              if (Object.keys(corePatch).length > 0) {
                await supabase
                  .from('broker_clients')
                  .update(corePatch)
                  .eq('id', existing.id);
              }
            }
          }
        }
      }

      return { id: existing.id ?? null, created: false };
    }

    const fallbackName =
      cleanName ||
      (emailNorm ? emailNorm.split('@')[0] : '') ||
      formattedPhone ||
      '잠재 고객';
    const clientRole = params.clientRole || 'buyer';
    const clientType = clientRole === 'seller' ? 'seller' : 'buyer';

    const fullPayload: Record<string, unknown> = {
      broker_id: brokerUuid,
      client_type: clientType,
      client_role: clientRole,
      display_name: fallbackName,
      company: cleanCompany || null,
      phone: formattedPhone || null,
      email: emailNorm || null,
      tier: 'normal',
      is_vip: false,
      tags: sourceTag ? [sourceTag] : [],
      preferred_regions: cleanRegions,
      linked_building_ids: validBuildingUuid ? [validBuildingUuid] : [],
      building_id: validBuildingUuid,
      building_title: cleanBuildingTitle || null,
      consent_status: params.consentConfirmed ? 'confirmed' : 'unconfirmed',
      ...(params.consentConfirmed ? { consent_source: sourceTag || 'newsletter' } : {}),
    };

    const insertRes = await supabase
      .from('broker_clients')
      .insert(fullPayload)
      .select('id')
      .single();

    if (!insertRes?.error) {
      return { id: insertRes?.data?.id ?? null, created: true };
    }

    if (isMissingColumnError(insertRes.error)) {
      const minimalPayload: Record<string, unknown> = {
        broker_id: brokerUuid,
        client_type: clientType,
        display_name: fallbackName,
        phone: formattedPhone || null,
        tier: 'normal',
        tags: sourceTag ? [sourceTag] : [],
        linked_building_ids: validBuildingUuid ? [validBuildingUuid] : [],
      };
      const retryRes = await supabase
        .from('broker_clients')
        .insert(minimalPayload)
        .select('id')
        .single();
      if (!retryRes?.error) {
        return { id: retryRes?.data?.id ?? null, created: true };
      }
      log.warn('upsert_broker_client_insert_retry_failed', {
        code: retryRes.error?.code || 'unknown',
      });
      return null;
    }

    log.warn('upsert_broker_client_insert_failed', {
      code: insertRes.error?.code || 'unknown',
    });
    return null;
  } catch (err) {
    log.warn('upsert_broker_client_unexpected_error', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    return null;
  }
}
