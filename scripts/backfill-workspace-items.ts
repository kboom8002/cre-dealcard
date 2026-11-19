/**
 * Wave 1 (WP 1-G): Idempotent backfill from `activity_events` into `public.workspace_items`.
 *
 * Safe by default: runs in `--dry-run` mode unless BOTH `--apply` CLI flag AND
 * `CONFIRM_WORKSPACE_BACKFILL=1` env var are explicitly provided.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-workspace-items.ts --dry-run --out <report.json>
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
// Relative, dependency-free imports (no server-only modules / path aliases) so the
// script builds snapshots through the same sanitizer + content gate as the live app.
import { buildSanitizedDealCardPublicSnapshot } from '../src/lib/deal-card/public-snapshot';
import { evaluateDealCardPublishContent } from '../src/lib/deal-card/publish-content-gate';
import {
  validateBrokerStatutoryFields,
  type BrokerStatutoryInput,
} from '../src/lib/legal/broker-statutory-disclosure';
import { buildSanitizedImPublicSnapshot } from '../src/lib/workspace/summary/patch-upsert-im';

const DEMO_SEED_LEGACY_IDS = new Set([
  'bld-01',
  'bld-02',
  'bld-03',
  'im-doc-01',
  'im-doc-02',
  'im-doc-03',
]);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RELEVANT_EVENTS = [
  'dealcard_upserted',
  'dealcard_sent',
  'dealcard_restored',
  'dealcard_deleted',
  'im_upserted',
  'im_deleted',
  'im_restored',
  'link_revoked',
  'link_restored',
  'correction_notice_published',
  'correction_notice_cleared',
];

type UnknownRecord = Record<string, unknown>;

interface BackfillCandidate {
  key: string;
  id: string;
  owner_id: string;
  kind: 'dealcard' | 'im';
  legacy_id: string | null;
  building_id: string | null;
  status: 'draft' | 'published' | 'sent' | 'revoked' | 'archived';
  title: string;
  address: string;
  price_band: string | null;
  draft_payload: UnknownRecord;
  published_snapshot: UnknownRecord | null;
  correction_notice: { message: string; updatedAt: string } | null;
  published_at: string | null;
  revoked_at: string | null;
  deleted_at: string | null;
  updated_at: string;
  sourceEventCount: number;
}

function parseCliArgs(argv: string[]) {
  let apply = false;
  let outPath: string | null = null;
  let chunkSize = 500;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') apply = true;
    else if (arg === '--dry-run') apply = false;
    else if (arg.startsWith('--out=')) outPath = arg.slice(6).trim();
    else if (arg === '--out' && argv[i + 1]) {
      outPath = argv[i + 1].trim();
      i += 1;
    } else if (arg.startsWith('--chunk-size=')) {
      const n = Number.parseInt(arg.slice(13), 10);
      if (Number.isFinite(n) && n >= 50 && n <= 2000) chunkSize = n;
    }
  }
  return { apply, outPath, chunkSize };
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_REGEX.test(v.trim());
}

function deterministicBackfillUuid(kind: string, actorId: string, refId: string): string {
  const hash = crypto.createHash('sha256').update(`credeal:ws:${kind}:${actorId}:${refId}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x40;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function resolveKind(eventType: string): 'dealcard' | 'im' | 'governance' {
  if (eventType.startsWith('dealcard_')) return 'dealcard';
  if (eventType.startsWith('im_')) return 'im';
  return 'governance';
}

function resolveEntityKeyId(ev: UnknownRecord): string {
  const meta = (ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}) as UnknownRecord;
  const imItem = (meta.im_item && typeof meta.im_item === 'object' ? meta.im_item : {}) as UnknownRecord;
  return String(
    meta.building_id ||
      meta.im_id ||
      imItem.buildingId ||
      imItem.id ||
      meta.dealcard_id ||
      ev?.entity_id ||
      ''
  ).trim();
}

function createBackfillClient(url: string, key: string) {
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Last known DealCard card4 for a candidate (draft_payload.card4, live repository shape). */
function lastDealCardPayload(prev: BackfillCandidate | undefined): UnknownRecord | null {
  const card4 = prev?.draft_payload?.card4;
  return card4 && typeof card4 === 'object' ? (card4 as UnknownRecord) : null;
}

function firstNonEmptyStr(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function hasPositiveImPrice(payload: UnknownRecord): boolean {
  const ssot =
    payload.ssot_summary && typeof payload.ssot_summary === 'object'
      ? (payload.ssot_summary as UnknownRecord)
      : {};
  const basicFacts =
    payload.basicImDocument &&
    typeof payload.basicImDocument === 'object' &&
    (payload.basicImDocument as UnknownRecord).facts &&
    typeof (payload.basicImDocument as UnknownRecord).facts === 'object'
      ? ((payload.basicImDocument as UnknownRecord).facts as UnknownRecord)
      : {};
  const basicTx =
    basicFacts.transaction && typeof basicFacts.transaction === 'object'
      ? (basicFacts.transaction as UnknownRecord)
      : {};
  const numericCandidates = [
    payload.askingPriceManwon,
    ssot.asking_price_manwon,
    ssot.asking_price,
    basicTx.askingPriceManwon,
    basicTx.askingPriceKrw,
  ];
  for (const v of numericCandidates) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return true;
    if (typeof v === 'string') {
      const cleaned = Number(v.replace(/[,억원만\s]/g, ''));
      if (Number.isFinite(cleaned) && cleaned > 0) return true;
    }
  }
  const band = firstNonEmptyStr(payload.priceBand, payload.price_band, ssot.price_band);
  if (band && /\d/.test(band)) return true;
  return false;
}

function evaluateImBackfillPublishGate(
  payload: UnknownRecord,
  meta: UnknownRecord,
  dbStatutory: BrokerStatutoryInput | undefined,
): { ok: true; snapshot: UnknownRecord } | { ok: false; code: string } {
  const ssot =
    payload.ssot_summary && typeof payload.ssot_summary === 'object'
      ? (payload.ssot_summary as UnknownRecord)
      : {};
  const titleVal = firstNonEmptyStr(
    payload.title,
    payload.buildingName,
    payload.heroTitle,
    payload.headline,
    ssot.building_name,
  );
  const addrVal = firstNonEmptyStr(
    payload.address,
    payload.resolved_address,
    payload.roadAddress,
    payload.jibunAddress,
    payload.region,
    ssot.address,
    ssot.road_address,
    ssot.jibun_address,
  );
  if (!titleVal || !addrVal || !hasPositiveImPrice(payload)) {
    return { ok: false, code: 'IM_CORE_FIELDS_INCOMPLETE' };
  }

  const evBroker =
    (meta.broker_profile && typeof meta.broker_profile === 'object'
      ? (meta.broker_profile as UnknownRecord)
      : null) ||
    (payload.brokerProfile && typeof payload.brokerProfile === 'object'
      ? (payload.brokerProfile as UnknownRecord)
      : null) ||
    (payload.broker_contact && typeof payload.broker_contact === 'object'
      ? (payload.broker_contact as UnknownRecord)
      : null) ||
    {};

  const mergedStatutory: BrokerStatutoryInput = {
    company: firstNonEmptyStr(
      dbStatutory?.company,
      dbStatutory?.office_name,
      evBroker.company,
      evBroker.officeName,
      evBroker.office_name,
      evBroker.brokerageName,
      payload.brokerageName,
    ),
    office_address: firstNonEmptyStr(
      dbStatutory?.office_address,
      evBroker.office_address,
      evBroker.officeAddress,
      payload.officeAddress,
      payload.office_address,
    ),
    phone: firstNonEmptyStr(
      dbStatutory?.phone,
      evBroker.phone,
      evBroker.brokerPhone,
      payload.brokerPhone,
    ),
    office_reg_number: firstNonEmptyStr(
      dbStatutory?.office_reg_number,
      dbStatutory?.registration_no,
      evBroker.office_reg_number,
      evBroker.officeRegNumber,
      evBroker.registration_no,
      evBroker.registrationNo,
      payload.brokerRegNo,
      payload.registrationNo,
    ),
    representative_name: firstNonEmptyStr(
      dbStatutory?.representative_name,
      dbStatutory?.display_name,
      evBroker.representative_name,
      evBroker.representativeName,
      evBroker.display_name,
      evBroker.displayName,
      evBroker.brokerName,
      evBroker.name,
      payload.brokerName,
    ),
    display_name: firstNonEmptyStr(
      dbStatutory?.display_name,
      evBroker.display_name,
      evBroker.displayName,
      evBroker.brokerName,
      payload.brokerName,
    ),
  };

  const statutoryRes = validateBrokerStatutoryFields(mergedStatutory);
  if (!statutoryRes.ok || !statutoryRes.completeness.isComplete) {
    return { ok: false, code: 'STATUTORY_DISCLOSURE_INCOMPLETE' };
  }

  return { ok: true, snapshot: buildSanitizedImPublicSnapshot(payload) };
}

type BackfillSupabase = ReturnType<typeof createBackfillClient>;

export async function runBackfill(options?: {
  apply?: boolean;
  chunkSize?: number;
  supabaseOverride?: BackfillSupabase;
}) {
  const applyRequested = Boolean(options?.apply);
  const confirmed = process.env.CONFIRM_WORKSPACE_BACKFILL === '1';
  if (applyRequested && !confirmed) {
    throw new Error('Refusing --apply without CONFIRM_WORKSPACE_BACKFILL=1 (Decision D2 guardrail).');
  }
  const chunkSize = options?.chunkSize ?? 500;

  let supabase = options?.supabaseOverride;
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    }
    supabase = createBackfillClient(url, key);
  }

  const events: Array<{
    id?: string;
    actor_id?: string | null;
    entity_id?: string | null;
    event_type?: string | null;
    metadata?: unknown;
    created_at?: string | null;
  }> = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('activity_events')
      .select('id, actor_id, entity_id, event_type, metadata, created_at')
      .in('event_type', RELEVANT_EVENTS)
      .order('created_at', { ascending: true })
      .range(offset, offset + chunkSize - 1);
    if (error) {
      throw new Error(`Failed reading activity_events at offset ${offset}: ${error.message}`);
    }
    const batch = Array.isArray(data) ? data : [];
    events.push(...batch);
    if (batch.length < chunkSize) break;
    offset += chunkSize;
  }

  const candidateMap = new Map<string, BackfillCandidate>();
  const lastPublishedPayloadMap = new Map<string, UnknownRecord>();
  const gateRejections: Array<{ key: string; eventType: string; code: string }> = [];
  const ownersByLegacyKey = new Map<string, Set<string>>();
  const skippedNoActorOrId: Array<{ eventId: string; eventType: string; reason: string }> = [];
  const governanceByBuilding = new Map<
    string,
    { revoked: boolean; revokedAt: string | null; correctionNotice: { message: string; updatedAt: string } | null }
  >();

  // Pre-fetch statutory broker profiles for actors appearing in IM events so explicitPublished IMs
  // are gated identically to DealCard backfill.
  const imActorIds = Array.from(
    new Set(
      events
        .filter((ev) => resolveKind(String(ev.event_type || '')) === 'im' && isUuid(ev.actor_id))
        .map((ev) => String(ev.actor_id).trim()),
    ),
  );
  const imStatutoryByActor = new Map<string, BrokerStatutoryInput>();
  if (imActorIds.length > 0) {
    for (let i = 0; i < imActorIds.length; i += 200) {
      const slice = imActorIds.slice(i, i + 200);
      try {
        const { data: profRows } = await supabase
          .from('profiles')
          .select('id, display_name, company, phone')
          .in('id', slice);
        for (const p of (profRows || []) as Array<Record<string, unknown>>) {
          const pid = p?.id ? String(p.id) : '';
          if (!pid) continue;
          const prevStat = imStatutoryByActor.get(pid) || {};
          imStatutoryByActor.set(pid, {
            ...prevStat,
            display_name: firstNonEmptyStr(p.display_name, prevStat.display_name),
            company: firstNonEmptyStr(p.company, prevStat.company),
            phone: firstNonEmptyStr(p.phone, prevStat.phone),
          });
        }
      } catch {
        // non-blocking
      }
      try {
        let bpRes: {
          data: Array<Record<string, unknown>> | null;
          error: { code?: string; message?: string } | null;
        } = await supabase
          .from('broker_profiles')
          .select('user_id, office_address, office_reg_number, representative_name, card_name')
          .in('user_id', slice);
        if (bpRes?.error && (bpRes.error.code === '42703' || bpRes.error.code === 'PGRST204')) {
          bpRes = await supabase
            .from('broker_profiles')
            .select('user_id, office_reg_number, card_name')
            .in('user_id', slice);
        }
        for (const bp of bpRes?.data || []) {
          const uid = bp?.user_id ? String(bp.user_id) : '';
          if (!uid) continue;
          const prevStat = imStatutoryByActor.get(uid) || {};
          imStatutoryByActor.set(uid, {
            ...prevStat,
            office_address: firstNonEmptyStr(bp.office_address, prevStat.office_address),
            office_reg_number: firstNonEmptyStr(bp.office_reg_number, prevStat.office_reg_number),
            representative_name: firstNonEmptyStr(
              bp.representative_name,
              bp.card_name,
              prevStat.representative_name,
              prevStat.display_name,
            ),
          });
        }
      } catch {
        // non-blocking
      }
    }
  }

  for (const ev of events) {
    const evType = String(ev.event_type || '');
    const actorId = ev.actor_id ? String(ev.actor_id).trim() : '';
    const refId = resolveEntityKeyId(ev as UnknownRecord);
    const meta = (ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}) as Record<string, UnknownRecord | unknown>;
    const evTime = String(ev.created_at || new Date().toISOString());

    if (!refId) {
      skippedNoActorOrId.push({ eventId: String(ev.id || ''), eventType: evType, reason: 'missing_target_id' });
      continue;
    }

    const category = resolveKind(evType);
    if (category === 'governance') {
      const gov = governanceByBuilding.get(refId) || {
        revoked: false,
        revokedAt: null,
        correctionNotice: null,
      };
      if (evType === 'link_revoked') {
        gov.revoked = true;
        gov.revokedAt = String(meta.revoked_at || evTime);
      } else if (evType === 'link_restored') {
        gov.revoked = false;
        gov.revokedAt = null;
      } else if (evType === 'correction_notice_published' && meta.message) {
        gov.correctionNotice = { message: String(meta.message), updatedAt: evTime };
      } else if (evType === 'correction_notice_cleared') {
        gov.correctionNotice = null;
      }
      governanceByBuilding.set(refId, gov);
      continue;
    }

    if (!isUuid(actorId)) {
      skippedNoActorOrId.push({ eventId: String(ev.id || ''), eventType: evType, reason: 'non_uuid_actor' });
      continue;
    }

    const legacyOwnershipKey = `${category}::${refId}`;
    const ownerSet = ownersByLegacyKey.get(legacyOwnershipKey) || new Set<string>();
    ownerSet.add(actorId);
    ownersByLegacyKey.set(legacyOwnershipKey, ownerSet);

    const mapKey = `${category}::${actorId}::${refId}`;
    const prev = candidateMap.get(mapKey);
    const isUuidRef = isUuid(refId);
    const metaCard4 =
      meta.card4 && typeof meta.card4 === 'object' ? (meta.card4 as UnknownRecord) : null;
    const rawPayload =
      category === 'dealcard'
        ? metaCard4 || meta.dealcard || null
        : meta.im_item || meta;
    const eventPayload: UnknownRecord | null =
      rawPayload && typeof rawPayload === 'object' ? (rawPayload as UnknownRecord) : null;
    // WP-7.3C P1-4: lifecycle events without a card4 (e.g. dealcard_sent / dealcard_deleted
    // from the publish routes carry only ids) must not overwrite the known card payload.
    const payloadObj: UnknownRecord =
      eventPayload ||
      (category === 'dealcard' ? lastDealCardPayload(prev) : null) ||
      (category === 'im' ? (meta as UnknownRecord) : {});
    const title = String(
      payloadObj.headline || payloadObj.title || payloadObj.buildingName || prev?.title || ''
    );
    const address = String(payloadObj.address || payloadObj.region || prev?.address || '');
    const priceBand =
      typeof (payloadObj.priceBand || payloadObj.price_band) === 'string'
        ? String(payloadObj.priceBand || payloadObj.price_band)
        : prev?.price_band ?? null;

    let nextStatus: BackfillCandidate['status'] = prev?.status || 'draft';
    let deletedAt = prev?.deleted_at ?? null;
    let publishedAt = prev?.published_at ?? null;
    let publishedSnapshot: UnknownRecord | null = prev?.published_snapshot ?? null;

    // WP-7.3C P1-4: DealCard snapshots are only ever built through the shared sanitizer
    // AND only when the card passes the same content gate as the live publish paths.
    const buildGatedDealCardSnapshot = (card4: UnknownRecord): UnknownRecord | null => {
      const gate = evaluateDealCardPublishContent(card4 as Parameters<typeof evaluateDealCardPublishContent>[0]);
      if (!gate.ok) {
        gateRejections.push({ key: mapKey, eventType: evType, code: gate.code });
        return null;
      }
      return buildSanitizedDealCardPublicSnapshot({ card4 });
    };

    if (evType === 'dealcard_deleted' || evType === 'im_deleted') {
      nextStatus = 'archived';
      deletedAt = evTime;
    } else if (evType === 'dealcard_sent') {
      const sentSnapshot = Object.keys(payloadObj).length > 0 ? buildGatedDealCardSnapshot(payloadObj) : null;
      if (sentSnapshot) {
        nextStatus = 'sent';
        deletedAt = null;
        publishedAt = publishedAt || evTime;
        publishedSnapshot = sentSnapshot;
      } else if (!publishedSnapshot) {
        // Explicit send but nothing publishable (no card4 / gate failure) → keep as draft.
        nextStatus = 'draft';
        deletedAt = null;
      } else {
        nextStatus = 'sent';
        deletedAt = null;
      }
    } else if (evType === 'dealcard_restored' || evType === 'im_restored') {
      nextStatus = publishedSnapshot ? 'published' : 'draft';
      deletedAt = null;
    } else {
      const explicitDraft =
        meta.status === 'draft' ||
        payloadObj.status === 'draft' ||
        payloadObj.hasUnpublishedEdits === true ||
        meta.hasUnpublishedEdits === true;
      const explicitPublished =
        !explicitDraft &&
        (meta.status === 'published' || payloadObj.status === 'published' || meta.published === true);
      const explicitSent = !explicitDraft && (meta.status === 'sent' || payloadObj.status === 'sent');
      const priorLiveStatus: BackfillCandidate['status'] | null =
        prev?.status === 'sent' ? 'sent' : prev?.status === 'published' ? 'published' : null;
      const lastPublishedPayload = lastPublishedPayloadMap.get(mapKey) ?? null;

      if (explicitSent) {
        nextStatus = 'sent';
      } else if (explicitPublished) {
        nextStatus = 'published';
      } else if (explicitDraft) {
        if (category === 'im' && priorLiveStatus === 'published' && lastPublishedPayload) {
          nextStatus = 'published';
          publishedSnapshot = buildSanitizedImPublicSnapshot(lastPublishedPayload);
        } else if (priorLiveStatus && publishedSnapshot) {
          nextStatus = priorLiveStatus;
        } else {
          nextStatus = 'draft';
        }
      } else if (priorLiveStatus) {
        nextStatus = priorLiveStatus;
      } else {
        // WP-7.3C P1-4: a plain upsert (draft save) never implies publication.
        nextStatus = 'draft';
      }
      deletedAt = null;
      if ((nextStatus === 'published' || nextStatus === 'sent') && !explicitDraft) {
        if (category === 'dealcard') {
          const gatedSnapshot = eventPayload ? buildGatedDealCardSnapshot(payloadObj) : null;
          if (gatedSnapshot) {
            publishedAt = publishedAt || evTime;
            publishedSnapshot = gatedSnapshot;
          } else if (!publishedSnapshot) {
            nextStatus = 'draft';
          }
          // else: keep the last gated snapshot (the live PATCH would have rejected this edit).
        } else {
          const imGate = evaluateImBackfillPublishGate(
            payloadObj,
            meta as UnknownRecord,
            imStatutoryByActor.get(actorId),
          );
          if (imGate.ok) {
            publishedAt = publishedAt || evTime;
            lastPublishedPayloadMap.set(mapKey, payloadObj);
            publishedSnapshot = imGate.snapshot;
          } else {
            gateRejections.push({ key: mapKey, eventType: evType, code: imGate.code });
            if (lastPublishedPayload) {
              publishedSnapshot = buildSanitizedImPublicSnapshot(lastPublishedPayload);
            } else if (!publishedSnapshot) {
              nextStatus = 'draft';
            }
          }
        }
      }
    }

    candidateMap.set(mapKey, {
      key: mapKey,
      id: prev?.id || deterministicBackfillUuid(category, actorId, refId),
      owner_id: actorId,
      kind: category,
      legacy_id: isUuidRef ? null : refId,
      building_id: isUuidRef ? refId : isUuid(meta.building_id) ? String(meta.building_id) : null,
      status: nextStatus,
      title,
      address,
      price_band: priceBand,
      // Live repository shape: DealCard draft_payload = { card4, ... }
      draft_payload:
        category === 'dealcard'
          ? eventPayload
            ? {
                ...(prev?.draft_payload || {}),
                card4: eventPayload,
                ...(evType === 'dealcard_upserted' &&
                Boolean(meta.has_unpublished_edits || meta.hasUnpublishedEdits) &&
                (nextStatus === 'sent' || nextStatus === 'published')
                  ? { hasUnpublishedEdits: true }
                  : {}),
              }
            : prev?.draft_payload || {}
          : payloadObj,
      published_snapshot: publishedSnapshot,
      correction_notice: prev?.correction_notice ?? null,
      published_at: publishedAt,
      revoked_at: prev?.revoked_at ?? null,
      deleted_at: deletedAt,
      updated_at: evTime,
      sourceEventCount: (prev?.sourceEventCount ?? 0) + 1,
    });
  }

  // Apply building-level governance overlay
  const conflicts: Array<{ key: string; owners: string[] }> = [];
  const sharedDemoSeeds: Array<{ key: string; owners: string[] }> = [];
  for (const [k, ownerSet] of ownersByLegacyKey.entries()) {
    if (ownerSet.size > 1) {
      const refId = k.split('::')[1] || '';
      if (DEMO_SEED_LEGACY_IDS.has(refId)) {
        sharedDemoSeeds.push({ key: k, owners: Array.from(ownerSet) });
      } else {
        conflicts.push({ key: k, owners: Array.from(ownerSet) });
      }
    }
  }

  for (const cand of candidateMap.values()) {
    const govKey = cand.legacy_id || cand.building_id || '';
    const gov = govKey ? governanceByBuilding.get(govKey) : undefined;
    if (gov) {
      if (gov.revoked && cand.status !== 'archived') {
        cand.status = 'revoked';
        cand.revoked_at = gov.revokedAt;
      }
      cand.correction_notice = gov.correctionNotice;
    }
  }

  const allCandidates = Array.from(candidateMap.values());
  const actorIds = Array.from(new Set(allCandidates.map((c) => c.owner_id)));
  const validProfileIds = new Set<string>();
  for (let i = 0; i < actorIds.length; i += 200) {
    const slice = actorIds.slice(i, i + 200);
    if (slice.length === 0) continue;
    const { data: profs } = await supabase.from('profiles').select('id').in('id', slice);
    for (const p of profs || []) {
      if (p?.id) validProfileIds.add(String(p.id));
    }
  }

  const validCandidates = allCandidates.filter((c) => validProfileIds.has(c.owner_id));
  const orphanActorCount = allCandidates.length - validCandidates.length;

  // Verify foreign keys on building_id against building_ssot_lite so orphaned UUID refs become legacy_id
  const candidateBuildingIds = Array.from(
    new Set(validCandidates.map((c) => c.building_id).filter((id): id is string => Boolean(id)))
  );
  const existingBuildingIds = new Set<string>();
  for (let i = 0; i < candidateBuildingIds.length; i += 200) {
    const slice = candidateBuildingIds.slice(i, i + 200);
    if (slice.length === 0) continue;
    const { data: bRows } = await supabase.from('building_ssot_lite').select('id').in('id', slice);
    for (const b of bRows || []) {
      if (b?.id) existingBuildingIds.add(String(b.id));
    }
  }
  let orphanBuildingRefCount = 0;
  for (const cand of validCandidates) {
    if (cand.building_id && !existingBuildingIds.has(cand.building_id)) {
      if (!cand.legacy_id) cand.legacy_id = cand.building_id;
      cand.building_id = null;
      orphanBuildingRefCount += 1;
    }
  }

  let workspaceTableAvailable = true;
  let existingCount = 0;
  const existingKeys = new Set<string>();
  // WP-7.3C P2: page through ALL existing rows (a single .limit(10000) read could miss
  // rows and let --apply overwrite live, gated workspace_items).
  for (let wsOffset = 0; ; wsOffset += 1000) {
    const { data: existingRows, error: wsErr } = await supabase
      .from('workspace_items')
      .select('id, owner_id, kind, legacy_id, building_id')
      .order('id', { ascending: true })
      .range(wsOffset, wsOffset + 999);
    if (wsErr) {
      workspaceTableAvailable = false;
      break;
    }
    const rows = existingRows || [];
    for (const row of rows) {
      existingCount += 1;
      const ref = row.legacy_id || row.building_id || row.id;
      existingKeys.add(`${row.kind}::${row.owner_id}::${ref}`);
      existingKeys.add(`id::${row.id}`);
    }
    if (rows.length < 1000) break;
  }

  const conflictLegacyKeys = new Set(conflicts.map((c) => c.key));
  const conflictSkipped = validCandidates.filter((c) =>
    conflictLegacyKeys.has(`${c.kind}::${c.legacy_id || c.building_id || ''}`)
  );
  const toInsertOrUpdate = validCandidates.filter(
    (c) =>
      !existingKeys.has(c.key) &&
      !existingKeys.has(`id::${c.id}`) &&
      !conflictLegacyKeys.has(`${c.kind}::${c.legacy_id || c.building_id || ''}`)
  );
  let appliedRows = 0;
  if (applyRequested && confirmed) {
    if (!workspaceTableAvailable) {
      throw new Error('Cannot --apply: public.workspace_items table is not available yet.');
    }
    // WP-7.3C P2: write ONLY the computed pending set — never every candidate.
    for (let i = 0; i < toInsertOrUpdate.length; i += 100) {
      const batch = toInsertOrUpdate.slice(i, i + 100).map((c) => ({
        id: c.id,
        owner_id: c.owner_id,
        kind: c.kind,
        legacy_id: c.legacy_id,
        building_id: c.building_id,
        status: c.status,
        title: c.title,
        address: c.address,
        price_band: c.price_band,
        draft_payload: c.draft_payload,
        published_snapshot: c.published_snapshot,
        correction_notice: c.correction_notice,
        published_at: c.published_at,
        revoked_at: c.revoked_at,
        deleted_at: c.deleted_at,
        updated_at: c.updated_at,
      }));
      const { error: upErr } = await supabase.from('workspace_items').upsert(batch, { onConflict: 'id' });
      if (upErr) {
        throw new Error(`workspace_items upsert failed at batch ${i}: ${upErr.message}`);
      }
      appliedRows += batch.length;
    }
  }

  return {
    mode: applyRequested ? 'apply' : 'dry-run',
    generatedAt: new Date().toISOString(),
    scannedEvents: events.length,
    totalCandidates: allCandidates.length,
    validProfileCandidates: validCandidates.length,
    orphanActorCount,
    orphanBuildingRefCount,
    skippedEventCount: skippedNoActorOrId.length,
    conflictCount: conflicts.length,
    conflicts,
    sharedDemoSeedCount: sharedDemoSeeds.length,
    sharedDemoSeeds,
    workspaceTableAvailable,
    existingWorkspaceRows: existingCount,
    pendingBackfillCount: toInsertOrUpdate.length,
    conflictSkippedCount: conflictSkipped.length,
    gateRejectionCount: gateRejections.length,
    gateRejections: gateRejections.slice(0, 200),
    byStatus: {
      draft: validCandidates.filter((c) => c.status === 'draft').length,
      published: validCandidates.filter((c) => c.status === 'published').length,
      sent: validCandidates.filter((c) => c.status === 'sent').length,
      revoked: validCandidates.filter((c) => c.status === 'revoked').length,
      archived: validCandidates.filter((c) => c.status === 'archived').length,
    },
    appliedRows,
    byKind: {
      dealcard: validCandidates.filter((c) => c.kind === 'dealcard').length,
      im: validCandidates.filter((c) => c.kind === 'im').length,
    },
    candidates: validCandidates,
  };
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const { apply, outPath, chunkSize } = parseCliArgs(process.argv.slice(2));
  runBackfill({ apply, chunkSize })
    .then((report) => {
      const json = JSON.stringify(report, null, 2);
      if (outPath) {
        fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
        fs.writeFileSync(path.resolve(outPath), json, 'utf8');
      }
      console.log(json);
    })
    .catch((err) => {
      console.error(err?.message || err);
      process.exit(1);
    });
}
