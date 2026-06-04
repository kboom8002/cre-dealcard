"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Vibe7D, VtiMeta } from "@/lib/vibe/vibe-vector";
import { getTemplateById } from "@/lib/vibe/vibe-templates";
import { VibeBackground } from "@/components/vibe-card/VibeBackground";
import { VibePhotoRing } from "@/components/vibe-card/VibePhotoRing";
import { CountUpNumber } from "./CountUpNumber";
import { hapticLight, hapticSuccess, hapticCelebrate } from "./HapticFeedback";

export interface BeforeAfterRevealProps {
  photoUrl: string;
  photoVibe: Vibe7D;
  matchedTemplateId: string;
  beforeTrust: number;   // 0–1
  beforeValence: number; // 0–1
  afterTrust: number;    // 0–1
  afterValence: number;  // 0–1
  vtiMeta: VtiMeta;
  onRevealComplete: () => void;
}

type Phase =
  | "before"       // 0s   – plain card, before scores
  | "searching"    // 1.5s – "AI가 최적 배경을 찾고 있습니다..."
  | "bg_reveal"    // 2.5s – vibe bg fades in
  | "count_trust"  // 3.5s – trust count-up
  | "count_val"    // 4.0s – valence count-up
  | "badge_up"     // 5.5s – "+N점 상승!" badge
  | "vti_badge"    // 6.5s – VTI badge shown
  | "complete";    // 8.0s – done

const PHASE_TIMES: { phase: Phase; ms: number }[] = [
  { phase: "before",      ms: 0    },
  { phase: "searching",   ms: 1500 },
  { phase: "bg_reveal",   ms: 2500 },
  { phase: "count_trust", ms: 3500 },
  { phase: "count_val",   ms: 4000 },
  { phase: "badge_up",    ms: 5500 },
  { phase: "vti_badge",   ms: 6500 },
  { phase: "complete",    ms: 8000 },
];

function useSequence(onComplete: () => void) {
  const [phase, setPhase] = useState<Phase>("before");
  const onCompleteRef = useRef(onComplete);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    // Schedule all phase transitions
    PHASE_TIMES.forEach(({ phase: p, ms }) => {
      if (ms === 0) return;
      const t = setTimeout(() => {
        setPhase(p);
        // Haptic cues at key moments
        if (p === "bg_reveal") hapticLight();
        if (p === "badge_up") { hapticSuccess(); }
        if (p === "vti_badge") hapticCelebrate();
        if (p === "complete") onCompleteRef.current();
      }, ms);
      timersRef.current.push(t);
    });

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return phase;
}

export function BeforeAfterReveal({
  photoUrl,
  matchedTemplateId,
  beforeTrust,
  beforeValence,
  afterTrust,
  afterValence,
  vtiMeta,
  onRevealComplete,
}: BeforeAfterRevealProps) {
  const phase = useSequence(onRevealComplete);
  const template = getTemplateById(matchedTemplateId);
  const css = template?.css;

  const trustDiff = Math.round((afterTrust - beforeTrust) * 100);
  const valueDiff = Math.round((afterValence - beforeValence) * 100);
  const totalDiff = trustDiff + valueDiff;

  const showVibeBackground = [
    "bg_reveal",
    "count_trust",
    "count_val",
    "badge_up",
    "vti_badge",
    "complete",
  ].includes(phase);

  const showCountTrust = [
    "count_trust",
    "count_val",
    "badge_up",
    "vti_badge",
    "complete",
  ].includes(phase);

  const showCountVal = [
    "count_val",
    "badge_up",
    "vti_badge",
    "complete",
  ].includes(phase);

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto">
      {/* ── Card container with layered backgrounds ── */}
      <div className="relative w-full rounded-3xl overflow-hidden shadow-2xl" style={{ minHeight: 320 }}>
        {/* Layer 1: Plain dark background (always present) */}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, #18181b 0%, #27272a 100%)",
          }}
        />

        {/* Layer 2: Vibe template background (fades in at 2.5s) */}
        {css && (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: showVibeBackground ? 1 : 0 }}
            transition={{ duration: 1, ease: "easeInOut" }}
          >
            <VibeBackground css={css} className="absolute inset-0">
              {/* empty — just for background rendering */}
              <div />
            </VibeBackground>
          </motion.div>
        )}

        {/* Card content — positioned above both background layers */}
        <div className="relative z-10 flex flex-col items-center px-6 pt-8 pb-6">
          {/* Photo ring */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <VibePhotoRing
              photoUrl={photoUrl}
              name="홍길동"
              vtiType={vtiMeta.type}
              ringColor={showVibeBackground && css ? css.ringColor : "#6b7280"}
              ringGlow={showVibeBackground && css ? css.ringGlow : "0 0 16px rgba(107,114,128,0.2)"}
              coherence={0.75}
              size={112}
            />
          </motion.div>

          {/* Name placeholder */}
          <motion.p
            className="mt-3 font-bold text-lg"
            style={{
              color:
                showVibeBackground && css ? css.textColor : "rgba(255,255,255,0.9)",
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            홍길동
          </motion.p>

          {/* "Searching" label */}
          <AnimatePresence>
            {phase === "searching" && (
              <motion.p
                className="text-xs text-white/60 mt-2 text-center"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                🔍 AI가 최적 배경을 찾고 있습니다...
              </motion.p>
            )}
          </AnimatePresence>

          {/* Score section */}
          <div className="w-full mt-5 space-y-3">
            {/* Trust score */}
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-medium"
                style={{
                  color:
                    showVibeBackground && css
                      ? css.subtextColor
                      : "rgba(255,255,255,0.45)",
                }}
              >
                신뢰도
              </span>
              <div className="flex items-center gap-2">
                <motion.div
                  className="h-1.5 rounded-full overflow-hidden flex-1"
                  style={{ width: 80, background: "rgba(255,255,255,0.1)" }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background:
                        showVibeBackground && css
                          ? css.ringColor
                          : "rgba(107,114,128,0.6)",
                    }}
                    animate={{
                      width: showCountTrust
                        ? `${Math.round(afterTrust * 100)}%`
                        : `${Math.round(beforeTrust * 100)}%`,
                    }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                  />
                </motion.div>
                <span
                  className="text-sm font-bold tabular-nums w-8 text-right"
                  style={{
                    color:
                      showCountTrust
                        ? (showVibeBackground && css ? css.textColor : "white")
                        : "rgba(255,255,255,0.4)",
                  }}
                >
                  {showCountTrust ? (
                    <CountUpNumber
                      from={Math.round(beforeTrust * 100)}
                      to={Math.round(afterTrust * 100)}
                      duration={1200}
                    />
                  ) : (
                    Math.round(beforeTrust * 100)
                  )}
                </span>
              </div>
            </div>

            {/* Valence score */}
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-medium"
                style={{
                  color:
                    showVibeBackground && css
                      ? css.subtextColor
                      : "rgba(255,255,255,0.45)",
                }}
              >
                호감도
              </span>
              <div className="flex items-center gap-2">
                <motion.div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ width: 80, background: "rgba(255,255,255,0.1)" }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background:
                        showVibeBackground && css
                          ? css.accentColor
                          : "rgba(107,114,128,0.6)",
                    }}
                    animate={{
                      width: showCountVal
                        ? `${Math.round(afterValence * 100)}%`
                        : `${Math.round(beforeValence * 100)}%`,
                    }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                  />
                </motion.div>
                <span
                  className="text-sm font-bold tabular-nums w-8 text-right"
                  style={{
                    color:
                      showCountVal
                        ? (showVibeBackground && css ? css.textColor : "white")
                        : "rgba(255,255,255,0.4)",
                  }}
                >
                  {showCountVal ? (
                    <CountUpNumber
                      from={Math.round(beforeValence * 100)}
                      to={Math.round(afterValence * 100)}
                      duration={1200}
                    />
                  ) : (
                    Math.round(beforeValence * 100)
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* "+N점 상승!" badge */}
          <AnimatePresence>
            {["badge_up", "vti_badge", "complete"].includes(phase) && (
              <motion.div
                className="mt-5 px-5 py-2 rounded-full font-bold text-sm"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(34,197,94,0.25), rgba(16,185,129,0.25))",
                  border: "1.5px solid rgba(34,197,94,0.5)",
                  color: "#4ade80",
                  boxShadow:
                    "0 0 24px rgba(34,197,94,0.25), 0 0 48px rgba(34,197,94,0.1)",
                }}
                initial={{ opacity: 0, scale: 0.6, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: "spring", stiffness: 400, damping: 18 }}
              >
                ⬆ +{totalDiff}점 상승!
              </motion.div>
            )}
          </AnimatePresence>

          {/* VTI type badge */}
          <AnimatePresence>
            {["vti_badge", "complete"].includes(phase) && (
              <motion.div
                className="mt-3 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold"
                style={{
                  background: `${vtiMeta.color}18`,
                  border: `1.5px solid ${vtiMeta.color}40`,
                  color: vtiMeta.color,
                }}
                initial={{ opacity: 0, scale: 0.8, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 350, damping: 20 }}
              >
                <span role="img" aria-label={vtiMeta.label_ko}>
                  {vtiMeta.emoji}
                </span>
                {vtiMeta.label_ko}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom label */}
      <AnimatePresence>
        {phase === "before" && (
          <motion.p
            className="mt-4 text-xs text-white/40 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            AI가 최적 배경을 찾는 중입니다...
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
