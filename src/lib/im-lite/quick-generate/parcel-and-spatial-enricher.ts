/**
 * @file src/lib/im-lite/quick-generate/parcel-and-spatial-enricher.ts
 * @description Multi-parcel normalization, attached-lot discovery, public parcel enrichment,
 * and bounded <=2,200ms Spatial POI + Official Land Price + MOLIT RTMS micro-enrichment.
 */

import { m2ToPyeong } from '@/domain/building/im-core/facts/area';
import type { BrokerExtras } from '@/domain/building/mobile-im/broker-extras';
import {
  parseBrokerParcels,
  summarizeParcels,
  type BrokerParcel,
} from '@/domain/building/mobile-im/parcel-input';
import { padNumber } from '@/lib/external/address-resolver';

export interface LiveDbCompItem {
  location: string;
  dealDate: string;
  buildingUse: string;
  transactionPriceManwon: number;
  gfaPerPyManwon: number;
  landPerPyManwon?: number;
}

export interface ParcelAndSpatialEnrichmentResult {
  resolvedAllPnus: string[];
  effectiveLandSqm: number;
  effectiveOfficialLandPriceWonSqm: number;
  resolvedLandCategory: string;
  resolvedParcels: any;
  defaultComps: Array<{
    distance: string;
    dealDate: string;
    buildingUse: string;
    pricePerPyeongLandWon: number;
    comparisonDiffPct: number;
  }>;
  liveLocationPoi: Record<string, any> | null;
  liveDbComps: LiveDbCompItem[];
  effectiveCompsForDoc: Array<{
    distance: string;
    dealDate: string;
    buildingUse: string;
    pricePerPyeongLandWon: number;
    comparisonDiffPct: number;
  }>;
}

export async function enrichParcelsAndSpatialContext(params: {
  body: Record<string, any>;
  cleanAddress: string;
  derivedRegion: string;
  resolvedPnu: string;
  resolvedCoords?: { lat: number; lng: number };
  resolvedJibunAddress: string;
  existingAllPnus: string[];
  existingSsot?: Record<string, any>;
  existingEnrichment?: Record<string, any>;
  parsedSecondaryLots: Array<{ bun: string; ji: string; isMount?: boolean }>;
  hasExplicitMultiLotHint: boolean;
  landAreaSqmInput: unknown;
  initialEffectiveLandSqm: number;
  rawOfficialLandPrice: number;
  officialLandPriceWonSqm: number;
  priceNum: number;
  parsedExtras?: BrokerExtras;
}): Promise<ParcelAndSpatialEnrichmentResult> {
  const {
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
    landAreaSqmInput,
    initialEffectiveLandSqm,
    rawOfficialLandPrice,
    officialLandPriceWonSqm,
    priceNum,
    parsedExtras,
  } = params;

  let effectiveLandSqm = initialEffectiveLandSqm;

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
            resolvedPnu[10] === '2' ? '1' : '0',
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
        (p) =>
          p.pnu &&
          (p.areaM2 === undefined || !p.landCategory || p.officialPricePerM2 === undefined),
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
          /(?:^|\s)([가-힣0-9]+(?:동|읍|면|리|가))(?=\s+\d|\s+산\s*\d)/,
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
  const resolvedAllPnus = Array.from(new Set([...parcelSummary.pnus, ...candidateAllPnus])).filter(
    (p) => /^\d{19}$/.test(p),
  );
  if (parcelSummary.isMulti && parcelSummary.totalAreaM2 && parcelSummary.totalAreaM2 > 0) {
    const firstParcelArea = Number(normalizedParcels[0]?.areaM2 || 0);
    if (
      !(Number(landAreaSqmInput) > 0) ||
      (firstParcelArea > 0 && Math.abs(Number(landAreaSqmInput) - firstParcelArea) <= 1.0)
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
  const subjectLandPricePerPyeongWon =
    priceNum > 0 ? Math.round((priceNum * 10000) / subjectLandPyeong) : 0;
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

  let liveLocationPoi: Record<string, any> | null =
    existingEnrichment?.locationPoi && typeof existingEnrichment.locationPoi === 'object'
      ? existingEnrichment.locationPoi
      : null;
  let liveDbComps: LiveDbCompItem[] = [];

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
            if (
              effectiveOfficialLandPriceWonSqm <= 0 &&
              resolvedPnu &&
              /^\d{19}$/.test(resolvedPnu)
            ) {
              const { fetchLandPrice } = await import('@/lib/external/land-price-api');
              const lp = await fetchLandPrice(resolvedPnu);
              if (lp && Number(lp.pricePerSqm) > 0) {
                effectiveOfficialLandPriceWonSqm = Math.round(Number(lp.pricePerSqm));
                if (
                  lp.landCategory &&
                  (!parcelSummary.landCategoryLabel || resolvedLandCategory === '대')
                ) {
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
                    .select(
                      'address, district, dong, transaction_price, building_area, usage_type, transaction_date',
                    )
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
                        const bldPy =
                          Number(r.building_area) > 0 ? m2ToPyeong(Number(r.building_area)) : 0;
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

  return {
    resolvedAllPnus,
    effectiveLandSqm,
    effectiveOfficialLandPriceWonSqm,
    resolvedLandCategory,
    resolvedParcels,
    defaultComps,
    liveLocationPoi,
    liveDbComps,
    effectiveCompsForDoc,
  };
}
