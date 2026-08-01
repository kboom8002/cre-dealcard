/**
 * PPTX 디자인 토큰 — 크리딜 브랜드 CI
 * js-im의 3-Tier 디자인 시스템을 cre-dealcard에 이식
 */

export const CREDEAL_PPTX_THEME = {
  // ── Tier 1: Primitives ──
  background: 'FFFFFF',
  navy: '0F172A',
  lime: 'C8FF00',
  slate700: '334155',
  slate500: '64748B',
  slate50: 'F8FAFC',
  white: 'FFFFFF',

  // ── Tier 2: Semantic ──
  headingColor: '0F172A',
  accentColor: 'C8FF00',
  bodyColor: '334155',

  // ── Tier 3: Component ──
  titleFontFace: 'Pretendard',
  bodyFontFace: 'Noto Sans KR',
  tableHeaderBg: '0F172A',
  tableHeaderText: 'FFFFFF',
  tableAltRowBg: 'F8FAFC',
  chartColors: ['0F172A', 'C8FF00', '3B82F6', '16A34A', 'F97316', '64748B'],

  // ── Branding ──
  companyName: '\ud06c\ub9ac\ub51c',
  companyTagline: '\uc0c1\uc5c5\uc6a9 \ubd80\ub3d9\uc0b0 \ud22c\uc790 \ud50c\ub7ab\ud3fc',

  // ── Pro 전용 ──
  proAccentColor: '1E293B', // 짙은 네이비
  proGoldAccent: 'D4A853',  // 골드
  confidentialBg: 'DC2626',
  confidentialText: 'FFFFFF',
} as const;

export type CredealPptxTheme = typeof CREDEAL_PPTX_THEME;
