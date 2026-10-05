import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  embedMapMarkerMeta,
  readMapMarkerMeta,
  embedPngText,
  readPngText,
  centerCropToAspect,
  normToSlot,
} from '@/lib/external/map-overlay-meta';
import {
  digitGlyph,
  buildNumberedPoiLayer,
  buildTargetPinSvg,
  chooseWalkCircle,
  chooseLocationZoom,
} from '@/domain/building/mobile-im/pptx/utils/location-map-overlay';
import type { SelectedPoi } from '@/domain/building/mobile-im/pptx/location-poi-selector';

async function tinyPng(w = 40, h = 30): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 200, g: 100, b: 50, alpha: 1 } } }).png().toBuffer();
}

describe('map-overlay-meta (PNG tEXt 마커 메타)', () => {
  it('embed → read 왕복 + 이미지 디코딩 무결성', async () => {
    const png = await tinyPng();
    const out = embedMapMarkerMeta(png, { v: 1, target: { x: 0.5123, y: 0.4321 }, imgW: 40, imgH: 30 });
    const meta = readMapMarkerMeta(`data:image/png;base64,${out.toString('base64')}`);
    expect(meta?.target).toEqual({ x: 0.5123, y: 0.4321 });
    expect(meta?.imgW).toBe(40);
    const md = await sharp(out).metadata();
    expect(md.width).toBe(40);
    expect(md.height).toBe(30);
    // Buffer 입력도 지원
    expect(readMapMarkerMeta(out)?.target?.x).toBe(0.5123);
  });

  it('비PNG/메타 없음/손상 → null 또는 원본 유지', async () => {
    const notPng = Buffer.from('fake-image-buffer');
    expect(embedPngText(notPng, 'k', 'v')).toBe(notPng);
    expect(readPngText(notPng, 'k')).toBeNull();
    expect(readMapMarkerMeta(await tinyPng())).toBeNull();
    expect(readMapMarkerMeta('image/jpeg;base64,/9j/4AAQ')).toBeNull();
    const bad = embedPngText(await tinyPng(), 'credeal:map-marker', '{"v":1,"target":{"x":3,"y":0}}');
    expect(readMapMarkerMeta(bad)).toBeNull();
  });

  it('슬롯 중앙 크롭 + 정규화 좌표 → 슬라이드 인치', () => {
    const crop = centerCropToAspect(1120, 840, 5.6 / 4.5);
    expect(crop.top).toBe(0);
    expect(crop.height).toBe(840);
    expect(crop.width).toBe(Math.round(840 * 5.6 / 4.5));
    expect(crop.left).toBe(Math.round((1120 - crop.width) / 2));
    const slot = { x: 0.62, y: 1.62, w: 5.6, h: 4.5 };
    const center = normToSlot({ x: 0.5, y: 0.5 }, { w: 1120, h: 840 }, slot, crop)!;
    expect(center.x).toBeCloseTo(0.62 + 2.8, 2);
    expect(center.y).toBeCloseTo(1.62 + 2.25, 6);
    // 크롭 영역 밖 → null
    expect(normToSlot({ x: 0.01, y: 0.5 }, { w: 1120, h: 840 }, slot, crop)).toBeNull();
  });
});

describe('location-map-overlay (폰트 비의존 SVG)', () => {
  const poi = (index: number, kind: SelectedPoi['kind']): SelectedPoi => ({
    index, kind, poiClass: kind === 'station' ? 'station' : 'public_major', displayName: 'X', name: 'X',
    lat: 0, lng: 0, distanceM: 100, walkMinutes: 1, distanceLabel: '도보 1분', label: 'X 도보 1분', reason: '',
  });

  it('번호 마커: <text> 없음(벡터 숫자), 한글 없음, 1~9 글리프', async () => {
    for (let d = 1; d <= 9; d++) expect(digitGlyph(d).length).toBeGreaterThan(10);
    const layer = buildNumberedPoiLayer([
      { poi: poi(1, 'station'), px: 100, py: 100 },
      { poi: poi(2, 'landmark'), px: 300, py: 200 },
    ], 1120, 900)!;
    const svg = layer.toString();
    expect(svg).not.toMatch(/<text/);
    expect(svg).not.toMatch(/[가-힣]/);
    // librsvg 래스터화 가능
    const png = await sharp(layer).png().toBuffer();
    expect((await sharp(png).metadata()).width).toBe(1120);
    expect(buildNumberedPoiLayer([], 10, 10)).toBeNull();
  });

  it('본건 핀: TARGET/별 문자 없음', () => {
    const svg = buildTargetPinSvg().toString();
    expect(svg).not.toMatch(/TARGET/);
    expect(svg).not.toMatch(/<text/);
    expect(svg).not.toMatch(/★/);
  });

  it('도보 반경: 프레임에 맞는 분 선택', () => {
    expect(chooseWalkCircle(1, 900)).toMatchObject({ minutes: 5, radiusM: 400, radiusPx: 400 });
    expect(chooseWalkCircle(1 / 1.5, 900)).toMatchObject({ minutes: 3, radiusM: 240, radiusPx: 360 });
    expect(chooseWalkCircle(0.2, 900)).toBeNull();
  });

  it('확대 배율: 기본 1.5, 최근접 역이 프레임 밖이면 1.0까지 축소', () => {
    expect(chooseLocationZoom(1.5, 1120, 900, null)).toBe(1.5);
    expect(chooseLocationZoom(1.5, 1120, 900, { dxM: -120, dyM: 40 })).toBe(1.5);
    const z = chooseLocationZoom(1.5, 1120, 900, { dxM: 450, dyM: 0 });
    expect(z).toBeLessThan(1.5);
    expect(z).toBeGreaterThanOrEqual(1);
    expect(450 * z).toBeLessThanOrEqual(1120 / 2 - 48 + 1e-6);
    expect(chooseLocationZoom(1.5, 1120, 900, { dxM: 2000, dyM: 0 })).toBe(1);
  });
});
