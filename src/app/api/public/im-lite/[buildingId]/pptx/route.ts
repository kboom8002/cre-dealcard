/**
 * GET /api/public/im-lite/[buildingId]/pptx?doc_id=xxx&tier=basic&preset=golden_institutional
 *
 * Mobile IM PPTX 다운로드 (Basic / Pro)
 * Vercel Pro: runtime=nodejs, maxDuration=300
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ReleaseTier } from '@/domain/building/im-core';
import { getServerViewer } from '@/lib/server-viewer';
import { isOwnerOrAdmin } from '@/domain/public-projection/access';
import {
  isImDocStatusPublic,
  PUBLIC_IM_DOC_STATUSES,
  NON_PUBLIC_DOCUMENT_STATUSES,
} from '@/domain/public-projection/visibility';

import {
  allowDealPublicMemoryFallback,
  buildGovernanceUnavailableResponse,
  buildLinkRevokedResponse,
  buildShareTokenRequiredResponse,
  isAllowedPublicDemoIm,
  isDemoSeedDisabledForProd,
  isPreCutoverSchemaError,
  resolveWorkspaceImGuard,
} from '@/lib/im-lite/im-public-guard';
import { verifyShareLinkToken } from '@/lib/security/share-link-tokens';

import { createModuleLogger } from '@/lib/logger';
import { recordFunnelEvent } from '@/lib/observability/funnel-slo';
const log = createModuleLogger('route');

function mergeNonZeroFields(
  baseObj: Record<string, any> | undefined,
  overrideObj: Record<string, any> | undefined
): Record<string, any> {
  const out: Record<string, any> = { ...(baseObj || {}) };
  if (!overrideObj || typeof overrideObj !== 'object') return out;
  for (const [k, v] of Object.entries(overrideObj)) {
    const prev = out[k];
    const hasPrev =
      prev !== undefined &&
      prev !== null &&
      prev !== '' &&
      !(typeof prev === 'number' && prev === 0) &&
      !(Array.isArray(prev) && prev.length === 0);
    const isEmptyOverride =
      v === undefined ||
      v === null ||
      v === '' ||
      (typeof v === 'number' && v === 0) ||
      (Array.isArray(v) && v.length === 0);
    if (hasPrev && isEmptyOverride) {
      continue;
    }
    out[k] = v;
  }
  return out;
}


export const runtime = 'nodejs';
export const maxDuration = 300;  // Vercel Pro — 24p Pro 덱 대응

// W-4: Vercel 서버리스에서 in-memory Map은 인스턴스 간 공유 불가/cold start 리셋됨.
// 향후 Upstash Redis 등 외부 스토어로 전환 권장. 현재는 best-effort.
import { checkRateLimit } from '@/lib/rate-limiter';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  const startedAt = Date.now();
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  const rateLimit = process.env.NODE_ENV === 'development' ? 1000 : 60;
  const isAllowed = await checkRateLimit(ip, 'rate_limit', rateLimit, 3600 * 1000);
  if (!isAllowed) {
    return NextResponse.json({
      error: 'Rate limit exceeded',
      reason: 'PPTX 다운로드 요청이 일시적으로 많습니다.',
      suggestion: '약 1분 뒤에 다시 다운로드 버튼을 눌러주세요.',
    }, { status: 429 });
  }

  const { buildingId } = await params;
  const searchParams = req.nextUrl.searchParams;
  const docId = searchParams.get('doc_id') || searchParams.get('docId');
  const token = searchParams.get('token')?.trim() || null;
  const requestedTierParam = searchParams.get('tier');
  const presetParam = searchParams.get('preset');

  if (isDemoSeedDisabledForProd(buildingId)) {
    return NextResponse.json({ error: 'Building not found' }, { status: 404 });
  }

  if (token) {
    const tokenCheck = await verifyShareLinkToken({ token, buildingId });
    if (!tokenCheck.valid) {
      if (tokenCheck.reason === 'lookup_failed') {
        return buildGovernanceUnavailableResponse();
      }
      return buildLinkRevokedResponse(403);
    }
  }

  const memoryFallbackAllowed = allowDealPublicMemoryFallback();
  const { getQuickImRecord, resolveOrSynthesizeQuickImRecord, isUuid, getInboxState } = await import('@/lib/im-lite/quick-generate-store');
  const { isBuildingShareLinkRevoked } = await import('@/lib/security/share-link-tokens');
  const memRec = memoryFallbackAllowed
    ? (docId ? getQuickImRecord(docId) : undefined) || getQuickImRecord(buildingId)
    : undefined;

  // Create Supabase client with sanitized env values (defends against trailing \r\n on serverless)
  const { env, getServerEnv } = await import('@/lib/env');
  const srvEnv = getServerEnv();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    srvEnv.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  let viewer: any = null;
  try {
    viewer = await getServerViewer();
  } catch {
    viewer = null;
  }

  const wsGuard = await resolveWorkspaceImGuard(supabase, buildingId);
  if (wsGuard.governanceUnavailable) {
    return buildGovernanceUnavailableResponse();
  }
  if (wsGuard.isDeleted) {
    return NextResponse.json({ error: 'IM document has been deleted' }, { status: 404 });
  }
  if (wsGuard.itemRevoked && !isOwnerOrAdmin(viewer, wsGuard.ownerId)) {
    return buildLinkRevokedResponse(403);
  }
  if (wsGuard.isDraft && !wsGuard.snapshot && !isOwnerOrAdmin(viewer, wsGuard.ownerId)) {
    return NextResponse.json({ error: 'Valid IM document not found' }, { status: 404 });
  }

  let latestDeletedTime = 0;
  let dbRevoked: boolean | undefined;
  let dbRevokeTime = 0;
  const queryScopedEvents = async (
    eventTypes: string[],
    extraDocId?: string | null
  ): Promise<{ rows: any[]; error: any }> => {
    const safeIds = [buildingId, extraDocId]
      .map((v) => String(v || '').trim())
      .filter((v) => /^[A-Za-z0-9_.:-]+$/.test(v));
    const buildOr = (withCol: boolean) => {
      const parts: string[] = [];
      for (const id of safeIds) {
        if (withCol) parts.push(`building_id.eq.${id}`);
        if (isUuid(id)) parts.push(`entity_id.eq.${id}`);
        parts.push(`metadata->>building_id.eq.${id}`);
      }
      return parts.join(',');
    };

    let q: any = supabase
      .from('activity_events')
      .select('event_type, entity_id, building_id, metadata, created_at')
      .in('event_type', eventTypes);
    if (safeIds.length > 0) {
      if (typeof q?.or === 'function') {
        q = q.or(buildOr(true));
      } else if (typeof q?.eq === 'function') {
        q = q.eq('building_id', buildingId);
      }
    }
    let res = await q.order('created_at', { ascending: false }).limit(50);
    if (
      res?.error &&
      (String(res.error.code || '') === '42703' ||
        String(res.error.code || '') === 'PGRST204' ||
        /column .* does not exist/i.test(String(res.error.message || '')))
    ) {
      let fb: any = supabase
        .from('activity_events')
        .select('event_type, entity_id, metadata, created_at')
        .in('event_type', eventTypes);
      if (safeIds.length > 0 && typeof fb?.or === 'function') {
        const expr = buildOr(false);
        if (expr) fb = fb.or(expr);
      }
      res = await fb.order('created_at', { ascending: false }).limit(50);
    }
    return {
      rows: Array.isArray(res?.data) ? res.data : [],
      error: res?.error ?? null,
    };
  };

  try {
    const [imRes, govRes] = await Promise.all([
      queryScopedEvents(['im_upserted', 'im_deleted', 'im_restored'], docId),
      queryScopedEvents(['link_revoked', 'link_restored']),
    ]);

    if (govRes.error && !isPreCutoverSchemaError(govRes.error)) {
      log.error(
        { code: govRes.error.code, message: govRes.error.message, buildingId },
        '[PPTX] governance revocation lookup failed'
      );
      return buildGovernanceUnavailableResponse();
    }

    const imEvents = imRes.rows;
    const govEvents = govRes.rows;

    if (Array.isArray(imEvents)) {
      for (const ev of imEvents) {
        const meta = (ev?.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}) as Record<string, any>;
        const evBId = String(ev?.building_id || meta.building_id || ev?.entity_id || '');
        const evImId = String(meta.im_id || meta.im_item?.id || '');
        const evItemBid = String(meta.im_item?.buildingId || '');
        if (
          evBId !== buildingId &&
          evImId !== buildingId &&
          evItemBid !== buildingId &&
          (!docId || (evBId !== docId && evImId !== docId))
        ) {
          continue;
        }
        if (ev.event_type === 'im_deleted') {
          latestDeletedTime = Date.parse(ev.created_at || '') || Date.now();
        }
        break;
      }
    }

    if (Array.isArray(govEvents)) {
      for (const row of govEvents) {
        const meta = (row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, any>;
        const evBldId = String(row?.building_id || meta.building_id || row?.entity_id || '').trim();
        if (evBldId !== buildingId) continue;
        if (row.event_type === 'link_revoked') {
          dbRevoked = true;
          dbRevokeTime = Date.parse(String(meta.revoked_at || row.created_at || '')) || 0;
          break;
        }
        if (row.event_type === 'link_restored') {
          dbRevoked = false;
          dbRevokeTime = Date.parse(String(meta.restored_at || row.created_at || '')) || 0;
          break;
        }
      }
    }
  } catch (govEx) {
    if (!isPreCutoverSchemaError(govEx)) {
      log.error({ buildingId, err: govEx }, '[PPTX] governance revocation lookup threw');
      return buildGovernanceUnavailableResponse();
    }
  }

  let buildingRow: any = null;
  let buildingOwnerId: string | null = null;
  const IM_DOC_TYPES = ['mobile_im', 'im_lite', 'im_lite_draft'];
  let dbDoc: any = null;

  if (isUuid(buildingId)) {
    try {
      const { data: bRow } = await supabase
        .from('building_ssot_lite')
        .select('*')
        .eq('id', buildingId)
        .maybeSingle();
      buildingRow = bRow;
      buildingOwnerId = (buildingRow?.owner_id as string | null | undefined) ?? null;

      if (docId) {
        const { data: requested } = await supabase
          .from('document_objects')
          .select('*')
          .eq('building_id', buildingId)
          .in('document_type', IM_DOC_TYPES)
          .eq('id', docId)
          .maybeSingle();
        if (
          requested &&
          (isImDocStatusPublic(requested.status) ||
            isOwnerOrAdmin(viewer, buildingOwnerId, requested.owner_id))
        ) {
          dbDoc = requested;
        }
      }

      if (!dbDoc) {
        const privileged = isOwnerOrAdmin(viewer, buildingOwnerId);
        let latestQuery = supabase
          .from('document_objects')
          .select('*')
          .eq('building_id', buildingId)
          .in('document_type', IM_DOC_TYPES);
        latestQuery = privileged
          ? latestQuery.not('status', 'in', `(${NON_PUBLIC_DOCUMENT_STATUSES.join(',')})`)
          : latestQuery.in('status', [...PUBLIC_IM_DOC_STATUSES]);
        const { data: latest } = await latestQuery
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        dbDoc = latest ?? null;
      }
    } catch {
      // Non-blocking fallback for offline DB
    }
  }

  const prelimPrivileged = isOwnerOrAdmin(
    viewer,
    buildingOwnerId,
    dbDoc?.owner_id ?? wsGuard.ownerId
  );
  const safeMemRec =
    memRec &&
    !prelimPrivileged &&
    ((memRec as any).status === 'draft' || (memRec as any).hasUnpublishedEdits === true)
      ? undefined
      : memRec;
  const quickRec =
    latestDeletedTime > 0
      ? null
      : memoryFallbackAllowed
      ? (await resolveOrSynthesizeQuickImRecord(buildingId, supabase, docId, {
          publishedOnly: !prelimPrivileged,
        })) || safeMemRec
      : null;

  // Check if latest lifecycle event in activity_events is im_deleted and newer than dbDoc?.updated_at
  if (latestDeletedTime > 0) {
    const dbDocUpdatedTime = Date.parse(dbDoc?.updated_at || dbDoc?.created_at || '') || 0;
    if (!dbDoc || latestDeletedTime >= dbDocUpdatedTime) {
      return NextResponse.json({ error: 'IM document has been deleted' }, { status: 404 });
    }
  }

  // Link revocation check
  const inboxRevokedEntry = memoryFallbackAllowed
    ? getInboxState().revokedBuildings?.[buildingId]
    : undefined;
  const localRevoked = memoryFallbackAllowed
    ? Boolean(inboxRevokedEntry?.revoked || isBuildingShareLinkRevoked(buildingId))
    : false;
  const localRevokeTime = inboxRevokedEntry?.revokedAt ? Date.parse(inboxRevokedEntry.revokedAt) || 0 : 0;
  const effectiveRevoked =
    typeof dbRevoked === 'boolean' && (!localRevokeTime || dbRevokeTime >= localRevokeTime)
      ? dbRevoked
      : localRevoked || dbRevoked === true || Boolean(quickRec?.isRevoked) || dbDoc?.body?.is_revoked === true;

  if (effectiveRevoked && !isOwnerOrAdmin(viewer, buildingOwnerId, dbDoc?.owner_id ?? (quickRec as any)?.ownerId ?? wsGuard.ownerId)) {
    return buildLinkRevokedResponse(403);
  }

  let doc: any = null;
  const wsActivePayload =
    wsGuard.snapshot ||
    (wsGuard.item?.draftPayload && isOwnerOrAdmin(viewer, buildingOwnerId, wsGuard.ownerId)
      ? wsGuard.item.draftPayload
      : null);
  const wsDocBody =
    wsActivePayload && typeof wsActivePayload === 'object'
      ? (wsActivePayload.fullDocBody || (Array.isArray(wsActivePayload.sections) ? wsActivePayload : null))
      : null;
  if (dbDoc?.body && quickRec?.fullDocBody) {
    const dbBody = dbDoc.body as Record<string, any>;
    const qrBody = quickRec.fullDocBody as Record<string, any>;
    const dbTime = Date.parse(dbDoc.updated_at || dbBody.updated_at || dbBody.approved_at || dbDoc.created_at || '') || 0;
    const qrTime = Date.parse(quickRec?.updatedAt || quickRec?.createdAt || '') || 0;
    const dbIsNewer = dbTime > 0 && (qrTime === 0 || dbTime > qrTime);
    const primary = dbIsNewer ? dbBody : qrBody;
    const secondary = dbIsNewer ? qrBody : dbBody;

    const mergedTop = mergeNonZeroFields(secondary, primary);
    const mergedSsot = mergeNonZeroFields(secondary.ssot_summary, primary.ssot_summary);
    const mergedHero = mergeNonZeroFields(secondary.heroCard, primary.heroCard);
    const getBasicDocPrice = (bDoc: any) =>
      Number(
        bDoc?.facts?.transaction?.askingPriceKrw ??
          bDoc?.facts?.transaction?.askingPriceManwon ??
          0
      );
    const getBasicDocArea = (bDoc: any) =>
      Number(bDoc?.facts?.building?.totalGrossAreaSqm ?? 0);
    const dbBasicTxPrice = getBasicDocPrice(dbBody.basicImDocument);
    const qrBasicTxPrice = getBasicDocPrice(qrBody.basicImDocument);
    const dbBasicArea = getBasicDocArea(dbBody.basicImDocument);
    const qrBasicArea = getBasicDocArea(qrBody.basicImDocument);
    const resolvedBasicImDocument =
      !dbIsNewer &&
      ((qrBasicTxPrice === 0 && dbBasicTxPrice > 0) ||
        (qrBasicArea === 0 && dbBasicArea > 0))
        ? dbBody.basicImDocument
        : primary.basicImDocument || secondary.basicImDocument;

    const mergedBody: Record<string, any> = {
      ...mergedTop,
      ...(resolvedBasicImDocument ? { basicImDocument: resolvedBasicImDocument } : {}),
      ssot_summary: {
        ...mergedSsot,
        coordinates:
          primary.ssot_summary?.coordinates ||
          secondary.ssot_summary?.coordinates ||
          primary.coordinates ||
          secondary.coordinates,
        pnu:
          primary.ssot_summary?.pnu ||
          secondary.ssot_summary?.pnu ||
          primary.pnu ||
          secondary.pnu ||
          buildingRow?.pnu,
      },
      heroCard: mergedHero,
      enrichment: primary.enrichment || secondary.enrichment,
      coordinates:
        primary.coordinates ||
        secondary.coordinates ||
        primary.ssot_summary?.coordinates ||
        secondary.ssot_summary?.coordinates,
      pnu:
        primary.pnu ||
        secondary.pnu ||
        primary.ssot_summary?.pnu ||
        secondary.ssot_summary?.pnu ||
        buildingRow?.pnu,
      pnus: primary.pnus || secondary.pnus,
      parcels: primary.parcels || secondary.parcels,
      floor_leases:
        Array.isArray(primary.floor_leases) && primary.floor_leases.length > 0
          ? primary.floor_leases
          : Array.isArray(secondary.floor_leases)
          ? secondary.floor_leases
          : [],
      rent_roll:
        Array.isArray(primary.rent_roll) && primary.rent_roll.length > 0
          ? primary.rent_roll
          : Array.isArray(secondary.rent_roll)
          ? secondary.rent_roll
          : [],
      photos_v2:
        Array.isArray(primary.photos_v2) && primary.photos_v2.length > 0
          ? primary.photos_v2
          : Array.isArray(secondary.photos_v2)
          ? secondary.photos_v2
          : [],
      photos:
        Array.isArray(primary.photos) && primary.photos.length > 0
          ? primary.photos
          : Array.isArray(secondary.photos)
          ? secondary.photos
          : [],
      photo_urls:
        Array.isArray(primary.photo_urls) && primary.photo_urls.length > 0
          ? primary.photo_urls
          : Array.isArray(secondary.photo_urls)
          ? secondary.photo_urls
          : [],
      sections:
        Array.isArray(primary.sections) && primary.sections.length > 0
          ? primary.sections
          : Array.isArray(secondary.sections)
          ? secondary.sections
          : [],
      broker_contact: primary.broker_contact || secondary.broker_contact,
    };

    doc = {
      ...dbDoc,
      id: dbIsNewer ? dbDoc.id : (quickRec.documentId || dbDoc.id),
      building_id: buildingId,
      owner_id: dbDoc.owner_id ?? quickRec.ownerId ?? null,
      title: dbIsNewer ? (dbDoc.title || primary.buildingName) : (quickRec.buildingName || primary.buildingName || dbDoc.title),
      status: dbDoc.status || 'published',
      body: mergedBody,
    };
  } else if (quickRec?.fullDocBody) {
    doc = {
      id: quickRec.documentId,
      building_id: quickRec.buildingId,
      owner_id: quickRec.ownerId ?? null,
      title: quickRec.buildingName,
      status: 'published',
      body: { ...quickRec.fullDocBody },
    };
  } else if (dbDoc) {
    doc = dbDoc;
  } else if (wsDocBody && wsGuard.item) {
    doc = {
      id: wsGuard.item.id,
      building_id: wsGuard.item.buildingId || buildingId,
      owner_id: wsGuard.item.ownerId,
      title: wsGuard.item.title,
      status: wsGuard.item.status,
      body: { ...wsDocBody },
    };
  }

  if (!doc?.body || !Array.isArray((doc.body as any).sections) || (doc.body as any).sections.length === 0) {
    return NextResponse.json({ error: 'Valid IM document not found or document has no sections' }, { status: 404 });
  }

  // 소유자·admin 여부 (워터마크 해제 및 Pro 티어 권한)
  const isPrivilegedViewer = isOwnerOrAdmin(
    viewer,
    buildingOwnerId,
    doc.owner_id ?? (quickRec as any)?.ownerId ?? wsGuard.ownerId
  );
  if (doc.body?.is_revoked === true && !isPrivilegedViewer) {
    return buildLinkRevokedResponse(403);
  }
  const isDemoAllowed = isAllowedPublicDemoIm(buildingId) && !wsGuard.item;
  if (!isPrivilegedViewer && !isDemoAllowed && !token) {
    return buildShareTokenRequiredResponse();
  }

  // WP-7.4D P1-2: ignore untrusted ?tier=pro on public im-lite PPTX route unless authorized owner/admin
  const effectiveTier: 'basic' | 'pro' =
    isPrivilegedViewer && (doc.body?.tier === 'pro' || requestedTierParam === 'pro')
      ? 'pro'
      : 'basic';
  if (effectiveTier !== 'pro') {
    doc.body.preset = doc.body.preset || 'credeal_basic';
    doc.body.tier = 'basic';
  }

  // Poison coordinate / PNU guard (Dangsan 11-47 leak) & on-the-fly geocoding
  const rawAddr = String(
    doc.body?.ssot_summary?.address ||
    doc.body?.resolved_address ||
    doc.body?.address ||
    buildingRow?.raw_address ||
    ''
  ).trim();
  let coordLat = Number(doc.body?.coordinates?.lat ?? doc.body?.ssot_summary?.coordinates?.lat ?? buildingRow?.lat ?? 0) || null;
  let coordLng = Number(doc.body?.coordinates?.lng ?? doc.body?.ssot_summary?.coordinates?.lng ?? buildingRow?.lng ?? 0) || null;
  let resolvedPnu = String(doc.body?.ssot_summary?.pnu || doc.body?.pnu || buildingRow?.pnu || '').trim() || null;

  const isDangsanAddr = /당산|양평/.test(rawAddr);
  const isDangsanCoord =
    coordLat != null &&
    coordLng != null &&
    Math.abs(coordLat - 37.5342) < 0.0005 &&
    Math.abs(coordLng - 126.9022) < 0.0005;
  const isDangsanPnu = resolvedPnu === '1156011500100110047';
  if (!isDangsanAddr && (isDangsanCoord || isDangsanPnu)) {
    coordLat = null;
    coordLng = null;
    resolvedPnu = null;
    if (doc.body?.coordinates) delete doc.body.coordinates;
    if (doc.body?.ssot_summary?.coordinates) delete doc.body.ssot_summary.coordinates;
    if (doc.body?.pnu === '1156011500100110047') delete doc.body.pnu;
    if (doc.body?.ssot_summary?.pnu === '1156011500100110047') delete doc.body.ssot_summary.pnu;
    if (doc.body?.enrichment?.cadastralMapImage) delete doc.body.enrichment.cadastralMapImage;
  }

  if ((!coordLat || !coordLng) && rawAddr) {
    try {
      const { resolveAddress } = await import('@/lib/external/address-resolver');
      const geoRes = await Promise.race([
        resolveAddress(rawAddr),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ]);
      if (geoRes) {
        if (geoRes.lat && geoRes.lng) {
          coordLat = geoRes.lat;
          coordLng = geoRes.lng;
        }
        if (!resolvedPnu && geoRes.pnu) {
          resolvedPnu = geoRes.pnu;
        }
      }
    } catch {
      // Non-blocking on-the-fly geocoding
    }
  }

  if (coordLat && coordLng) {
    doc.body.coordinates = { lat: coordLat, lng: coordLng };
    if (doc.body.ssot_summary && typeof doc.body.ssot_summary === 'object') {
      doc.body.ssot_summary.coordinates = { lat: coordLat, lng: coordLng };
    }
  }
  if (resolvedPnu) {
    doc.body.pnu = resolvedPnu;
    if (doc.body.ssot_summary && typeof doc.body.ssot_summary === 'object') {
      doc.body.ssot_summary.pnu = resolvedPnu;
    }
  }

  const building = buildingRow ? {
    ...buildingRow,
    address: rawAddr || buildingRow.raw_address,
    pnu: resolvedPnu,
    lat: coordLat,
    lng: coordLng,
    investment_posture: doc.body?.ssot_summary?.investment_posture || doc.body?.investmentPosture || 'income',
  } : (doc.body?.ssot_summary ? {
    id: buildingId,
    owner_id: doc.owner_id ?? null,
    raw_address: rawAddr,
    address: rawAddr,
    pnu: resolvedPnu,
    lat: coordLat,
    lng: coordLng,
    investment_posture: doc.body.ssot_summary?.investment_posture || doc.body.investmentPosture || 'income',
  } : null);

  // 3. Fetch broker profile (SSoT resolver — 실제 DB 값만, 부재 시 생략, 더미 문자열 필터링)
  const DUMMY_BROKER_STRINGS = new Set([
    '담당 공인중개사',
    '전담 부동산중개법인',
    '크리딜 파트너 중개법인',
    '11560-2023-00412',
    '02-558-7700',
    '-',
  ]);
  const cleanBrokerStr = (val: unknown): string | undefined => {
    if (typeof val !== 'string') return undefined;
    const trimmed = val.trim();
    if (!trimmed || DUMMY_BROKER_STRINGS.has(trimmed)) return undefined;
    return trimmed;
  };

  const ownerId = doc?.broker_id ?? doc?.owner_id ?? building?.owner_id;
  const { fetchBrokerContact, toPptxBrokerInput } = await import('@/domain/broker/broker-contact');
  const rawDbBroker = toPptxBrokerInput(await fetchBrokerContact(supabase, ownerId));
  const quickBrokerContact = quickRec?.fullDocBody?.broker_contact;
  const broker = quickBrokerContact
    ? {
        display_name: cleanBrokerStr(quickBrokerContact.name ?? quickBrokerContact.brokerName) || cleanBrokerStr(rawDbBroker?.display_name),
        representative_name:
          cleanBrokerStr(
            quickBrokerContact.representative_name ??
              quickBrokerContact.representativeName ??
              quickBrokerContact.representative,
          ) || cleanBrokerStr(rawDbBroker?.representative_name),
        company_name: cleanBrokerStr(quickBrokerContact.company ?? quickBrokerContact.brokerageName) || cleanBrokerStr(rawDbBroker?.company_name),
        phone: cleanBrokerStr(quickBrokerContact.phone ?? quickBrokerContact.brokerPhone) || cleanBrokerStr(rawDbBroker?.phone),
        email: cleanBrokerStr(rawDbBroker?.email),
        registration_no: cleanBrokerStr(quickBrokerContact.registration_no ?? quickBrokerContact.registrationNo) || cleanBrokerStr(rawDbBroker?.registration_no),
        office_address:
          cleanBrokerStr(quickBrokerContact.office_address ?? quickBrokerContact.officeAddress) ||
          cleanBrokerStr(rawDbBroker?.office_address),
        specialty: cleanBrokerStr(rawDbBroker?.specialty),
      }
    : rawDbBroker
    ? {
        display_name: cleanBrokerStr(rawDbBroker.display_name),
        representative_name: cleanBrokerStr(rawDbBroker.representative_name),
        company_name: cleanBrokerStr(rawDbBroker.company_name),
        phone: cleanBrokerStr(rawDbBroker.phone),
        email: cleanBrokerStr(rawDbBroker.email),
        registration_no: cleanBrokerStr(rawDbBroker.registration_no),
        office_address: cleanBrokerStr(rawDbBroker.office_address),
        specialty: cleanBrokerStr(rawDbBroker.specialty),
      }
    : null;

  // 4. Import and run renderer
  try {
    const { MobileImPptxRenderer } = await import(
      '@/domain/building/mobile-im/pptx/pptx-renderer'
    );
    const renderer = new MobileImPptxRenderer();

    // IM body에서 posture, grade 등 메타데이터 추출
    const body = doc.body ?? {};

    // ── 데이터 완전성 게이트 ──
    const dataCompleteness = body.dataCompleteness;
    const isDev = process.env.NODE_ENV === 'development';
    // 골디락스: 데이터 완전성 게이트 (D등급 차단은 renderer에서 처리)
    if (dataCompleteness && !dataCompleteness.pptxExportAllowed && !isDev) {
      return NextResponse.json({
        error: 'PPTX 다운로드 불가',
        reason: '건축물대장 등 필수 공공데이터가 조회되지 않았습니다.',
        suggestion: '건물 주소를 확인하고 IM을 재생성해 주세요.',
        dataStatus: dataCompleteness.buildingRegisterSource,
        qualityGrade: dataCompleteness.qualityGrade,
      }, { status: 422 });
    }

    const posture = body.investment_posture
      ?? body.investmentPosture
      ?? body.posture
      ?? body.identity?.investmentPosture
      ?? body.identity?.investment_posture
      ?? body.ssot_summary?.investment_posture
      ?? building?.investment_posture
      ?? 'income';

    // F3 fix: Grade 계산을 뷰어와 동일한 computeDataQualityBadge로 통일
    let grade = body.dataGrade ?? body.dataCompleteness?.qualityGrade ?? body.qualityGrade ?? body.grade;
    if (!grade) {
      try {
        const { computeDataQualityBadge, tierToGrade } = await import(
          '@/domain/building/mobile-im/data-quality-badge'
        );
        const { resolveEnrichment } = await import('@/domain/building/im-core/resolve-enrichment');
        const enriched = resolveEnrichment(body);
        const ssot = body.ssot_summary ?? {};
        const badge = computeDataQualityBadge({
          hasAddress: !!(ssot.address || ssot.raw_address || enriched.meta.address),
          hasPublicData: !!(enriched.buildingRegister || ssot.building_register_source === 'api'),
          hasMonthlyRent: !!(ssot.monthly_rent_total_krw || body.financial?.monthlyRentKrw),
          hasVacancy: ssot.vacancy_pct != null || !!ssot.vacancy_signal,
          hasPhotos: !!(body.photos_v2?.length || body.photos?.length),
          hasAskingPrice: !!(ssot.asking_price_manwon || ssot.price_band),
          hasFloorLeases: !!(body.floor_leases?.length || body.rentRoll?.length),
          hasTotalGrossArea: !!(ssot.total_gross_area_sqm || ssot.size_signal),
          hasLandArea: !!(ssot.land_area_sqm),
        }, posture as any);
        grade = tierToGrade(badge.tier);
      } catch (e) {
        log.error('Grade computation failed', e);
        grade = 'B'; // 계산 실패 시 기본값
      }
    }
    if (grade === 'D') {
      return NextResponse.json({
        error: 'Grade D documents cannot be exported to PPTX [G30]',
        reason: '건물 기본 정보(주소·매매 희망가·임대 조건 중 필수 항목)가 부족하여 슬라이드를 구성할 수 없습니다.',
        suggestion: '[기본 IM 수정·재생성] 버튼을 눌러 건물 주소와 매매 희망가를 입력한 뒤 다시 생성해 주세요.',
        qualityGrade: 'D',
      }, { status: 422 });
    }
    const incomeArchetype = body.incomeArchetype ?? undefined;
    const hasViolation = body.hasViolation ?? body.violationStatus === 'exists';
    const hasJointCollateral = body.hasJointCollateral ?? false;

    // ── IM 타입(Basic/Pro) 결정: 비특권 공개 뷰어는 ?tier=pro 상승 차단 (항상 Basic / fact_om) ──
    const docTier: 'basic' | 'pro' = effectiveTier;
    const isBasicIM = docTier !== 'pro';

    // 시각적 프리셋: 사용자가 선택한 프리셋을 존중하되, Basic IM이면 항상 credeal_basic 시퀀스를 사용
    const visualPreset = presetParam || body.preset || (isBasicIM ? 'credeal_basic' : 'credeal_signature');
    // Basic IM이면 시퀀스 결정용 프리셋은 항상 credeal_basic (시각 테마만 다를 수 있음)
    const resolvedPreset = isBasicIM ? 'credeal_basic' : visualPreset;

    // 브랜드 컬러(Basic 전용): 기본 스킨(credeal_basic) 또는 커스텀 프리셋 UUID 요청일 때만, 소유 중개사의
    // pptx_custom_presets 회사 기본값(또는 지정 프리셋)의 대표색을 팔레트로 파생. 실패/미설정 → 기본 팔레트 (차단 없음).
    let brandAccent: string | undefined;
    let brandLogoUrl: string | undefined;
    let effectiveBroker = broker;
    const bodyBroker = body.broker_contact || body.basicImDocument?.facts?.brokerOffice;
    if (bodyBroker) {
      const bName =
        cleanBrokerStr(bodyBroker.brokerName) ||
        (bodyBroker.company ? cleanBrokerStr(bodyBroker.name) : undefined);
      const bRepName =
        cleanBrokerStr(bodyBroker.representative_name) ||
        cleanBrokerStr(bodyBroker.representativeName) ||
        cleanBrokerStr(bodyBroker.representative);
      const bCompany =
        cleanBrokerStr(bodyBroker.brokerageName) ||
        cleanBrokerStr(bodyBroker.company) ||
        (bodyBroker.representative ? cleanBrokerStr(bodyBroker.name) : undefined);
      const bPhone = cleanBrokerStr(bodyBroker.brokerPhone) || cleanBrokerStr(bodyBroker.phone);
      const bEmail = cleanBrokerStr(bodyBroker.email);
      const bRegNo = cleanBrokerStr(bodyBroker.registrationNo) || cleanBrokerStr(bodyBroker.registration_no);
      const bOfficeAddress =
        cleanBrokerStr(bodyBroker.office_address) ||
        cleanBrokerStr(bodyBroker.officeAddress) ||
        (body.basicImDocument?.facts?.brokerOffice === bodyBroker ? cleanBrokerStr(bodyBroker.address) : undefined);
      if (bName || bRepName || bCompany || bPhone || bEmail || bRegNo || bOfficeAddress) {
        effectiveBroker = {
          display_name: bName || effectiveBroker?.display_name,
          representative_name: bRepName || effectiveBroker?.representative_name,
          company_name: bCompany || effectiveBroker?.company_name,
          phone: bPhone || effectiveBroker?.phone,
          email: bEmail || effectiveBroker?.email,
          registration_no: bRegNo || effectiveBroker?.registration_no,
          office_address: bOfficeAddress || effectiveBroker?.office_address,
          specialty: effectiveBroker?.specialty,
        };
      }
    }
    const isCustomPresetId = /^[0-9a-f-]{36}$/i.test(String(visualPreset));
    if (isBasicIM && (visualPreset === 'credeal_basic' || isCustomPresetId)) {
      const { resolveBrandAccent } = await import('@/domain/building/mobile-im/pptx/brand-skin');
      const brand = await resolveBrandAccent({ supabase: supabase as any, ownerId, presetParam: isCustomPresetId ? String(visualPreset) : null });
      brandAccent = brand?.accent;
      brandLogoUrl = brand?.logoUrl ?? undefined;
      if (brand?.companyName && (!effectiveBroker || !effectiveBroker.company_name)) {
        effectiveBroker = {
          display_name: effectiveBroker?.display_name,
          representative_name: effectiveBroker?.representative_name,
          company_name: brand.companyName,
          phone: effectiveBroker?.phone,
          email: effectiveBroker?.email,
          registration_no: effectiveBroker?.registration_no,
          office_address: effectiveBroker?.office_address,
          specialty: effectiveBroker?.specialty,
        };
      }
    }

    // P0-SEC: watermark=false(워터마크 해제)는 소유자·admin 만. 비소유자는 requester 지정 시 항상 워터마크.
    const watermarkParam = searchParams.get('watermark');
    const shouldWatermark = isPrivilegedViewer
      ? watermarkParam === 'true' || (watermarkParam !== 'false' && Boolean(searchParams.get('requester')))
      : watermarkParam === 'true' || Boolean(searchParams.get('requester'));

    const result = await renderer.render({
      buildingId,
      preset: resolvedPreset,
      visualPreset: isBasicIM ? (isCustomPresetId ? 'credeal_basic' : visualPreset) : undefined,
      brandAccent,
      logoUrl: brandLogoUrl,
      posture,
      grade,
      incomeArchetype,
      hasViolation,
      hasJointCollateral,
      releaseTier: isBasicIM ? 'fact_om' : ((body.releaseTier as ReleaseTier) || 'decision_im'),
      docno: body.docno ?? `IM-${buildingId.substring(0, 6).toUpperCase()}`,
      doc: {
        title: doc.title || body.buildingName || 'Mobile IM',
        body,
        sections: body.sections,
      },
      building: building || undefined,
      broker: effectiveBroker || undefined,
      watermark: shouldWatermark
        ? {
            requesterName: searchParams.get('requester') || 'CREDEAL',
            phoneLast4: searchParams.get('phone4') || '0000',
            timestamp: new Date().toISOString().split('T')[0],
          }
        : undefined,
      provenance: body.provenance ?? {},
      supabase: quickRec?.fullDocBody ? undefined : supabase,
    });

    // 6. Return PPTX (direct=1 또는 quick-generate 메모리 레코드 요청 시 감사 헤더·한글 파일명 보존을 위해 즉시 200 응답 반환)
    const buildingName = doc.title || body.buildingName || building?.address || '투자설명서';
    const safeName =
      buildingName.replace(
        /[^a-zA-Z0-9\u3131-\u318E\u3200-\u321E\uAC00-\uD7A3]/g,
        '_'
      ).replace(/_+/g, '_').replace(/^_|_$/g, '') + `_${effectiveTier === 'pro' ? 'Pro_IM' : 'Basic_IM'}.pptx`;

    if (!quickRec?.fullDocBody && searchParams.get('direct') !== '1') {
      const timestamp = Date.now();
      const filePath = `im-pptx/${buildingId}/${effectiveTier}_${timestamp}.pptx`;

      const { error: uploadError } = await supabase.storage
        .from('Exports')
        .upload(filePath, result.buffer, {
          contentType:
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          upsert: true,
        });

      if (uploadError) {
        log.warn('[PPTX] Storage upload failed, returning direct download:', uploadError);
      } else {
        const { data: signedData } = await supabase.storage
          .from('Exports')
          .createSignedUrl(filePath, 1800, { download: safeName });

        if (signedData?.signedUrl) {
          recordFunnelEvent({
            funnel: 'deal_creation',
            outcome: 'ok',
            latencyMs: Date.now() - startedAt,
            entityId: buildingId,
            meta: { channel: 'pptx_signed_redirect', tier: effectiveTier },
          });
          return NextResponse.redirect(signedData.signedUrl, 302);
        }
      }
    }

    recordFunnelEvent({
      funnel: 'deal_creation',
      outcome: 'ok',
      latencyMs: Date.now() - startedAt,
      entityId: buildingId,
      meta: { channel: 'pptx_direct_download', tier: effectiveTier },
    });

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        'X-Safe-Filename': encodeURIComponent(safeName),
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Slide-Count': String(result.slideCount),
        'X-File-Size': String(result.fileSizeBytes),
        'X-Warnings': encodeURIComponent(JSON.stringify(result.warnings.slice(0, 10))),
        'X-Audit-Violations': String(result.auditReport?.totalViolations ?? 0),
        'X-Audit-Layout': encodeURIComponent(JSON.stringify(result.auditReport?.layoutViolations ?? [])),
        'X-Audit-Standard': encodeURIComponent(JSON.stringify(result.auditReport?.standardViolations ?? [])),
      },
    });
  } catch (err: any) {
    log.error(`[PPTX ${effectiveTier}] Generation failed:`, err);
    return NextResponse.json(
      {
        error: 'PPTX generation failed',
        reason: 'PPTX 슬라이드를 생성하는 중 일시적인 오류가 발생했습니다.',
        suggestion: '잠시 후 다시 시도하거나 [기본 IM 수정·재생성]을 실행해 주세요.',
      },
      { status: 500 }
    );
  }
}
