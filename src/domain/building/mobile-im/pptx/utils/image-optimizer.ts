/**
 * 이미지 최적화 및 정적 지도 유틸리티
 * sharp 기반 리사이즈/압축 → Buffer 반환 (Base64 대비 33% 용량 절감)
 * Vercel Pro (3GB 메모리) 환경 최적화
 */
import sharp from 'sharp';
import { selectLocationPois, classifyPoi, bearingDeg, directionKo, formatOffViewLabel, type PoiCandidate, type SelectedPoi } from '../location-poi-selector';
import {
  TARGET_PIN,
  POI_MARKER_R,
  buildNumberedPoiLayer,
  buildTargetPinSvg,
  buildWalkCircleSvg,
  chooseWalkCircle,
  chooseLocationZoom,
  placeEdgeMarkers,
  ANCHOR_LANDMARK_MAX_M,
  type PlacedPoi,
  type ViewRect,
} from './location-map-overlay';
import { scrubKakaoExitMarkers } from './kakao-basemap-scrub';

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

    const resizedBuffer = await sharp(inputBuffer).rotate() // EXIF Orientation 자동 보정 (출력 시 EXIF 제거되므로 필수)
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
  if (
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    !Number.isFinite(centerLat) || !Number.isFinite(centerLng) ||
    !Number.isFinite(metersPerPx) || metersPerPx <= 0
  ) {
    return { px: NaN, py: NaN };
  }
  const dxMeters = (lng - centerLng) * 111320 * Math.cos(centerLat * Math.PI / 180);
  const dyMeters = (lat - centerLat) * 111320;
  const px = Math.round(imgW / 2 + dxMeters / metersPerPx);
  const py = Math.round(imgH / 2 - dyMeters / metersPerPx);
  return { px, py };
}

/** 선택 POI 간 최소 이격 (m) — 줌과 무관한 고정값 (줌 ≥1.0 에서 마커 지름 36px 이상 확보). 선별 결과가 줌에 의존하지 않도록 한다 */
const POI_MIN_SEPARATION_M = 40;

/** 뷰 밖 POI 표기 변환: 가장자리 마커 + 방위/거리 범례 (방위는 실제 좌표로 계산한 8방위) */
function asOffViewPoi(poi: SelectedPoi, center: { lat: number; lng: number }): SelectedPoi {
  const bearing = poi.bearingDeg ?? bearingDeg(center.lat, center.lng, poi.lat, poi.lng);
  const direction = poi.direction ?? directionKo(bearing);
  return {
    ...poi,
    bearingDeg: Math.round(bearing * 10) / 10,
    direction,
    offView: true,
    label: formatOffViewLabel(poi.displayName, direction, poi.distanceM),
  };
}

/**
 * POI 정밀 선별(location-poi-selector) 후 지도 픽셀 좌표에 배치.
 * 선별은 줌/뷰와 무관하게 결정된다 (본건 핀 영역과 겹치는 후보만 제외). 뷰 밖 후보는 버리지 않고
 * 프레임 가장자리에 방향 마커(번호 + 화살표)로 배치하며, 범례(네이티브 텍스트)에는 "이름 방위 거리"가 표기된다.
 * 마커 번호 = 범례 번호 (뷰 안/밖 동일).
 */
function selectAndPlacePois(
  pool: PoiCandidate[],
  toPx: (lat: number, lng: number) => { px: number; py: number },
  view: ViewRect,
  target: { cx: number; cy: number },
  metersPerPx: number,
  center: { lat: number; lng: number },
  options?: LocationMapOptions,
): PlacedPoi[] {
  const margin = POI_MARKER_R + 8;
  const inViewPx = (px: number, py: number): boolean =>
    px >= view.x0 + margin && px <= view.x1 - margin && py >= view.y0 + margin && py <= view.y1 - margin;
  const isPlaceable = (c: PoiCandidate): boolean => {
    const { px, py } = toPx(Number(c.lat), Number(c.lng));
    if (!Number.isFinite(px) || !Number.isFinite(py)) return false;
    // 본건 핀(끝=좌표, 높이 72px) 영역과 겹치는 후보 제외
    if (Math.abs(px - target.cx) < 34 && py > target.cy - TARGET_PIN.tipY - POI_MARKER_R && py < target.cy + POI_MARKER_R + 4) return false;
    return true;
  };
  const selected = selectLocationPois(pool, {
    posture: options?.posture,
    assetType: options?.assetType,
    center,
    isPlaceable,
    minSeparationM: Math.max(POI_MIN_SEPARATION_M, (POI_MARKER_R * 2 + 4) * metersPerPx),
    mentionTexts: options?.mentionTexts,
    guaranteeMajorInstitutions: true,
  });
  const raw = selected.map(poi => ({ poi, ...toPx(poi.lat, poi.lng) }));
  const inside = raw.filter(r => inViewPx(r.px, r.py));
  const outside = raw.filter(r => !inViewPx(r.px, r.py));
  const edgePos = placeEdgeMarkers(
    outside.map(r => ({ index: r.poi.index, angle: Math.atan2(r.py - target.cy, r.px - target.cx) })),
    view,
    target,
    [...inside.map(r => ({ px: r.px, py: r.py })), { px: target.cx, py: target.cy - Math.round(TARGET_PIN.tipY / 2) }],
  );
  return raw.map((r): PlacedPoi => {
    if (inViewPx(r.px, r.py)) return { poi: r.poi, px: r.px, py: r.py };
    const p = edgePos.get(r.poi.index) ?? { px: r.px, py: r.py };
    return {
      poi: asOffViewPoi(r.poi, center),
      px: p.px,
      py: p.py,
      edgeAngle: Math.atan2(r.py - target.cy, r.px - target.cx),
    };
  });
}

/** 후보 풀에서 최근접 지하철역의 본건 기준 동/북 변위 (m) — 확대 배율 결정용 */
function nearestStationOffset(pool: PoiCandidate[], lat: number, lng: number): { dxM: number; dyM: number } | null {
  let best: PoiCandidate | null = null;
  for (const c of pool) {
    if (!c || classifyPoi(c) !== 'station') continue;
    const d = Number(c.distanceM);
    if (!Number.isFinite(d) || d > 1500) continue;
    if (!best || d < Number(best.distanceM)) best = c;
  }
  if (!best) return null;
  return {
    dxM: (Number(best.lng) - lng) * 111320 * Math.cos(lat * Math.PI / 180),
    dyM: (Number(best.lat) - lat) * 111320,
  };
}

/**
 * 뷰 정책용: 선별된 랜드마크(역 제외) 중 본건 1km 이내 앵커의 동/북 변위 (m).
 * 줌을 1.0 하한까지 낮춰서라도 뷰 안에 들어오는 경우에만 chooseLocationZoom 이 줌을 낮춘다.
 */
function anchorLandmarkOffsets(
  pool: PoiCandidate[],
  lat: number,
  lng: number,
  options?: LocationMapOptions,
): Array<{ dxM: number; dyM: number }> {
  const sel = selectLocationPois(pool, {
    posture: options?.posture,
    assetType: options?.assetType,
    center: { lat, lng },
    minSeparationM: POI_MIN_SEPARATION_M,
    mentionTexts: options?.mentionTexts,
    guaranteeMajorInstitutions: true,
  });
  return sel
    .filter(p => p.kind !== 'station' && p.distanceM <= ANCHOR_LANDMARK_MAX_M)
    .map(p => ({
      dxM: (p.lng - lng) * 111320 * Math.cos(lat * Math.PI / 180),
      dyM: (p.lat - lat) * 111320,
    }));
}

/** 선택된 역까지 점선 (본건 → 역) */
function buildStationLineSvg(placed: PlacedPoi[], canvasW: number, canvasH: number, cx: number, cy: number): Buffer | null {
  const lines = placed
    .filter(p => p.poi.kind === 'station')
    .slice(0, 1)
    .map(p => `<line x1="${cx}" y1="${cy}" x2="${p.px.toFixed(1)}" y2="${p.py.toFixed(1)}" stroke="#F59E0B" stroke-width="2.5" stroke-dasharray="8,6" stroke-linecap="round"/>`)
    .join('');
  if (!lines) return null;
  return Buffer.from(`<svg width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`);
}

/** 입지 지도 오버레이 메타 — 출력 이미지 정규화 좌표(0..1). a06-diagram 네이티브 '본건' 라벨/범례 배치용 */
export interface LocationMapOverlayMeta {
  /** 본건 좌표(핀 끝) */
  target: { x: number; y: number };
  /** 본건 핀 머리 상단 y — 네이티브 '본건' 라벨을 핀 위에 배치 */
  targetTopY: number;
  /** 번호 마커 (index = 범례 번호) */
  pois: Array<{ index: number; x: number; y: number; poi: SelectedPoi }>;
  /** 도보 반경 원 (그려진 경우) */
  walkCircle: { minutes: number; radiusM: number } | null;
  /** 출력 이미지 1px 당 지상 m */
  metersPerPx: number;
}

export interface LocationMapOptions {
  /** 투자 포스처 (income/trading/owner_occupied/development/operating) */
  posture?: string | null;
  /** 자산유형 (오피스빌딩/근생/호텔 등) */
  assetType?: string | null;
  /** 정밀 선별용 실조회 후보 풀 (kakao candidateSpots). 없으면 poiSpots 사용 */
  candidates?: PoiCandidate[] | null;
  /** 중개인 실입력 원문(메모/입지 설명/소재지) — 원문에 언급된 대형 기관을 지도에서 누락하지 않기 위한 선별 힌트 (렌더 경로 전용) */
  mentionTexts?: string[] | null;
  /** 확대 배율 — Kakao Static Map 기본(요청 1px≈1m) 대비, 기본 1.5 */
  zoom?: number;
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
  poiSpots?: MapPoiSpot[] | null,
  options?: LocationMapOptions,
): Promise<OptimizedImage & { overlayMeta?: LocationMapOverlayMeta }> {
  const safeW = (typeof w === 'number' && Number.isFinite(w) && w > 0) ? Math.round(w) : 800;
  const safeH = (typeof h === 'number' && Number.isFinite(h) && h > 0) ? Math.round(h) : 500;
  // 정밀 선별 후보: candidateSpots(카테고리명 포함) 우선, 없으면 기존 keySpots
  const candidatePool: PoiCandidate[] = ((options?.candidates && options.candidates.length > 0)
    ? options.candidates
    : (poiSpots || [])) as PoiCandidate[];
  
  // ── 0차: 카카오 Static Map API (최우선) ──
  const coordLat = coordinates ? Number(coordinates.lat) : NaN;
  const coordLng = coordinates ? Number(coordinates.lng) : NaN;
  const hasValidCoords = !isNaN(coordLat) && !isNaN(coordLng) && coordLat !== 0 && coordLng !== 0;

  if (hasValidCoords) {
    try {
      const apiKey = process.env.KAKAO_REST_API_KEY;
      if (apiKey) {
        // 실측(2026-10-05): Kakao Static Map REST는 level 파라미터와 무관하게 "요청 size 1px ≈ 지상 1m"로 렌더링하고
        // 응답은 2배 해상도 이미지다. 따라서 확대는 요청 size(=뷰 범위 m)를 줄여 출력 크기로 리샘플링하여 구현한다.
        // (기존 level→m/px 매핑(level4=2m/px)은 실제와 2배 어긋나 POI 마커가 본건 쪽으로 당겨져 그려졌음)
        const kakaoW = Math.min(safeW, 1800);
        const kakaoH = Math.min(safeH, 960);
        const zoom = chooseLocationZoom(
          options?.zoom ?? 1.5, kakaoW, kakaoH,
          nearestStationOffset(candidatePool, coordLat, coordLng),
          48,
          anchorLandmarkOffsets(candidatePool, coordLat, coordLng, options),
        );
        const metersPerPx = 1 / zoom;
        const reqW = Math.max(100, Math.round(kakaoW * metersPerPx));
        const reqH = Math.max(100, Math.round(kakaoH * metersPerPx));
        const kakaoUrl = `https://dapi.kakao.com/v2/maps/staticmap?center=${coordLng},${coordLat}&size=${reqW}x${reqH}&level=3`;
        const response = await fetch(kakaoUrl, {
          headers: {
            Authorization: `KakaoAK ${apiKey}`,
          },
          signal: AbortSignal.timeout(6000),
        });
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          // Kakao 베이스 타일에 구워진 지하철 출구 번호(노란 원 1~8 + 연결선)는 우리 번호 마커/범례와 혼동되므로 제거 (실패 시 원본)
          const { buffer: inputBuffer } = await scrubKakaoExitMarkers(Buffer.from(arrayBuffer));
          
          // 카카오 지도 위에 도보권 원 + 번호 POI 마커 + 건물 골드 핀 오버레이 (Sharp composite, 전부 left/top=정수)
          let resized = sharp(inputBuffer).resize({ width: kakaoW, height: kakaoH, fit: 'fill' });
          const cx = Math.round(kakaoW / 2);
          const cy = Math.round(kakaoH / 2);

          const overlays: Array<{ input: Buffer; left: number; top: number }> = [];

          // 1. 도보 반경 원 (5분=400m가 프레임을 넘으면 3분=240m) — 라벨은 ASCII "Nmin"
          const walk = chooseWalkCircle(metersPerPx, kakaoH);
          if (walk) {
            overlays.push({ input: buildWalkCircleSvg(kakaoW, kakaoH, cx, cy, walk.radiusPx, walk.minutes), left: 0, top: 0 });
          }

          // 2. POI 정밀 선별 (포스처/자산유형 맞춤 3~5건) → 번호 마커
          const toPx = (lat: number, lng: number) => latlngToPixel(lat, lng, coordLat, coordLng, metersPerPx, kakaoW, kakaoH);
          const placed = selectAndPlacePois(candidatePool, toPx, { x0: 0, y0: 0, x1: kakaoW, y1: kakaoH }, { cx, cy }, metersPerPx, { lat: coordLat, lng: coordLng }, options);
          const lineSvg = buildStationLineSvg(placed, kakaoW, kakaoH, cx, cy);
          if (lineSvg) overlays.push({ input: lineSvg, left: 0, top: 0 });
          const markerLayer = buildNumberedPoiLayer(placed, kakaoW, kakaoH);
          if (markerLayer) overlays.push({ input: markerLayer, left: 0, top: 0 });

          // 3. 본건 위치 골드 핀 (텍스트 없음 — '본건' 라벨은 PPTX 네이티브, Rule 66)
          overlays.push({
            input: buildTargetPinSvg('goldhalo'),
            left: Math.max(0, Math.floor(cx - TARGET_PIN.tipX)),
            top: Math.max(0, Math.floor(cy - TARGET_PIN.tipY)),
          });

          resized = sharp(await resized.png().toBuffer()).composite(overlays);
          
          const resizedBuffer = await resized.jpeg({ quality: 85 }).toBuffer();
          return {
            buffer: resizedBuffer,
            base64: `image/jpeg;base64,${resizedBuffer.toString('base64')}`,
            width: safeW,
            height: safeH,
            sizeBytes: resizedBuffer.length,
            originalWidth: safeW,
            originalHeight: safeH,
            aspectRatio: safeW / safeH,
            overlayMeta: {
              target: { x: cx / kakaoW, y: cy / kakaoH },
              targetTopY: Math.max(0, (cy - TARGET_PIN.tipY + TARGET_PIN.topY) / kakaoH),
              pois: placed.map(p => ({ index: p.poi.index, x: p.px / kakaoW, y: p.py / kakaoH, poi: p.poi })),
              walkCircle: walk ? { minutes: walk.minutes, radiusM: walk.radiusM } : null,
              metersPerPx,
            },
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
      // 줌 16 (약 700m 범위): 입지 지도 한 단계 확대 (기존 15) — 역세권 맥락 + 번호 POI 가독성
      const zoom = 16;
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

        // 건물 골드 핀 마커 SVG (80×85 고대비 백색 후광, 텍스트 없음 — '본건' 라벨은 PPTX 네이티브)
        const pinSvg = buildTargetPinSvg('osmhalo');

        const targetW = Math.max(safeW, 1120);
        const targetH = Math.max(safeH, 900);
        
        // OSM 폴백: 종횡비 보정 후 리사이즈
        const targetAspect = (Number.isFinite(targetW) && Number.isFinite(targetH) && targetH > 0)
          ? targetW / targetH
          : 1.244;
        const compositeSize = 768; // 3 tiles × 256px
        let cropW: number, cropH: number;
        if (Number.isFinite(targetAspect) && targetAspect >= 1) {
          cropW = compositeSize;
          cropH = Math.round(compositeSize / targetAspect);
        } else if (Number.isFinite(targetAspect) && targetAspect > 0) {
          cropH = compositeSize;
          cropW = Math.round(compositeSize * targetAspect);
        } else {
          cropW = compositeSize;
          cropH = compositeSize;
        }
        cropW = Math.max(1, Math.min(compositeSize, Math.round(cropW)));
        cropH = Math.max(1, Math.min(compositeSize, Math.round(cropH)));
        const cropL = Math.max(0, Math.min(compositeSize - cropW, Math.round((compositeSize - cropW) / 2)));
        const cropT = Math.max(0, Math.min(compositeSize - cropH, Math.round((compositeSize - cropH) / 2)));

        // POI 마커 오버레이 (zoom 16의 실제 픽셀당 미터 해상도 계산) — 타일 그리드의 본건 실제 픽셀 위치 기준
        const osmMeterPerPx = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8);
        const n = Math.pow(2, zoom);
        const latRadOsm = (lat * Math.PI) / 180;
        const targetPx = Math.round((((lng + 180) / 360) * n - tileX + 1) * tileSize);
        const targetPy = Math.round((((1 - Math.log(Math.tan(latRadOsm) + 1 / Math.cos(latRadOsm)) / Math.PI) / 2) * n - tileY + 1) * tileSize);
        const toPxOsm = (pLat: number, pLng: number) => {
          const r = latlngToPixel(pLat, pLng, lat, lng, osmMeterPerPx, compositeWidth, compositeHeight);
          return { px: r.px - compositeWidth / 2 + targetPx, py: r.py - compositeHeight / 2 + targetPy };
        };
        const placedOsm = selectAndPlacePois(
          candidatePool, toPxOsm,
          { x0: cropL, y0: cropT, x1: cropL + cropW, y1: cropT + cropH },
          { cx: targetPx, cy: targetPy },
          osmMeterPerPx,
          { lat: coordLat, lng: coordLng },
          options,
        );
        const lineOsm = buildStationLineSvg(placedOsm, compositeWidth, compositeHeight, targetPx, targetPy);
        const markerLayerOsm = buildNumberedPoiLayer(placedOsm, compositeWidth, compositeHeight);

        // Stage 1: Composite overlays on full-size canvas
        const compositedBuffer = await sharp(combinedBuffer)
          .composite([
            ...(lineOsm ? [{ input: lineOsm, left: 0, top: 0 }] : []),
            ...(markerLayerOsm ? [{ input: markerLayerOsm, left: 0, top: 0 }] : []),
            {
              input: pinSvg,
              left: Math.max(0, Math.floor(targetPx - TARGET_PIN.tipX)),
              top: Math.max(0, Math.floor(targetPy - TARGET_PIN.tipY)),
            },
          ])
          .png()
          .toBuffer();

        const osmOverlayMeta: LocationMapOverlayMeta = {
          target: { x: (targetPx - cropL) / cropW, y: (targetPy - cropT) / cropH },
          targetTopY: Math.max(0, (targetPy - TARGET_PIN.tipY + TARGET_PIN.topY - cropT) / cropH),
          pois: placedOsm.map(p => ({ index: p.poi.index, x: (p.px - cropL) / cropW, y: (p.py - cropT) / cropH, poi: p.poi })),
          walkCircle: null,
          metersPerPx: osmMeterPerPx * (cropW / targetW),
        };
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
          overlayMeta: osmOverlayMeta,
        };
      }
    } catch (err) {
      log.warn('[generateStaticMapPlaceholder] OSM tile compositing failed, falling back to SVG:', err);
    }
  }

  // ── 2차: SVG 플레이스홀더 (한글 텍스트 없이 핀 및 그래픽 라인만 표시) ──
  const svg = `
  <svg width="${safeW}" height="${safeH}" xmlns="http://www.w3.org/2000/svg">
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
    
    <path d="M 0 180 Q 300 220 ${safeW} 120" stroke="#2E3A4A" stroke-width="16" fill="none" opacity="0.6"/>
    <path d="M 250 0 Q 320 250 400 ${safeH}" stroke="#2E3A4A" stroke-width="12" fill="none" opacity="0.6"/>
    <path d="M 0 180 Q 300 220 ${safeW} 120" stroke="#B98A2E" stroke-width="3" fill="none" stroke-dasharray="8 6" opacity="0.7"/>
    
    <circle cx="${safeW / 2}" cy="${safeH / 2}" r="32" fill="#B98A2E" opacity="0.25"/>
    <circle cx="${safeW / 2}" cy="${safeH / 2}" r="16" fill="#B98A2E"/>
    <circle cx="${safeW / 2}" cy="${safeH / 2}" r="6" fill="#10161F"/>
  </svg>`;

  const buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
  return {
    buffer,
    base64: `image/jpeg;base64,${buffer.toString('base64')}`,
    width: safeW,
    height: safeH,
    sizeBytes: buffer.length,
    originalWidth: safeW,
    originalHeight: safeH,
    aspectRatio: safeW / safeH,
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
  const safeW = (typeof w === 'number' && Number.isFinite(w) && w > 0) ? Math.round(w) : 560;
  const safeH = (typeof h === 'number' && Number.isFinite(h) && h > 0) ? Math.round(h) : 450;
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
      .resize({ width: safeW, height: safeH, fit: 'cover' })
      .jpeg({ quality: 85 })
      .toBuffer();
    return {
      buffer,
      base64: `image/jpeg;base64,${buffer.toString('base64')}`,
      width: safeW,
      height: safeH,
      sizeBytes: buffer.length,
      originalWidth: safeW,
      originalHeight: safeH,
      aspectRatio: safeW / safeH,
    };
  } catch (err) {
    log.warn('[fetchKakaoMapImage] Failed:', mapUrl, err);
    return null;
  }
}
