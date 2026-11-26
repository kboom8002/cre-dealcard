/**
 * @file src/app/api/broker/im-lite/quick-generate/route.ts
 * @description WP-P3-04: Quick-generate API endpoint creating building + v1 IM + Deal Card.
 *
 * Modularized orchestrator delegating pure domain synthesis & bounded IO helpers to
 * `@/lib/im-lite/quick-generate/*`.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireBroker } from '@/lib/auth-guard';
import { isRealProductionRuntime } from '@/lib/env';
import { extractPureBuildingFacts } from '@/domain/building/im-core/facts';
import { buildBasicImDocument } from '@/domain/building/im-core/basic-im-document';
import { healCorruptedRegionLabel } from '@/domain/building/dealcard-publication/banding-engine';
import { type Card4Data } from '@/lib/deal-card/card4-schema';
import { evaluateDealCardPublishContent } from '@/lib/deal-card/publish-content-gate';
import {
  saveQuickImRecord,
  isRealUploadedPhotoUrl as isRealUploadedUrl,
} from '@/lib/im-lite/quick-generate-store';
import { TEST_PARCEL_FIXTURES } from '@/lib/im-lite/test-parcel-fixtures';
import { getWorkspaceItemByAnyId } from '@/lib/workspace/workspace-repository';
import { splitMultiParcelAddress } from '@/lib/external/address-resolver';
import * as aiQuotaGuard from '@/lib/ai-quota-guard';
import { resolveQuickGeneratePostures } from '@/lib/im-lite/quick-generate/posture-normalizer';
import {
  UUID_REGEX,
  deriveBlindSafeRegion,
  sanitizeIncomingPnuAndCoords,
} from '@/lib/im-lite/quick-generate/poison-pnu-guard';
import {
  resolveBrokerProfileAndOffice,
  verifyAndResolveExistingBuildingContext,
} from '@/lib/im-lite/quick-generate/existing-building-resolver';
import {
  normalizeUserSubmittedPhotos,
  offloadLargeInlinePhotosToStorage,
} from '@/lib/im-lite/quick-generate/photo-storage-offload';
import { enrichParcelsAndSpatialContext } from '@/lib/im-lite/quick-generate/parcel-and-spatial-enricher';
import {
  buildMappedFloorLeasesAndVacancy,
  normalizeExpectedRentRollRows,
  resolveEffectiveBuildingSpecs,
  summarizeRentRollTotalsAndFloors,
  synthesizeRentRollFloorAreas,
} from '@/lib/im-lite/quick-generate/floor-area-synthesizer';
import {
  buildInitialCard4AndSizeSignal,
  buildPublicSanitizedCard4,
  buildSsotSummaryAndPptxSections,
  checkUnmaskedLotNumber,
  createBlindIdentifierStripper,
  formatExactEokDisplay,
  mergeExistingCompanionCard4,
  resolveBrokerCopyAndDefaultPoints,
  stripLotNumbersSafe,
} from '@/lib/im-lite/quick-generate/card4-and-markdown-builder';
import {
  assembleQuickGenerateFullDocBody,
  buildQuickImRecordPayload,
  evaluateQuickGeneratePublishGate,
  handleQuickGeneratePersistException,
  parseQuickGenerateRentRollMetas,
  persistDocumentWorkspaceAndCompanionDealCard,
} from '@/lib/im-lite/quick-generate/document-payload-and-persistence';

export const maxDuration = 120;

const MAX_IDEMPOTENCY_CACHE_SIZE = 200;
const IDEMPOTENCY_CACHE = new Map<string, any>();

export async function POST(req: NextRequest) {
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  const userId = auth.user?.id || '';
  if (!userId) {
    return NextResponse.json({ ok: false, error: '인증이 필요합니다.' }, { status: 401 });
  }
  const isAdmin = auth.role === 'admin';

  const idempotencyKey =
    req.headers.get('idempotency-key') || req.headers.get('x-idempotency-key') || null;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바른 JSON 형식이 아닙니다.' }, { status: 400 });
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
    landAreaSqm,
    handoverNote,
    brokerExtras,
    brokerName,
    brokerageName,
    brokerPhone,
  } = body;

  const { posture, legacyPosture, card4Posture } = resolveQuickGeneratePostures(
    body.posture,
    body.investmentPosture,
  );

  const metaRes = parseQuickGenerateRentRollMetas(body, userId);
  if (!metaRes.ok) return metaRes.response;
  const { resolvedRentRollMeta, resolvedExpectedRentRollMeta } = metaRes;

  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    return NextResponse.json({ error: '주소를 입력해주세요.' }, { status: 422 });
  }

  const priceNum = Number(askingPriceManwon);
  const isExplicitNegotiable =
    priceNum === 0 &&
    (body.priceNegotiable === true ||
      /협의|비공개/.test(String(body.priceBand || body.title || body.buildingName || '')));
  if (isNaN(priceNum) || priceNum < 0 || (priceNum === 0 && !isExplicitNegotiable)) {
    return NextResponse.json(
      { error: '유효한 매각 희망가를 입력해주세요 (0보다 커야 합니다).' },
      { status: 422 },
    );
  }

  const quickGenQuotaErr = await aiQuotaGuard.enforceBrokerAiQuota(
    req,
    userId,
    'im_quick_generate',
    { perMinute: 20 },
  );
  if (quickGenQuotaErr) return quickGenQuotaErr;

  const cleanAddress = address.trim();
  const knownMatch = !isRealProductionRuntime()
    ? TEST_PARCEL_FIXTURES.find((entry) => entry.match.test(cleanAddress))?.info
    : undefined;

  const shouldPersistDb =
    (process.env.NODE_ENV !== 'test' && !process.env.VITEST) ||
    process.env.DISABLE_MEMORY_STORE === '1' ||
    process.env.REQUIRE_WORKSPACE_ITEMS_TABLE === '1';

  const requestedBuildingId =
    typeof body.buildingId === 'string' && UUID_REGEX.test(body.buildingId) ? body.buildingId : null;
  const rawLegacyCandidate =
    typeof body.legacyBuildingId === 'string' && body.legacyBuildingId.trim()
      ? body.legacyBuildingId.trim()
      : typeof body.buildingId === 'string' && body.buildingId.trim()
        ? body.buildingId.trim()
        : '';
  const legacyBuildingId =
    rawLegacyCandidate &&
    !UUID_REGEX.test(rawLegacyCandidate) &&
    !['bld-01', 'bld-02', 'bld-03', 'im-doc-01', 'im-doc-02', 'im-doc-03'].includes(rawLegacyCandidate)
      ? rawLegacyCandidate
      : null;
  const isExplicitDuplicate =
    Boolean(body.isClone || body.isDuplicate || body.duplicate || body.forceNewBuilding) ||
    (typeof rawLegacyCandidate === 'string' && /^bld-dup-/i.test(rawLegacyCandidate));

  const { sanitizedRawPnu, sanitizedRawCoords } = sanitizeIncomingPnuAndCoords({
    cleanAddress,
    rawPnu,
    rawCoordinates,
    rawLat,
    rawLng,
  });

  const existingResolution = await verifyAndResolveExistingBuildingContext({
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
  });
  if (!existingResolution.ok) return existingResolution.response;

  const {
    resolvedExistingBuildingId,
    existingOwnerId,
    existingPnu,
    existingAllPnus,
    existingCoords,
    existingRoadAddress,
    existingJibunAddress,
    existingEnrichment,
    existingSsot,
    existingRealPhotos,
    existingFloorLeases,
  } = existingResolution.state;
  let { preLookupSupabase, preResolvedDealCardWs } = existingResolution.state;

  const buildingId = resolvedExistingBuildingId || crypto.randomUUID();
  const documentId = crypto.randomUUID();

  if (!resolvedExistingBuildingId) {
    let enforceFeatureQuotaFn: typeof aiQuotaGuard.enforceFeatureQuota | undefined;
    try {
      enforceFeatureQuotaFn = aiQuotaGuard.enforceFeatureQuota;
    } catch {
      enforceFeatureQuotaFn = undefined;
    }
    if (typeof enforceFeatureQuotaFn === 'function') {
      const featureQuotaErr = await enforceFeatureQuotaFn(userId, 'im_generation');
      if (featureQuotaErr) return featureQuotaErr;
    }
  }

  if (resolvedExistingBuildingId && shouldPersistDb && !preResolvedDealCardWs) {
    try {
      if (!preLookupSupabase) {
        const { createServiceClient } = await import('@/lib/supabase/service');
        preLookupSupabase = createServiceClient();
      }
      if (preLookupSupabase) {
        const ownerScope = isAdmin ? undefined : existingOwnerId || userId;
        preResolvedDealCardWs =
          (await getWorkspaceItemByAnyId(preLookupSupabase, resolvedExistingBuildingId, 'dealcard', ownerScope).catch(() => null)) ||
          (legacyBuildingId
            ? await getWorkspaceItemByAnyId(preLookupSupabase, legacyBuildingId, 'dealcard', ownerScope).catch(() => null)
            : null);
      }
    } catch {
      // Non-blocking DealCard pre-read
    }
  }

  const {
    primaryAddress: cleanPrimaryAddr,
    secondaryLots: parsedSecondaryLots,
    hasExplicitMultiLotHint,
  } = splitMultiParcelAddress(cleanAddress);
  const derivedRegion = deriveBlindSafeRegion(cleanPrimaryAddr);

  const { safeRentRoll, totalDepositManwon, totalMonthlyRentManwon, totalMaintManwon, maxFloorAbove, maxFloorBelow } =
    summarizeRentRollTotalsAndFloors(rentRoll);

  const specs = resolveEffectiveBuildingSpecs({
    body,
    knownMatch,
    existingEnrichment,
    existingSsot,
    maxFloorAbove,
    maxFloorBelow,
  });
  const {
    effectiveFloorsAbove,
    effectiveFloorsBelow,
    effectiveGfaSqm,
    effectiveZoning,
    effectiveCompletionDate,
    totalFloorsCount,
    perFloorAreaSqm,
    rawBcrPct,
    bcrPct,
    rawFarPct,
    farPct,
    parkingSpaces,
    elevators,
    rawOfficialLandPrice,
    officialLandPriceWonSqm,
  } = specs;

  const resolvedTitle = title || buildingName || `${derivedRegion} 근생빌딩`;
  const effectiveMonthlyRentManwon = totalMonthlyRentManwon > 0 ? totalMonthlyRentManwon : 0;
  const effectiveDepositManwon = totalDepositManwon > 0 ? totalDepositManwon : 0;

  const { parsedExtras, closingLine, defaultPoints } = resolveBrokerCopyAndDefaultPoints({
    body,
    brokerExtras,
    existingSsot,
    safeRentRoll,
    derivedRegion,
    totalMonthlyRentManwon,
    effectiveMonthlyRentManwon,
    effectiveDepositManwon,
    effectiveLandSqm: specs.effectiveLandSqm,
    priceNum,
  });

  const { dbBrokerProfile, resolvedDisplayNameVal, brokerOfficeObj } =
    await resolveBrokerProfileAndOffice({
      authUserId: auth.user?.id,
      body,
      brokerName,
      brokerageName,
      brokerPhone,
    });

  const userSubmittedPhotos = normalizeUserSubmittedPhotos(body.photos, {
    checkRealUploadedUrl: isRealUploadedUrl,
  });
  let defaultPhotos =
    userSubmittedPhotos.length > 0 ? userSubmittedPhotos : existingRealPhotos.length > 0 ? existingRealPhotos : [];

  const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  defaultPhotos = await offloadLargeInlinePhotosToStorage({ photos: defaultPhotos, userId, buildingId, isTestEnv });

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

  const {
    resolvedAllPnus,
    effectiveLandSqm,
    effectiveOfficialLandPriceWonSqm,
    resolvedLandCategory,
    resolvedParcels,
    defaultComps,
    liveLocationPoi,
    liveDbComps,
    effectiveCompsForDoc,
  } = await enrichParcelsAndSpatialContext({
    body,
    cleanAddress,
    derivedRegion,
    resolvedPnu,
    resolvedCoords,
    resolvedJibunAddress,
    existingAllPnus,
    existingSsot,
    existingEnrichment,
    parsedSecondaryLots,
    hasExplicitMultiLotHint,
    landAreaSqmInput: landAreaSqm,
    initialEffectiveLandSqm: specs.effectiveLandSqm,
    rawOfficialLandPrice,
    officialLandPriceWonSqm,
    priceNum,
    parsedExtras,
  });

  const safeRentRollWithAreas = synthesizeRentRollFloorAreas({
    safeRentRoll,
    existingFloorLeases,
    effectiveFloorsAbove,
    totalFloorsCount,
    effectiveGfaSqm,
    perFloorAreaSqm,
  });

  const facts = extractPureBuildingFacts({
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
  });
  const basicImDoc = buildBasicImDocument(facts);

  const { card4, canonicalUse, resolvedSizeSignal, rawMainPurposeInput, newSpecificMainPurpose } =
    buildInitialCard4AndSizeSignal({
      body,
      posture,
      card4Posture,
      derivedRegion,
      priceNum,
      defaultPoints,
      grossYieldPct: basicImDoc.facts.valuation.grossYieldPct,
      totalGrossAreaPyeong: facts.building.totalGrossAreaPyeong,
      landAreaPyeong: facts.land.landAreaPyeong,
      effectiveGfaSqm,
      effectiveLandSqm,
      knownMatch,
      existingSsot,
      preResolvedDealCardWs,
    });

  const { mappedFloorLeases, vacancyPct } = buildMappedFloorLeasesAndVacancy({
    safeRentRollWithAreas,
    existingFloorLeases,
  });
  const { exactEokNum, exactEokDisplay } = formatExactEokDisplay(priceNum);

  const { ssotSummary, pptxSections, normalizedAxiosHighlights } = buildSsotSummaryAndPptxSections({
    body,
    cleanAddress,
    resolvedRoadAddress,
    resolvedJibunAddress,
    resolvedPnu,
    resolvedAllPnus,
    resolvedCoords,
    resolvedTitle,
    canonicalUse,
    derivedRegion,
    priceNum,
    exactEokDisplay,
    effectiveMonthlyRentManwon,
    effectiveDepositManwon,
    totalMaintManwon,
    effectiveLandSqm,
    effectiveGfaSqm,
    resolvedSizeSignal,
    effectiveZoning,
    resolvedLandCategory,
    effectiveCompletionDate,
    effectiveFloorsAbove,
    effectiveFloorsBelow,
    rawBcrPct,
    bcrPct,
    rawFarPct,
    farPct,
    parkingSpaces,
    elevators,
    rawMainPurposeInput,
    effectiveOfficialLandPriceWonSqm,
    resolvedParcels,
    vacancyPct,
    capRatePct: basicImDoc.facts.valuation.capRatePct,
    grossYieldPct: basicImDoc.facts.valuation.grossYieldPct,
    handoverNote,
    closingLine,
    legacyPosture,
    existingSsot,
    existingEnrichment,
    facts,
    mappedFloorLeases,
    defaultPoints,
    liveLocationPoi,
    defaultComps,
    liveDbComps,
    parsedExtras,
  });

  const nowIso = new Date().toISOString();
  const mergedEnrichment =
    existingEnrichment || liveLocationPoi
      ? { ...(existingEnrichment || {}), ...(liveLocationPoi ? { locationPoi: liveLocationPoi } : {}) }
      : undefined;

  const normalizedExpectedRentRoll = normalizeExpectedRentRollRows({
    rawExpectedRentRoll,
    rawExpectedRentRollSnake,
    safeRentRollWithAreas,
  });

  const fullDocBody = assembleQuickGenerateFullDocBody({
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
  });

  const persistedOwnerId = existingOwnerId || userId;
  const gateRes = await evaluateQuickGeneratePublishGate({
    body,
    authUserId: auth.user?.id,
    shouldPersistDb,
    persistedOwnerId,
    fullDocBody,
    resolvedDisplayNameVal,
    brokerOfficeObj,
  });
  if (!gateRes.ok) return gateRes.response;
  const { effectiveStatus, statutoryReady, sharedServiceSupabase, statutoryBrokerProfile } = gateRes;

  // P0-2: Blind-guard sanitize companion DealCard before any public snapshot persistence
  const stripBlindIdentifiers = createBlindIdentifierStripper({
    derivedRegion,
    buildingNameCandidates: [
      buildingName,
      title,
      body.heroTitle,
      body.rawBuildingName,
      existingSsot?.building_name,
      (knownMatch as { buildingName?: string } | null)?.buildingName,
    ],
    safeRentRoll,
    mappedFloorLeases,
  });

  const requestedRegionRaw =
    typeof body.region === 'string' && body.region.trim() ? body.region.trim() : card4.region;
  const cleanedRegionCandidate = healCorruptedRegionLabel(
    stripLotNumbersSafe(stripBlindIdentifiers(requestedRegionRaw, '', ''))
      .replace(/(?:OO번지|OO-OO|인근)/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
    [cleanAddress, derivedRegion, resolvedTitle],
  );
  const hasUnmaskedLotNumber = checkUnmaskedLotNumber(cleanedRegionCandidate);
  const safePublicRegion =
    !cleanedRegionCandidate || hasUnmaskedLotNumber ? derivedRegion : cleanedRegionCandidate.slice(0, 14);

  const baseCard4ForPublic = buildPublicSanitizedCard4({
    body,
    card4,
    cleanAddress,
    priceNum,
    safePublicRegion,
    stripBlindIdentifiers,
  });

  let card4ForPublic: Card4Data = mergeExistingCompanionCard4({
    existingWs: preResolvedDealCardWs,
    generatedCard4: baseCard4ForPublic,
    newSpecificMainPurpose,
    cleanAddress,
    resolvedTitle,
    stripBlindIdentifiers,
  });

  const dealCardContentGate = evaluateDealCardPublishContent(card4ForPublic);
  const canPublishCompanionDealCard =
    effectiveStatus === 'published' && statutoryReady && dealCardContentGate.ok;
  fullDocBody.card4 = card4ForPublic;

  saveQuickImRecord(
    buildQuickImRecordPayload({
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
      mainPurposeInput: body.mainPurpose,
      resolvedDisplayNameVal,
      brokerOfficeObj,
      dbBrokerProfile,
      fullDocBody,
      nowIso,
    }),
  );

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
    const strictPersist =
      isRealProductionRuntime() || process.env.REQUIRE_WORKSPACE_ITEMS_TABLE === '1';
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
          status: (effectiveStatus === 'published' ? 'public_signal_ready' : 'draft') as
            | 'public_signal_ready'
            | 'draft',
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

        let { error: bErr } = await supabase.from('building_ssot_lite').upsert(buildSsotPayload(true));
        if (bErr) {
          const retryRes = await supabase.from('building_ssot_lite').upsert(buildSsotPayload(false));
          bErr = retryRes.error;
        }
        if (bErr) {
          console.error('[quick-generate] building_ssot_lite upsert error:', bErr.message);
          if (strictPersist) {
            return NextResponse.json(
              { ok: false, error: '매물 기본 정보 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.' },
              { status: 500 },
            );
          }
        }

        let linkedExistingLegacyDealCard = false;
        if (legacyBuildingId && persistedOwnerId) {
          try {
            const linkQuery = supabase
              .from('workspace_items')
              .update({ building_id: buildingId, updated_at: new Date().toISOString() })
              .eq('owner_id', persistedOwnerId)
              .eq('kind', 'dealcard')
              .eq('legacy_id', legacyBuildingId)
              .is('deleted_at', null);
            const linkRes =
              typeof (linkQuery as { select?: (cols: string) => PromiseLike<{ data?: unknown }> })?.select === 'function'
                ? await (linkQuery as { select: (cols: string) => PromiseLike<{ data?: unknown }> }).select('id')
                : await linkQuery;
            const linkedRows = (linkRes as { data?: unknown } | null)?.data;
            if (Array.isArray(linkedRows) && linkedRows.length > 0) {
              linkedExistingLegacyDealCard = true;
            }
          } catch {
            // Non-blocking legacy DealCard back-link sync
          }
        }

        const persistRes = await persistDocumentWorkspaceAndCompanionDealCard({
          supabase,
          strictPersist,
          authUserId: auth.user?.id,
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
          brokerExtrasFormInput: body.brokerExtrasForm,
          pptxSections,
          ssotSummary,
          defaultPhotos,
          fullDocBody,
          card4,
          card4ForPublic,
          newSpecificMainPurpose,
          stripBlindIdentifiers,
          statutoryBrokerProfile,
          resolvedPnu,
          posture,
        });
        if (persistRes.errorResponse) return persistRes.errorResponse;
        card4ForPublic = persistRes.updatedCard4ForPublic;
      }
    } catch (persistErr) {
      const errResp = handleQuickGeneratePersistException(persistErr, strictPersist);
      if (errResp) return errResp;
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
