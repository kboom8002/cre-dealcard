"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { VibeVtiType } from "@/lib/vibe/vibe-vector";

// ── Animation speed per VTI type (seconds per full rotation) ──
const VTI_RING_SPEED: Record<VibeVtiType, number> = {
  "Calm-Care":       12,
  "Calm-Polished":   14,
  "Focus-Competent":  8,
  "Play-Spark":       5,
  "Bold-Futurist":    4,
  "Heritage-Trust":  16,
  "Raw-Authentic":   10,
};

interface VibePhotoRingProps {
  photoUrl?: string;
  name: string;
  vtiType: VibeVtiType;
  ringColor: string;
  ringGlow: string;
  coherence?: number;
  size?: number;
}

export function VibePhotoRing({
  photoUrl,
  name,
  vtiType,
  ringColor,
  ringGlow,
  coherence = 0.7,
  size = 96,
}: VibePhotoRingProps) {
  const ringThickness = useMemo(
    () => Math.round(2 + coherence * 4), // 2px → 6px
    [coherence],
  );

  const animDuration = VTI_RING_SPEED[vtiType] ?? 10;
  const innerSize = size - ringThickness * 2 - 4; // 4px inner gap
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      {/* ── Animated conic-gradient ring ── */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(
            ${ringColor},
            transparent 40%,
            ${ringColor} 60%,
            transparent 80%,
            ${ringColor}
          )`,
          boxShadow: ringGlow,
          animation: `vibe-ring-spin ${animDuration}s linear infinite`,
        }}
      />

      {/* ── Solid ring border fallback (non-rotating layer) ── */}
      <div
        className="absolute rounded-full"
        style={{
          inset: 0,
          border: `${ringThickness}px solid ${ringColor}`,
          opacity: 0.25,
        }}
      />

      {/* ── Inner photo / initial circle ── */}
      <div
        className="absolute rounded-full overflow-hidden bg-white/10 backdrop-blur-sm
                   flex items-center justify-center"
        style={{
          width: innerSize,
          height: innerSize,
          top: ringThickness + 2,
          left: ringThickness + 2,
        }}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={name}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <span
            className="font-bold select-none"
            style={{
              fontSize: innerSize * 0.4,
              color: ringColor,
            }}
          >
            {initial}
          </span>
        )}
      </div>

      {/* ── Coherence shimmer highlight ── */}
      <div
        className={cn(
          "absolute inset-0 rounded-full pointer-events-none",
          "opacity-0",
          coherence > 0.8 && "animate-pulse opacity-30",
        )}
        style={{
          boxShadow: `inset 0 0 ${size / 4}px ${ringColor}`,
        }}
      />

      {/* ── Keyframe injection ── */}
      <style>{`
        @keyframes vibe-ring-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
