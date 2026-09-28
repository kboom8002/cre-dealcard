// src/lib/external/kakao-static-map.ts
// 카카오 Static Map URL 생성기 (서버 프록시 경유).

export interface StaticMapOptions {
  lat: number;
  lng: number;
  /** 줌 레벨 1–14, 기본값 3 */
  level?: number;
  /** 이미지 너비(px), 기본값 768 */
  width?: number;
  /** 이미지 높이(px), 기본값 320 */
  height?: number;
  /** 중앙 마커 표시 여부, 기본값 true */
  marker?: boolean;
}

/**
 * 주어진 위경도로 카카오 Static Map 프록시 URL을 생성합니다.
 * 브라우저에서 안전하게 로드할 수 있는 /api/public/map/static URL을 반환합니다.
 */
export function buildKakaoStaticMapUrl(options: StaticMapOptions): string {
  const { lat, lng, level = 3, width = 768, height = 320 } = options;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return `https://placehold.co/${width}x${height}/1a1a2e/94a3b8?text=${encodeURIComponent('좌표 확인 필요')}`;
  }

  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    w: String(width),
    h: String(height),
    level: String(level),
  });

  return `/api/public/map/static?${params.toString()}`;
}
