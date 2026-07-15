"use client";

import { motion, AnimatePresence } from "motion/react";
import { Check } from "lucide-react";
import type { OnboardingStage, UserRole } from "@/lib/onboarding/onboarding-types";

// Subset of stages shown in the progress bar (photo_upload, login, etc. are sub-steps)
const PROGRESS_STAGES: OnboardingStage[] = [
  "role_select",
  "analyzing",
  "reveal",
  "complete",
];

// Stage ordering by role
const EXPERT_STAGES: OnboardingStage[] = [
  "role_select",
  "analyzing",
  "reveal",
  "complete",
];

const OWNER_STAGES: OnboardingStage[] = [
  "role_select",
  "analyzing",
  "reveal",
  "complete",
];

// Labels for visible stages
const STAGE_LABELS: Partial<Record<OnboardingStage, string>> = {
  role_select: "역할",
  analyzing: "분석",
  reveal: "결과",
  complete: "완료",
};


interface DotProps {
  status: "completed" | "active" | "future";
  label: string;
}

function Dot({ status, label }: DotProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <motion.div
        className="relative"
        style={{ width: 8, height: 8 }}
        animate={
          status === "active"
            ? { scale: [1, 1.3, 1], opacity: 1 }
            : { scale: 1, opacity: status === "completed" ? 1 : 0.35 }
        }
        transition={
          status === "active"
            ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
            : { duration: 0.3 }
        }
      >
        {status === "completed" ? (
          <motion.div
            className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center -translate-x-1.5 -translate-y-1.5"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            <Check size={10} className="text-white" />
          </motion.div>
        ) : status === "active" ? (
          <div className="w-3 h-3 rounded-full bg-blue-400 -translate-x-1 -translate-y-1 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
        ) : (
          <div className="w-2 h-2 rounded-full bg-white/30" />
        )}
      </motion.div>
      <span
        className="text-[9px] font-medium tracking-wide"
        style={{
          color:
            status === "completed"
              ? "rgba(96,165,250,0.9)"
              : status === "active"
                ? "rgba(255,255,255,0.9)"
                : "rgba(255,255,255,0.3)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

interface OnboardingProgressProps {
  currentStage: OnboardingStage;
  role: UserRole | null;
}

export function OnboardingProgress({
  currentStage,
  role,
}: OnboardingProgressProps) {
  const stages = role === "owner" ? OWNER_STAGES : EXPERT_STAGES;
  // Map any sub-stage (login, dealcard, agora, profile_complete) to its visual parent
  const visualStage: OnboardingStage =
    currentStage === 'login' || currentStage === 'profile_complete' ? 'reveal' :
    currentStage === 'dealcard' || currentStage === 'agora' || currentStage === 'radar' ? 'complete' :
    (PROGRESS_STAGES.includes(currentStage) ? currentStage : 'role_select');
  const currentIndex = stages.indexOf(visualStage);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed top-0 left-0 right-0 z-50"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {/* Dark translucent bar */}
        <div
          className="w-full px-6 py-3"
          style={{
            background:
              "linear-gradient(180deg, rgba(9,9,11,0.95) 0%, rgba(9,9,11,0.80) 100%)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="max-w-sm mx-auto flex items-center justify-between">
            {stages.map((stage, index) => {
              const status =
                index < currentIndex
                  ? "completed"
                  : index === currentIndex
                    ? "active"
                    : "future";
              return (
                <div key={stage} className="flex items-center">
                  <Dot status={status} label={STAGE_LABELS[stage] ?? ''} />
                  {/* Connector line */}
                  {index < stages.length - 1 && (
                    <div className="w-8 h-px mx-1 mt-[-8px] relative overflow-hidden">
                      <div className="absolute inset-0 bg-white/10 rounded-full" />
                      {index < currentIndex && (
                        <motion.div
                          className="absolute inset-y-0 left-0 bg-blue-500/60 rounded-full"
                          initial={{ width: "0%" }}
                          animate={{ width: "100%" }}
                          transition={{ duration: 0.4, delay: 0.1 }}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
