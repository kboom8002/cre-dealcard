/**
 * 부동산 시세 크롤러 및 API 인터페이스 (Mock)
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
  console.log(`Fetching comparables for ${assetType} near ${address} within ${radiusKm}km`);
  
  await new Promise(resolve => setTimeout(resolve, 1000));

  return {
    avgPricePerSqmKrw: 25000000, // 평당 약 8,250만원 수준 (㎡당 2,500만원)
    comparables: [
      {
        source: "네이버부동산",
        title: "역삼동 수익형 꼬마빌딩",
        priceKrw: 4000000000,
        pricePerSqmKrw: 26666666,
        areaSqm: 150,
        distanceKm: 0.3,
        listedDate: "2026-06-01",
      },
      {
        source: "네이버부동산",
        title: "대로변 오피스 빌딩 급매",
        priceKrw: 6000000000,
        pricePerSqmKrw: 24000000,
        areaSqm: 250,
        distanceKm: 0.8,
        listedDate: "2026-05-15",
      }
    ]
  };
}
