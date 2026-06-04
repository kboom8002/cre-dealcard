"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { hapticMedium } from "./HapticFeedback";

export type UserRole = "expert" | "owner";

interface RoleCardData {
  role: UserRole;
  emoji: string;
  titleLine1: string;
  titleLine2: string;
  subtitle: string;
  tags: string[];
}

const ROLE_CARDS: RoleCardData[] = [
  {
    role: "expert",
    emoji: "🏢",
    titleLine1: "부동산 전문가",
    titleLine2: "중개사 · 변호사 · 세무사",
    subtitle: "AI가 당신의 전문성을 시각화합니다",
    tags: ["공인중개사", "법무사", "세무사", "감정평가사"],
  },
  {
    role: "owner",
    emoji: "🏠",
    titleLine1: "건물주 / 투자자",
    titleLine2: "소유주 · 매수 관심자",
    subtitle: "신뢰감 있는 투자자 프로필을 만드세요",
    tags: ["건물주", "임대인", "투자자", "개발사"],
  },
];

interface StageRoleSelectProps {
  onSelect: (role: UserRole) => void;
}

export function StageRoleSelect({ onSelect }: StageRoleSelectProps) {
  const [selected, setSelected] = useState<UserRole | null>(null);

  function handleSelect(role: UserRole) {
    if (selected) return; // already transitioning
    hapticMedium();
    setSelected(role);
    // Short delay for the selection animation before transitioning
    setTimeout(() => onSelect(role), 320);
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 pt-16"
      style={{ background: "linear-gradient(180deg, #09090b 0%, #0f0f12 100%)" }}
    >
      {/* Headline */}
      <motion.div
        className="text-center mb-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="text-xs font-semibold tracking-widest text-blue-400/80 uppercase mb-3">
          Vibe AI · 명함 분석
        </p>
        <h1
          className="text-3xl font-bold leading-tight mb-3"
          style={{
            background: "linear-gradient(135deg, #ffffff 0%, #a5b4fc 60%, #f9a8d4 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          사진 한 장이면
          <br />
          충분합니다
        </h1>
        <p className="text-sm text-white/50 leading-relaxed">
          AI가 당신의 인상을 분석해 최적의
          <br />
          디지털 명함을 자동으로 생성합니다
        </p>
      </motion.div>

      {/* Role cards */}
      <div className="w-full max-w-sm space-y-4">
        {ROLE_CARDS.map((card, i) => {
          const isSelected = selected === card.role;
          const isOther = selected !== null && selected !== card.role;

          return (
            <motion.button
              key={card.role}
              className="w-full text-left rounded-2xl p-5 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              style={{
                background: isSelected
                  ? "linear-gradient(135deg, rgba(37,99,235,0.25) 0%, rgba(99,102,241,0.25) 100%)"
                  : "rgba(255,255,255,0.04)",
                border: isSelected
                  ? "1.5px solid rgba(99,102,241,0.7)"
                  : "1.5px solid rgba(255,255,255,0.08)",
                boxShadow: isSelected
                  ? "0 0 24px rgba(99,102,241,0.25), inset 0 0 0 1px rgba(99,102,241,0.1)"
                  : "none",
                backdropFilter: "blur(12px)",
              }}
              initial={{ opacity: 0, y: 24 }}
              animate={{
                opacity: isOther ? 0.35 : 1,
                y: 0,
                scale: isSelected ? 1.02 : 1,
              }}
              transition={{
                opacity: { duration: 0.3 },
                y: { duration: 0.5, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] },
                scale: { type: "spring", stiffness: 400, damping: 25 },
              }}
              onClick={() => handleSelect(card.role)}
              disabled={selected !== null}
            >
              <div className="flex items-start gap-4">
                <div
                  className="text-3xl shrink-0 mt-0.5"
                  role="img"
                  aria-label={card.titleLine1}
                >
                  {card.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-base leading-snug">
                    {card.titleLine1}
                  </p>
                  <p className="text-xs text-white/50 mt-0.5 mb-2">
                    {card.titleLine2}
                  </p>
                  <p className="text-xs text-white/70 mb-3">{card.subtitle}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {card.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(255,255,255,0.07)",
                          color: "rgba(255,255,255,0.55)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                {/* Checkmark indicator */}
                <motion.div
                  className="shrink-0 w-5 h-5 rounded-full border flex items-center justify-center mt-0.5"
                  animate={{
                    borderColor: isSelected
                      ? "rgba(99,102,241,1)"
                      : "rgba(255,255,255,0.2)",
                    backgroundColor: isSelected
                      ? "rgba(99,102,241,1)"
                      : "transparent",
                    scale: isSelected ? 1.1 : 1,
                  }}
                  transition={{ duration: 0.2 }}
                >
                  {isSelected && (
                    <motion.svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      <motion.path
                        d="M1.5 5L4 7.5L8.5 2.5"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                      />
                    </motion.svg>
                  )}
                </motion.div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Footer note */}
      <motion.p
        className="mt-8 text-center text-xs text-white/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        분석에는 약 20초가 소요됩니다 · 얼굴 사진 필요
      </motion.p>
    </div>
  );
}
