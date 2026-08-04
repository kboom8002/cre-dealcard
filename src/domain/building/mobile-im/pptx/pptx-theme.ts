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

  // 브랜딩
  companyName: string;
  companyTagline: string;
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

    titleFont: '맑은 고딕',
    bodyFont: '맑은 고딕',
    coverStyle: 'institutional_masses',
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

    accent: 'C8FF00',
    accentD: 'A3D900',
    accentL: 'E0FF66',
    accentT: 'F5FFCC',

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
    darkAccentBg: 'A3D900',
    darkAccentBorder: 'C8FF00',
    darkAccentText: 'F5FFCC',

    titleFont: '맑은 고딕',
    bodyFont: '맑은 고딕',
    coverStyle: 'split',
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

    accent: 'D4A853',
    accentD: 'AA843D',
    accentL: 'E6CA8A',
    accentT: 'F8F1E1',

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
    darkAccentBg: 'AA843D',
    darkAccentBorder: 'D4A853',
    darkAccentText: 'F8F1E1',

    titleFont: '맑은 고딕',
    bodyFont: '맑은 고딕',
    coverStyle: 'hero_dark',
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

    titleFont: '맑은 고딕',
    bodyFont: '맑은 고딕',
    coverStyle: 'corporate_card',
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

    accent: '06B6D4',
    accentD: '0891B2',
    accentL: '67E8F9',
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
    darkAccentBg: '0891B2',
    darkAccentBorder: '06B6D4',
    darkAccentText: 'CFFAFE',

    titleFont: '맑은 고딕',
    bodyFont: '맑은 고딕',
    coverStyle: 'obsidian_glow',
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
