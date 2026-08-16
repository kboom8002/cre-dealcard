export interface PptxThemeTokens {
  presetId: string;
  presetName: string;

  // 무체색
  ink: string;
  ink2: string;
  ink3: string;
  slate: string;
  body: string;
  mute: string;
  mute2: string;
  line: string;
  line2: string;
  bg: string;
  tint: string;

  // 액센트
  accent: string;
  accentD: string;
  accentL: string;
  accentT: string;

  // 의미색
  green: string;
  greenL: string;
  red: string;
  redL: string;
  amber: string;
  amberL: string;
  blue: string;
  blueL: string;
  violet: string;
  violetL: string;

  // 다크 전용
  darkCard: string;
  darkBlock: string;
  darkBorder: string;
  darkBody: string;
  darkMute: string;
  darkFaint: string;
  darkAccentBg: string;
  darkAccentBorder: string;
  darkAccentText: string;

  // 타이포
  titleFont: string;
  bodyFont: string;

  // 커버
  coverStyle: 'institutional_masses' | 'split' | 'hero_dark' | 'corporate_card' | 'obsidian_glow';

  // 본문 레이아웃 스타일 (프리셋별 슬라이드 레이아웃 차별화)
  layoutStyle: 'classic' | 'modern' | 'executive' | 'minimal' | 'dramatic';

  // 브랜딩
  companyName: string;
  companyTagline: string;
  logoUrl?: string;
}

export const PPTX_PRESET_TEMPLATES: Record<string, PptxThemeTokens> = {
  golden_institutional: {
    presetId: 'golden_institutional',
    presetName: 'Golden Institutional',
    ink: '10161F',
    ink2: '1C2433',
    ink3: '2D3748',
    slate: '4A5568',
    body: '10161F',
    mute: '718096',
    mute2: 'A0AEC0',
    line: 'CBD5E0',
    line2: 'E2E8F0',
    bg: 'FFFFFF',
    tint: 'F7FAFC',

    accent: 'B98A2E',
    accentD: '977024',
    accentL: 'D9B668',
    accentT: 'F3EBDA',

    green: '276749',
    greenL: 'C6F6D5',
    red: '9B2C2C',
    redL: 'FED7D7',
    amber: '9C4221',
    amberL: 'FEEBC8',
    blue: '2B6CB0',
    blueL: 'BEE3F8',
    violet: '553C9A',
    violetL: 'E9D8FD',

    darkCard: '1A202C',
    darkBlock: '2D3748',
    darkBorder: '4A5568',
    darkBody: 'E2E8F0',
    darkMute: 'A0AEC0',
    darkFaint: '718096',
    darkAccentBg: '977024',
    darkAccentBorder: 'B98A2E',
    darkAccentText: 'F3EBDA',

    titleFont: 'Pretendard',
    bodyFont: 'Pretendard',
    coverStyle: 'institutional_masses',
    layoutStyle: 'classic',
    companyName: '크리딜',
    companyTagline: '상업용 부동산 투자 플랫폼'
  },
  credeal_signature: {
    presetId: 'credeal_signature',
    presetName: 'CREDEAL Signature',
    ink: '0F172A',
    ink2: '1E293B',
    ink3: '334155',
    slate: '475569',
    body: '0F172A',
    mute: '64748B',
    mute2: '94A3B8',
    line: 'CBD5E1',
    line2: 'E2E8F0',
    bg: 'FFFFFF',
    tint: 'F8FAFC',

    accent: '6B8E00',
    accentD: '4F6A00',
    accentL: 'A3D900',
    accentT: 'E8F5CC',

    green: '15803D',
    greenL: 'DCFCE7',
    red: 'B91C1C',
    redL: 'FEE2E2',
    amber: 'B45309',
    amberL: 'FEF3C7',
    blue: '1D4ED8',
    blueL: 'DBEAFE',
    violet: '6D28D9',
    violetL: 'EDE9FE',

    darkCard: '1E293B',
    darkBlock: '334155',
    darkBorder: '475569',
    darkBody: 'F1F5F9',
    darkMute: '94A3B8',
    darkFaint: '64748B',
    darkAccentBg: '4F6A00',
    darkAccentBorder: '6B8E00',
    darkAccentText: 'E8F5CC',

    titleFont: 'Pretendard',
    bodyFont: 'Pretendard',
    coverStyle: 'split',
    layoutStyle: 'modern',
    companyName: '크리딜',
    companyTagline: '상업용 부동산 투자 플랫폼'
  },
  executive_gold: {
    presetId: 'executive_gold',
    presetName: 'Executive Gold',
    ink: '0A1128',
    ink2: '121F45',
    ink3: '1C2541',
    slate: '3A506B',
    body: '0A1128',
    mute: '5B6B8A',
    mute2: '90A0C0',
    line: 'D1D8E6',
    line2: 'E5EAF2',
    bg: 'FFFFFF',
    tint: 'F4F6F9',

    accent: 'B8862D',
    accentD: '8B6914',
    accentL: 'D4A853',
    accentT: 'F5EDDC',

    green: '047857',
    greenL: 'D1FAE5',
    red: 'DC2626',
    redL: 'FEE2E2',
    amber: 'D97706',
    amberL: 'FEF3C7',
    blue: '2563EB',
    blueL: 'DBEAFE',
    violet: '7C3AED',
    violetL: 'EDE9FE',

    darkCard: '121F45',
    darkBlock: '1C2541',
    darkBorder: '3A506B',
    darkBody: 'F4F6F9',
    darkMute: '90A0C0',
    darkFaint: '5B6B8A',
    darkAccentBg: '8B6914',
    darkAccentBorder: 'B8862D',
    darkAccentText: 'F5EDDC',

    titleFont: 'Noto Serif KR',
    bodyFont: 'Pretendard',
    coverStyle: 'hero_dark',
    layoutStyle: 'executive',
    companyName: '크리딜',
    companyTagline: '상업용 부동산 투자 플랫폼'
  },
  corporate_clean: {
    presetId: 'corporate_clean',
    presetName: 'Corporate Clean',
    ink: '1E293B',
    ink2: '334155',
    ink3: '475569',
    slate: '64748B',
    body: '1E293B',
    mute: '94A3B8',
    mute2: 'CBD5E1',
    line: 'E2E8F0',
    line2: 'F1F5F9',
    bg: 'FFFFFF',
    tint: 'F8FAFC',

    accent: '059669',
    accentD: '047857',
    accentL: '34D399',
    accentT: 'D1FAE5',

    green: '16A34A',
    greenL: 'DCFCE7',
    red: 'EF4444',
    redL: 'FEE2E2',
    amber: 'F59E0B',
    amberL: 'FEF3C7',
    blue: '3B82F6',
    blueL: 'DBEAFE',
    violet: '8B5CF6',
    violetL: 'EDE9FE',

    darkCard: '334155',
    darkBlock: '475569',
    darkBorder: '64748B',
    darkBody: 'F8FAFC',
    darkMute: 'CBD5E1',
    darkFaint: '94A3B8',
    darkAccentBg: '047857',
    darkAccentBorder: '059669',
    darkAccentText: 'D1FAE5',

    titleFont: 'Pretendard',
    bodyFont: 'Pretendard',
    coverStyle: 'corporate_card',
    layoutStyle: 'minimal',
    companyName: '크리딜',
    companyTagline: '상업용 부동산 투자 플랫폼'
  },
  pro_dark_obsidian: {
    presetId: 'pro_dark_obsidian',
    presetName: 'Pro Dark Obsidian',
    ink: '09090B',
    ink2: '18181B',
    ink3: '27272A',
    slate: '3F3F46',
    body: '09090B',
    mute: '71717A',
    mute2: 'A1A1AA',
    line: 'E4E4E7',
    line2: 'F4F4F5',
    bg: 'FFFFFF',
    tint: 'FAFAFA',

    accent: '0284A8',
    accentD: '016687',
    accentL: '22D3EE',
    accentT: 'CFFAFE',

    green: '10B981',
    greenL: 'D1FAE5',
    red: 'F43F5E',
    redL: 'FFE4E6',
    amber: 'F59E0B',
    amberL: 'FEF3C7',
    blue: '3B82F6',
    blueL: 'DBEAFE',
    violet: '8B5CF6',
    violetL: 'EDE9FE',

    darkCard: '18181B',
    darkBlock: '27272A',
    darkBorder: '3F3F46',
    darkBody: 'FAFAFA',
    darkMute: 'A1A1AA',
    darkFaint: '71717A',
    darkAccentBg: '016687',
    darkAccentBorder: '0284A8',
    darkAccentText: 'CFFAFE',

    titleFont: 'Pretendard',
    bodyFont: 'Pretendard',
    coverStyle: 'obsidian_glow',
    layoutStyle: 'dramatic',
    companyName: '크리딜',
    companyTagline: '상업용 부동산 투자 플랫폼'
  }
};

export const DEFAULT_PPTX_PRESET = 'golden_institutional';

export function getPptxTheme(presetId?: string): PptxThemeTokens {
  if (presetId && PPTX_PRESET_TEMPLATES[presetId]) {
    return PPTX_PRESET_TEMPLATES[presetId];
  }
  return PPTX_PRESET_TEMPLATES[DEFAULT_PPTX_PRESET];
}

export const CREDEAL_PPTX_THEME = PPTX_PRESET_TEMPLATES.credeal_signature;

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 커스텀 프리셋을 포함한 비동기 테마 조회.
 * 1차: 내장 프리셋 확인 (golden_institutional 등 5개)
 * 2차: UUID 형식이면 DB에서 커스텀 프리셋 조회
 * 3차: 기본값(golden_institutional) 반환
 */
export async function getPptxThemeAsync(
  presetId?: string,
  supabase?: SupabaseClient,
): Promise<PptxThemeTokens> {
  // 1. 내장 프리셋 (빠른 경로)
  if (presetId && PPTX_PRESET_TEMPLATES[presetId]) {
    return PPTX_PRESET_TEMPLATES[presetId];
  }

  // 2. UUID 형식 → DB에서 커스텀 프리셋 조회
  if (presetId && supabase && /^[0-9a-f-]{36}$/.test(presetId)) {
    try {
      const { data } = await supabase
        .from('pptx_custom_presets')
        .select('tokens, cover_style, layout_style, company_name, company_tagline, logo_url')
        .eq('id', presetId)
        .maybeSingle();

      if (data?.tokens) {
        // 내장 기본값 위에 커스텀 토큰을 머지
        const base = PPTX_PRESET_TEMPLATES[DEFAULT_PPTX_PRESET];
        const merged = {
          ...base,
          ...(data.tokens as Partial<PptxThemeTokens>),
          presetId,
          coverStyle: (data.cover_style as PptxThemeTokens['coverStyle']) ?? base.coverStyle,
          layoutStyle: (data.layout_style as PptxThemeTokens['layoutStyle']) ?? base.layoutStyle,
          companyName: data.company_name ?? base.companyName,
          companyTagline: data.company_tagline ?? base.companyTagline,
        } as PptxThemeTokens;
        // G1: logo_url을 별도 속성으로 전달 (PptxThemeTokens 인터페이스 외)
        if (data.logo_url) merged.logoUrl = data.logo_url;
        return merged;
      }
    } catch (err) {
      console.warn('[getPptxThemeAsync] DB lookup failed, using default:', err);
    }
  }

  return PPTX_PRESET_TEMPLATES[DEFAULT_PPTX_PRESET];
}

// ══════════════════════════════════════════
// §C-4: 프리셋 접근성 자동 검증 유틸리티
// ══════════════════════════════════════════

function _relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function _contrastRatio(hex1: string, hex2: string): number {
  const l1 = _relativeLuminance(hex1);
  const l2 = _relativeLuminance(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * 프리셋의 접근성 기준 준수 여부를 검증합니다.
 * - body vs bg: WCAG AA 4.5:1
 * - ink vs bg: WCAG AA 4.5:1
 * - accent vs bg: 최소 3:1 (장식용)
 * - darkBody vs darkCard: WCAG AA 3:1 (반전 배경)
 * @returns 위반 사항 문자열 배열 (빈 배열이면 통과)
 */
export function validatePresetAccessibility(preset: PptxThemeTokens): string[] {
  const issues: string[] = [];
  const checks: [string, string, string, string, number][] = [
    ['body', preset.body, 'bg', preset.bg, 4.5],
    ['ink', preset.ink, 'bg', preset.bg, 4.5],
    ['ink2', preset.ink2, 'bg', preset.bg, 4.5],
    ['accent', preset.accent, 'bg', preset.bg, 3.0],
    ['mute', preset.mute, 'bg', preset.bg, 2.5],
    ['darkBody', preset.darkBody, 'darkCard', preset.darkCard, 3.0],
  ];
  for (const [name1, hex1, name2, hex2, minRatio] of checks) {
    const ratio = _contrastRatio(hex1, hex2);
    if (ratio < minRatio) {
      issues.push(
        `[${preset.presetId}] ${name1}(${hex1}) vs ${name2}(${hex2}): ${ratio.toFixed(2)} < ${minRatio}:1`
      );
    }
  }
  return issues;
}
