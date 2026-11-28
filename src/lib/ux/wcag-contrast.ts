/**
 * Computed WCAG 2.1 Contrast Utility
 *
 * Parses CSS hex / rgb() / rgba() colors, performs alpha compositing over
 * translucent glass surfaces and backdrops, and computes WCAG 2.1 relative
 * luminance and contrast ratios.
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface RgbaColor extends RgbColor {
  a: number;
}

const NAMED_COLORS: Record<string, RgbaColor> = {
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseAlpha(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.endsWith("%")) {
    return clamp(parseFloat(trimmed.slice(0, -1)) / 100, 0, 1);
  }
  const parsed = parseFloat(trimmed);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid alpha value: ${raw}`);
  }
  return clamp(parsed, 0, 1);
}

function parseChannel(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.endsWith("%")) {
    return clamp((parseFloat(trimmed.slice(0, -1)) / 100) * 255, 0, 255);
  }
  const parsed = parseFloat(trimmed);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid RGB channel value: ${raw}`);
  }
  return clamp(parsed, 0, 255);
}

/**
 * Parses a CSS color string (`#RGB`, `#RRGGBB`, `#RRGGBBAA`, `rgb(...)`, `rgba(...)`, or basic named colors).
 */
export function parseCssColor(input: string): RgbaColor {
  const normalized = input.trim().toLowerCase();

  if (normalized in NAMED_COLORS) {
    return { ...NAMED_COLORS[normalized] };
  }

  if (normalized.startsWith("#")) {
    const hex = normalized.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
      if ([r, g, b, a].some(Number.isNaN)) {
        throw new Error(`Invalid hex color: ${input}`);
      }
      return { r, g, b, a };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      if ([r, g, b, a].some(Number.isNaN)) {
        throw new Error(`Invalid hex color: ${input}`);
      }
      return { r, g, b, a };
    }
    throw new Error(`Unsupported hex color length: ${input}`);
  }

  const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/);
  if (rgbMatch) {
    const body = rgbMatch[1].trim();
    if (body.includes(",")) {
      const parts = body.split(",").map((s) => s.trim());
      if (parts.length !== 3 && parts.length !== 4) {
        throw new Error(`Invalid rgb/rgba syntax: ${input}`);
      }
      return {
        r: parseChannel(parts[0]),
        g: parseChannel(parts[1]),
        b: parseChannel(parts[2]),
        a: parts.length === 4 ? parseAlpha(parts[3]) : 1,
      };
    }

    // CSS Color Level 4 space-separated syntax: rgb(255 255 255 / 0.72)
    const [rgbPart, alphaPart] = body.split("/").map((s) => s.trim());
    const channels = rgbPart.split(/\s+/);
    if (channels.length !== 3) {
      throw new Error(`Invalid rgb/rgba syntax: ${input}`);
    }
    return {
      r: parseChannel(channels[0]),
      g: parseChannel(channels[1]),
      b: parseChannel(channels[2]),
      a: alphaPart !== undefined ? parseAlpha(alphaPart) : 1,
    };
  }

  throw new Error(`Unsupported CSS color format: ${input}`);
}

/**
 * Porter-Duff source-over alpha compositing of `fg` over `bg`.
 */
export function compositeRgba(fg: RgbaColor, bg: RgbaColor): RgbaColor {
  const outA = fg.a + bg.a * (1 - fg.a);
  if (outA <= 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / outA,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / outA,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / outA,
    a: outA,
  };
}

function linearizeChannel(channel255: number): number {
  const srgb = clamp(channel255 / 255, 0, 1);
  return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

/**
 * Computes WCAG 2.1 relative luminance in [0, 1] for an opaque sRGB color.
 */
export function relativeLuminance(rgb: RgbColor): number {
  const r = linearizeChannel(rgb.r);
  const g = linearizeChannel(rgb.g);
  const b = linearizeChannel(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Computes the WCAG 2.1 contrast ratio between `fgCss` and `bgCss`,
 * compositing translucent colors over `backdropCss` (defaults to `#FFFFFF`).
 */
export function getContrastRatio(
  fgCss: string,
  bgCss: string,
  backdropCss: string = "#FFFFFF"
): number {
  const backdropRaw = parseCssColor(backdropCss);
  const opaqueBackdrop =
    backdropRaw.a < 1
      ? compositeRgba(backdropRaw, { r: 255, g: 255, b: 255, a: 1 })
      : backdropRaw;

  const bgRaw = parseCssColor(bgCss);
  const resolvedBg = bgRaw.a < 1 ? compositeRgba(bgRaw, opaqueBackdrop) : bgRaw;

  const fgRaw = parseCssColor(fgCss);
  const resolvedFg = fgRaw.a < 1 ? compositeRgba(fgRaw, resolvedBg) : fgRaw;

  const lumFg = relativeLuminance(resolvedFg);
  const lumBg = relativeLuminance(resolvedBg);
  const lighter = Math.max(lumFg, lumBg);
  const darker = Math.min(lumFg, lumBg);

  return (lighter + 0.05) / (darker + 0.05);
}
