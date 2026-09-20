/**
 * 부동산 시세 크롤러 및 API 인터페이스 (Stub)
 * 주변 유사 매물의 호가를 수집하여 벤치마킹 데이터로 활용합니다.
 */

export interface ComparableListing {
  source: "네이버부동산" | "직방" | "기타";
  title: string;
  priceKrw: number; // 매매가(원)
  pricePerSqmKrw: number; // ㎡당 단가(원)
  areaSqm: number; // 연면적
  distanceKm: number; // 대상 물건과의 거리
  listedDate: string;
  url?: string;
}

export interface MarketPriceData {
  avgPricePerSqmKrw: number; // 주변 평균 ㎡당 단가
  comparables: ComparableListing[];
}

export async function fetchComparableListings(
  address: string,
  assetType: string,
  radiusKm: number = 1.0
): Promise<MarketPriceData> {
  console.warn('[naver-realestate-api] Real API not connected. Returning empty comparables.');

  return {
    avgPricePerSqmKrw: 0,
    comparables: []
  };
}
