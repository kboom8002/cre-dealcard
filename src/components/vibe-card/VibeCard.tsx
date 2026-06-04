"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { MapPin, BarChart3, Handshake } from "lucide-react";
import type { VibeVtiType } from "@/lib/vibe/vibe-vector";
import { getTemplateById } from "@/lib/vibe/vibe-templates";
import { VibePhotoRing } from "./VibePhotoRing";
import { VibeBadge } from "./VibeBadge";
import { VibeBackground } from "./VibeBackground";

// ── Types ─────────────────────────────────────────────

export interface VibeCardProps {
  brokerName: string;
  company?: string;
  photoUrl?: string;
  templateId: string;
  vibeVti: VibeVtiType;
  vibeScores: { valence: number; trust: number; coherence: number };
  stats?: { dealCount: number; matchRate?: number; regions: string[] };
  tagline?: string;
  ctaLinks?: { label: string; href: string; icon: string }[];
  compact?: boolean;
}

// ── Score Bar ─────────────────────────────────────────

function ScoreBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-10 opacity-60 font-medium shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
        />
      </div>
      <span className="w-8 text-right tabular-nums opacity-70 font-semibold">
        {pct}
      </span>
    </div>
  );
}

// ── Main VibeCard ─────────────────────────────────────

export function VibeCard({
  brokerName,
  company,
  photoUrl,
  templateId,
  vibeVti,
  vibeScores,
  stats,
  tagline,
  ctaLinks,
  compact = false,
}: VibeCardProps) {
  const template = useMemo(() => getTemplateById(templateId), [templateId]);

  // Fallback if template not found
  if (!template) {
    return (
      <div className="w-full max-w-sm mx-auto rounded-2xl border border-red-200 p-6 text-center text-sm text-red-400">
        Template &quot;{templateId}&quot; not found
      </div>
    );
  }

  const { css } = template;

  // ── Compact mode ──────────────────────────────────
  if (compact) {
    return (
      <VibeBackground
        css={css}
        className="w-full max-w-sm mx-auto rounded-2xl overflow-hidden shadow-xl"
      >
        <div className="flex items-center gap-3 p-4">
          <VibePhotoRing
            photoUrl={photoUrl}
            name={brokerName}
            vtiType={vibeVti}
            ringColor={css.ringColor}
            ringGlow={css.ringGlow}
            coherence={vibeScores.coherence}
            size={56}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-bold text-sm truncate" style={{ color: css.textColor }}>
                {brokerName}
              </span>
              <VibeBadge vtiType={vibeVti} size="sm" />
            </div>
            {company && (
              <p className="text-[11px] truncate" style={{ color: css.subtextColor }}>
                {company}
              </p>
            )}
            {stats && (
              <div className="flex items-center gap-3 mt-1 text-[10px] font-medium" style={{ color: css.subtextColor }}>
                <span>📊 {stats.dealCount}건</span>
                {stats.matchRate != null && (
                  <span>🎯 {Math.round(stats.matchRate * 100)}%</span>
                )}
              </div>
            )}
          </div>
        </div>
      </VibeBackground>
    );
  }

  // ── Full Card ─────────────────────────────────────
  return (
    <motion.div
      className="w-full max-w-sm mx-auto"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <VibeBackground
        css={css}
        className="rounded-3xl overflow-hidden shadow-2xl"
      >
        {/* ── 1. Header: Photo + Name + Badge ── */}
        <div className="flex flex-col items-center pt-8 pb-5 px-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <VibePhotoRing
              photoUrl={photoUrl}
              name={brokerName}
              vtiType={vibeVti}
              ringColor={css.ringColor}
              ringGlow={css.ringGlow}
              coherence={vibeScores.coherence}
              size={104}
            />
          </motion.div>

          <motion.h2
            className="mt-4 text-xl font-bold tracking-tight"
            style={{ color: css.textColor }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {brokerName}
          </motion.h2>

          {company && (
            <p
              className="text-xs mt-1 font-medium tracking-wide"
              style={{ color: css.subtextColor }}
            >
              {company}
            </p>
          )}

          <motion.div
            className="mt-3"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <VibeBadge vtiType={vibeVti} size="md" />
          </motion.div>
        </div>

        {/* ── 2. Stats Row ── */}
        {stats && (
          <motion.div
            className="grid grid-cols-3 gap-2 px-6 pb-5"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            {/* Deal Count */}
            <div
              className="rounded-xl p-3 text-center backdrop-blur-sm"
              style={{ backgroundColor: `${css.accentColor}0D` }}
            >
              <Handshake
                className="mx-auto mb-1 opacity-60"
                size={18}
                style={{ color: css.accentColor }}
              />
              <p className="text-lg font-bold tabular-nums" style={{ color: css.textColor }}>
                {stats.dealCount}
              </p>
              <p className="text-[9px] font-medium uppercase tracking-wider" style={{ color: css.subtextColor }}>
                거래 실적
              </p>
            </div>

            {/* Match Rate */}
            <div
              className="rounded-xl p-3 text-center backdrop-blur-sm"
              style={{ backgroundColor: `${css.accentColor}0D` }}
            >
              <BarChart3
                className="mx-auto mb-1 opacity-60"
                size={18}
                style={{ color: css.accentColor }}
              />
              <p className="text-lg font-bold tabular-nums" style={{ color: css.textColor }}>
                {stats.matchRate != null ? `${Math.round(stats.matchRate * 100)}%` : "—"}
              </p>
              <p className="text-[9px] font-medium uppercase tracking-wider" style={{ color: css.subtextColor }}>
                매칭률
              </p>
            </div>

            {/* Regions */}
            <div
              className="rounded-xl p-3 text-center backdrop-blur-sm"
              style={{ backgroundColor: `${css.accentColor}0D` }}
            >
              <MapPin
                className="mx-auto mb-1 opacity-60"
                size={18}
                style={{ color: css.accentColor }}
              />
              <p
                className="text-sm font-bold leading-tight line-clamp-2"
                style={{ color: css.textColor }}
              >
                {stats.regions.slice(0, 2).join(" · ")}
              </p>
              <p className="text-[9px] font-medium uppercase tracking-wider" style={{ color: css.subtextColor }}>
                주요 지역
              </p>
            </div>
          </motion.div>
        )}

        {/* ── 3. Tagline ── */}
        {tagline && (
          <motion.div
            className="px-6 pb-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <p
              className="text-sm leading-relaxed text-center italic"
              style={{ color: css.subtextColor }}
            >
              &ldquo;{tagline}&rdquo;
            </p>
          </motion.div>
        )}

        {/* ── 4. CTA Buttons ── */}
        {ctaLinks && ctaLinks.length > 0 && (
          <motion.div
            className="px-6 pb-5 space-y-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
          >
            {ctaLinks.map((cta, i) => (
              <a
                key={i}
                href={cta.href}
                className={cn(
                  "flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-semibold",
                  "transition-all duration-200 active:scale-[0.97]",
                  i === 0
                    ? "shadow-lg hover:shadow-xl hover:brightness-110"
                    : "backdrop-blur-sm hover:brightness-125",
                )}
                style={
                  i === 0
                    ? {
                        background: `linear-gradient(135deg, ${css.accentColor}, ${css.ringColor})`,
                        color: "#fff",
                      }
                    : {
                        backgroundColor: `${css.accentColor}15`,
                        color: css.accentColor,
                        border: `1px solid ${css.accentColor}25`,
                      }
                }
              >
                <span>{cta.icon}</span>
                {cta.label}
              </a>
            ))}
          </motion.div>
        )}

        {/* ── 5. Footer: Scores + Branding ── */}
        <motion.div
          className="px-6 pt-4 pb-5 space-y-3"
          style={{
            borderTop: `1px solid ${css.accentColor}15`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="space-y-1.5">
            <ScoreBar label="신뢰" value={vibeScores.trust} color={css.ringColor} />
            <ScoreBar label="호감" value={vibeScores.valence} color={css.accentColor} />
          </div>

          <p
            className="text-[10px] text-center font-medium tracking-wide pt-1"
            style={{ color: `${css.subtextColor}99` }}
          >
            Powered by{" "}
            <span className="font-bold" style={{ color: css.subtextColor }}>
              DealCard
            </span>
            {" "}· Vibe AI
          </p>
        </motion.div>
      </VibeBackground>
    </motion.div>
  );
}
