/**
 * @file image-diff.ts
 * @description 슬라이드 PNG 시각 회귀용 픽셀 비교기 (Hardening H3). sharp 기반, 추가 의존성 없음.
 */
import sharp from 'sharp';

export interface ImageDiffOptions {
  /** 채널(RGB)별 허용 오차 0~255. 안티앨리어싱/폰트 렌더 미세 차이 흡수. 기본 24 */
  channelTolerance?: number;
  /** 비교 전 양쪽을 맞출 폭 (px). 기본 640 */
  width?: number;
  /** 비교 전 양쪽을 맞출 높이 (px). 기본 360 */
  height?: number;
}

export interface ImageDiffResult {
  /** 전체 픽셀 중 달라진 픽셀 비율 (0~1) */
  diffRatio: number;
  diffPixels: number;
  totalPixels: number;
  /** 달라진 픽셀을 빨강으로 강조한 PNG (원본을 흐리게 깔고 표시) */
  diffPng: Buffer;
  /** 차이가 몰린 영역의 bbox (px, 정규화된 크기 기준). 차이 없으면 null */
  bbox: { x: number; y: number; w: number; h: number } | null;
}

async function toRaw(input: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(input)
    .resize(width, height, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();
}

export async function diffImages(a: Buffer, b: Buffer, opts: ImageDiffOptions = {}): Promise<ImageDiffResult> {
  const tol = opts.channelTolerance ?? 24;
  const width = opts.width ?? 640;
  const height = opts.height ?? 360;
  const [ra, rb] = await Promise.all([toRaw(a, width, height), toRaw(b, width, height)]);

  const total = width * height;
  const out = Buffer.alloc(total * 3);
  let diff = 0;
  let minX = width, minY = height, maxX = -1, maxY = -1;

  for (let i = 0; i < total; i++) {
    const o = i * 3;
    const dr = Math.abs(ra[o] - rb[o]);
    const dg = Math.abs(ra[o + 1] - rb[o + 1]);
    const db = Math.abs(ra[o + 2] - rb[o + 2]);
    if (dr > tol || dg > tol || db > tol) {
      diff++;
      out[o] = 255; out[o + 1] = 0; out[o + 2] = 0;
      const x = i % width;
      const y = (i - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    } else {
      // 변화 없는 픽셀은 원본(b)을 연하게 표시
      out[o] = Math.round(rb[o] * 0.35 + 165);
      out[o + 1] = Math.round(rb[o + 1] * 0.35 + 165);
      out[o + 2] = Math.round(rb[o + 2] * 0.35 + 165);
    }
  }

  const diffPng = await sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer();
  return {
    diffRatio: diff / total,
    diffPixels: diff,
    totalPixels: total,
    diffPng,
    bbox: diff === 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
  };
}
