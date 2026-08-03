import { ParcelRef } from '../verification/address-resolver';

export interface FetchResult {
  parcels: Record<string, ParcelData>;
  errors: Record<string, string>;
}

export interface ParcelData {
  landLedger?: any;
  buildingLedger?: any;
  landUsePlan?: any;
  officialPrice?: any;
  transactions?: any[];
}

export const FETCHERS = {
  landLedger:    { api: '토지대장',          timeout: 8_000,  retries: 2, ttlDays: 90 },
  buildingLedger:{ api: '건축물대장',        timeout: 12_000, retries: 2, ttlDays: 90 },
  landUsePlan:   { api: '토지이용계획확인원', timeout: 10_000, retries: 2, ttlDays: 30 },
  officialPrice: { api: '개별공시지가',      timeout: 6_000,  retries: 1, ttlDays: 180 },
  transactions:  { api: '실거래가',            timeout: 10_000, retries: 1, ttlDays: 7 },
} as const;

export async function fetchAllPublicData(parcels: ParcelRef[]): Promise<FetchResult> {
  const result: FetchResult = {
    parcels: {},
    errors: {}
  };

  const fetchParcelData = async (parcel: ParcelRef) => {
    const parcelKey = `${parcel.sigunguCd}-${parcel.bjdongCd}-${parcel.bun}-${parcel.ji}`;
    const data: ParcelData = {};
    const errs: string[] = [];

    const fetchKeys = Object.keys(FETCHERS) as Array<keyof typeof FETCHERS>;
    
    // Parallel fetch with partial failure tolerance
    await Promise.allSettled(
      fetchKeys.map(async (key) => {
        try {
          const config = FETCHERS[key];
          if (config) {
            // Simulated fetch referencing config.timeout and config.retries
            data[key as keyof ParcelData] = { api: config.api, timeout: config.timeout, retries: config.retries };
          }
        } catch (e: any) {
          errs.push(`Failed to fetch ${key}: ${e.message}`);
        }
      })
    );

    result.parcels[parcelKey] = data;
    if (errs.length > 0) {
      result.errors[parcelKey] = errs.join(', ');
    }
  };

  await Promise.allSettled(parcels.map(fetchParcelData));

  return result;
}
