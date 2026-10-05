/**
 * @file map-overlay-meta.ts
 * @description 지도 이미지 ↔ PPTX 네이티브 오버레이 연동 유틸.
 *
 * Rule 66: Sharp/librsvg로 래스터화되는 SVG에는 한글을 넣지 않는다. 따라서 '본건' 라벨은
 * PptxGenJS 네이티브 텍스트로 지도 이미지 위에 얹어야 하며, 이를 위해 이미지 내 마커 픽셀 위치가 필요하다.
 *
 * 지적도 이미지는 base64 문자열로 DB(enrichment)에 영속화되므로, 마커 위치를 PNG tEXt 청크에
 * 함께 기록해 이미지와 메타가 절대 어긋나지 않게 한다 (스키마/렌더러 변경 불필요).
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const MAP_MARKER_META_KEY = 'credeal:map-marker';

/** 이미지 내 마커 위치 (0..1 정규화, 원점 좌상단) */
export interface MapMarkerMeta {
  v: 1;
  /** 본건 마커 중심 */
  target?: { x: number; y: number };
  /** 원본 이미지 픽셀 크기 */
  imgW?: number;
  imgH?: number;
}

let CRC_TABLE: Uint32Array | null = null;
function crc32(buf: Buffer): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function isPng(buf: Buffer | null | undefined): buf is Buffer {
  return !!buf && buf.length > 33 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}

/** PNG에 tEXt 청크를 IHDR 직후에 삽입. PNG가 아니면 원본 반환. (latin1 keyword, ASCII 값 권장) */
export function embedPngText(png: Buffer, keyword: string, value: string): Buffer {
  if (!isPng(png)) return png;
  const ihdrLen = png.readUInt32BE(8);
  const insertAt = 8 + 12 + ihdrLen; // signature + (len,type,data,crc) of IHDR
  const data = Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(value, 'latin1')]);
  const type = Buffer.from('tEXt', 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])), 0);
  return Buffer.concat([png.subarray(0, insertAt), len, type, data, crc, png.subarray(insertAt)]);
}

/** PNG tEXt 청크 값 조회 (IDAT 이전까지만 스캔). 없으면 null. */
export function readPngText(png: Buffer, keyword: string): string | null {
  if (!isPng(png)) return null;
  let off = 8;
  while (off + 12 <= png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT' || type === 'IEND') break;
    if (type === 'tEXt' && off + 8 + len <= png.length) {
      const data = png.subarray(off + 8, off + 8 + len);
      const sep = data.indexOf(0);
      if (sep > 0 && data.toString('latin1', 0, sep) === keyword) {
        return data.toString('latin1', sep + 1);
      }
    }
    off += 12 + len;
  }
  return null;
}

function isNorm(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

export function embedMapMarkerMeta(png: Buffer, meta: MapMarkerMeta): Buffer {
  return embedPngText(png, MAP_MARKER_META_KEY, JSON.stringify(meta));
}

/** data URI / base64 / Buffer 에서 마커 메타 추출 (없거나 손상 시 null) */
export function readMapMarkerMeta(image: string | Buffer | null | undefined): MapMarkerMeta | null {
  try {
    if (!image) return null;
    let buf: Buffer;
    if (Buffer.isBuffer(image)) {
      buf = image;
    } else {
      const s = String(image);
      const b64 = s.includes(',') ? s.slice(s.indexOf(',') + 1) : s;
      // tEXt는 IHDR 직후에 있으므로 앞부분만 디코딩 (대용량 base64 전체 디코딩 회피)
      buf = Buffer.from(b64.slice(0, 4096), 'base64');
    }
    const raw = readPngText(buf, MAP_MARKER_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MapMarkerMeta;
    if (!parsed || parsed.v !== 1) return null;
    if (parsed.target && !(isNorm(parsed.target.x) && isNorm(parsed.target.y))) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 원본 이미지를 슬롯 종횡비로 중앙 크롭할 영역 (픽셀, 정수) */
export function centerCropToAspect(imgW: number, imgH: number, slotAspect: number): { left: number; top: number; width: number; height: number } {
  const srcAspect = imgW / imgH;
  if (!(slotAspect > 0) || Math.abs(srcAspect - slotAspect) < 1e-3) return { left: 0, top: 0, width: imgW, height: imgH };
  if (srcAspect > slotAspect) {
    const width = Math.max(1, Math.round(imgH * slotAspect));
    return { left: Math.max(0, Math.round((imgW - width) / 2)), top: 0, width: Math.min(width, imgW), height: imgH };
  }
  const height = Math.max(1, Math.round(imgW / slotAspect));
  return { left: 0, top: Math.max(0, Math.round((imgH - height) / 2)), width: imgW, height: Math.min(height, imgH) };
}

/**
 * 원본 정규화 좌표(0..1) → 슬라이드 인치 좌표.
 * crop: 원본 픽셀 기준 크롭 영역(없으면 전체), slot: 이미지가 배치된 슬라이드 영역 (stretch 배치).
 * 크롭 영역 밖이면 null.
 */
export function normToSlot(
  norm: { x: number; y: number },
  img: { w: number; h: number },
  slot: { x: number; y: number; w: number; h: number },
  crop?: { left: number; top: number; width: number; height: number } | null,
): { x: number; y: number } | null {
  const c = crop ?? { left: 0, top: 0, width: img.w, height: img.h };
  const px = norm.x * img.w;
  const py = norm.y * img.h;
  const u = (px - c.left) / c.width;
  const v = (py - c.top) / c.height;
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return null;
  return { x: slot.x + u * slot.w, y: slot.y + v * slot.h };
}
