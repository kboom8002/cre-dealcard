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
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

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
  maxCount = 8
): Promise<OptimizedImage[]> {
  const targets = urls.slice(0, maxCount);
  const results = await Promise.allSettled(
    targets.map(url => optimizeImageForPptx(url))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<OptimizedImage | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((img): img is OptimizedImage => img !== null);
}

/**
 * 건물 위치 기반 정적 지도 생성
 * 1차: Naver Static Map API (실제 지도)
 * 2차: SVG 플레이스홀더 (API 키 없을 때)
 */
export async function generateStaticMapPlaceholder(
  addressOrArea: string,
  w = 800,
  h = 500
): Promise<OptimizedImage> {
  // Naver Static Map API 시도
  const naverClientId = process.env.NAVER_MAP_CLIENT_ID;
  if (naverClientId) {
    try {
      // Geocode → 좌표 변환 후 Static Map 호출
      const geocodeUrl = `https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(addressOrArea)}`;
      const geoRes = await fetch(geocodeUrl, {
        headers: {
          'X-NCP-APIGW-API-KEY-ID': naverClientId,
          'X-NCP-APIGW-API-KEY': process.env.NAVER_MAP_CLIENT_SECRET!,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (geoRes.ok) {
        const geoData = await geoRes.json();
        const addr = geoData.addresses?.[0];
        if (addr) {
          const staticUrl = `https://naveropenapi.apigw.ntruss.com/map-static/v2/raster?w=${w}&h=${h}&center=${addr.x},${addr.y}&level=16&markers=type:d|size:mid|pos:${addr.x} ${addr.y}&format=jpeg`;
          const mapRes = await fetch(staticUrl, {
            headers: {
              'X-NCP-APIGW-API-KEY-ID': naverClientId,
              'X-NCP-APIGW-API-KEY': process.env.NAVER_MAP_CLIENT_SECRET!,
            },
            signal: AbortSignal.timeout(8000),
          });

          if (mapRes.ok) {
            const mapBuffer = Buffer.from(await mapRes.arrayBuffer());
            return {
              buffer: mapBuffer,
              base64: `image/jpeg;base64,${mapBuffer.toString('base64')}`,
              width: w,
              height: h,
              sizeBytes: mapBuffer.length,
            };
          }
        }
      }
    } catch (err) {
      console.warn('[generateStaticMap] Naver API failed, using SVG fallback:', err);
    }
  }

  // SVG 플레이스홀더 (Naver API 실패 또는 키 없을 때)
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
    
    <circle cx="320" cy="220" r="28" fill="#B98A2E" opacity="0.25"/>
    <circle cx="320" cy="220" r="14" fill="#B98A2E"/>
    <circle cx="320" cy="220" r="6" fill="#10161F"/>
    
    <rect x="180" y="270" width="280" height="44" rx="8" fill="#10161F" stroke="#B98A2E" stroke-width="1.5" opacity="0.95"/>
    <text x="320" y="297" font-family="sans-serif" font-size="15" font-weight="bold" fill="#ffffff" text-anchor="middle">${addressOrArea}</text>
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
