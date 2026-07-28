/**
 * @module PhotoClassifier
 * @description CREDEAL v3 Photo Auto-Classifier & Safety Guard (Stage 4 - Track MI)
 * 
 * Classifies photos into 14 CRE asset photo categories.
 * Enforces photo privacy policy: Exterior, signage, and building name photos
 * MUST be filtered out of Basic/Teaser IM views to prevent property address discovery.
 * @see SDD §8 S3-T10
 */

/**
 * Represents the 14 CRE asset photo categories for classification.
 * Exterior and signage categories are restricted in public views to protect address privacy.
 */
export type PhotoCategory =
  | 'exterior_front'
  | 'exterior_side'
  | 'signage_building_name'
  | 'lobby_reception'
  | 'office_interior'
  | 'retail_interior'
  | 'f_and_b_interior'
  | 'parking_lot'
  | 'rooftop_terrace'
  | 'elevator_hall'
  | 'restroom'
  | 'floor_plan'
  | 'cadastral_map'
  | 'surrounding_street';

/**
 * Result of the photo auto-classification process.
 * Contains the determined category and privacy safety flag.
 */
export interface PhotoClassificationResult {
  /** The unique identifier of the photo */
  photoId: string;
  /** The classified CRE asset photo category */
  category: PhotoCategory;
  isPublicSafe: boolean; // False for exterior/signage/street photos in Basic IM
  confidence: number;
}

const PUBLIC_RESTRICTED_CATEGORIES: PhotoCategory[] = [
  'exterior_front',
  'exterior_side',
  'signage_building_name',
  'surrounding_street',
];

/**
 * Classifies a photo based on its filename or tag, and determines if it is safe for public view.
 * Exterior, signage, and street photos are marked as unsafe for Basic IM to prevent address discovery.
 * 
 * @param {string} photoId - The unique identifier of the photo.
 * @param {string} filenameOrTag - The filename or tag used to determine the category.
 * @returns {PhotoClassificationResult} The classification result including the category and privacy flag.
 * @example
 * const result = classifyAssetPhoto('p123', '건물 외관.jpg');
 * // returns { category: 'exterior_front', isPublicSafe: false, ... }
 */
export function classifyAssetPhoto(
  photoId: string,
  filenameOrTag: string
): PhotoClassificationResult {
  const name = filenameOrTag.toLowerCase();

  let category: PhotoCategory = 'office_interior';
  let isPublicSafe = true;

  if (name.includes('외관') || name.includes('전경') || name.includes('exterior')) {
    category = 'exterior_front';
    isPublicSafe = false;
  } else if (name.includes('간판') || name.includes('건물명') || name.includes('sign')) {
    category = 'signage_building_name';
    isPublicSafe = false;
  } else if (name.includes('주변') || name.includes('도로') || name.includes('street')) {
    category = 'surrounding_street';
    isPublicSafe = false;
  } else if (name.includes('도면') || name.includes('평면') || name.includes('plan')) {
    category = 'floor_plan';
  } else if (name.includes('지적') || name.includes('map')) {
    category = 'cadastral_map';
  } else if (name.includes('로비') || name.includes('lobby')) {
    category = 'lobby_reception';
  } else if (name.includes('주차') || name.includes('parking')) {
    category = 'parking_lot';
  } else if (name.includes('옥상') || name.includes('rooftop')) {
    category = 'rooftop_terrace';
  } else if (name.includes('상가') || name.includes('식당') || name.includes('retail')) {
    category = 'retail_interior';
  }

  if (PUBLIC_RESTRICTED_CATEGORIES.includes(category)) {
    isPublicSafe = false;
  }

  return {
    photoId,
    category,
    isPublicSafe,
    confidence: 0.90,
  };
}

/**
 * Filters a list of classified photos based on the IM (Information Memorandum) tier and NDA status.
 * Basic IM views have exterior and signage photos redacted to protect the asset's address.
 * 
 * @param {PhotoClassificationResult[]} photos - The list of classified photos to filter.
 * @param {'basic' | 'pro'} tier - The IM tier requesting the photos ('basic' or 'pro').
 * @param {boolean} [isNDASigned=false] - Whether a Non-Disclosure Agreement (NDA) is signed.
 * @returns {PhotoClassificationResult[]} The filtered list of photos safe for the given tier.
 */
export function filterPhotosForTier(
  photos: PhotoClassificationResult[],
  tier: 'basic' | 'pro',
  isNDASigned: boolean = false
): PhotoClassificationResult[] {
  if (tier === 'pro' && isNDASigned) {
    return photos; // Pro IM can view all photos including exterior
  }

  // Basic IM filters out exterior/signage photos to protect address
  return photos.filter((p) => p.isPublicSafe);
}
