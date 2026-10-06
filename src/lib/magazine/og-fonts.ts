/**
 * OG/이미지 라우트용 한글 폰트 로더 (C-04, M2-25)
 *
 * 외부 CDN fetch(404 `Fallback font fetch failed`)를 제거하고, 번들된 Noto Sans KR(OFL)을 읽는다.
 * 탐색 순서 (처음 성공한 것 사용, 결과는 프로세스 단위로 캐시):
 *   1) env `MAGAZINE_OG_FONT_PATH` (절대경로, 로컬 검증/운영 오버라이드용)
 *   2) `public/fonts/NotoSansKR-{Regular,Bold}.{ttf,otf,woff}` + latin 동반 `NotoSansKR-Latin-{Regular,Bold}` (fs.readFile)
 *   3) `${APP_BASE_URL}/fonts/...` 정적 자산 fetch (Vercel 함수 번들에 public 이 없을 때; 동적 라우트 자기호출 아님)
 *
 * 글리프 폴백: korean 서브셋(KS X 1001 수준)에는 숫자·라틴·기호가 없을 수 있어 latin 서브셋을
 * **같은 family 이름으로 함께 등록**한다. satori 는 같은 family·weight 후보를 등록 순서대로 훑으며 글리프가 있는
 * 폰트를 쓴다 → 순서: korean → latin.
 *
 * 누락 글리프 정책(`latinSafe`): 한글 서브셋에 없는 희귀 음절·이모지 등은 □(tofu)로 그려지지 않도록
 * **해당 문자만 제거**한다(공백 정리). 제거 결과에 글자·숫자가 하나도 없으면 호출부가 준 영문 폴백을 쓴다.
 * 폰트가 하나도 없으면(`hasKorean=false`) 영문/숫자/기본 문장부호만 남긴다.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { inflateSync } from 'zlib';

export interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: 'normal';
}

export interface LoadedFonts {
  fonts: OgFont[];
  /** korean 폰트가 성공적으로 로드·검증되면 true */
  hasKorean: boolean;
  /** 로드된 폰트들이 그릴 수 있는 코드포인트 합집합. 파싱 실패 시 null(필터링 안 함). */
  glyphs: ReadonlySet<number> | null;
  /** 어떤 경로로 로드했는지 (진단용) */
  source: 'env' | 'public' | 'static-fetch' | 'none';
}

const FONT_FAMILY = 'Noto Sans KR';
const EXTS = ['.ttf', '.otf', '.woff'] as const;
/** weight 별로 korean → latin 순서 (글리프 폴백 순서) */
const FILES: { base: string; weight: 400 | 700; latin: boolean }[] = [
  { base: 'NotoSansKR-Regular', weight: 400, latin: false },
  { base: 'NotoSansKR-Latin-Regular', weight: 400, latin: true },
  { base: 'NotoSansKR-Bold', weight: 700, latin: false },
  { base: 'NotoSansKR-Latin-Bold', weight: 700, latin: true },
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

/** 로더 결과: 폰트 목록 + korean 포함 여부 */
interface LoadResult {
  fonts: OgFont[];
  korean: boolean;
}

async function loadFromEnv(): Promise<LoadResult | null> {
  const p = process.env.MAGAZINE_OG_FONT_PATH?.trim();
  if (!p) return null;
  const data = await tryRead(p);
  if (!data) return null;
  // 단일 파일을 두 굵기에 같이 등록 (가변 폰트/단일 굵기 모두 허용)
  return {
    fonts: [
      { name: FONT_FAMILY, data, weight: 400, style: 'normal' },
      { name: FONT_FAMILY, data, weight: 700, style: 'normal' },
    ],
    korean: true,
  };
}

async function loadFiles(read: (base: string, ext: string) => Promise<ArrayBuffer | null>): Promise<LoadResult | null> {
  const fonts: OgFont[] = [];
  let korean = false;
  for (const f of FILES) {
    for (const ext of EXTS) {
      const data = await read(f.base, ext);
      if (data) {
        fonts.push({ name: FONT_FAMILY, data, weight: f.weight, style: 'normal' });
        if (!f.latin) korean = true;
        break;
      }
    }
  }
  return fonts.length ? { fonts, korean } : null;
}

async function loadFromPublic(): Promise<LoadResult | null> {
  const dir = path.join(process.cwd(), 'public', 'fonts');
  return loadFiles((base, ext) => tryRead(path.join(dir, base + ext)));
}

async function loadFromStaticFetch(): Promise<LoadResult | null> {
  const base = process.env.APP_BASE_URL?.trim();
  if (!base || !/^https?:\/\//.test(base)) return null; // localhost 폴백 금지 (S2-24)
  const root = base.replace(/\/$/, '');
  return loadFiles((b, ext) => tryFetch(`${root}/fonts/${b}${ext}`));
}

// ─────────────────────────────────────────────────────────────
// 글리프 커버리지 (cmap 파싱) — WOFF(zlib)·TTF/OTF 모두 지원, 실패 시 null
// ─────────────────────────────────────────────────────────────

function readCmapTable(buf: Buffer): Buffer | null {
  const sig = buf.toString('latin1', 0, 4);
  if (sig === 'wOFF') {
    const numTables = buf.readUInt16BE(12);
    for (let i = 0; i < numTables; i++) {
      const e = 44 + i * 20;
      if (buf.toString('latin1', e, e + 4) !== 'cmap') continue;
      const offset = buf.readUInt32BE(e + 4);
      const compLength = buf.readUInt32BE(e + 8);
      const origLength = buf.readUInt32BE(e + 12);
      const raw = buf.subarray(offset, offset + compLength);
      return compLength < origLength ? inflateSync(raw) : Buffer.from(raw);
    }
    return null;
  }
  const numTables = buf.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const e = 12 + i * 16;
    if (buf.toString('latin1', e, e + 4) !== 'cmap') continue;
    const offset = buf.readUInt32BE(e + 8);
    const length = buf.readUInt32BE(e + 12);
    return Buffer.from(buf.subarray(offset, offset + length));
  }
  return null;
}

/** 폰트가 그릴 수 있는 코드포인트 집합. 지원하지 않는 형식이면 null. */
export function parseFontCoverage(data: ArrayBuffer): Set<number> | null {
  try {
    const cmap = readCmapTable(Buffer.from(data));
    if (!cmap) return null;
    const numTables = cmap.readUInt16BE(2);
    const out = new Set<number>();
    let parsedAny = false;
    for (let i = 0; i < numTables; i++) {
      const rec = 4 + i * 8;
      const platform = cmap.readUInt16BE(rec);
      const offset = cmap.readUInt32BE(rec + 4);
      if (platform !== 0 && platform !== 3) continue;
      const format = cmap.readUInt16BE(offset);
      if (format === 4) {
        const segX2 = cmap.readUInt16BE(offset + 6);
        const endBase = offset + 14;
        const startBase = endBase + segX2 + 2;
        const deltaBase = startBase + segX2;
        const rangeBase = deltaBase + segX2;
        for (let s = 0; s < segX2 / 2; s++) {
          const end = cmap.readUInt16BE(endBase + s * 2);
          const start = cmap.readUInt16BE(startBase + s * 2);
          const delta = cmap.readInt16BE(deltaBase + s * 2);
          const rangeOffset = cmap.readUInt16BE(rangeBase + s * 2);
          if (start > end) continue;
          for (let c = start; c <= end; c++) {
            if (c === 0xffff) continue;
            let glyph: number;
            if (rangeOffset === 0) {
              glyph = (c + delta) & 0xffff;
            } else {
              const gAddr = rangeBase + s * 2 + rangeOffset + (c - start) * 2;
              if (gAddr + 2 > cmap.length) continue;
              const g = cmap.readUInt16BE(gAddr);
              glyph = g === 0 ? 0 : (g + delta) & 0xffff;
            }
            if (glyph !== 0) out.add(c);
          }
        }
        parsedAny = true;
      } else if (format === 12) {
        const nGroups = cmap.readUInt32BE(offset + 12);
        for (let g = 0; g < nGroups; g++) {
          const base = offset + 16 + g * 12;
          const start = cmap.readUInt32BE(base);
          const end = cmap.readUInt32BE(base + 4);
          const startGlyph = cmap.readUInt32BE(base + 8);
          if (end < start || end - start > 0x20000) continue;
          for (let c = start; c <= end; c++) if (startGlyph + (c - start) !== 0) out.add(c);
        }
        parsedAny = true;
      }
    }
    return parsedAny && out.size > 0 ? out : null;
  } catch {
    return null;
  }
}

/** 로드된 폰트 전체의 커버리지 합집합. 하나라도 파싱 못 하면 null(보수적: 필터링하지 않음). */
export function unionCoverage(fonts: OgFont[]): Set<number> | null {
  const seen = new Set<ArrayBuffer>();
  const union = new Set<number>();
  for (const f of fonts) {
    if (seen.has(f.data)) continue;
    seen.add(f.data);
    const cov = parseFontCoverage(f.data);
    if (!cov) return null;
    cov.forEach((c) => union.add(c));
  }
  return union.size ? union : null;
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
    console.warn('[og-fonts] 폰트 검증 실패 — 사용하지 않습니다 (정적 TTF/OTF/WOFF 필요):', (err as Error)?.message);
    return false;
  }
}

let cached: Promise<LoadedFonts> | null = null;

export function loadOgFonts(): Promise<LoadedFonts> {
  if (!cached) {
    cached = (async (): Promise<LoadedFonts> => {
      const sources: [LoadedFonts['source'], () => Promise<LoadResult | null>][] = [
        ['env', loadFromEnv],
        ['public', loadFromPublic],
        ['static-fetch', loadFromStaticFetch],
      ];
      for (const [source, load] of sources) {
        const res = await load();
        if (res && (await probeFonts(res.fonts))) {
          return { fonts: res.fonts, hasKorean: res.korean, glyphs: unionCoverage(res.fonts), source };
        }
      }
      console.warn(
        '[og-fonts] 사용 가능한 한글 폰트가 없습니다 (public/fonts/NotoSansKR-{Regular,Bold}.woff 필요). 영문/숫자만 렌더합니다.',
      );
      return { fonts: [], hasKorean: false, glyphs: null, source: 'none' };
    })();
  }
  return cached;
}

/** 테스트용: 캐시 초기화 */
export function resetOgFontCache() {
  cached = null;
}

/**
 * 폰트가 그릴 수 없는 문자를 제거해 □(tofu) 대신 안전하게 처리한다.
 *  - hasKorean=false : ASCII + Latin-1 + 일반 문장부호만 허용(기존 동작).
 *  - hasKorean=true + glyphs : 로드된 폰트 커버리지에 없는 문자(희귀 한글 음절·이모지 등)를 제거. 공백은 유지.
 *  - hasKorean=true, glyphs 없음 : 원문 그대로.
 * 결과에 글자·숫자가 하나도 없으면 latinFallback 을 쓴다.
 */
export function latinSafe(
  text: string,
  hasKorean: boolean,
  latinFallback = '',
  glyphs: ReadonlySet<number> | null = null,
): string {
  if (hasKorean) {
    if (!glyphs) return text;
    let out = '';
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (/\s/.test(ch) || glyphs.has(cp)) out += ch;
    }
    const cleaned = out.replace(/\s+/g, ' ').trim();
    if (cleaned === text.replace(/\s+/g, ' ').trim()) return text;
    return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : latinFallback;
  }
  const cleaned = text
    .replace(/[^\u0020-\u007E\u00A0-\u00FF\u2010-\u2027\u2030-\u205E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /[A-Za-z0-9]/.test(cleaned) ? cleaned : latinFallback;
}
