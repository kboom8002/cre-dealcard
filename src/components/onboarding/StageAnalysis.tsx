"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2 } from "lucide-react";
import { SocialProofCarousel } from "./SocialProofCarousel";

interface AnalysisStep {
  id: number;
  /** Label while in progress */
  pendingLabel: string;
  /** Label once completed */
  doneLabel: string;
  /** When (seconds from start) this step begins showing as "in progress" */
  startSec: number;
  /** When this step becomes "done" */
  doneSec: number;
}

const STEPS: AnalysisStep[] = [
  { id: 0, pendingLabel: "표정 분석 중...",      doneLabel: "표정 분석 완료",      startSec: 0,  doneSec: 3  },
  { id: 1, pendingLabel: "색감 분석 중...",      doneLabel: "색감 분석 완료",      startSec: 3,  doneSec: 6  },
  { id: 2, pendingLabel: "전문성 인상 분석 중...", doneLabel: "전문성 인상 분석 완료", startSec: 6, doneSec: 10 },
  { id: 3, pendingLabel: "신뢰도 벡터 산출 중...", doneLabel: "신뢰도 벡터 산출 완료", startSec: 10, doneSec: 14 },
  { id: 4, pendingLabel: "프로필 생성 중...",    doneLabel: "프로필 생성 완료",    startSec: 14, doneSec: 18 },
];

const TOTAL_DURATION_SEC = 18;

type StepStatus = "pending" | "active" | "done";

interface StageAnalysisProps {
  photoPreviewUrl: string;
  /** Called only when BOTH the 18s timer and isApiComplete are true */
  onAnalysisDone: () => void;
  /** Set by parent when API returns */
  isApiComplete: boolean;
}

export function StageAnalysis({
  photoPreviewUrl,
  onAnalysisDone,
  isApiComplete,
}: StageAnalysisProps) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [timerDone, setTimerDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onDoneRef = useRef(onAnalysisDone);
  const calledRef = useRef(false);

  useEffect(() => {
    onDoneRef.current = onAnalysisDone;
  }, [onAnalysisDone]);

  // Run the clock
  useEffect(() => {
    const startTime = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const capped = Math.min(elapsed, TOTAL_DURATION_SEC);
      setElapsedSec(capped);

      if (elapsed >= TOTAL_DURATION_SEC) {
        setTimerDone(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 100);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Fire onAnalysisDone when BOTH conditions are met
  useEffect(() => {
    if (timerDone && isApiComplete && !calledRef.current) {
      calledRef.current = true;
      onDoneRef.current();
    }
  }, [timerDone, isApiComplete]);

  const progressPct = Math.min((elapsedSec / TOTAL_DURATION_SEC) * 100, 100);

  function getStepStatus(step: AnalysisStep): StepStatus {
    if (elapsedSec >= step.doneSec) return "done";
    if (elapsedSec >= step.startSec) return "active";
    return "pending";
  }

  // The "active" step's pending label
  const activeStep = STEPS.find((s) => getStepStatus(s) === "active");

  // Paused at 100% waiting for API
  const isPausedForApi = timerDone && !isApiComplete;

  return (
    <div
      className="min-h-screen flex flex-col items-center px-5 pt-24 pb-8"
      style={{ background: "linear-gradient(180deg, #09090b 0%, #0f0f12 100%)" }}
    >
      {/* User photo ring */}
      <motion.div
        className="relative mb-10"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Pulsing border rings */}
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          style={{
            width: 128,
            height: 128,
            border: "2px solid rgba(99,102,241,0.5)",
          }}
        />
        <motion.div
          className="absolute rounded-full"
          animate={{ scale: [1, 1.22, 1], opacity: [0.3, 0, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
          style={{
            width: 128,
            height: 128,
            border: "2px solid rgba(99,102,241,0.3)",
          }}
        />
        {/* Photo */}
        <div
          className="relative overflow-hidden rounded-full"
          style={{ width: 120, height: 120 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoPreviewUrl}
            alt="Your photo"
            className="w-full h-full object-cover"
          />
          {/* Scan line animation */}
          <motion.div
            className="absolute inset-x-0 h-0.5"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(99,102,241,0.8), transparent)",
            }}
            animate={{ top: ["-2%", "102%"] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
          />
        </div>
      </motion.div>

      {/* Step checklist */}
      <motion.div
        className="w-full max-w-xs space-y-3 mb-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {STEPS.map((step) => {
          const status = getStepStatus(step);
          return (
            <AnimatePresence key={step.id} mode="wait">
              {status !== "pending" && (
                <motion.div
                  key={`${step.id}-${status}`}
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {status === "done" ? (
                    <CheckCircle2
                      size={18}
                      className="shrink-0 text-green-400"
                    />
                  ) : (
                    <motion.div
                      className="w-[18px] h-[18px] rounded-full border-2 border-blue-400 shrink-0"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      style={{ borderTopColor: "transparent" }}
                    />
                  )}
                  <span
                    className="text-sm font-medium"
                    style={{
                      color:
                        status === "done"
                          ? "rgba(134,239,172,0.9)"
                          : "rgba(255,255,255,0.9)",
                    }}
                  >
                    {status === "done" ? `✓ ${step.doneLabel}` : step.pendingLabel}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          );
        })}

        {/* Active step label when there's an active step */}
        {activeStep && (
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              className="w-[18px] h-[18px] rounded-full border-2 border-blue-400 shrink-0"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              style={{ borderTopColor: "transparent" }}
            />
            <motion.span
              className="text-sm font-medium text-white/80"
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              {activeStep.pendingLabel}
            </motion.span>
          </motion.div>
        )}
      </motion.div>

      {/* Progress bar */}
      <motion.div
        className="w-full max-w-xs mb-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex justify-between text-xs text-white/40 mb-1.5">
          <span>분석 진행</span>
          <span className="tabular-nums">
            {isPausedForApi ? "마무리 중..." : `${Math.round(progressPct)}%`}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: "linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7)",
              boxShadow: "0 0 8px rgba(99,102,241,0.5)",
            }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.2, ease: "linear" }}
          />
        </div>

        {/* Paused label */}
        <AnimatePresence>
          {isPausedForApi && (
            <motion.p
              className="text-xs text-indigo-400/70 mt-1 text-center"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              AI 처리 완료 대기 중...
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Divider */}
      <div className="w-full max-w-xs h-px bg-white/[0.07] my-5" />

      {/* Social proof carousel */}
      <motion.div
        className="w-full max-w-xs"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <p className="text-xs text-white/35 mb-3 text-center">
          다른 전문가들의 결과 미리보기
        </p>
        <SocialProofCarousel />
      </motion.div>
    </div>
  );
}
