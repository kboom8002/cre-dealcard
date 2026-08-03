/**
 * PPTX 디자인 시스템 토큰 & 프리셋 레지스트리
 * 탑티어 CRE IM 디자인 시스템 벤치마킹 (CBRE, JLL, KPMG, Deloitte)
 */

export interface PptxThemeTokens {
  presetId: string;
  presetName: string;
  
  // Background & Core Surfaces
  background: string;       // 슬라이드 기본 배경
  cardBackground: string;   // 메트릭/정보 카드 배경
  cardBorder: string;       // 테두리 색상
  footerBackground: string; // 하단 바/푸터 배경
  
  // Typography Colors
  headingColor: string;     // 슬라이드 제목
  subheadingColor: string;  // 부제목 / 스펙 라벨
  bodyColor: string;        // 본문 텍스트
  mutedText: string;        // 주석 / 메타데이터

  // Accent Colors
  accentColor: string;      // 메인 포인트 (라인, 뱃지)
  accentBg: string;         // 포인트 뱃지 배경
  accentText: string;       // 포인트 뱃지 텍스트

  // Tables
  tableHeaderBg: string;
  tableHeaderText: string;
  tableAltRowBg: string;
  tableBorder: string;

  // Typography Fonts
  titleFontFace: string;
  bodyFontFace: string;

  // Branding
  companyName: string;
  companyTagline: string;

  // Status Badge Chips
  statusOccupiedBg: string;
  statusOccupiedText: string;
  statusVacantBg: string;
  statusVacantText: string;

  // Pro Features
  watermarkColor: string;
  coverStyle: 'split' | 'hero_dark' | 'corporate_card' | 'obsidian_glow';
}

export const PPTX_PRESET_TEMPLATES: Record<string, PptxThemeTokens> = {
  // 1. CREDEAL Signature (Modern Tech CRE - Navy & Lime)
  credeal_signature: {
    presetId: 'credeal_signature',
    presetName: 'CREDEAL Signature',
    background: 'FFFFFF',
    cardBackground: 'F8FAFC',
    cardBorder: 'E2E8F0',
    footerBackground: '0F172A',
    headingColor: '0F172A',
    subheadingColor: '334155',
    bodyColor: '1E293B',
    mutedText: '64748B',
    accentColor: 'C8FF00',
    accentBg: '0F172A',
    accentText: 'C8FF00',
    tableHeaderBg: '0F172A',
    tableHeaderText: 'FFFFFF',
    tableAltRowBg: 'F8FAFC',
    tableBorder: 'CBD5E1',
    titleFontFace: 'Pretendard',
    bodyFontFace: 'Noto Sans KR',
    companyName: '크리딜',
    companyTagline: '상업용 부동산 투자 플랫폼',
    statusOccupiedBg: 'DCFCE7',
    statusOccupiedText: '15803D',
    statusVacantBg: 'FEE2E2',
    statusVacantText: 'B91C1C',
    watermarkColor: 'D0D0D0',
    coverStyle: 'split',
  },

  // 2. Executive Gold (Institutional CBRE / Eastdil Secured Vibe - Midnight & Gold)
  executive_gold: {
    presetId: 'executive_gold',
    presetName: 'Executive Gold',
    background: 'FAFAFA',
    cardBackground: 'FFFFFF',
    cardBorder: 'E4E4E7',
    footerBackground: '0A1128',
    headingColor: '0A1128',
    subheadingColor: '1C2541',
    bodyColor: '27272A',
    mutedText: '71717A',
    accentColor: 'D4A853',
    accentBg: '0A1128',
    accentText: 'D4A853',
    tableHeaderBg: '0A1128',
    tableHeaderText: 'FFFFFF',
    tableAltRowBg: 'F4F4F5',
    tableBorder: 'D4D4D8',
    titleFontFace: 'Pretendard',
    bodyFontFace: 'Noto Sans KR',
    companyName: '크리딜 Executive',
    companyTagline: '기관투자자 전용 IM 파트너',
    statusOccupiedBg: 'ECFDF5',
    statusOccupiedText: '047857',
    statusVacantBg: 'FEF2F2',
    statusVacantText: 'DC2626',
    watermarkColor: 'E2D9C8',
    coverStyle: 'hero_dark',
  },

  // 3. Corporate Clean (Consulting KPMG / Deloitte Vibe - Slate & Emerald)
  corporate_clean: {
    presetId: 'corporate_clean',
    presetName: 'Corporate Clean',
    background: 'F8FAFC',
    cardBackground: 'FFFFFF',
    cardBorder: 'E2E8F0',
    footerBackground: '1E293B',
    headingColor: '1E293B',
    subheadingColor: '334155',
    bodyColor: '0F172A',
    mutedText: '64748B',
    accentColor: '059669',
    accentBg: 'ECFDF5',
    accentText: '047857',
    tableHeaderBg: '1E293B',
    tableHeaderText: 'FFFFFF',
    tableAltRowBg: 'F1F5F9',
    tableBorder: 'CBD5E1',
    titleFontFace: 'Pretendard',
    bodyFontFace: 'Noto Sans KR',
    companyName: '크리딜 Advisory',
    companyTagline: '부동산 투자 자문 보고서',
    statusOccupiedBg: 'D1FAE5',
    statusOccupiedText: '065F46',
    statusVacantBg: 'FFE4E6',
    statusVacantText: '9F1239',
    watermarkColor: 'CBD5E1',
    coverStyle: 'corporate_card',
  },

  // 4. Pro Dark Obsidian (High-Contrast Premium Pro - Obsidian & Electric Cyan)
  pro_dark_obsidian: {
    presetId: 'pro_dark_obsidian',
    presetName: 'Pro Dark Obsidian',
    background: '09090B',
    cardBackground: '18181B',
    cardBorder: '27272A',
    footerBackground: '18181B',
    headingColor: 'FAFAFA',
    subheadingColor: 'E4E4E7',
    bodyColor: 'D4D4D8',
    mutedText: 'A1A1AA',
    accentColor: '06B6D4',
    accentBg: '083344',
    accentText: '22D3EE',
    tableHeaderBg: '27272A',
    tableHeaderText: 'FAFAFA',
    tableAltRowBg: '18181B',
    tableBorder: '3F3F46',
    titleFontFace: 'Pretendard',
    bodyFontFace: 'Noto Sans KR',
    companyName: '크리딜 Pro',
    companyTagline: '프리미엄 자산 투자 분석',
    statusOccupiedBg: '064E3B',
    statusOccupiedText: '6EE7B7',
    statusVacantBg: '7F1D1D',
    statusVacantText: 'FCA5A5',
    watermarkColor: '27272A',
    coverStyle: 'obsidian_glow',
  },
};

export const DEFAULT_PPTX_PRESET = 'credeal_signature';

export function getPptxTheme(presetId?: string): PptxThemeTokens {
  if (presetId && PPTX_PRESET_TEMPLATES[presetId]) {
    return PPTX_PRESET_TEMPLATES[presetId];
  }
  return PPTX_PRESET_TEMPLATES[DEFAULT_PPTX_PRESET];
}

// 기존 인터페이스 하위 호환성용 export
export const CREDEAL_PPTX_THEME = PPTX_PRESET_TEMPLATES.credeal_signature;
