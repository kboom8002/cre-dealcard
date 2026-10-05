import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import QRCode from 'qrcode';
import {
  crc32,
  dpiToPixelsPerMeter,
  injectPngDpi,
  pixelsForCm,
  readPngDpi,
} from '@/lib/magazine/png-dpi';

describe('png-dpi: injectPngDpi', () => {
  it('crc32 표준 벡터("123456789" → 0xCBF43926)', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('300DPI = 11811 pixels/meter', () => {
    expect(dpiToPixelsPerMeter(300)).toBe(11811);
  });

  it('PNG 에 pHYs 삽입 → readPngDpi 와 sharp(density) 가 모두 300 으로 판독', async () => {
    const base = await sharp({
      create: { width: 16, height: 16, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    expect(readPngDpi(new Uint8Array(base))?.x).not.toBe(300); // sharp 기본 pHYs 는 1px/mm(≈25DPI)

    const out = injectPngDpi(new Uint8Array(base), 300);
    expect(readPngDpi(out)).toEqual({ x: 300, y: 300 });

    const meta = await sharp(Buffer.from(out)).metadata();
    expect(meta.width).toBe(16);
    expect(meta.height).toBe(16);
    expect(meta.density).toBe(300);
    // 픽셀 데이터가 손상되지 않았는지 — 디코드 성공
    const raw = await sharp(Buffer.from(out)).raw().toBuffer();
    expect(raw.length).toBe(16 * 16 * 3);
  });

  it('이미 pHYs 가 있으면 교체(중복 청크 없음)', async () => {
    const base = new Uint8Array(
      await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } }).png().toBuffer(),
    );
    const once = injectPngDpi(base, 72);
    const twice = injectPngDpi(once, 300);
    expect(readPngDpi(twice)).toEqual({ x: 300, y: 300 });
    const text = Buffer.from(twice).toString('latin1');
    expect(text.split('pHYs').length - 1).toBe(1);
    expect((await sharp(Buffer.from(twice)).metadata()).density).toBe(300);
  });

  it('2400×2400 QR PNG(8cm@300DPI) 에 300DPI 메타 삽입', async () => {
    const qr = await QRCode.toBuffer('https://www.credeal.net/magazine/test-slug/subscribe?source=qr_card', {
      width: 2400,
      margin: 4,
      errorCorrectionLevel: 'H',
      type: 'png',
    });
    const out = injectPngDpi(new Uint8Array(qr), 300);
    const meta = await sharp(Buffer.from(out)).metadata();
    expect(meta.width).toBeGreaterThanOrEqual(2400);
    expect(meta.height).toBeGreaterThanOrEqual(2400);
    expect(meta.density).toBe(300);
    expect(pixelsForCm(8, 300)).toBe(945);
    expect(meta.width!).toBeGreaterThanOrEqual(pixelsForCm(8, 300));
  });

  it('PNG 가 아니거나 dpi 가 잘못되면 throw', () => {
    expect(() => injectPngDpi(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 300)).toThrow('Not a PNG');
    expect(() => injectPngDpi(new Uint8Array(0), 300)).toThrow();
    expect(readPngDpi(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
