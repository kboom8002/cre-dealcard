import { ParcelRef } from '../verification/address-resolver';

export interface CachePolicy {
  ttlSeconds: number;
  strategy: 'stale-while-revalidate' | 'strict';
}

export const CACHE_POLICIES: Record<string, CachePolicy> = {
  landLedger: { ttlSeconds: 86400 * 30, strategy: 'stale-while-revalidate' }, // 30 days
  buildingLedger: { ttlSeconds: 86400 * 30, strategy: 'stale-while-revalidate' }, // 30 days
  landUsePlan: { ttlSeconds: 86400 * 90, strategy: 'stale-while-revalidate' }, // 90 days
  officialPrice: { ttlSeconds: 86400 * 365, strategy: 'strict' }, // 1 year
  transactions: { ttlSeconds: 86400, strategy: 'stale-while-revalidate' }, // 1 day
};

export async function invalidateOfficialPriceBatch(parcels: ParcelRef[]): Promise<void> {
  // In a real implementation, this would clear the cache for the given parcels' official price
  console.log(`[cache-manager] Invalidating official price cache for ${parcels.length} parcels.`);
}
