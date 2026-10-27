/**
 * CRE DealCard Workspace Senior Design Tokens (WP-P2-01)
 *
 * Implements senior-friendly typography, high-contrast borders,
 * paper theme tokens, and touch target constraints for workspace components.
 * Reference: docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md (§3.1)
 */

export const SENIOR_FONT_SCALE = {
  normal: 17,
  large: 19,
  xlarge: 21,
} as const;

export type SeniorFontScaleKey = keyof typeof SENIOR_FONT_SCALE;

export const SENIOR_TYPOGRAPHY = {
  /** Senior 3-level root body scale */
  scale: {
    normal: "17px",
    large: "19px",
    xlarge: "21px",
  },
  /** Standard readable body text */
  body: "17px",
  /** Secondary readable text */
  bodySecondary: "15px",
  /** Minimum caption size across all workspace components (banned <= 13px) */
  captionMin: "14px",
  /** Form inputs (prevents iOS Safari auto-zoom) */
  input: "18px",
  /** Column header / section title */
  columnTitle: "20px",
  /** Main screen title on desktop */
  screenTitle: "24px",
  /** Main screen title on mobile */
  screenTitleMobile: "22px",
  /** Prominent tabular financial numbers */
  keyNumber: "28px",
  keyNumberLarge: "32px",
} as const;

export const WORKSPACE_TOUCH_TARGETS = {
  /** Minimum interactive touch target (48x48px) */
  min: 48,
  minPx: "48px",
  /** Primary action button height */
  primaryAction: 56,
  primaryActionPx: "56px",
  /** Filter chip minimum height */
  filterChip: 40,
  filterChipPx: "40px",
  /** Item list row height */
  itemRow: 72,
  itemRowPx: "72px",
  /** Topbar height */
  topbar: 56,
  topbarPx: "56px",
  /** Mobile bottom navigation height */
  bottomNav: 64,
  bottomNavPx: "64px",
} as const;

export const WORKSPACE_COLORS = {
  canvas: "#F3F2EE",
  panel: "#FAF9F5",
  card: "#FFFFFF",
  text: "#0F172A",
  textSecondary: "#334155",
  textSubtle: "#475569",
  /** Control border with 4.8:1 contrast ratio against white */
  controlBorder: "#64748B",
  /** Divider line color (divider use only, not for form inputs) */
  divider: "#CBD5E1",
  /** High-contrast focus ring */
  focusRing: "#1D4ED8",
  status: {
    success: {
      text: "#065F46",
      bg: "#D1FAE5",
      border: "#A7F3D0",
    },
    warning: {
      text: "#92400E",
      bg: "#FEF3C7",
      border: "#FDE68A",
    },
    danger: {
      text: "#991B1B",
      bg: "#FEE2E2",
      border: "#FECACA",
    },
    ai: {
      text: "#5B21B6",
      bg: "#EDE9FE",
      border: "#DDD6FE",
    },
  },
} as const;

/**
 * Returns pixel font size for a given senior scale key.
 */
export function getSeniorFontSize(scale: SeniorFontScaleKey = "normal"): string {
  return `${SENIOR_FONT_SCALE[scale]}px`;
}

/**
 * Ensures a font size string or number meets the minimum 14px caption rule.
 */
export function enforceMinCaptionSize(sizePx: number): number {
  return Math.max(14, sizePx);
}
