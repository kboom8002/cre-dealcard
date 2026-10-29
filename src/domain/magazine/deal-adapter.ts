/**
 * @file deal-adapter.ts
 * @description Basic IM & Studio ↔ Magazine SSOT Data Bridge & Single Deal Adapter.
 *
 * Implements SOTA candidate deal extraction, photo resolution hierarchy,
 * and mathematical parity with Basic IM YieldSet (grossYieldNetOfDeposit, noiCapRate).
 */
import { PYEONG_RATIO } from '@/lib/utils/area-conversion';
import { buildYieldSetFromBody } from '@/domain/building/mobile-im/yield-set';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('magazine-deal-adapter');

export const VALID_MAGAZINE_DEAL_STATUSES = [
  'public_signal_ready',
  'snapshot_draft_ready',
  'draft',
] as const;

export type MagazineDealStatus = typeof VALID_MAGAZINE_DEAL_STATUSES[number];

export interface MagazineDealItem {
  id: string;
  address: string;
  areaSignal: string;
  assetType: string;
  price: string;
  priceWon: number | null;
  photoUrl: string | null;
  photoUrls: string[];
  buyerInterestCount: number;
  investmentPoint: string;
  imUrl: string;
  grossYieldNetOfDeposit: number | null;
  noiCapRate: number | null;
  grossYieldOnPrice: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  annualRent: number | null;
  landAreaM2: number | null;
  landAreaPyeong: number | null;
  grossFloorAreaM2: number | null;
  grossFloorAreaPyeong: number | null;
  floors: string | null;
  zoning: string | null;
  status: string;
  attrs: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RawPhotoMeta {
  url?: unknown;
  isCover?: unknown;
  isExterior?: unknown;
  isHero?: unknown;
  role?: unknown;
  category?: unknown;
  type?: unknown;
  excluded?: unknown;
  [key: string]: unknown;
}

/**
 * Parses mixed string or number price bands (e.g., "50억", "760억", "40~50억", "225억 원", 5000000000)
 * into numeric KRW won.
 */
export function parsePriceBandToWon(raw?: string | number | null): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    // If number is already >= 1,000,000, treat as Won. If <= 100,000, might be Eok.
    return raw > 10_000_000 ? Math.round(raw) : Math.round(raw * 100_000_000);
  }
  const str = String(raw).trim();
  if (!str) return null;

  // 1. Check for "N억" pattern, taking upper bound if range like "40~50억" or "40억~50억"
  const eokMatches = [...str.matchAll(/([\d,.]+)\s*억/g)];
  if (eokMatches.length > 0) {
    const lastMatch = eokMatches[eokMatches.length - 1];
    if (lastMatch && lastMatch[1]) {
      const val = parseFloat(lastMatch[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) {
        return Math.round(val * 100_000_000);
      }
    }
  }

  // 2. Check for "N만원" or "N만" pattern, taking upper bound if range
  const manMatches = [...str.matchAll(/([\d,.]+)\s*만/g)];
  if (manMatches.length > 0) {
    const lastMatch = manMatches[manMatches.length - 1];
    if (lastMatch && lastMatch[1]) {
      const val = parseFloat(lastMatch[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0) {
        return Math.round(val * 10_000);
      }
    }
  }

  // 3. Pure numeric string
  const numOnly = str.replace(/[^\d.]/g, '');
  if (numOnly) {
    const val = parseFloat(numOnly);
    if (!isNaN(val) && val > 0) {
      return val > 10_000_000 ? Math.round(val) : Math.round(val * 100_000_000);
    }
  }

  return null;
}

function normalizeRawPhotos(photosData: unknown): RawPhotoMeta[] {
  if (!photosData) return [];

  // If photosData is a single string URL
  if (typeof photosData === 'string') {
    return [{ url: photosData }];
  }

  // If photosData is an array
  if (Array.isArray(photosData)) {
    return photosData
      .map((item) => (typeof item === 'string' ? { url: item } : (item as RawPhotoMeta)))
      .filter((item): item is RawPhotoMeta => !!item && typeof item === 'object');
  }

  // If photosData is an object with `urls` (e.g. layers.photos.urls)
  if (typeof photosData === 'object' && photosData !== null) {
    const obj = photosData as Record<string, unknown>;
    if (Array.isArray(obj.urls)) {
      return obj.urls
        .map((item) => (typeof item === 'string' ? { url: item } : (item as RawPhotoMeta)))
        .filter((item): item is RawPhotoMeta => !!item && typeof item === 'object');
    }
    if (Array.isArray(obj.photos)) {
      return normalizeRawPhotos(obj.photos);
    }
  }

  return [];
}

function isValidPhotoUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  // Reject unsupported formats like .wdp
  if (/\.wdp($|\?)/i.test(trimmed)) return false;
  return true;
}

/**
 * Resolves all non-excluded valid photo URLs for a deal across array/object schemas.
 */
export function resolveDealPhotoUrls(photosData: unknown): string[] {
  const normalized = normalizeRawPhotos(photosData);
  return normalized
    .filter((p) => p.excluded !== true && isValidPhotoUrl(p.url))
    .map((p) => (p.url as string).trim());
}

/**
 * Resolves the primary cover photo for a deal following strict priority:
 * 1. isCover === true || isHero === true || role === 'cover'
 * 2. isExterior === true || role === 'exterior' || category === 'exterior' || type === 'exterior'
 * 3. First non-excluded valid photo URL
 * 4. null
 */
export function resolveDealCoverPhoto(photosData: unknown): string | null {
  const normalized = normalizeRawPhotos(photosData);
  const eligible = normalized.filter((p) => p.excluded !== true && isValidPhotoUrl(p.url));

  if (eligible.length === 0) return null;

  // 1. Cover / Hero priority
  const cover = eligible.find(
    (p) => p.isCover === true || p.isHero === true || String(p.role).toLowerCase() === 'cover',
  );
  if (cover?.url && typeof cover.url === 'string') return cover.url.trim();

  // 2. Exterior priority
  const exterior = eligible.find(
    (p) =>
      p.isExterior === true ||
      String(p.role).toLowerCase() === 'exterior' ||
      String(p.category).toLowerCase() === 'exterior' ||
      String(p.type).toLowerCase() === 'exterior',
  );
  if (exterior?.url && typeof exterior.url === 'string') return exterior.url.trim();

  // 3. First eligible URL
  const first = eligible[0]?.url;
  return typeof first === 'string' ? first.trim() : null;
}

export interface AdaptBuildingParams {
  building: {
    id: string;
    raw_address?: string | null;
    area_signal?: string | null;
    asset_type?: string | null;
    price_band?: string | null;
    status?: string | null;
    matched_buyer_count?: number | null;
    layers?: Record<string, unknown> | null;
    [key: string]: unknown;
  };
  imDoc?: {
    doc_type?: string;
    body?: Record<string, any>;
    [key: string]: unknown;
  } | null;
  pendingSnippet?: {
    investmentPoint?: string;
    photoUrl?: string;
    [key: string]: unknown;
  } | null;
}

/**
 * Adapts raw building_ssot_lite and document_objects data into a unified,
 * rich MagazineDealItem.
 */
export function adaptBuildingToMagazineDeal(params: AdaptBuildingParams): MagazineDealItem {
  const { building, imDoc, pendingSnippet } = params;
  const layers = (building.layers && typeof building.layers === 'object' ? building.layers : {}) as Record<string, unknown>;
  const body = imDoc?.body ?? {};

  // 1. Basic Identity
  const id = String(building.id);
  const address = String(building.raw_address ?? body.ssot_summary?.address ?? '');
  const areaSignal = String(building.area_signal ?? body.ssot_summary?.area_signal ?? '');
  const assetType = String(building.asset_type ?? body.ssot_summary?.asset_type ?? body.heroCard?.assetType ?? '상업용 부동산');

  // 2. Photos
  // Extract photos from body or layers
  const photoSource = body.photos_v2 ?? body.photos ?? layers.photos;
  const photoUrls = resolveDealPhotoUrls(photoSource);
  const photoUrl = resolveDealCoverPhoto(photoSource) ?? pendingSnippet?.photoUrl ?? (photoUrls[0] ?? null);

  // 3. Price & Financial Parity
  const askingPriceDisplay = body.heroCard?.askingPriceDisplay ?? building.price_band ?? (layers.askingPriceDisplay as string | undefined);
  const price = askingPriceDisplay ? String(askingPriceDisplay) : '가격 비공개';
  
  // Calculate price in KRW
  const layersPriceWon = typeof layers.askingPriceManwon === 'number' ? layers.askingPriceManwon * 10_000 : null;
  let rawPriceForParse: string | number | null = layersPriceWon;
  if (rawPriceForParse == null && body.ssot_summary?.asking_price_manwon != null) {
    rawPriceForParse = body.ssot_summary.asking_price_manwon * 10_000;
  }
  if (rawPriceForParse == null) {
    rawPriceForParse = price;
  }
  const priceWon = parsePriceBandToWon(rawPriceForParse);

  // Financial metrics from YieldSet
  const yieldSet = body && Object.keys(body).length > 0 ? buildYieldSetFromBody(body) : null;

  let grossYieldNetOfDeposit: number | null = yieldSet?.grossYieldNetOfDeposit ?? null;
  let noiCapRate: number | null = yieldSet?.noiCapRate ?? null;
  let grossYieldOnPrice: number | null = yieldSet?.grossYieldOnPrice ?? null;
  let deposit: number | null = yieldSet?.assumptions?.depositKrw ?? null;
  let annualRent: number | null = yieldSet?.annualRentKrw ?? null;
  let monthlyRent: number | null = annualRent && annualRent > 0 ? Math.round(annualRent / 12) : null;

  // Fallback calculation from layers if YieldSet yields were not produced
  if (grossYieldNetOfDeposit == null && priceWon && priceWon > 0) {
    const rawDepositWon = typeof layers.totalDepositManwon === 'number'
      ? layers.totalDepositManwon * 10_000
      : typeof layers.depositKrw === 'number'
      ? layers.depositKrw
      : 0;
    const rawMonthlyRentWon = typeof layers.monthlyRentTotalKrw === 'number'
      ? layers.monthlyRentTotalKrw
      : typeof layers.monthlyRentManwon === 'number'
      ? layers.monthlyRentManwon * 10_000
      : 0;

    if (rawMonthlyRentWon > 0) {
      deposit = deposit ?? rawDepositWon;
      monthlyRent = monthlyRent ?? rawMonthlyRentWon;
      annualRent = annualRent ?? (rawMonthlyRentWon * 12);
      const net = priceWon - rawDepositWon;
      if (net > 0) {
        grossYieldNetOfDeposit = Number(((rawMonthlyRentWon * 12 / net) * 100).toFixed(2));
      }
      grossYieldOnPrice = Number(((rawMonthlyRentWon * 12 / priceWon) * 100).toFixed(2));
    }
  }

  if (noiCapRate == null && typeof layers.noiCapRate === 'number') {
    noiCapRate = layers.noiCapRate;
  }

  // 4. Physical Specs & Area Conversion (PYEONG_RATIO = 0.3025)
  const rawLandM2 = Number(layers.landAreaM2 ?? body.ssot_summary?.land_area_sqm);
  const landAreaM2 = Number.isFinite(rawLandM2) && rawLandM2 > 0 ? Number(rawLandM2.toFixed(2)) : null;
  const landAreaPyeong = landAreaM2 != null ? Number((landAreaM2 * PYEONG_RATIO).toFixed(1)) : (Number(body.heroCard?.landAreaPyeong) || null);

  const rawGrossM2 = Number(layers.grossFloorAreaM2 ?? body.ssot_summary?.total_gross_area_sqm);
  const grossFloorAreaM2 = Number.isFinite(rawGrossM2) && rawGrossM2 > 0 ? Number(rawGrossM2.toFixed(2)) : null;
  const grossFloorAreaPyeong = grossFloorAreaM2 != null ? Number((grossFloorAreaM2 * PYEONG_RATIO).toFixed(1)) : (Number(body.heroCard?.grossFloorAreaPyeong) || null);

  // Floors & Zoning
  const floors = body._studioSlideOverrides?.overview?.floors ?? body.heroCard?.floors ?? body.ssot_summary?.floors ?? (layers.floors as string | undefined) ?? null;
  const zoning = body._studioSlideOverrides?.overview?.zoning ?? body.ssot_summary?.zoning ?? (layers.zoning as string | undefined) ?? null;

  // 5. Investment Thesis & Key Points
  let investmentPoint = body._studioSlideOverrides?.overview?.investmentPoint
    ?? body.heroCard?.keyInvestmentPoint
    ?? pendingSnippet?.investmentPoint
    ?? (layers.keyInvestmentPoint as string | undefined);

  if (!investmentPoint && Array.isArray(body.sections)) {
    const thesisSection = body.sections.find(
      (s: any) => s.sectionId === '06_buyer_fit' || s.sectionId === 'investment_thesis',
    );
    if (thesisSection?.content && typeof thesisSection.content === 'string') {
      const match = thesisSection.content.match(/[•\-\*]\s*(.+)/);
      if (match && match[1]) {
        investmentPoint = match[1].trim();
      } else {
        investmentPoint = thesisSection.content.split('\n')[0]?.trim();
      }
    }
  }

  if (!investmentPoint) {
    investmentPoint = `${areaSignal ? `${areaSignal} ` : ''}핵심 상권 ${assetType}`;
  }

  // 6. Router & IM Link
  const imUrl = `/im-lite/${id}`;

  return {
    id,
    address,
    areaSignal,
    assetType,
    price,
    priceWon,
    photoUrl,
    photoUrls,
    buyerInterestCount: typeof building.matched_buyer_count === 'number' ? building.matched_buyer_count : 0,
    investmentPoint,
    imUrl,
    grossYieldNetOfDeposit,
    noiCapRate,
    grossYieldOnPrice,
    deposit,
    monthlyRent,
    annualRent,
    landAreaM2,
    landAreaPyeong,
    grossFloorAreaM2,
    grossFloorAreaPyeong,
    floors,
    zoning,
    status: String(building.status ?? 'draft'),
    attrs: layers,
  };
}

/**
 * Fetches candidate deals for a broker using valid status constraints,
 * joining corresponding document_objects for rich SSOT metrics.
 */
export async function fetchMagazineCandidateDeals(
  supabase: any,
  userId: string,
  options?: { limit?: number; includeDrafts?: boolean },
): Promise<MagazineDealItem[]> {
  const limit = options?.limit ?? 10;
  const statuses = options?.includeDrafts === false
    ? ['public_signal_ready', 'snapshot_draft_ready']
    : [...VALID_MAGAZINE_DEAL_STATUSES];

  const { data: dealsData, error: dealsErr } = await supabase
    .from('building_ssot_lite')
    .select('id, raw_address, area_signal, asset_type, price_band, status, matched_buyer_count, layers, owner_id, updated_at')
    .eq('owner_id', userId)
    .in('status', statuses)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (dealsErr) {
    log.error('fetchMagazineCandidateDeals building_ssot_lite error:', dealsErr);
    return [];
  }

  if (!dealsData || dealsData.length === 0) {
    return [];
  }

  // Fetch corresponding document_objects if available
  const dealIds = dealsData.map((d: any) => d.id);
  let docData: any[] | null = null;
  if (dealIds.length > 0) {
    try {
      const res = await supabase
        .from('document_objects')
        .select('building_id, doc_type, body')
        .in('building_id', dealIds)
        .in('doc_type', ['im_lite', 'im_lite_draft', 'mobile_im']);
      docData = res?.data ?? null;
    } catch {
      docData = null;
    }
  }

  const docsByBuildingId = new Map<string, any>();
  if (Array.isArray(docData)) {
    for (const doc of docData) {
      if (doc.building_id && !docsByBuildingId.has(doc.building_id)) {
        docsByBuildingId.set(doc.building_id, doc);
      }
    }
  }

  return dealsData.map((building: any) =>
    adaptBuildingToMagazineDeal({
      building,
      imDoc: docsByBuildingId.get(building.id) ?? null,
    }),
  );
}
