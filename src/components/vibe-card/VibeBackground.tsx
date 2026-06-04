"use client";

import type { VibeTemplateCssVars } from "@/lib/vibe/vibe-templates";

interface VibeBackgroundProps {
  css: VibeTemplateCssVars;
  children: React.ReactNode;
  className?: string;
}

/**
 * Renders a premium background container with the template's gradient,
 * subtle noise overlay, and optional pattern SVG for depth.
 */
export function VibeBackground({ css, children, className }: VibeBackgroundProps) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        background: css.bgGradient,
        color: css.textColor,
        fontFamily: css.fontFamily,
        border: css.borderStyle ?? "none",
        overflow: "hidden",
        isolation: "isolate",
      }}
    >
      {/* ── Noise texture overlay ── */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.04,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* ── Optional pattern SVG ── */}
      {css.patternSvg && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url("${css.patternSvg}")`,
            backgroundRepeat: "repeat",
            opacity: 0.03,
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      )}

      {/* ── Content layer ── */}
      <div style={{ position: "relative", zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}
