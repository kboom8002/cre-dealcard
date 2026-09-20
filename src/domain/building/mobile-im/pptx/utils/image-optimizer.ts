/**
 * 이미지 최적화 및 정적 지도 유틸리티
 * sharp 기반 리사이즈/압축 → Buffer 반환 (Base64 대비 33% 용량 절감)
 * Vercel Pro (3GB 메모리) 환경 최적화
 */
import sharp from 'sharp';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('image-optimizer');


export interface OptimizedImage {
  /** Buffer 직접 전달용 (PPTX 삽입 시 data: Buffer 사용) */
  buffer: Buffer;
  /** 하위 호환 — base64 문자열 */
  base64: string;
  width: number;
  height: number;
  sizeBytes: number;
  // D31 M-1: DPI 메타데이터
  /** 리사이즈 전 원본 폭 (px) */
  originalWidth: number;
  /** 리사이즈 전 원본 높이 (px) */
  originalHeight: number;
  /** 원본 비율 (width / height) */
  aspectRatio: number;
}

const MAX_INTAKE_BYTES = 10 * 1024 * 1024; // 10MB intake guard against serverless OOM

/**
 * URL에서 이미지를 가져와 PPTX 삽입용으로 최적화
 * - 최대 1280px 리사이즈 (SOTA: 슬라이드 가로폭 이상으로 커지지 않도록)
 * - JPEG 75% 품질 (mozjpeg)
 * - WebP → JPEG 강제 변환
 */
export async function optimizeImageForPptx(
  imageUrl: string,
  maxWidth = 1800, // D29 M-11: 실효 dpi 180 기반 (10" × 180dpi)
  quality = 75
): Promise<OptimizedImage | null> {
  try {
    let inputBuffer: Buffer;

    if (imageUrl.startsWith('data:')) {
      const base64Data = imageUrl.split(',')[1];
      if (base64Data && base64Data.length * 0.75 > MAX_INTAKE_BYTES) {
        log.warn('[optimizeImageForPptx] Data URL exceeds 10MB guard, aborting to prevent OOM');
        return null;
      }
      inputBuffer = Buffer.from(base64Data, 'base64');
    } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const response = await fetch(imageUrl, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return null;

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_INTAKE_BYTES) {
        log.warn(`[optimizeImageForPptx] Content-Length (${contentLength} bytes) exceeds 10MB limit: ${imageUrl}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      inputBuffer = Buffer.from(arrayBuffer);
    } else {
      // 로컬 파일 경로 처리 (e.g. Windows absolute C:/..., relative, or /public/...)
      const fs = await import('fs');
      const path = await import('path');
      let localPath = imageUrl;
      if (fs.existsSync(localPath)) {
        inputBuffer = fs.readFileSync(localPath);
      } else if (imageUrl.startsWith('/')) {
        localPath = path.join(process.cwd(), 'public', imageUrl);
        if (fs.existsSync(localPath)) {
          inputBuffer = fs.readFileSync(localPath);
        }
      }
      if (!inputBuffer!) {
        localPath = path.resolve(process.cwd(), imageUrl);
        if (fs.existsSync(localPath)) {
          inputBuffer = fs.readFileSync(localPath);
        } else {
          log.warn(`[optimizeImageForPptx] Local image file not found: ${imageUrl}`);
          return null;
        }
      }
    }

    if (inputBuffer.length > MAX_INTAKE_BYTES) {
      log.warn(`[optimizeImageForPptx] Buffer size (${inputBuffer.length} bytes) exceeds 10MB limit: ${imageUrl}`);
      return null;
    }

    const metadata = await sharp(inputBuffer).metadata();
    const originalWidth = metadata.width || 1280;
    const originalHeight = metadata.height || 960;

    const resizedBuffer = await sharp(inputBuffer)
      .resize({
        width: Math.min(originalWidth, maxWidth),
        withoutEnlargement: true,
      })
      .jpeg({
        quality,
        progressive: true,
        mozjpeg: true,
      })
      .toBuffer();

    const resizedMeta = await sharp(resizedBuffer).metadata();

    return {
      buffer: resizedBuffer,
      base64: `image/jpeg;base64,${resizedBuffer.toString('base64')}`,
      width: resizedMeta.width || originalWidth,
      height: resizedMeta.height || originalHeight,
      sizeBytes: resizedBuffer.length,
      // D31 M-1: DPI 메타데이터
      originalWidth,
      originalHeight,
      aspectRatio: originalWidth / originalHeight,
    };
  } catch (err) {
    log.warn('[optimizeImageForPptx] Failed:', imageUrl, err);
    return null;
  }
}

/**
 * 여러 이미지를 병렬로 최적화 (최대 8장 — Pro 갤러리 슬라이드 대응)
 * 서버리스 OOM 방지를 위해 동시 Sharp 디코딩 수를 최대 4개로 스로틀링합니다.
 */
export async function optimizeImagesForPptx(
  urls: string[],
  maxCount = 8,
  maxWidth = 1800, // D29 M-11: 실효 dpi 180 기반 (10" × 180dpi)
  quality = 75
): Promise<OptimizedImage[]> {
  const targets = urls.slice(0, maxCount);
  const CONCURRENCY_LIMIT = 4;
  const results: PromiseSettledResult<OptimizedImage | null>[] = [];

  for (let i = 0; i < targets.length; i += CONCURRENCY_LIMIT) {
    const chunk = targets.slice(i, i + CONCURRENCY_LIMIT);
    const chunkResults = await Promise.allSettled(
      chunk.map(url => optimizeImageForPptx(url, maxWidth, quality))
    );
    results.push(...chunkResults);
  }

  return results
    .filter((r): r is PromiseFulfilledResult<OptimizedImage | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((img): img is OptimizedImage => img !== null);
}

/**
 * POI 스폿 마커 정보 (지도 오버레이용)
 */
export interface MapPoiSpot {
  name: string;
  lat: number;
  lng: number;
  category: 'subway' | 'landmark' | 'hospital' | 'university' | 'shopping' | 'public';
  distanceM?: number;
}

/** 카테고리별 마커 색상 */
function poiMarkerColor(category: MapPoiSpot['category']): string {
  switch (category) {
    case 'subway': return '#3B82F6';     // blue
    case 'hospital': return '#EF4444';   // red
    case 'university': return '#22C55E'; // green
    case 'shopping': return '#A855F7';   // purple
    case 'public': return '#F59E0B';     // amber
    default: return '#6B7280';           // gray
  }
}

/** 카테고리별 이모지/라벨 */
function poiMarkerEmoji(category: MapPoiSpot['category']): string {
  switch (category) {
    case 'subway': return '🚇';
    case 'hospital': return '🏥';
    case 'university': return '🏫';
    case 'shopping': return '🛒';
    default: return '📍';
  }
}

/**
 * 위경도를 이미지 픽셀 좌표로 변환 (Kakao Static Map level 기반)
 * Kakao Level 4 ≈ 2.0 m/px, Level 6 ≈ 8.0 m/px
 */
function latlngToPixel(
  lat: number, lng: number,
  centerLat: number, centerLng: number,
  metersPerPx: number, imgW: number, imgH: number
): { px: number; py: number } {
  const dxMeters = (lng - centerLng) * 111320 * Math.cos(centerLat * Math.PI / 180);
  const dyMeters = (lat - centerLat) * 111320;
  const px = Math.round(imgW / 2 + dxMeters / metersPerPx);
  const py = Math.round(imgH / 2 - dyMeters / metersPerPx);
  return { px, py };
}

/**
 * POI 마커 SVG들을 생성하여 Sharp composite 오버레이 배열로 반환
 * 각 랜드마크에 카테고리 심볼 + 이름 라벨 배지 추가
 */
function buildPoiOverlays(
  poiSpots: MapPoiSpot[],
  centerLat: number, centerLng: number,
  metersPerPx: number, imgW: number, imgH: number
): Array<{ input: Buffer; left: number; top: number }> {
  const overlays: Array<{ input: Buffer; left: number; top: number }> = [];
  
  const occupiedBoxes: Array<[number, number, number, number]> = [
    // Reserve space for center building pin
    [Math.floor(imgW / 2 - 45), Math.floor(imgH / 2 - 75), Math.floor(imgW / 2 + 45), Math.floor(imgH / 2 + 15)]
  ];

  function boxesOverlap(a: [number,number,number,number], b: [number,number,number,number]): boolean {
    return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  }

  for (const spot of poiSpots) {
    const { px, py } = latlngToPixel(spot.lat, spot.lng, centerLat, centerLng, metersPerPx, imgW, imgH);
    
    // 이미지 범위 밖이면 스킵
    if (px < 10 || px > imgW - 60 || py < 10 || py > imgH - 40) continue;
    
    const color = poiMarkerColor(spot.category);
    const cleanName = (spot.name || '').replace(/\s*역$/, '역').slice(0, 16);
    const textWidth = Math.max(50, cleanName.length * 13 + 18);
    const badgeH = 32;
    const totalW = textWidth + 42;
    const totalH = 44;

    // POI 마커 SVG (원형 카테고리 심볼 + 이름 라벨 필)
    const poiSvg = Buffer.from(`
      <svg width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" xmlns="http://www.w3.org/2000/svg">
        <filter id="shadow_${spot.category}" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.35"/>
        </filter>
        <!-- 배경 라벨 필 -->
        <g filter="url(#shadow_${spot.category})">
          <rect x="26" y="5" width="${textWidth}" height="${badgeH}" rx="5" fill="#132A3A" opacity="0.92" stroke="#FFFFFF" stroke-width="1.2"/>
          <text x="${26 + textWidth / 2}" y="22" font-size="13" font-weight="bold" fill="#FFFFFF" text-anchor="middle" font-family="sans-serif">${cleanName}</text>
        </g>
        <!-- 원형 카테고리 심볼 마커 -->
        <g filter="url(#shadow_${spot.category})">
          <circle cx="16" cy="18" r="16" fill="${color}" stroke="#FFFFFF" stroke-width="2.5"/>
          <circle cx="16" cy="18" r="5" fill="#FFFFFF"/>
        </g>
      </svg>
    `);
    
    const left = Math.max(0, Math.min(px - 16, imgW - totalW));
    const top = Math.max(0, Math.min(py - 18, imgH - totalH));

    const poiBox: [number,number,number,number] = [left, top, left + totalW, top + totalH];
    if (occupiedBoxes.some(ob => boxesOverlap(ob, poiBox))) continue;
    occupiedBoxes.push(poiBox);

    overlays.push({
      input: poiSvg,
      left,
      top,
    });
  }
  
  return overlays;
}

/**
 * 건물 위치 기반 정적 지도 생성
 * 1차: coordinates가 있는 경우 카카오 Static Map API + POI 오버레이 (level 4)
 * 2차: 좌표가 없는 경우 dark SVG 플레이스홀더 (폰트 미의존)
 * @param poiSpots - 지도에 표시할 주요 스폿 (역, 상권 등) 최대 5개
 */
export async function generateStaticMapPlaceholder(
  addressOrArea: string,
  w = 800,
  h = 500,
  coordinates?: { lat: number; lng: number } | null,
  poiSpots?: MapPoiSpot[] | null
): Promise<OptimizedImage> {
  const safePoiSpots = (poiSpots || []).slice(0, 5);
  
  // ── 0차: 카카오 Static Map API (최우선) ──
  const coordLat = coordinates ? Number(coordinates.lat) : NaN;
  const coordLng = coordinates ? Number(coordinates.lng) : NaN;
  const hasValidCoords = !isNaN(coordLat) && !isNaN(coordLng) && coordLat !== 0 && coordLng !== 0;

  if (hasValidCoords) {
    try {
      const apiKey = process.env.KAKAO_REST_API_KEY;
      if (apiKey) {
        const baseUrl = 'https://spi.maps.daum.net/mapscms/map/staticmap.png';
        
        // F6: 물건 반경에 따른 동적 줌 레벨 결정 (기본 level 3 = ~1.0 m/px, 약 250m 반경 상세 뷰)
        let kakaoLevel = '3'; // default: ~1.0 m/px, ~250m radius (상세 도로/필지/본건 식별 최적화)
        if (safePoiSpots.length > 0) {
          const maxDist = Math.max(...safePoiSpots.map(s => s.distanceM ?? 500));
          if (maxDist > 2000) kakaoLevel = '6';      // ~8 m/px, ~2km radius
          else if (maxDist > 1000) kakaoLevel = '5';  // ~4 m/px, ~1km radius
          else if (maxDist > 500) kakaoLevel = '4';   // ~2 m/px, ~500m radius
          // else keep level 3 for tight local cluster
        }
        
        const params = new URLSearchParams({
          apikey: apiKey,
          center: `${coordLng},${coordLat}`,
          level: kakaoLevel, // level 3 (약 250m 반경) — 본건 및 인접 주요 도로명/필지 선명 노출
          w: String(Math.min(w, 1800)),
          h: String(Math.min(h, 960)),
        });
        const kakaoUrl = `${baseUrl}?${params.toString()}`;
        const response = await fetch(kakaoUrl, {
          signal: AbortSignal.timeout(6000),
        });
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const inputBuffer = Buffer.from(arrayBuffer);
          
          // 카카오 지도 위에 POI 마커 + 건물 골드 핀 오버레이 (Sharp composite)
          const kakaoW = Math.min(w, 1800);
          const kakaoH = Math.min(h, 960);
          let resized = sharp(inputBuffer).resize({ width: kakaoW, height: kakaoH, fit: 'cover' });

          const overlays: Array<{ input: Buffer; left: number; top: number }> = [];

          const kakaoMeterPerPxMap: Record<string, number> = { '3': 1.0, '4': 2.0, '5': 4.0, '6': 8.0, '7': 16.0 };

          // 1. 도보 5분 반경 원 (약 400m 도보권역)
          const walkRadiusMeters = 400; // 도보 5분 (80m/분 × 5분)
          const rawWalkRadiusPx = Math.round(walkRadiusMeters / (kakaoMeterPerPxMap[kakaoLevel] ?? 1.0));
          // B10 Fix: 반경이 캔버스를 초과하지 않도록 클램핑 (라벨 + 여백 30px 확보)
          const walkRadiusPx = Math.min(rawWalkRadiusPx, Math.floor(kakaoH / 2 - 30));
          const circleSvg = Buffer.from(`
            <svg width="${kakaoW}" height="${kakaoH}" viewBox="0 0 ${kakaoW} ${kakaoH}" xmlns="http://www.w3.org/2000/svg">
              <circle cx="${kakaoW / 2}" cy="${kakaoH / 2}" r="${walkRadiusPx}" fill="rgba(184, 134, 11, 0.07)" stroke="#B8860B" stroke-width="1.8" stroke-dasharray="8,5"/>
              <rect x="${kakaoW / 2 - 40}" y="${kakaoH / 2 - walkRadiusPx - 1}" width="80" height="20" rx="4" fill="#B8860B" opacity="0.9"/>
              <text x="${kakaoW / 2}" y="${kakaoH / 2 - walkRadiusPx + 13}" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle" font-family="sans-serif">도보 5분 권역</text>
            </svg>
          `);
          overlays.push({
            input: circleSvg,
            left: 0,
            top: 0,
          });

          // 2. POI 랜드마크 마커 오버레이
          if (safePoiSpots.length > 0) {
            const kakaoMeterPerPxForPoi = kakaoMeterPerPxMap[kakaoLevel] ?? 1.0;
            const poiOverlays = buildPoiOverlays(safePoiSpots, coordLat, coordLng, kakaoMeterPerPxForPoi, kakaoW, kakaoH);
            overlays.push(...poiOverlays);
          }

          // 3. 본건 위치 골드 핀 SVG 오버레이 (80×85 고대비 후광 핀)
          const goldPinSvg = Buffer.from(`
            <svg width="80" height="85" viewBox="0 0 80 85" xmlns="http://www.w3.org/2000/svg">
              <filter id="goldhalo" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="1" stdDeviation="3.5" flood-color="#FFFFFF" flood-opacity="0.9"/>
                <feDropShadow dx="1" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.5"/>
              </filter>
              <g filter="url(#goldhalo)">
                <path d="M40 6 C27 6 16 17 16 30 C16 48 40 72 40 72 C40 72 64 48 64 30 C64 17 53 6 40 6 Z" fill="#B8860B" stroke="#FFFFFF" stroke-width="3"/>
                <circle cx="40" cy="30" r="12" fill="#132A3A"/>
                <text x="40" y="35" font-size="14" font-weight="bold" fill="#FFFFFF" text-anchor="middle" font-family="sans-serif">★</text>
                <rect x="8" y="65" width="64" height="18" rx="4" fill="#132A3A" opacity="0.96" stroke="#FFFFFF" stroke-width="1"/>
                <text x="40" y="78" font-size="10.5" font-weight="bold" fill="#FFFFFF" text-anchor="middle" font-family="sans-serif">본건 위치</text>
              </g>
            </svg>
          `);
          overlays.push({
            input: goldPinSvg,
            left: Math.floor(kakaoW / 2 - 40),
            top: Math.floor(kakaoH / 2 - 72),
          });

          if (overlays.length > 0) {
            resized = sharp(await resized.png().toBuffer()).composite(overlays);
          }
          
          const resizedBuffer = await resized.jpeg({ quality: 85 }).toBuffer();
          return {
            buffer: resizedBuffer,
            base64: `image/jpeg;base64,${resizedBuffer.toString('base64')}`,
            width: w,
            height: h,
            sizeBytes: resizedBuffer.length,
            originalWidth: w,
            originalHeight: h,
            aspectRatio: w / h,
          };
        }
      }
    } catch (err) {
      log.warn('[generateStaticMapPlaceholder] Kakao map failed, falling back to OSM:', err);
    }
  }

  // ── 1차: OpenStreetMap 정적 타일 3x3 합성 ──
  if (hasValidCoords) {
    try {
      // 줌 15 (약 500m 반경): 주변 간선도로(양평로, 노들로) 및 역세권 지형 맥락 최적 노출
      const zoom = 15;
      const lat = coordLat;
      const lng = coordLng;
      const tileX = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
      const tileY = Math.floor(
        ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * Math.pow(2, zoom)
      );

      const tileSize = 256;
      const tileBuffers: Array<{ buf: Buffer; dx: number; dy: number }> = [];

      const fetchPromises: Promise<void>[] = [];
      for (const dy of [-1, 0, 1]) {
        for (const dx of [-1, 0, 1]) {
          const url = `https://tile.openstreetmap.org/${zoom}/${tileX + dx}/${tileY + dy}.png`;
          fetchPromises.push(
            fetch(url, {
              signal: AbortSignal.timeout(4000),
              headers: { 'User-Agent': 'CREDEAL-IM/1.0' }
            })
              .then(async (res) => {
                if (res.ok) {
                  const arr = await res.arrayBuffer();
                  tileBuffers.push({ buf: Buffer.from(arr), dx, dy });
                }
              })
              .catch(() => {})
          );
        }
      }

      await Promise.all(fetchPromises);

      if (tileBuffers.length >= 4) {
        const compositeWidth = tileSize * 3;
        const compositeHeight = tileSize * 3;

        const tileOverlays = tileBuffers.map(({ buf, dx, dy }) => ({
          input: buf,
          left: (dx + 1) * tileSize,
          top: (dy + 1) * tileSize,
        }));

        const combinedBuffer = await sharp({
          create: {
            width: compositeWidth,
            height: compositeHeight,
            channels: 4,
            background: { r: 30, g: 41, b: 59, alpha: 1 },
          },
        })
          .composite(tileOverlays)
          .png()
          .toBuffer();

        // 건물 골드 핀 마커 SVG (80×85 고대비 백색 후광 + "본건 위치" 배지)
        const pinSvg = Buffer.from(`
          <svg width="80" height="85" viewBox="0 0 80 85" xmlns="http://www.w3.org/2000/svg">
            <filter id="osmhalo" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="1" stdDeviation="3.5" flood-color="#FFFFFF" flood-opacity="0.95"/>
              <feDropShadow dx="1" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.55"/>
            </filter>
            <g filter="url(#osmhalo)">
              <path d="M40 6 C27 6 16 17 16 30 C16 48 40 72 40 72 C40 72 64 48 64 30 C64 17 53 6 40 6 Z" fill="#B8860B" stroke="#FFFFFF" stroke-width="3"/>
              <circle cx="40" cy="30" r="12" fill="#132A3A"/>
              <text x="40" y="35" font-size="14" font-weight="bold" fill="#FFFFFF" text-anchor="middle" font-family="sans-serif">★</text>
              <rect x="8" y="65" width="64" height="18" rx="4" fill="#132A3A" opacity="0.96" stroke="#FFFFFF" stroke-width="1"/>
              <text x="40" y="78" font-size="10.5" font-weight="bold" fill="#FFFFFF" text-anchor="middle" font-family="sans-serif">본건 위치</text>
            </g>
          </svg>
        `);

        // POI 마커 오버레이 (zoom 15의 실제 픽셀당 미터 해상도 계산)
        const osmMeterPerPx = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
        const poiOverlays = buildPoiOverlays(safePoiSpots, lat, lng, osmMeterPerPx, compositeWidth, compositeHeight);

        const targetW = Math.max(w, 1120);
        const targetH = Math.max(h, 900);
        
        // OSM 폴백: 종횡비 보정 후 리사이즈
        const targetAspect = targetW / targetH; // e.g., 1120/900 = 1.244
        const compositeSize = 768; // 3 tiles × 256px
        let cropW: number, cropH: number;
        if (targetAspect >= 1) {
          cropW = compositeSize;
          cropH = Math.round(compositeSize / targetAspect);
        } else {
          cropH = compositeSize;
          cropW = Math.round(compositeSize * targetAspect);
        }
        const cropL = Math.round((compositeSize - cropW) / 2);
        const cropT = Math.round((compositeSize - cropH) / 2);

        // Stage 1: Composite overlays on full-size canvas
        const compositedBuffer = await sharp(combinedBuffer)
          .composite([
            ...poiOverlays,
            {
              input: pinSvg,
              left: Math.floor(compositeWidth / 2 - 40),
              top: Math.floor(compositeHeight / 2 - 72),
            },
          ])
          .png()
          .toBuffer();

        // Stage 2: Crop and resize the composited image
        const finalMapBuffer = await sharp(compositedBuffer)
          .extract({ left: cropL, top: cropT, width: cropW, height: cropH })
          .resize({ width: targetW, height: targetH })
          .jpeg({ quality: 85 })
          .toBuffer();


        return {
          buffer: finalMapBuffer,
          base64: `image/jpeg;base64,${finalMapBuffer.toString('base64')}`,
          width: targetW,
          height: targetH,
          sizeBytes: finalMapBuffer.length,
          originalWidth: targetW,
          originalHeight: targetH,
          aspectRatio: targetW / targetH,
        };
      }
    } catch (err) {
      log.warn('[generateStaticMapPlaceholder] OSM tile compositing failed, falling back to SVG:', err);
    }
  }

  // ── 2차: SVG 플레이스홀더 (한글 텍스트 없이 핀 및 그래픽 라인만 표시) ──
  const svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="mapBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e293b"/>
        <stop offset="100%" stop-color="#10161F"/>
      </linearGradient>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#27333F" stroke-width="1" opacity="0.4"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#mapBg)"/>
    <rect width="100%" height="100%" fill="url(#grid)"/>
    
    <path d="M 0 180 Q 300 220 ${w} 120" stroke="#2E3A4A" stroke-width="16" fill="none" opacity="0.6"/>
    <path d="M 250 0 Q 320 250 400 ${h}" stroke="#2E3A4A" stroke-width="12" fill="none" opacity="0.6"/>
    <path d="M 0 180 Q 300 220 ${w} 120" stroke="#B98A2E" stroke-width="3" fill="none" stroke-dasharray="8 6" opacity="0.7"/>
    
    <circle cx="${w / 2}" cy="${h / 2}" r="32" fill="#B98A2E" opacity="0.25"/>
    <circle cx="${w / 2}" cy="${h / 2}" r="16" fill="#B98A2E"/>
    <circle cx="${w / 2}" cy="${h / 2}" r="6" fill="#10161F"/>
  </svg>`;

  const buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
  return {
    buffer,
    base64: `image/jpeg;base64,${buffer.toString('base64')}`,
    width: w,
    height: h,
    sizeBytes: buffer.length,
    originalWidth: w,
    originalHeight: h,
    aspectRatio: w / h,
  };
}

/**
 * 이미 생성된 카카오 지도 URL에서 이미지를 가져와 PPTX용으로 최적화
 */
export async function fetchKakaoMapImage(
  mapUrl: string,
  w = 560,
  h = 450,
): Promise<OptimizedImage | null> {
  try {
    const referer = process.env.VWORLD_REFERER
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || process.env.NEXT_PUBLIC_SITE_URL
      || 'https://cre-dealcard.vercel.app';
    const response = await fetch(mapUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { Referer: referer },
    });
    if (!response.ok) {
      log.warn(`[kakao-map] fetch failed: ${response.status} ${response.statusText}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = await sharp(Buffer.from(arrayBuffer))
      .resize({ width: w, height: h, fit: 'cover' })
      .jpeg({ quality: 85 })
      .toBuffer();
    return {
      buffer,
      base64: `image/jpeg;base64,${buffer.toString('base64')}`,
      width: w,
      height: h,
      sizeBytes: buffer.length,
      originalWidth: w,
      originalHeight: h,
      aspectRatio: w / h,
    };
  } catch (err) {
    log.warn('[fetchKakaoMapImage] Failed:', mapUrl, err);
    return null;
  }
}
