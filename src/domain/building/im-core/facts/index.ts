/**
 * @file src/domain/building/im-core/facts/index.ts
 * @description Pure domain facts aggregator and canonical extraction layer.
 * ZERO imports of sharp, pptxgenjs, or fs.
 */

import { extractLandFacts, type PureLandFacts } from './land';
import { extractBuildingSpecs, type PureBuildingSpecs } from './building';
import { extractRentFacts, type PureRentFacts, type PureRentUnit } from './rent';
import { extractTransactionFacts, type PureTransactionFacts } from './transaction';
import { extractValuationFacts, type PureValuationFacts } from './valuation';

export {
  extractLandFacts,
  extractBuildingSpecs,
  extractRentFacts,
  extractTransactionFacts,
  extractValuationFacts,
};

export {
  PYEONG_RATIO,
  SQM_RATIO,
  m2ToPyeong,
  pyeongToM2,
  formatPyeong,
} from './area';

export type {
  PureLandFacts,
  PureBuildingSpecs,
  PureRentFacts,
  PureRentUnit,
  PureTransactionFacts,
  PureValuationFacts,
};

export type InvestmentPosture =
  | 'core_income'
  | 'value_add'
  | 'development'
  | 'owner_occupier'
  | 'repositioning';

export interface PureBuildingFacts {
  buildingId?: string;
  title: string;
  address: string;
  roadAddress?: string;
  posture: InvestmentPosture;
  land: PureLandFacts;
  building: PureBuildingSpecs;
  rent: PureRentFacts;
  transaction: PureTransactionFacts;
  valuation: PureValuationFacts;
  photos?: Array<{
    url: string;
    caption?: string;
    role?: string;
    category?: string;
    type?: string;
    isHero?: boolean;
    order?: number;
  }>;
  points?: string[];
  comps?: Array<Record<string, any>>;
  brokerOffice?: {
    name: string;
    representative: string;
    registrationNo: string;
    phone: string;
    address?: string;
  };
}

/**
 * Pure extraction function transforming raw DB / SSOT payload into typed PureBuildingFacts.
 * Guarantees zero side-effects and zero presentation dependencies.
 */
export function extractPureBuildingFacts(raw: Record<string, any>): PureBuildingFacts {
  const ssot = raw?.ssot_summary || raw || {};
  const rawBody = raw?.body || raw?.doc_body || raw?.docBody || raw;

  const rawPosture = String(
    raw?.posture ??
    rawBody?.investment_posture ??
    rawBody?.investmentPosture ??
    ssot?.investment_posture ??
    ssot?.posture ??
    'core_income'
  ).toLowerCase();

  const posture: InvestmentPosture = (
    ['core_income', 'value_add', 'development', 'owner_occupier', 'repositioning'].includes(rawPosture)
      ? rawPosture
      : rawPosture === 'owner_occupied'
      ? 'owner_occupier'
      : rawPosture === 'trading'
      ? 'value_add'
      : 'core_income'
  ) as InvestmentPosture;

  const title = String(raw?.title ?? rawBody?.title ?? raw?.building_name ?? rawBody?.building_name ?? ssot?.building_name ?? '상업용 부동산 매각');
  const address = String(raw?.address ?? rawBody?.address ?? ssot?.address ?? '서울특별시 강남구 역삼동');
  const roadAddress = raw?.road_address ?? rawBody?.road_address ?? ssot?.road_address;

  const normalizedTxRaw =
    rawBody?.asking_price_manwon == null && (rawBody?.sale_price_manwon != null || raw?.sale_price_manwon != null)
      ? { ...rawBody, asking_price_manwon: rawBody?.sale_price_manwon ?? raw?.sale_price_manwon }
      : rawBody;

  // Extract layers
  const land = extractLandFacts(rawBody);
  const building = extractBuildingSpecs(rawBody);
  const rent = extractRentFacts(rawBody);
  const transaction = extractTransactionFacts(
    normalizedTxRaw,
    land.landAreaPyeong,
    building.totalGrossAreaPyeong,
    rent.depositTotalKrw
  );
  const valuation = extractValuationFacts(
    transaction.askingPriceKrw,
    rent.depositTotalKrw,
    rent.monthlyRentTotalKrw,
    rent.maintenanceFeeMonthlyKrw,
    transaction.expectedLoanKrw
  );

  const rawPhotosInput =
    Array.isArray(rawBody?.photos_v2) && rawBody.photos_v2.length > 0
      ? rawBody.photos_v2
      : Array.isArray(raw?.photos_v2) && raw.photos_v2.length > 0
      ? raw.photos_v2
      : Array.isArray(rawBody?.photos) && rawBody.photos.length > 0
      ? rawBody.photos
      : Array.isArray(raw?.photos) && raw.photos.length > 0
      ? raw.photos
      : Array.isArray(rawBody?.photo_urls)
      ? rawBody.photo_urls.map((u: string, idx: number) => ({ url: u, order: idx }))
      : Array.isArray(raw?.photo_urls)
      ? raw.photo_urls.map((u: string, idx: number) => ({ url: u, order: idx }))
      : [];

  const nonPhotoDocCategories = new Set([
    'map',
    'floor_plan',
    'document',
    'business_card',
    'cadastral',
    'land_plan',
    'location_map',
    'district_plan_map',
  ]);

  const photos = rawPhotosInput
    .filter((p: any) => {
      const url = typeof p === 'string' ? p : p?.url;
      if (!url || typeof url !== 'string') return false;
      if (url.split('?')[0].toLowerCase().endsWith('.wdp')) return false;
      if (p && typeof p === 'object' && p.excluded === true) return false;
      const cat = String(p?.category ?? p?.type ?? '').toLowerCase();
      if (nonPhotoDocCategories.has(cat)) return false;
      return true;
    })
    .map((p: any, idx: number) =>
      typeof p === 'string'
        ? { url: p, order: idx }
        : {
            url: p.url,
            caption: p.caption,
            role: p.role,
            category: p.category || p.type,
            type: p.type || p.category,
            isHero: Boolean(p.isHero || p.role === 'cover'),
            order: typeof p.order === 'number' ? p.order : idx,
          },
    )
    .sort((a: any, b: any) => {
      const aHero = a.role === 'cover' || a.isHero ? 0 : a.role === 'exterior' ? 1 : 2;
      const bHero = b.role === 'cover' || b.isHero ? 0 : b.role === 'exterior' ? 1 : 2;
      if (aHero !== bHero) return aHero - bHero;
      return (a.order ?? 99) - (b.order ?? 99);
    })
    .slice(0, 12);

  const points = Array.isArray(rawBody?.key_points)
    ? rawBody.key_points
    : Array.isArray(rawBody?.points)
    ? rawBody.points
    : Array.isArray(ssot?.investment_points)
    ? ssot.investment_points
    : [];

  const comps = Array.isArray(rawBody?.comps)
    ? rawBody.comps
    : Array.isArray(rawBody?.comparable_transactions)
    ? rawBody.comparable_transactions
    : Array.isArray(rawBody?.comparableTransactions)
    ? rawBody.comparableTransactions
    : Array.isArray(rawBody?.broker_extras?.market_comps)
    ? rawBody.broker_extras.market_comps
    : Array.isArray(raw?.comps)
    ? raw.comps
    : [];

  const rawBroker = rawBody?.brokerOffice || raw?.brokerOffice || rawBody?.broker_office || raw?.broker_office;
  const sanitizeBrokerFactText = (val: unknown): string => {
    if (typeof val !== 'string') return '';
    const cleaned = val.replace(/\s*\(확인\s*중\)\s*/g, '').trim();
    if (!cleaned || cleaned === '담당 중개법인') return '';
    return cleaned;
  };
  const rawBrokerObj = typeof rawBroker === 'object' && rawBroker !== null ? rawBroker : null;
  const rawBrokerNameCandidate =
    typeof rawBroker === 'string'
      ? rawBroker
      : rawBrokerObj?.name || rawBrokerObj?.office_name;
  const brokerRep = sanitizeBrokerFactText(rawBrokerObj?.representative || rawBrokerObj?.broker_name) || '담당 공인중개사';
  const brokerOffice = {
    name: sanitizeBrokerFactText(rawBrokerNameCandidate) || '전담 중개사무소',
    representative: brokerRep,
    registrationNo: sanitizeBrokerFactText(rawBrokerObj?.registrationNo || rawBrokerObj?.registration_no) || '-',
    phone: sanitizeBrokerFactText(rawBrokerObj?.phone || rawBrokerObj?.contact_phone) || '-',
    address: rawBrokerObj?.address || undefined,
  };

  return {
    buildingId: raw?.id ?? raw?.building_id,
    title,
    address,
    roadAddress,
    posture,
    land,
    building,
    rent,
    transaction,
    valuation,
    photos,
    points,
    comps,
    brokerOffice,
  };
}
