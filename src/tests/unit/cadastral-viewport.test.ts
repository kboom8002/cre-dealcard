import { describe, it, expect } from 'vitest';
import { computeParcelViewport, ringArea, ringsCentroid, type PlanarRing } from '@/lib/external/cadastral-viewport';
import { centerCropToAspect } from '@/lib/external/map-overlay-meta';

const rect = (x: number, y: number, w: number, h: number): PlanarRing => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];

const W = 1120;
const H = 840;

/** 모든 링 정점이 (크롭 후) 뷰 안쪽에 있는지 */
function insideAfterCrop(rings: PlanarRing[], vp: NonNullable<ReturnType<typeof computeParcelViewport>>, slotAspect: number): boolean {
  const crop = centerCropToAspect(W, H, slotAspect);
  for (const r of rings) for (const [x, y] of r) {
    const px = ((x - vp.minX) / vp.viewW) * W;
    const py = ((vp.maxY - y) / vp.viewH) * H;
    if (px < crop.left || px > crop.left + crop.width || py < crop.top || py > crop.top + crop.height) return false;
  }
  return true;
}

describe('cadastral-viewport (필지 맞춤 축척)', () => {
  it('p5형 3필지(합계 ≈518.7㎡): 합집합 점유율 ≥15%, 전 필지 여백 내, 중앙 정렬', () => {
    // 인접 3필지 (m 단위 평면): 15×12 + 13×13.4 + 12×13.708 ≈ 518.7㎡
    const rings = [rect(0, 0, 15, 12), rect(15, 0, 13, 13.4), rect(0, 12, 12, 13.708)];
    const total = rings.reduce((s, r) => s + ringArea(r), 0);
    expect(total).toBeCloseTo(518.7, 0);
    const vp = computeParcelViewport(rings, W, H, { targetCoverage: 0.2, marginRatio: 0.1 })!;
    expect(vp).not.toBeNull();
    expect(vp.coverage).toBeGreaterThanOrEqual(0.15);
    expect(vp.allInside).toBe(true);
    // 종횡비 유지
    expect(vp.viewW / vp.viewH).toBeCloseTo(W / H, 6);
    // 합집합 bbox 중심 = 뷰 중심
    expect(vp.centerX).toBeCloseTo(14, 6);
    expect(vp.centerY).toBeCloseTo(12.854, 6);
    expect((vp.minX + vp.maxX) / 2).toBeCloseTo(vp.centerX, 6);
    // A06 슬롯(5.60×4.50) 중앙 크롭 후에도 전 필지 포함
    expect(insideAfterCrop(rings, vp, 5.6 / 4.5)).toBe(true);
  });

  it('떨어진 다필지: 맞춤(fit) 우선 — 모든 필지 포함 (점유율은 목표 이상일 수 있음)', () => {
    const rings = [rect(0, 0, 10, 10), rect(60, 25, 10, 10), rect(30, -10, 8, 8)];
    const vp = computeParcelViewport(rings, W, H)!;
    expect(vp.limitedBy).toBe('fit');
    expect(vp.allInside).toBe(true);
    expect(insideAfterCrop(rings, vp, 5.6 / 4.5)).toBe(true);
  });

  it('길쭉한 필지: 짧은 축이 아닌 긴 축 기준 맞춤', () => {
    const rings = [rect(0, 0, 80, 6)];
    const vp = computeParcelViewport(rings, W, H)!;
    expect(vp.allInside).toBe(true);
    expect(vp.viewW).toBeGreaterThanOrEqual(80 / 0.8 - 1e-6);
  });

  it('일반 단필지(500㎡ 정방형): 목표 20% 근방', () => {
    const s = Math.sqrt(500);
    const vp = computeParcelViewport([rect(100, 200, s, s)], W, H, { targetCoverage: 0.2 })!;
    expect(vp.limitedBy).toBe('coverage');
    expect(vp.coverage).toBeCloseTo(0.2, 3);
    expect(vp.allInside).toBe(true);
  });

  it('EPSG:3857 단위(1/cos(lat) 배율)에서도 면적비는 축척 불변', () => {
    const k = 1 / Math.cos(37.54 * Math.PI / 180);
    const s = 20;
    const vpM = computeParcelViewport([rect(0, 0, s, s)], W, H)!;
    const vpU = computeParcelViewport([rect(0, 0, s * k, s * k)], W, H, { unitsPerMeter: k })!;
    expect(vpU.coverage).toBeCloseTo(vpM.coverage, 6);
    expect(vpU.viewW / k).toBeCloseTo(vpM.viewW, 6);
  });

  it('초소형 필지: 최소 뷰 폭(24m) 하한', () => {
    const vp = computeParcelViewport([rect(0, 0, 3, 3)], W, H, { minViewWidthM: 24 })!;
    expect(vp.limitedBy).toBe('minWidth');
    expect(vp.viewW).toBeCloseTo(24, 6);
    expect(vp.allInside).toBe(true);
  });

  it('비정상 입력은 null (호출부 반경 폴백)', () => {
    expect(computeParcelViewport([], W, H)).toBeNull();
    expect(computeParcelViewport([[[0, 0], [1, 1]]], W, H)).toBeNull();
    expect(computeParcelViewport([rect(0, 0, 10, 10)], 0, H)).toBeNull();
  });

  it('EPSG:3857 대좌표(~1.4e7)에서도 중심/면적 정밀도 유지 (상쇄 오차 회귀)', () => {
    const ox = 14125840.957474878, oy = 4514304.741783071;
    const rings = [rect(ox + 20, oy + 5, 20, 20), rect(ox, oy + 5, 20, 20), rect(ox + 10, oy + 25, 8, 3.7)];
    const c = ringsCentroid(rings)!;
    expect(ringArea(rings[0])).toBeCloseTo(400, 6);
    // 400@(30,15) + 400@(10,15) + 29.6@(14,26.85)
    const a = 400 + 400 + 29.6;
    expect(c.x - ox).toBeCloseTo((400 * 30 + 400 * 10 + 29.6 * 14) / a, 4);
    expect(c.y - oy).toBeCloseTo((400 * 15 + 400 * 15 + 29.6 * 26.85) / a, 4);
  });

  it('면적 가중 중심', () => {
    const c = ringsCentroid([rect(0, 0, 10, 10), rect(10, 0, 30, 10)])!;
    // 100㎡@(5,5) + 300㎡@(25,5) → (20,5)
    expect(c.x).toBeCloseTo(20, 6);
    expect(c.y).toBeCloseTo(5, 6);
  });
});
