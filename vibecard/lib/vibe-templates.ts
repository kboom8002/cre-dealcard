/**
 * 32개 Vibe AI 명함 프리셋 템플릿
 *
 * VTI 7타입 × 4~5 변형 = 32개
 * 각 템플릿은 자체 7D Vibe 벡터와 CSS 변수를 가진다.
 * AI 호출 없이 코사인 유사도로 최적 매칭.
 */

import type { Vibe7D, VibeVtiType } from "./vibe-vector";

export interface VibeTemplateCssVars {
  bgGradient: string;
  bgImageUrl?: string;
  /** CSS mix-blend-mode for the preset background image layer */
  bgImageBlendMode?: string;
  /** Opacity for the preset background image layer (0–1) */
  bgImageOpacity?: number;
  /**
   * For light-background templates: opacity of an accent-color tint layer
   * rendered beneath the image so multiply blend has a non-white base.
   * 0 = no tint (dark templates).
   */
  bgImageTintOpacity?: number;
  accentColor: string;
  textColor: string;
  subtextColor: string;
  ringColor: string;
  ringGlow: string;
  badgeBg: string;
  cardBg: string;
  fontFamily: string;
  borderStyle?: string;
  patternSvg?: string;
}

export interface VibeTemplate {
  id: string;
  vtiFamily: VibeVtiType;
  variant: number;
  name_ko: string;
  name_en: string;
  vibeVector: Vibe7D;
  css: VibeTemplateCssVars;
}

// ── Calm-Care (5개) ──────────────────────────────────

const CC: VibeTemplate[] = [
  {
    id: "CC-01", vtiFamily: "Calm-Care", variant: 1,
    name_ko: "소프트 아이보리", name_en: "Soft Ivory",
    vibeVector: { warmth: 0.80, energy: 0.30, polish: 0.55, authentic: 0.70, heritage: 0.50, futuristic: 0.35, playful: 0.40 },
    css: {
      bgGradient: "linear-gradient(135deg, #fdf6ed 0%, #fce8d5 50%, #fdf2e9 100%)",
      accentColor: "#d97706", textColor: "#44403c", subtextColor: "#78716c",
      ringColor: "#f59e0b", ringGlow: "0 0 24px rgba(245,158,11,0.25)",
      badgeBg: "rgba(217,119,6,0.10)", cardBg: "#fffbf5",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "CC-02", vtiFamily: "Calm-Care", variant: 2,
    name_ko: "워밍 코랄", name_en: "Warming Coral",
    vibeVector: { warmth: 0.85, energy: 0.35, polish: 0.50, authentic: 0.75, heritage: 0.45, futuristic: 0.30, playful: 0.45 },
    css: {
      bgGradient: "linear-gradient(135deg, #fff5f5 0%, #fee2e2 50%, #fef2f2 100%)",
      accentColor: "#e11d48", textColor: "#4c1d2e", subtextColor: "#9f1239",
      ringColor: "#fb7185", ringGlow: "0 0 24px rgba(251,113,133,0.25)",
      badgeBg: "rgba(225,29,72,0.08)", cardBg: "#fffafa",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "CC-03", vtiFamily: "Calm-Care", variant: 3,
    name_ko: "모스 그린", name_en: "Moss Green",
    vibeVector: { warmth: 0.75, energy: 0.25, polish: 0.60, authentic: 0.80, heritage: 0.60, futuristic: 0.25, playful: 0.30 },
    css: {
      bgGradient: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 50%, #ecfdf5 100%)",
      accentColor: "#15803d", textColor: "#1a2e1a", subtextColor: "#4d7c4d",
      ringColor: "#22c55e", ringGlow: "0 0 24px rgba(34,197,94,0.20)",
      badgeBg: "rgba(21,128,61,0.08)", cardBg: "#f8fdf8",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "CC-04", vtiFamily: "Calm-Care", variant: 4,
    name_ko: "허니 라벤더", name_en: "Honey Lavender",
    vibeVector: { warmth: 0.82, energy: 0.28, polish: 0.58, authentic: 0.68, heritage: 0.52, futuristic: 0.38, playful: 0.42 },
    css: {
      bgGradient: "linear-gradient(135deg, #faf5ff 0%, #f3e8ff 50%, #fdf4ff 100%)",
      accentColor: "#9333ea", textColor: "#3b0764", subtextColor: "#7e22ce",
      ringColor: "#a855f7", ringGlow: "0 0 24px rgba(168,85,247,0.20)",
      badgeBg: "rgba(147,51,234,0.08)", cardBg: "#fdfaff",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "CC-05", vtiFamily: "Calm-Care", variant: 5,
    name_ko: "선셋 피치", name_en: "Sunset Peach",
    vibeVector: { warmth: 0.88, energy: 0.32, polish: 0.52, authentic: 0.72, heritage: 0.48, futuristic: 0.32, playful: 0.48 },
    css: {
      bgGradient: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 50%, #fff8f1 100%)",
      accentColor: "#ea580c", textColor: "#431407", subtextColor: "#c2410c",
      ringColor: "#fb923c", ringGlow: "0 0 24px rgba(251,146,60,0.25)",
      badgeBg: "rgba(234,88,12,0.08)", cardBg: "#fffcf5",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
];

// ── Calm-Polished (5개) ──────────────────────────────

const CP: VibeTemplate[] = [
  {
    id: "CP-01", vtiFamily: "Calm-Polished", variant: 1,
    name_ko: "미드나잇 네이비", name_en: "Midnight Navy",
    vibeVector: { warmth: 0.35, energy: 0.30, polish: 0.92, authentic: 0.48, heritage: 0.70, futuristic: 0.42, playful: 0.18 },
    css: {
      bgGradient: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
      accentColor: "#94a3b8", textColor: "#f1f5f9", subtextColor: "#94a3b8",
      ringColor: "#64748b", ringGlow: "0 0 24px rgba(100,116,139,0.30)",
      badgeBg: "rgba(148,163,184,0.12)", cardBg: "#0f172a",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "CP-02", vtiFamily: "Calm-Polished", variant: 2,
    name_ko: "실버 미니멀", name_en: "Silver Minimal",
    vibeVector: { warmth: 0.38, energy: 0.25, polish: 0.88, authentic: 0.50, heritage: 0.62, futuristic: 0.48, playful: 0.22 },
    css: {
      bgGradient: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #f1f5f9 100%)",
      accentColor: "#475569", textColor: "#1e293b", subtextColor: "#64748b",
      ringColor: "#94a3b8", ringGlow: "0 0 20px rgba(148,163,184,0.25)",
      badgeBg: "rgba(71,85,105,0.08)", cardBg: "#f8fafc",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "CP-03", vtiFamily: "Calm-Polished", variant: 3,
    name_ko: "골드 라인", name_en: "Gold Line",
    vibeVector: { warmth: 0.42, energy: 0.28, polish: 0.90, authentic: 0.45, heritage: 0.75, futuristic: 0.40, playful: 0.20 },
    css: {
      bgGradient: "linear-gradient(135deg, #1c1917 0%, #292524 50%, #1c1917 100%)",
      accentColor: "#c9a227", textColor: "#f5f0e8", subtextColor: "#a8a29e",
      ringColor: "#c9a227", ringGlow: "0 0 24px rgba(201,162,39,0.30)",
      badgeBg: "rgba(201,162,39,0.12)", cardBg: "#1c1917",
      fontFamily: "'Pretendard', sans-serif", borderStyle: "1px solid rgba(201,162,39,0.20)",
    },
  },
  {
    id: "CP-04", vtiFamily: "Calm-Polished", variant: 4,
    name_ko: "아이스 블루", name_en: "Ice Blue",
    vibeVector: { warmth: 0.32, energy: 0.22, polish: 0.85, authentic: 0.52, heritage: 0.58, futuristic: 0.50, playful: 0.15 },
    css: {
      bgGradient: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #f0f9ff 100%)",
      accentColor: "#0284c7", textColor: "#0c4a6e", subtextColor: "#0369a1",
      ringColor: "#38bdf8", ringGlow: "0 0 20px rgba(56,189,248,0.20)",
      badgeBg: "rgba(2,132,199,0.08)", cardBg: "#f8fcff",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "CP-05", vtiFamily: "Calm-Polished", variant: 5,
    name_ko: "차콜 슬레이트", name_en: "Charcoal Slate",
    vibeVector: { warmth: 0.40, energy: 0.30, polish: 0.86, authentic: 0.55, heritage: 0.60, futuristic: 0.52, playful: 0.25 },
    css: {
      bgGradient: "linear-gradient(135deg, #18181b 0%, #27272a 50%, #18181b 100%)",
      accentColor: "#a1a1aa", textColor: "#fafafa", subtextColor: "#a1a1aa",
      ringColor: "#71717a", ringGlow: "0 0 20px rgba(113,113,122,0.25)",
      badgeBg: "rgba(161,161,170,0.10)", cardBg: "#18181b",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
];

// ── Focus-Competent (5개) ────────────────────────────

const FC: VibeTemplate[] = [
  {
    id: "FC-01", vtiFamily: "Focus-Competent", variant: 1,
    name_ko: "클린 화이트", name_en: "Clean White",
    vibeVector: { warmth: 0.42, energy: 0.72, polish: 0.75, authentic: 0.58, heritage: 0.42, futuristic: 0.62, playful: 0.28 },
    css: {
      bgGradient: "linear-gradient(135deg, #ffffff 0%, #f8fafc 50%, #ffffff 100%)",
      accentColor: "#2563eb", textColor: "#1e293b", subtextColor: "#64748b",
      ringColor: "#3b82f6", ringGlow: "0 0 24px rgba(59,130,246,0.20)",
      badgeBg: "rgba(37,99,235,0.08)", cardBg: "#ffffff",
      fontFamily: "'Pretendard', sans-serif", borderStyle: "1px solid #e2e8f0",
    },
  },
  {
    id: "FC-02", vtiFamily: "Focus-Competent", variant: 2,
    name_ko: "딥 블루", name_en: "Deep Blue",
    vibeVector: { warmth: 0.38, energy: 0.78, polish: 0.72, authentic: 0.55, heritage: 0.48, futuristic: 0.58, playful: 0.32 },
    css: {
      bgGradient: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)",
      accentColor: "#60a5fa", textColor: "#e2e8f0", subtextColor: "#94a3b8",
      ringColor: "#3b82f6", ringGlow: "0 0 28px rgba(59,130,246,0.35)",
      badgeBg: "rgba(96,165,250,0.12)", cardBg: "#0f172a",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "FC-03", vtiFamily: "Focus-Competent", variant: 3,
    name_ko: "모던 네이비", name_en: "Modern Navy",
    vibeVector: { warmth: 0.45, energy: 0.70, polish: 0.78, authentic: 0.52, heritage: 0.45, futuristic: 0.65, playful: 0.25 },
    css: {
      bgGradient: "linear-gradient(135deg, #1e293b 0%, #334155 50%, #1e293b 100%)",
      accentColor: "#38bdf8", textColor: "#f1f5f9", subtextColor: "#94a3b8",
      ringColor: "#0ea5e9", ringGlow: "0 0 24px rgba(14,165,233,0.30)",
      badgeBg: "rgba(56,189,248,0.10)", cardBg: "#1e293b",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "FC-04", vtiFamily: "Focus-Competent", variant: 4,
    name_ko: "인디고 스틸", name_en: "Indigo Steel",
    vibeVector: { warmth: 0.35, energy: 0.75, polish: 0.68, authentic: 0.60, heritage: 0.40, futuristic: 0.70, playful: 0.30 },
    css: {
      bgGradient: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)",
      accentColor: "#818cf8", textColor: "#e0e7ff", subtextColor: "#a5b4fc",
      ringColor: "#6366f1", ringGlow: "0 0 28px rgba(99,102,241,0.30)",
      badgeBg: "rgba(129,140,248,0.10)", cardBg: "#1e1b4b",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "FC-05", vtiFamily: "Focus-Competent", variant: 5,
    name_ko: "스카이 프레시", name_en: "Sky Fresh",
    vibeVector: { warmth: 0.50, energy: 0.68, polish: 0.70, authentic: 0.55, heritage: 0.38, futuristic: 0.55, playful: 0.35 },
    css: {
      bgGradient: "linear-gradient(135deg, #ecfeff 0%, #cffafe 50%, #ecfeff 100%)",
      accentColor: "#0891b2", textColor: "#164e63", subtextColor: "#0e7490",
      ringColor: "#06b6d4", ringGlow: "0 0 20px rgba(6,182,212,0.20)",
      badgeBg: "rgba(8,145,178,0.08)", cardBg: "#f0fdff",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
];

// ── Play-Spark (4개) ─────────────────────────────────

const PS: VibeTemplate[] = [
  {
    id: "PS-01", vtiFamily: "Play-Spark", variant: 1,
    name_ko: "선샤인 옐로우", name_en: "Sunshine Yellow",
    vibeVector: { warmth: 0.68, energy: 0.82, polish: 0.38, authentic: 0.72, heritage: 0.22, futuristic: 0.52, playful: 0.88 },
    css: {
      bgGradient: "linear-gradient(135deg, #fefce8 0%, #fef08a 30%, #fef9c3 100%)",
      accentColor: "#ca8a04", textColor: "#422006", subtextColor: "#a16207",
      ringColor: "#eab308", ringGlow: "0 0 28px rgba(234,179,8,0.30)",
      badgeBg: "rgba(202,138,4,0.10)", cardBg: "#fffef5",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "PS-02", vtiFamily: "Play-Spark", variant: 2,
    name_ko: "팝 오렌지", name_en: "Pop Orange",
    vibeVector: { warmth: 0.70, energy: 0.85, polish: 0.32, authentic: 0.68, heritage: 0.20, futuristic: 0.58, playful: 0.92 },
    css: {
      bgGradient: "linear-gradient(135deg, #fff7ed 0%, #fed7aa 30%, #ffedd5 100%)",
      accentColor: "#ea580c", textColor: "#431407", subtextColor: "#c2410c",
      ringColor: "#f97316", ringGlow: "0 0 28px rgba(249,115,22,0.30)",
      badgeBg: "rgba(234,88,12,0.10)", cardBg: "#fffcf5",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "PS-03", vtiFamily: "Play-Spark", variant: 3,
    name_ko: "라임 그린", name_en: "Lime Green",
    vibeVector: { warmth: 0.62, energy: 0.78, polish: 0.35, authentic: 0.75, heritage: 0.28, futuristic: 0.55, playful: 0.85 },
    css: {
      bgGradient: "linear-gradient(135deg, #f7fee7 0%, #d9f99d 30%, #ecfccb 100%)",
      accentColor: "#4d7c0f", textColor: "#1a2e05", subtextColor: "#65a30d",
      ringColor: "#84cc16", ringGlow: "0 0 24px rgba(132,204,22,0.25)",
      badgeBg: "rgba(77,124,15,0.08)", cardBg: "#fbfef2",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "PS-04", vtiFamily: "Play-Spark", variant: 4,
    name_ko: "핫 핑크", name_en: "Hot Pink",
    vibeVector: { warmth: 0.65, energy: 0.80, polish: 0.40, authentic: 0.65, heritage: 0.25, futuristic: 0.60, playful: 0.90 },
    css: {
      bgGradient: "linear-gradient(135deg, #fdf2f8 0%, #fbcfe8 30%, #fce7f3 100%)",
      accentColor: "#db2777", textColor: "#500724", subtextColor: "#be185d",
      ringColor: "#ec4899", ringGlow: "0 0 28px rgba(236,72,153,0.25)",
      badgeBg: "rgba(219,39,119,0.08)", cardBg: "#fffafd",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
];

// ── Bold-Futurist (4개) ──────────────────────────────

const BF: VibeTemplate[] = [
  {
    id: "BF-01", vtiFamily: "Bold-Futurist", variant: 1,
    name_ko: "네온 퍼플", name_en: "Neon Purple",
    vibeVector: { warmth: 0.28, energy: 0.88, polish: 0.62, authentic: 0.48, heritage: 0.12, futuristic: 0.92, playful: 0.60 },
    css: {
      bgGradient: "linear-gradient(135deg, #0a0015 0%, #1a0a3e 50%, #0a0015 100%)",
      accentColor: "#a855f7", textColor: "#e9d5ff", subtextColor: "#c084fc",
      ringColor: "#8b5cf6", ringGlow: "0 0 32px rgba(139,92,246,0.40)",
      badgeBg: "rgba(168,85,247,0.12)", cardBg: "#0a0015",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "BF-02", vtiFamily: "Bold-Futurist", variant: 2,
    name_ko: "사이버 시안", name_en: "Cyber Cyan",
    vibeVector: { warmth: 0.32, energy: 0.82, polish: 0.58, authentic: 0.52, heritage: 0.18, futuristic: 0.90, playful: 0.65 },
    css: {
      bgGradient: "linear-gradient(135deg, #001a1a 0%, #003333 50%, #001a1a 100%)",
      accentColor: "#22d3ee", textColor: "#cffafe", subtextColor: "#67e8f9",
      ringColor: "#06b6d4", ringGlow: "0 0 32px rgba(6,182,212,0.35)",
      badgeBg: "rgba(34,211,238,0.10)", cardBg: "#001a1a",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "BF-03", vtiFamily: "Bold-Futurist", variant: 3,
    name_ko: "오로라 글로우", name_en: "Aurora Glow",
    vibeVector: { warmth: 0.35, energy: 0.85, polish: 0.65, authentic: 0.45, heritage: 0.15, futuristic: 0.95, playful: 0.58 },
    css: {
      bgGradient: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 30%, #0f4c5c 70%, #0f172a 100%)",
      accentColor: "#c084fc", textColor: "#f1f5f9", subtextColor: "#a5b4fc",
      ringColor: "#a78bfa", ringGlow: "0 0 36px rgba(167,139,250,0.35)",
      badgeBg: "rgba(192,132,252,0.12)", cardBg: "#0f172a",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "BF-04", vtiFamily: "Bold-Futurist", variant: 4,
    name_ko: "일렉트릭 레드", name_en: "Electric Red",
    vibeVector: { warmth: 0.30, energy: 0.90, polish: 0.55, authentic: 0.50, heritage: 0.10, futuristic: 0.88, playful: 0.62 },
    css: {
      bgGradient: "linear-gradient(135deg, #1a0000 0%, #3b0000 50%, #1a0000 100%)",
      accentColor: "#ef4444", textColor: "#fee2e2", subtextColor: "#fca5a5",
      ringColor: "#dc2626", ringGlow: "0 0 32px rgba(239,68,68,0.35)",
      badgeBg: "rgba(239,68,68,0.12)", cardBg: "#1a0000",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
];

// ── Heritage-Trust (5개) ─────────────────────────────

const HT: VibeTemplate[] = [
  {
    id: "HT-01", vtiFamily: "Heritage-Trust", variant: 1,
    name_ko: "클래식 골드", name_en: "Classic Gold",
    vibeVector: { warmth: 0.58, energy: 0.32, polish: 0.82, authentic: 0.58, heritage: 0.90, futuristic: 0.18, playful: 0.22 },
    css: {
      bgGradient: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #1a1a2e 100%)",
      accentColor: "#c9a227", textColor: "#f5f0e8", subtextColor: "#c8b89a",
      ringColor: "#c9a227", ringGlow: "0 0 28px rgba(201,162,39,0.30)",
      badgeBg: "rgba(201,162,39,0.15)", cardBg: "#1a1a2e",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "HT-02", vtiFamily: "Heritage-Trust", variant: 2,
    name_ko: "다크 우드", name_en: "Dark Wood",
    vibeVector: { warmth: 0.62, energy: 0.28, polish: 0.78, authentic: 0.62, heritage: 0.92, futuristic: 0.12, playful: 0.20 },
    css: {
      bgGradient: "linear-gradient(135deg, #1c1210 0%, #2c1f1a 50%, #1c1210 100%)",
      accentColor: "#a0845c", textColor: "#ede6db", subtextColor: "#b8a88a",
      ringColor: "#a0845c", ringGlow: "0 0 24px rgba(160,132,92,0.25)",
      badgeBg: "rgba(160,132,92,0.12)", cardBg: "#1c1210",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "HT-03", vtiFamily: "Heritage-Trust", variant: 3,
    name_ko: "버건디 클래식", name_en: "Burgundy Classic",
    vibeVector: { warmth: 0.55, energy: 0.35, polish: 0.85, authentic: 0.55, heritage: 0.88, futuristic: 0.20, playful: 0.18 },
    css: {
      bgGradient: "linear-gradient(135deg, #1a0a0a 0%, #3b1515 50%, #1a0a0a 100%)",
      accentColor: "#b91c1c", textColor: "#f5e6e6", subtextColor: "#c8a0a0",
      ringColor: "#dc2626", ringGlow: "0 0 24px rgba(185,28,28,0.25)",
      badgeBg: "rgba(185,28,28,0.12)", cardBg: "#1a0a0a",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "HT-04", vtiFamily: "Heritage-Trust", variant: 4,
    name_ko: "올리브 헤리티지", name_en: "Olive Heritage",
    vibeVector: { warmth: 0.60, energy: 0.30, polish: 0.75, authentic: 0.65, heritage: 0.85, futuristic: 0.22, playful: 0.25 },
    css: {
      bgGradient: "linear-gradient(135deg, #1a1c10 0%, #2e3118 50%, #1a1c10 100%)",
      accentColor: "#6b7c3e", textColor: "#e8ead8", subtextColor: "#a3a878",
      ringColor: "#84a332", ringGlow: "0 0 20px rgba(132,163,50,0.20)",
      badgeBg: "rgba(107,124,62,0.10)", cardBg: "#1a1c10",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "HT-05", vtiFamily: "Heritage-Trust", variant: 5,
    name_ko: "크림 클래식", name_en: "Cream Classic",
    vibeVector: { warmth: 0.65, energy: 0.25, polish: 0.80, authentic: 0.60, heritage: 0.88, futuristic: 0.15, playful: 0.28 },
    css: {
      bgGradient: "linear-gradient(135deg, #faf8f5 0%, #f0ebe3 50%, #faf8f5 100%)",
      accentColor: "#92400e", textColor: "#292524", subtextColor: "#78716c",
      ringColor: "#b45309", ringGlow: "0 0 20px rgba(180,83,9,0.20)",
      badgeBg: "rgba(146,64,14,0.08)", cardBg: "#faf8f5",
      fontFamily: "'Pretendard', sans-serif", borderStyle: "1px solid rgba(146,64,14,0.12)",
    },
  },
];

// ── Raw-Authentic (4개) ──────────────────────────────

const RA: VibeTemplate[] = [
  {
    id: "RA-01", vtiFamily: "Raw-Authentic", variant: 1,
    name_ko: "크라프트 내추럴", name_en: "Craft Natural",
    vibeVector: { warmth: 0.68, energy: 0.48, polish: 0.22, authentic: 0.92, heritage: 0.52, futuristic: 0.32, playful: 0.55 },
    css: {
      bgGradient: "linear-gradient(135deg, #fefdf5 0%, #f5f0e0 50%, #fefdf5 100%)",
      accentColor: "#78716c", textColor: "#292524", subtextColor: "#a8a29e",
      ringColor: "#a8a29e", ringGlow: "0 0 16px rgba(168,162,158,0.20)",
      badgeBg: "rgba(120,113,108,0.08)", cardBg: "#fefdf5",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "RA-02", vtiFamily: "Raw-Authentic", variant: 2,
    name_ko: "어스 톤", name_en: "Earth Tone",
    vibeVector: { warmth: 0.72, energy: 0.42, polish: 0.25, authentic: 0.90, heritage: 0.55, futuristic: 0.28, playful: 0.50 },
    css: {
      bgGradient: "linear-gradient(135deg, #f5f2eb 0%, #e8dfd0 50%, #f5f2eb 100%)",
      accentColor: "#92400e", textColor: "#3b2510", subtextColor: "#a16207",
      ringColor: "#b45309", ringGlow: "0 0 20px rgba(180,83,9,0.18)",
      badgeBg: "rgba(146,64,14,0.08)", cardBg: "#f8f5ee",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "RA-03", vtiFamily: "Raw-Authentic", variant: 3,
    name_ko: "포레스트 그린", name_en: "Forest Green",
    vibeVector: { warmth: 0.65, energy: 0.50, polish: 0.28, authentic: 0.88, heritage: 0.58, futuristic: 0.35, playful: 0.48 },
    css: {
      bgGradient: "linear-gradient(135deg, #0f1a0f 0%, #1a2e1a 50%, #0f1a0f 100%)",
      accentColor: "#4ade80", textColor: "#dcfce7", subtextColor: "#86efac",
      ringColor: "#22c55e", ringGlow: "0 0 24px rgba(34,197,94,0.25)",
      badgeBg: "rgba(74,222,128,0.10)", cardBg: "#0f1a0f",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
  {
    id: "RA-04", vtiFamily: "Raw-Authentic", variant: 4,
    name_ko: "스모키 그레이", name_en: "Smoky Gray",
    vibeVector: { warmth: 0.60, energy: 0.45, polish: 0.30, authentic: 0.85, heritage: 0.48, futuristic: 0.40, playful: 0.52 },
    css: {
      bgGradient: "linear-gradient(135deg, #1c1c1c 0%, #2d2d2d 50%, #1c1c1c 100%)",
      accentColor: "#d4d4d4", textColor: "#f5f5f5", subtextColor: "#a3a3a3",
      ringColor: "#a3a3a3", ringGlow: "0 0 20px rgba(163,163,163,0.20)",
      badgeBg: "rgba(212,212,212,0.10)", cardBg: "#1c1c1c",
      fontFamily: "'Pretendard', sans-serif",
    },
  },
];

// ── 전체 템플릿 내보내기 ─────────────────────────────

/**
 * Parse the first #rrggbb color from a CSS gradient string and return
 * a perceived-luminance value in [0, 1].  Values > 0.5 = light background.
 */
function _bgLuminance(bgGradient: string): number {
  const hex = bgGradient.match(/#([0-9a-fA-F]{6})/)?.[1];
  if (!hex) return 0;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export const ALL_VIBE_TEMPLATES: VibeTemplate[] = [
  ...CC, ...CP, ...FC, ...PS, ...BF, ...HT, ...RA,
].map(t => {
  const isLight = _bgLuminance(t.css.bgGradient) > 0.5;
  return {
    ...t,
    css: {
      ...t.css,
      bgImageUrl: `https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/vibe-backgrounds/${t.id.toLowerCase().replace("-", "_")}.png?v=20260604b`,
      // Light backgrounds → multiply shows texture beautifully on white/cream
      // Dark backgrounds  → luminosity adds glowing highlights on dark gradients
      bgImageBlendMode: isLight ? "multiply" : "luminosity",
      bgImageOpacity:   isLight ? 0.65 : 0.30,
      // For light (near-white) backgrounds, add a subtle accent tint so
      // the multiply blend has a non-white base to work against.
      bgImageTintOpacity: isLight ? 0.10 : 0,
    },
  };
});

export function getTemplateById(id: string): VibeTemplate | undefined {
  return ALL_VIBE_TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesByVTI(vti: VibeVtiType): VibeTemplate[] {
  return ALL_VIBE_TEMPLATES.filter((t) => t.vtiFamily === vti);
}
