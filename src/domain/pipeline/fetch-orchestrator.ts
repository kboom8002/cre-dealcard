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

export type FetcherFunction<T> = (parcel: ParcelRef) => Promise<T>;

export const FETCHERS: Record<string, FetcherFunction<any>> = {
  landLedger: async (parcel) => {
    // Stub implementation
    return { area: 100, jimok: '대' };
  },
  buildingLedger: async (parcel) => {
    return { totalFloorArea: 200, structure: '철근콘크리트' };
  },
  landUsePlan: async (parcel) => {
    return { zoning: '일반상업지역' };
  },
  officialPrice: async (parcel) => {
    return { pricePerSqm: 10000000 };
  },
  transactions: async (parcel) => {
    return [{ date: '2023-01-01', price: 5000000000 }];
  }
};

export async function fetchAllPublicData(parcels: ParcelRef[]): Promise<FetchResult> {
  const result: FetchResult = {
    parcels: {},
    errors: {}
  };

  const fetchParcelData = async (parcel: ParcelRef) => {
    const parcelKey = `${parcel.sigunguCd}-${parcel.bjdongCd}-${parcel.bun}-${parcel.ji}`;
    const data: ParcelData = {};
    const errs: string[] = [];

    const fetchKeys = Object.keys(FETCHERS) as Array<keyof ParcelData>;
    
    // Parallel fetch with partial failure tolerance
    await Promise.allSettled(
      fetchKeys.map(async (key) => {
        try {
          const fetcher = FETCHERS[key];
          if (fetcher) {
            data[key] = await fetcher(parcel);
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
