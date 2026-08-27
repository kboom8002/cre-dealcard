/**
 * @file vworld-wms-cadastral.ts
 * @description V-World WMS GetMap API를 통한 지적도(연속지적도) 이미지 취득
 *
 * 레이어: lp_pa_cbnd_bonbun (본번) + lp_pa_cbnd_bubun (부번)
 * 좌표계: EPSG:3857 (Web Mercator)
 */

import { getVWorldApiKey, getVWorldReferer } from './vworld-config';

export interface CadastralMapResult {
  buffer: Buffer;
  base64: string; // 'image/png;base64,...'
  width: number;
  height: number;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat] (WGS84)
  _source: 'vworld_wms';
}

/**
 * WGS84 좌표를 EPSG:3857 (Web Mercator)로 변환합니다.
 */
function toEpsg3857(lat: number, lng: number): { x: number; y: number } {
  const x = lng * 20037508.34 / 180;
  const latRad = lat * Math.PI / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / Math.PI * 20037508.34;
  return { x, y };
}

/**
 * V-World WMS GetMap으로 지적도 이미지를 취득합니다.
 *
 * @param lat - 건물 위도 (WGS84)
 * @param lng - 건물 경도 (WGS84)
 * @param w - 이미지 너비 (px), 기본 800
 * @param h - 이미지 높이 (px), 기본 600
 * @param radiusM - 중심으로부터 표시 범위 (미터), 기본 150
 */
export async function fetchCadastralMapImage(
  lat: number,
  lng: number,
  w = 800,
  h = 600,
  radiusM = 150,
): Promise<CadastralMapResult | null> {
  const apiKey = getVWorldApiKey();
  if (!apiKey) {
    console.warn('[vworld-wms] VWORLD_API_KEY 미설정 — 지적도 생략');
    return null;
  }

  try {
    // ── WGS84 → EPSG:3857 변환 ──
    const center = toEpsg3857(lat, lng);

    // radiusM → 3857 단위 근사 (한국 위도 33~38°에서 충분히 정밀)
    // 1 meter ≈ 1 unit at equator in EPSG:3857, but at lat ≈ 37°:
    const cosLat = Math.cos(lat * Math.PI / 180);
    const meterToUnit = 1 / cosLat; // 위도 보정
    const dx = radiusM * meterToUnit;
    const dy = radiusM * meterToUnit;

    const bbox = [
      Math.round(center.x - dx),
      Math.round(center.y - dy),
      Math.round(center.x + dx),
      Math.round(center.y + dy),
    ].join(',');

    // WGS84 bbox (메타데이터용)
    const mPerDegLng = 111320 * cosLat;
    const mPerDegLat = 111320;
    const bboxWgs84: [number, number, number, number] = [
      lng - radiusM / mPerDegLng,
      lat - radiusM / mPerDegLat,
      lng + radiusM / mPerDegLng,
      lat + radiusM / mPerDegLat,
    ];

    // ── WMS GetMap 요청 ──
    const params = new URLSearchParams({
      SERVICE: 'WMS',
      REQUEST: 'GetMap',
      VERSION: '1.3.0',
      LAYERS: 'lp_pa_cbnd_bonbun,lp_pa_cbnd_bubun',
      STYLES: 'lp_pa_cbnd_bonbun_line,lp_pa_cbnd_bubun_line',
      CRS: 'EPSG:3857',
      BBOX: bbox,
      WIDTH: String(w),
      HEIGHT: String(h),
      FORMAT: 'image/png',
      TRANSPARENT: 'TRUE',
      KEY: apiKey,
      DOMAIN: getVWorldReferer(),
    });

    const url = `https://api.vworld.kr/req/wms?${params.toString()}`;
    const referer = getVWorldReferer();

    const res = await fetch(url, {
      headers: { 'Referer': referer },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[vworld-wms] WMS 응답 오류 (${res.status}):`, text.slice(0, 200));
      return null;
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('image')) {
      // WMS 에러 응답 (XML/text)
      const text = await res.text().catch(() => '');
      console.warn('[vworld-wms] WMS 에러 응답:', text.slice(0, 300));
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`[vworld-wms] ✅ 지적도 이미지 취득 성공 (${buffer.length} bytes, ${w}×${h})`);

    return {
      buffer,
      base64: `image/png;base64,${buffer.toString('base64')}`,
      width: w,
      height: h,
      bbox: bboxWgs84,
      _source: 'vworld_wms',
    };
  } catch (err) {
    console.warn('[vworld-wms] 지적도 이미지 취득 실패:', err);
    return null;
  }
}
