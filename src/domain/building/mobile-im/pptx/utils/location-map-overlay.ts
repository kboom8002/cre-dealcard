/**
 * @file location-map-overlay.ts
 * @description 입지 지도(A06 Location) Sharp 오버레이 빌더 — 텍스트 폰트 비의존 SVG.
 *
 * Rule 66: Vercel/Linux 서버리스에는 CJK(및 사실상 모든) 시스템 폰트가 보장되지 않으므로,
 * 번호 마커의 숫자는 <text>가 아닌 벡터 스트로크 경로(digitGlyph)로 그린다 → 폰트 유무와 무관하게 렌더링.
 * 한글 명칭/거리 범례와 '본건' 라벨은 PptxGenJS 네이티브 텍스트로 a06-diagram.ts 에서 렌더링한다.
 */

import type { SelectedPoi } from '../location-poi-selector';

/** 본건 핀 SVG 캔버스 (핀 끝 = (40, 72)) */
export const TARGET_PIN = { w: 80, h: 85, tipX: 40, tipY: 72, topY: 6 } as const;

/** 마커 반경 (px) */
export const POI_MARKER_R = 14;

/** 카테고리별 번호 마커 색상 (네이티브 범례와 동일 색상 사용) */
export function poiMarkerFill(kind: SelectedPoi['kind']): string {
  switch (kind) {
    case 'station': return '#1D4ED8';
    case 'road': return '#475569';
    default: return '#132A3A';
  }
}

/**
 * 6×10 그리드 스트로크 숫자 글리프 (1~9). 폰트 미의존.
 * 반환값은 (0,0)~(6,10) 좌표계의 SVG 요소 문자열.
 */
export function digitGlyph(d: number): string {
  const P = (dd: string) => `<path d="${dd}"/>`;
  switch (d) {
    case 1: return P('M1.4 2.3 L3.4 0.4 L3.4 9.6');
    case 2: return P('M0.6 2.7 C0.6 0.1 5.4 0.1 5.4 2.8 C5.4 4.7 3.0 6.0 0.6 9.6 L5.6 9.6');
    case 3: return P('M0.7 1.3 C2.3 -0.2 5.3 0.2 5.3 2.5 C5.3 4.0 4.0 4.7 2.6 4.8 C4.2 4.8 5.6 5.6 5.6 7.2 C5.6 9.9 2.0 10.2 0.5 8.6');
    case 4: return P('M4.2 9.6 L4.2 0.4 L0.4 6.8 L5.8 6.8');
    case 5: return P('M5.2 0.4 L1.2 0.4 L0.8 4.4 C2.8 3.4 5.6 4.0 5.6 6.8 C5.6 9.8 1.8 10.2 0.5 8.6');
    case 6: return P('M5.0 1.0 C3.0 -0.4 0.6 0.8 0.6 5.4 C0.6 8.6 1.8 9.8 3.1 9.8 C4.6 9.8 5.6 8.6 5.6 7.0 C5.6 5.3 4.4 4.4 3.1 4.4 C1.8 4.4 0.8 5.3 0.6 6.4');
    case 7: return P('M0.4 0.4 L5.6 0.4 L2.4 9.6');
    case 8: return '<ellipse cx="3" cy="2.5" rx="2.2" ry="2.1"/><ellipse cx="3" cy="7.2" rx="2.6" ry="2.45"/>';
    case 9: return `<g transform="rotate(180 3 5)">${digitGlyph(6)}</g>`;
    default: return '';
  }
}

/** 번호 마커 1개 (원 + 벡터 숫자) SVG 조각 */
export function numberedMarkerSvg(cx: number, cy: number, n: number, fill: string): string {
  const s = 1.5; // 글리프 9×15px
  const gx = cx - 3 * s;
  const gy = cy - 5 * s;
  return `<g>`
    + `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${POI_MARKER_R + 1.5}" fill="#000000" fill-opacity="0.18"/>`
    + `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${POI_MARKER_R}" fill="${fill}" stroke="#FFFFFF" stroke-width="2.5"/>`
    + `<g transform="translate(${gx.toFixed(1)} ${gy.toFixed(1)}) scale(${s})" fill="none" stroke="#FFFFFF" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${digitGlyph(n)}</g>`
    + `</g>`;
}

export interface PlacedPoi {
  poi: SelectedPoi;
  px: number;
  py: number;
  /** 뷰 밖 POI: 프레임 가장자리 마커 (진행 방향 각도, 라디안, 화면 좌표계 — 0=동, +π/2=남) */
  edgeAngle?: number;
}

/** 가장자리 마커 중심의 프레임 안쪽 여유 (마커 반경 + 화살표 길이) */
export const EDGE_INSET_PX = POI_MARKER_R + 14;

export interface ViewRect { x0: number; y0: number; x1: number; y1: number }

/** 본건(target)에서 angle 방향 광선이 프레임(안쪽 여유 적용)과 만나는 점 — 정수 좌표 (Rule 61) */
export function edgeAnchorPoint(
  view: ViewRect,
  target: { cx: number; cy: number },
  angle: number,
  inset = EDGE_INSET_PX,
): { px: number; py: number } {
  const xmin = view.x0 + inset;
  const xmax = view.x1 - inset;
  const ymin = view.y0 + inset;
  const ymax = view.y1 - inset;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const tx = Math.abs(ux) < 1e-9 ? Infinity : ((ux > 0 ? xmax : xmin) - target.cx) / ux;
  const ty = Math.abs(uy) < 1e-9 ? Infinity : ((uy > 0 ? ymax : ymin) - target.cy) / uy;
  const t = Math.max(0, Math.min(tx, ty));
  const px = Math.min(xmax, Math.max(xmin, target.cx + ux * t));
  const py = Math.min(ymax, Math.max(ymin, target.cy + uy * t));
  return { px: Math.round(px), py: Math.round(py) };
}

/** 프레임 둘레 매개변수: 좌상단에서 시계 방향 (상단→우측→하단→좌측) */
function perimeterToS(view: ViewRect, p: { px: number; py: number }, inset: number): number {
  const xmin = view.x0 + inset;
  const xmax = view.x1 - inset;
  const ymin = view.y0 + inset;
  const ymax = view.y1 - inset;
  const w = xmax - xmin;
  const h = ymax - ymin;
  const dTop = Math.abs(p.py - ymin);
  const dBottom = Math.abs(p.py - ymax);
  const dLeft = Math.abs(p.px - xmin);
  const dRight = Math.abs(p.px - xmax);
  const m = Math.min(dTop, dBottom, dLeft, dRight);
  if (m === dTop) return p.px - xmin;
  if (m === dRight) return w + (p.py - ymin);
  if (m === dBottom) return w + h + (xmax - p.px);
  return 2 * w + h + (ymax - p.py);
}

function perimeterFromS(view: ViewRect, sRaw: number, inset: number): { px: number; py: number } {
  const xmin = view.x0 + inset;
  const xmax = view.x1 - inset;
  const ymin = view.y0 + inset;
  const ymax = view.y1 - inset;
  const w = xmax - xmin;
  const h = ymax - ymin;
  const total = 2 * (w + h);
  const s = ((sRaw % total) + total) % total;
  if (s < w) return { px: Math.round(xmin + s), py: Math.round(ymin) };
  if (s < w + h) return { px: Math.round(xmax), py: Math.round(ymin + (s - w)) };
  if (s < 2 * w + h) return { px: Math.round(xmax - (s - w - h)), py: Math.round(ymax) };
  return { px: Math.round(xmin), py: Math.round(ymax - (s - 2 * w - h)) };
}

export interface EdgeMarkerRequest { index: number; angle: number }

/**
 * 뷰 밖 POI의 가장자리 마커 위치 산출.
 * 방향선이 프레임과 만나는 점에 두되, 이미 놓인 마커(occupied)나 다른 가장자리 마커와 겹치면 둘레를 따라 가장 가까운 빈 자리로 이동한다.
 * 번호순(index) 처리 — 결정적.
 */
export function placeEdgeMarkers(
  requests: ReadonlyArray<EdgeMarkerRequest>,
  view: ViewRect,
  target: { cx: number; cy: number },
  occupied: ReadonlyArray<{ px: number; py: number }>,
  inset = EDGE_INSET_PX,
): Map<number, { px: number; py: number }> {
  const minGap = POI_MARKER_R * 2 + 6;
  const taken: Array<{ px: number; py: number }> = [...occupied];
  const out = new Map<number, { px: number; py: number }>();
  const collides = (p: { px: number; py: number }) => taken.some(o => Math.hypot(o.px - p.px, o.py - p.py) < minGap);
  const w = view.x1 - view.x0 - 2 * inset;
  const h = view.y1 - view.y0 - 2 * inset;
  const total = 2 * (Math.max(0, w) + Math.max(0, h));
  const maxSteps = Math.max(1, Math.ceil(total / minGap));
  for (const r of [...requests].sort((a, b) => a.index - b.index)) {
    const base = edgeAnchorPoint(view, target, r.angle, inset);
    let chosen = base;
    if (collides(base)) {
      const s0 = perimeterToS(view, base, inset);
      let found: { px: number; py: number } | null = null;
      for (let k = 1; k <= maxSteps && !found; k++) {
        for (const sign of [1, -1]) {
          const cand = perimeterFromS(view, s0 + sign * k * minGap, inset);
          if (!collides(cand)) {
            found = cand;
            break;
          }
        }
      }
      if (found) chosen = found;
    }
    taken.push(chosen);
    out.set(r.index, chosen);
  }
  return out;
}

/** 가장자리 마커 방향 화살표 (마커 바깥쪽 삼각형) — 폰트 무관 벡터 */
export function edgeArrowSvg(cx: number, cy: number, angle: number, fill: string): string {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;
  const r0 = POI_MARKER_R + 1;
  const r1 = POI_MARKER_R + 12;
  const hw = 7;
  const bx = cx + ux * r0;
  const by = cy + uy * r0;
  const pts = [
    [bx + nx * hw, by + ny * hw],
    [bx - nx * hw, by - ny * hw],
    [cx + ux * r1, cy + uy * r1],
  ].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return `<polygon points="${pts}" fill="${fill}" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"/>`;
}

/** 전체 캔버스 크기 단일 SVG 레이어 (composite left/top=0 → Rule 61 정수 좌표 이슈 원천 차단) */
export function buildNumberedPoiLayer(placed: PlacedPoi[], canvasW: number, canvasH: number): Buffer | null {
  if (placed.length === 0) return null;
  const body = placed.map(p => {
    const fill = poiMarkerFill(p.poi.kind);
    const arrow = p.edgeAngle != null ? edgeArrowSvg(p.px, p.py, p.edgeAngle, fill) : '';
    return arrow + numberedMarkerSvg(p.px, p.py, p.poi.index, fill);
  }).join('');
  return Buffer.from(`<svg width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`);
}

/** 본건 골드 핀 (텍스트/별 문자 없음 — 라벨은 네이티브 '본건') */
export function buildTargetPinSvg(filterId = 'goldhalo'): Buffer {
  return Buffer.from(`
    <svg width="${TARGET_PIN.w}" height="${TARGET_PIN.h}" viewBox="0 0 ${TARGET_PIN.w} ${TARGET_PIN.h}" xmlns="http://www.w3.org/2000/svg">
      <filter id="${filterId}" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1" stdDeviation="3.5" flood-color="#FFFFFF" flood-opacity="0.9"/>
        <feDropShadow dx="1" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.5"/>
      </filter>
      <g filter="url(#${filterId})">
        <path d="M40 6 C27 6 16 17 16 30 C16 48 40 72 40 72 C40 72 64 48 64 30 C64 17 53 6 40 6 Z" fill="#B8860B" stroke="#FFFFFF" stroke-width="3"/>
        <circle cx="40" cy="30" r="11" fill="#132A3A"/>
        <circle cx="40" cy="30" r="4.5" fill="#FFFFFF"/>
      </g>
    </svg>
  `);
}

/** 도보 반경 원: 캔버스에 들어가는 가장 큰 분(5 → 3) 선택. 들어가지 않으면 null */
export function chooseWalkCircle(metersPerPx: number, canvasH: number): { minutes: number; radiusM: number; radiusPx: number } | null {
  if (!(metersPerPx > 0)) return null;
  for (const minutes of [5, 3]) {
    const radiusM = minutes * 80;
    const radiusPx = Math.round(radiusM / metersPerPx);
    if (radiusPx <= Math.floor(canvasH / 2 - 30)) return { minutes, radiusM, radiusPx };
  }
  return null;
}

/** 도보 반경 원 SVG (ASCII 라벨 "Nmin") */
export function buildWalkCircleSvg(canvasW: number, canvasH: number, cx: number, cy: number, radiusPx: number, minutes: number): Buffer {
  return Buffer.from(`
    <svg width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${cx}" cy="${cy}" r="${radiusPx}" fill="rgba(184, 134, 11, 0.07)" stroke="#B8860B" stroke-width="1.8" stroke-dasharray="8,5"/>
      <rect x="${cx - 30}" y="${cy - radiusPx - 1}" width="60" height="20" rx="4" fill="#B8860B" opacity="0.9"/>
      <text x="${cx}" y="${cy - radiusPx + 13}" font-size="11" font-weight="bold" fill="#FFFFFF" text-anchor="middle" font-family="Arial">${minutes}min</text>
    </svg>
  `);
}

/** 줌 하한 — 뷰 정책: 앵커 랜드마크를 보여주기 위해서라도 1.0 아래로는 내리지 않는다 */
export const MIN_LOCATION_ZOOM = 1.0;
/** 앵커 랜드마크로 간주하는 최대 거리 (m) */
export const ANCHOR_LANDMARK_MAX_M = 1000;

/**
 * 확대 배율 결정: 요청 배율(기본 1.5)을 우선하되
 *  (a) 최근접 역이 뷰 밖이면 1.0까지 낮춘다.
 *  (b) 1km 이내 앵커 랜드마크(extraTargets)가 뷰 밖이면, 1.0 이상 배율에서 뷰 안으로 들어올 때에 한해 배율을 낮춘다.
 *      1.0 으로도 들어오지 못하는 랜드마크는 무시한다(가장자리 마커 + 방향 범례로 표시).
 * @param nearestStation 본건 기준 역의 동/북 방향 변위(m)
 * @param extraTargets 본건 기준 앵커 랜드마크 변위(m) 목록
 */
export function chooseLocationZoom(
  requestedZoom: number,
  canvasW: number,
  canvasH: number,
  nearestStation?: { dxM: number; dyM: number } | null,
  marginPx = 48,
  extraTargets?: ReadonlyArray<{ dxM: number; dyM: number }> | null,
): number {
  const maxZoom = Math.max(MIN_LOCATION_ZOOM, requestedZoom);
  const zoomToFit = (t: { dxM: number; dyM: number }): number => {
    const zx = Math.abs(t.dxM) > 0 ? (canvasW / 2 - marginPx) / Math.abs(t.dxM) : Infinity;
    const zy = Math.abs(t.dyM) > 0 ? (canvasH / 2 - marginPx) / Math.abs(t.dyM) : Infinity;
    return Math.min(zx, zy);
  };
  let zoom = maxZoom;
  if (nearestStation) zoom = Math.min(zoom, zoomToFit(nearestStation));
  for (const t of extraTargets ?? []) {
    const z = zoomToFit(t);
    // 하한(1.0)에서도 못 들어오는 타깃은 줌 결정에서 제외 (가장자리 마커로 표시)
    if (z >= MIN_LOCATION_ZOOM) zoom = Math.min(zoom, z);
  }
  return Math.max(MIN_LOCATION_ZOOM, zoom);
}
