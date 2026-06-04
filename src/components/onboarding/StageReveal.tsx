"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Share2, ArrowRight } from "lucide-react";
import type { VibeAnalysisResult } from "@/lib/onboarding/onboarding-types";
import { VIBE_AXES, type Vibe7D } from "@/lib/vibe/vibe-vector";
import { getTemplateById } from "@/lib/vibe/vibe-templates";
import { VibeCard } from "@/components/vibe-card/VibeCard";
import { BeforeAfterReveal } from "./BeforeAfterReveal";

// ── Korean axis labels & bar theming ─────────────────

const AXIS_LABELS: Record<keyof Vibe7D, string> = {
  warmth: "따뜻함",
  energy: "활력",
  polish: "세련됨",
  authentic: "진정성",
  heritage: "전통성",
  futuristic: "혁신성",
  playful: "유쾌함",
};

function getBarColor(value: number): string {
  if (value < 0.65) return "#f97316"; // amber — deficit
  if (value > 0.85) return "#6366f1"; // indigo — surplus
  return "#64748b"; // neutral
}

interface AxisBarProps {
  axis: keyof Vibe7D;
  value: number;
}

function AxisBar({ axis, value }: AxisBarProps) {
  const pct = Math.round(value * 100);
  const isDeficit = value < 0.65;
  const isSurplus = value > 0.85;
  const barColor = getBarColor(value);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-white/70">{AXIS_LABELS[axis]}</span>
          {isDeficit && (
            <span className="text-[9px] font-semibold text-amber-400 px-1.5 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/20">
              ↑ AI 보강
            </span>
          )}
          {isSurplus && (
            <span className="text-[9px] font-semibold text-indigo-400 px-1.5 py-0.5 rounded-full bg-indigo-400/10 border border-indigo-400/20">
              ★ 강점
            </span>
          )}
        </div>
        <span
          className="tabular-nums font-bold text-xs"
          style={{ color: barColor }}
        >
          {pct}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: barColor }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────

export interface StageRevealProps {
  vibeResult: VibeAnalysisResult;
  photoUrl: string;
  onContinue: () => void;
  onShareBeforeLogin: () => void;
}

export function StageReveal({
  vibeResult,
  photoUrl,
  onContinue,
  onShareBeforeLogin,
}: StageRevealProps) {
  const [revealDone, setRevealDone] = useState(false);

  const { vtiResult, matchedTemplateId, beforeScores, afterScores, photoVibe, description } =
    vibeResult;

  const template = getTemplateById(matchedTemplateId);
  const css = template?.css;

  function handleRevealComplete() {
    setRevealDone(true);
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 pt-20 pb-12"
      style={{ background: "linear-gradient(180deg, #09090b 0%, #0f0f12 100%)" }}
    >
      {/* Phase 1: BeforeAfterReveal */}
      <BeforeAfterReveal
        photoUrl={photoUrl}
        photoVibe={photoVibe}
        matchedTemplateId={matchedTemplateId}
        beforeTrust={beforeScores.trust}
        beforeValence={beforeScores.valence}
        afterTrust={afterScores.trust}
        afterValence={afterScores.valence}
        vtiMeta={vtiResult.meta}
        onRevealComplete={handleRevealComplete}
      />

      {/* Phase 2: Detailed reveal — slides in after BeforeAfterReveal completes */}
      <AnimatePresence>
        {revealDone && (
          <motion.div
            className="w-full max-w-sm mt-8 space-y-8"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* ── Full VibeCard preview ── */}
            <div>
              <p className="text-xs text-white/40 text-center mb-3 uppercase tracking-widest font-semibold">
                당신의 Vibe 명함
              </p>
              <VibeCard
                brokerName="홍길동"
                company="(이름 추가 후 완성)"
                photoUrl={photoUrl}
                templateId={matchedTemplateId}
                vibeVti={vtiResult.meta.type}
                vibeScores={{
                  trust: afterScores.trust,
                  valence: afterScores.valence,
                  coherence: afterScores.coherence,
                }}
                tagline={description}
              />
            </div>

            {/* ── 7D Radar bars ── */}
            <motion.div
              className="rounded-2xl p-5 space-y-3"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  7D Vibe 분석
                </p>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: `${vtiResult.meta.color}15`,
                    color: vtiResult.meta.color,
                    border: `1px solid ${vtiResult.meta.color}30`,
                  }}
                >
                  {vtiResult.meta.emoji} {vtiResult.meta.label_ko}
                </span>
              </div>

              {VIBE_AXES.map((axis) => (
                <AxisBar key={axis} axis={axis} value={photoVibe[axis]} />
              ))}

              {/* Legend */}
              <div className="flex items-center gap-4 pt-1 border-t border-white/[0.06]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                  <span className="text-[9px] text-white/40">AI가 보강함</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-400/80" />
                  <span className="text-[9px] text-white/40">강점 축</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-500/80" />
                  <span className="text-[9px] text-white/40">균형</span>
                </div>
              </div>
            </motion.div>

            {/* ── AI Description ── */}
            {description && (
              <motion.div
                className="rounded-2xl p-4"
                style={{
                  background: css
                    ? `${css.accentColor}0A`
                    : "rgba(99,102,241,0.06)",
                  border: css
                    ? `1px solid ${css.accentColor}20`
                    : "1px solid rgba(99,102,241,0.15)",
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35 }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-2"
                  style={{ color: css?.accentColor ?? "#a5b4fc" }}>
                  AI 분석 코멘트
                </p>
                <p className="text-sm text-white/70 leading-relaxed italic">
                  &ldquo;{description}&rdquo;
                </p>
              </motion.div>
            )}

            {/* ── CTAs ── */}
            <motion.div
              className="space-y-3 pt-2"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
            >
              {/* Primary CTA */}
              <button
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-base font-bold tracking-tight transition-all active:scale-[0.97]"
                style={{
                  background: css
                    ? `linear-gradient(135deg, ${css.accentColor}, ${css.ringColor})`
                    : "linear-gradient(135deg, #2563eb, #6366f1)",
                  color: "#ffffff",
                  boxShadow: css
                    ? `0 6px 28px ${css.accentColor}40`
                    : "0 6px 28px rgba(99,102,241,0.35)",
                }}
                onClick={onContinue}
              >
                이름 추가하고 명함 완성하기
                <ArrowRight size={18} />
              </button>

              {/* Secondary CTA */}
              <button
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold transition-all active:scale-[0.97]"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.65)",
                }}
                onClick={onShareBeforeLogin}
              >
                <Share2 size={15} />
                📱 지금 바로 공유하기 (임시)
              </button>
            </motion.div>

            {/* Powered by note */}
            <p className="text-center text-[10px] text-white/20 pt-1">
              Powered by <span className="text-white/35 font-semibold">DealCard</span> · Vibe AI
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
