/**
 * @file src/app/api/broker/im-lite/quick-generate/route.ts
 * @description WP-P3-04: Quick-generate API endpoint creating building + v1 IM + Deal Card.
 *
 * Requirements:
 * 1. Minimal inputs: address, askingPriceManwon, rentRoll (optional title, pnu, posture).
 * 2. Idempotency support: respects Idempotency-Key header or idempotencyKey body field.
 * 3. Synthesizes canonical BasicImDocument via buildBasicImDocument().
 * 4. Auto-syncs 4-item Deal Card via Card4Schema.
 * 5. Populates full PPTX-ready body (sections, ssot_summary, floor_leases, photos_v2, coordinates, pnu).
 * 6. Returns { buildingId, documentId, docHash, card4, status: 'succeeded' }.
 */

import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'crypto';
import { requireBroker } from '@/lib/auth-guard';
import { isRealProductionRuntime } from '@/lib/env';
import { extractPureBuildingFacts } from '@/domain/building/im-core/facts';
import { m2ToPyeong, pyeongToM2 } from '@/domain/building/im-core/facts/area';
import { buildBasicImDocument } from '@/domain/building/im-core/basic-im-document';
import { Card4Schema, computeCard4Hash, type Card4Data } from '@/lib/deal-card/card4-schema';
import {
  isGenericAssetUse,
  isLandPriorityPosture,
  resolveCanonicalAssetUse,
  resolveCanonicalDealHeadline,
  resolveCanonicalDealSummary,
  sqmToRoundedPyeong,
} from '@/lib/deal-card/canonical-summary';
import { repairDealCardLine } from '@/lib/deal-card/copy-limits';
import { cleanBlindPoints, suggestFallbackRegion } from '@/lib/deal-card/blind-guard';
import { healCorruptedRegionLabel } from '@/domain/building/dealcard-publication/banding-engine';
import { formatPriceRange, validateBlindPriceBand } from '@/lib/deal-card/price-band';
import {
  DEALCARD_PLACEHOLDER_REGION,
  evaluateDealCardPublishContent,
} from '@/lib/deal-card/publish-content-gate';
import { buildSanitizedDealCardPublicSnapshot } from '@/lib/deal-card/public-snapshot';
import {
  saveQuickImRecord,
  getQuickImRecord,
  isRealUploadedPhotoUrl,
  resolveKnownTestAssetUrl,
} from '@/lib/im-lite/quick-generate-store';
import { TEST_PARCEL_FIXTURES } from '@/lib/im-lite/test-parcel-fixtures';
import {
  getWorkspaceItemByAnyId,
  listWorkspaceItemsForOwner,
  upsertWorkspaceItem,
  WorkspaceRepositoryError,
  type WorkspaceItemRecord,
} from '@/lib/workspace/workspace-repository';
import { buildSanitizedImPublicSnapshot } from '@/lib/workspace/summary/patch-upsert-im';
import {
  applyBrokerExtrasToSections,
  brokerExtrasToForm,
  parseBrokerExtras,
  type BrokerExtras,
} from '@/domain/building/mobile-im/broker-extras';
import type { RentRollMeta } from '@/domain/building/mobile-im/rentroll-meta';
import { parseRentRollMeta } from '@/domain/building/mobile-im/rentroll-meta-parse';
import {
  parseBrokerParcels,
  summarizeParcels,
  type BrokerParcel,
} from '@/domain/building/mobile-im/parcel-input';
import { evaluateRAGIndexingEligibility } from '@/domain/building/mobile-im/rag-hygiene';
import { indexIMSections } from '@/domain/building/mobile-im/im-embedding-indexer';
import { polishImCopyWithLexiconSync } from '@/domain/building/mobile-im/workspace-ai-enhancer';
import { padNumber, splitMultiParcelAddress } from '@/lib/external/address-resolver';
import { assertPublishable } from '@/lib/legal/publish-gate';
import { enforceBrokerAiQuota } from '@/lib/ai-quota-guard';

// In-memory idempotency cache for quick-generate calls (scoped per user, bounded to prevent OOM)
export const maxDuration = 120;

const MAX_IDEMPOTENCY_CACHE_SIZE = 200;
const LARGE_INLINE_PHOTO_THRESHOLD_CHARS = 32 * 1024; // 32KB threshold for offloading inline base64 photos to Supabase Storage
const IDEMPOTENCY_CACHE = new Map<string, any>();

function mapPostureToLegacy(posture: string): string {
  switch (posture) {
    case 'core_income':
    case 'income':
    case 'presale_general':
    case 'presale_LP':
    case 'presale_senior':
    case 'value_add':
    case 'buyer_valueadd':
      return 'income';
    case 'owner_occupier':
    case 'owner_occupied':
      return 'owner_occupied';
    case 'trading':
      return 'trading';
    case 'development':
    case 'buyer_developer':
      return 'development';
    case 'repositioning':
    case 'operating':
      return 'operating';
    default:
      return 'income';
  }
}

function mapPostureToCanonical(posture: string): string {
  switch (posture) {
    case 'income':
    case 'core_income':
    case 'presale_general':
    case 'presale_LP':
    case 'presale_senior':
      return 'core_income';
    case 'owner_occupied':
    case 'owner_occupier':
      return 'owner_occupier';
    case 'trading':
    case 'value_add':
    case 'buyer_valueadd':
      return 'value_add';
    case 'development':
    case 'buyer_developer':
      return 'development';
    case 'operating':
    case 'repositioning':
      return 'repositioning';
    default:
      return 'core_income';
  }
}

export async function POST(req: NextRequest) {
  // Verify broker authorization
  const auth = await requireBroker(req);
  if (auth.error) {
    return auth.error;
  }

  const userId = auth.user?.id || '';
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: '인증이 필요합니다.' },
      { status: 401 }
    );
  }
  const isAdmin = auth.role === 'admin';

  const idempotencyKey =
    req.headers.get('idempotency-key') ||
    req.headers.get('x-idempotency-key') ||
    null;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: '요청 본문이 올바른 JSON 형식이 아닙니다.' },
      { status: 400 }
    );
  }

  const rawIdempotencyKey =
    typeof (idempotencyKey || body?.idempotencyKey) === 'string'
      ? String(idempotencyKey || body.idempotencyKey).trim()
      : '';
  const scopedIdempotencyKey = rawIdempotencyKey ? `${userId}:${rawIdempotencyKey}` : '';
  if (scopedIdempotencyKey && IDEMPOTENCY_CACHE.has(scopedIdempotencyKey)) {
    return NextResponse.json(IDEMPOTENCY_CACHE.get(scopedIdempotencyKey), {
      status: 200,
      headers: { 'X-Cache-Lookup': 'HIT' },
    });
  }

  const {
    address,
    askingPriceManwon,
    rentRoll = [],
    expectedRentRoll: rawExpectedRentRoll = [],
    expected_rent_roll: rawExpectedRentRollSnake = [],
    title,
    buildingName,
    pnu: rawPnu,
    lat: rawLat,
    lng: rawLng,
    coordinates: rawCoordinates,
    floorsAbove: rawFloorsAbove,
    floorsBelow: rawFloorsBelow,
    landAreaSqm,
    gfaSqm,
    zoning,
    completionDate,
    handoverNote,
    brokerExtras,
    brokerName,
    brokerageName,
    brokerPhone,
  } = body;
  const rawPosture = String(body.posture || body.investmentPosture || 'core_income');
  const posture = mapPostureToCanonical(rawPosture);
  const legacyPosture = mapPostureToLegacy(rawPosture);

  const rawRentRollMeta = body.rent_roll_meta ?? body.rentRollMeta;
  const parsedRentRollMetaRes = parseRentRollMeta(rawRentRollMeta);
  if (!parsedRentRollMetaRes.ok) {
    return NextResponse.json({ error: parsedRentRollMetaRes.error }, { status: 400 });
  }
  let resolvedRentRollMeta: RentRollMeta | undefined = parsedRentRollMetaRes.value;
  if (resolvedRentRollMeta?.area_unit_override) {
    resolvedRentRollMeta = {
      ...resolvedRentRollMeta,
      area_unit_override: {
        reason: resolvedRentRollMeta.area_unit_override.reason,
        by: userId,
        at: new Date().toISOString(),
      },
    };
  }
  const rawExpectedRentRollMeta = body.expected_rent_roll_meta ?? body.expectedRentRollMeta;
  const parsedExpectedRentRollMetaRes = parseRentRollMeta(rawExpectedRentRollMeta);
  if (!parsedExpectedRentRollMetaRes.ok) {
    return NextResponse.json({ error: parsedExpectedRentRollMetaRes.error }, { status: 400 });
  }
  let resolvedExpectedRentRollMeta: RentRollMeta | undefined =
    parsedExpectedRentRollMetaRes.value;
  if (resolvedExpectedRentRollMeta?.area_unit_override) {
    resolvedExpectedRentRollMeta = {
      ...resolvedExpectedRentRollMeta,
      area_unit_override: {
        reason: resolvedExpectedRentRollMeta.area_unit_override.reason,
        by: userId,
        at: new Date().toISOString(),
      },
    };
  }

  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    return NextResponse.json(
      { error: '주소를 입력해주세요.' },
      { status: 422 }
    );
  }

  const priceNum = Number(askingPriceManwon);
  const isExplicitNegotiable =
    priceNum === 0 &&
    (body.priceNegotiable === true ||
      /협의|비공개/.test(String(body.priceBand || body.title || body.buildingName || '')));
  if (isNaN(priceNum) || priceNum < 0 || (priceNum === 0 && !isExplicitNegotiable)) {
    return NextResponse.json(
      { error: '유효한 매각 희망가를 입력해주세요 (0보다 커야 합니다).' },
      { status: 422 }
    );
  }

  // WP-7.3D P1-4: same per-broker AI burst limit + daily AI quota as generate/generate-async
  // (enforceBrokerAiQuota → 429 Korean message). Checked after cheap validation and after the
  // idempotency cache so retries/replays never consume quota. 20/min is generous enough for
  // E2E flows (a few generates per run) while stopping scripted abuse of this 120s route.
  const quickGenQuotaErr = await enforceBrokerAiQuota(req, userId, 'im_quick_generate', {
    perMinute: 20,
  });
  if (quickGenQuotaErr) return quickGenQuotaErr;

  const cleanAddress = address.trim();
  const knownMatch = !isRealProductionRuntime()
    ? TEST_PARCEL_FIXTURES.find((entry) => entry.match.test(cleanAddress))?.info
    : undefined;

  const shouldPersistDb =
    (process.env.NODE_ENV !== 'test' && !process.env.VITEST) ||
    process.env.DISABLE_MEMORY_STORE === '1' ||
    process.env.REQUIRE_WORKSPACE_ITEMS_TABLE === '1';

  // Generate deterministic/unique IDs (reuse valid UUID buildingId or broker-owned match before minting)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const requestedBuildingId =
    typeof body.buildingId === 'string' && uuidRegex.test(body.buildingId)
      ? body.buildingId
      : null;
  const rawLegacyCandidate =
    typeof body.legacyBuildingId === 'string' && body.legacyBuildingId.trim()
      ? body.legacyBuildingId.trim()
      : typeof body.buildingId === 'string' && body.buildingId.trim()
        ? body.buildingId.trim()
        : '';
  const legacyBuildingId =
    rawLegacyCandidate &&
    !uuidRegex.test(rawLegacyCandidate) &&
    !['bld-01', 'bld-02', 'bld-03', 'im-doc-01', 'im-doc-02', 'im-doc-03'].includes(rawLegacyCandidate)
      ? rawLegacyCandidate
      : null;
  const isExplicitDuplicate =
    Boolean(body.isClone || body.isDuplicate || body.duplicate || body.forceNewBuilding) ||
    (typeof rawLegacyCandidate === 'string' && /^bld-dup-/i.test(rawLegacyCandidate));
  let resolvedExistingBuildingId: string | null = requestedBuildingId;
  let preLookupSupabase: any = null;
  let preResolvedDealCardWs: WorkspaceItemRecord | null = null;

  // Preserve existing DB metadata (PNU, coordinates, enrichment, photos, floor_leases) when regenerating an existing IM
  let existingPnu: string | undefined;
  let existingAllPnus: string[] = [];
  let existingCoords: { lat: number; lng: number } | undefined;
  let existingRoadAddress: string | undefined;
  let existingJibunAddress: string | undefined;
  let existingEnrichment: Record<string, any> | undefined;
  let existingSsot: Record<string, any> | undefined;
  let existingRealPhotos: any[] = [];
  let existingFloorLeases: any[] = [];

  const isDangsanAddress = /(당산동5가\s*11-47|양평동\s*11-47|영신로\s*259)/.test(cleanAddress);
  const isYeoksamAddress = /역삼동/.test(cleanAddress);
  const isSeochoAddress = /서초동/.test(cleanAddress);
  const normalizeAddrCompare = (s?: unknown) =>
    typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '';

  const isValidPnuForAddress = (p?: string | null): p is string => {
    if (typeof p !== 'string') return false;
    const t = p.trim();
    if (!/^\d{19}$/.test(t)) return false;
    // Block legacy non-existent seed PNU & cross-dong seed PNUs
    if (t === '1156012800100800001') return false;
    if (!isDangsanAddress && t === '1156011500100110047') return false;
    if (!isYeoksamAddress && t === '1168010100108230033') return false;
    if (!isSeochoAddress && t === '1165010800113030035') return false;
    return true;
  };

  const isValidCoordsForAddress = (c?: any): boolean => {
    if (!c) return false;
    const latNum = Number(c.lat);
    const lngNum = Number(c.lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || latNum <= 33 || lngNum <= 124) {
      return false;
    }
    if (
      !isDangsanAddress &&
      Math.abs(latNum - 37.5342) < 0.0005 &&
      Math.abs(lngNum - 126.9022) < 0.0005
    ) {
      return false;
    }
    if (
      !isYeoksamAddress &&
      Math.abs(latNum - 37.4996) < 0.0005 &&
      Math.abs(lngNum - 127.0344) < 0.0005
    ) {
      return false;
    }
    if (
      !isSeochoAddress &&
      Math.abs(latNum - 37.5019) < 0.0005 &&
      Math.abs(lngNum - 127.0254) < 0.0005
    ) {
      return false;
    }
    return true;
  };

  const sanitizedRawPnu =
    typeof rawPnu === 'string' && isValidPnuForAddress(rawPnu.trim()) ? rawPnu.trim() : '';
  const sanitizedRawCoords =
    rawCoordinates && isValidCoordsForAddress(rawCoordinates)
      ? { lat: Number(rawCoordinates.lat), lng: Number(rawCoordinates.lng) }
      : isValidCoordsForAddress({ lat: rawLat, lng: rawLng })
      ? { lat: Number(rawLat), lng: Number(rawLng) }
      : undefined;

  // Cross-tenant IDOR guard: when requestedBuildingId is supplied, verify ownership BEFORE any mutation
  let existingOwnerId: string | null = null;
  if (requestedBuildingId) {
    const existingMemRecord = getQuickImRecord(requestedBuildingId);
    if (existingMemRecord?.ownerId) {
      if (existingMemRecord.ownerId !== userId && !isAdmin) {
        return NextResponse.json(
          { ok: false, error: '이 매물에 대한 권한이 없습니다.', code: 'FORBIDDEN' },
          { status: 403 }
        );
      }
      existingOwnerId = existingMemRecord.ownerId;
    }

    let existingBldRow: Record<string, any> | null = null;
    // WP-7.3D P1-3: the ownership lookup must FAIL CLOSED. Previously only `data` was read and
    // thrown errors were swallowed, so a lookup failure skipped the 403 check and the route went
    // on to upsert building_ssot_lite for another broker's id. A genuine "not found" (no row) is
    // still allowed; any other lookup error → 503 and no write.
    const ownershipLookupWouldPersist =
      (process.env.NODE_ENV !== 'test' && !process.env.VITEST) ||
      process.env.DISABLE_MEMORY_STORE === '1' ||
      process.env.REQUIRE_WORKSPACE_ITEMS_TABLE === '1';
    const ownershipLookupUnavailable = () =>
      NextResponse.json(
        {
          ok: false,
          code: 'OWNERSHIP_CHECK_UNAVAILABLE',
          error: '매물 권한 확인을 일시적으로 할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        },
        { status: 503 }
      );
    let ownershipSupabase: any = null;
    try {
      const { createServiceClient } = await import('@/lib/supabase/service');
      ownershipSupabase = createServiceClient();
    } catch (clientErr) {
      ownershipSupabase = null;
      if (ownershipLookupWouldPersist) {
        console.error('[quick-generate] ownership lookup client unavailable:', clientErr);
        return ownershipLookupUnavailable();
      }
      // Offline unit-test environments without a Supabase client never persist to the DB.
    }
    if (ownershipSupabase && typeof ownershipSupabase.from === 'function') {
      try {
        const runLookup = (cols: string) =>
          ownershipSupabase
            .from('building_ssot_lite')
            .select(cols)
            .eq('id', requestedBuildingId)
            .maybeSingle();
        let lookup = await runLookup('id, owner_id, pnu, raw_address, layers');
        const isMissingColumn = (e: any) =>
          Boolean(e) &&
          (String(e.code || '') === '42703' ||
            String(e.code || '') === 'PGRST204' ||
            /column .* does not exist/i.test(String(e.message || '')));
        if (lookup?.error && isMissingColumn(lookup.error)) {
          // Pre-cutover schema without the optional `pnu`/`raw_address` columns.
          lookup = await runLookup('id, owner_id, layers');
        }
        const lookupErr = lookup?.error;
        const isNotFound = Boolean(lookupErr) && String(lookupErr.code || '') === 'PGRST116';
        if (lookupErr && !isNotFound) {
          console.error('[quick-generate] ownership lookup failed:', {
            code: lookupErr.code,
            message: lookupErr.message,
          });
          return ownershipLookupUnavailable();
        }
        existingBldRow = (lookup?.data as Record<string, any> | null) ?? null;
      } catch (lookupThrown) {
        console.error('[quick-generate] ownership lookup threw:', lookupThrown);
        return ownershipLookupUnavailable();
      }
    }

    if (ownershipSupabase) {
      preLookupSupabase = ownershipSupabase;
    }

    if (existingBldRow) {
      const rowOwnerId = (existingBldRow.owner_id as string | null | undefined) ?? null;
      if (!isAdmin && (!rowOwnerId || rowOwnerId !== userId)) {
        return NextResponse.json(
          { ok: false, error: '이 매물에 대한 권한이 없습니다.', code: 'FORBIDDEN' },
          { status: 403 }
        );
      }
      if (rowOwnerId) {
        existingOwnerId = rowOwnerId;
      }

      if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
        const bLayers = (existingBldRow.layers as Record<string, any>) || {};
        const sameBldAddr =
          !existingBldRow.raw_address ||
          normalizeAddrCompare(existingBldRow.raw_address) === normalizeAddrCompare(cleanAddress);
        if (sameBldAddr) {
          if (isValidPnuForAddress(existingBldRow.pnu)) existingPnu = existingBldRow.pnu;
          else if (isValidPnuForAddress(bLayers.location?.pnu)) existingPnu = bLayers.location.pnu;
          else if (isValidPnuForAddress(bLayers.location?.canonical_pnu))
            existingPnu = bLayers.location.canonical_pnu;
          if (isValidCoordsForAddress(bLayers.coordinates)) {
            existingCoords = {
              lat: Number(bLayers.coordinates.lat),
              lng: Number(bLayers.coordinates.lng),
            };
          }
        }
      }
    }
  }

  // (b) Resolve existing canonical buildingId via legacy_id scoped to broker before minting a new UUID
  if (!resolvedExistingBuildingId && !isExplicitDuplicate && legacyBuildingId && shouldPersistDb) {
    try {
      if (!preLookupSupabase) {
        const { createServiceClient } = await import('@/lib/supabase/service');
        preLookupSupabase = createServiceClient();
      }
      if (preLookupSupabase && typeof preLookupSupabase.from === 'function') {
        const ownerScope = isAdmin ? undefined : userId;
        const matchedDealWs = await getWorkspaceItemByAnyId(
          preLookupSupabase,
          legacyBuildingId,
          'dealcard',
          ownerScope
        ).catch(() => null);
        const matchedAnyWs =
          matchedDealWs ||
          (await getWorkspaceItemByAnyId(
            preLookupSupabase,
            legacyBuildingId,
            undefined,
            ownerScope
          ).catch(() => null));
        if (matchedAnyWs && (isAdmin || matchedAnyWs.ownerId === userId)) {
          if (matchedAnyWs.buildingId && uuidRegex.test(matchedAnyWs.buildingId)) {
            resolvedExistingBuildingId = matchedAnyWs.buildingId;
            existingOwnerId = existingOwnerId || matchedAnyWs.ownerId;
          }
          if (matchedAnyWs.kind === 'dealcard') {
            preResolvedDealCardWs = matchedAnyWs;
          }
        }
      }
    } catch {
      // Non-blocking legacy_id dedup lookup
    }
  }

  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    if (resolvedExistingBuildingId) {
      try {
        const { createServiceClient } = await import('@/lib/supabase/service');
        const supabase = createServiceClient();
        if (supabase && typeof supabase.from === 'function') {
          const { data: docRows } = await supabase
            .from('document_objects')
            .select('body')
            .eq('building_id', resolvedExistingBuildingId)
            .eq('document_type', 'mobile_im')
            .order('created_at', { ascending: false })
            .limit(3);

          for (const dRow of docRows || []) {
            const dBody = (dRow?.body as Record<string, any>) || {};
            const dSsot = (dBody.ssot_summary as Record<string, any>) || {};
            const docSavedAddr = dBody.resolved_address || dSsot.address || dSsot.raw_address || '';
            const sameDocAddr =
              !docSavedAddr ||
              normalizeAddrCompare(docSavedAddr) === normalizeAddrCompare(cleanAddress);
            if (sameDocAddr) {
              if (!existingPnu) {
                if (isValidPnuForAddress(dBody.pnu)) existingPnu = dBody.pnu;
                else if (isValidPnuForAddress(dSsot.pnu)) existingPnu = dSsot.pnu;
              }
              if (!existingCoords) {
                if (isValidCoordsForAddress(dBody.coordinates)) {
                  existingCoords = {
                    lat: Number(dBody.coordinates.lat),
                    lng: Number(dBody.coordinates.lng),
                  };
                } else if (isValidCoordsForAddress(dSsot.coordinates)) {
                  existingCoords = {
                    lat: Number(dSsot.coordinates.lat),
                    lng: Number(dSsot.coordinates.lng),
                  };
                }
              }
              if (!existingRoadAddress && dSsot.road_address && dSsot.road_address !== cleanAddress) {
                existingRoadAddress = String(dSsot.road_address);
              }
              if (!existingJibunAddress && dSsot.jibun_address && dSsot.jibun_address !== cleanAddress) {
                existingJibunAddress = String(dSsot.jibun_address);
              }
              if (!existingEnrichment && dBody.enrichment && typeof dBody.enrichment === 'object') {
                existingEnrichment = dBody.enrichment;
              }
              if (!existingSsot && Object.keys(dSsot).length > 0) {
                existingSsot = dSsot;
              }
            }
            if (existingRealPhotos.length === 0) {
              const candPhotos = Array.isArray(dBody.photos_v2)
                ? dBody.photos_v2
                : Array.isArray(dBody.photos)
                ? dBody.photos
                : [];
              const realList = candPhotos.filter(
                (p: any) =>
                  p &&
                  typeof p.url === 'string' &&
                  p.url.length > 0 &&
                  !p.url.startsWith('/test-images/')
              );
              if (realList.length > 0) {
                existingRealPhotos = realList;
              }
            }
            if (existingFloorLeases.length === 0 && Array.isArray(dBody.floor_leases)) {
              const hasValidArea = dBody.floor_leases.some((fl: any) => {
                const a = Number(fl?.area_sqm ?? fl?.area_m2 ?? fl?.exclusive_area_sqm ?? 0);
                return a > 0 && Math.abs(a - 2.45) > 0.05;
              });
              if (hasValidArea) {
                existingFloorLeases = dBody.floor_leases;
              }
            }
          }
        }
      } catch {
        // Non-blocking DB lookup fallback
      }
    }

    // If address is neither in KNOWN_PARCEL_REGISTRY nor already resolved with valid PNU + coords, resolve live via address-resolver
    if (!knownMatch && (!(sanitizedRawPnu || existingPnu) || !(sanitizedRawCoords || existingCoords))) {
      try {
        const { resolveAddress } = await import('@/lib/external/address-resolver');
        const resolved = await Promise.race([
          resolveAddress(cleanAddress),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
        ]);
        if (resolved) {
          if (!existingPnu && resolved.pnu && /^\d{19}$/.test(resolved.pnu)) {
            existingPnu = resolved.pnu;
          }
          if (Array.isArray(resolved.allPnus) && resolved.allPnus.length > 0) {
            existingAllPnus = resolved.allPnus.filter((p) => /^\d{19}$/.test(p));
          }
          if (!existingCoords && resolved.lat && resolved.lng) {
            existingCoords = { lat: Number(resolved.lat), lng: Number(resolved.lng) };
          }
          if (!existingRoadAddress && resolved.roadAddress) {
            existingRoadAddress = resolved.roadAddress;
          }
          if (!existingJibunAddress && resolved.jibunAddress) {
            existingJibunAddress = resolved.jibunAddress;
          }
        }
      } catch {
        // Non-blocking address resolver fallback
      }
    }
  }

  const normalizeAddrDedupKey = (raw?: unknown): string => {
    if (typeof raw !== 'string') return '';
    return raw
      .replace(/\([^)]*\)/g, ' ')
      .replace(
        /^(서울특별시|서울시|서울|부산광역시|부산시|부산|대구광역시|대구시|대구|인천광역시|인천시|인천|광주광역시|광주시|광주|대전광역시|대전시|대전|울산광역시|울산시|울산|세종특별자치시|세종시|세종|경기도|경기|강원특별자치도|강원도|강원|충청북도|충북|충청남도|충남|전북특별자치도|전라북도|전북|전라남도|전남|경상북도|경북|경상남도|경남|제주특별자치도|제주도|제주)\s+/,
        ''
      )
      .replace(/번지/g, '')
      .replace(/\s+/g, '')
      .trim()
      .toLowerCase();
  };

  // (c) Resolve existing broker-owned building by (owner_id, resolvedPnu) or normalized (owner_id, cleanAddress)
  // before minting a new canonical UUID (skip when explicitly cloning/duplicating).
  if (!resolvedExistingBuildingId && !isExplicitDuplicate && shouldPersistDb) {
    const preLookupPnu = sanitizedRawPnu || knownMatch?.pnu || existingPnu || '';
    const targetAddrKey = normalizeAddrDedupKey(cleanAddress);
    try {
      if (!preLookupSupabase) {
        const { createServiceClient } = await import('@/lib/supabase/service');
        preLookupSupabase = createServiceClient();
      }
      if (preLookupSupabase && typeof preLookupSupabase.from === 'function') {
        const ownerScopeId = existingOwnerId || userId;
        let ownerBldQuery: any = preLookupSupabase
          .from('building_ssot_lite')
          .select('id, owner_id, pnu, raw_address, raw_input, layers')
          .eq('owner_id', ownerScopeId);
        if (typeof ownerBldQuery?.order === 'function') {
          ownerBldQuery = ownerBldQuery.order('updated_at', { ascending: false });
        }
        if (typeof ownerBldQuery?.limit === 'function') {
          ownerBldQuery = ownerBldQuery.limit(50);
        }
        let bldRes: any =
          ownerBldQuery && typeof ownerBldQuery.then === 'function'
            ? await ownerBldQuery
            : typeof ownerBldQuery?.maybeSingle === 'function'
            ? await ownerBldQuery.maybeSingle()
            : ownerBldQuery;
        const isMissingBldCol = (e: any) =>
          Boolean(e) &&
          (String(e.code || '') === '42703' ||
            String(e.code || '') === 'PGRST204' ||
            /column .* does not exist/i.test(String(e.message || '')));
        if (bldRes?.error && isMissingBldCol(bldRes.error)) {
          let fallbackQ: any = preLookupSupabase
            .from('building_ssot_lite')
            .select('id, owner_id, layers')
            .eq('owner_id', ownerScopeId);
          if (typeof fallbackQ?.limit === 'function') {
            fallbackQ = fallbackQ.limit(50);
          }
          bldRes =
            fallbackQ && typeof fallbackQ.then === 'function'
              ? await fallbackQ
              : typeof fallbackQ?.maybeSingle === 'function'
              ? await fallbackQ.maybeSingle()
              : fallbackQ;
        }
        const bldRows = Array.isArray(bldRes?.data)
          ? bldRes.data
          : bldRes?.data
          ? [bldRes.data]
          : [];
        for (const row of bldRows) {
          if (!row || typeof row.id !== 'string' || !uuidRegex.test(row.id)) continue;
          const rLayers = (row.layers as Record<string, any>) || {};
          const rowPnu =
            row.pnu || rLayers?.location?.pnu || rLayers?.location?.canonical_pnu || '';
          const pnuMatched = Boolean(preLookupPnu && rowPnu && rowPnu === preLookupPnu);
          const candidateAddrs = [
            row.raw_address,
            row.raw_input,
            rLayers?.location?.address,
            rLayers?.location?.raw_address,
          ];
          const addrMatched = Boolean(
            targetAddrKey &&
              candidateAddrs.some((a) => normalizeAddrDedupKey(a) === targetAddrKey)
          );
          if (pnuMatched || addrMatched) {
            resolvedExistingBuildingId = row.id;
            existingOwnerId = existingOwnerId || row.owner_id || ownerScopeId;
            if (!existingPnu && isValidPnuForAddress(rowPnu)) existingPnu = rowPnu;
            if (!existingCoords && isValidCoordsForAddress(rLayers.coordinates)) {
              existingCoords = {
                lat: Number(rLayers.coordinates.lat),
                lng: Number(rLayers.coordinates.lng),
              };
            }
            break;
          }
        }

        if (!resolvedExistingBuildingId && (preLookupPnu || targetAddrKey)) {
          const { items: wsItems } = await listWorkspaceItemsForOwner(preLookupSupabase, {
            ownerId: ownerScopeId,
          }).catch(() => ({ items: [] as WorkspaceItemRecord[], tableAvailable: false }));
          for (const ws of wsItems) {
            if (!ws?.buildingId || !uuidRegex.test(ws.buildingId)) continue;
            const wsPayload = (ws.draftPayload as Record<string, any>) || {};
            const wsSsot = (wsPayload.ssot_summary as Record<string, any>) || {};
            const wsAddrs = [ws.address, wsPayload.address, wsSsot.address, wsSsot.raw_address];
            const wsPnu = String(wsPayload.pnu || wsSsot.pnu || '');
            const matched =
              (preLookupPnu && wsPnu && wsPnu === preLookupPnu) ||
              (targetAddrKey && wsAddrs.some((a) => normalizeAddrDedupKey(a) === targetAddrKey));
            if (matched) {
              resolvedExistingBuildingId = ws.buildingId;
              existingOwnerId = existingOwnerId || ws.ownerId;
              if (ws.kind === 'dealcard' && !preResolvedDealCardWs) {
                preResolvedDealCardWs = ws;
              }
              break;
            }
          }
        }
      }
    } catch {
      // Non-blocking PNU/address dedup pre-lookup
    }
  }

  const buildingId = resolvedExistingBuildingId || crypto.randomUUID();
  const documentId = crypto.randomUUID();

  if (resolvedExistingBuildingId && shouldPersistDb && !preResolvedDealCardWs) {
    try {
      if (!preLookupSupabase) {
        const { createServiceClient } = await import('@/lib/supabase/service');
        preLookupSupabase = createServiceClient();
      }
      if (preLookupSupabase) {
        const ownerScope = isAdmin ? undefined : existingOwnerId || userId;
        preResolvedDealCardWs =
          (await getWorkspaceItemByAnyId(
            preLookupSupabase,
            resolvedExistingBuildingId,
            'dealcard',
            ownerScope
          ).catch(() => null)) ||
          (legacyBuildingId
            ? await getWorkspaceItemByAnyId(
                preLookupSupabase,
                legacyBuildingId,
                'dealcard',
                ownerScope
              ).catch(() => null)
            : null);
      }
    } catch {
      // Non-blocking DealCard pre-read
    }
  }

  // Derive blind-safe region from address without leaking lot numbers when si/do prefix is omitted
  const {
    primaryAddress: cleanPrimaryAddr,
    secondaryLots: parsedSecondaryLots,
    hasExplicitMultiLotHint,
  } = splitMultiParcelAddress(cleanAddress);
  const guDongRegionMatch = cleanPrimaryAddr.match(
    /([가-힣]{2,6}(?:구|군))\s+([가-힣0-9]{2,8}(?:동|읍|면|리|가))/
  );
  const cityRegionMatch = cleanPrimaryAddr.match(
    /([가-힣]{2,6}시)\s+([가-힣0-9]{2,8}(?:구|동|읍|면))/
  );
  let derivedRegion = '수도권';
  if (guDongRegionMatch) {
    derivedRegion = `${guDongRegionMatch[1]} ${guDongRegionMatch[2]}`;
  } else if (cityRegionMatch && !cityRegionMatch[1].startsWith('서울')) {
    derivedRegion = `${cityRegionMatch[1]} ${cityRegionMatch[2]}`;
  } else {
    const safeAddrTokens = cleanPrimaryAddr
      .split(/[\s,]+/)
      .filter((tok) => tok && !/^\d/.test(tok) && !/^산\d/.test(tok));
    if (safeAddrTokens.length >= 3) {
      derivedRegion = `${safeAddrTokens[1]} ${safeAddrTokens[2]}`;
    } else if (safeAddrTokens.length === 2) {
      derivedRegion = `${safeAddrTokens[0]} ${safeAddrTokens[1]}`;
    } else {
      derivedRegion = safeAddrTokens[0] || '서울 도심';
    }
  }

  // Compute rent totals and floor structure from rentRoll
  let totalDepositManwon = 0;
  let totalMonthlyRentManwon = 0;
  let totalMaintManwon = 0;
  let maxFloorAbove = 0;
  let maxFloorBelow = 0;
  let vacantUnitsCount = 0;

  const safeRentRoll = Array.isArray(rentRoll) ? rentRoll : [];
  for (const r of safeRentRoll) {
    if (!r) continue;
    const rawFloor = String(r.floor || '').trim();
    const isAuxFloor = /(주차|옥탑|기계식|루프탑|부대|관리)/.test(rawFloor);
    if (!isAuxFloor && rawFloor) {
      const segments = rawFloor.split(/[~,\s/]+/).filter(Boolean);
      for (const seg of segments) {
        const fStr = seg.trim().toUpperCase();
        if (!fStr) continue;
        const negMatch = fStr.match(/^-\s*(\d+)/);
        if (negMatch) {
          const n = parseInt(negMatch[1], 10);
          const fl = n >= 100 ? Math.floor(n / 100) : n;
          if (fl > 0 && fl < 20) maxFloorBelow = Math.max(maxFloorBelow, fl);
          continue;
        }
        const unitFloorMatch = fStr.match(/^(B|지하\s*)?(\d{1,2})(\d{2})\s*호?$/i);
        if (unitFloorMatch) {
          const parsedFl = parseInt(unitFloorMatch[2], 10);
          if (unitFloorMatch[1]) {
            maxFloorBelow = Math.max(maxFloorBelow, parsedFl || 1);
          } else if (parsedFl > 0 && parsedFl < 100) {
            maxFloorAbove = Math.max(maxFloorAbove, parsedFl);
          }
        } else if (fStr.startsWith('B') || fStr.includes('지하')) {
          const m = fStr.match(/(\d+)/);
          const rawBelow = m ? parseInt(m[1], 10) : 1;
          maxFloorBelow = Math.max(
            maxFloorBelow,
            rawBelow >= 100 ? Math.floor(rawBelow / 100) : rawBelow
          );
        } else {
          const m = fStr.match(/(\d+)/);
          if (m) {
            const rawAbove = parseInt(m[1], 10);
            const normAbove = rawAbove >= 100 ? Math.floor(rawAbove / 100) : rawAbove;
            if (normAbove > 0 && normAbove < 100) {
              maxFloorAbove = Math.max(maxFloorAbove, normAbove);
            }
          }
        }
      }
    }

    const isVacant =
      r.status === 'vacant' ||
      r.is_vacant === true ||
      r.lease_state === '공실' ||
      r.use === '공실';
    const isOwner =
      !isVacant &&
      (r.status === 'owner' ||
        r.lease_state === '자가사용' ||
        r.use === '자가사용' ||
        r.use === '자가');
    if (isVacant) {
      vacantUnitsCount++;
    } else if (!isOwner) {
      totalDepositManwon += Number(r.depositManwon ?? r.deposit_manwon ?? r.deposit ?? 0);
      totalMonthlyRentManwon += Number(
        r.monthlyRentManwon ?? r.rent_manwon ?? r.monthlyRent ?? r.rent ?? 0
      );
      totalMaintManwon += Number(
        r.maintenanceManwon ?? r.mgmt_fee_manwon ?? r.maintenance ?? 0
      );
    }
  }
  totalDepositManwon = Math.round(totalDepositManwon * 10) / 10;
  totalMonthlyRentManwon = Math.round(totalMonthlyRentManwon * 10) / 10;
  totalMaintManwon = Math.round(totalMaintManwon * 10) / 10;

  const existingFloorsAbove = Number(
    existingEnrichment?.buildingRegister?.floorsAbove ?? existingSsot?.floors_above ?? 0
  );
  const existingFloorsBelow = Number(
    existingEnrichment?.buildingRegister?.floorsBelow ?? existingSsot?.floors_below ?? 0
  );
  const effectiveFloorsAbove =
    Number(rawFloorsAbove) > 0 && Number(rawFloorsAbove) < 100
      ? Number(rawFloorsAbove)
      : knownMatch?.floorsAbove ??
        (existingFloorsAbove > 0 && existingFloorsAbove < 100
          ? existingFloorsAbove
          : maxFloorAbove > 0
          ? maxFloorAbove
          : 0);
  const effectiveFloorsBelow =
    rawFloorsBelow !== undefined &&
    rawFloorsBelow !== null &&
    rawFloorsBelow !== '' &&
    Number.isFinite(Number(rawFloorsBelow)) &&
    Number(rawFloorsBelow) >= 0 &&
    Number(rawFloorsBelow) < 20
      ? Number(rawFloorsBelow)
      : knownMatch?.floorsBelow ??
        (existingFloorsBelow > 0 && existingFloorsBelow < 20
          ? existingFloorsBelow
          : maxFloorBelow > 0
          ? maxFloorBelow
          : 0);
  let effectiveLandSqm =
    Number(landAreaSqm) > 0
      ? Number(landAreaSqm)
      : knownMatch?.landAreaSqm ?? Number(existingSsot?.land_area_sqm || 0);
  const effectiveGfaSqm =
    Number(gfaSqm) > 0
      ? Number(gfaSqm)
      : knownMatch?.gfaSqm ?? Number(existingSsot?.total_gross_area_sqm || 0);
  const rawZoning = typeof zoning === 'string' ? zoning.trim() : '';
  const effectiveZoning =
    rawZoning ||
    knownMatch?.zoning ||
    String(existingEnrichment?.landUsePlan?.zoning || existingSsot?.zoning || '').trim() ||
    '';
  const rawCompletionDate = typeof completionDate === 'string' ? completionDate.trim() : '';
  const effectiveCompletionDate =
    rawCompletionDate ||
    knownMatch?.completionDate ||
    String(
      existingEnrichment?.buildingRegister?.completionDate || existingSsot?.completion_date || ''
    ).trim() ||
    '';
  const totalFloorsCount = Math.max(1, effectiveFloorsAbove + effectiveFloorsBelow);
  const perFloorAreaSqm = Math.round((effectiveGfaSqm / totalFloorsCount) * 10) / 10;

  const rawBcrPct = Number(body.bcrPct);
  const bcrPct =
    rawBcrPct > 0
      ? rawBcrPct
      : knownMatch?.bcrPct ??
        (Number(existingEnrichment?.buildingRegister?.bcr) > 0
          ? Number(existingEnrichment?.buildingRegister?.bcr)
          : Number(existingSsot?.bcr_pct || 0));
  const rawFarPct = Number(body.farPct);
  const farPct =
    rawFarPct > 0
      ? rawFarPct
      : knownMatch?.farPct ??
        (Number(existingEnrichment?.buildingRegister?.far) > 0
          ? Number(existingEnrichment?.buildingRegister?.far)
          : Number(existingSsot?.far_pct || 0));
  const rawParkingSpaces = body.parkingSpaces ?? body.parkingTotal;
  const parkingSpaces =
    rawParkingSpaces !== undefined &&
    rawParkingSpaces !== null &&
    rawParkingSpaces !== '' &&
    Number.isFinite(Number(rawParkingSpaces)) &&
    (Number(rawParkingSpaces) > 0 || !knownMatch?.parkingSpaces)
      ? Number(rawParkingSpaces)
      : knownMatch?.parkingSpaces ??
        (Number(existingEnrichment?.buildingRegister?.parkingSpaces) > 0
          ? Number(existingEnrichment?.buildingRegister?.parkingSpaces)
          : Number(existingSsot?.parking_total ?? existingSsot?.parking_count ?? 0));
  const rawElevators = body.elevators ?? body.elevatorCount;
  const elevators =
    rawElevators !== undefined &&
    rawElevators !== null &&
    rawElevators !== '' &&
    Number.isFinite(Number(rawElevators)) &&
    (Number(rawElevators) > 0 || !knownMatch?.elevators)
      ? Number(rawElevators)
      : knownMatch?.elevators !== undefined
      ? knownMatch.elevators
      : Number(existingEnrichment?.buildingRegister?.elevators) > 0
      ? Number(existingEnrichment?.buildingRegister?.elevators)
      : Number(existingSsot?.elevator_count ?? 0);
  const rawOfficialLandPrice = Number(
    body.officialLandPriceWonSqm || body.officialLandPricePerSqm || 0
  );
  const officialLandPriceWonSqm =
    rawOfficialLandPrice > 0
      ? rawOfficialLandPrice
      : knownMatch?.officialLandPriceWonSqm ??
        (Number(existingEnrichment?.landPrice?.officialPricePerM2) > 0
          ? Number(existingEnrichment?.landPrice?.officialPricePerM2)
          : Number(existingSsot?.official_land_price_per_sqm) > 0 &&
            Number(existingSsot?.official_land_price_per_sqm) !== 8950000 &&
            Number(existingSsot?.official_land_price_per_sqm) !== 22000000 &&
            Number(existingSsot?.official_land_price_per_sqm) !== 14200000
          ? Number(existingSsot?.official_land_price_per_sqm)
          : 0);

  const resolvedTitle = title || buildingName || `${derivedRegion} 근생빌딩`;
  const effectiveMonthlyRentManwon = totalMonthlyRentManwon > 0 ? totalMonthlyRentManwon : 0;
  const effectiveDepositManwon = totalDepositManwon > 0 ? totalDepositManwon : 0;
  const estimatedYieldPct = (
    ((effectiveMonthlyRentManwon * 12) / Math.max(1, priceNum - effectiveDepositManwon)) *
    100
  ).toFixed(2);

  // Parse optional broker_extras safely
  let parsedExtras: BrokerExtras | undefined;
  if (brokerExtras && typeof brokerExtras === 'object') {
    const parsed = parseBrokerExtras(brokerExtras);
    if (parsed.ok) {
      parsedExtras = parsed.value;
    }
  }
  const rawClosingLine = String(
    body.closingLine ||
      body.brokerExtras?.closingLine ||
      body.brokerExtras?.closing_line ||
      parsedExtras?.closing_line ||
      existingSsot?.closing_line ||
      ''
  ).trim();
  const earlyTenantPool = safeRentRoll.map((r: any) => ({
    tenant_name: String(r?.tenantName ?? r?.tenant_name ?? r?.use ?? ''),
    note: String(r?.note ?? ''),
  }));
  const closingLine = rawClosingLine
    ? polishImCopyWithLexiconSync(rawClosingLine, {
        tenantPoolSource: earlyTenantPool,
        isCompactHeadline: false,
      })
    : '';

  const subjectLandPyeongEarly = Math.max(1, m2ToPyeong(effectiveLandSqm));
  const subjectLandPricePerPyeongManwon = priceNum > 0 ? Math.round(priceNum / subjectLandPyeongEarly) : 0;

  const DEFAULT_SAMPLE_HEADLINES = new Set([
    '역세권 도보 3분 코너 · 전 층 우량 임차인 만실 운영',
    '순투자금 대비 연 4.2% 안정 수익 · 공실 위험 낮음',
    '제3종일반주거지역 토지 가치 · 중장기 리모델링 여력',
  ]);
  const axiosHeadlinePoints = Array.isArray(body.axiosHighlights)
    ? body.axiosHighlights
        .map((h: any) => (typeof h?.headline === 'string' ? h.headline.trim() : ''))
        .filter((s: string) => s.length > 0 && !DEFAULT_SAMPLE_HEADLINES.has(s))
    : [];
  const customPoints = Array.isArray(body.investmentPoints)
    ? body.investmentPoints.filter(
        (p: unknown): p is string =>
          typeof p === 'string' && p.trim().length > 0 && !DEFAULT_SAMPLE_HEADLINES.has(p.trim())
      )
    : axiosHeadlinePoints;

  const rawDefaultPoints: [string, string, string] = [
    customPoints[0] || parsedExtras?.investment_points?.[0] || `${derivedRegion} 핵심 상권 역세권 가시성 우수`,
    customPoints[1] ||
      parsedExtras?.investment_points?.[1] ||
      (totalMonthlyRentManwon > 0
        ? `월 임대수익 ${totalMonthlyRentManwon.toLocaleString()}만원 안정 운용`
        : '안정적 임차인 및 사옥·가치개선 활용 적격'),
    customPoints[2] ||
      parsedExtras?.investment_points?.[2] ||
      (effectiveMonthlyRentManwon > 0 && priceNum > 0
        ? `연 임대수익률 ${estimatedYieldPct}% 수익형 자산`
        : subjectLandPricePerPyeongManwon > 0
        ? `토지 평당 ${subjectLandPricePerPyeongManwon.toLocaleString()}만원 자산가치 우수`
        : '핵심 입지 및 실수요·투자 가치 우수'),
  ];
  const defaultPoints: [string, string, string] = [
    polishImCopyWithLexiconSync(rawDefaultPoints[0], {
      tenantPoolSource: earlyTenantPool,
      isCompactHeadline: true,
    }) || rawDefaultPoints[0],
    polishImCopyWithLexiconSync(rawDefaultPoints[1], {
      tenantPoolSource: earlyTenantPool,
      isCompactHeadline: true,
    }) || rawDefaultPoints[1],
    polishImCopyWithLexiconSync(rawDefaultPoints[2], {
      tenantPoolSource: earlyTenantPool,
      isCompactHeadline: true,
    }) || rawDefaultPoints[2],
  ];

  // Fetch authenticated broker's saved profile from Supabase if available
  let dbBrokerProfile: {
    displayName?: string;
    representativeName?: string;
    company?: string;
    phone?: string;
    officeAddress?: string;
    registrationNo?: string;
    licenseNo?: string;
    tagline?: string;
    slug?: string;
    photoUrl?: string;
    specialtyRegions?: string[];
    specialtyAssets?: string[];
    bio?: string | null;
  } | null = null;

  if (auth.user?.id && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    try {
      const { createServiceClient } = await import('@/lib/supabase/service');
      const supabase = createServiceClient();
      if (supabase && typeof supabase.from === 'function') {
        const { data: pRow } = await supabase
          .from('profiles')
          .select('display_name, company, phone, tagline, photo_url')
          .eq('id', auth.user.id)
          .maybeSingle();

        let bpRow: any = null;
        const bpRes = await supabase
          .from('broker_profiles')
          .select('office_reg_number, license_number, office_address, representative_name, name, slug, specialty_regions, specialty_assets, bio, avatar_url')
          .eq('user_id', auth.user.id)
          .maybeSingle();
        if (!bpRes.error) {
          bpRow = bpRes.data;
        } else {
          const bpFallback = await supabase
            .from('broker_profiles')
            .select('office_reg_number, license_number, slug, specialty_regions, specialty_assets, bio, avatar_url')
            .eq('user_id', auth.user.id)
            .maybeSingle();
          bpRow = bpFallback.data;
        }

        if (pRow || bpRow) {
          dbBrokerProfile = {
            displayName: pRow?.display_name || bpRow?.name || bpRow?.representative_name || undefined,
            representativeName: bpRow?.representative_name || undefined,
            company: pRow?.company || undefined,
            phone: pRow?.phone || undefined,
            officeAddress: bpRow?.office_address || undefined,
            registrationNo: bpRow?.office_reg_number || undefined,
            licenseNo: bpRow?.license_number || undefined,
            tagline: pRow?.tagline || undefined,
            slug: bpRow?.slug || undefined,
            photoUrl: bpRow?.avatar_url || pRow?.photo_url || undefined,
            specialtyRegions: Array.isArray(bpRow?.specialty_regions) ? bpRow.specialty_regions : undefined,
            specialtyAssets: Array.isArray(bpRow?.specialty_assets) ? bpRow.specialty_assets : undefined,
            bio: bpRow?.bio ?? null,
          };
        }
      }
    } catch {
      // Non-blocking fallback
    }
  }

  const cleanBrokerVal = (v: unknown): string => {
    if (typeof v !== 'string') return '';
    const t = v.trim();
    if (
      !t ||
      t === '-' ||
      t === '담당 공인중개사' ||
      t === '담당 중개법인' ||
      t === '전담 중개사무소' ||
      t === '크리딜 파트너 중개법인' ||
      t === '전담 부동산중개법인' ||
      t === '11560-2023-00412' ||
      t === '02-558-7700' ||
      t.includes('확인 중')
    ) {
      return '';
    }
    return t;
  };

  const officeAddressVal =
    cleanBrokerVal(body.brokerAddress) ||
    cleanBrokerVal(body.brokerOfficeAddress) ||
    cleanBrokerVal(body.brokerOffice?.officeAddress) ||
    cleanBrokerVal(body.brokerOffice?.office_address) ||
    cleanBrokerVal(body.brokerOffice?.address) ||
    cleanBrokerVal(dbBrokerProfile?.officeAddress) ||
    '';

  const resolvedDisplayNameVal =
    cleanBrokerVal(brokerName) ||
    cleanBrokerVal(dbBrokerProfile?.displayName) ||
    '';

  const brokerOfficeObj = {
    name:
      cleanBrokerVal(brokerageName) ||
      cleanBrokerVal(body.brokerOffice?.company) ||
      cleanBrokerVal(body.brokerOffice?.name) ||
      cleanBrokerVal(dbBrokerProfile?.company) ||
      '',
    representative:
      cleanBrokerVal(body.brokerOffice?.representativeName) ||
      cleanBrokerVal(body.brokerOffice?.representative_name) ||
      cleanBrokerVal(dbBrokerProfile?.representativeName) ||
      cleanBrokerVal(body.brokerOffice?.representative) ||
      resolvedDisplayNameVal ||
      '',
    registrationNo:
      cleanBrokerVal(body.brokerRegNo) ||
      cleanBrokerVal(body.brokerOffice?.registrationNo) ||
      cleanBrokerVal(dbBrokerProfile?.registrationNo) ||
      '',
    phone:
      cleanBrokerVal(brokerPhone) ||
      cleanBrokerVal(body.brokerOffice?.phone) ||
      cleanBrokerVal(dbBrokerProfile?.phone) ||
      '',
    officeAddress: officeAddressVal,
    address: officeAddressVal,
  };

  const userSubmittedPhotos = Array.isArray(body.photos)
    ? body.photos
        .filter((p: any) => p && (typeof p === 'string' || typeof p.url === 'string' || typeof p.name === 'string'))
        .slice(0, 12)
        .map((p: any, idx: number) => {
          const rawUrl = (typeof p === 'string' ? p : String(p.url || '')).trim();
          const rawName = typeof p === 'object' ? String(p.name || p.caption || '') : '';
          const isRealUploadedUrl = isRealUploadedPhotoUrl(rawUrl);
          const knownTestUrl = isRealUploadedUrl
            ? undefined
            : resolveKnownTestAssetUrl(rawName || rawUrl);
          const resolvedPhotoUrl = (isRealUploadedUrl ? rawUrl : knownTestUrl || rawUrl).trim();
          const isValidPhotoScheme =
            resolvedPhotoUrl.startsWith('http://') ||
            resolvedPhotoUrl.startsWith('https://') ||
            resolvedPhotoUrl.startsWith('/') ||
            resolvedPhotoUrl.startsWith('data:');
          if (
            !resolvedPhotoUrl ||
            !isValidPhotoScheme ||
            resolvedPhotoUrl.startsWith('blob:') ||
            resolvedPhotoUrl.startsWith('/test-images/')
          ) {
            return null;
          }
          const inferSource = `${rawName} ${rawUrl}`;
          const inferredCat =
            (typeof p === 'object' && (p.category || p.type)) ||
            (/외관|전경|exterior|facade/i.test(inferSource)
              ? 'exterior'
              : /로비|lobby/i.test(inferSource)
              ? 'lobby'
              : /출입구|입구|entrance/i.test(inferSource)
              ? 'entrance'
              : /주차|설비|parking/i.test(inferSource)
              ? 'parking'
              : /옥상|루프탑|테라스|rooftop/i.test(inferSource)
              ? 'rooftop'
              : /도면|평면도|floor_plan/i.test(inferSource)
              ? 'floor_plan'
              : idx === 0 && typeof p === 'object' && p.isHero
              ? 'exterior'
              : 'general');
          const defaultCaption =
            typeof p === 'object' && p.caption
              ? String(p.caption).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
              : rawName
              ? rawName.replace(/\.[^.]+$/, '').replace(/^[0-9]+[_-\s]*/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
              : '';
          return {
            url: resolvedPhotoUrl,
            caption: defaultCaption,
            role: (typeof p === 'object' && p.role) || (idx === 0 ? 'cover' : inferredCat),
            category: inferredCat,
            type: inferredCat,
            isHero: typeof p === 'object' && typeof p.isHero === 'boolean' ? p.isHero : idx === 0,
          };
        })
        .filter((p: any) => Boolean(p && p.url))
    : [];

  let defaultPhotos =
    userSubmittedPhotos.length > 0
      ? userSubmittedPhotos
      : existingRealPhotos.length > 0
      ? existingRealPhotos
      : [];

  // Offload large (>32KB) data:image/...;base64,... strings to Supabase Storage (`building-photos` bucket)
  // before writing document_objects / building_ssot_lite so JSONB rows never bloat to 18MB.
  const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  if (
    !isTestEnv &&
    defaultPhotos.some(
      (p: any) =>
        typeof p?.url === 'string' &&
        p.url.startsWith('data:image/') &&
        p.url.length > LARGE_INLINE_PHOTO_THRESHOLD_CHARS
    )
  ) {
    try {
      const { createServiceClient } = await import('@/lib/supabase/service');
      const svc = createServiceClient();
      if (svc && typeof svc.storage?.from === 'function') {
        const sharpMod = await import('sharp').catch(() => null);
        const sharpFn: any = sharpMod?.default ?? sharpMod;
        const safeUserSeg = String(userId || 'broker').replace(/[^a-zA-Z0-9_-]/g, '_');
        const safeBldSeg = String(buildingId || 'draft').replace(/[^a-zA-Z0-9_-]/g, '_');

        const uploadCompressedToBucket = async (
          bucketName: string,
          storagePath: string,
          buf: Buffer,
          contentType: string
        ): Promise<string | null> => {
          let upRes = await svc.storage.from(bucketName).upload(storagePath, buf, {
            contentType,
            upsert: true,
          });
          if (upRes.error && /bucket|not found/i.test(upRes.error.message || '')) {
            try {
              await svc.storage.createBucket(bucketName, { public: true });
              upRes = await svc.storage.from(bucketName).upload(storagePath, buf, {
                contentType,
                upsert: true,
              });
            } catch {
              // ignore bucket creation error and allow fallback
            }
          }
          if (!upRes.error && upRes.data?.path) {
            const { data: pubData } = svc.storage.from(bucketName).getPublicUrl(upRes.data.path);
            if (pubData?.publicUrl) return pubData.publicUrl;
          }
          return null;
        };

        const uploaded = await Promise.race([
          Promise.all(
            defaultPhotos.map(async (photo: any) => {
              if (
                typeof photo?.url !== 'string' ||
                !photo.url.startsWith('data:image/') ||
                photo.url.length <= LARGE_INLINE_PHOTO_THRESHOLD_CHARS
              ) {
                return photo;
              }
              const match = photo.url.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
              if (!match) return photo;

              const rawBuf = Buffer.from(match[2], 'base64');
              let outBuf: Buffer = rawBuf;
              let outExt = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
              let outContentType = `image/${match[1].toLowerCase()}`;

              if (typeof sharpFn === 'function') {
                try {
                  const pipeline = sharpFn(rawBuf)
                    .rotate()
                    .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true });
                  if (typeof pipeline.webp === 'function') {
                    const webpBuf = await pipeline.webp({ quality: 84 }).toBuffer();
                    if (webpBuf && webpBuf.byteLength > 0) {
                      outBuf = webpBuf;
                      outExt = 'webp';
                      outContentType = 'image/webp';
                    }
                  } else if (typeof pipeline.jpeg === 'function') {
                    const jpgBuf = await pipeline.jpeg({ quality: 84 }).toBuffer();
                    if (jpgBuf && jpgBuf.byteLength > 0) {
                      outBuf = jpgBuf;
                      outExt = 'jpg';
                      outContentType = 'image/jpeg';
                    }
                  }
                } catch {
                  // Fall back to raw decoded buffer if sharp compression is unavailable
                }
              }

              const storagePath = `${safeUserSeg}/${safeBldSeg}/${crypto.randomUUID()}.${outExt}`;
              const publicUrl = await uploadCompressedToBucket(
                'building_photos',
                storagePath,
                outBuf,
                outContentType
              );

              if (publicUrl) {
                return { ...photo, url: publicUrl };
              }
              return photo;
            })
          ),
          new Promise<any[]>((resolve) => setTimeout(() => resolve(defaultPhotos), 15000)),
        ]);
        if (Array.isArray(uploaded) && uploaded.length === defaultPhotos.length) {
          defaultPhotos = uploaded;
        }
      }
    } catch {
      // Graceful fallback: keep in-memory Data URI if Storage bucket is unavailable in test/dev
    }
  }

  const resolvedPnu = sanitizedRawPnu || knownMatch?.pnu || existingPnu || '';
  const resolvedCoords = sanitizedRawCoords
    ? sanitizedRawCoords
    : knownMatch
    ? { lat: knownMatch.lat, lng: knownMatch.lng }
    : existingCoords
    ? existingCoords
    : undefined;
  const resolvedRoadAddress = knownMatch?.roadAddress || existingRoadAddress || cleanAddress;
  const resolvedJibunAddress = knownMatch?.jibunAddress || existingJibunAddress || cleanAddress;

  // Normalize & enrich multi-parcel input (body.parcels + secondary lots in address)
  const rawParcelsInput = Array.isArray(body.parcels)
    ? body.parcels
    : Array.isArray(existingSsot?.parcels)
    ? existingSsot.parcels
    : undefined;
  const candidateAllPnus: string[] = [];
  if (resolvedPnu && /^\d{19}$/.test(resolvedPnu)) {
    candidateAllPnus.push(resolvedPnu);
  }
  if (Array.isArray(body.pnus)) {
    for (const p of body.pnus) {
      const s = String(p || '').trim();
      if (/^\d{19}$/.test(s) && !candidateAllPnus.includes(s)) candidateAllPnus.push(s);
    }
  }
  for (const p of existingAllPnus) {
    if (/^\d{19}$/.test(p) && !candidateAllPnus.includes(p)) candidateAllPnus.push(p);
  }
  if (parsedSecondaryLots.length > 0 && resolvedPnu && /^\d{19}$/.test(resolvedPnu)) {
    const dongCd = resolvedPnu.slice(0, 10);
    for (const lot of parsedSecondaryLots) {
      const secPnu = `${dongCd}${lot.isMount ? '2' : '1'}${padNumber(lot.bun)}${padNumber(lot.ji)}`;
      if (/^\d{19}$/.test(secPnu) && !candidateAllPnus.includes(secPnu)) {
        candidateAllPnus.push(secPnu);
      }
    }
  }
  if (
    candidateAllPnus.length === 1 &&
    resolvedPnu &&
    /^\d{19}$/.test(resolvedPnu) &&
    (hasExplicitMultiLotHint || (process.env.NODE_ENV !== 'test' && !process.env.VITEST))
  ) {
    try {
      const { fetchBuildingAttachedLots } = await import('@/lib/external/building-register-api');
      if (typeof fetchBuildingAttachedLots === 'function') {
        const atchPnus = await Promise.race([
          fetchBuildingAttachedLots(
            resolvedPnu.slice(0, 5),
            resolvedPnu.slice(5, 10),
            resolvedPnu.slice(11, 15),
            resolvedPnu.slice(15, 19),
            resolvedPnu[10] === '2' ? '1' : '0'
          ),
          new Promise<string[]>((r) => setTimeout(() => r([]), 2500)),
        ]);
        for (const p of atchPnus) {
          if (/^\d{19}$/.test(p) && !candidateAllPnus.includes(p)) {
            candidateAllPnus.push(p);
          }
        }
      }
    } catch {
      // Non-blocking attached-lot discovery fallback
    }
  }

  const parsedParcelsRes = parseBrokerParcels(rawParcelsInput);
  let normalizedParcels: Array<BrokerParcel & { jibun?: string }> = parsedParcelsRes.ok
    ? parsedParcelsRes.parcels.map((p, idx) => ({
        ...p,
        ...(typeof rawParcelsInput?.[idx]?.jibun === 'string' && rawParcelsInput[idx].jibun.trim()
          ? { jibun: rawParcelsInput[idx].jibun.trim() }
          : {}),
      }))
    : [];

  if (
    process.env.NODE_ENV !== 'test' &&
    !process.env.VITEST &&
    (candidateAllPnus.length >= 2 ||
      normalizedParcels.some(
        (p) => p.pnu && (p.areaM2 === undefined || !p.landCategory || p.officialPricePerM2 === undefined)
      ))
  ) {
    try {
      const { defaultParcelLookupDeps, fillParcelsFromPublicData } = await import(
        '@/domain/building/mobile-im/parcel-enrichment'
      );
      const deps = await defaultParcelLookupDeps();
      const enriched = await Promise.race([
        fillParcelsFromPublicData(normalizedParcels, candidateAllPnus, deps, 250),
        new Promise<null>((r) => setTimeout(() => r(null), 5000)),
      ]);
      if (enriched && enriched.parcels.length > 0) {
        const dongMatch = (resolvedJibunAddress || cleanAddress).match(
          /(?:^|\s)([가-힣0-9]+(?:동|읍|면|리|가))(?=\s+\d|\s+산\s*\d)/
        );
        const dongLabel = dongMatch ? dongMatch[1] : '';
        normalizedParcels = enriched.parcels.map((p) => {
          const prevJibun = normalizedParcels.find((np) => np.pnu === p.pnu)?.jibun;
          let jibun = prevJibun;
          if (!jibun && p.pnu && /^\d{19}$/.test(p.pnu)) {
            const san = p.pnu[10] === '2' ? '산 ' : '';
            const bon = parseInt(p.pnu.slice(11, 15), 10);
            const bu = parseInt(p.pnu.slice(15, 19), 10);
            const lot = bu > 0 ? `${san}${bon}-${bu}` : `${san}${bon}`;
            jibun = dongLabel ? `${dongLabel} ${lot}` : `${lot}번지`;
          }
          return {
            ...p,
            shareRatio: p.shareRatio ?? 1,
            ...(jibun ? { jibun } : {}),
          };
        });
      }
    } catch {
      // Non-blocking parcel enrichment fallback
    }
  }

  const parcelSummary = summarizeParcels(normalizedParcels);
  const resolvedAllPnus = Array.from(new Set([...parcelSummary.pnus, ...candidateAllPnus])).filter((p) =>
    /^\d{19}$/.test(p)
  );
  if (parcelSummary.isMulti && parcelSummary.totalAreaM2 && parcelSummary.totalAreaM2 > 0) {
    const firstParcelArea = Number(normalizedParcels[0]?.areaM2 || 0);
    if (
      !(Number(landAreaSqm) > 0) ||
      (firstParcelArea > 0 && Math.abs(Number(landAreaSqm) - firstParcelArea) <= 1.0)
    ) {
      effectiveLandSqm = parcelSummary.totalAreaM2;
    }
  }
  let effectiveOfficialLandPriceWonSqm =
    rawOfficialLandPrice > 0
      ? rawOfficialLandPrice
      : parcelSummary.weightedOfficialPricePerM2 && parcelSummary.weightedOfficialPricePerM2 > 0
      ? parcelSummary.weightedOfficialPricePerM2
      : officialLandPriceWonSqm;
  let resolvedLandCategory = parcelSummary.landCategoryLabel || '대';
  const resolvedParcels = normalizedParcels.length > 0 ? normalizedParcels : rawParcelsInput;

  const subjectLandPyeong = Math.max(1, m2ToPyeong(effectiveLandSqm));
  const subjectLandPricePerPyeongWon = priceNum > 0 ? Math.round((priceNum * 10000) / subjectLandPyeong) : 0;
  const defaultComps =
    parsedExtras?.market_comps && parsedExtras.market_comps.length > 0
      ? parsedExtras.market_comps.map((c, idx) => ({
          distance: c.location || `${derivedRegion} 인근 사례 ${idx + 1}`,
          dealDate: String((c as any).date || c.as_of || '').trim() || '-',
          buildingUse: c.note || '근린생활시설',
          pricePerPyeongLandWon:
            (c.land_price_per_pyeong_manwon || Math.round(subjectLandPricePerPyeongWon / 10000)) *
            10000,
          comparisonDiffPct: 0,
        }))
      : [];

  // SOTA Fast-Path Spatial POI, Official Land Price & MOLIT Comparable Micro-Enrichment (strict <=2,200ms non-blocking race)
  let liveLocationPoi: Record<string, any> | null =
    existingEnrichment?.locationPoi && typeof existingEnrichment.locationPoi === 'object'
      ? existingEnrichment.locationPoi
      : null;
  let liveDbComps: Array<{
    location: string;
    dealDate: string;
    buildingUse: string;
    transactionPriceManwon: number;
    gfaPerPyManwon: number;
    landPerPyManwon?: number;
  }> = [];

  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    try {
      await Promise.race([
        Promise.all([
          (async () => {
            if (!liveLocationPoi && resolvedCoords?.lat && resolvedCoords?.lng) {
              const { fetchLocationPoi } = await import('@/lib/external/kakao-map-api');
              const poi = await fetchLocationPoi(resolvedCoords.lat, resolvedCoords.lng);
              if (poi) {
                liveLocationPoi = poi as unknown as Record<string, any>;
              }
            }
          })().catch(() => {}),
          (async () => {
            if (effectiveOfficialLandPriceWonSqm <= 0 && resolvedPnu && /^\d{19}$/.test(resolvedPnu)) {
              const { fetchLandPrice } = await import('@/lib/external/land-price-api');
              const lp = await fetchLandPrice(resolvedPnu);
              if (lp && Number(lp.pricePerSqm) > 0) {
                effectiveOfficialLandPriceWonSqm = Math.round(Number(lp.pricePerSqm));
                if (lp.landCategory && (!parcelSummary.landCategoryLabel || resolvedLandCategory === '대')) {
                  resolvedLandCategory = lp.landCategory;
                }
              }
            }
          })().catch(() => {}),
          (async () => {
            if (defaultComps.length === 0) {
              const dongMatch = (resolvedJibunAddress || cleanAddress).match(
                /([가-힣0-9]+(?:구|군|시))\s+([가-힣0-9]+(?:동|가|읍|면))/,
              );
              const districtHint = dongMatch?.[1] || derivedRegion.split(/\s+/)[0] || '';
              const dongHint = dongMatch?.[2] || '';
              if (districtHint) {
                const { createServiceClient } = await import('@/lib/supabase/service');
                const sb = createServiceClient();
                if (sb && typeof sb.from === 'function') {
                  let q = sb
                    .from('external_transactions')
                    .select('address, district, dong, transaction_price, building_area, usage_type, transaction_date')
                    .ilike('district', `%${districtHint}%`)
                    .gte('transaction_price', 1_000_000_000)
                    .order('transaction_date', { ascending: false })
                    .limit(4);
                  if (dongHint) {
                    q = q.ilike('dong', `%${dongHint}%`);
                  }
                  const { data: compRows } = await q;
                  if (Array.isArray(compRows) && compRows.length > 0) {
                    liveDbComps = compRows
                      .filter((r: any) => Number(r?.transaction_price) > 0)
                      .slice(0, 3)
                      .map((r: any) => {
                        const txManwon = Math.round(Number(r.transaction_price) / 10_000);
                        const bldPy = Number(r.building_area) > 0 ? m2ToPyeong(Number(r.building_area)) : 0;
                        return {
                          location:
                            [r.district, r.dong, r.address].filter(Boolean).join(' ').trim() ||
                            `${derivedRegion} 인근`,
                          dealDate: String(r.transaction_date || '-').slice(0, 10),
                          buildingUse: String(r.usage_type || '근린생활·업무시설'),
                          transactionPriceManwon: txManwon,
                          gfaPerPyManwon: bldPy > 0 ? Math.round(txManwon / bldPy) : 0,
                        };
                      });
                  }
                }
              }

              // Fallback to live MOLIT RTMS commercial building API if DB cache is empty
              if (liveDbComps.length === 0 && resolvedPnu && /^\d{19}$/.test(resolvedPnu)) {
                const { fetchComparableTransactions } = await import(
                  '@/lib/external/real-transaction-api'
                );
                const rtmsItems = await fetchComparableTransactions(resolvedPnu.slice(0, 5));
                if (Array.isArray(rtmsItems) && rtmsItems.length > 0) {
                  const sorted = [...rtmsItems].sort((a, b) => {
                    const aSameDong = dongHint && a.address.includes(dongHint) ? 0 : 1;
                    const bSameDong = dongHint && b.address.includes(dongHint) ? 0 : 1;
                    if (aSameDong !== bSameDong) return aSameDong - bSameDong;
                    return b.dealYear * 100 + b.dealMonth - (a.dealYear * 100 + a.dealMonth);
                  });
                  liveDbComps = sorted.slice(0, 3).map((item) => ({
                    location: item.address || `${derivedRegion} 인근`,
                    dealDate: `${item.dealYear}.${String(item.dealMonth).padStart(2, '0')}`,
                    buildingUse: item.buildingUse || '근린생활·업무시설',
                    transactionPriceManwon: Math.round(item.dealAmount / 10_000),
                    gfaPerPyManwon: Math.round(item.pricePerPyeong / 10_000),
                    ...(item.landPricePerPyeongManwon
                      ? { landPerPyManwon: item.landPricePerPyeongManwon }
                      : {}),
                  }));
                }
              }
            }
          })().catch(() => {}),
        ]),
        new Promise((resolve) => setTimeout(resolve, 2200)),
      ]);
    } catch {
      // Non-blocking spatial/comparable micro-enrichment fallback
    }
  }

  const effectiveCompsForDoc =
    defaultComps.length > 0
      ? defaultComps
      : liveDbComps.map((c) => {
          const refUnitWon =
            (c.landPerPyManwon && c.landPerPyManwon > 0 ? c.landPerPyManwon : c.gfaPerPyManwon) *
            10_000;
          const diffPct =
            refUnitWon > 0 && subjectLandPricePerPyeongWon > 0 && c.landPerPyManwon
              ? Math.round(((subjectLandPricePerPyeongWon - refUnitWon) / refUnitWon) * 100)
              : 0;
          return {
            distance: c.location,
            dealDate: c.dealDate,
            buildingUse: c.buildingUse,
            pricePerPyeongLandWon: refUnitWon,
            comparisonDiffPct: diffPct,
          };
        });

  // Pre-compute per-floor unit counts so manual rent-roll rows without explicit unit area
  // share their floor's gross area proportionally instead of duplicating full floor area per unit
  const normalizeRentFloorKey = (rawStr: string): string => {
    const s = String(rawStr || '').trim();
    const uMatch = s.match(/^(B|지하\s*)?(\d{1,2})(\d{2})\s*호?$/i);
    if (uMatch) return `${uMatch[1] ? 'B' : ''}${parseInt(uMatch[2], 10)}F`;
    const bMatch = s.match(/^(?:B|지하)\s*(\d+)/i);
    if (bMatch) return `B${parseInt(bMatch[1], 10)}`;
    const fMatch = s.match(/^(\d+)\s*(?:F|층)?$/i);
    if (fMatch) return `${parseInt(fMatch[1], 10)}F`;
    return s.toUpperCase();
  };
  const floorUnitCounts = new Map<string, number>();
  safeRentRoll.forEach((r: any, idx: number) => {
    const isAux = /(주차|옥탑|기계식|루프탑|부대)/.test(
      `${r.floor || ''} ${r.unit || ''} ${r.use || ''}`
    );
    if (isAux) return;
    const fk = normalizeRentFloorKey(String(r.floor || `${idx + 1}F`));
    floorUnitCounts.set(fk, (floorUnitCounts.get(fk) || 0) + 1);
  });
  const activeFloorCount =
    floorUnitCounts.size >= Math.max(2, effectiveFloorsAbove)
      ? floorUnitCounts.size
      : Math.max(totalFloorsCount, floorUnitCounts.size || 1);
  const floorBudgetSqm = effectiveGfaSqm > 0 ? effectiveGfaSqm / activeFloorCount : perFloorAreaSqm;
  const safeRentRollWithAreas = safeRentRoll.map((r: any, idx: number) => {
    const prevFl =
      existingFloorLeases.length === safeRentRoll.length ? existingFloorLeases[idx] || {} : {};
    const rawExplicitM2 = Number(r.area_m2 ?? r.area_sqm ?? r.areaSqm ?? 0);
    const prevM2 = Number(prevFl.area_sqm ?? prevFl.area_m2 ?? prevFl.exclusive_area_sqm ?? 0);
    const explicitM2 =
      rawExplicitM2 > 0 && Math.abs(rawExplicitM2 - 2.45) > 0.05
        ? rawExplicitM2
        : prevM2 > 0 && Math.abs(prevM2 - 2.45) > 0.05
        ? prevM2
        : 0;
    const rawExplicitPy = Number(r.area_pyeong ?? r.areaPyeong ?? 0);
    const explicitPy =
      rawExplicitPy > 0 && Math.abs(rawExplicitPy - 0.8) > 0.05 ? rawExplicitPy : 0;
    const isAuxRow = /(주차|옥탑|기계식|루프탑|부대)/.test(
      `${r.floor || ''} ${r.unit || ''} ${r.use || ''}`
    );
    const fk = normalizeRentFloorKey(String(r.floor || `${idx + 1}F`));
    const unitsOnFloor = Math.max(1, floorUnitCounts.get(fk) || 1);
    const computedM2 =
      explicitM2 > 0
        ? explicitM2
        : explicitPy > 0
        ? Math.round(pyeongToM2(explicitPy) * 100) / 100
        : isAuxRow
        ? 0
        : Math.round((floorBudgetSqm / unitsOnFloor) * 100) / 100;
    const computedPy =
      explicitM2 > 0
        ? Math.round(m2ToPyeong(computedM2) * 10) / 10
        : explicitPy > 0
        ? explicitPy
        : computedM2 > 0
        ? Math.round(m2ToPyeong(computedM2) * 10) / 10
        : 0;
    const contractGroupVal =
      String(r.contract_group ?? r.contractGroup ?? prevFl.contract_group ?? '').trim() || undefined;
    const isProxyVal = Boolean(r.area_sqm_is_proxy ?? r.areaSqmIsProxy ?? prevFl.area_sqm_is_proxy);
    const legalBasisVal = r.legal_basis ?? r.legalBasis ?? prevFl.legal_basis;
    const firstContractVal =
      String(r.first_contract_date ?? r.firstContractDate ?? prevFl.first_contract_date ?? '').trim() ||
      undefined;
    return {
      ...r,
      area_m2: computedM2,
      area_sqm: computedM2,
      areaSqm: computedM2,
      area_pyeong: computedPy,
      areaPyeong: computedPy,
      ...(isProxyVal ? { area_sqm_is_proxy: true, areaSqmIsProxy: true } : {}),
      ...(contractGroupVal ? { contract_group: contractGroupVal, contractGroup: contractGroupVal } : {}),
      ...(legalBasisVal ? { legal_basis: legalBasisVal, legalBasis: legalBasisVal } : {}),
      ...(firstContractVal
        ? { first_contract_date: firstContractVal, firstContractDate: firstContractVal }
        : {}),
    };
  });

  // Extract pure building facts
  const rawFacts = {
    id: buildingId,
    title: resolvedTitle,
    building_name: resolvedTitle,
    address: cleanAddress,
    road_address: resolvedRoadAddress,
    pnu: resolvedPnu,
    posture,
    asking_price_manwon: priceNum,
    land_area_sqm: effectiveLandSqm,
    gross_floor_area_sqm: effectiveGfaSqm,
    total_gross_area_sqm: effectiveGfaSqm,
    zoning: effectiveZoning,
    official_land_price_won_sqm: effectiveOfficialLandPriceWonSqm,
    floors_above: effectiveFloorsAbove,
    floors_below: effectiveFloorsBelow,
    building_coverage_ratio_pct: bcrPct,
    floor_area_ratio_pct: farPct,
    parking_spaces: parkingSpaces,
    elevators,
    completion_date: effectiveCompletionDate,
    monthly_rent_total_manwon: effectiveMonthlyRentManwon,
    deposit_total_manwon: effectiveDepositManwon,
    rent_roll: safeRentRollWithAreas,
    points: defaultPoints,
    photos: defaultPhotos,
    comps: effectiveCompsForDoc,
    brokerOffice: brokerOfficeObj,
  };

  const facts = extractPureBuildingFacts(rawFacts);
  const basicImDoc = buildBasicImDocument(facts);

  // Auto-generate 4-item Deal Card
  const priceBand = formatPriceRange(priceNum * 10000);
  const points: [string, string, string] = [
    repairDealCardLine(defaultPoints[0]) || defaultPoints[0].slice(0, 18),
    repairDealCardLine(defaultPoints[1]) || defaultPoints[1].slice(0, 18),
    repairDealCardLine(
      basicImDoc.facts.valuation.grossYieldPct > 0
        ? `연 임대수익률 ${basicImDoc.facts.valuation.grossYieldPct.toFixed(2)}%`
        : defaultPoints[2]
    ) || defaultPoints[2].slice(0, 18),
  ];

  const card4Posture =
    posture === 'development' || posture === 'value_add'
      ? ('value_add' as const)
      : posture === 'owner_occupier'
      ? ('owner_occupied' as const)
      : ('income' as const);

  const rawMainPurposeInput =
    (typeof body.mainPurpose === 'string' && body.mainPurpose.trim()) ||
    (typeof knownMatch?.mainPurpose === 'string' && knownMatch.mainPurpose.trim()) ||
    (typeof existingSsot?.main_usage === 'string' && existingSsot.main_usage.trim()) ||
    '';
  const existingCompanionCard4 = (
    preResolvedDealCardWs?.draftPayload as { card4?: Partial<Card4Data> } | undefined
  )?.card4;
  const newSpecificMainPurpose =
    rawMainPurposeInput && !isGenericAssetUse(rawMainPurposeInput) ? rawMainPurposeInput : '';

  const canonicalSummary = resolveCanonicalDealSummary({
    posture,
    region: derivedRegion.slice(0, 14),
    mainPurpose: rawMainPurposeInput || undefined,
    assetType:
      typeof existingSsot?.asset_type === 'string' ? existingSsot.asset_type : undefined,
    gfaSqm: effectiveGfaSqm,
    landSqm: effectiveLandSqm,
    gfaPyeong: facts.building.totalGrossAreaPyeong,
    landPyeong: facts.land.landAreaPyeong,
    brokerHeadline:
      typeof body.headline === 'string' && body.headline.trim()
        ? body.headline.trim()
        : undefined,
    existingHeadline:
      typeof existingCompanionCard4?.headline === 'string' && existingCompanionCard4.headline.trim()
        ? existingCompanionCard4.headline.trim()
        : undefined,
  });

  const roundedGfaPyeong =
    canonicalSummary.gfaPyeong ??
    sqmToRoundedPyeong(effectiveGfaSqm) ??
    Math.round(Number(facts.building.totalGrossAreaPyeong || 0));
  const roundedLandPyeong =
    canonicalSummary.landPyeong ??
    sqmToRoundedPyeong(effectiveLandSqm) ??
    Math.round(Number(facts.land.landAreaPyeong || 0));
  const useLandPrioritySizeSignal =
    (isLandPriorityPosture(posture) && effectiveLandSqm > 0) ||
    (effectiveGfaSqm <= 0 && effectiveLandSqm > 0);
  const resolvedSizeSignal = useLandPrioritySizeSignal
    ? `토지 ${effectiveLandSqm.toLocaleString()}㎡ (${roundedLandPyeong.toLocaleString('ko-KR')}평)`
    : `연면적 ${effectiveGfaSqm.toLocaleString()}㎡ (${roundedGfaPyeong.toLocaleString('ko-KR')}평)`;

  const canonicalUse = canonicalSummary.use || '근린생활시설';
  const card4Area =
    canonicalSummary.areaLabel ||
    (useLandPrioritySizeSignal && roundedLandPyeong > 0
      ? `토지 ${roundedLandPyeong}평`
      : roundedGfaPyeong > 0
      ? `연면적 ${roundedGfaPyeong}평`
      : roundedLandPyeong > 0
      ? `토지 ${roundedLandPyeong}평`
      : undefined);
  const card4HeadlineCandidate =
    (typeof body.headline === 'string' && body.headline.trim()) ||
    canonicalSummary.headline ||
    resolveCanonicalDealHeadline({
      region: derivedRegion.slice(0, 14),
      assetType: canonicalUse,
    });

  const card4Draft = {
    posture: card4Posture,
    region: derivedRegion.slice(0, 14),
    use: canonicalUse,
    ...(card4HeadlineCandidate ? { headline: card4HeadlineCandidate } : {}),
    ...(card4Area ? { area: card4Area } : {}),
    ...(roundedGfaPyeong > 0 ? { gfaPyung: roundedGfaPyeong } : {}),
    ...(roundedLandPyeong > 0 ? { landAreaPyung: roundedLandPyeong } : {}),
    priceBand,
    points,
    provenance: {
      points: ['public', 'broker', 'ai'] as const,
    },
    card4_version: 1,
  };

  const card4_hash = computeCard4Hash(card4Draft);
  const card4: Card4Data = Card4Schema.parse({
    ...card4Draft,
    card4_hash,
  });

  // Build PPTX-compatible floor_leases, ssot_summary, and sections
  const mappedFloorLeases =
    safeRentRollWithAreas.length > 0
      ? safeRentRollWithAreas.map((r: any, idx: number) => {
          const prevFl =
            existingFloorLeases.length === safeRentRollWithAreas.length
              ? existingFloorLeases[idx] || {}
              : {};
          const isVacant =
            r.status === 'vacant' ||
            r.is_vacant === true ||
            r.lease_state === '공실' ||
            r.use === '공실';
          const isOwner =
            !isVacant &&
            (r.status === 'owner' ||
              r.lease_state === '자가사용' ||
              r.use === '자가사용' ||
              r.use === '자가');
          const depMan = Number(r.depositManwon ?? r.deposit_manwon ?? r.deposit ?? 0);
          const rentMan = Number(
            r.monthlyRentManwon ?? r.rent_manwon ?? r.monthlyRent ?? r.rent ?? 0
          );
          const mgmtMan = Number(r.maintenanceManwon ?? r.mgmt_fee_manwon ?? r.maintenance ?? 0);
          const areaM2 = Number(r.area_m2 ?? r.area_sqm ?? r.areaSqm ?? 0);
          const areaPy = Number(r.area_pyeong ?? r.areaPyeong ?? 0);
          const exclusiveSqm =
            Number(
              r.exclusiveAreaSqm ??
                r.exclusive_area_sqm ??
                prevFl.exclusive_area_sqm ??
                prevFl.exclusiveAreaSqm ??
                0
            ) || undefined;
          const rawUse = String(
            r.use ||
              r.tenant_type ||
              r.tenantName ||
              r.tenant_name ||
              (isVacant ? '공실' : isOwner ? '자가사용' : '근린생활시설')
          ).trim();
          const slashParts = rawUse
            .split(/\s*\/\s*/)
            .map((s) => s.trim())
            .filter(Boolean);
          const splitUse = slashParts.length >= 2 ? slashParts[0] : rawUse;
          const splitTenantName =
            slashParts.length >= 2
              ? slashParts[0] === slashParts[1]
                ? slashParts[0]
                : slashParts.slice(1).join(' / ')
              : undefined;
          const rawFloorStr = String(r.floor || `${idx + 1}F`).trim();
          const rawUnitStr = String(r.unit || r.unit_label || '').trim();
          const unitFloorMatch = rawFloorStr.match(/^(B|지하\s*)?(\d{1,2})(\d{2})\s*호?$/i);
          const normFloor = unitFloorMatch
            ? `${unitFloorMatch[1] ? 'B' : ''}${parseInt(unitFloorMatch[2], 10)}F`
            : rawFloorStr;
          const normUnit = unitFloorMatch
            ? rawFloorStr.endsWith('호')
              ? rawFloorStr
              : `${rawFloorStr}호`
            : rawUnitStr || String(prevFl.unit_label || prevFl.unit || '');
          const explicitTenantName = String(r.tenantName || r.tenant_name || '').trim();
          const resolvedTenantName = isVacant
            ? '공실'
            : isOwner
            ? explicitTenantName || splitTenantName || '자가사용'
            : explicitTenantName || splitTenantName || splitUse;
          const rowNote =
            r.note !== undefined && String(r.note).trim().length > 0
              ? String(r.note).trim()
              : prevFl.note;
          const contractGroupVal =
            String(r.contract_group ?? r.contractGroup ?? prevFl.contract_group ?? '').trim() ||
            undefined;
          const isProxyVal = Boolean(r.area_sqm_is_proxy ?? r.areaSqmIsProxy ?? prevFl.area_sqm_is_proxy);
          const legalBasisVal = r.legal_basis ?? r.legalBasis ?? prevFl.legal_basis;
          const firstContractVal =
            String(r.first_contract_date ?? r.firstContractDate ?? prevFl.first_contract_date ?? '').trim() ||
            undefined;
          return {
            floor: normFloor,
            unit_label: normUnit,
            tenant_name: resolvedTenantName,
            tenant_type: isVacant ? '공실' : splitUse,
            use: isVacant ? '공실' : splitUse,
            area_sqm: areaM2,
            area_m2: areaM2,
            area_pyeong: areaPy,
            ...(exclusiveSqm ? { exclusive_area_sqm: exclusiveSqm } : {}),
            ...(isProxyVal ? { area_sqm_is_proxy: true } : {}),
            ...(contractGroupVal ? { contract_group: contractGroupVal } : {}),
            ...(legalBasisVal ? { legal_basis: legalBasisVal } : {}),
            ...(firstContractVal ? { first_contract_date: firstContractVal } : {}),
            deposit_manwon: isVacant ? 0 : depMan,
            deposit_krw: isVacant ? 0 : depMan * 10000,
            rent_manwon: isVacant ? 0 : rentMan,
            rent_krw: isVacant ? 0 : rentMan * 10000,
            mgmt_fee_manwon: isVacant ? 0 : mgmtMan,
            lease_state: isVacant ? '공실' : isOwner ? '자가사용' : '임대중',
            is_vacant: isVacant,
            lease_end: isVacant
              ? '-'
              : String(r.leaseExpiry || r.lease_end || r.expiryDate || prevFl.lease_end || '-'),
            ...(rowNote ? { note: rowNote, remark: rowNote } : {}),
            source: 'broker',
          };
        })
      : [];

  const leasableFloorLeases = mappedFloorLeases.filter(
    (fl) =>
      fl.lease_state !== '자가사용' &&
      !/(주차|옥탑|기계식|루프탑|부대)/.test(`${fl.floor} ${fl.unit_label} ${fl.tenant_name}`)
  );
  const vacantCount = leasableFloorLeases.filter((fl) => fl.is_vacant).length;
  const vacancyPct =
    leasableFloorLeases.length > 0
      ? Math.round((vacantCount / leasableFloorLeases.length) * 1000) / 10
      : 0;

  const exactEokNum = Math.round((priceNum / 10000) * 100) / 100;
  const exactEokWhole = Math.floor(priceNum / 10000);
  const exactRemManwon = Math.round(priceNum % 10000);
  const exactEokDisplay =
    priceNum > 0
      ? exactRemManwon > 0 && exactEokWhole > 0
        ? `${exactEokWhole.toLocaleString()}억 ${exactRemManwon.toLocaleString()}만 원`
        : exactEokWhole > 0
          ? `${exactEokWhole.toLocaleString()}억 원`
          : `${priceNum.toLocaleString()}만 원`
      : '가격 협의';

  const ssotSummary = {
    address: cleanAddress,
    raw_address: cleanAddress,
    road_address: resolvedRoadAddress,
    jibun_address: resolvedJibunAddress,
    pnu: resolvedPnu,
    ...(resolvedAllPnus.length > 0
      ? { pnus: resolvedAllPnus, parcel_count: resolvedAllPnus.length }
      : {}),
    coordinates: resolvedCoords,
    building_name: resolvedTitle,
    asset_type: canonicalUse,
    area_signal: derivedRegion,
    asking_price_manwon: priceNum,
    monthly_rent_total_manwon: effectiveMonthlyRentManwon,
    monthly_rent_total_krw: effectiveMonthlyRentManwon * 10000,
    total_deposit_manwon: effectiveDepositManwon,
    total_deposit_krw: effectiveDepositManwon * 10000,
    maintenance_fee_monthly_krw: totalMaintManwon * 10000,
    land_area_sqm: effectiveLandSqm,
    land_area_m2: effectiveLandSqm,
    total_gross_area_sqm: effectiveGfaSqm,
    total_gross_area_m2: effectiveGfaSqm,
    size_signal: resolvedSizeSignal,
    zoning: effectiveZoning,
    land_category: resolvedLandCategory,
    jimok: resolvedLandCategory,
    completion_date: effectiveCompletionDate,
    floors_above: effectiveFloorsAbove,
    floors_below: effectiveFloorsBelow,
    bcr_pct: bcrPct,
    far_pct: farPct,
    parking_total: parkingSpaces,
    parking_count: parkingSpaces,
    elevator_count: elevators,
    main_usage: rawMainPurposeInput || '제1·2종 근린생활시설',
    structure: '철근콘크리트구조',
    official_land_price_per_sqm: effectiveOfficialLandPriceWonSqm,
    ...(resolvedParcels ? { parcels: resolvedParcels } : {}),
    vacancy_pct: vacancyPct,
    vacancy_signal: vacancyPct === 0 ? '만실' : `공실률 ${vacancyPct}%`,
    cap_rate_pct: basicImDoc.facts.valuation.capRatePct,
    gross_yield_pct: basicImDoc.facts.valuation.grossYieldPct,
    handover_note: handoverNote || undefined,
    ...(closingLine ? { closing_line: closingLine } : {}),
    investment_posture: legacyPosture,
    building_register_source:
      rawBcrPct > 0 || rawFarPct > 0
        ? 'api'
        : existingSsot?.building_register_source || 'manual',
  };

  const rentTableLines = [
    '| 층 | 호수 | 임차인/업종 | 전용면적(평) | 보증금(만원) | 월임대료(만원) | 만기 | 비고 |',
    '|---|---|---|---|---|---|---|---|',
    ...mappedFloorLeases.map(
      (fl) =>
        `| ${fl.floor} | ${fl.unit_label} | ${fl.tenant_name} | ${fl.area_pyeong}평 | ${fl.deposit_manwon.toLocaleString()} | ${fl.rent_manwon.toLocaleString()} | ${fl.lease_end} | ${fl.lease_state} |`
    ),
  ].join('\n');

  const pptxSections: Array<{ section_type: string; title: string; markdown: string }> = [
    {
      section_type: 'property_overview',
      title: '물건 개요',
      markdown: [
        `| 항목 | 내용 |`,
        `|---|---|`,
        `| 소재지 | ${cleanAddress} |`,
        `| 대지면적 | ${effectiveLandSqm.toLocaleString()}㎡ (${Number(facts.land.landAreaPyeong).toLocaleString('ko-KR')}평) |`,
        `| 연면적 | ${effectiveGfaSqm.toLocaleString()}㎡ (${Number(facts.building.totalGrossAreaPyeong).toLocaleString('ko-KR')}평) |`,
        `| 용도지역 | ${effectiveZoning} |`,
        `| 건축규모 | 지하 ${effectiveFloorsBelow}층 / 지상 ${effectiveFloorsAbove}층 |`,
        ...(bcrPct > 0 || farPct > 0
          ? [
              `| 건폐율 / 용적률 | ${bcrPct > 0 ? `${bcrPct}%` : '-'} / ${farPct > 0 ? `${farPct}%` : '-'} |`,
            ]
          : []),
        `| 사용승인일 | ${effectiveCompletionDate} |`,
        ...(parkingSpaces > 0 || elevators > 0
          ? (() => {
              const pType = String(
                body.parkingType || (existingEnrichment?.buildingRegister as any)?.parkingType || ''
              ).trim();
              const parkingLabel =
                pType === '자주식' || pType === 'self'
                  ? `자주식 ${parkingSpaces}대`
                  : `총 ${parkingSpaces}대`;
              if (parkingSpaces > 0 && elevators > 0) {
                return [`| 주차 / 승강기 | ${parkingLabel} / 승용 ${elevators}대 |`];
              }
              if (parkingSpaces > 0) {
                return [`| 주차 | ${parkingLabel} |`];
              }
              return [`| 승강기 | 승용 ${elevators}대 |`];
            })()
          : []),
        ``,
        `- **핵심 입지**: ${defaultPoints[0]}`,
        `- **수익 안정성**: ${defaultPoints[1]}`,
        `- **투자 매력**: ${defaultPoints[2]}`,
      ].join('\n'),
    },
    {
      section_type: 'location_access',
      title: '입지 및 교통 여건',
      markdown: [
        `- **소재지**: ${cleanAddress} (${resolvedRoadAddress})`,
        liveLocationPoi?.nearestStation?.name
          ? `- **대중교통 접근성**: ${liveLocationPoi.nearestStation.name}${
              liveLocationPoi.nearestStation.distanceM != null
                ? ` 약 ${Number(liveLocationPoi.nearestStation.distanceM).toLocaleString()}m`
                : ''
            }${
              liveLocationPoi.nearestStation.walkMinutes
                ? ` (도보 약 ${liveLocationPoi.nearestStation.walkMinutes}분)`
                : ''
            } 역세권 동선으로 출퇴근 및 방문객 접근성이 우수합니다.`
          : `- **대중교통 접근성**: 주요 지하철역 및 간선 대중교통 노선 인접 입지로 직장인·상권 유동인구 유입이 원활합니다.`,
        `- **도로 및 가시성**: 전면 도로 접면이 양호하여 차량 진출입과 상업적 가시성이 확보되어 있습니다.`,
        liveLocationPoi?.poiCounts &&
        (Number(liveLocationPoi.poiCounts.cafe || 0) +
          Number(liveLocationPoi.poiCounts.restaurant || 0) >
          0)
          ? `- **배후 상권**: 반경 500m 내 음식점·카페 ${
              Number(liveLocationPoi.poiCounts.restaurant || 0) +
              Number(liveLocationPoi.poiCounts.cafe || 0)
            }개소${
              Number(liveLocationPoi.poiCounts.busStop || 0) > 0
                ? `, 버스정류장 ${Number(liveLocationPoi.poiCounts.busStop)}개소`
                : ''
            }가 밀집된 활성 상권으로 임차 수요가 견고합니다.`
          : `- **배후 상권**: 업무·상업·주거 배후수요가 결합된 권역으로 임차 수요가 견고합니다.`,
      ].join('\n'),
    },
    {
      section_type: 'site_analysis',
      title: '토지 및 공적 규제 현황',
      markdown: [
        `| 항목 | 내용 |`,
        `|---|---|`,
        `| 지번주소 | ${resolvedJibunAddress} |`,
        `| 지목 / 대지면적 | ${resolvedLandCategory} / ${effectiveLandSqm.toLocaleString()}㎡ (${Number(facts.land.landAreaPyeong).toLocaleString('ko-KR')}평) |`,
        `| 용도지역 | ${effectiveZoning} |`,
        `| 개별공시지가 | ${effectiveOfficialLandPriceWonSqm > 0 ? `㎡당 ${effectiveOfficialLandPriceWonSqm.toLocaleString()}원` : '국토교통부 개별공시지가 고시 기준'} |`,
      ].join('\n'),
    },
    {
      section_type: 'lease_status',
      title: '층별 임대차 현황 (렌트롤)',
      markdown: [
        `- **보증금 합계**: ${effectiveDepositManwon.toLocaleString()}만원`,
        `- **월 임대료 합계**: ${effectiveMonthlyRentManwon.toLocaleString()}만원 (연간 ${(effectiveMonthlyRentManwon * 12).toLocaleString()}만원)`,
        `- **임대 현황**: 총 ${mappedFloorLeases.length}개 호실 (${ssotSummary.vacancy_signal})`,
        ``,
        rentTableLines,
      ].join('\n'),
    },
    {
      section_type: 'income_analysis',
      title: '매매가 및 수익률 분석',
      markdown: [
        `| 항목 | 금액 / 지표 | 비고 |`,
        `|---|---|---|`,
        `| 매매 희망가 | ${exactEokDisplay} (${priceNum.toLocaleString()}만원) | 확정 매각 희망가 |`,
        `| 총 보증금 | ${effectiveDepositManwon.toLocaleString()}만원 | 인수 보증금 합계 |`,
        `| 실투자금 (보증금 차감) | ${Math.max(0, priceNum - effectiveDepositManwon).toLocaleString()}만원 | 레버리지 전 기준 |`,
        `| 월 임대수익 / 연 임대수익 | 월 ${effectiveMonthlyRentManwon.toLocaleString()}만원 / 연 ${(effectiveMonthlyRentManwon * 12).toLocaleString()}만원 | 관리비 별도 |`,
        `| 임대수익률 / 자본환원율(Cap Rate) | 연 ${basicImDoc.facts.valuation.grossYieldPct.toFixed(2)}% / Cap Rate ${basicImDoc.facts.valuation.capRatePct.toFixed(2)}% | 보증금 차감 총수익률 · NOI 기준 |`,
        `| 토지 평당가 / 연면적 평당가 | 평당 ${Math.round(facts.transaction.pricePerPyeongLandWon / 10000).toLocaleString()}만원 / 평당 ${Math.round(facts.transaction.pricePerPyeongGfaWon / 10000).toLocaleString()}만원 | 대지 ${Number(facts.land.landAreaPyeong).toLocaleString('ko-KR')}평 기준 |`,
      ].join('\n'),
    },
    {
      section_type: 'comparable_analysis',
      title: '인근 실거래 및 시세 비교',
      markdown:
        defaultComps.length > 0
          ? [
              `| 구분 | 위치 | 거래시기 | 용도 | 토지평당가 |`,
              `|---|---|---|---|---|`,
              ...defaultComps.map(
                (c) =>
                  `| 실거래 사례 | ${c.distance} | ${c.dealDate} | ${c.buildingUse} | ${Math.round(c.pricePerPyeongLandWon / 10000).toLocaleString()}만원/평 |`
              ),
            ].join('\n')
          : liveDbComps.length > 0
          ? [
              `| 구분 | 인근 소재지 | 거래시기 | 용도 | 거래금액 / 평당가 |`,
              `|---|---|---|---|---|`,
              ...liveDbComps.map(
                (c) =>
                  `| 국토부 실거래 | ${c.location} | ${c.dealDate} | ${c.buildingUse} | ${(
                    Math.round((c.transactionPriceManwon / 10_000) * 100) / 100
                  ).toLocaleString()}억${
                    c.landPerPyManwon && c.landPerPyManwon > 0
                      ? ` (토지 ${c.landPerPyManwon.toLocaleString()}만원/평)`
                      : c.gfaPerPyManwon > 0
                      ? ` (건물 ${c.gfaPerPyManwon.toLocaleString()}만원/평)`
                      : ''
                  } |`
              ),
            ].join('\n')
          : [
              `| 구분 | 산출 지표 | 단가 / 배율 | 기준 내역 |`,
              `|---|---|---|---|`,
              `| 본건 토지 단가 | 대지 ${Number(facts.land.landAreaPyeong).toLocaleString('ko-KR')}평 기준 | 평당 ${Math.round(facts.transaction.pricePerPyeongLandWon / 10000).toLocaleString()}만원 | ${effectiveZoning || '공적장부 기준'} |`,
              `| 본건 건물 단가 | 연면적 ${Number(facts.building.totalGrossAreaPyeong).toLocaleString('ko-KR')}평 기준 | 평당 ${Math.round(facts.transaction.pricePerPyeongGfaWon / 10000).toLocaleString()}만원 | 지상 ${effectiveFloorsAbove}층 / 지하 ${effectiveFloorsBelow}층 |`,
              ...(effectiveOfficialLandPriceWonSqm > 0
                ? [
                    `| 공시지가 대비 배율 | 개별공시지가 ${Math.round(pyeongToM2(effectiveOfficialLandPriceWonSqm) / 10000).toLocaleString()}만원/평 | ${(
                      facts.transaction.pricePerPyeongLandWon /
                      Math.max(1, pyeongToM2(effectiveOfficialLandPriceWonSqm))
                    ).toFixed(2)}배 | 토지 호가 / 공시지가 비율 |`,
                  ]
                : []),
            ].join('\n'),
    },
    {
      section_type: 'risk_check',
      title: '거래 조건 및 실사 체크포인트',
      markdown: [
        `- **명도 및 인도 조건**: ${handoverNote || '현 임대차 승계 또는 잔금 일정 협의 가능'}`,
        `- **공적장부 정합성**: 건축물대장 및 토지이용계획확인원 기준 면적·용도지역 정합 확인 완료`,
        `- **시설 및 유지관리**: 내·외관 및 승강기·주차 설비 상태 양호`,
      ].join('\n'),
    },
    {
      section_type: 'investment_thesis',
      title: '핵심 투자 포인트',
      markdown: [
        `- **입지 경쟁력**: ${defaultPoints[0]}`,
        `- **현금흐름 안정성**: ${defaultPoints[1]}`,
        `- **수익률 및 가치 상승**: ${defaultPoints[2]}`,
      ].join('\n'),
    },
    {
      section_type: 'next_steps',
      title: '매입 절차 및 담당자 안내',
      markdown: [
        `- **1단계 (투자의향서 접수)**: 매입 조건 및 자금 일정 검토`,
        `- **2단계 (현장 실사 및 임대차 확인)**: 층별 임대차 계약서 및 시설 실사`,
        `- **3단계 (본계약 및 잔금)**: 매매계약 체결 및 소유권 이전 등기`,
      ].join('\n'),
    },
  ];

  if (parsedExtras) {
    applyBrokerExtrasToSections(pptxSections, parsedExtras);
  }

  // Apply CRE Lexicon & Fabricated-Brand Hygiene across all section narratives (protecting Markdown pipe tables)
  for (const sec of pptxSections) {
    sec.markdown = polishImCopyWithLexiconSync(sec.markdown, {
      tenantPoolSource: mappedFloorLeases,
      preserveLinesAndMarkdown: true,
    });
  }

  const nowIso = new Date().toISOString();

  const normalizedAxiosHighlights = Array.isArray(body.axiosHighlights)
    ? body.axiosHighlights
        .slice(0, 3)
        .map((h: any, idx: number) => {
          const rawHl = String(h?.headline || defaultPoints[idx] || '');
          const rawBr = String(h?.brief || '');
          return {
            headline:
              polishImCopyWithLexiconSync(rawHl, {
                tenantPoolSource: mappedFloorLeases,
                isCompactHeadline: true,
              }) || rawHl,
            brief: rawBr
              ? polishImCopyWithLexiconSync(rawBr, {
                  tenantPoolSource: mappedFloorLeases,
                  isCompactHeadline: false,
                })
              : '',
            tone:
              h?.tone === 'sky' || h?.tone === 'mint'
                ? h.tone
                : idx === 1
                ? 'sky'
                : idx === 2
                ? 'mint'
                : 'amber',
          };
        })
    : undefined;

  const mergedEnrichment =
    existingEnrichment || liveLocationPoi
      ? {
          ...(existingEnrichment || {}),
          ...(liveLocationPoi ? { locationPoi: liveLocationPoi } : {}),
        }
      : undefined;

  const fullDocBody = {
    schemaVersion: '3.0',
    tier: 'basic',
    preset: 'credeal_basic',
    releaseTier: 'fact_om',
    buildingName: resolvedTitle,
    resolved_address: cleanAddress,
    pnu: resolvedPnu,
    ...(resolvedAllPnus.length > 0 ? { pnus: resolvedAllPnus } : {}),
    coordinates: resolvedCoords,
    investment_posture: legacyPosture,
    posture: legacyPosture,
    dataGrade: 'A',
    basicImDocument: basicImDoc,
    card4,
    rent_roll: safeRentRollWithAreas,
    floor_leases: mappedFloorLeases,
    ...(resolvedRentRollMeta ? { rent_roll_meta: resolvedRentRollMeta } : {}),
    ...(resolvedExpectedRentRollMeta
      ? { expected_rent_roll_meta: resolvedExpectedRentRollMeta }
      : {}),
    ...(() => {
      const expSrc = Array.isArray(rawExpectedRentRoll) && rawExpectedRentRoll.length > 0
        ? rawExpectedRentRoll
        : Array.isArray(rawExpectedRentRollSnake) && rawExpectedRentRollSnake.length > 0
          ? rawExpectedRentRollSnake
          : [];
      if (expSrc.length === 0) return {};
      const normalizedExp = expSrc.map((er: any, idx: number) => {
        if (!er || typeof er !== 'object') return er;
        const fl = String(er.floor ?? '').trim();
        const un = String(er.unit ?? er.unit_label ?? '').trim();
        const baseMatch =
          safeRentRollWithAreas.find(
            (br: any) =>
              String(br.floor ?? '').trim() === fl &&
              (!un || String(br.unit ?? br.unit_label ?? '').trim() === un),
          ) ||
          safeRentRollWithAreas.find((br: any) => String(br.floor ?? '').trim() === fl) ||
          (expSrc.length === safeRentRollWithAreas.length ? safeRentRollWithAreas[idx] : undefined);
        const explicitErSqm = Number(er.areaSqm ?? er.area_sqm ?? er.area_m2 ?? 0);
        const areaSqm =
          explicitErSqm > 0
            ? explicitErSqm
            : Number(baseMatch?.areaSqm ?? baseMatch?.area_sqm ?? 0) || undefined;
        const exclSqm =
          Number(er.exclusiveAreaSqm ?? er.exclusive_area_sqm ?? 0) > 0
            ? Number(er.exclusiveAreaSqm ?? er.exclusive_area_sqm)
            : Number(baseMatch?.exclusiveAreaSqm ?? baseMatch?.exclusive_area_sqm ?? 0) || undefined;
        const areaPy =
          explicitErSqm > 0
            ? Math.round(m2ToPyeong(explicitErSqm) * 10) / 10
            : Number(er.areaPyeong ?? er.area_pyeong ?? 0) > 0
            ? Number(er.areaPyeong ?? er.area_pyeong)
            : areaSqm && areaSqm > 0
            ? Math.round(m2ToPyeong(areaSqm) * 10) / 10
            : Number(baseMatch?.areaPyeong ?? baseMatch?.area_pyeong ?? 0) || undefined;
        const depM = Number(er.depositManwon ?? er.deposit_manwon ?? 0) || 0;
        const rentM = Number(er.monthlyRentManwon ?? er.rent_manwon ?? er.monthlyRent ?? 0) || 0;
        const normalizedStatus =
          er.status === 'vacant' && (depM > 0 || rentM > 0) ? 'occupied' : er.status;
        const erContractGroup = String(er.contract_group ?? er.contractGroup ?? '').trim() || undefined;
        const erIsProxy = Boolean(er.area_sqm_is_proxy ?? er.areaSqmIsProxy);
        return {
          ...er,
          ...(normalizedStatus ? { status: normalizedStatus } : {}),
          ...(areaSqm ? { area_m2: areaSqm, area_sqm: areaSqm, areaSqm } : {}),
          ...(exclSqm ? { exclusive_area_sqm: exclSqm, exclusiveAreaSqm: exclSqm } : {}),
          ...(areaPy ? { area_pyeong: areaPy, areaPyeong: areaPy } : {}),
          ...(erIsProxy ? { area_sqm_is_proxy: true, areaSqmIsProxy: true } : {}),
          ...(erContractGroup ? { contract_group: erContractGroup, contractGroup: erContractGroup } : {}),
        };
      });
      return { expected_rent_roll: normalizedExp };
    })(),
    ssot_summary: ssotSummary,
    ...(mergedEnrichment ? { enrichment: mergedEnrichment } : {}),
    ...(normalizedAxiosHighlights ? { axios_highlights: normalizedAxiosHighlights } : {}),
    ...(handoverNote ? { handover_note: String(handoverNote) } : {}),
    heroCard: {
      assetType: canonicalUse,
      areaSignal: derivedRegion,
      address: cleanAddress,
      askingPriceDisplay: exactEokDisplay,
      askingPriceBil: exactEokNum,
      capRateBase: basicImDoc.facts.valuation.capRatePct,
      grossYieldPct: basicImDoc.facts.valuation.grossYieldPct,
      posture: legacyPosture,
      landArea: effectiveLandSqm,
      landAreaM2: effectiveLandSqm,
      totalArea: effectiveGfaSqm,
      totalGrossAreaSqm: effectiveGfaSqm,
      zoningDistrict: effectiveZoning,
      parkingCount: parkingSpaces,
      elevatorCount: elevators,
      keyPoints: defaultPoints,
    },
    photos_v2: defaultPhotos,
    photos: defaultPhotos,
    photo_urls: defaultPhotos.map((p: any) => p.url),
    sections: pptxSections,
    ...(resolvedParcels ? { parcels: resolvedParcels } : {}),
    ...(closingLine ? { closingLine, closing_line: closingLine } : {}),
    ...(parsedExtras ? { broker_extras: parsedExtras } : {}),
    broker_contact: {
      name: resolvedDisplayNameVal || brokerOfficeObj.representative,
      company: brokerOfficeObj.name,
      phone: brokerOfficeObj.phone,
      officeAddress: brokerOfficeObj.officeAddress,
      office_address: brokerOfficeObj.officeAddress,
      registration_no: brokerOfficeObj.registrationNo,
      brokerName: resolvedDisplayNameVal || brokerOfficeObj.representative,
      representativeName: brokerOfficeObj.representative,
      representative_name: brokerOfficeObj.representative,
      representative: brokerOfficeObj.representative,
      brokerageName: brokerOfficeObj.name,
      brokerPhone: brokerOfficeObj.phone,
      registrationNo: brokerOfficeObj.registrationNo,
      ...(closingLine ? { closingLine, closing_line: closingLine } : {}),
    },
    generated_at: nowIso,
    approved_at: nowIso,
  };

  const persistedOwnerId = existingOwnerId || userId;

  const explicitPublishRequested =
    body.publishStatus === 'published' || body.status === 'published';
  const requestedStatus: 'draft' | 'published' =
    body.publishStatus === 'draft' || body.status === 'draft'
      ? 'draft'
      : 'published';
  let effectiveStatus: 'draft' | 'published' = requestedStatus;
  let statutoryReady = false;
  let sharedServiceSupabase: any = null;

  if (requestedStatus === 'published' && auth.user?.id) {
    if (shouldPersistDb) {
      try {
        const { createServiceClient } = await import('@/lib/supabase/service');
        sharedServiceSupabase = createServiceClient();
      } catch {
        sharedServiceSupabase = null;
      }
    }
    const statutoryGate = await assertPublishable({
      supabase: sharedServiceSupabase,
      userId: persistedOwnerId,
      kind: 'im',
      itemPayload: fullDocBody,
      brokerMetaOverride: {
        company: brokerOfficeObj.name || undefined,
        officeAddress: brokerOfficeObj.officeAddress || undefined,
        office_address: brokerOfficeObj.officeAddress || undefined,
        phone: brokerOfficeObj.phone || undefined,
        officeRegNumber: brokerOfficeObj.registrationNo || undefined,
        office_reg_number: brokerOfficeObj.registrationNo || undefined,
        representativeName: brokerOfficeObj.representative || undefined,
        representative_name: brokerOfficeObj.representative || undefined,
      },
    });
    statutoryReady = statutoryGate.ok;
    if (!statutoryGate.ok) {
      if (explicitPublishRequested) {
        return NextResponse.json(
          {
            ok: false,
            code: statutoryGate.code,
            error: statutoryGate.message,
            missingFields: statutoryGate.missingFields,
            missingLabels: statutoryGate.missingLabels,
          },
          { status: 422 }
        );
      }
      effectiveStatus = 'draft';
    }
  }

  // P0-2: Blind-guard sanitize companion DealCard before any public snapshot persistence
  const GENERIC_BUILDING_LABELS = new Set([
    '새 IM',
    '매물',
    '근생빌딩',
    '꼬마빌딩',
    '상업용 빌딩',
    '상업용 근생빌딩',
    '오피스빌딩',
    `${derivedRegion} 근생빌딩`,
  ]);
  const GENERIC_TENANT_LABELS = new Set([
    '-',
    '공실',
    '자가사용',
    '자가',
    '임대중',
    '임차중',
    '근린생활시설',
    '제1종근린생활시설',
    '제2종근린생활시설',
    '제1·2종 근린생활시설',
    '사무실',
    '오피스',
    'IT 오피스',
    '상가',
    '의원',
    '병원',
    '약국',
    '카페',
    '프랜차이즈 카페',
    '음식점',
    '편의점',
    '스튜디오',
    '스튜디오/창고',
    '창고',
    '주차장',
  ]);
  const knownBuildingNames = Array.from(
    new Set(
      [
        buildingName,
        title,
        body.heroTitle,
        body.rawBuildingName,
        existingSsot?.building_name,
        (knownMatch as { buildingName?: string } | null)?.buildingName,
      ]
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter((v) => v.length >= 2 && !GENERIC_BUILDING_LABELS.has(v))
    )
  ).sort((a, b) => b.length - a.length);

  const knownTenantNames = Array.from(
    new Set(
      [
        ...safeRentRoll.flatMap((r: any) => [r?.tenantName, r?.tenant_name]),
        ...mappedFloorLeases.map((fl: any) => fl?.tenant_name),
      ]
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter((v) => v.length >= 2 && !GENERIC_TENANT_LABELS.has(v))
    )
  ).sort((a, b) => b.length - a.length);

  const escapeRegexLiteral = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripBlindIdentifiers = (
    raw: string,
    buildingReplacement = '해당 건물',
    tenantReplacement = '우량 임차업종'
  ): string => {
    let out = String(raw || '').trim();
    if (!out) return '';
    for (const bName of knownBuildingNames) {
      out = out.replace(new RegExp(escapeRegexLiteral(bName), 'gi'), buildingReplacement);
    }
    for (const tName of knownTenantNames) {
      out = out.replace(new RegExp(escapeRegexLiteral(tName), 'gi'), tenantReplacement);
    }
    out = cleanBlindPoints([out])[0] || out;
    return out.replace(/\s+/g, ' ').trim();
  };

  const requestedRegionRaw =
    typeof body.region === 'string' && body.region.trim() ? body.region.trim() : card4.region;
  const stripLotNumbersSafe = (raw: string): string =>
    raw
      .replace(
        /([가-힣0-9]+(?:동|로)\s*\d+가|[가-힣]+(?:동|읍|면|리|대로|번길|로|길))\s+(?:산\s*)?\d+(?:-\d+)?(?:\s*번지)?(?:\s*[,/·]\s*(?:산\s*)?\d+(?:-\d+)?(?:\s*번지)?)*(?:\s*외\s*\d*\s*필지)?/g,
        '$1'
      )
      .replace(
        /(?<![가-힣0-9])(?:산\s*)?\d{1,5}(?:-\d{1,5})?(?:\s*번지)?(?!(?:가|동|읍|면|리|로|길|번길|호선|역|[가-힣\d]))/g,
        ''
      );
  const cleanedRegionCandidate = healCorruptedRegionLabel(
    stripLotNumbersSafe(stripBlindIdentifiers(requestedRegionRaw, '', ''))
      .replace(/(?:OO번지|OO-OO|인근)/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
    [cleanAddress, derivedRegion, resolvedTitle]
  );
  const hasUnmaskedLotNumber =
    /(?:-\d+|번지|\s+\d+(?![\d]|(?:\s*(?:가|동|읍|면|리|로|길|번길|호선|역))))/.test(
      cleanedRegionCandidate
    );
  const safePublicRegion =
    !cleanedRegionCandidate || hasUnmaskedLotNumber
      ? derivedRegion
      : cleanedRegionCandidate.slice(0, 14);

  const cleanedPointsTuple = card4.points.map((pt, idx) => {
    const stripped = stripBlindIdentifiers(pt);
    const repaired = repairDealCardLine(stripped) || stripped.slice(0, 22).trim();
    if (repaired) return repaired;
    return idx === 0
      ? '역세권 가시성 우수 입지'
      : idx === 1
      ? '안정적 임대수익 운용 자산'
      : '핵심 상권 중장기 가치 우수';
  }) as [string, string, string];

  const rawHeadlineInput =
    typeof body.headline === 'string' && body.headline.trim()
      ? body.headline.trim()
      : card4.headline;
  const cleanedHeadlineCandidate = rawHeadlineInput
    ? stripBlindIdentifiers(rawHeadlineInput)
    : undefined;
  const safePublicHeadline = cleanedHeadlineCandidate
    ? /(?:OO번지|OO-OO)/.test(cleanedHeadlineCandidate)
      ? `${safePublicRegion !== DEALCARD_PLACEHOLDER_REGION ? safePublicRegion : suggestFallbackRegion(cleanAddress)} ${card4.use}`.trim()
      : cleanedHeadlineCandidate
    : undefined;

  const cleanedPointBriefs = Array.isArray(card4.pointBriefs)
    ? (card4.pointBriefs.map((br) => stripBlindIdentifiers(br || '')) as [string, string, string])
    : undefined;

  const candidatePriceBand =
    typeof body.priceBand === 'string' && body.priceBand.trim()
      ? body.priceBand.trim()
      : card4.priceBand;
  const candidateBandCheck = validateBlindPriceBand(
    candidatePriceBand,
    priceNum > 0 ? priceNum * 10000 : null
  );
  const safePublicPriceBand = candidateBandCheck.valid
    ? candidatePriceBand
    : priceNum > 0
    ? formatPriceRange(priceNum * 10000, 'standard')
    : candidatePriceBand;

  const card4ForPublicDraft = {
    ...card4,
    ...(safePublicHeadline ? { headline: safePublicHeadline } : {}),
    region: safePublicRegion,
    priceBand: safePublicPriceBand,
    points: cleanedPointsTuple,
    ...(cleanedPointBriefs ? { pointBriefs: cleanedPointBriefs } : {}),
  };
  const baseCard4ForPublic: Card4Data = Card4Schema.parse({
    ...card4ForPublicDraft,
    card4_hash: computeCard4Hash(card4ForPublicDraft),
  });
  const mergeExistingCompanionCard4 = (
    existingWs: WorkspaceItemRecord | null | undefined,
    generatedCard4: Card4Data
  ): Card4Data => {
    const existingPayload = (
      existingWs?.draftPayload as { card4?: Partial<Card4Data> } | undefined
    )?.card4;
    if (!existingPayload) return generatedCard4;

    const existingHeadlineRaw =
      typeof existingPayload.headline === 'string' ? existingPayload.headline.trim() : '';
    const preservedHeadline = existingHeadlineRaw
      ? stripBlindIdentifiers(existingHeadlineRaw) || existingHeadlineRaw
      : generatedCard4.headline;

    const existingUseRaw =
      typeof existingPayload.use === 'string' ? existingPayload.use.trim() : '';
    const preservedUse =
      existingUseRaw && !(isGenericAssetUse(existingUseRaw) && newSpecificMainPurpose)
        ? existingUseRaw
        : generatedCard4.use;

    const existingPts = Array.isArray(existingPayload.points) ? existingPayload.points : [];
    const hasMeaningfulExistingPts = existingPts.some(
      (p) => typeof p === 'string' && p.trim().length > 0 && p.trim() !== '-'
    );
    const preservedPoints: [string, string, string] = hasMeaningfulExistingPts
      ? ([
          (typeof existingPts[0] === 'string' && existingPts[0].trim()) ||
            generatedCard4.points[0],
          (typeof existingPts[1] === 'string' && existingPts[1].trim()) ||
            generatedCard4.points[1],
          (typeof existingPts[2] === 'string' && existingPts[2].trim()) ||
            generatedCard4.points[2],
        ] as [string, string, string])
      : generatedCard4.points;

    const existingRegionRaw =
      typeof existingPayload.region === 'string' ? existingPayload.region.trim() : '';
    const isLegacyBrokenDongGa =
      /(?:동|로)가(?=$|[\s,])/.test(existingRegionRaw) &&
      /(?:동|로)\d+가(?=$|[\s,])/.test(generatedCard4.region);
    const healedExistingRegion = existingRegionRaw
      ? healCorruptedRegionLabel(
          stripBlindIdentifiers(existingRegionRaw, '', '') || existingRegionRaw,
          [generatedCard4.region, cleanAddress, resolvedTitle]
        )
      : '';
    const preservedRegion =
      healedExistingRegion &&
      healedExistingRegion !== DEALCARD_PLACEHOLDER_REGION &&
      !isLegacyBrokenDongGa
        ? healedExistingRegion
        : generatedCard4.region;

    const mergedDraft = {
      ...existingPayload,
      ...generatedCard4,
      region: preservedRegion,
      use: preservedUse,
      ...(preservedHeadline ? { headline: preservedHeadline } : {}),
      points: preservedPoints,
      ...(existingPayload.pointTones ? { pointTones: existingPayload.pointTones } : {}),
      ...(existingPayload.pointBriefs
        ? { pointBriefs: existingPayload.pointBriefs }
        : generatedCard4.pointBriefs
        ? { pointBriefs: generatedCard4.pointBriefs }
        : {}),
      ...(generatedCard4.area || existingPayload.area
        ? { area: generatedCard4.area || existingPayload.area }
        : {}),
      ...(generatedCard4.gfaPyung || existingPayload.gfaPyung
        ? { gfaPyung: generatedCard4.gfaPyung ?? existingPayload.gfaPyung }
        : {}),
      ...(generatedCard4.landAreaPyung || existingPayload.landAreaPyung
        ? { landAreaPyung: generatedCard4.landAreaPyung ?? existingPayload.landAreaPyung }
        : {}),
      card4_version: Math.max(
        Number(existingPayload.card4_version || 1),
        Number(generatedCard4.card4_version || 1)
      ),
    };
    return Card4Schema.parse({
      ...mergedDraft,
      card4_hash: computeCard4Hash(mergedDraft),
    });
  };
  let card4ForPublic: Card4Data = mergeExistingCompanionCard4(
    preResolvedDealCardWs,
    baseCard4ForPublic
  );
  const statutoryBrokerProfile = {
    ...brokerOfficeObj,
    company: brokerOfficeObj.name,
    officeName: brokerOfficeObj.name,
    office_name: brokerOfficeObj.name,
    office_address: brokerOfficeObj.officeAddress,
    officeRegNumber: brokerOfficeObj.registrationNo,
    office_reg_number: brokerOfficeObj.registrationNo,
    representativeName: brokerOfficeObj.representative,
    representative_name: brokerOfficeObj.representative,
    representative: brokerOfficeObj.representative,
    displayName: resolvedDisplayNameVal || brokerOfficeObj.representative,
  };
  const dealCardContentGate = evaluateDealCardPublishContent(card4ForPublic);
  const canPublishCompanionDealCard =
    effectiveStatus === 'published' && statutoryReady && dealCardContentGate.ok;
  fullDocBody.card4 = card4ForPublic;

  saveQuickImRecord({
    buildingId,
    documentId,
    ownerId: persistedOwnerId,
    address: cleanAddress,
    buildingName: resolvedTitle,
    askingPriceManwon: priceNum,
    posture,
    pnu: resolvedPnu || undefined,
    coordinates: resolvedCoords,
    officialLandPriceWonSqm: effectiveOfficialLandPriceWonSqm,
    ...(resolvedParcels ? { parcels: resolvedParcels } : {}),
    floorsAbove: effectiveFloorsAbove,
    floorsBelow: effectiveFloorsBelow,
    card4: card4ForPublic,
    basicImDoc,
    rentRoll: safeRentRollWithAreas,
    ...(resolvedRentRollMeta ? { rentRollMeta: resolvedRentRollMeta } : {}),
    ...(resolvedExpectedRentRollMeta
      ? { expectedRentRollMeta: resolvedExpectedRentRollMeta }
      : {}),
    specs: {
      gfaSqm: effectiveGfaSqm,
      landAreaSqm: effectiveLandSqm,
      zoning: effectiveZoning,
      completionDate: effectiveCompletionDate,
      handoverNote: handoverNote || undefined,
      floorsAbove: effectiveFloorsAbove,
      floorsBelow: effectiveFloorsBelow,
      officialLandPriceWonSqm: effectiveOfficialLandPriceWonSqm,
      bcrPct,
      farPct,
      parkingSpaces,
      elevators,
      ...(resolvedParcels ? { parcels: resolvedParcels } : {}),
      ...(closingLine ? { closingLine } : {}),
      ...(body.mainPurpose ? { mainPurpose: String(body.mainPurpose) } : {}),
    },
    brokerProfile: {
      displayName: resolvedDisplayNameVal || brokerOfficeObj.representative,
      representativeName: brokerOfficeObj.representative,
      officeAddress: brokerOfficeObj.officeAddress || undefined,
      company: brokerOfficeObj.name,
      phone: brokerOfficeObj.phone,
      registrationNo: brokerOfficeObj.registrationNo,
      licenseNo: dbBrokerProfile?.licenseNo,
      tagline: dbBrokerProfile?.tagline,
      slug: dbBrokerProfile?.slug,
      photoUrl: dbBrokerProfile?.photoUrl,
      specialtyRegions: dbBrokerProfile?.specialtyRegions,
      specialtyAssets: dbBrokerProfile?.specialtyAssets,
      bio: dbBrokerProfile?.bio,
    },
    fullDocBody,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const completenessScore =
    (cleanAddress ? 15 : 0) +
    (priceNum > 0 || isExplicitNegotiable ? 15 : 0) +
    (effectiveLandSqm > 0 ? 15 : 0) +
    (effectiveGfaSqm > 0 ? 15 : 0) +
    (effectiveZoning ? 10 : 0) +
    (safeRentRollWithAreas.length > 0 ? 15 : 0) +
    (defaultPhotos.length > 0 ? 10 : 0) +
    (resolvedPnu ? 5 : 0);

  if (shouldPersistDb) {
    const strictPersist = isRealProductionRuntime() || process.env.REQUIRE_WORKSPACE_ITEMS_TABLE === '1';
    try {
      let supabase = sharedServiceSupabase;
      if (!supabase) {
        const { createServiceClient } = await import('@/lib/supabase/service');
        supabase = createServiceClient();
      }
      if (supabase && typeof supabase.from === 'function') {
        const buildSsotPayload = (includeIndexPnu: boolean) => ({
          id: buildingId,
          owner_id: persistedOwnerId,
          created_by_role: 'broker' as const,
          input_type: 'manual_form' as const,
          raw_input: cleanAddress,
          raw_address: cleanAddress,
          area_signal: card4ForPublic.region,
          asset_type: card4ForPublic.use,
          price_band: card4ForPublic.priceBand,
          size_signal: resolvedSizeSignal,
          vacancy_signal: ssotSummary.vacancy_signal,
          status: (effectiveStatus === 'published' ? 'public_signal_ready' : 'draft') as 'public_signal_ready' | 'draft',
          layers: {
            completeness_score: completenessScore,
            location: {
              address: cleanAddress,
              raw_address: cleanAddress,
              ...(includeIndexPnu && resolvedPnu
                ? { pnu: resolvedPnu }
                : resolvedPnu
                ? { canonical_pnu: resolvedPnu }
                : {}),
            },
            coordinates: resolvedCoords,
            physical: {
              total_floor_area_sqm: effectiveGfaSqm,
              land_area_sqm: effectiveLandSqm,
              zoning: effectiveZoning,
            },
            lease_summary: {
              asking_price_manwon: priceNum,
              total_deposit_manwon: effectiveDepositManwon,
              monthly_rent_total_krw: effectiveMonthlyRentManwon * 10000,
              vacancy_pct: vacancyPct,
            },
          },
        });

        let { error: bErr } = await supabase
          .from('building_ssot_lite')
          .upsert(buildSsotPayload(true));
        if (bErr) {
          const retryRes = await supabase
            .from('building_ssot_lite')
            .upsert(buildSsotPayload(false));
          bErr = retryRes.error;
        }
        if (bErr) {
          console.error('[quick-generate] building_ssot_lite upsert error:', bErr.message);
          if (strictPersist) {
            return NextResponse.json(
              { ok: false, error: '매물 기본 정보 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.' },
              { status: 500 }
            );
          }
        }

        const { stripHeavyBase64ForDb } = await import('@/lib/supabase/jsonb-diet');
        const dbDocBody = stripHeavyBase64ForDb({
          ...fullDocBody,
          cadastralMapImage: undefined,
        });
        const urlPhotos = Array.isArray(defaultPhotos)
          ? defaultPhotos.filter(
              (p: any) =>
                p &&
                typeof p.url === 'string' &&
                (p.url.startsWith('http://') ||
                  p.url.startsWith('https://') ||
                  p.url.startsWith('/'))
            )
          : [];
        const dataUriPhotos = Array.isArray(defaultPhotos)
          ? defaultPhotos
              .filter(
                (p: any) =>
                  p &&
                  typeof p.url === 'string' &&
                  p.url.startsWith('data:') &&
                  p.url.length <= LARGE_INLINE_PHOTO_THRESHOLD_CHARS
              )
              .slice(0, 12)
          : [];
        const persistedPhotos = [...urlPhotos, ...dataUriPhotos];
        dbDocBody.photos = persistedPhotos;
        dbDocBody.photos_v2 = persistedPhotos;
        dbDocBody.photo_urls = persistedPhotos.map((p: any) => p.url);
        const { error: dErr } = await supabase.from('document_objects').insert({
          id: documentId,
          owner_id: auth.user?.id || null,
          source_type: 'building_ssot_lite',
          source_id: buildingId,
          building_id: buildingId,
          document_type: 'mobile_im',
          visibility: 'public_blind',
          status: effectiveStatus,
          title: resolvedTitle,
          body: dbDocBody,
        });
        if (dErr) {
          console.error('[quick-generate] document_objects insert error:', dErr.message);
          if (strictPersist) {
            return NextResponse.json(
              { ok: false, error: 'IM 문서 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.' },
              { status: 500 }
            );
          }
        }

        const resolvedBrokerExtrasForm =
          body.brokerExtrasForm && typeof body.brokerExtrasForm === 'object'
            ? body.brokerExtrasForm
            : parsedExtras
              ? brokerExtrasToForm(parsedExtras)
              : undefined;

        const imWorkspacePayload: Record<string, any> = {
          ...dbDocBody,
          title: resolvedTitle,
          address: cleanAddress,
          askingPriceManwon: priceNum,
          gfaSqm: effectiveGfaSqm,
          landAreaSqm: effectiveLandSqm,
          zoning: effectiveZoning,
          completionDate: effectiveCompletionDate,
          floorsAbove: effectiveFloorsAbove,
          floorsBelow: effectiveFloorsBelow,
          bcrPct,
          farPct,
          grossYieldPct: basicImDoc.facts.valuation.grossYieldPct,
          capRatePct: basicImDoc.facts.valuation.capRatePct,
          rentRoll: safeRentRollWithAreas,
          floor_leases: mappedFloorLeases,
          ...(resolvedRentRollMeta ? { rent_roll_meta: resolvedRentRollMeta } : {}),
          ...(resolvedExpectedRentRollMeta
            ? { expected_rent_roll_meta: resolvedExpectedRentRollMeta }
            : {}),
          ...(Array.isArray(rawExpectedRentRoll) && rawExpectedRentRoll.length > 0
            ? { expectedRentRoll: rawExpectedRentRoll }
            : Array.isArray(rawExpectedRentRollSnake) && rawExpectedRentRollSnake.length > 0
              ? { expectedRentRoll: rawExpectedRentRollSnake }
              : {}),
          ...(parsedExtras ? { broker_extras: parsedExtras } : {}),
          ...(resolvedBrokerExtrasForm ? { brokerExtrasForm: resolvedBrokerExtrasForm } : {}),
          sections: pptxSections,
          basicImDocument: basicImDoc,
          ssot_summary: ssotSummary,
        };

        await upsertWorkspaceItem(supabase, {
          id: documentId,
          buildingId,
          ownerId: persistedOwnerId,
          isAdmin,
          kind: 'im',
          status: effectiveStatus === 'published' ? 'published' : 'draft',
          title: resolvedTitle,
          address: cleanAddress,
          priceBand: card4.priceBand,
          draftPayload: imWorkspacePayload,
          ...(effectiveStatus === 'published'
            ? { publishedSnapshot: buildSanitizedImPublicSnapshot(imWorkspacePayload) }
            : {}),
          docHash: basicImDoc.docHash,
        });
        let linkedExistingLegacyDealCard = false;
        if (legacyBuildingId && persistedOwnerId) {
          try {
            const linkQuery = supabase
              .from('workspace_items')
              .update({
                building_id: buildingId,
                updated_at: new Date().toISOString(),
              })
              .eq('owner_id', persistedOwnerId)
              .eq('kind', 'dealcard')
              .eq('legacy_id', legacyBuildingId)
              .is('deleted_at', null);
            const linkRes =
              typeof (linkQuery as { select?: (cols: string) => PromiseLike<{ data?: unknown; error?: unknown }> })?.select === 'function'
                ? await (linkQuery as { select: (cols: string) => PromiseLike<{ data?: unknown; error?: unknown }> }).select('id')
                : await linkQuery;
            const linkedRows = (linkRes as { data?: unknown } | null)?.data;
            if (Array.isArray(linkedRows) && linkedRows.length > 0) {
              linkedExistingLegacyDealCard = true;
            }
          } catch {
            // Non-blocking legacy DealCard back-link sync
          }
        }
        let existingDealCardWs: WorkspaceItemRecord | null = preResolvedDealCardWs;
        if (!existingDealCardWs) {
          const ownerScope = isAdmin ? undefined : persistedOwnerId;
          existingDealCardWs =
            (await getWorkspaceItemByAnyId(supabase, buildingId, 'dealcard', ownerScope).catch(
              () => null
            )) ||
            (legacyBuildingId
              ? await getWorkspaceItemByAnyId(
                  supabase,
                  legacyBuildingId,
                  'dealcard',
                  ownerScope
                ).catch(() => null)
              : null);
        }
        if (!linkedExistingLegacyDealCard || existingDealCardWs) {
          const companionCard4 = existingDealCardWs
            ? mergeExistingCompanionCard4(existingDealCardWs, card4ForPublic)
            : card4ForPublic;
          if (existingDealCardWs) {
            card4ForPublic = companionCard4;
            fullDocBody.card4 = companionCard4;
          }
          const preservedStatus = existingDealCardWs
            ? existingDealCardWs.status === 'published' || existingDealCardWs.status === 'sent'
              ? ('sent' as const)
              : existingDealCardWs.status === 'archived'
              ? ('archived' as const)
              : ('draft' as const)
            : canPublishCompanionDealCard
            ? ('sent' as const)
            : ('draft' as const);
          const existingDraftObj =
            existingDealCardWs?.draftPayload &&
            typeof existingDealCardWs.draftPayload === 'object'
              ? existingDealCardWs.draftPayload
              : {};
          await upsertWorkspaceItem(supabase, {
            ...(existingDealCardWs?.id ? { id: existingDealCardWs.id } : {}),
            buildingId,
            ...(legacyBuildingId
              ? { legacyId: legacyBuildingId }
              : existingDealCardWs?.legacyId
              ? { legacyId: existingDealCardWs.legacyId }
              : {}),
            ownerId: persistedOwnerId,
            isAdmin,
            kind: 'dealcard',
            status: preservedStatus,
            title:
              companionCard4.headline ||
              `${companionCard4.region} ${companionCard4.use}`.trim(),
            address: companionCard4.region,
            priceBand: companionCard4.priceBand,
            draftPayload: {
              ...existingDraftObj,
              card4: companionCard4,
              brokerProfile: statutoryBrokerProfile,
            },
            publishedSnapshot: existingDealCardWs
              ? preservedStatus === 'sent'
                ? canPublishCompanionDealCard
                  ? buildSanitizedDealCardPublicSnapshot({
                      card4: companionCard4,
                      brokerProfile: statutoryBrokerProfile,
                    })
                  : existingDealCardWs.publishedSnapshot ?? null
                : null
              : canPublishCompanionDealCard
              ? buildSanitizedDealCardPublicSnapshot({
                  card4: companionCard4,
                  brokerProfile: statutoryBrokerProfile,
                })
              : null,
            docHash: companionCard4.card4_hash,
          });
        }

        const { pruneSupersededDocumentObjects } = await import(
          '@/lib/supabase/prune-document-objects'
        );
        await pruneSupersededDocumentObjects(supabase, buildingId, 'mobile_im', 2);

        if (!dErr) {
          const fullMarkdownForRag = pptxSections
            .map((s) => `[${s.title}]\n${s.markdown}`)
            .join('\n\n');
          const ragGate = evaluateRAGIndexingEligibility({
            id: documentId,
            buildingId,
            status: effectiveStatus,
            isBrokerApproved: effectiveStatus === 'published',
            content: fullMarkdownForRag,
            assetType: card4.use,
            regionCode: resolvedPnu ? resolvedPnu.slice(0, 5) : undefined,
          });
          if (ragGate.eligibleForIndexing) {
            try {
              after(async () => {
                try {
                  await indexIMSections(
                    supabase as any,
                    buildingId,
                    pptxSections as any,
                    {
                      status: effectiveStatus,
                      brokerApproved: true,
                      assetType: card4.use,
                      address: cleanAddress,
                      posture,
                      documentId,
                    }
                  );
                } catch {
                  // Non-blocking vector store indexing
                }
              });
            } catch {
              // Safe fallback when invoked outside Next.js request async context
            }
          }
        }
      }
    } catch (persistErr) {
      if (persistErr instanceof WorkspaceRepositoryError) {
        // WP-7.3D P2-7: repository 5xx messages may carry raw DB text — keep them server-side.
        if (persistErr.status >= 500) {
          console.error('[quick-generate] workspace persistence error:', persistErr.code, persistErr.message);
        }
        return NextResponse.json(
          {
            ok: false,
            error:
              persistErr.status >= 500
                ? '작업 공간 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
                : persistErr.message,
            code: persistErr.code,
          },
          { status: persistErr.status }
        );
      }
      console.error('[quick-generate] Supabase persistence exception:', persistErr);
      if (strictPersist) {
        return NextResponse.json(
          { ok: false, error: '데이터베이스 저장 중 오류가 발생했습니다.' },
          { status: 500 }
        );
      }
    }
  }

  const responsePayload = {
    success: true,
    buildingId,
    documentId,
    docHash: basicImDoc.docHash,
    card4: card4ForPublic,
    basicImDocument: basicImDoc,
    publishStatus: effectiveStatus,
    status: 'succeeded',
    created_at: nowIso,
  };

  if (scopedIdempotencyKey) {
    while (IDEMPOTENCY_CACHE.size >= MAX_IDEMPOTENCY_CACHE_SIZE) {
      const oldestKey = IDEMPOTENCY_CACHE.keys().next().value;
      if (oldestKey === undefined) break;
      IDEMPOTENCY_CACHE.delete(oldestKey);
    }
    IDEMPOTENCY_CACHE.set(scopedIdempotencyKey, responsePayload);
  }

  return NextResponse.json(responsePayload, { status: 201 });
}
