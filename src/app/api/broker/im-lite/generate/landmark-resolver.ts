/**
 * landmark-resolver.ts
 * 
 * 랜드마크(역명, 사거리 등)를 카카오 키워드 검색 API로 정규 주소로 변환합니다.
 * 
 * 예: "당산역" → "서울 영등포구 당산동3가 1"
 *     "강남역" → "서울 강남구 역삼동 858"
 *     "신사사거리" → "서울 강남구 신사동 634"
 */

export async function searchLandmarkAddress(
  landmark: string
): Promise<string | null> {
  const kakaoKey = process.env.KAKAO_REST_API_KEY;
  if (!kakaoKey) {
    console.warn('[landmark-resolver] KAKAO_REST_API_KEY not configured');
    return null;
  }

  // 너무 짧은 입력은 무시
  if (!landmark || landmark.length < 2) return null;

  try {
    const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(landmark)}&size=1`;
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${kakaoKey}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      console.warn(`[landmark-resolver] Kakao API ${res.status} for "${landmark}"`);
      return null;
    }

    const data = await res.json();
    const doc = data.documents?.[0];
    if (!doc) {
      console.info(`[landmark-resolver] No results for "${landmark}"`);
      return null;
    }

    // address_name (지번주소) 또는 road_address_name (도로명주소) 반환
    const result = doc.address_name || doc.road_address_name || null;
    if (result) {
      console.info(`[landmark-resolver] "${landmark}" → "${result}"`);
    }
    return result;
  } catch (err: any) {
    console.warn(`[landmark-resolver] Error for "${landmark}":`, err?.message);
    return null;
  }
}
