/**
 * @file src/lib/im-lite/quick-generate/existing-building-resolver.ts
 * @description Cross-tenant IDOR ownership check (fail-closed), legacy/PNU/address building deduplication,
 * existing mobile_im metadata hydration, and authenticated broker profile resolution.
 */

import { NextResponse } from 'next/server';
import { getQuickImRecord } from '@/lib/im-lite/quick-generate-store';
import {
  getWorkspaceItemByAnyId,
  listWorkspaceItemsForOwner,
  type WorkspaceItemRecord,
} from '@/lib/workspace/workspace-repository';
import {
  UUID_REGEX,
  isValidCoordsForAddress,
  isValidPnuForAddress,
  normalizeAddrCompare,
  normalizeAddrDedupKey,
} from './poison-pnu-guard';

export interface HydratedExistingBuildingState {
  resolvedExistingBuildingId: string | null;
  existingOwnerId: string | null;
  preLookupSupabase: any;
  preResolvedDealCardWs: WorkspaceItemRecord | null;
  existingPnu?: string;
  existingAllPnus: string[];
  existingCoords?: { lat: number; lng: number };
  existingRoadAddress?: string;
  existingJibunAddress?: string;
  existingEnrichment?: Record<string, any>;
  existingSsot?: Record<string, any>;
  existingRealPhotos: any[];
  existingFloorLeases: any[];
}

export async function verifyAndResolveExistingBuildingContext(params: {
  requestedBuildingId: string | null;
  legacyBuildingId: string | null;
  isExplicitDuplicate: boolean;
  shouldPersistDb: boolean;
  userId: string;
  isAdmin: boolean;
  cleanAddress: string;
  sanitizedRawPnu: string;
  sanitizedRawCoords?: { lat: number; lng: number };
  knownMatch?: { pnu?: string; lat?: number; lng?: number; [key: string]: any };
}): Promise<
  | { ok: true; state: HydratedExistingBuildingState }
  | { ok: false; response: NextResponse }
> {
  const {
    requestedBuildingId,
    legacyBuildingId,
    isExplicitDuplicate,
    shouldPersistDb,
    userId,
    isAdmin,
    cleanAddress,
    sanitizedRawPnu,
    sanitizedRawCoords,
    knownMatch,
  } = params;

  let resolvedExistingBuildingId: string | null = requestedBuildingId;
  let existingOwnerId: string | null = null;
  let preLookupSupabase: any = null;
  let preResolvedDealCardWs: WorkspaceItemRecord | null = null;

  let existingPnu: string | undefined;
  let existingAllPnus: string[] = [];
  let existingCoords: { lat: number; lng: number } | undefined;
  let existingRoadAddress: string | undefined;
  let existingJibunAddress: string | undefined;
  let existingEnrichment: Record<string, any> | undefined;
  let existingSsot: Record<string, any> | undefined;
  let existingRealPhotos: any[] = [];
  let existingFloorLeases: any[] = [];

  // (a) Cross-tenant IDOR guard: when requestedBuildingId is supplied, verify ownership BEFORE any mutation
  if (requestedBuildingId) {
    const existingMemRecord = getQuickImRecord(requestedBuildingId);
    if (existingMemRecord?.ownerId) {
      if (existingMemRecord.ownerId !== userId && !isAdmin) {
        return {
          ok: false,
          response: NextResponse.json(
            { ok: false, error: '이 매물에 대한 권한이 없습니다.', code: 'FORBIDDEN' },
            { status: 403 },
          ),
        };
      }
      existingOwnerId = existingMemRecord.ownerId;
    }

    let existingBldRow: Record<string, any> | null = null;
    const ownershipLookupUnavailable = () =>
      NextResponse.json(
        {
          ok: false,
          code: 'OWNERSHIP_CHECK_UNAVAILABLE',
          error: '매물 권한 확인을 일시적으로 할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        },
        { status: 503 },
      );

    let ownershipSupabase: any = null;
    try {
      const { createServiceClient } = await import('@/lib/supabase/service');
      ownershipSupabase = createServiceClient();
    } catch (clientErr) {
      ownershipSupabase = null;
      if (shouldPersistDb) {
        console.error('[quick-generate] ownership lookup client unavailable:', clientErr);
        return { ok: false, response: ownershipLookupUnavailable() };
      }
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
          lookup = await runLookup('id, owner_id, layers');
        }
        const lookupErr = lookup?.error;
        const isNotFound = Boolean(lookupErr) && String(lookupErr.code || '') === 'PGRST116';
        if (lookupErr && !isNotFound) {
          console.error('[quick-generate] ownership lookup failed:', {
            code: lookupErr.code,
            message: lookupErr.message,
          });
          return { ok: false, response: ownershipLookupUnavailable() };
        }
        existingBldRow = (lookup?.data as Record<string, any> | null) ?? null;
      } catch (lookupThrown) {
        console.error('[quick-generate] ownership lookup threw:', lookupThrown);
        return { ok: false, response: ownershipLookupUnavailable() };
      }
    }

    if (ownershipSupabase) {
      preLookupSupabase = ownershipSupabase;
    }

    if (existingBldRow) {
      const rowOwnerId = (existingBldRow.owner_id as string | null | undefined) ?? null;
      if (!isAdmin && (!rowOwnerId || rowOwnerId !== userId)) {
        return {
          ok: false,
          response: NextResponse.json(
            { ok: false, error: '이 매물에 대한 권한이 없습니다.', code: 'FORBIDDEN' },
            { status: 403 },
          ),
        };
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
          if (isValidPnuForAddress(cleanAddress, existingBldRow.pnu)) {
            existingPnu = existingBldRow.pnu;
          } else if (isValidPnuForAddress(cleanAddress, bLayers.location?.pnu)) {
            existingPnu = bLayers.location.pnu;
          } else if (isValidPnuForAddress(cleanAddress, bLayers.location?.canonical_pnu)) {
            existingPnu = bLayers.location.canonical_pnu;
          }
          if (isValidCoordsForAddress(cleanAddress, bLayers.coordinates)) {
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
          ownerScope,
        ).catch(() => null);
        const matchedAnyWs =
          matchedDealWs ||
          (await getWorkspaceItemByAnyId(
            preLookupSupabase,
            legacyBuildingId,
            undefined,
            ownerScope,
          ).catch(() => null));
        if (matchedAnyWs && (isAdmin || matchedAnyWs.ownerId === userId)) {
          if (matchedAnyWs.buildingId && UUID_REGEX.test(matchedAnyWs.buildingId)) {
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
                if (isValidPnuForAddress(cleanAddress, dBody.pnu)) existingPnu = dBody.pnu;
                else if (isValidPnuForAddress(cleanAddress, dSsot.pnu)) existingPnu = dSsot.pnu;
              }
              if (!existingCoords) {
                if (isValidCoordsForAddress(cleanAddress, dBody.coordinates)) {
                  existingCoords = {
                    lat: Number(dBody.coordinates.lat),
                    lng: Number(dBody.coordinates.lng),
                  };
                } else if (isValidCoordsForAddress(cleanAddress, dSsot.coordinates)) {
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
                  !p.url.startsWith('/test-images/'),
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

  // (c) Resolve existing broker-owned building by (owner_id, resolvedPnu) or normalized (owner_id, cleanAddress)
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
          if (!row || typeof row.id !== 'string' || !UUID_REGEX.test(row.id)) continue;
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
              candidateAddrs.some((a) => normalizeAddrDedupKey(a) === targetAddrKey),
          );
          if (pnuMatched || addrMatched) {
            resolvedExistingBuildingId = row.id;
            existingOwnerId = existingOwnerId || row.owner_id || ownerScopeId;
            if (!existingPnu && isValidPnuForAddress(cleanAddress, rowPnu)) existingPnu = rowPnu;
            if (!existingCoords && isValidCoordsForAddress(cleanAddress, rLayers.coordinates)) {
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
            if (!ws?.buildingId || !UUID_REGEX.test(ws.buildingId)) continue;
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

  return {
    ok: true,
    state: {
      resolvedExistingBuildingId,
      existingOwnerId,
      preLookupSupabase,
      preResolvedDealCardWs,
      existingPnu,
      existingAllPnus,
      existingCoords,
      existingRoadAddress,
      existingJibunAddress,
      existingEnrichment,
      existingSsot,
      existingRealPhotos,
      existingFloorLeases,
    },
  };
}

export interface DbBrokerProfileSnapshot {
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
}

export function cleanBrokerVal(v: unknown): string {
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
}

export async function resolveBrokerProfileAndOffice(params: {
  authUserId?: string;
  body: Record<string, any>;
  brokerName?: unknown;
  brokerageName?: unknown;
  brokerPhone?: unknown;
}): Promise<{
  dbBrokerProfile: DbBrokerProfileSnapshot | null;
  resolvedDisplayNameVal: string;
  brokerOfficeObj: {
    name: string;
    representative: string;
    registrationNo: string;
    phone: string;
    officeAddress: string;
    address: string;
  };
}> {
  const { authUserId, body, brokerName, brokerageName, brokerPhone } = params;
  let dbBrokerProfile: DbBrokerProfileSnapshot | null = null;

  if (authUserId && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    try {
      const { createServiceClient } = await import('@/lib/supabase/service');
      const supabase = createServiceClient();
      if (supabase && typeof supabase.from === 'function') {
        const { data: pRow } = await supabase
          .from('profiles')
          .select('display_name, company, phone, tagline, photo_url')
          .eq('id', authUserId)
          .maybeSingle();

        let bpRow: any = null;
        const bpRes = await supabase
          .from('broker_profiles')
          .select(
            'office_reg_number, license_number, office_address, representative_name, name, slug, specialty_regions, specialty_assets, bio, avatar_url',
          )
          .eq('user_id', authUserId)
          .maybeSingle();
        if (!bpRes.error) {
          bpRow = bpRes.data;
        } else {
          const bpFallback = await supabase
            .from('broker_profiles')
            .select(
              'office_reg_number, license_number, slug, specialty_regions, specialty_assets, bio, avatar_url',
            )
            .eq('user_id', authUserId)
            .maybeSingle();
          bpRow = bpFallback.data;
        }

        if (pRow || bpRow) {
          dbBrokerProfile = {
            displayName:
              pRow?.display_name || bpRow?.name || bpRow?.representative_name || undefined,
            representativeName: bpRow?.representative_name || undefined,
            company: pRow?.company || undefined,
            phone: pRow?.phone || undefined,
            officeAddress: bpRow?.office_address || undefined,
            registrationNo: bpRow?.office_reg_number || undefined,
            licenseNo: bpRow?.license_number || undefined,
            tagline: pRow?.tagline || undefined,
            slug: bpRow?.slug || undefined,
            photoUrl: bpRow?.avatar_url || pRow?.photo_url || undefined,
            specialtyRegions: Array.isArray(bpRow?.specialty_regions)
              ? bpRow.specialty_regions
              : undefined,
            specialtyAssets: Array.isArray(bpRow?.specialty_assets)
              ? bpRow.specialty_assets
              : undefined,
            bio: bpRow?.bio ?? null,
          };
        }
      }
    } catch {
      // Non-blocking fallback
    }
  }

  const officeAddressVal =
    cleanBrokerVal(body.brokerAddress) ||
    cleanBrokerVal(body.brokerOfficeAddress) ||
    cleanBrokerVal(body.brokerOffice?.officeAddress) ||
    cleanBrokerVal(body.brokerOffice?.office_address) ||
    cleanBrokerVal(body.brokerOffice?.address) ||
    cleanBrokerVal(dbBrokerProfile?.officeAddress) ||
    '';

  const resolvedDisplayNameVal =
    cleanBrokerVal(brokerName) || cleanBrokerVal(dbBrokerProfile?.displayName) || '';

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

  return { dbBrokerProfile, resolvedDisplayNameVal, brokerOfficeObj };
}
