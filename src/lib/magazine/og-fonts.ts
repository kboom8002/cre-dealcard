/**
 * OG/이미지 라우트용 한글 폰트 로더 (C-04, M2-25)
 *
 * 외부 CDN fetch(404 `Fallback font fetch failed`)를 제거하고, 번들된 Noto Sans KR 을 읽는다.
 * 탐색 순서 (처음 성공한 것 사용, 결과는 프로세스 단위로 캐시):
 *   1) env `MAGAZINE_OG_FONT_PATH` (절대경로, 로컬 검증/운영 오버라이드용)
 *   2) `public/fonts/NotoSansKR-{Regular,Bold}.{ttf,otf,woff}` (fs.readFile)
 *   3) `${APP_BASE_URL}/fonts/...` 정적 자산 fetch (Vercel 함수 번들에 public 이 없을 때; 동적 라우트 자기호출 아님)
 * 모두 실패하면 `hasKorean=false` 로 반환하고, 호출부는 `latinSafe()` 로 한글을 걸러
 * 한글 깨짐(□) 대신 영문/숫자만이라도 렌더한다.
 */
import { promises as fs } from 'fs';
import path from 'path';

export interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: 'normal';
}

export interface LoadedFonts {
  fonts: OgFont[];
  hasKorean: boolean;
  /** 어떤 경로로 로드했는지 (진단용) */
  source: 'env' | 'public' | 'static-fetch' | 'none';
}

const FONT_FAMILY = 'Noto Sans KR';
const EXTS = ['.ttf', '.otf', '.woff'] as const;
const FILES: { base: string; weight: 400 | 700 }[] = [
  { base: 'NotoSansKR-Regular', weight: 400 },
  { base: 'NotoSansKR-Bold', weight: 700 },
];

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function tryRead(file: string): Promise<ArrayBuffer | null> {
  try {
    return toArrayBuffer(await fs.readFile(file));
  } catch {
    return null;
  }
}

async function tryFetch(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (type.includes('text/html')) return null; // SPA/404 페이지 방지
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

async function loadFromEnv(): Promise<OgFont[] | null> {
  const p = process.env.MAGAZINE_OG_FONT_PATH?.trim();
  if (!p) return null;
  const data = await tryRead(p);
  if (!data) return null;
  // 단일 파일을 두 굵기에 같이 등록 (가변 폰트/단일 굵기 모두 허용)
  return [
    { name: FONT_FAMILY, data, weight: 400, style: 'normal' },
    { name: FONT_FAMILY, data, weight: 700, style: 'normal' },
  ];
}

async function loadFromPublic(): Promise<OgFont[] | null> {
  const dir = path.join(process.cwd(), 'public', 'fonts');
  const out: OgFont[] = [];
  for (const f of FILES) {
    for (const ext of EXTS) {
      const data = await tryRead(path.join(dir, f.base + ext));
      if (data) {
        out.push({ name: FONT_FAMILY, data, weight: f.weight, style: 'normal' });
        break;
      }
    }
  }
  return out.length ? out : null;
}

async function loadFromStaticFetch(): Promise<OgFont[] | null> {
  const base = process.env.APP_BASE_URL?.trim();
  if (!base || !/^https?:\/\//.test(base)) return null; // localhost 폴백 금지 (S2-24)
  const out: OgFont[] = [];
  for (const f of FILES) {
    for (const ext of EXTS) {
      const data = await tryFetch(`${base.replace(/\/$/, '')}/fonts/${f.base}${ext}`);
      if (data) {
        out.push({ name: FONT_FAMILY, data, weight: f.weight, style: 'normal' });
        break;
      }
    }
  }
  return out.length ? out : null;
}

/**
 * satori(@vercel/og)는 가변(variable) 폰트의 fvar 테이블을 파싱하다 예외가 난다
 * (예: Windows 의 NotoSansKR-VF.ttf). 라우트가 500 이 되지 않도록 실제로 한 번 그려 본다.
 */
export async function probeFonts(fonts: OgFont[]): Promise<boolean> {
  try {
    const { ImageResponse } = await import('next/og');
    const React = await import('react');
    const res = new ImageResponse(
      React.createElement('div', { style: { display: 'flex', fontFamily: FONT_FAMILY } }, '가A1'),
      { width: 32, height: 32, fonts },
    );
    const bytes = await res.arrayBuffer();
    return bytes.byteLength > 0;
  } catch (err) {
    console.warn('[og-fonts] 폰트 검증 실패 — 사용하지 않습니다 (정적 TTF/OTF 필요):', (err as Error)?.message);
    return false;
  }
}

let cached: Promise<LoadedFonts> | null = null;

export function loadOgFonts(): Promise<LoadedFonts> {
  if (!cached) {
    cached = (async (): Promise<LoadedFonts> => {
      const sources: [LoadedFonts['source'], () => Promise<OgFont[] | null>][] = [
        ['env', loadFromEnv],
        ['public', loadFromPublic],
        ['static-fetch', loadFromStaticFetch],
      ];
      for (const [source, load] of sources) {
        const fonts = await load();
        if (fonts && (await probeFonts(fonts))) return { fonts, hasKorean: true, source };
      }
      console.warn(
        '[og-fonts] 사용 가능한 한글 폰트가 없습니다 (public/fonts/NotoSansKR-{Regular,Bold}.ttf 정적 폰트 필요). 영문/숫자만 렌더합니다.',
      );
      return { fonts: [], hasKorean: false, source: 'none' };
    })();
  }
  return cached;
}

/** 테스트용: 캐시 초기화 */
export function resetOgFontCache() {
  cached = null;
}

/**
 * 한글 폰트가 없을 때 satori 가 □ 로 그리는 문자를 제거한다.
 * 허용: ASCII + Latin-1 + 일반 문장부호. 결과가 비면 latinFallback 을 쓴다.
 */
export function latinSafe(text: string, hasKorean: boolean, latinFallback = ''): string {
  if (hasKorean) return text;
  const cleaned = text
    .replace(/[^\u0020-\u007E\u00A0-\u00FF\u2010-\u2027\u2030-\u205E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /[A-Za-z0-9]/.test(cleaned) ? cleaned : latinFallback;
}
