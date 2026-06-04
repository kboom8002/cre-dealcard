"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { getTemplateById } from "@/lib/vibe/vibe-templates";

interface DummyCard {
  name: string;
  specialty: string;
  region: string;
  trust: number;
  templateId: string;
}

const DUMMY_CARDS: DummyCard[] = [
  { name: "김○○", specialty: "꼬마빌딩 전문", region: "성수/성동", trust: 85, templateId: "HT-01" },
  { name: "이○○", specialty: "오피스 임대", region: "여의도/마포", trust: 79, templateId: "CP-01" },
  { name: "박○○", specialty: "수익형 투자", region: "강남/서초", trust: 82, templateId: "FC-01" },
  { name: "최○○", specialty: "상가 임대", region: "CBD", trust: 77, templateId: "HT-02" },
  { name: "정○○", specialty: "지산/물류", region: "판교", trust: 88, templateId: "BF-01" },
];

interface MiniCardProps {
  card: DummyCard;
}

function MiniCard({ card }: MiniCardProps) {
  const template = getTemplateById(card.templateId);
  const css = template?.css;

  return (
    <div
      className="shrink-0 w-40 rounded-xl overflow-hidden shadow-lg"
      style={{
        background: css?.bgGradient ?? "linear-gradient(135deg, #1e293b, #0f172a)",
        border: css?.borderStyle ?? "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Content */}
      <div className="p-3">
        {/* Avatar placeholder */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
            style={{
              background: `${css?.ringColor ?? "#6366f1"}22`,
              border: `1.5px solid ${css?.ringColor ?? "#6366f1"}55`,
              color: css?.ringColor ?? "#a5b4fc",
            }}
          >
            {card.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="font-bold text-xs truncate"
              style={{ color: css?.textColor ?? "#f1f5f9" }}
            >
              {card.name}
            </p>
            <p
              className="text-[10px] truncate"
              style={{ color: css?.subtextColor ?? "#94a3b8" }}
            >
              {card.region}
            </p>
          </div>
        </div>

        <p
          className="text-[10px] truncate mb-2"
          style={{ color: css?.subtextColor ?? "#94a3b8" }}
        >
          {card.specialty}
        </p>

        {/* Trust badge */}
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded-full w-fit"
          style={{
            background: `${css?.accentColor ?? "#6366f1"}18`,
            border: `1px solid ${css?.accentColor ?? "#6366f1"}30`,
          }}
        >
          <span className="text-[9px]">⭐</span>
          <span
            className="text-[10px] font-bold tabular-nums"
            style={{ color: css?.accentColor ?? "#a5b4fc" }}
          >
            신뢰도 {card.trust}
          </span>
        </div>
      </div>
    </div>
  );
}

interface SocialProofCarouselProps {
  className?: string;
}

export function SocialProofCarousel({ className }: SocialProofCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % DUMMY_CARDS.length);
    }, 2500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Show 3 cards starting at currentIndex (wrapping)
  const visibleCards = [0, 1, 2].map(
    (offset) => DUMMY_CARDS[(currentIndex + offset) % DUMMY_CARDS.length]!,
  );

  return (
    <div className={className}>
      {/* Cards row */}
      <div className="overflow-hidden">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={currentIndex}
            className="flex gap-3 pb-2"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -40, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {visibleCards.map((card, i) => (
              <MiniCard key={`${card.name}-${i}`} card={card} />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Social proof text */}
      <div className="flex items-center justify-between mt-3 px-1">
        <p className="text-xs text-white/40">
          <span className="text-white/70 font-semibold">23명</span>의 전문가가 사용 중
        </p>

        {/* Pagination dots */}
        <div className="flex gap-1">
          {DUMMY_CARDS.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === currentIndex ? 12 : 4,
                height: 4,
                background:
                  i === currentIndex
                    ? "rgba(99,102,241,0.9)"
                    : "rgba(255,255,255,0.2)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
