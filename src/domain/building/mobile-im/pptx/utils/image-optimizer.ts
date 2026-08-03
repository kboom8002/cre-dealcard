/**
 * 이미지 최적화 및 정적 지도 유틸리티
 * sharp 기반 리사이즈/압축 → base64 변환
 * Vercel Pro (3GB 메모리) 환경 최적화
 */
import sharp from 'sharp';

export interface OptimizedImage {
  base64: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * URL에서 이미지를 가져와 PPTX 삽입용으로 최적화
 * - 최대 1280px 리사이즈
 * - JPEG 80% 품질
 */
export async function optimizeImageForPptx(
  imageUrl: string,
  maxWidth = 1280,
  quality = 80
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
 * 여러 이미지를 병렬로 최적화 (최대 4장)
 */
export async function optimizeImagesForPptx(
  urls: string[],
  maxCount = 4
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
 * 건물 위치 기반 정적 지도 SVG/JPEG 생성 유틸리티
 */
export async function generateStaticMapPlaceholder(
  addressOrArea: string,
  w = 800,
  h = 500
): Promise<OptimizedImage> {
  const svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="mapBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e293b"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334155" stroke-width="1" opacity="0.4"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#mapBg)"/>
    <rect width="100%" height="100%" fill="url(#grid)"/>
    
    <!-- 도로 시뮬레이션 라인 -->
    <path d="M 0 180 Q 300 220 800 120" stroke="#475569" stroke-width="16" fill="none" opacity="0.6"/>
    <path d="M 250 0 Q 320 250 400 500" stroke="#475569" stroke-width="12" fill="none" opacity="0.6"/>
    <path d="M 0 180 Q 300 220 800 120" stroke="#38bdf8" stroke-width="4" fill="none" stroke-dasharray="8 6" opacity="0.8"/>
    
    <!-- 핀 마커 -->
    <circle cx="320" cy="220" r="28" fill="#c8ff00" opacity="0.25"/>
    <circle cx="320" cy="220" r="14" fill="#c8ff00"/>
    <circle cx="320" cy="220" r="6" fill="#0f172a"/>
    
    <!-- 텍스트 라벨 -->
    <rect x="180" y="270" width="280" height="44" rx="8" fill="#0f172a" stroke="#c8ff00" stroke-width="1.5" opacity="0.95"/>
    <text x="320" y="297" font-family="sans-serif" font-size="15" font-weight="bold" fill="#ffffff" text-anchor="middle">📍 ${addressOrArea}</text>
  </svg>`;

  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return {
    base64: `image/png;base64,${buffer.toString('base64')}`,
    width: w,
    height: h,
    sizeBytes: buffer.length,
  };
}
