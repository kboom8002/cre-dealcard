/**
 * @module Photo Safety Filter
 * @description Filters photos by IM tier to protect privacy.
 * Teaser/Basic: Excludes exterior, signage, building_name categories.
 * Pro: Includes all photos.
 * @see SDD §8 S3-T10
 */
import { classifyAssetPhoto, type PhotoCategory } from '@/domain/building/photo-classifier';

interface PhotoItem {
  url: string;
  category?: PhotoCategory;
  isPrivacySensitive?: boolean;
  [key: string]: any;
}

type IMTier = 'teaser' | 'basic' | 'pro';

const RESTRICTED_CATEGORIES: PhotoCategory[] = ['exterior', 'signage', 'building_name'] as any[];

/**
 * Filters photos based on IM disclosure tier.
 * @param photos - Array of photo items with optional category metadata
 * @param tier - The IM tier ('teaser', 'basic', 'pro')
 * @returns Filtered photos safe for the given tier
 */
export function filterPhotosForTier(photos: PhotoItem[], tier: IMTier): PhotoItem[] {
  if (tier === 'pro') return photos;

  return photos.filter(photo => {
    if (photo.isPrivacySensitive) return false;
    if (photo.category && RESTRICTED_CATEGORIES.includes(photo.category as any)) return false;
    return true;
  });
}

/**
 * Returns a summary of photo filtering for display.
 */
export function getPhotoFilterSummary(totalCount: number, filteredCount: number): string {
  if (totalCount === filteredCount) return '';
  return `${totalCount}장의 사진 중 ${filteredCount}장 공개 (프라이버시 보호)`;
}
