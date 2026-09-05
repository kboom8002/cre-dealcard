import type { DealcardPackage } from './banding-engine';
import type { ReleaseRecord } from '../im-core/approval/ledger-service';

export interface LegacyDealcardView {
  dealId: string;
  title: string;
  priceDisplay: string;
  locationDisplay: string;
  landAreaDisplay: string;
  yieldDisplay?: string;
  keyPoints: string[];
  isPublished: boolean;
  status: string;
}

export function adaptPackageToLegacyView(
  dealId: string,
  pkg: DealcardPackage,
  release: ReleaseRecord
): LegacyDealcardView {
  return {
    dealId,
    title: `[티저] ${pkg.bandedLocation}`,
    priceDisplay: pkg.bandedPrice,
    locationDisplay: pkg.bandedLocation,
    landAreaDisplay: pkg.bandedLandArea,
    yieldDisplay: pkg.bandedYield,
    keyPoints: pkg.highlights,
    isPublished: release.status === 'PUBLISHED',
    status: release.status,
  };
}
