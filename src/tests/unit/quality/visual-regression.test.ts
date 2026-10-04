import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { diffImages } from '@/domain/building/mobile-im/quality/image-diff';
import {
  auditSlideXml, estimateTextWidthPt, estimateRequiredHeightEmu,
} from '@/domain/building/mobile-im/quality/pptx-geometry-audit';

const solid = (r: number, g: number, b: number, w = 640, h = 360) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } }).png().toBuffer();

describe('H3 image-diff', () => {
  it('동일 이미지: diffRatio 0, bbox null', async () => {
    const a = await solid(10, 20, 30);
    const r = await diffImages(a, a);
    expect(r.diffRatio).toBe(0);
    expect(r.bbox).toBeNull();
  });

  it('완전히 다른 이미지: diffRatio 1', async () => {
    const r = await diffImages(await solid(0, 0, 0), await solid(255, 255, 255));
    expect(r.diffRatio).toBe(1);
  });

  it('허용 오차 이내의 미세 차이는 무시', async () => {
    const r = await diffImages(await solid(100, 100, 100), await solid(110, 108, 112), { channelTolerance: 24 });
    expect(r.diffRatio).toBe(0);
  });

  it('국소 변경: 변경 영역 비율과 bbox 가 정확', async () => {
    const base = await solid(255, 255, 255);
    const patch = await sharp({ create: { width: 64, height: 36, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const changed = await sharp(base).composite([{ input: patch, left: 100, top: 50 }]).png().toBuffer();
    const r = await diffImages(base, changed);
    expect(r.diffPixels).toBe(64 * 36);
    expect(r.bbox).toEqual({ x: 100, y: 50, w: 64, h: 36 });
    expect(r.diffPng.length).toBeGreaterThan(100);
  });

  it('해상도가 달라도 비교 가능 (정규화)', async () => {
    const r = await diffImages(await solid(5, 5, 5, 1280, 720), await solid(5, 5, 5, 640, 360));
    expect(r.diffRatio).toBe(0);
  });
});

const sp = (name: string, x: number, y: number, w: number, h: number, text: string, sz = 1200) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="2" name="${name}"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm></p:spPr>` +
  `<p:txBody><a:bodyPr lIns="91440" tIns="45720"/><a:p><a:r><a:rPr sz="${sz}"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;

const W = 12192000, H = 6858000;

describe('H3 pptx-geometry-audit', () => {
  it('정상 배치: 위반 0', () => {
    const xml = sp('a', 500000, 500000, 4000000, 600000, '정상 텍스트') + sp('b', 500000, 2000000, 4000000, 600000, '두번째');
    expect(auditSlideXml(xml, 1, W, H)).toEqual([]);
  });

  it('경계 이탈은 error', () => {
    const xml = sp('out', 11000000, 500000, 3000000, 600000, '밖으로 나감');
    const v = auditSlideXml(xml, 3, W, H);
    expect(v.some(x => x.id === 'OUT_OF_BOUNDS' && x.severity === 'error' && x.slide === 3)).toBe(true);
  });

  it('긴 텍스트가 작은 상자에 들어가면 TEXT_OVERFLOW warn', () => {
    const long = '임대차 계약 만료 시점과 임차인 구성에 대한 상세한 설명이 매우 길게 이어지는 문장입니다. '.repeat(6);
    const v = auditSlideXml(sp('tight', 500000, 500000, 2000000, 300000, long), 1, W, H);
    expect(v.some(x => x.id === 'TEXT_OVERFLOW' && x.severity === 'warn')).toBe(true);
  });

  it('텍스트 상자가 크게 겹치면 TEXT_OVERLAP warn', () => {
    const xml = sp('a', 500000, 500000, 3000000, 600000, '첫번째 텍스트') + sp('b', 700000, 600000, 3000000, 600000, '두번째 텍스트');
    expect(auditSlideXml(xml, 1, W, H).some(x => x.id === 'TEXT_OVERLAP')).toBe(true);
  });

  it('살짝 닿는 정도는 겹침으로 보지 않음', () => {
    const xml = sp('a', 500000, 500000, 3000000, 600000, '첫번째') + sp('b', 500000, 1090000, 3000000, 600000, '두번째');
    expect(auditSlideXml(xml, 1, W, H).some(x => x.id === 'TEXT_OVERLAP')).toBe(false);
  });

  it('폭 추정: 한글은 전각, 라틴은 0.55em', () => {
    expect(estimateTextWidthPt('가나', 10)).toBe(20);
    expect(estimateTextWidthPt('ab', 10)).toBeCloseTo(11);
  });

  it('높이 추정: 좁은 상자일수록 줄 수 증가', () => {
    const wide = estimateRequiredHeightEmu(['가'.repeat(30)], 12, 8000000, 91440);
    const narrow = estimateRequiredHeightEmu(['가'.repeat(30)], 12, 2000000, 91440);
    expect(narrow).toBeGreaterThan(wide);
  });
});
