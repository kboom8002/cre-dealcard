/**
 * @file src/lib/im-lite/quick-generate/document-payload-and-persistence.ts
 * @description Rent-roll metadata parsing, full mobile_im document body assembly,
 * QuickImRecord construction, and document_objects + workspace_items + RAG persistence.
 */

import { NextResponse, after } from 'next/server';
import { brokerExtrasToForm, type BrokerExtras } from '@/domain/building/mobile-im/broker-extras';
import { indexIMSections } from '@/domain/building/mobile-im/im-embedding-indexer';
import { evaluateRAGIndexingEligibility } from '@/domain/building/mobile-im/rag-hygiene';
import type { RentRollMeta } from '@/domain/building/mobile-im/rentroll-meta';
import { parseRentRollMeta } from '@/domain/building/mobile-im/rentroll-meta-parse';
import type { Card4Data } from '@/lib/deal-card/card4-schema';
import { buildSanitizedDealCardPublicSnapshot } from '@/lib/deal-card/public-snapshot';
import { assertPublishable } from '@/lib/legal/publish-gate';
import { buildSanitizedImPublicSnapshot } from '@/lib/workspace/summary/patch-upsert-im';
import {
  getWorkspaceItemByAnyId,
  upsertWorkspaceItem,
  WorkspaceRepositoryError,
  type WorkspaceItemRecord,
} from '@/lib/workspace/workspace-repository';
import { mergeExistingCompanionCard4 } from './card4-and-markdown-builder';
import type { DbBrokerProfileSnapshot } from './existing-building-resolver';
import { filterPersistedPhotosForDb } from './photo-storage-offload';

export async function evaluateQuickGeneratePublishGate(params: {
  body: Record<string, any>;
  authUserId?: string;
  shouldPersistDb: boolean;
  persistedOwnerId: string;
  fullDocBody: any;
  resolvedDisplayNameVal: string;
  brokerOfficeObj: {
    name: string;
    representative: string;
    registrationNo: string;
    phone: string;
    officeAddress: string;
    address: string;
  };
}): Promise<
  | {
      ok: true;
      effectiveStatus: 'draft' | 'published';
      statutoryReady: boolean;
      sharedServiceSupabase: any;
      statutoryBrokerProfile: Record<string, any>;
    }
  | { ok: false; response: NextResponse }
> {
  const {
    body,
    authUserId,
    shouldPersistDb,
    persistedOwnerId,
    fullDocBody,
    resolvedDisplayNameVal,
    brokerOfficeObj,
  } = params;

  const explicitPublishRequested =
    body.publishStatus === 'published' || body.status === 'published';
  const requestedStatus: 'draft' | 'published' =
    body.publishStatus === 'draft' || body.status === 'draft' ? 'draft' : 'published';
  let effectiveStatus: 'draft' | 'published' = requestedStatus;
  let statutoryReady = false;
  let sharedServiceSupabase: any = null;

  if (requestedStatus === 'published' && authUserId) {
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
        return {
          ok: false,
          response: NextResponse.json(
            {
              ok: false,
              code: statutoryGate.code,
              error: statutoryGate.message,
              missingFields: statutoryGate.missingFields,
              missingLabels: statutoryGate.missingLabels,
            },
            { status: 422 },
          ),
        };
      }
      effectiveStatus = 'draft';
    }
  }

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

  return {
    ok: true,
    effectiveStatus,
    statutoryReady,
    sharedServiceSupabase,
    statutoryBrokerProfile,
  };
}

export function handleQuickGeneratePersistException(
  persistErr: unknown,
  strictPersist: boolean,
): NextResponse | null {
  if (persistErr instanceof WorkspaceRepositoryError) {
    if (persistErr.status >= 500) {
      console.error(
        '[quick-generate] workspace persistence error:',
        persistErr.code,
        persistErr.message,
      );
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
      { status: persistErr.status },
    );
  }
  console.error('[quick-generate] Supabase persistence exception:', persistErr);
  if (strictPersist) {
    return NextResponse.json(
      { ok: false, error: '데이터베이스 저장 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
  return null;
}

export function parseQuickGenerateRentRollMetas(
  body: Record<string, any>,
  userId: string,
):
  | {
      ok: true;
      resolvedRentRollMeta?: RentRollMeta;
      resolvedExpectedRentRollMeta?: RentRollMeta;
    }
  | { ok: false; response: NextResponse } {
  const parsedRentRollMetaRes = parseRentRollMeta(body.rent_roll_meta ?? body.rentRollMeta);
  if (!parsedRentRollMetaRes.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: parsedRentRollMetaRes.error }, { status: 400 }),
    };
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

  const parsedExpectedRentRollMetaRes = parseRentRollMeta(
    body.expected_rent_roll_meta ?? body.expectedRentRollMeta,
  );
  if (!parsedExpectedRentRollMetaRes.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: parsedExpectedRentRollMetaRes.error }, { status: 400 }),
    };
  }
  let resolvedExpectedRentRollMeta: RentRollMeta | undefined = parsedExpectedRentRollMetaRes.value;
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

  return { ok: true, resolvedRentRollMeta, resolvedExpectedRentRollMeta };
}

export function assembleQuickGenerateFullDocBody(params: {
  resolvedTitle: string;
  cleanAddress: string;
  resolvedPnu: string;
  resolvedAllPnus: string[];
  resolvedCoords?: { lat: number; lng: number };
  legacyPosture: string;
  basicImDoc: any;
  card4: Card4Data;
  safeRentRollWithAreas: any[];
  mappedFloorLeases: any[];
  resolvedRentRollMeta?: RentRollMeta;
  resolvedExpectedRentRollMeta?: RentRollMeta;
  normalizedExpectedRentRoll: any[];
  ssotSummary: Record<string, any>;
  mergedEnrichment?: Record<string, any>;
  normalizedAxiosHighlights?: Array<{ headline: string; brief: string; tone: string }>;
  handoverNote: unknown;
  canonicalUse: string;
  derivedRegion: string;
  exactEokDisplay: string;
  exactEokNum: number;
  effectiveLandSqm: number;
  effectiveGfaSqm: number;
  effectiveZoning: string;
  parkingSpaces: number;
  elevators: number;
  defaultPoints: [string, string, string];
  defaultPhotos: any[];
  pptxSections: Array<{ section_type: string; title: string; markdown: string }>;
  resolvedParcels: any;
  closingLine: string;
  parsedExtras?: BrokerExtras;
  resolvedDisplayNameVal: string;
  brokerOfficeObj: {
    name: string;
    representative: string;
    registrationNo: string;
    phone: string;
    officeAddress: string;
    address: string;
  };
  nowIso: string;
}) {
  const {
    resolvedTitle,
    cleanAddress,
    resolvedPnu,
    resolvedAllPnus,
    resolvedCoords,
    legacyPosture,
    basicImDoc,
    card4,
    safeRentRollWithAreas,
    mappedFloorLeases,
    resolvedRentRollMeta,
    resolvedExpectedRentRollMeta,
    normalizedExpectedRentRoll,
    ssotSummary,
    mergedEnrichment,
    normalizedAxiosHighlights,
    handoverNote,
    canonicalUse,
    derivedRegion,
    exactEokDisplay,
    exactEokNum,
    effectiveLandSqm,
    effectiveGfaSqm,
    effectiveZoning,
    parkingSpaces,
    elevators,
    defaultPoints,
    defaultPhotos,
    pptxSections,
    resolvedParcels,
    closingLine,
    parsedExtras,
    resolvedDisplayNameVal,
    brokerOfficeObj,
    nowIso,
  } = params;

  return {
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
    ...(normalizedExpectedRentRoll.length > 0
      ? { expected_rent_roll: normalizedExpectedRentRoll }
      : {}),
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
}

export function buildQuickImRecordPayload(params: {
  buildingId: string;
  documentId: string;
  persistedOwnerId: string;
  cleanAddress: string;
  resolvedTitle: string;
  priceNum: number;
  posture: string;
  resolvedPnu: string;
  resolvedCoords?: { lat: number; lng: number };
  effectiveOfficialLandPriceWonSqm: number;
  resolvedParcels: any;
  effectiveFloorsAbove: number;
  effectiveFloorsBelow: number;
  card4ForPublic: Card4Data;
  basicImDoc: any;
  safeRentRollWithAreas: any[];
  resolvedRentRollMeta?: RentRollMeta;
  resolvedExpectedRentRollMeta?: RentRollMeta;
  effectiveGfaSqm: number;
  effectiveLandSqm: number;
  effectiveZoning: string;
  effectiveCompletionDate: string;
  handoverNote: unknown;
  bcrPct: number;
  farPct: number;
  parkingSpaces: number;
  elevators: number;
  closingLine: string;
  mainPurposeInput: unknown;
  resolvedDisplayNameVal: string;
  brokerOfficeObj: {
    name: string;
    representative: string;
    registrationNo: string;
    phone: string;
    officeAddress: string;
    address: string;
  };
  dbBrokerProfile: DbBrokerProfileSnapshot | null;
  fullDocBody: any;
  nowIso: string;
}) {
  const {
    buildingId,
    documentId,
    persistedOwnerId,
    cleanAddress,
    resolvedTitle,
    priceNum,
    posture,
    resolvedPnu,
    resolvedCoords,
    effectiveOfficialLandPriceWonSqm,
    resolvedParcels,
    effectiveFloorsAbove,
    effectiveFloorsBelow,
    card4ForPublic,
    basicImDoc,
    safeRentRollWithAreas,
    resolvedRentRollMeta,
    resolvedExpectedRentRollMeta,
    effectiveGfaSqm,
    effectiveLandSqm,
    effectiveZoning,
    effectiveCompletionDate,
    handoverNote,
    bcrPct,
    farPct,
    parkingSpaces,
    elevators,
    closingLine,
    mainPurposeInput,
    resolvedDisplayNameVal,
    brokerOfficeObj,
    dbBrokerProfile,
    fullDocBody,
    nowIso,
  } = params;

  return {
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
    ...(resolvedExpectedRentRollMeta ? { expectedRentRollMeta: resolvedExpectedRentRollMeta } : {}),
    specs: {
      gfaSqm: effectiveGfaSqm,
      landAreaSqm: effectiveLandSqm,
      zoning: effectiveZoning,
      completionDate: effectiveCompletionDate,
      handoverNote: handoverNote ? String(handoverNote) : undefined,
      floorsAbove: effectiveFloorsAbove,
      floorsBelow: effectiveFloorsBelow,
      officialLandPriceWonSqm: effectiveOfficialLandPriceWonSqm,
      bcrPct,
      farPct,
      parkingSpaces,
      elevators,
      ...(resolvedParcels ? { parcels: resolvedParcels } : {}),
      ...(closingLine ? { closingLine } : {}),
      ...(mainPurposeInput ? { mainPurpose: String(mainPurposeInput) } : {}),
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
  };
}

export async function persistDocumentWorkspaceAndCompanionDealCard(params: {
  supabase: any;
  strictPersist: boolean;
  authUserId?: string;
  persistedOwnerId: string;
  isAdmin: boolean;
  buildingId: string;
  documentId: string;
  legacyBuildingId: string | null;
  linkedExistingLegacyDealCard: boolean;
  preResolvedDealCardWs: WorkspaceItemRecord | null;
  effectiveStatus: 'draft' | 'published';
  canPublishCompanionDealCard: boolean;
  resolvedTitle: string;
  cleanAddress: string;
  priceNum: number;
  effectiveGfaSqm: number;
  effectiveLandSqm: number;
  effectiveZoning: string;
  effectiveCompletionDate: string;
  effectiveFloorsAbove: number;
  effectiveFloorsBelow: number;
  bcrPct: number;
  farPct: number;
  basicImDoc: any;
  safeRentRollWithAreas: any[];
  mappedFloorLeases: any[];
  resolvedRentRollMeta?: RentRollMeta;
  resolvedExpectedRentRollMeta?: RentRollMeta;
  normalizedExpectedRentRoll: any[];
  parsedExtras?: BrokerExtras;
  brokerExtrasFormInput: unknown;
  pptxSections: Array<{ section_type: string; title: string; markdown: string }>;
  ssotSummary: Record<string, any>;
  defaultPhotos: any[];
  fullDocBody: any;
  card4: Card4Data;
  card4ForPublic: Card4Data;
  newSpecificMainPurpose: string;
  stripBlindIdentifiers: (
    raw: string,
    buildingReplacement?: string,
    tenantReplacement?: string,
  ) => string;
  statutoryBrokerProfile: Record<string, any>;
  resolvedPnu: string;
  posture: string;
}): Promise<{ errorResponse?: NextResponse; updatedCard4ForPublic: Card4Data }> {
  const {
    supabase,
    strictPersist,
    authUserId,
    persistedOwnerId,
    isAdmin,
    buildingId,
    documentId,
    legacyBuildingId,
    linkedExistingLegacyDealCard,
    preResolvedDealCardWs,
    effectiveStatus,
    canPublishCompanionDealCard,
    resolvedTitle,
    cleanAddress,
    priceNum,
    effectiveGfaSqm,
    effectiveLandSqm,
    effectiveZoning,
    effectiveCompletionDate,
    effectiveFloorsAbove,
    effectiveFloorsBelow,
    bcrPct,
    farPct,
    basicImDoc,
    safeRentRollWithAreas,
    mappedFloorLeases,
    resolvedRentRollMeta,
    resolvedExpectedRentRollMeta,
    normalizedExpectedRentRoll,
    parsedExtras,
    brokerExtrasFormInput,
    pptxSections,
    ssotSummary,
    defaultPhotos,
    fullDocBody,
    card4,
    newSpecificMainPurpose,
    stripBlindIdentifiers,
    statutoryBrokerProfile,
    resolvedPnu,
    posture,
  } = params;
  let card4ForPublic = params.card4ForPublic;

  const { stripHeavyBase64ForDb } = await import('@/lib/supabase/jsonb-diet');
  const dbDocBody = stripHeavyBase64ForDb({
    ...fullDocBody,
    cadastralMapImage: undefined,
  });
  const persistedPhotos = filterPersistedPhotosForDb(defaultPhotos);
  dbDocBody.photos = persistedPhotos;
  dbDocBody.photos_v2 = persistedPhotos;
  dbDocBody.photo_urls = persistedPhotos.map((p: any) => p.url);

  const { error: dErr } = await supabase.from('document_objects').insert({
    id: documentId,
    owner_id: authUserId || null,
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
      return {
        errorResponse: NextResponse.json(
          { ok: false, error: 'IM 문서 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.' },
          { status: 500 },
        ),
        updatedCard4ForPublic: card4ForPublic,
      };
    }
  }

  const resolvedBrokerExtrasForm =
    brokerExtrasFormInput && typeof brokerExtrasFormInput === 'object'
      ? brokerExtrasFormInput
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
    ...(normalizedExpectedRentRoll.length > 0
      ? { expectedRentRoll: normalizedExpectedRentRoll }
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

  let existingDealCardWs: WorkspaceItemRecord | null = preResolvedDealCardWs;
  if (!existingDealCardWs) {
    const ownerScope = isAdmin ? undefined : persistedOwnerId;
    existingDealCardWs =
      (await getWorkspaceItemByAnyId(supabase, buildingId, 'dealcard', ownerScope).catch(
        () => null,
      )) ||
      (legacyBuildingId
        ? await getWorkspaceItemByAnyId(
            supabase,
            legacyBuildingId,
            'dealcard',
            ownerScope,
          ).catch(() => null)
        : null);
  }

  if (!linkedExistingLegacyDealCard || existingDealCardWs) {
    const companionCard4 = existingDealCardWs
      ? mergeExistingCompanionCard4({
          existingWs: existingDealCardWs,
          generatedCard4: card4ForPublic,
          newSpecificMainPurpose,
          cleanAddress,
          resolvedTitle,
          stripBlindIdentifiers,
        })
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
      existingDealCardWs?.draftPayload && typeof existingDealCardWs.draftPayload === 'object'
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
      title: companionCard4.headline || `${companionCard4.region} ${companionCard4.use}`.trim(),
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
            : (existingDealCardWs.publishedSnapshot ?? null)
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
    const fullMarkdownForRag = pptxSections.map((s) => `[${s.title}]\n${s.markdown}`).join('\n\n');
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
            await indexIMSections(supabase as any, buildingId, pptxSections as any, {
              status: effectiveStatus,
              brokerApproved: true,
              assetType: card4.use,
              address: cleanAddress,
              posture,
              documentId,
            });
          } catch {
            // Non-blocking vector store indexing
          }
        });
      } catch {
        // Safe fallback when invoked outside Next.js request async context
      }
    }
  }

  return { updatedCard4ForPublic: card4ForPublic };
}
