/**
 * @file vworld-wms-cadastral.ts
 * @description V-World WMS GetMap API를 통한 지적도(연속지적도) 이미지 취득
 *
 * D45: 배경 레이어(V-World Base 타일) 합성으로 고품질 지적도 제공
 * G-08: V-World WFS/Data API로 대상 필지 폴리곤을 가져와 골드 하이라이트 오버레이
 * 레이어: lp_pa_cbnd_bonbun (본번) + lp_pa_cbnd_bubun (부번)
 * 좌표계: EPSG:3857 (Web Mercator)
 */

import { getVWorldApiKey, getVWorldReferer, getVWorldDomain } from './vworld-config';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('vworld-wms-cadastral');


let sharp: typeof import('sharp') | null = null;
try { sharp = require('sharp'); } catch { /* sharp 미설치 환경 무시 */ }

export interface CadastralMapResult {
  buffer: Buffer;
  base64: string; // 'image/png;base64,...'
  width: number;
  height: number;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat] (WGS84)
  _source: 'vworld_wms';
}

/**
 * G-08: V-World Data API로 대상 PNU의 필지 폴리곤(GeoJSON)을 가져옵니다.
 * 실패 시 null 반환 (graceful fallback).
 */
async function fetchParcelPolygon(
  pnu: string,
  apiKey: string,
): Promise<Array<[number, number][]> | null> {
  try {
    const referer = getVWorldReferer();
    // PNU 부번이 0000이면 본번 필지 → BONBUN 레이어 우선
    const isBonbun = pnu.length >= 19 && pnu.slice(15) === '0000';
    const primaryLayer = isBonbun ? 'LP_PA_CBND_BONBUN' : 'LP_PA_CBND_BUBUN';
    const fallbackLayer = isBonbun ? 'LP_PA_CBND_BUBUN' : 'LP_PA_CBND_BONBUN';

    const buildUrl = (layer: string) => `https://api.vworld.kr/req/data?service=data&request=GetFeature` +
      `&data=${layer}&key=${apiKey}&domain=${encodeURIComponent(getVWorldDomain())}` +
      `&format=json&geometry=true&attribute=true&crs=EPSG:4326` +
      `&attrFilter=pnu:=:${pnu}`;

    let res = await fetch(buildUrl(primaryLayer), {
      headers: { 'Referer': referer },
      signal: AbortSignal.timeout(8_000),
    });
    
    let json = res.ok ? await res.json() : null;
    let features = json?.response?.result?.featureCollection?.features;

    if (!features || features.length === 0) {
      res = await fetch(buildUrl(fallbackLayer), {
        headers: { 'Referer': referer },
        signal: AbortSignal.timeout(8_000),
      });
      json = res.ok ? await res.json() : null;
      features = json?.response?.result?.featureCollection?.features;
    }

    if (!res.ok) {
      log.warn(`[vworld-wfs] Data API 오류 (${res.status})`);
      return null;
    }

    if (!features || features.length === 0) {
      log.warn(`[vworld-wfs] PNU ${pnu}에 해당하는 필지 없음`);
      return null;
    }

    // GeoJSON 좌표 추출 (Polygon 또는 MultiPolygon)
    const rings: Array<[number, number][]> = [];
    for (const feature of features) {
      const geom = feature.geometry;
      if (!geom) continue;
      if (geom.type === 'Polygon') {
        if (Array.isArray(geom.coordinates?.[0]) && geom.coordinates[0].length >= 3) {
          rings.push(geom.coordinates[0]);
        }
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates) {
          if (Array.isArray(poly?.[0]) && poly[0].length >= 3) {
            rings.push(poly[0]);
          }
        }
      }
    }
    log.info(`[vworld-wfs] ✅ PNU ${pnu} 폴리곤 취득 (${rings.length}개 링, ${rings.reduce((s, r) => s + r.length, 0)}개 정점)`);
    return rings.length > 0 ? rings : null;
  } catch (err) {
    log.warn({ err: err }, '[vworld-wfs] 필지 폴리곤 취득 실패:');
    return null;
  }
}

/**
 * G-08: 필지 폴리곤 좌표(WGS84)를 이미지 픽셀 좌표로 변환 후 SVG 오버레이 생성.
 * 반투명 골드 채움 + 진한 골드 테두리.
 */
function buildPolygonSvgOverlay(
  rings: Array<[number, number][]>,
  bboxEpsg3857: { minX: number; minY: number; maxX: number; maxY: number },
  imgW: number, imgH: number,
  markerLabel = '★ 본건',
): Buffer | null {
  try {
    log.info(`[vworld-wfs] SVG 오버레이 생성: ${rings.length}개 링, bbox=(${bboxEpsg3857.minX.toFixed(0)},${bboxEpsg3857.minY.toFixed(0)})-(${bboxEpsg3857.maxX.toFixed(0)},${bboxEpsg3857.maxY.toFixed(0)}), img=${imgW}×${imgH}, label=${markerLabel}`);
    const { minX, minY, maxX, maxY } = bboxEpsg3857;
    const polygonPaths: string[] = [];

    for (const ring of rings) {
      const points = ring.map(([lng, lat]) => {
        const { x, y } = toEpsg3857(lat, lng);
        const px = ((x - minX) / (maxX - minX)) * imgW;
        const py = ((maxY - y) / (maxY - minY)) * imgH; // y축 반전
        return `${px.toFixed(1)},${py.toFixed(1)}`;
      }).join(' ');

      // 1. 외곽 흰색 테두리 (가시성 확보용)
      polygonPaths.push(`<polygon points="${points}" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round" />`);
      // 2. 고대비 적색 테두리 + 반투명 적색 채우기
      polygonPaths.push(`<polygon points="${points}" fill="rgba(220, 38, 38, 0.22)" stroke="#DC2626" stroke-width="3.5" stroke-linejoin="round" />`);
    }

    // 3. 필지 중심 마커 — 폴리곤 링 정점들의 기하학적 중심(Centroid) 계산
    let sumPx = 0, sumPy = 0, ptCount = 0;
    for (const ring of rings) {
      for (const [lng, lat] of ring) {
        const { x, y } = toEpsg3857(lat, lng);
        const px = ((x - minX) / (maxX - minX)) * imgW;
        const py = ((maxY - y) / (maxY - minY)) * imgH;
        sumPx += px;
        sumPy += py;
        ptCount++;
      }
    }
    const cx = ptCount > 0 ? Number((sumPx / ptCount).toFixed(1)) : Number((imgW / 2).toFixed(1));
    const cy = ptCount > 0 ? Number((sumPy / ptCount).toFixed(1)) : Number((imgH / 2).toFixed(1));
    const tagW = Math.max(52, markerLabel.length * 9 + 16);
    polygonPaths.push(`
      <g>
        <circle cx="${cx}" cy="${cy - 8}" r="13" fill="#DC2626" stroke="#FFFFFF" stroke-width="2.5" />
        <text x="${cx}" y="${cy - 3}" font-size="12" font-weight="bold" fill="#FFFFFF" text-anchor="middle" font-family="sans-serif">★</text>
        <rect x="${cx - tagW / 2}" y="${cy + 8}" width="${tagW}" height="18" rx="4" fill="#DC2626" stroke="#FFFFFF" stroke-width="1" />
        <text x="${cx}" y="${cy + 21}" font-size="9.5" font-weight="bold" fill="#FFFFFF" text-anchor="middle" font-family="sans-serif">${markerLabel}</text>
      </g>
    `);

    const svg = `<svg width="${imgW}" height="${imgH}" viewBox="0 0 ${imgW} ${imgH}" xmlns="http://www.w3.org/2000/svg">${polygonPaths.join('')}</svg>`;
    return Buffer.from(svg);
  } catch (err) {
    log.warn({ err: err }, '[vworld-wfs] SVG 오버레이 생성 실패:');
    return null;
  }
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
 * V-World Base 타일(배경 지도)을 가져옵니다.
 * 지적도 WMS 결과(투명 PNG)를 이 배경 위에 합성하여 고품질 지적도를 만듭니다.
 */
async function fetchBaseMapTile(
  lat: number, lng: number,
  w: number, h: number, radiusM: number,
): Promise<Buffer | null> {
  const apiKey = getVWorldApiKey();
  if (!apiKey || !sharp) return null;
  if (!lat || !lng || isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)
      || lat < 33 || lat > 43 || lng < 124 || lng > 132) {
    return null;
  }

  try {
    // 줌 레벨 결정: radiusM ≤150 → z=17, ≤300 → z=16, else z=15
    const z = radiusM <= 150 ? 17 : radiusM <= 300 ? 16 : 15;
    const n = Math.pow(2, z);

    // 중심 타일 좌표
    const centerTileX = Math.floor(((lng + 180) / 360) * n);
    const latRad = lat * Math.PI / 180;
    const centerTileY = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);

    // 주변 9타일(3×3) 병렬로 가져오기 (HP-14)
    const TILE_SIZE = 256;
    const tileRequests: { dx: number; dy: number; tx: number; ty: number }[] = [];

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        tileRequests.push({
          dx,
          dy,
          tx: centerTileX + dx,
          ty: centerTileY + dy,
        });
      }
    }

    const tileResults = await Promise.all(
      tileRequests.map(async ({ dx, dy, tx, ty }) => {
        const url = `https://api.vworld.kr/req/wmts/1.0.0/${apiKey}/Base/${z}/${ty}/${tx}.png`;
        try {
          const res = await fetch(url, {
            headers: { 'Referer': getVWorldReferer() },
            signal: AbortSignal.timeout(6_000),
          });
          if (res.ok) {
            const ab = await res.arrayBuffer();
            return { x: dx + 1, y: dy + 1, buf: Buffer.from(ab) };
          }
        } catch { /* 개별 타일 실패 무시 */ }
        return null;
      })
    );

    const tiles: { x: number; y: number; buf: Buffer }[] = [];
    for (const t of tileResults) {
      if (t) tiles.push(t);
    }

    if (tiles.length === 0) return null;

    // 3×3 그리드로 합성 (768×768)
    const gridW = TILE_SIZE * 3;
    const gridH = TILE_SIZE * 3;
    const composites = tiles.map(t => ({
      input: t.buf,
      left: t.x * TILE_SIZE,
      top: t.y * TILE_SIZE,
    }));

    const grid = await sharp!({
      create: { width: gridW, height: gridH, channels: 4, background: { r: 248, g: 245, b: 235, alpha: 1 } },
    }).composite(composites).png().toBuffer();

    // 중심 타일 기준 좌표에서 대상 bbox 영역 크롭
    // 중심 타일의 왼쪽 상단 = grid[256,256]
    // 중심 좌표의 타일 내 오프셋 계산
    const tileXFrac = ((lng + 180) / 360) * n - centerTileX;
    const tileYFrac = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n - centerTileY;
    const centerPxX = TILE_SIZE + tileXFrac * TILE_SIZE;
    const centerPxY = TILE_SIZE + tileYFrac * TILE_SIZE;

    // radiusM → 픽셀 변환 (1 타일 = 지구둘레/2^z * cos(lat) 미터)
    const metersPerPx = (40075016.686 * Math.cos(latRad)) / (n * TILE_SIZE);
    const radiusPx = radiusM / metersPerPx;

    // 크롭 영역 (w/h 비율 유지)
    const cropW = Math.round(radiusPx * 2 * (w / Math.min(w, h)));
    const cropH = Math.round(radiusPx * 2 * (h / Math.min(w, h)));
    const cropL = Math.max(0, Math.round(centerPxX - cropW / 2));
    const cropT = Math.max(0, Math.round(centerPxY - cropH / 2));

    const result = await sharp!(grid)
      .extract({ left: cropL, top: cropT, width: Math.min(cropW, gridW - cropL), height: Math.min(cropH, gridH - cropT) })
      .resize({ width: w, height: h, fit: 'fill' })
      .png()
      .toBuffer() as Buffer;

    log.info(`[vworld-wms] ✅ WMTS Base 타일 합성 완료 (${tiles.length}타일, ${result.length} bytes)`);
    return result;
  } catch (err) {
    log.warn({ err: err }, '[vworld-wms] WMTS Base tile fetch failed:');
    return null;
  }
}

/**
 * V-World WMS GetMap으로 지적도 이미지를 취득합니다.
 * D45: 배경 타일 위에 지적도 선화를 합성하여 고품질 결과를 생성합니다.
 *
 * @param lat - 건물 위도 (WGS84)
 * @param lng - 건물 경도 (WGS84)
 * @param w - 이미지 너비 (px), 기본 800
 * @param h - 이미지 높이 (px), 기본 600
 * @param radiusM - 중심으로부터 표시 범위 (미터), 기본 150
 * @param targetPnu - G-08: 하이라이트할 대상 필지 PNU (19자리). 생략 시 하이라이트 없음.
 * @param additionalPnus - 다필지 매물의 추가 PNU 목록 (선택)
 */
export async function fetchCadastralMapImage(
  lat: number,
  lng: number,
  w = 800,
  h = 600,
  radiusM = 150,
  targetPnu?: string,
  additionalPnus?: string[],
): Promise<CadastralMapResult | null> {
  const apiKey = getVWorldApiKey();
  if (!apiKey) {
    log.warn('[vworld-wms] VWORLD_API_KEY 미설정 — 지적도 생략');
    return null;
  }
  if (!lat || !lng || isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)
      || lat < 33 || lat > 43 || lng < 124 || lng > 132) {
    log.warn({ latlng: { lat, lng } }, '[vworld-wms] Invalid coordinates, skipping cadastral map:');
    return null;
  }

  try {
    const allPnus = [targetPnu, ...(additionalPnus || [])].filter((p): p is string => Boolean(p && p.trim()));
    // 다필지 매물일 경우 인접 필지가 프레임 내에 모두 노출되도록 반경 자동 보정
    const effectiveRadiusM = allPnus.length > 1 ? Math.max(radiusM, 280) : radiusM;

    // ── WGS84 → EPSG:3857 변환 ──
    const center = toEpsg3857(lat, lng);

    // effectiveRadiusM → 3857 단위 근사 (한국 위도 33~38°에서 충분히 정밀)
    const cosLat = Math.cos(lat * Math.PI / 180);
    const meterToUnit = 1 / cosLat;
    const aspect = w / h;  // image aspect ratio (e.g., 4:3)
    const dy = effectiveRadiusM * meterToUnit;
    const dx = dy * aspect;  // scale X by aspect ratio to match image dimensions

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
      lng - effectiveRadiusM / mPerDegLng,
      lat - effectiveRadiusM / mPerDegLat,
      lng + effectiveRadiusM / mPerDegLng,
      lat + effectiveRadiusM / mPerDegLat,
    ];

    // ── WMS GetMap 요청 (지적도 투명 PNG) ──
    const params = new URLSearchParams({
      SERVICE: 'WMS',
      REQUEST: 'GetMap',
      VERSION: '1.3.0',
      LAYERS: 'lp_pa_cbnd_bonbun,lp_pa_cbnd_bubun',
      STYLES: ',',  // 기본 스타일 = 필지별 색상 채움 + 경계선 (D45: _line은 선화만)
      CRS: 'EPSG:3857',
      BBOX: bbox,
      WIDTH: String(w),
      HEIGHT: String(h),
      FORMAT: 'image/png',
      TRANSPARENT: 'TRUE',
      KEY: apiKey,
      DOMAIN: getVWorldDomain(),
    });

    const url = `https://api.vworld.kr/req/wms?${params.toString()}`;
    const referer = getVWorldReferer();

    const res = await fetch(url, {
      headers: { 'Referer': referer },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      log.warn({ text: text.slice(0, 200) }, `[vworld-wms] WMS 응답 오류 (${res.status}):`);
      return null;
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('image')) {
      const text = await res.text().catch(() => '');
      log.warn({ text: text.slice(0, 300) }, '[vworld-wms] WMS 에러 응답:');
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const cadastralBuffer = Buffer.from(arrayBuffer);

    // ── D45: 배경 Base 타일 합성 ──
    let finalBuffer: any = cadastralBuffer;

    // G-08: EPSG:3857 bbox 객체 (폴리곤 오버레이용)
    const bboxEpsg3857 = {
      minX: center.x - dx,
      minY: center.y - dy,
      maxX: center.x + dx,
      maxY: center.y + dy,
    };

    if (sharp) {
      // 배경 타일 가져오기 (실패 시 연한 크림색 폴백)
      const baseTile = await fetchBaseMapTile(lat, lng, w, h, effectiveRadiusM);

      // 합성 레이어: 지적도 WMS + (선택) 필지 폴리곤 하이라이트
      const compositeLayers: Array<{ input: Buffer; blend: string }> = [
        { input: cadastralBuffer, blend: 'over' },
      ];

      // G-08: 대상 필지 폴리곤 하이라이트 오버레이 (다필지 지원)
      if (allPnus.length > 0) {
        const allRings: Array<[number, number][]> = [];
        const results = await Promise.allSettled(
          allPnus.map(pnu => fetchParcelPolygon(pnu, apiKey))
        );
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const pnu = allPnus[i];
          if (result.status === 'fulfilled' && result.value && result.value.length > 0) {
            allRings.push(...result.value);
            log.info(`[vworld-wfs] ✅ PNU ${pnu} 필지 폴리곤 취득 (${result.value.length}개 링)`);
          } else {
            log.warn(`[vworld-wfs] PNU ${pnu} 필지 폴리곤 조회 결과 없음`);
          }
        }
        if (allRings.length > 0) {
          const isMulti = allPnus.length > 1;
          const markerLabel = isMulti ? `★ 본건 (${allPnus.length}필지)` : '★ 본건';
          const svgBuf = buildPolygonSvgOverlay(allRings, bboxEpsg3857, w, h, markerLabel);
          if (svgBuf) {
            compositeLayers.push({ input: svgBuf, blend: 'over' });
            log.info(`[vworld-wfs] ✅ 총 ${allRings.length}개 필지 링 오버레이 추가 (${markerLabel})`);
          }
        }
      }

      if (baseTile) {
        // Base 타일 위에 투명 지적도 + 폴리곤 합성
        finalBuffer = await sharp(baseTile)
          .resize({ width: w, height: h, fit: 'fill' })
          .composite(compositeLayers as any)
          .png()
          .toBuffer() as unknown as Buffer;
        log.info(`[vworld-wms] ✅ 지적도 + Base 배경 합성 완료 (${finalBuffer.length} bytes, ${w}×${h})`);
      } else {
        // 배경 없으면 연한 크림색 배경 합성
        const bgBuffer = await sharp({
          create: { width: w, height: h, channels: 4, background: { r: 248, g: 245, b: 235, alpha: 1 } },
        }).png().toBuffer();

        finalBuffer = await sharp(bgBuffer)
          .composite(compositeLayers as any)
          .png()
          .toBuffer() as unknown as Buffer;
        log.info(`[vworld-wms] ✅ 지적도 + 크림 배경 합성 (${finalBuffer.length} bytes, ${w}×${h})`);
      }
    } else {
      log.info(`[vworld-wms] ✅ 지적도 이미지 취득 성공 (sharp 미사용, ${cadastralBuffer.length} bytes, ${w}×${h})`);
    }

    return {
      buffer: finalBuffer,
      base64: `image/png;base64,${finalBuffer.toString('base64')}`,
      width: w,
      height: h,
      bbox: bboxWgs84,
      _source: 'vworld_wms',
    };
  } catch (err) {
    log.warn({ err: err }, '[vworld-wms] 지적도 이미지 취득 실패:');
    return null;
  }
}

