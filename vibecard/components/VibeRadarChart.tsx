"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import type { VibeTemplateCssVars } from "@/lib/vibe/vibe-templates";

interface VibeRadarChartProps {
  vector: Record<string, number>;
  complement?: Record<string, number> | null;
  css: VibeTemplateCssVars;
  size?: number;
}

const AXIS_KEYS = [
  "warmth",
  "energy",
  "polish",
  "authentic",
  "heritage",
  "futuristic",
  "playful",
];

const AXIS_LABELS: Record<string, { label: string; emoji: string }> = {
  warmth: { label: "온화함", emoji: "🔥" },
  energy: { label: "활기", emoji: "⚡" },
  polish: { label: "세련미", emoji: "💎" },
  authentic: { label: "진정성", emoji: "🌱" },
  heritage: { label: "전통성", emoji: "🏛️" },
  futuristic: { label: "미래지향", emoji: "🚀" },
  playful: { label: "유쾌함", emoji: "🎭" },
};

export function VibeRadarChart({
  vector,
  complement,
  css,
  size = 280,
}: VibeRadarChartProps) {
  const center = size / 2;
  const maxRadius = size * 0.35; // Leave space for labels

  // Calculate coordinates for a given vector
  const getPoints = useMemo(() => {
    return (vec: Record<string, number>) => {
      return AXIS_KEYS.map((key, i) => {
        const value = vec[key] ?? 0;
        const angle = i * ((2 * Math.PI) / 7) - Math.PI / 2;
        const r = value * maxRadius;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return { x, y, key };
      });
    };
  }, [center, maxRadius]);

  const mainPoints = useMemo(() => getPoints(vector), [vector, getPoints]);
  const complementPoints = useMemo(() => {
    return complement ? getPoints(complement) : null;
  }, [complement, getPoints]);

  // Main polygon path
  const mainPath = useMemo(() => {
    return mainPoints.map((p) => `${p.x},${p.y}`).join(" ");
  }, [mainPoints]);

  // Complement polygon path
  const complementPath = useMemo(() => {
    return complementPoints
      ? complementPoints.map((p) => `${p.x},${p.y}`).join(" ")
      : "";
  }, [complementPoints]);

  // Generate grid circles/polygons (ticks at 25%, 50%, 75%, 100%)
  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const gridPolygons = useMemo(() => {
    return gridLevels.map((level) => {
      return AXIS_KEYS.map((_, i) => {
        const angle = i * ((2 * Math.PI) / 7) - Math.PI / 2;
        const r = level * maxRadius;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return `${x},${y}`;
      }).join(" ");
    });
  }, [center, maxRadius]);

  // Generate outer labels coordinates
  const labels = useMemo(() => {
    return AXIS_KEYS.map((key, i) => {
      const angle = i * ((2 * Math.PI) / 7) - Math.PI / 2;
      const r = maxRadius + 22; // Distance from center
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      
      // Text anchor alignment based on angle position
      let textAnchor: "start" | "end" | "middle" = "middle";
      if (Math.cos(angle) > 0.1) textAnchor = "start";
      else if (Math.cos(angle) < -0.1) textAnchor = "end";

      return {
        x,
        y: y + 4, // Visual vertical alignment offset
        textAnchor,
        info: AXIS_LABELS[key],
        val: Math.round((vector[key] ?? 0) * 100),
      };
    });
  }, [center, maxRadius, vector]);

  return (
    <div className="flex flex-col items-center justify-center select-none">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
      >
        <defs>
          {/* Main Area Gradient */}
          <radialGradient id="radar-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={css.ringColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={css.accentColor} stopOpacity="0.4" />
          </radialGradient>
        </defs>

        {/* 1. Grid Background (7-sided polygons for ticks) */}
        {gridPolygons.map((points, index) => (
          <polygon
            key={index}
            points={points}
            fill="none"
            stroke={css.textColor}
            strokeOpacity={0.08}
            strokeWidth={1}
          />
        ))}

        {/* 2. Grid Axis Lines (from center to each vertex) */}
        {AXIS_KEYS.map((_, i) => {
          const angle = i * ((2 * Math.PI) / 7) - Math.PI / 2;
          const x = center + maxRadius * Math.cos(angle);
          const y = center + maxRadius * Math.sin(angle);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke={css.textColor}
              strokeOpacity={0.08}
              strokeWidth={1}
            />
          );
        })}

        {/* 3. Complementary Vector (Optional Overlay - dotted dashed) */}
        {complementPoints && (
          <motion.polygon
            points={complementPath}
            fill="none"
            stroke={css.ringColor}
            strokeOpacity={0.5}
            strokeDasharray="4 3"
            strokeWidth={1.5}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        )}

        {/* 4. Main Vector Area */}
        <motion.polygon
          points={mainPath}
          fill="url(#radar-glow)"
          stroke={css.accentColor}
          strokeWidth={2}
          strokeLinejoin="round"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.15 }}
        />

        {/* 5. Main Vector Data Points */}
        {mainPoints.map((p, i) => (
          <motion.circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3.5}
            fill={css.accentColor}
            stroke={css.textColor}
            strokeWidth={1}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, delay: 0.5 + i * 0.05 }}
          />
        ))}

        {/* 6. Labels */}
        {labels.map((l, i) => (
          <g key={i} className="text-[10px] font-semibold tracking-tight">
            {/* Emoji + Korean Label */}
            <text
              x={l.x}
              y={l.y - 6}
              textAnchor={l.textAnchor}
              fill={css.textColor}
              style={{ fillOpacity: 0.9 }}
            >
              {l.info.emoji} {l.info.label}
            </text>
            {/* Score percentage */}
            <text
              x={l.x}
              y={l.y + 6}
              textAnchor={l.textAnchor}
              fill={css.accentColor}
              className="font-bold font-mono"
            >
              {l.val}%
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
