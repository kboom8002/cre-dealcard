/**
 * @module MapTierPolicy
 * @description CREDEAL v3 Map Tiering Policy
 * 
 * Provides coordinate protection by applying a fuzzy geographic offset (~150m)
 * to Teaser and Basic IM map views to prevent exact property physical discovery.
 * @see SDD §8 S3-T18
 */

/**
 * Represents geographic coordinates.
 */
export interface LatLng {
  /** Latitude */
  lat: number;
  /** Longitude */
  lng: number;
}

/**
 * Represents the display settings and coordinates for a map view based on the user's tier.
 */
export interface MapTierResult {
  /** The coordinates to display on the map (may be offset from actual) */
  displayCoordinates: LatLng;
  /** Flag indicating if the coordinates have been fuzzied to protect exact location */
  isFuzzyOffset: boolean;
  /** Recommended zoom level for the map view (e.g., street view vs regional view) */
  zoomLevel: number;
  /** Badge text to display alongside the map (e.g., '권역 중심 반경 (블라인드 보호 중)') */
  badgeText: string;
}

/**
 * Applies deterministic fuzzy offset based on deal ID for Teaser / Basic IM
 */
export function getMapTierCoordinates(
  exactCoords: LatLng,
  tier: 'basic' | 'pro',
  isNDASigned: boolean = false,
  dealSeed: string = 'default'
): MapTierResult {
  if (tier === 'pro' && isNDASigned) {
    return {
      displayCoordinates: exactCoords,
      isFuzzyOffset: false,
      zoomLevel: 17, // Detailed street view
      badgeText: '정확한 위치 (NDA 체결됨)',
    };
  }

  // Deterministic fuzzy offset (~150m approx 0.0013 lat/lng)
  const hash = dealSeed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const latOffset = ((hash % 10) - 5) * 0.00025; // approx ±125m
  const lngOffset = (((hash * 3) % 10) - 5) * 0.00025;

  return {
    displayCoordinates: {
      lat: exactCoords.lat + latOffset,
      lng: exactCoords.lng + lngOffset,
    },
    isFuzzyOffset: true,
    zoomLevel: 14, // Regional precinct view
    badgeText: '권역 중심 반경 (블라인드 보호 중)',
  };
}
