// src/lib/external/kakao-static-map.ts
// 카카오 Static Map URL 생성기.

export interface StaticMapOptions {
  lat: number;
  lng: number;
  /** 줌 레벨 1–14, 기본값 3 */
  level?: number;
  /** 이미지 너비(px), 기본값 640 */
  width?: number;
  /** 이미지 높이(px), 기본값 400 */
  height?: number;
  /** 중앙 마커 표시 여부, 기본값 true */
  marker?: boolean;
}

/**
 * 주어진 위경도로 카카오 Static Map URL을 생성합니다.
 * KAKAO_REST_API_KEY가 없으면 placeholder URL을 반환합니다.
 */
export function buildKakaoStaticMapUrl(options: StaticMapOptions): string {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  const { lat, lng, level = 3, width = 640, height = 400, marker = true } = options;

  if (!apiKey) {
    return `https://placehold.co/${width}x${height}/1a1a2e/ffffff?text=${encodeURIComponent('지도 준비 중')}`;
  }

  const baseUrl = 'https://spi.maps.daum.net/mapscms/map/staticmap.png';
  const params = new URLSearchParams({
    apikey: apiKey,
    center: `${lng},${lat}`,
    level: String(level),
    w: String(width),
    h: String(height),
    ...(marker ? { markers: `type:d|size:medium|${lng},${lat}` } : {}),
  });

  return `${baseUrl}?${params.toString()}`;
}
