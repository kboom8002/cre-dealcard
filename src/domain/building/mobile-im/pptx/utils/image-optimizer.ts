/**
 * 이미지 최적화 유틸리티
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
 * - 500KB 이하로 압축
 */
export async function optimizeImageForPptx(
  imageUrl: string,
  maxWidth = 1280,
  quality = 80
): Promise<OptimizedImage | null> {
  try {
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(10000), // 10초 타임아웃
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
