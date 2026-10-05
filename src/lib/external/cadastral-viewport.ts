/**
 * @file cadastral-viewport.ts
 * @description 지적도 뷰포트(축척) 산출 — 순수 함수 (외부 I/O 없음).
 *
 * 대상 필지 폴리곤(다필지 합집합)이 이미지 전체 면적의 일정 비율(기본 목표 20%, 하한 15%) 이상을
 * 차지하도록 확대하되, 모든 필지가 여백(margin) 안쪽에 완전히 들어오도록 뷰 크기를 결정합니다.
 * 필지 합집합의 bbox 중심을 이미지 중심에 둡니다.
 *
 * 좌표 단위는 평면 좌표계면 무엇이든 무방합니다(EPSG:3857 등). 면적비/여백비는 축척 불변이므로
 * `unitsPerMeter`는 최소 뷰 폭(m) 하한을 평면 단위로 환산할 때만 사용합니다.
 */

export type PlanarRing = ReadonlyArray<readonly [number, number]>;

export interface ParcelViewportOptions {
  /** 목표 필지 면적 점유율 (기본 0.20) */
  targetCoverage?: number;
  /** 각 변 여백 비율 (뷰 폭/높이 대비, 기본 0.10) — 슬롯 크롭(≈3.3%/변)까지 흡수 */
  marginRatio?: number;
  /** 최소 뷰 폭 (m, 기본 24) — 초소형 필지의 과도한 확대 방지 */
  minViewWidthM?: number;
  /** 평면 단위 / 지상 m (EPSG:3857이면 1/cos(lat)) */
  unitsPerMeter?: number;
}

export interface ParcelViewport {
  /** 뷰 bbox (입력과 동일한 평면 단위) */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  viewW: number;
  viewH: number;
  centerX: number;
  centerY: number;
  /** 필지 폴리곤 면적 합 / 뷰 면적 */
  coverage: number;
  /** 필지 합집합 bbox 면적 / 뷰 면적 */
  bboxCoverage: number;
  /** 모든 필지 정점이 여백 안쪽에 들어오는지 */
  allInside: boolean;
  /** 결정 요인 (디버그) */
  limitedBy: 'coverage' | 'fit' | 'minWidth';
}

/**
 * 신발끈 공식 — 링 면적 (절대값).
 * EPSG:3857 좌표(~1.4e7)를 그대로 곱하면 x1*y2 - x2*y1 항의 상쇄 오차(catastrophic cancellation)로
 * 중심이 필지 밖으로 튀므로, 첫 정점 기준 로컬 원점으로 평행이동 후 계산합니다.
 */
export function ringArea(ring: PlanarRing): number {
  const n = ring.length;
  if (n < 3) return 0;
  const [ox, oy] = ring[0];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const x1 = ring[i][0] - ox, y1 = ring[i][1] - oy;
    const j = (i + 1) % n;
    const x2 = ring[j][0] - ox, y2 = ring[j][1] - oy;
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/** 면적 가중 중심 (링 합집합; 겹침 없음 가정). 면적이 0이면 정점 평균. 로컬 원점 기준 계산(정밀도). */
export function ringsCentroid(rings: ReadonlyArray<PlanarRing>): { x: number; y: number } | null {
  const first = rings.find(r => r && r.length > 0);
  if (!first) return null;
  const [ox, oy] = first[0];
  let a = 0, cx = 0, cy = 0, n = 0, sx = 0, sy = 0;
  for (const ring of rings) {
    let ra = 0, rcx = 0, rcy = 0;
    for (let i = 0, len = ring.length; i < len; i++) {
      const x1 = ring[i][0] - ox, y1 = ring[i][1] - oy;
      const j = (i + 1) % len;
      const x2 = ring[j][0] - ox, y2 = ring[j][1] - oy;
      const cross = x1 * y2 - x2 * y1;
      ra += cross;
      rcx += (x1 + x2) * cross;
      rcy += (y1 + y2) * cross;
      sx += x1; sy += y1; n++;
    }
    ra /= 2;
    if (Math.abs(ra) > 0) {
      // 링 방향(CW/CCW)과 무관하게 면적 가중: (rcx / 6ra) * |ra|
      cx += (rcx / (6 * ra)) * Math.abs(ra);
      cy += (rcy / (6 * ra)) * Math.abs(ra);
      a += Math.abs(ra);
    }
  }
  if (a > 0) return { x: ox + cx / a, y: oy + cy / a };
  return n > 0 ? { x: ox + sx / n, y: oy + sy / n } : null;
}
/**
 * 필지 링(평면 좌표)과 이미지 크기로 뷰포트를 산출합니다.
 * @returns 필지가 없거나 비정상 좌표면 null (호출부는 반경 기반 폴백 사용)
 */
export function computeParcelViewport(
  rings: ReadonlyArray<PlanarRing>,
  imgW: number,
  imgH: number,
  options: ParcelViewportOptions = {},
): ParcelViewport | null {
  const valid = (rings ?? []).filter(r => Array.isArray(r) && r.length >= 3
    && r.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])));
  if (valid.length === 0 || !(imgW > 0) || !(imgH > 0)) return null;

  const target = Math.min(0.6, Math.max(0.05, options.targetCoverage ?? 0.2));
  const margin = Math.min(0.3, Math.max(0, options.marginRatio ?? 0.1));
  const unitsPerMeter = options.unitsPerMeter && options.unitsPerMeter > 0 ? options.unitsPerMeter : 1;
  const minViewW = (options.minViewWidthM ?? 24) * unitsPerMeter;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of valid) for (const [x, y] of r) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const bw = Math.max(maxX - minX, 1e-6);
  const bh = Math.max(maxY - minY, 1e-6);
  const bboxArea = bw * bh;
  // 필지 겹침(중복 링) 시 과대 계상 방지 — bbox 면적 상한
  const area = Math.min(valid.reduce((s, r) => s + ringArea(r), 0), bboxArea);

  const aspect = imgW / imgH;
  const usable = 1 - 2 * margin;
  const fitW = Math.max(bw, bh * aspect) / usable;
  const coverageW = area > 0 ? Math.sqrt((area * aspect) / target) : 0;

  let viewW = Math.max(fitW, coverageW, minViewW);
  let limitedBy: ParcelViewport['limitedBy'] = 'coverage';
  if (viewW === fitW && fitW >= coverageW) limitedBy = 'fit';
  if (viewW === minViewW && minViewW > Math.max(fitW, coverageW)) limitedBy = 'minWidth';
  if (!Number.isFinite(viewW) || viewW <= 0) return null;
  const viewH = viewW / aspect;

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const vMinX = centerX - viewW / 2;
  const vMaxX = centerX + viewW / 2;
  const vMinY = centerY - viewH / 2;
  const vMaxY = centerY + viewH / 2;

  const mX = viewW * margin * 0.999;
  const mY = viewH * margin * 0.999;
  const allInside = minX >= vMinX + mX - 1e-9 && maxX <= vMaxX - mX + 1e-9
    && minY >= vMinY + mY - 1e-9 && maxY <= vMaxY - mY + 1e-9;

  return {
    minX: vMinX,
    minY: vMinY,
    maxX: vMaxX,
    maxY: vMaxY,
    viewW,
    viewH,
    centerX,
    centerY,
    coverage: area / (viewW * viewH),
    bboxCoverage: bboxArea / (viewW * viewH),
    allInside,
    limitedBy,
  };
}
