/**
 * 이미지 최적화 및 정적 지도 유틸리티
 * sharp 기반 리사이즈/압축 → Buffer 반환 (Base64 대비 33% 용량 절감)
 * Vercel Pro (3GB 메모리) 환경 최적화
 */
import sharp from 'sharp';

export interface OptimizedImage {
  /** Buffer 직접 전달용 (PPTX 삽입 시 data: Buffer 사용) */
  buffer: Buffer;
  /** 하위 호환 — base64 문자열 */
  base64: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * URL에서 이미지를 가져와 PPTX 삽입용으로 최적화
 * - 최대 1280px 리사이즈 (SOTA: 슬라이드 가로폭 이상으로 커지지 않도록)
 * - JPEG 75% 품질 (mozjpeg)
 * - WebP → JPEG 강제 변환
 */
export async function optimizeImageForPptx(
  imageUrl: string,
  maxWidth = 1280,
  quality = 75
): Promise<OptimizedImage | null> {
  try {
    let inputBuffer: Buffer;

    if (imageUrl.startsWith('data:')) {
      const base64Data = imageUrl.split(',')[1];
      inputBuffer = Buffer.from(base64Data, 'base64');
    } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const response = await fetch(imageUrl, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      inputBuffer = Buffer.from(arrayBuffer);
    } else {
      // 로컬 파일 경로 처리 (e.g. /test-images/... or relative or absolute)
      const fs = await import('fs');
      const path = await import('path');
      let localPath = imageUrl;
      if (imageUrl.startsWith('/')) {
        localPath = path.join(process.cwd(), 'public', imageUrl);
      }
      if (!fs.existsSync(localPath)) {
        localPath = path.resolve(process.cwd(), imageUrl);
      }
      if (fs.existsSync(localPath)) {
        inputBuffer = fs.readFileSync(localPath);
      } else {
        return null;
      }
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
    };
  } catch (err) {
    console.warn('[optimizeImageForPptx] Failed:', imageUrl, err);
    return null;
  }
}

/**
 * 여러 이미지를 병렬로 최적화 (최대 8장 — Pro 갤러리 슬라이드 대응)
 */
export async function optimizeImagesForPptx(
  urls: string[],
  maxCount = 8,
  maxWidth = 1280,
  quality = 75
): Promise<OptimizedImage[]> {
  const targets = urls.slice(0, maxCount);
  const results = await Promise.allSettled(
    targets.map(url => optimizeImageForPptx(url, maxWidth, quality))
  );

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
  category: 'subway' | 'landmark' | 'hospital' | 'university' | 'shopping';
}

/** 카테고리별 마커 색상 */
function poiMarkerColor(category: MapPoiSpot['category']): string {
  switch (category) {
    case 'subway': return '#3B82F6';     // blue
    case 'hospital': return '#EF4444';   // red
    case 'university': return '#22C55E'; // green
    case 'shopping': return '#A855F7';   // purple
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
 * 위경도를 이미지 픽셀 좌표로 변환 (Mercator projection)
 */
function latlngToPixel(
  lat: number, lng: number,
  centerLat: number, centerLng: number,
  zoom: number, imgW: number, imgH: number
): { px: number; py: number } {
  const scale = Math.pow(2, zoom) * 256;
  const worldX = ((lng + 180) / 360) * scale;
  const worldY = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * scale;
  const centerWorldX = ((centerLng + 180) / 360) * scale;
  const centerWorldY = ((1 - Math.log(Math.tan((centerLat * Math.PI) / 180) + 1 / Math.cos((centerLat * Math.PI) / 180)) / Math.PI) / 2) * scale;
  
  const px = Math.round(imgW / 2 + (worldX - centerWorldX));
  const py = Math.round(imgH / 2 + (worldY - centerWorldY));
  return { px, py };
}

/**
 * POI 마커 SVG들을 생성하여 Sharp composite 오버레이 배열로 반환
 */
function buildPoiOverlays(
  poiSpots: MapPoiSpot[],
  centerLat: number, centerLng: number,
  zoom: number, imgW: number, imgH: number
): Array<{ input: Buffer; left: number; top: number }> {
  const overlays: Array<{ input: Buffer; left: number; top: number }> = [];
  
  for (const spot of poiSpots) {
    const { px, py } = latlngToPixel(spot.lat, spot.lng, centerLat, centerLng, zoom, imgW, imgH);
    
    // 이미지 범위 밖이면 스킵
    if (px < -10 || px > imgW + 10 || py < -10 || py > imgH + 10) continue;
    
    const color = poiMarkerColor(spot.category);
    const markerSize = 28;
    
    // POI 마커 SVG (작은 원형 마커 + 카테고리 색상)
    const poiSvg = Buffer.from(`
      <svg width="${markerSize}" height="${markerSize}" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
        <circle cx="14" cy="14" r="12" fill="${color}" stroke="white" stroke-width="2.5" opacity="0.95"/>
        <circle cx="14" cy="14" r="5" fill="white" opacity="0.9"/>
      </svg>
    `);
    
    overlays.push({
      input: poiSvg,
      left: Math.max(0, Math.min(px - markerSize / 2, imgW - markerSize)),
      top: Math.max(0, Math.min(py - markerSize / 2, imgH - markerSize)),
    });
  }
  
  return overlays;
}

/**
 * 건물 위치 기반 정적 지도 생성
 * 1차: coordinates가 있는 경우 OSM(OpenStreetMap) 정적 타일 3x3 합성
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
  if (coordinates?.lat && coordinates?.lng) {
    try {
      const apiKey = process.env.KAKAO_REST_API_KEY;
      if (apiKey) {
        const baseUrl = 'https://spi.maps.daum.net/mapscms/map/staticmap.png';
        const params = new URLSearchParams({
          apikey: apiKey,
          center: `${coordinates.lng},${coordinates.lat}`,
          level: '3',
          w: String(Math.min(w, 1280)),
          h: String(Math.min(h, 960)),
          markers: `type:d|size:medium|${coordinates.lng},${coordinates.lat}`,
        });
        const kakaoUrl = `${baseUrl}?${params.toString()}`;
        const response = await fetch(kakaoUrl, {
          signal: AbortSignal.timeout(6000),
        });
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const inputBuffer = Buffer.from(arrayBuffer);
          
          // 카카오 지도 위에 POI 마커 오버레이 (Sharp composite)
          const kakaoW = Math.min(w, 1280);
          const kakaoH = Math.min(h, 960);
          let resized = sharp(inputBuffer).resize({ width: kakaoW, height: kakaoH, fit: 'cover' });
          
          if (safePoiSpots.length > 0) {
            // 카카오 Static Map level 3 ≈ zoom 15 (근사치)
            const kakaoZoom = 15;
            const poiOverlays = buildPoiOverlays(safePoiSpots, coordinates.lat, coordinates.lng, kakaoZoom, kakaoW, kakaoH);
            if (poiOverlays.length > 0) {
              resized = sharp(await resized.png().toBuffer()).composite(poiOverlays);
            }
          }
          
          const resizedBuffer = await resized.jpeg({ quality: 85 }).toBuffer();
          return {
            buffer: resizedBuffer,
            base64: `image/jpeg;base64,${resizedBuffer.toString('base64')}`,
            width: w,
            height: h,
            sizeBytes: resizedBuffer.length,
          };
        }
      }
    } catch (err) {
      console.warn('[generateStaticMapPlaceholder] Kakao map failed, falling back to OSM:', err);
    }
  }

  // ── 1차: OpenStreetMap 정적 타일 3x3 합성 ──
  if (coordinates?.lat && coordinates?.lng) {
    try {
      const zoom = 16;
      const { lat, lng } = coordinates;
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

        // 건물 핀 마커 SVG
        const pinSvg = Buffer.from(`
          <svg width="40" height="50" viewBox="0 0 32 40">
            <path d="M16 0C7.164 0 0 7.164 0 16c0 12 16 24 16 24s16-12 16-24C32 7.164 24.836 0 16 0z" fill="#B98A2E"/>
            <circle cx="16" cy="16" r="6" fill="#10161F"/>
          </svg>
        `);

        // POI 마커 오버레이
        const poiOverlays = buildPoiOverlays(safePoiSpots, lat, lng, zoom, compositeWidth, compositeHeight);

        const cropLeft = Math.max(0, Math.floor((compositeWidth - w) / 2));
        const cropTop = Math.max(0, Math.floor((compositeHeight - h) / 2));

        const finalMapBuffer = await sharp(combinedBuffer)
          .composite([
            {
              input: pinSvg,
              left: Math.floor(compositeWidth / 2 - 20),
              top: Math.floor(compositeHeight / 2 - 40),
            },
            ...poiOverlays,
          ])
          .extract({
            left: cropLeft,
            top: cropTop,
            width: Math.min(w, compositeWidth - cropLeft),
            height: Math.min(h, compositeHeight - cropTop),
          })
          .jpeg({ quality: 85 })
          .toBuffer();

        return {
          buffer: finalMapBuffer,
          base64: `image/jpeg;base64,${finalMapBuffer.toString('base64')}`,
          width: w,
          height: h,
          sizeBytes: finalMapBuffer.length,
        };
      }
    } catch (err) {
      console.warn('[generateStaticMapPlaceholder] OSM tile compositing failed, falling back to SVG:', err);
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
    const response = await fetch(mapUrl, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
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
    };
  } catch (err) {
    console.warn('[fetchKakaoMapImage] Failed:', mapUrl, err);
    return null;
  }
}
