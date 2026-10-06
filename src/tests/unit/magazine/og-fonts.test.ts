/**
 * OG 폰트 로더 (C-04): korean + latin 동반 로드, cmap 글리프 커버리지, 누락 글리프 제거 정책.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import path from 'path';
import { latinSafe, loadOgFonts, parseFontCoverage, resetOgFontCache, unionCoverage, type LoadedFonts } from '@/lib/magazine/og-fonts';

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts');
const hasBundledFonts = existsSync(path.join(FONT_DIR, 'NotoSansKR-Regular.woff')) && existsSync(path.join(FONT_DIR, 'NotoSansKR-Latin-Regular.woff'));

describe.runIf(hasBundledFonts)('번들된 Noto Sans KR (korean + latin)', () => {
  let loaded: LoadedFonts;
  beforeAll(async () => {
    delete process.env.MAGAZINE_OG_FONT_PATH;
    resetOgFontCache();
    loaded = await loadOgFonts();
  }, 60_000);

  it('public 에서 korean·latin 4개 폰트를 같은 family 로 로드, hasKorean=true', () => {
    expect(loaded.source).toBe('public');
    expect(loaded.hasKorean).toBe(true);
    expect(loaded.fonts).toHaveLength(4);
    expect(new Set(loaded.fonts.map((f) => f.name)).size).toBe(1);
    expect(loaded.fonts.filter((f) => f.weight === 400)).toHaveLength(2);
    expect(loaded.fonts.filter((f) => f.weight === 700)).toHaveLength(2);
  });

  it('글리프 커버리지: 한글·숫자·퍼센트·괄호가 모두 그려진다', () => {
    const g = loaded.glyphs;
    expect(g).not.toBeNull();
    for (const ch of '가강남2026년9월시장점검9.4%(YoY)CAP') expect(g!.has(ch.codePointAt(0)!)).toBe(true);
  });

  it('번들 korean 서브셋은 완성형 한글 11,172자를 모두 포함 (희귀 음절 누락 없음)', () => {
    const g = loaded.glyphs!;
    let missing = 0;
    for (let cp = 0xac00; cp <= 0xd7a3; cp++) if (!g.has(cp)) missing++;
    expect(missing).toBe(0);
  });

  it('폰트에 없는 문자(한자·이모지 등)는 제거되고 나머지는 그대로 (□ 대신 안전 처리)', () => {
    expect(latinSafe('시장漢점검 9.4%', true, 'Market', loaded.glyphs)).toBe('시장점검 9.4%');
    expect(latinSafe('漢', true, 'Market', loaded.glyphs)).toBe('Market');
  });
  it('모두 지원되는 문장은 원문 그대로 반환', () => {
    expect(latinSafe('2026년 9월 시장 점검 9.4%', true, '', loaded.glyphs)).toBe('2026년 9월 시장 점검 9.4%');
  });

  it('이모지는 제거된다 (외부 이모지 CDN 호출·tofu 방지)', () => {
    expect(latinSafe('강남 🔥 급매', true, '', loaded.glyphs)).toBe('강남 급매');
  });
});

describe('커버리지 파서 / latinSafe 기본 동작', () => {
  it('파싱할 수 없는 데이터는 null (필터링하지 않음)', () => {
    expect(parseFontCoverage(new ArrayBuffer(8))).toBeNull();
    expect(unionCoverage([{ name: 'x', data: new ArrayBuffer(8), weight: 400, style: 'normal' }])).toBeNull();
  });

  it('glyphs 가 없으면(hasKorean=true) 원문 유지, hasKorean=false 면 라틴만', () => {
    expect(latinSafe('강남 9.4%', true)).toBe('강남 9.4%');
    expect(latinSafe('강남 9.4%', false)).toBe('9.4%');
    expect(latinSafe('강남', false, 'Market')).toBe('Market');
  });
});

describe('누락 글리프 정책 (합성 커버리지)', () => {
  // '시장점검' + 숫자/기호만 그릴 수 있는 폰트라고 가정
  const cov = new Set([...'시장점검 9.4%0123456789'].map((c) => c.codePointAt(0)!));

  it('희귀 음절은 해당 글자만 제거하고 공백을 정리한다', () => {
    expect(latinSafe('시장꿻점검 9.4%', true, 'Market', cov)).toBe('시장점검 9.4%');
    expect(latinSafe('시장 꿻 점검', true, 'Market', cov)).toBe('시장 점검');
  });

  it('남는 글자·숫자가 없으면 영문 폴백, 모두 지원되면 원문 그대로', () => {
    expect(latinSafe('꿻꿻', true, 'Market', cov)).toBe('Market');
    expect(latinSafe('시장점검 9.4%', true, 'Market', cov)).toBe('시장점검 9.4%');
  });
});
