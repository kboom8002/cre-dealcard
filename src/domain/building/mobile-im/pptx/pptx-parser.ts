/**
 * PPTX 바이너리 파서 — D35 §4 모델 골든 IM 종단 검증용
 *
 * .pptx (ZIP) → slide XML → ParsedSlide[] 구조화
 *
 * 의존: jszip (기존), fast-xml-parser (신규)
 */
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

// ─── EMU 상수 ────────────────────────────────────────
const EMU_PER_INCH = 914400;

// ─── 타입 정의 ───────────────────────────────────────
export interface ParsedSlide {
  index: number;
  shapes: ParsedShape[];
  texts: string[];
  images: ParsedImage[];
}

export interface ParsedShape {
  name: string;
  type: 'text' | 'image' | 'table' | 'chart' | 'group' | 'other';
  position: { x: number; y: number; cx: number; cy: number }; // inches
  text?: string;
  fontSize?: number; // pt
}

export interface ParsedImage {
  slotName: string;
  widthPx: number;
  heightPx: number;
  boxWidthInches: number;
  boxHeightInches: number;
  effectiveDpi: number;
  cropRatio: number;
  aspectDistortionPct: number;
}

export interface PptxParseResult {
  slides: ParsedSlide[];
  slideCount: number;
  totalShapes: number;
  totalImages: number;
  totalTexts: number;
}

// ─── XML 파서 설정 ───────────────────────────────────
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => {
    // 반복 요소를 배열로 강제
    const arrayTags = [
      'p:sp', 'p:pic', 'p:graphicFrame', 'p:grpSp',
      'a:r', 'a:p',
      'Relationship',
    ];
    return arrayTags.includes(name);
  },
});

// ─── 이미지 해상도 헬퍼 ─────────────────────────────
function readPngDimensions(buf: Buffer): { w: number; h: number } | null {
  // PNG: bytes 0-7 signature, 8-11 IHDR length, 12-15 "IHDR", 16-19 width, 20-23 height
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50) return null; // not PNG
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return { w, h };
}

function readJpegDimensions(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 4) return null;
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null; // not JPEG
  let offset = 2;
  while (offset < buf.length - 8) {
    if (buf[offset] !== 0xFF) { offset++; continue; }
    const marker = buf[offset + 1];
    // SOF0 (0xC0) or SOF2 (0xC2) — baseline/progressive
    if (marker === 0xC0 || marker === 0xC2) {
      const h = buf.readUInt16BE(offset + 5);
      const w = buf.readUInt16BE(offset + 7);
      return { w, h };
    }
    // skip other markers
    const segLen = buf.readUInt16BE(offset + 2);
    offset += 2 + segLen;
  }
  return null;
}

function getImageDimensions(buf: Buffer): { w: number; h: number } {
  return readPngDimensions(buf) ?? readJpegDimensions(buf) ?? { w: 0, h: 0 };
}

// ─── 슬라이드 XML 유틸 ──────────────────────────────
function emuToInches(emu: number): number {
  return emu / EMU_PER_INCH;
}

function parsePosition(spPr: Record<string, any>): ParsedShape['position'] {
  const off = spPr?.['a:xfrm']?.['a:off'] ?? {};
  const ext = spPr?.['a:xfrm']?.['a:ext'] ?? {};
  return {
    x: emuToInches(Number(off['@_x'] ?? 0)),
    y: emuToInches(Number(off['@_y'] ?? 0)),
    cx: emuToInches(Number(ext['@_cx'] ?? 0)),
    cy: emuToInches(Number(ext['@_cy'] ?? 0)),
  };
}

function extractTexts(txBody: any): { text: string; fontSize: number } {
  if (!txBody) return { text: '', fontSize: 10 };
  const paragraphs = Array.isArray(txBody['a:p']) ? txBody['a:p'] : [txBody['a:p']].filter(Boolean);
  const textParts: string[] = [];
  let mainFontSize = 10;

  for (const p of paragraphs) {
    if (!p) continue;
    const runs = Array.isArray(p['a:r']) ? p['a:r'] : [p['a:r']].filter(Boolean);
    for (const r of runs) {
      if (!r) continue;
      const t = r['a:t'];
      if (typeof t === 'string') textParts.push(t);
      else if (t != null) textParts.push(String(t));

      // 폰트 크기 추출 (hundredths of point)
      const sz = r['a:rPr']?.['@_sz'];
      if (sz) mainFontSize = Number(sz) / 100;
    }
  }
  return { text: textParts.join(''), fontSize: mainFontSize };
}

function parseCropRatio(blipFill: any): number {
  const srcRect = blipFill?.['a:srcRect'];
  if (!srcRect) return 0;
  const l = Number(srcRect['@_l'] ?? 0) / 100000;
  const t = Number(srcRect['@_t'] ?? 0) / 100000;
  const r = Number(srcRect['@_r'] ?? 0) / 100000;
  const b = Number(srcRect['@_b'] ?? 0) / 100000;
  // crop ratio = fraction of original image that was cropped away
  return l + r + t + b - (l * r) - (t * b); // simplified: 1 - (1-l-r)*(1-t-b)
}

function calculateAspectDistortion(
  imgW: number, imgH: number,
  boxW: number, boxH: number,
  cropL: number, cropR: number, cropT: number, cropB: number,
): number {
  if (imgW === 0 || imgH === 0 || boxW === 0 || boxH === 0) return 0;
  // Visible portion of image
  const visW = imgW * (1 - cropL - cropR);
  const visH = imgH * (1 - cropT - cropB);
  if (visW <= 0 || visH <= 0) return 0;

  const imgAspect = visW / visH;
  const boxAspect = boxW / boxH;
  const distortion = Math.abs(imgAspect - boxAspect) / imgAspect * 100;
  return Math.round(distortion * 10) / 10;
}

// ─── 메인 파서 ───────────────────────────────────────
export async function parsePptx(buffer: Buffer): Promise<PptxParseResult> {
  const zip = await JSZip.loadAsync(buffer);

  // 슬라이드 파일 탐색 (정렬)
  const slideFiles = Object.keys(zip.files)
    .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] ?? '0', 10);
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] ?? '0', 10);
      return numA - numB;
    });

  // 미디어 파일 인덱스
  const mediaFiles = new Map<string, Buffer>();
  for (const [path, file] of Object.entries(zip.files)) {
    if (path.startsWith('ppt/media/') && !file.dir) {
      const buf = await file.async('nodebuffer');
      mediaFiles.set(path.replace('ppt/', ''), buf); // key: media/imageN.xxx
    }
  }

  const slides: ParsedSlide[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slideFile = slideFiles[i];
    const slideXml = await zip.files[slideFile].async('text');
    const parsed = xmlParser.parse(slideXml);

    // Relationships 로드
    const slideNum = slideFile.match(/slide(\d+)/)?.[1] ?? '1';
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    const relMap = new Map<string, string>(); // rId → target path
    if (zip.files[relsPath]) {
      const relsXml = await zip.files[relsPath].async('text');
      const relsParsed = xmlParser.parse(relsXml);
      const rels = relsParsed?.['Relationships']?.['Relationship'] ?? [];
      const relArr = Array.isArray(rels) ? rels : [rels].filter(Boolean);
      for (const rel of relArr) {
        if (rel?.['@_Id'] && rel?.['@_Target']) {
          // Target is relative: ../media/image1.png → media/image1.png
          const target = (rel['@_Target'] as string).replace('../', '');
          relMap.set(rel['@_Id'], target);
        }
      }
    }

    const cSld = parsed?.['p:sld']?.['p:cSld'] ?? {};
    const spTree = cSld?.['p:spTree'] ?? {};

    const shapes: ParsedShape[] = [];
    const texts: string[] = [];
    const images: ParsedImage[] = [];

    // ── 텍스트 도형 파싱 ────
    const spList = Array.isArray(spTree['p:sp']) ? spTree['p:sp'] : [spTree['p:sp']].filter(Boolean);
    for (const sp of spList) {
      if (!sp) continue;
      const nvSpPr = sp['p:nvSpPr']?.['p:cNvPr'];
      const name = nvSpPr?.['@_name'] ?? '';
      const spPr = sp['p:spPr'];
      const pos = parsePosition(spPr);
      const { text, fontSize } = extractTexts(sp['p:txBody']);

      const shape: ParsedShape = {
        name,
        type: 'text',
        position: pos,
        text: text || undefined,
        fontSize,
      };
      shapes.push(shape);
      if (text) texts.push(text);
    }

    // ── 이미지 도형 파싱 ────
    const picList = Array.isArray(spTree['p:pic']) ? spTree['p:pic'] : [spTree['p:pic']].filter(Boolean);
    for (const pic of picList) {
      if (!pic) continue;
      const nvPicPr = pic['p:nvPicPr']?.['p:cNvPr'];
      const slotName = nvPicPr?.['@_name'] ?? '';
      const spPr = pic['p:spPr'];
      const pos = parsePosition(spPr);

      const shape: ParsedShape = {
        name: slotName,
        type: 'image',
        position: pos,
      };
      shapes.push(shape);

      // 이미지 바이너리에서 실제 해상도 추출
      const blipFill = pic['p:blipFill'];
      const blip = blipFill?.['a:blip'];
      const rEmbed = blip?.['@_r:embed'];

      let widthPx = 0, heightPx = 0;
      if (rEmbed && relMap.has(rEmbed)) {
        const mediaPath = relMap.get(rEmbed)!;
        const mediaBuf = mediaFiles.get(mediaPath);
        if (mediaBuf) {
          const dims = getImageDimensions(mediaBuf);
          widthPx = dims.w;
          heightPx = dims.h;
        }
      }

      const boxW = pos.cx;
      const boxH = pos.cy;

      // 크로핑
      const srcRect = blipFill?.['a:srcRect'] ?? {};
      const cropL = Number(srcRect['@_l'] ?? 0) / 100000;
      const cropT = Number(srcRect['@_t'] ?? 0) / 100000;
      const cropR = Number(srcRect['@_r'] ?? 0) / 100000;
      const cropB = Number(srcRect['@_b'] ?? 0) / 100000;
      const cropRatio = 1 - (1 - cropL - cropR) * (1 - cropT - cropB);

      // 실효 DPI
      const visibleW = widthPx * (1 - cropL - cropR);
      const effectiveDpi = boxW > 0 ? Math.round(visibleW / boxW) : 0;

      // 종횡비 왜곡
      const aspectDist = calculateAspectDistortion(
        widthPx, heightPx, boxW, boxH, cropL, cropR, cropT, cropB,
      );

      images.push({
        slotName,
        widthPx,
        heightPx,
        boxWidthInches: Math.round(boxW * 1000) / 1000,
        boxHeightInches: Math.round(boxH * 1000) / 1000,
        effectiveDpi,
        cropRatio: Math.round(cropRatio * 1000) / 1000,
        aspectDistortionPct: aspectDist,
      });
    }

    // ── 테이블 도형 파싱 ────
    const gfList = Array.isArray(spTree['p:graphicFrame'])
      ? spTree['p:graphicFrame']
      : [spTree['p:graphicFrame']].filter(Boolean);
    for (const gf of gfList) {
      if (!gf) continue;
      const nvPr = gf['p:nvGraphicFramePr']?.['p:cNvPr'];
      const name = nvPr?.['@_name'] ?? '';
      const xfrm = gf['p:xfrm'] ?? {};
      const off = xfrm['a:off'] ?? {};
      const ext = xfrm['a:ext'] ?? {};
      shapes.push({
        name,
        type: 'table',
        position: {
          x: emuToInches(Number(off['@_x'] ?? 0)),
          y: emuToInches(Number(off['@_y'] ?? 0)),
          cx: emuToInches(Number(ext['@_cx'] ?? 0)),
          cy: emuToInches(Number(ext['@_cy'] ?? 0)),
        },
      });
    }

    // ── 그룹 도형 파싱 ────
    const grpList = Array.isArray(spTree['p:grpSp'])
      ? spTree['p:grpSp']
      : [spTree['p:grpSp']].filter(Boolean);
    for (const grp of grpList) {
      if (!grp) continue;
      const nvPr = grp['p:nvGrpSpPr']?.['p:cNvPr'];
      const name = nvPr?.['@_name'] ?? '';
      const grpSpPr = grp['p:grpSpPr'];
      const pos = parsePosition(grpSpPr);
      shapes.push({ name, type: 'group', position: pos });
    }

    slides.push({ index: i, shapes, texts, images });
  }

  return {
    slides,
    slideCount: slides.length,
    totalShapes: slides.reduce((s, sl) => s + sl.shapes.length, 0),
    totalImages: slides.reduce((s, sl) => s + sl.images.length, 0),
    totalTexts: slides.reduce((s, sl) => s + sl.texts.length, 0),
  };
}
