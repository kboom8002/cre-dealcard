/**
 * 브랜드 컬러 스킨 (Basic IM)
 *
 * 중개법인이 pptx_custom_presets 에 저장한 "회사 기본 프리셋"의 대표색(tokens.accent) 하나만 받아
 * Basic IM 의 **색상 팔레트만** 파생한다 (applyBasicSkin 과 동일 원칙: 글꼴·시퀀스·레이아웃·presetId 불변).
 *
 *  - 순수 함수(deriveBrandSkin) — DB/IO 없음. 입력이 잘못되면 null → 호출측은 기본 팔레트로 계속 진행 (생성 차단 금지).
 *  - 대비 가드: accent ≥ 4.5:1 (흰 배경 위 글자·흰 글자 채움 겸용), accentL ≥ 3:1 (밝은 배경 위 라벨),
 *    darkAccentText ≥ 4.5:1 on darkAccentBg, darkBody ≥ 7:1 on darkCard. 밝은 브랜드색은 명도를 낮춰 보정한다.
 *  - 의미색(green/red/amber/violet)·중립 텍스트(slate/mute/mute2/body)는 Basic 값을 유지한다.
 */
import type { PptxThemeTokens, ThemePresetDbReader } from './pptx-theme';

export interface BrandSkinResult {
  /** 정규화된 입력 색 (RRGGBB 대문자) */
  brandHex: string;
  /** 대비 가드 때문에 accent 가 입력 색에서 바뀌었는가 */
  adjusted: boolean;
  /** applyBasicBrand 가 덮어쓸 팔레트 */
  palette: Partial<PptxThemeTokens>;
}

const HEX6 = /^#?([0-9a-f]{6})$/i;
const HEX3 = /^#?([0-9a-f]{3})$/i;

export function normalizeBrandHex(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  const m6 = HEX6.exec(s);
  if (m6) return m6[1].toUpperCase();
  const m3 = HEX3.exec(s);
  if (m3) return m3[1].split('').map(c => c + c).join('').toUpperCase();
  return null;
}

// ── 색 변환 ──
function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return (c(r) + c(g) + c(b)).toUpperCase();
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) { const v = l * 255; return rgbToHex(v, v, v); }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return rgbToHex(hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255);
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** 같은 색상·채도에서 명도를 낮춰(밝은 배경 기준) 흰색 대비가 min 이상이 될 때까지 보정. */
function darkenUntil(h: number, s: number, l: number, bg: string, min: number): string {
  let cur = l;
  let hex = hslToHex(h, s, cur);
  for (let i = 0; i < 80 && contrastRatio(hex, bg) < min; i++) {
    cur = Math.max(0, cur - 0.01);
    hex = hslToHex(h, s, cur);
  }
  return hex;
}

const WHITE = 'FFFFFF';

/**
 * 대표색 하나 → Basic 팔레트. 잘못된 색이면 null.
 */
export function deriveBrandSkin(input: unknown): BrandSkinResult | null {
  const brandHex = normalizeBrandHex(input);
  if (!brandHex) return null;
  const [h, sRaw, l] = rgbToHsl(...hexToRgb(brandHex));
  const s = Math.min(1, sRaw);

  // accent: 입력색 유지, 흰 배경 대비 4.5 미만이면 같은 색상에서 명도만 낮춤
  const accent = contrastRatio(brandHex, WHITE) >= 4.5 ? brandHex : darkenUntil(h, s, l, WHITE, 4.5);
  const adjusted = accent !== brandHex;
  const [, , accL0] = rgbToHsl(...hexToRgb(accent));

  const accentD = hslToHex(h, s, Math.max(0, accL0 - 0.08));
  // 라벨용 밝은 변형: accent 보다 살짝 밝게, 단 흰 배경 대비 3:1 유지
  let accentL = hslToHex(h, s, Math.min(0.62, accL0 + 0.10));
  if (contrastRatio(accentL, WHITE) < 3.0) accentL = darkenUntil(h, s, Math.min(0.62, accL0 + 0.10), WHITE, 3.0);
  const accentT = hslToHex(h, Math.min(s, 0.45), 0.95);
  const accentSoft = hslToHex(h, Math.min(s, 0.45), 0.78);

  // 어두운 면(표지·구분자·콜아웃): 대표색 색조의 저채도 암색
  const darkS = Math.min(s, 0.40);
  const ink = hslToHex(h, darkS, 0.12);
  const ink2 = hslToHex(h, darkS, 0.17);
  const ink3 = hslToHex(h, darkS, 0.27);
  const darkCard = hslToHex(h, darkS, 0.08);
  const darkBlock = hslToHex(h, darkS, 0.18);
  const darkBorder = hslToHex(h, darkS, 0.30);
  const darkBody = hslToHex(h, Math.min(s, 0.30), 0.94);
  const darkMute = hslToHex(h, Math.min(s, 0.20), 0.78);
  const darkFaint = hslToHex(h, Math.min(s, 0.15), 0.60);

  const darkAccentBg = accentD;
  const darkAccentBorder = accent;
  const darkAccentText = contrastRatio(WHITE, darkAccentBg) >= contrastRatio(accentT, darkAccentBg) ? WHITE : accentT;

  const tint = hslToHex(h, Math.min(s, 0.30), 0.97);

  const palette: Partial<PptxThemeTokens> = {
    ink, ink2, ink3, tint,
    accent, accentD, accentL, accentT, accentSoft,
    blue: accent, blueL: accentT,
    darkCard, darkBlock, darkBorder, darkBody, darkMute, darkFaint,
    darkAccentBg, darkAccentBorder, darkAccentText,
  };
  return { brandHex, adjusted, palette };
}

/**
 * credeal_basic 일 때만 브랜드 팔레트 적용 (applyBasicSkin 과 동일한 가드). 입력이 잘못되면 base 그대로.
 */
export function applyBasicBrand(base: PptxThemeTokens, brandHex: string | undefined | null): PptxThemeTokens {
  if (!brandHex || base.presetId !== 'credeal_basic') return base;
  const derived = deriveBrandSkin(brandHex);
  if (!derived) return base;
  return { ...base, presetName: `${base.presetName} · Brand ${derived.brandHex}`, ...derived.palette } as PptxThemeTokens;
}

// ───────────────────────── 회사 기본 프리셋 해석 ─────────────────────────

export interface ResolvedBrand {
  accent: string;
  source: 'preset' | 'company_default' | 'user_default';
  presetId: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * 브랜드 대표색 해석 (Basic 전용). 우선순위:
 *  1) presetParam 이 UUID(커스텀 프리셋) → 그 프리셋 (소유자 본인·같은 법인·공개 프리셋만 허용)
 *  2) 소유 법인의 is_company_default 프리셋 → 3) 소유자 개인의 is_company_default 프리셋
 * 실패·미설정 시 null — 호출측은 기본 팔레트로 계속 진행한다 (생성/다운로드 차단 금지).
 */
export async function resolveBrandAccent(args: {
  supabase?: ThemePresetDbReader | null;
  ownerId?: string | null;
  presetParam?: string | null;
}): Promise<ResolvedBrand | null> {
  const { supabase, ownerId, presetParam } = args;
  if (!supabase || !ownerId) return null;
  try {
    let companyId: string | null = null;
    try {
      const { data: profile } = await supabase.from('broker_profiles').select('company_id').eq('user_id', ownerId).maybeSingle();
      companyId = profile?.company_id ?? null;
    } catch { /* company 조회 실패는 개인 프리셋으로 폴백 */ }

    if (presetParam && UUID_RE.test(presetParam)) {
      const { data } = await supabase
        .from('pptx_custom_presets')
        .select('id, user_id, company_id, is_public, tokens')
        .eq('id', presetParam)
        .maybeSingle();
      if (data) {
        const allowed = data.user_id === ownerId || (!!companyId && data.company_id === companyId) || data.is_public === true;
        const accent = allowed ? normalizeBrandHex((data.tokens as any)?.accent) : null;
        if (accent) return { accent, source: 'preset', presetId: data.id };
      }
      return null;
    }

    if (companyId) {
      const { data } = await supabase
        .from('pptx_custom_presets')
        .select('id, tokens')
        .eq('company_id', companyId)
        .eq('is_company_default', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const accent = normalizeBrandHex((data?.tokens as any)?.accent);
      if (data && accent) return { accent, source: 'company_default', presetId: data.id };
    }
    const { data: own } = await supabase
      .from('pptx_custom_presets')
      .select('id, tokens')
      .eq('user_id', ownerId)
      .eq('is_company_default', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const ownAccent = normalizeBrandHex((own?.tokens as any)?.accent);
    if (own && ownAccent) return { accent: ownAccent, source: 'user_default', presetId: own.id };
  } catch {
    /* 브랜드 해석 실패 → 기본 팔레트 */
  }
  return null;
}
