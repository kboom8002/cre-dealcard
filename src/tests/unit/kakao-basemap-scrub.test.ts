/**
 * Kakao 정적지도 베이스 타일에 구워진 지하철 출구 번호(노란 원 1~8) 제거 — 오프라인(합성 이미지, 네트워크 없음)
 * 사용자 요구: 지도에는 검은/파란 번호(선별 랜드마크, 범례와 일치)만 남고 명칭 없는 노란 번호 마커는 없어야 한다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { scrubExitMarkersRaw, scrubKakaoExitMarkers } from '@/domain/building/mobile-im/pptx/utils/kakao-basemap-scrub';
import { buildNumberedPoiLayer, poiMarkerFill } from '@/domain/building/mobile-im/pptx/utils/location-map-overlay';
import type { SelectedPoi } from '@/domain/building/mobile-im/pptx/location-poi-selector';
import type { LandmarkPool } from '@/lib/external/landmark-pool';

const W = 480;
const H = 360;

/** 출구 마커 모사: 노란 채움(254,246,99) + 짙은 갈색 외곽선 + 벡터 번호 + 연결선 */
function exitMarkerSvg(cx: number, cy: number): string {
  return `<line x1="${cx}" y1="${cy}" x2="${cx + 60}" y2="${cy + 25}" stroke="#4F3727" stroke-width="3"/>`
    + `<circle cx="${cx}" cy="${cy}" r="14.5" fill="#4F3727"/>`
    + `<circle cx="${cx}" cy="${cy}" r="13" fill="rgb(254,246,99)"/>`
    + `<path d="M${cx - 3} ${cy - 6} L${cx + 2} ${cy - 6} L${cx + 2} ${cy + 6}" stroke="#32251A" stroke-width="2.5" fill="none"/>`;
}

async function makeBasemap(markers: Array<[number, number]>) {
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`
    + `<rect width="${W}" height="${H}" fill="rgb(238,238,238)"/>`
    + `<rect x="20" y="300" width="300" height="22" fill="rgb(255,244,176)"/>` // 옅은 노랑 도로 — 유지되어야 함
    + `<rect x="330" y="20" width="90" height="90" fill="rgb(254,246,99)"/>` // 큰 노란 면 — 마커가 아니므로 유지
    + markers.map(([x, y]) => exitMarkerSvg(x, y)).join('')
    + `</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function rawOf(buf: Buffer) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), W: info.width, H: info.height, ch: info.channels };
}

const px = (r: { data: Uint8Array; W: number; ch: number }, x: number, y: number) => {
  const o = (y * r.W + x) * r.ch;
  return [r.data[o], r.data[o + 1], r.data[o + 2]];
};

describe('scrubKakaoExitMarkers', () => {
  const marks: Array<[number, number]> = [[120, 100], [200, 140], [150, 210]];

  it('노란 출구 마커(채움/외곽선/번호/연결선)를 제거하고 주변 색으로 메운다', async () => {
    const src = await makeBasemap(marks);
    const before = await rawOf(src);
    // 사전 조건: 마커 중심 근처가 노란 채움
    expect(px(before, 120 + 7, 100)).toEqual([254, 246, 99]);
    const { buffer, removed } = await scrubKakaoExitMarkers(src);
    expect(removed).toBe(3);
    const after = await rawOf(buffer);
    for (const [x, y] of marks) {
      // 마커 중심/채움/외곽선 자리는 배경(238,238,238) 계열
      for (const [dx, dy] of [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8], [13, 0]]) {
        const [r, g, b] = px(after, x + dx, y + dy);
        expect(Math.abs(r - 238) + Math.abs(g - 238) + Math.abs(b - 238), `marker@${x},${y} d=${dx},${dy}`).toBeLessThan(40);
      }
    }
    // 연결선 중간 지점도 제거
    const [lr, lg, lb] = px(after, 120 + 30, 100 + 12);
    expect(Math.abs(lr - 238) + Math.abs(lg - 238) + Math.abs(lb - 238)).toBeLessThan(60);
  });

  it('마커가 아닌 노란 요소(옅은 노랑 도로, 큰 노란 면)는 건드리지 않는다', async () => {
    const src = await makeBasemap(marks);
    const { buffer } = await scrubKakaoExitMarkers(src);
    const after = await rawOf(buffer);
    expect(px(after, 100, 310)).toEqual([255, 244, 176]);
    expect(px(after, 375, 65)).toEqual([254, 246, 99]);
  });

  it('멱등: 한 번 지운 결과를 다시 돌려도 검출 0 (노란 마커 잔존 없음)', async () => {
    const first = await scrubKakaoExitMarkers(await makeBasemap(marks));
    const raw = await rawOf(first.buffer);
    expect(scrubExitMarkersRaw(raw.data, raw.W, raw.H, raw.ch)).toBe(0);
  });

  it('마커가 없으면 원본 그대로, 깨진 입력이면 예외 없이 원본 반환', async () => {
    const plain = await makeBasemap([]);
    const r1 = await scrubKakaoExitMarkers(plain);
    expect(r1.removed).toBe(0);
    expect(r1.buffer).toBe(plain);
    const junk = Buffer.from('not-an-image');
    const r2 = await scrubKakaoExitMarkers(junk);
    expect(r2.removed).toBe(0);
    expect(r2.buffer).toBe(junk);
  });

  it('오검출 상한: 노란 원이 24개 초과면 건너뜀(실제 지도 훼손 방지)', async () => {
    const many: Array<[number, number]> = [];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) many.push([30 + i * 80, 30 + j * 50]);
    const src = await makeBasemap(many);
    expect((await scrubKakaoExitMarkers(src)).removed).toBe(0);
  });
});

describe('오버레이에는 노란/주황 마커가 없다', () => {
  it('poiMarkerFill 팔레트는 파랑/슬레이트/네이비뿐', () => {
    for (const kind of ['station', 'road', 'landmark'] as const) {
      const hex = poiMarkerFill(kind).replace('#', '');
      const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
      const yellowish = r > 180 && g > 140 && b < 120;
      expect(yellowish, `${kind}:${hex}`).toBe(false);
    }
  });

  it('번호 마커 레이어 SVG 의 채움색에 노랑/주황 계열이 없음', () => {
    const mk = (index: number, kind: SelectedPoi['kind']) => ({
      poi: { index, kind } as SelectedPoi, px: 100 + index * 60, py: 100,
    });
    const svg = buildNumberedPoiLayer([mk(1, 'station'), mk(2, 'landmark'), mk(3, 'road')], 400, 300)!.toString('utf8');
    const fills = [...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map(m => m[1].toLowerCase());
    expect(fills.length).toBeGreaterThan(0);
    for (const f of fills) {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(f.slice(i, i + 2), 16));
      expect(r > 180 && g > 140 && b < 120, f).toBe(false);
    }
  });
});

describe('실제 렌더 경로 (generateStaticMapPlaceholder, Kakao fetch 목킹)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('Kakao 요청에 marker 파라미터가 없고, 출력 지도에 노란 출구 마커가 남지 않으며, 우리 번호 마커만 존재', async () => {
    const pool: LandmarkPool = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'docs/golden-test-data/p5-yangpyeong-income/poi-pool.json'), 'utf8'));
    const mkBase = (markers: Array<[number, number]>) => sharp(Buffer.from(
      `<svg width="1494" height="1200" xmlns="http://www.w3.org/2000/svg"><rect width="1494" height="1200" fill="rgb(238,238,238)"/>`
      + markers.map(([x, y]) => exitMarkerSvg(x, y)).join('')
      + `</svg>`)).png().toBuffer();
    // 출구 마커가 구워진 베이스맵 (2x 해상도 응답 모사) vs 마커 없는 동일 베이스맵(기준선: 본건 골드 핀 등 우리 오버레이의 노랑 계열 픽셀)
    const withMarkers = await mkBase([[557, 492], [630, 475], [658, 525], [685, 578], [552, 601], [607, 612], [528, 541], [650, 560]]);
    const plain = await mkBase([]);
    const urls: string[] = [];
    const prevKey = process.env.KAKAO_REST_API_KEY;
    process.env.KAKAO_REST_API_KEY = 'test-key';
    let current = withMarkers;
    vi.stubGlobal('fetch', vi.fn(async (u: any) => {
      urls.push(String(u));
      return { ok: true, arrayBuffer: async () => current.buffer.slice(current.byteOffset, current.byteOffset + current.byteLength) };
    }));
    const countYellow = async (buf: Buffer) => {
      const out = await rawOf(buf);
      let yellow = 0;
      for (let i = 0; i < out.W * out.H; i++) {
        const r = out.data[i * out.ch];
        const g = out.data[i * out.ch + 1];
        const b = out.data[i * out.ch + 2];
        if (r > 235 && g > 220 && b < 140) yellow++;
      }
      return yellow;
    };
    try {
      const { generateStaticMapPlaceholder } = await import('@/domain/building/mobile-im/pptx/utils/image-optimizer');
      const opts = { posture: 'income', assetType: '오피스빌딩', candidates: pool.candidates };
      current = plain;
      const baseline: any = await generateStaticMapPlaceholder('서울 영등포구 양평동', 1120, 900, pool.center, [], opts);
      current = withMarkers;
      const res: any = await generateStaticMapPlaceholder('서울 영등포구 양평동', 1120, 900, pool.center, [], opts);
      expect(urls.length).toBe(2);
      for (const u of urls) {
        expect(u).toContain('staticmap');
        expect(u).not.toMatch(/marker/i);
      }
      // 출구 마커 8개(원 1개당 ~300px)가 지워져 기준선(우리 오버레이만)과 거의 같아야 한다
      const yBase = await countYellow(baseline.buffer);
      const yWith = await countYellow(res.buffer);
      expect(yWith).toBeLessThanOrEqual(yBase + 10);
      // 범례 번호와 일치하는 우리 마커는 존재 (1..N 연속)
      expect(res.overlayMeta.pois.map((p: any) => p.index)).toEqual(res.overlayMeta.pois.map((_: any, i: number) => i + 1));
    } finally {
      if (prevKey === undefined) delete process.env.KAKAO_REST_API_KEY;
      else process.env.KAKAO_REST_API_KEY = prevKey;
    }
  });
});
