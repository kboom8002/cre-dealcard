const GOVT_API_BASE = 'http://apis.data.go.kr/1613000/BldRgstService_v2';

export interface GovtBuildingInfo {
  exists: boolean;
  mainPurpose?: string;      // 주용도 (e.g. "업무시설")
  totalFloorArea?: number;   // 연면적 (㎡)
  buildYear?: number;        // 사용승인일 연도
  address?: string;          // 정제된 주소
}

/**
 * 국토교통부 건축물대장 서비스 표제부 조회 API 연동
 * @param sigunguCd 시군구코드 (5자리, 예: '11680')
 * @param bjdongCd 법정동코드 (5자리, 예: '10100')
 * @param bun 번 (본번, 예: '742')
 * @param ji 지 (부번, 예: '1')
 */
export async function fetchBuildingRegister(
  sigunguCd: string,
  bjdongCd: string,
  bun: string,
  ji: string,
): Promise<GovtBuildingInfo> {
  const apiKey = process.env.GOVT_DATA_API_KEY;
  
  // API Key가 없거나 테스트인 경우 개발용 안전 폴백 데이터 반환
  if (!apiKey || apiKey === 'mock_key' || process.env.NODE_ENV === 'test') {
    console.warn("[govt-api-client] GOVT_DATA_API_KEY is missing or in test environment. Returning mock data.");
    
    // 역삼동 742-1 (테스트용 빌딩)에 대한 모의 응답
    if (sigunguCd === '11680' && bjdongCd === '10100' && bun === '742' && ji === '1') {
      return {
        exists: true,
        mainPurpose: '업무시설',
        totalFloorArea: 9917.3, // 평당 3.30578 ㎡ 대략 3000평
        buildYear: 2015,
        address: '서울특별시 강남구 역삼동 742-1',
      };
    }
    
    return { exists: false };
  }

  // 본번(bun)과 부번(ji)은 공공 데이터 명세 상 각각 4자리 문자열(앞은 0으로 패딩)로 넘겨야 정확히 조회됩니다.
  const paddedBun = bun.padStart(4, '0');
  const paddedJi = ji.padStart(4, '0');

  const url = new URL(`${GOVT_API_BASE}/getBrTitleInfo`);
  url.searchParams.set('serviceKey', apiKey);
  url.searchParams.set('sigunguCd', sigunguCd);
  url.searchParams.set('bjdongCd', bjdongCd);
  url.searchParams.set('bun', paddedBun);
  url.searchParams.set('ji', paddedJi);
  url.searchParams.set('_type', 'json');

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 86400 } }); // 24h 캐시
    
    if (!res.ok) {
      console.error(`[govt-api-client] Govt API HTTP Error: ${res.status}`);
      return { exists: false };
    }

    const data = await res.json();
    const items = data?.response?.body?.items?.item;
    
    if (!items || (Array.isArray(items) && items.length === 0)) {
      return { exists: false };
    }

    const item = Array.isArray(items) ? items[0] : items;
    return {
      exists: true,
      mainPurpose: item.mainPurpsCdNm || undefined,
      totalFloorArea: item.totArea ? Number(item.totArea) : undefined,
      buildYear: item.useAprDay ? Number(item.useAprDay.substring(0, 4)) : undefined,
      address: item.platPlc ? String(item.platPlc) : undefined,
    };
  } catch (error) {
    console.error("[govt-api-client] Failed to fetch building register:", error);
    return { exists: false };
  }
}
