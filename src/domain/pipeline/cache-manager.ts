import { ParcelRef } from '../verification/address-resolver';

export interface CachePolicy {
  ttlSeconds: number;
  strategy: 'stale-while-revalidate' | 'strict';
}

export const CACHE_POLICIES: Record<string, CachePolicy> = {
  landLedger: { ttlSeconds: 86400 * 90, strategy: 'stale-while-revalidate' }, // 90 days (PIPE-02.4)
  buildingLedger: { ttlSeconds: 86400 * 90, strategy: 'stale-while-revalidate' }, // 90 days (PIPE-02.4)
  landUsePlan: { ttlSeconds: 86400 * 30, strategy: 'stale-while-revalidate' }, // 30 days (PIPE-02.4)
  officialPrice: { ttlSeconds: 86400 * 180, strategy: 'strict' }, // 180 days (PIPE-02.4)
  transactions: { ttlSeconds: 86400 * 7, strategy: 'stale-while-revalidate' }, // 7 days (PIPE-02.4)
};

export async function invalidateOfficialPriceBatch(parcels: ParcelRef[]): Promise<void> {
  // In a real implementation, this would clear the cache for the given parcels' official price
  console.log(`[cache-manager] Invalidating official price cache for ${parcels.length} parcels.`);
}
