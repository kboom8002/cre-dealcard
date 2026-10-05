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
}

/** 전체 캔버스 크기 단일 SVG 레이어 (composite left/top=0 → Rule 61 정수 좌표 이슈 원천 차단) */
export function buildNumberedPoiLayer(placed: PlacedPoi[], canvasW: number, canvasH: number): Buffer | null {
  if (placed.length === 0) return null;
  const body = placed.map(p => numberedMarkerSvg(p.px, p.py, p.poi.index, poiMarkerFill(p.poi.kind))).join('');
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

/**
 * 확대 배율 결정: 요청 배율(기본 1.5)을 우선하되 최근접 역이 뷰 밖이면 1.0까지 낮춘다.
 * @param nearestStation 본건 기준 역의 동/북 방향 변위(m)
 */
export function chooseLocationZoom(
  requestedZoom: number,
  canvasW: number,
  canvasH: number,
  nearestStation?: { dxM: number; dyM: number } | null,
  marginPx = 48,
): number {
  const maxZoom = Math.max(1, requestedZoom);
  if (!nearestStation) return maxZoom;
  const zx = Math.abs(nearestStation.dxM) > 0 ? (canvasW / 2 - marginPx) / Math.abs(nearestStation.dxM) : Infinity;
  const zy = Math.abs(nearestStation.dyM) > 0 ? (canvasH / 2 - marginPx) / Math.abs(nearestStation.dyM) : Infinity;
  return Math.max(1, Math.min(maxZoom, zx, zy));
}
