/**
 * PNG pHYs(물리 해상도) 메타 삽입/판독 (C-04, T1-18a, T2-25b).
 *
 * 인쇄용 QR "300DPI" 표기가 사실이 되도록 PNG 에 pHYs 청크를 넣는다.
 * 외부 의존 없이 순수 함수로 구현 (브라우저/Node 공용, Uint8Array 입출력).
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const INCH_PER_METER = 39.37007874015748;

let crcTable: Uint32Array | null = null;
function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  crcTable = t;
  return t;
}

export function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  for (let i = 0; i < 8; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  return true;
}

function readU32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

function writeU32(b: Uint8Array, o: number, v: number) {
  b[o] = (v >>> 24) & 0xff;
  b[o + 1] = (v >>> 16) & 0xff;
  b[o + 2] = (v >>> 8) & 0xff;
  b[o + 3] = v & 0xff;
}

function chunkType(b: Uint8Array, o: number): string {
  return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
}

/** dpi → pixels per meter (PNG pHYs 단위) */
export function dpiToPixelsPerMeter(dpi: number): number {
  return Math.round(dpi * INCH_PER_METER);
}

function buildPhysChunk(dpi: number): Uint8Array {
  const ppm = dpiToPixelsPerMeter(dpi);
  const chunk = new Uint8Array(4 + 4 + 9 + 4);
  writeU32(chunk, 0, 9); // data length
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // 'pHYs'
  writeU32(chunk, 8, ppm); // X
  writeU32(chunk, 12, ppm); // Y
  chunk[16] = 1; // unit = meter
  writeU32(chunk, 17, crc32(chunk.subarray(4, 17)));
  return chunk;
}

/**
 * PNG 바이트에 pHYs(dpi) 청크를 삽입한다. 기존 pHYs 가 있으면 교체한다.
 * @throws PNG 시그니처/IHDR 이 아니면 Error
 */
export function injectPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  if (!Number.isFinite(dpi) || dpi <= 0) throw new Error('dpi must be a positive number');
  if (!isPng(png)) throw new Error('Not a PNG');
  if (png.length < 33 || chunkType(png, 12) !== 'IHDR') throw new Error('PNG missing IHDR');

  // IHDR 끝 위치 = 8(sig) + 4(len) + 4(type) + 13(data) + 4(crc) = 33
  const ihdrEnd = 8 + 8 + readU32(png, 8) + 4;
  const parts: Uint8Array[] = [png.subarray(0, ihdrEnd), buildPhysChunk(dpi)];

  // 이후 청크를 순회하며 기존 pHYs 는 건너뛴다.
  let o = ihdrEnd;
  while (o + 12 <= png.length) {
    const len = readU32(png, o);
    const end = o + 12 + len;
    if (end > png.length) throw new Error('Corrupt PNG chunk');
    if (chunkType(png, o + 4) !== 'pHYs') parts.push(png.subarray(o, end));
    o = end;
  }

  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let w = 0;
  for (const p of parts) {
    out.set(p, w);
    w += p.length;
  }
  return out;
}

/** PNG 의 pHYs 가 가리키는 DPI(미터 단위일 때)를 읽는다. 없으면 null. */
export function readPngDpi(png: Uint8Array): { x: number; y: number } | null {
  if (!isPng(png)) return null;
  let o = 8;
  while (o + 12 <= png.length) {
    const len = readU32(png, o);
    const type = chunkType(png, o + 4);
    if (type === 'pHYs' && len === 9 && png[o + 16] === 1) {
      return {
        x: Math.round(readU32(png, o + 8) / INCH_PER_METER),
        y: Math.round(readU32(png, o + 12) / INCH_PER_METER),
      };
    }
    if (type === 'IDAT' || type === 'IEND') break;
    o += 12 + len;
  }
  return null;
}

/** 8cm @ dpi 에 필요한 픽셀 수 (8cm@300DPI = 945px → 2400px 로 여유 확보) */
export function pixelsForCm(cm: number, dpi: number): number {
  return Math.ceil((cm / 2.54) * dpi);
}
