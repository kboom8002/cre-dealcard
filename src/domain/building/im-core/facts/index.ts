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
  photos?: Array<{ url: string; caption?: string; role?: string }>;
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
  const rawBody = raw?.body || raw;

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

  const photos = Array.isArray(rawBody?.photos)
    ? rawBody.photos
    : Array.isArray(raw?.photos)
    ? raw.photos
    : [];

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
    : Array.isArray(raw?.comps)
    ? raw.comps
    : [];

  const rawBroker = rawBody?.brokerOffice || raw?.brokerOffice || rawBody?.broker_office || raw?.broker_office;
  const brokerOffice = {
    name: rawBroker?.name || rawBroker?.office_name || '담당 중개법인 (확인 중)',
    representative: rawBroker?.representative || rawBroker?.broker_name || '담당 공인중개사',
    registrationNo: rawBroker?.registrationNo || rawBroker?.registration_no || '-',
    phone: rawBroker?.phone || rawBroker?.contact_phone || '-',
    address: rawBroker?.address || undefined,
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
